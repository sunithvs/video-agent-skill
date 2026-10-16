#!/usr/bin/env bash
# Reads what the compositor and the mixer need from source/edit.mp4 (build it with scripts/assemble.py first).
#   bash scripts/prep.sh
# - audio/voice_raw.wav (48k stereo, for the mix) and audio/voice16k.wav (mono, for whisper)
# - tmp/meta.js: duration, fps, frame count and camera frame size for edit.js
# - tmp/cuts.js: no jump cuts yet (scripts/jumpcuts.py replaces it)
# Camera frames are NOT dumped here: render.mjs extracts just the frames each chunk or still needs.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=source/edit.mp4
[ -f "$SRC" ] || { echo "missing $SRC: run uv run scripts/assemble.py first"; exit 1; }
mkdir -p tmp/face audio
ffmpeg -v error -y -i "$SRC" -map 0:a -ac 2 -ar 48000 audio/voice_raw.wav
ffmpeg -v error -y -i "$SRC" -map 0:a -ac 1 -ar 16000 audio/voice16k.wav
read -r W H < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$SRC" | tr 'x' ' ')
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")
N=$(python3 -c "print(int(round($DUR * 30)))")
echo "const META = { faceFrames: $N, duration: $DUR, fps: 30, srcW: $W, srcH: $H }" > tmp/meta.js
[ -f tmp/cuts.js ] || echo "const CUTS = null" > tmp/cuts.js
echo "source ${W}x${H}, ${DUR}s, $N frames -> tmp/meta.js"
