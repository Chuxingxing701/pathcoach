"""SVS -> Deep Zoom pyramid using tiffslide + PIL (no openslide/pyvips needed).

Drop-in replacement for tile_slide.py on Windows where the openslide native
library is unavailable. Same output contract: <name>.dzi + <name>_files/<L>/<x>_<y>.jpg,
1024px tiles, JPEG Q80, blank tiles skipped, capped at ~0.5 um/px (20x eq).
"""

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
import tiffslide
from PIL import Image

TARGET_MPP = 0.5
TILE = 1024
JPEG_Q = 80
SKIP_BLANKS = 10
MAX_UPSAMPLE = 1.6  # allow reading a slightly-too-low-res source level, else step down

DZI_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<Image xmlns="http://schemas.microsoft.com/deepzoom/2008"
  Format="jpg"
  Overlap="0"
  TileSize="1024"
  >
  <Size
    Height="{h}"
    Width="{w}"
    />
</Image>
"""


def slide_mpp(slide) -> float:
    for key in ("tiffslide.mpp-x", "openslide.mpp-x", "aperio.MPP"):
        v = slide.properties.get(key)
        if v:
            return float(v)
    sys.exit("slide has no mpp property; pick another slide")


def is_blank(arr: np.ndarray) -> bool:
    """All pixels within SKIP_BLANKS of white -> background tile."""
    return bool(np.abs(arr.astype(np.int16) - 255).max() <= SKIP_BLANKS)


def tile(svs: Path, out_dir: Path, name: str) -> dict:
    slide = tiffslide.TiffSlide(str(svs))
    mpp0 = slide_mpp(slide)
    scan_mag = float(slide.properties.get("aperio.AppMag") or round(10 / mpp0))

    # Target (max-level) pixel grid: downsample L0 to TARGET_MPP.
    r = TARGET_MPP / mpp0  # source px per target px (>=1 when source is finer)
    scale = min(1.0, 1.0 / r)
    tw = round(slide.dimensions[0] * scale)
    th = round(slide.dimensions[1] * scale)
    max_level = math.ceil(math.log2(max(tw, th)))

    files_dir = out_dir / f"{name}_files"
    files_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{name}.dzi").write_text(DZI_TEMPLATE.format(w=tw, h=th), encoding="utf-8")

    files = size_bytes = 0
    level_downs = [slide.level_downsamples[i] for i in range(slide.level_count)]

    for lvl in range(max_level, -1, -1):
        d = 2 ** (max_level - lvl)  # downsample vs target grid
        lw, lh = max(1, math.ceil(tw / d)), max(1, math.ceil(th / d))
        nx, ny = math.ceil(lw / TILE), math.ceil(lh / TILE)
        for ty in range(ny):
            for tx in range(nx):
                # region of this tile on the target grid
                tw_w = min(TILE, lw - tx * TILE)
                th_h = min(TILE, lh - ty * TILE)
                # same region in L0 source px
                src_x, src_y = tx * TILE * d * r, ty * TILE * d * r
                need = d * r  # required downsample from L0
                # pick source level: largest downsample <= need*MAX_UPSAMPLE
                src_lvl = max(
                    range(slide.level_count),
                    key=lambda i: level_downs[i] if level_downs[i] <= need * MAX_UPSAMPLE else -1,
                )
                sd = level_downs[src_lvl]
                rx, ry = round(src_x / sd), round(src_y / sd)
                rw = max(1, round(tw_w * need / sd))
                rh = max(1, round(th_h * need / sd))
                if rx >= slide.level_dimensions[src_lvl][0] or ry >= slide.level_dimensions[src_lvl][1]:
                    continue
                img = slide.read_region(
                    (round(src_x), round(src_y)), src_lvl, (rw, rh)
                ).convert("RGB")
                if img.size != (tw_w, th_h):
                    img = img.resize((tw_w, th_h), Image.LANCZOS)
                arr = np.asarray(img)
                if is_blank(arr):
                    continue
                p = files_dir / str(lvl) / f"{tx}_{ty}.jpg"
                p.parent.mkdir(parents=True, exist_ok=True)
                img.save(p, quality=JPEG_Q)
                files += 1
                size_bytes += p.stat().st_size
        print(f"  level {lvl}: {nx}x{ny} done", flush=True)

    return {
        "name": name,
        "width": tw,
        "height": th,
        "mpp": round(mpp0 * max(r, 1.0), 4),
        "scanMag": scan_mag,
        "tiles": files,
        "bytes": size_bytes,
        "maxLevel": max_level,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("svs", type=Path)
    ap.add_argument("out_dir", type=Path)
    ap.add_argument("--name", required=True)
    args = ap.parse_args()
    print(json.dumps(tile(args.svs, args.out_dir, args.name)))


if __name__ == "__main__":
    main()
