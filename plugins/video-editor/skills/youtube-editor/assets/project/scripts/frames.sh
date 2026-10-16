#!/usr/bin/env bash
# B-roll video -> JPEG sequence the compositor can seek frame by frame (browserCard / setSrc + seqFrame).
#   bash scripts/frames.sh <video> <name> [start=0] [duration=all] [width=1080]
# writes tmp/<name>/0000.jpg ... at 30fps and prints the frame count (pass it as seq.count)
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="$1"; NAME="$2"; START="${3:-0}"; DUR="${4:-}"; WIDTH="${5:-1080}"
rm -rf "tmp/$NAME" && mkdir -p "tmp/$NAME"
ffmpeg -v error -y -ss "$START" ${DUR:+-t "$DUR"} -i "$SRC" -vf "fps=30,scale=${WIDTH}:-2:flags=lanczos" -q:v 2 -start_number 0 "tmp/$NAME/%04d.jpg"
echo "tmp/$NAME: $(ls "tmp/$NAME" | wc -l | tr -d ' ') frames (starts ${START}s into $SRC)"
