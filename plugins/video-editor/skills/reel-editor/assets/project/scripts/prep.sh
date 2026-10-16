#!/usr/bin/env bash
# Extracts what the compositor and the mixer read from source/edit.mp4 (build it with scripts/assemble.py first).
#   bash scripts/prep.sh
# - tmp/face/NNNNN.jpg   talking head, one JPEG per 30fps frame, index 0 = t 0
# - audio/voice_raw.wav  48k stereo for the mix;  audio/voice16k.wav  mono for whisper
# - tmp/meta.js          duration and frame count for edit.js
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=source/edit.mp4
[ -f "$SRC" ] || { echo "missing $SRC: run uv run scripts/assemble.py first"; exit 1; }

rm -rf tmp/face && mkdir -p tmp/face audio
ffmpeg -v error -y -i "$SRC" -map 0:v -q:v 2 -start_number 0 tmp/face/%05d.jpg
ffmpeg -v error -y -i "$SRC" -map 0:a -ac 2 -ar 48000 audio/voice_raw.wav
ffmpeg -v error -y -i "$SRC" -map 0:a -ac 1 -ar 16000 audio/voice16k.wav
N=$(ls tmp/face | wc -l | tr -d ' ')
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")
echo "const META = { faceFrames: $N, duration: $DUR }" > tmp/meta.js
echo "face frames: $N  duration: ${DUR}s  -> tmp/meta.js"
