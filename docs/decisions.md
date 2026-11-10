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

- **Context**: R2 requires adding a payment method; the owner declined. Workers static assets allow 20,000 files per Worker version and 25 MiB per file on the free plan.
- **Decision**: one or more assets-only Workers `pathcoach-tiles-N` (`pipeline/deploy_tiles.sh N`). To keep the file count low: DZI with 1024 px JPEG (Q80) tiles, no overlap, blank tiles skipped (`skip_blanks`), pyramid capped at ~0.5 µm/px (20× equivalent; 40× is shown by up-sampling). CORS `*` and 1-year immutable cache via `_headers`.
- **Consequences**: trial slide (BRCA, 11k × 16k px at 20×) = 251 tiles / 37 MB, so 28 slides should fit in 1–3 tile Workers. True 40× detail is lost (acceptable for adeno / squamous / normal calls at MVP level; challenge at R0 if not). Skipped tiles return 404 and render as white.

## ADR-004 · Diagnosis kept out of case metadata

- **Context**: the reveal must be blind; v2.0 §7 put `truth` inside `case.json`.
- **Decision**: `cases/<id>.json` (public metadata) never holds the label; `answers/<id>.json` holds `truth` and is fetched only after submit.
- **Consequences**: a static site cannot prevent a determined user from fetching answers; the goal is to prevent _accidental_ exposure (cards, network previews, library listings). Pre/post-test answers follow the same rule.

## ADR-005 · Trial slide outside the study set

- **Context**: the viewer must be tested end-to-end in M0, but Chu must not see any lung slide before the pre-test.
- **Decision**: M0 uses a TCGA-BRCA slide (`split: "trial"`); breast is excluded from the "other site" practice picks.
- **Consequences**: none for the study design.

## ADR-006 · Normal lung slides are frozen sections (to decide at R1)

- **Context**: GDC query (2026-11-03): all 591 TCGA-LUAD/LUSC "Solid Tissue Normal" SVS files are _Tissue Slides_ (frozen, `-11A-…-TS/BS`); diagnostic FFPE slides (`DX`) exist only for tumours.
- **Options**: (a) use frozen normals and tell the user (artefact differences become a shortcut cue: "frozen ⇒ normal"); (b) also use frozen _tumour_ slides for some tumour cases so specimen type is not a giveaway; (c) find FFPE normal lung elsewhere (e.g. GTEx — license and format to check).
- **Proposal**: (b) for the 12 lung practice + 12 test slides, with `specimen` shown on the case card. Decision at R1.
