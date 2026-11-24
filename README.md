# PathCoach

A clinically-oriented slide-reading coach for pathology beginners — start from the anatomical site, follow a structured workflow, call benign / adenocarcinoma / squamous, then compare with reference labels.

**Live:** <https://pathcoach.chuxingxing.workers.dev>

> Work in progress. For education only. Not for diagnostic use.

## What it does

- **Slide viewer** — OpenSeadragon deep zoom, pan, minimap, scale bar, equivalent-magnification readout, keyboard shortcuts (1–5 for 2×–40×)
- **Baseline pre-test** (`/test`) — 6 paired slides, no hints, three-way call + confidence, per-slide timing, one-shot lock, JSON export
- **Practice library** — 16 cases, no labels on cards; status tracked per case
- **Guided reading** — six-step workflow (site recall → tissue → stain → low-power scan → features → conclusion); step 0 must be completed before the slide unlocks; three guidance levels (novice / intermediate / expert) with an opt-in level-up suggestion
- **Evidence annotation** — point / rectangle / polygon overlays bound to checklist items, in image coordinates
- **Reveal** — verdict + official diagnosis + provenance + PathologyOutlines reference links; shown only after submit
- **Local-first** — no backend; sessions live in `localStorage`; full archive export/import as JSON; English UI with i18n scaffolding

## Data & attribution

- Slides: **TCGA** via NCI **GDC** (open-access tier), served as self-hosted DZI tiles on Cloudflare Workers
- Checklist items cite **PathologyOutlines** pages; reveal links to the corresponding tumor-type topic for further reading
- Case metadata files carry no diagnostic labels; answers are fetched only after a conclusion is submitted (`npm run validate:data` enforces the label-leak boundary)

## Stack

React + TypeScript + Vite, OpenSeadragon, Cloudflare Workers (static assets). Python pipeline (`pipeline/`) for GDC slide selection, QC and tiling.

## Development

```bash
npm install
npm run dev      # local dev server
npm run check    # lint + format + typecheck + data validation
npm run deploy   # build + wrangler deploy
```

## Status & roadmap

Working: viewer, pre-test, practice library with guided reading, annotations, reveal. Planned: learning records (confusion matrix, mistake list), post-test, feature atlas, report export. See `docs/plan.md`, `docs/spec-v2.md`, `docs/decisions.md`.

## License & credits

Code: MIT (see `LICENSE`). Slide data under TCGA/GDC terms of use; PathologyOutlines content belongs to its authors — linked, not redistributed. Built with AI-assisted development (Devin, Cognition).
