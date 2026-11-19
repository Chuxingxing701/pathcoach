# WSInfer smoke test — `lung-tumor-resnet34.tcga-luad`

> **Spoiler warning**: this report names the true diagnosis class of specific
> case IDs. Do not read before completing the pretest.

Date: 2026-11-13 · wsinfer 0.6.1 · torch 2.15.0+cpu · model
`kaczmarj/lung-tumor-resnet34.tcga-luad` (TorchScript, from Hugging Face)

## What the model does

6-class patch classifier trained on TCGA-**LUAD**: `Lepidic, Benign, Acinar,
Micropapillary, Mucinous, Solid` (LUAD growth-pattern subtypes + benign).

## Setup notes

- Dependency pins needed on wsinfer 0.6.1: `zarr<3`, `tiffslide<3`
  (zarr 3 removed `zarr.storage.KVStore`; tiffslide 4 requires zarr 3 — they are
  mutually exclusive under tiffslide 4). Pinned in `pipeline/requirements.txt`.
- Patch size 350 px @ 0.5 µm/px, no overlap, tissue segmented by wsinfer's
  default thumbnail pipeline (2048 px, binary threshold 7).
- CPU inference: ~1.3–1.9 batch/s, batch 32 → ~40–75 s/slide at 500–1800 patches.

## Results

| Slide   | True class            | Patches | Top predictions                                                          |
| ------- | --------------------- | ------- | ------------------------------------------------------------------------ |
| lung-06 | squamous (LUSC)       | 1639    | Benign 1491 (91%), Acinar 92, Lepidic 20, Micro 18, Mucinous 10, Solid 8 |
| lung-14 | squamous (LUSC)       | 545     | Benign 516 (95%), Acinar 14, Lepidic 9, Micro 4, Solid 2                 |
| lung-09 | adenocarcinoma (LUAD) | 1766    | Benign 1177 (67%), Lepidic 564 (32%), Micro 23, Acinar 2                 |

Visual check (`*-pred-overlay.jpg`, patch centroids on tissue mask):

- LUSC slides: essentially all tissue predicted **Benign** — the model does not
  recognise squamous carcinoma as tumour (out-of-domain).
- LUAD slide: non-Benign predictions (mostly Lepidic) form spatially coherent
  clusters covering roughly a third of tissue patches — the model produces a
  usable-looking tumour heatmap on its target type, though the majority of
  patch area is still called Benign (plausible: stroma + non-neoplastic lung).

## Implications for R3 (AI region outlines)

1. **`lung-tumor-resnet34.tcga-luad` must not be used on squamous cases** — it
   labels squamous tumour as benign and would produce misleading outlines.
2. On LUAD it marks ~33% of tissue as tumour-subtype patches; outlines based
   on a non-Benign threshold are conceivable but need a per-slide sanity check
   against the thumbnail (this smoke test only checked one slide).
3. No comparable open model for LUSC exists in the wsinfer zoo; options for R3:
   (a) apply outlines to LUAD cases only, clearly marked AI-generated; (b)
   hand-drawn regions for everything else; (c) skip AI outlines entirely —
   they are explicitly optional and never affect scoring.

## Licensing

- wsinfer code: Apache-2.0 (SBU-BMI/wsinfer).
- Model weights `kaczmarj/lung-tumor-resnet34.tcga-luad`: HF repo card states
  **CC-BY**; attribution required if heatmaps/regions derived from it ship.
- WSInfer docs carry a research-use caveat ("models may not generalise") —
  consistent with our findings and with showing outputs only as clearly
  labelled AI suggestions, never as ground truth.

Artifacts (gitignored): `pipeline/work/wsinfer-out{,-luad}/` — CSV/GeoJSON per
patch, tissue masks, `*-pred-overlay.jpg` overlays, run metadata JSON.
