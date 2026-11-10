#!/usr/bin/env bash
# Deploy one tiles bucket (pipeline/work/tiles-N) as a static-assets-only Worker
# named pathcoach-tiles-N. Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
set -euo pipefail
n="${1:?usage: deploy_tiles.sh N}"
here="$(cd "$(dirname "$0")" && pwd)"
dir="$here/work/tiles-$n"
[ -d "$dir" ] || { echo "missing $dir" >&2; exit 1; }
cp "$here/tiles-worker/_headers" "$dir/_headers"
count=$(find "$dir" -type f | wc -l)
echo "tiles-$n: $count files"
[ "$count" -le 20000 ] || { echo "over the 20,000 file limit" >&2; exit 1; }
cfg="$here/work/wrangler.tiles-$n.jsonc"
cat > "$cfg" <<JSON
{ "name": "pathcoach-tiles-$n", "compatibility_date": "2026-11-01", "assets": { "directory": "./tiles-$n" } }
JSON
npx --prefix "$here/.." wrangler deploy --config "$cfg"
