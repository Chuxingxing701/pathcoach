"""Extract a low-res JPEG thumbnail of each downloaded SVS for QC
(large blank areas, folds, pen marks, staining problems).
"""

import sys
from pathlib import Path

import openslide
import pyvips

WORK = Path(__file__).resolve().parent / "work"
SVS = WORK / "svs"
OUT = WORK / "qc"
WIDTH = 1600


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for svs in sorted(SVS.glob("*.svs")):
        out = OUT / f"{svs.stem}.jpg"
        if out.exists():
            continue
        slide = openslide.OpenSlide(str(svs))
        level = slide.level_count - 1
        image = pyvips.Image.openslideload(str(svs), level=level)
        if image.width > WIDTH:
            image = image.resize(WIDTH / image.width)
        image.jpegsave(str(out), Q=80)
        print(f"{svs.stem}: {image.width}x{image.height}", flush=True)


if __name__ == "__main__":
    sys.exit(main() or 0)
