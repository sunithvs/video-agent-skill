#!/usr/bin/env bash
# Quick look at a video before editing: format, HDR, audio level, and a 1fps contact sheet to view.
#   bash scripts/probe.sh <video>      -> prints a summary, writes tmp/probe_<name>.jpg
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="$1"; NAME=$(basename "${SRC%.*}")
mkdir -p tmp
ffprobe -v error -show_entries format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt,color_transfer,sample_rate,channels:stream_side_data=rotation -of default=nw=1 "$SRC"
TRC=$(ffprobe -v error -select_streams v:0 -show_entries stream=color_transfer -of default=nw=1:nk=1 "$SRC")
case "$TRC" in arib-std-b67|smpte2084) echo ">> HDR ($TRC): assemble.py tonemaps it to SDR";; esac
ffmpeg -i "$SRC" -af volumedetect -vn -f null - 2>&1 | grep -E "mean_volume|max_volume" | sed 's/.*\] /audio /' || true
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")
STEP=$(python3 -c "print(max(1, round($DUR / 36, 2)))")
ffmpeg -v error -y -i "$SRC" -vf "fps=1/$STEP,scale=180:-2,tile=6x6:padding=2:color=white" -frames:v 1 "tmp/probe_$NAME.jpg"
echo "contact sheet: tmp/probe_$NAME.jpg (one frame every ${STEP}s, left to right)"
