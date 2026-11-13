"""Download the selected SVS files from GDC into pipeline/work/svs/<id>.svs.

Streams each file via /data/<file_id>, verifies md5, retries up to 3 times,
and resumes an interrupted .part file with a Range request when possible.
"""

import hashlib
import json
import sys
import time
from pathlib import Path

import requests

API = "https://api.gdc.cancer.gov/data"
WORK = Path(__file__).resolve().parent / "work"
DEST = WORK / "svs"


def md5_of(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 22), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(file_id, expected_md5, out: Path):
    part = out.with_suffix(".part")
    for attempt in range(1, 4):
        headers = {}
        pos = part.stat().st_size if part.exists() else 0
        if pos:
            headers["Range"] = f"bytes={pos}-"
        try:
            with requests.get(
                f"{API}/{file_id}", stream=True, timeout=(30, 300), headers=headers
            ) as r:
                if r.status_code == 416:  # range not satisfiable -> already complete
                    pass
                elif pos and r.status_code == 200:  # server ignored Range
                    pos = 0
                r.raise_for_status() if r.status_code not in (200, 206, 416) else None
                if r.status_code in (200, 206):
                    with open(part, "ab" if pos else "wb") as f:
                        for chunk in r.iter_content(1 << 22):
                            f.write(chunk)
            if md5_of(part) == expected_md5:
                part.rename(out)
                return True
            print(f"  md5 mismatch (attempt {attempt}); keeping partial", flush=True)
        except Exception as e:  # noqa: BLE001 - retry regardless of failure mode
            print(f"  attempt {attempt} failed: {e}", flush=True)
        time.sleep(5 * attempt)
    return False


def main():
    sel = json.loads((WORK / "selection.json").read_text(encoding="utf-8"))
    DEST.mkdir(parents=True, exist_ok=True)
    todo, failed = [], []
    for c in sel["selected"]:
        out = DEST / f"{c['id']}.svs"
        if out.exists() and out.stat().st_size == c["size"] and md5_of(out) == c["md5"]:
            continue
        todo.append((c, out))
    print(f"{len(todo)} to download", flush=True)
    t0 = time.time()
    for i, (c, out) in enumerate(todo, 1):
        print(f"[{i}/{len(todo)}] {c['id']} ({c['size'] / 2**20:.0f} MB)", flush=True)
        if not fetch(c["fileId"], c["md5"], out):
            failed.append(c["id"])
    print(
        f"done in {(time.time() - t0) / 60:.1f} min; failed: {failed or 'none'}",
        flush=True,
    )
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
