# Architecture Decision Records

Each entry: context → decision → consequences. Review packages (`docs/reviews/R{n}.md`) cite these by number.

## ADR-001 · Static SPA, no backend

- **Context**: MVP v2.0 rules out accounts, databases and runtime LLM calls; one primary user.
- **Decision**: Vite + React + TypeScript single-page app; all user data in the browser (localStorage / IndexedDB) with JSON export/import.
- **Consequences**: zero running cost and nothing to secure server-side; data is per-browser, so export/import is the backup path. React chosen over vanilla TS because the checklist, library and stats views are stateful UI.

## ADR-002 · Hosting on Cloudflare Workers static assets (`*.workers.dev`)

- **Context**: free tier, already decided in v2.0; no custom domain yet.
- **Decision**: app = Worker `pathcoach` (assets only, SPA fallback) at https://pathcoach.chuxingxing.workers.dev. Deploy with `npm run deploy` (wrangler, API token).
- **Consequences**: `workers.dev` reachability from mainland China is not guaranteed; revisit custom domain before R5.

## ADR-003 · Slide tiles in static-assets Workers instead of R2

- **Context**: R2 requires adding a payment method; the owner declined. Workers static assets allow 20,000 files per Worker version and 25 MiB per file on the free plan, and "requests to static assets are free and unlimited" ([billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [limits](https://developers.cloudflare.com/workers/platform/limits/#static-assets)).
- **Decision**: one or more assets-only Workers `pathcoach-tiles-N` (`pipeline/deploy_tiles.sh N`). To keep the file count low: DZI with 1024 px JPEG (Q80) tiles, no overlap, blank tiles skipped (`skip_blanks`), pyramid capped at ~0.5 µm/px (20× equivalent; 40× is shown by up-sampling). CORS `*` and 1-year immutable cache via `_headers`.
- **Consequences**: measured sizes — trial slide (BRCA, 11k × 16k px at 20×) = 251 tiles / 37 MB in 8 s; the **largest** eligible lung slide (TCGA-LUAD DX, 157 MB SVS, 28k × 29k px at 20×) = 1,109 tiles / 103 MB in 29 s. Worst case 28 × 1,109 ≈ 31k files ⇒ at most 2 tile Workers; typical slides are smaller. True 40× detail is lost (acceptable for adeno / squamous / normal calls at MVP level). Skipped tiles return 404 and render as white; OpenSeadragon's `tileRetryMax` defaults to 0, so a 404 is not retried.

## ADR-004 · Diagnosis kept out of case metadata

- **Context**: the reveal must be blind; v2.0 §7 put `truth` inside `case.json`. Provenance leaks the label too: TCGA project (`TCGA-LUAD` ⇒ adeno, `TCGA-LUSC` ⇒ squamous), sample type (`Solid Tissue Normal`) and barcode (`-11A` ⇒ normal, `-01A` ⇒ tumour).
- **Decision**: `cases/<id>.json`, case IDs, DZI names and tile URLs carry nothing label-related: IDs are opaque (`lung-07`), the DZI is `<id>.dzi`. `answers/<id>.json` holds `truth`, `primaryDiagnosis` and the GDC `source` (shown after the reveal) and is fetched only after submit. `npm run validate:data` fails if a case file matches label hints (`TCGA`, `LUAD`, `LUSC`, `normal`, `adeno`, `squam`, `carcinoma`, sample types, `-0nX` / `-1nX` barcodes) or if the DZI name differs from the case ID.
- **Consequences**: a static site cannot stop a determined user from fetching `answers/`; the goal is to prevent _accidental_ exposure (cards, devtools / network panel, library listings). Pre/post-test answers follow the same rule. For the n=1 self-test this is an accepted risk: the result is only meaningful if the user answers honestly, which the write-up will state.

## ADR-005 · Trial slide outside the study set

- **Context**: the viewer must be tested end-to-end in M0, but Chu must not see any lung slide before the pre-test.
- **Decision**: M0 uses a TCGA-BRCA slide (`split: "trial"`); breast is excluded from the "other site" practice picks.
- **Consequences**: one fewer organ to choose from for the 2 + 2 "other site" practice slides (candidates: e.g. colon / stomach adenocarcinoma, cervix / head-and-neck / oesophagus squamous).

## ADR-006 · Normal lung slides are frozen sections (to decide at R1)

- **Context**: GDC query (2026-11-03): all 591 TCGA-LUAD/LUSC "Solid Tissue Normal" SVS files are _Tissue Slides_ (frozen, `-11A-…-TS/BS`); diagnostic FFPE slides (`DX`) exist only for tumours.
- **Options**: (a) use frozen normals and tell the user (artefact differences become a shortcut cue: "frozen ⇒ normal"); (b) also use frozen _tumour_ slides for some tumour cases so specimen type is not a giveaway; (c) find FFPE normal lung elsewhere (e.g. GTEx — license and format to check).
- **Proposal**: (b) with the same frozen / FFPE mix in every class, so specimen type carries no information about the label: practice 4 + 4 + 4 lung = 2 frozen + 2 FFPE per class; pre- and post-test 6 each = 1 frozen + 1 FFPE per class. Tumour frozen slides exist in TCGA (`-01A-…-TS/BS`). `specimen` is shown on the case card. (c) still to be checked before R1: GTEx histology images include normal lung, but fixative (FFPE or not), license / access and image format are unverified. Decision at R1.
