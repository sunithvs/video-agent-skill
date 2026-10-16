#!/usr/bin/env bash
# Installs the skills without the plugin system.
#   ./install.sh             copy into ~/.claude/skills (personal: every project)
#   ./install.sh --project   copy into ./.claude/skills (just the project you run it in)
#   ./install.sh --link      symlink instead of copy (edit the repo, the installed skills follow)
# An existing skill with the same name is moved aside to <name>.bak.<timestamp>, never deleted.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/plugins/video-editor/skills"
DEST="$HOME/.claude/skills"
MODE=copy
for a in "$@"; do
  case "$a" in
    --link) MODE=link ;;
    --project) DEST="$PWD/.claude/skills" ;;
    -h|--help) sed -n 2,7p "$0"; exit 0 ;;
    *) echo "unknown option $a"; exit 1 ;;
  esac
done
mkdir -p "$DEST"
for dir in "$SRC"/*; do
  name=$(basename "$dir")
  target="$DEST/$name"
  if [ -e "$target" ] || [ -L "$target" ]; then
    mv "$target" "$target.bak.$(date +%Y%m%d%H%M%S)"
    echo "moved the existing $name aside"
  fi
  if [ "$MODE" = link ]; then ln -s "$dir" "$target"; else cp -R "$dir" "$target"; fi
  echo "installed $name -> $target ($MODE)"
done
echo
echo "tools the skills use:"
for t in ffmpeg ffprobe node npm uv; do printf "  %-8s %s\n" "$t" "$(command -v $t || echo 'MISSING')"; done
command -v avconvert >/dev/null && echo "  avconvert (HDR tonemap) yes" || echo "  avconvert no (fine off macOS; HDR then needs ffmpeg with zscale)"
echo "Restart Claude Code (or start a new session) to load the skills."
