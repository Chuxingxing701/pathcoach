"""Select the 28 PathCoach slides from TCGA via the GDC API.

Rules (docs/plan.md M1, ADR-006):
  - lung slides are ALL frozen ("Tissue Slide"); the 4 other-site slides are FFPE
    ("Diagnostic Slide")
  - open access, SVS <= 150 MB, one slide per case, clinical fields present
    (age, gender, smoking evidence)
  - practice 4+4+4 lung / 2+2 other-site; pretest 2+2+2; posttest 2+2+2
  - pre/post pairs matched on file size within each class
  - case IDs are opaque (lung-NN / other-NN), assigned in random order so the
    number carries no class or split information

Writes (gitignored pipeline/work/):
  selection.json          full private metadata incl. diagnosis + GDC ids
  case-list-for-review.md no-diagnosis list for the owner to eyeball
"""

import json
import random
import re
import sys
from pathlib import Path

import requests

API = "https://api.gdc.cancer.gov/files"
MAX_BYTES = 150 * 1024 * 1024
WORK = Path(__file__).resolve().parent / "work"
SEED = 20261113

FIELDS = ",".join(
    [
        "file_id",
        "file_name",
        "file_size",
        "md5sum",
        "experimental_strategy",
        "cases.submitter_id",
        "cases.project.project_id",
        "cases.samples.submitter_id",
        "cases.samples.sample_type",
        "cases.diagnoses.primary_diagnosis",
        "cases.diagnoses.age_at_diagnosis",
        "cases.demographic.sex_at_birth",
        "cases.demographic.age_at_index",
        "cases.demographic.days_to_birth",
        "cases.exposures.pack_years_smoked",
        "cases.exposures.tobacco_smoking_status",
        "cases.exposures.cigarettes_per_day",
        "cases.exposures.years_smoked",
    ]
)

BASE = [
    ("files.data_format", "=", "SVS"),
    ("files.access", "=", "open"),
    ("files.file_size", "<=", MAX_BYTES),
]

SMOKING_HISTORY = [
    (r"lifelong", "lifelong non-smoker"),
    (r"current smoker", "current smoker"),
    (r"reformed.*15", "reformed smoker (<=15 y)"),
    (r"reformed", "reformed smoker"),
    (r"current reformed", "reformed smoker"),
]

# bucket -> (projects, experimental_strategy, sample_type, required_dx_regex, truth, site)
BUCKETS = {
    "lung-normal": {
        "projects": ["TCGA-LUAD", "TCGA-LUSC"],
        "strategy": "Tissue Slide",
        "stype": "Solid Tissue Normal",
        "need": 8,
        "backup": 4,
        "truth": "normal",
        "site": "lung",
        "specimen": "frozen",
    },
    "lung-adeno": {
        "projects": ["TCGA-LUAD"],
        "strategy": "Tissue Slide",
        "stype": "Primary Tumor",
        "need": 8,
        "backup": 4,
        "dx": r"adeno",
        "truth": "adeno",
        "site": "lung",
        "specimen": "frozen",
    },
    "lung-squam": {
        "projects": ["TCGA-LUSC"],
        "strategy": "Tissue Slide",
        "stype": "Primary Tumor",
        "need": 8,
        "backup": 4,
        "dx": r"squam",
        "truth": "squamous",
        "site": "lung",
        "specimen": "frozen",
    },
    # COAD/STAD dropped 2026-11-13 (Chu): their TCGA cases have no smoking data.
    "other-adeno": {
        "projects": ["TCGA-ESCA", "TCGA-PAAD"],
        "strategy": "Diagnostic Slide",
        "stype": "Primary Tumor",
        "need": 2,
        "backup": 2,
        "dx": r"adenocarcinoma|infiltrating duct",
        "truth": "adeno",
        "specimen": "FFPE",
        "one_per_organ": True,
    },
    "other-squam": {
        "projects": ["TCGA-CESC", "TCGA-HNSC"],
        "strategy": "Diagnostic Slide",
        "stype": "Primary Tumor",
        "need": 2,
        "backup": 2,
        "dx": r"squam",
        "truth": "squamous",
        "specimen": "FFPE",
        "one_per_organ": True,
    },
}

SITES = {
    "TCGA-LUAD": ("lung", "Lung", "肺"),
    "TCGA-LUSC": ("lung", "Lung", "肺"),
    "TCGA-COAD": ("colon", "Colon", "结肠"),
    "TCGA-READ": ("rectum", "Rectum", "直肠"),
    "TCGA-STAD": ("stomach", "Stomach", "胃"),
    "TCGA-CESC": ("cervix", "Cervix", "宫颈"),
    "TCGA-HNSC": ("head-neck", "Head & neck", "头颈部"),
    "TCGA-ESCA": ("esophagus", "Esophagus", "食管"),
    "TCGA-PAAD": ("pancreas", "Pancreas", "胰腺"),
}


def gdc_filter(field, op, value):
    return {"op": op, "content": {"field": field, "value": value}}


def query(bucket):
    content = [gdc_filter(f, o, v) for f, o, v in BASE]
    content.append(gdc_filter("cases.project.project_id", "in", bucket["projects"]))
    content.append(
        gdc_filter("files.experimental_strategy", "=", bucket["strategy"])
    )
    content.append(
        gdc_filter("cases.samples.sample_type", "=", bucket["stype"])
    )
    body = {
        "filters": {"op": "and", "content": content},
        "fields": FIELDS,
        "format": "json",
        "size": 1000,
        "sort": "file_size:desc",
    }
    r = requests.post(API, json=body, timeout=120)
    r.raise_for_status()
    return r.json()["data"]["hits"]


BARCODE_STYPE = {"11": "Solid Tissue Normal", "01": "Primary Tumor", "02": "Recurrent Tumor"}


def barcode_stype(file_name):
    """Sample type from the TCGA barcode, e.g. ...-11A-... -> 'Solid Tissue Normal'."""
    m = re.match(r"TCGA-[A-Z0-9]{2}-[A-Z0-9]{4}-(\d{2})", file_name)
    return BARCODE_STYPE.get(m.group(1)) if m else None


def case_of(hit):
    cases = hit.get("cases") or []
    return cases[0] if cases else {}


def clinical(hit):
    c = case_of(hit)
    demo = c.get("demographic") or {}
    diags = c.get("diagnoses") or []
    expo = next((e for e in c.get("exposures") or [{}] if e), {})
    sex = (demo.get("sex_at_birth") or "").lower() or None
    age_days = next(
        (d["age_at_diagnosis"] for d in diags if d.get("age_at_diagnosis") is not None),
        None,
    )
    age = (
        round(age_days / 365.25)
        if isinstance(age_days, (int, float))
        else demo.get("age_at_index")
    )
    py = expo.get("pack_years_smoked")
    hist = expo.get("tobacco_smoking_status") or ""
    smoking = f"{py:g} pack-years" if py is not None else next(
        (s for pat, s in SMOKING_HISTORY if re.search(pat, hist, re.I)), None
    )
    return {
        "age": age,
        "sex": sex if sex in ("male", "female") else None,
        "smoking": smoking,
        "packYears": py,
    }


def primary_diagnosis(hit):
    diags = case_of(hit).get("diagnoses") or []
    return next(
        (
            d["primary_diagnosis"]
            for d in diags
            if d.get("primary_diagnosis") and d["primary_diagnosis"] != "Not Reported"
        ),
        "",
    )


def candidates(name, cfg):
    hits = query(cfg)
    seen, pool = set(), []
    for h in sorted(hits, key=lambda x: -x["file_size"]):
        c = case_of(h)
        pid = c.get("submitter_id")
        if not pid or pid in seen:
            continue
        st = barcode_stype(h["file_name"])
        if st and st != cfg["stype"]:
            continue
        clin = clinical(h)
        if not (clin["age"] and clin["sex"] and clin["smoking"]):
            continue
        dx = primary_diagnosis(h)
        if cfg.get("dx") and not re.search(cfg["dx"], dx, re.I):
            continue
        proj = c.get("project", {}).get("project_id", "")
        site, en, zh = SITES[proj]
        seen.add(pid)
        pool.append(
            {
                "fileId": h["file_id"],
                "fileName": h["file_name"],
                "size": h["file_size"],
                "md5": h["md5sum"],
                "strategy": h["experimental_strategy"],
                "project": proj,
                "patient": pid,
                "sampleType": (c.get("samples") or [{}])[0].get("sample_type"),
                "primaryDiagnosis": dx,
                "clinical": clin,
                "truth": cfg["truth"],
                "site": site,
                "siteLabel": {"en": en, "zh": zh},
                "specimen": cfg["specimen"],
                "bucket": name,
            }
        )
    return pool


def pick(bucket_name, pool, need, backup, one_per_organ=False, rng=None):
    """Primary picks honour one_per_organ; the rest become the backup pool."""
    organs, chosen, rest = set(), [], []
    for cand in pool:
        if len(chosen) < need and (not one_per_organ or cand["project"] not in organs):
            organs.add(cand["project"])
            chosen.append(cand)
        else:
            rest.append(cand)
    if len(chosen) < need:
        sys.exit(f"{bucket_name}: only {len(chosen)} usable candidates (need {need})")
    return chosen[:need], rest[:backup]


def assign_split(group, rng):
    """Split one class pool (8) into practice 4 / pretest 2 / posttest 2,
    pairing pre and post on file size."""
    pool = sorted(group, key=lambda c: c["size"])
    pairs = [(pool[i], pool[i + 1], abs(pool[i]["size"] - pool[i + 1]["size"]))
             for i in range(0, len(pool) - 1, 2)]
    pairs.sort(key=lambda p: p[2])
    test_pairs, practice = pairs[:2], [c for p in pairs[2:] for c in p[:2]]
    out = []
    for a, b, _ in test_pairs:
        pre, post = (a, b) if rng.random() < 0.5 else (b, a)
        pre["split"], post["split"] = "pretest", "posttest"
        out += [pre, post]
    for c in practice:
        c["split"] = "practice"
        out.append(c)
    return out


def main():
    rng = random.Random(SEED)
    WORK.mkdir(parents=True, exist_ok=True)
    selected, backups = [], {}
    for name, cfg in BUCKETS.items():
        pool = candidates(name, cfg)
        print(f"{name}: {len(pool)} usable candidates")
        primary, b = pick(name, pool, cfg["need"], cfg["backup"], cfg.get("one_per_organ"), rng)
        backups[name] = b
        selected += assign_split(primary, rng) if cfg["need"] == 8 else [
            {**c, "split": "practice"} for c in primary
        ]

    lung_ids = [f"lung-{i:02d}" for i in range(1, 25)]
    other_ids = [f"other-{i:02d}" for i in range(1, 5)]
    rng.shuffle(lung_ids)
    rng.shuffle(other_ids)
    for c in selected:
        c["id"] = lung_ids.pop() if c["site"] == "lung" else other_ids.pop()

    selected.sort(key=lambda c: c["id"])
    (WORK / "selection.json").write_text(
        json.dumps({"selected": selected, "backups": backups}, indent=2),
        encoding="utf-8",
    )
    lines = [
        "# M1 切片清单（无诊断 — 供 Chu 过目）",
        "",
        "| id | 部位 | 分组 | 制片 | 大小 (MB) | 年龄 | 性别 | 吸烟 |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for c in selected:
        lines.append(
            f"| {c['id']} | {c['siteLabel']['zh']} | {c['split']} | {c['specimen']} "
            f"| {c['size'] / 2**20:.0f} | {c['clinical']['age']} | {c['clinical']['sex']} "
            f"| {c['clinical']['smoking']} |"
        )
    (WORK / "case-list-for-review.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nselected {len(selected)}; wrote {WORK/'selection.json'} and case-list-for-review.md")


if __name__ == "__main__":
    main()
