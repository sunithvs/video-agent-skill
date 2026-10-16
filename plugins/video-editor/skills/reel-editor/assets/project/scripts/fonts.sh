#!/usr/bin/env bash
# Downloads a Google Fonts family (latin subset, variable when available) into assets/fonts/ and prints the @font-face.
#   bash scripts/fonts.sh "Archivo:wdth,wght@62..125,100..900" archivo
#   bash scripts/fonts.sh "Space Grotesk:wght@300..700" space-grotesk
# The family spec is the css2 API syntax. Find a site's fonts with: node scripts/capture.mjs site <url> <name>
set -euo pipefail
cd "$(dirname "$0")/.."
SPEC="$1"; NAME="$2"
mkdir -p assets/fonts
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
CSS=$(curl -s -A "$UA" "https://fonts.googleapis.com/css2?family=${SPEC// /+}&display=block")
URL=$(echo "$CSS" | awk '/\/\* latin \*\//{f=1} f && /src:/{print; exit}' | grep -oE 'https://[^)]+\.woff2' || true)
[ -n "$URL" ] || URL=$(echo "$CSS" | grep -oE 'https://[^)]+\.woff2' | head -1)
[ -n "$URL" ] || { echo "no woff2 for '$SPEC' (check the family name and axes on fonts.google.com)"; exit 1; }
curl -sL -o "assets/fonts/$NAME.woff2" "$URL"
FAMILY="${SPEC%%:*}"
WEIGHT=$(echo "$CSS" | awk '/\/\* latin \*\//{f=1} f && /font-weight/{print; exit}' | sed -E 's/.*font-weight: ([^;]+);.*/\1/')
STRETCH=$(echo "$CSS" | awk '/\/\* latin \*\//{f=1} f && /font-stretch/{print; exit}' | sed -E 's/.*font-stretch: ([^;]+);.*/\1/')
echo "saved assets/fonts/$NAME.woff2 ($(wc -c < "assets/fonts/$NAME.woff2" | tr -d ' ') bytes). add to index.html:"
echo "  @font-face { font-family: '$FAMILY'; src: url(assets/fonts/$NAME.woff2) format('woff2'); font-weight: ${WEIGHT:-400};${STRETCH:+ font-stretch: $STRETCH;} font-display: block; }"
