#!/usr/bin/env bash
# Renders every variant of an edit that calls variants() in edit.js: cues, audio mix, full render, verify.
#   bash scripts/render_variants.sh            all variants
#   bash scripts/render_variants.sh v2 v3      just these
set -euo pipefail
cd "$(dirname "$0")/.."
VS="${*:-$(node scripts/render.mjs variants 2>/dev/null | tail -1)}"
for v in $VS; do
  echo "== variant $v"
  VARIANT=$v node scripts/render.mjs still 0 >/dev/null
  NAME=$(node -e "console.log(JSON.parse(require('fs').readFileSync('out/cues.json','utf8')).name)")
  uv run scripts/mix_audio.py "$NAME" | tail -2
  VARIANT=$v node scripts/render.mjs full | grep -E "rendered|wrote"
  uv run scripts/verify.py "out/$NAME.mp4" | tail -4
done
