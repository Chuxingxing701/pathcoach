"""Generate public/data/{cases,answers}/<id>.json and manifest.json entries
from pipeline/work/selection.json + tile-info.json.

cases/  files must stay label-free (ADR-004) — nothing here mentions project,
sample type or barcodes; answers/ carries truth + provenance.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "pipeline" / "work"
DATA = ROOT / "public" / "data"
TILES_HOST = "https://pathcoach-tiles-{n}.chuxingxing.workers.dev"


def main():
    sel = {c["id"]: c for c in json.loads((WORK / "selection.json").read_text(encoding="utf-8"))["selected"]}
    info = {t["id"]: t for t in json.loads((WORK / "tile-info.json").read_text(encoding="utf-8"))}
    manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))

    for cid, c in sel.items():
        t = info[cid]
        case = {
            "id": cid,
            "split": c["split"],
            "site": c["site"],
            "siteLabel": c["siteLabel"],
            "clinical": c["clinical"],
            "stain": "HE",
            "specimen": c["specimen"],
            "templateId": "lung-v1",
            "tiles": {
                "dzi": f"{TILES_HOST.format(n=t['worker'])}/v1/{cid}.dzi",
                "mpp": t["mpp"],
                "width": t["width"],
                "height": t["height"],
                "scanMag": t["scanMag"],
            },
            "regions": None,
        }
        answer = {
            "id": cid,
            "truth": c["truth"],
            "primaryDiagnosis": c["primaryDiagnosis"],
            "source": {
                "project": c["project"],
                "gdcFileId": c["fileId"],
                "fileName": c["fileName"],
                "submitterId": c["patient"],
                "sampleType": c["sampleType"],
            },
        }
        (DATA / "cases" / f"{cid}.json").write_text(
            json.dumps(case, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        (DATA / "answers" / f"{cid}.json").write_text(
            json.dumps(answer, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        if cid not in manifest["cases"]:
            manifest["cases"].append(cid)

    manifest["cases"].sort()
    (DATA / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"wrote {len(sel)} cases + answers; manifest has {len(manifest['cases'])} cases")


if __name__ == "__main__":
    main()
