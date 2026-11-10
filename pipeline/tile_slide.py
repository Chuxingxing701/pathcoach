"""Convert a whole-slide image (SVS) into a Deep Zoom (DZI) pyramid for static hosting.

Tiles are capped at ~0.5 µm/px (20x equivalent) and blank background tiles are skipped,
to stay within the Cloudflare Workers static-assets file limit (see docs/decisions.md ADR-003).
"""

import argparse
import json
import math
import sys
from pathlib import Path

import openslide
import pyvips

TARGET_MPP = 0.5
TILE_SIZE = 1024
JPEG_Q = 80
SKIP_BLANKS = 10


def slide_mpp(slide: openslide.OpenSlide) -> float:
    mpp = slide.properties.get(openslide.PROPERTY_NAME_MPP_X)
    if not mpp:
        sys.exit("slide has no openslide.mpp-x; pick another slide")
    return float(mpp)


def tile(svs: Path, out_dir: Path, name: str) -> dict:
    slide = openslide.OpenSlide(str(svs))
    mpp0 = slide_mpp(slide)
    scan_mag = float(slide.properties.get("aperio.AppMag") or round(10 / mpp0))

    image = pyvips.Image.openslideload(str(svs), level=0)
    if image.bands == 4:
        image = image.flatten(background=[255, 255, 255])
    scale = min(1.0, mpp0 / TARGET_MPP)
    if scale < 0.999:
        image = image.resize(scale, kernel="lanczos3")
    mpp = mpp0 / scale

    out_dir.mkdir(parents=True, exist_ok=True)
    image.dzsave(
        str(out_dir / name),
        tile_size=TILE_SIZE,
        overlap=0,
        suffix=f".jpg[Q={JPEG_Q}]",
        skip_blanks=SKIP_BLANKS,
        background=[255, 255, 255],
    )
    files = sum(1 for _ in (out_dir / f"{name}_files").rglob("*.jpg"))
    size = sum(p.stat().st_size for p in (out_dir / f"{name}_files").rglob("*.jpg"))
    return {
        "name": name,
        "width": image.width,
        "height": image.height,
        "mpp": round(mpp, 4),
        "scanMag": scan_mag,
        "tiles": files,
        "bytes": size,
        "maxLevel": math.ceil(math.log2(max(image.width, image.height))),
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
