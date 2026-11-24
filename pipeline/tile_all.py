"""Tile every downloaded slide and distribute the output across tiles-1, tiles-2
(<=19,000 files per Worker, safety margin under the 20,000 limit).

Writes pipeline/work/tile-info.json: id -> {worker, mpp, width, height, scanMag,
tiles, bytes}. Skips slides whose DZI already exists (idempotent).
"""

import json
import sys
from pathlib import Path

from tile_slide import tile

WORK = Path(__file__).resolve().parent / "work"
SVS = WORK / "svs"
FILE_CAP = 19000


def count_files(d: Path) -> int:
    return sum(1 for _ in d.rglob("*") if _.is_file())


def main():
    sel = json.loads((WORK / "selection.json").read_text(encoding="utf-8"))["selected"]
    info_path = WORK / "tile-info.json"
    info = {t["id"]: t for t in json.loads(info_path.read_text(encoding="utf-8"))} if info_path.exists() else {}

    worker, files_in_worker = 1, 0
    for n in (1, 2):
        d = WORK / f"tiles-{n}" / "v1"
        if d.exists():
            files_in_worker = count_files(d)
            if files_in_worker < FILE_CAP:
                worker = n
                break
            worker = n + 1

    pending = [c for c in sel if c["id"] not in info]
    print(f"{len(pending)} slides to tile; starting at worker {worker} ({files_in_worker} files)", flush=True)

    for i, c in enumerate(pending, 1):
        cid = c["id"]
        svs = SVS / f"{cid}.svs"
        if not svs.exists():
            print(f"[{i}/{len(pending)}] {cid}: SVS missing, skipped", flush=True)
            continue
        out = WORK / f"tiles-{worker}" / "v1"
        print(f"[{i}/{len(pending)}] {cid} -> tiles-{worker}", flush=True)
        t = tile(svs, out, cid)
        t.update({"id": cid, "worker": worker})
        info[cid] = t
        info_path.write_text(json.dumps(list(info.values()), indent=2), encoding="utf-8")
        files_in_worker += t["tiles"]
        if files_in_worker > FILE_CAP:
            worker += 1
            files_in_worker = 0
        print(f"  {t['tiles']} tiles, {t['bytes'] / 2**20:.0f} MB, mpp={t['mpp']}", flush=True)

    print(f"done; {len(info)} slides tiled", flush=True)


if __name__ == "__main__":
    sys.exit(main() or 0)
