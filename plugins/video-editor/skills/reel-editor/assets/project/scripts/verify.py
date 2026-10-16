# /// script
# dependencies = ["numpy"]
# ///
"""Checks a finished reel before handing it over: format, frame count, loudness, true peak, and A/V sync.

usage: uv run scripts/verify.py [out/<name>.mp4] [source/edit.mp4]
Sync is the lag between the reel's audio and the talking head's original audio (cross-correlation of up to 12s of the
first segment; re-cut variants are compared from where their first segment starts in the source); anything past one
frame (33 ms) means a processing step delayed the voice.
"""
import glob
import json
import os
import re
import subprocess
import sys

import numpy as np

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
reel = sys.argv[1] if len(sys.argv) > 1 else sorted((p for p in glob.glob(os.path.join(root, "out/*.mp4")) if "preview" not in p), key=os.path.getmtime)[-1]
src = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, "source/edit.mp4")


def pcm(path, t=12, ss=0.0):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{ss:.3f}", "-t", str(t), "-i", path, "-ac", "1", "-ar", "8000", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32)
    return x - x.mean()


info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", reel], capture_output=True, text=True, check=True).stdout)
v = next(s for s in info["streams"] if s["codec_type"] == "video")
a = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
dur = float(info["format"]["duration"])
fps = eval(v["r_frame_rate"])  # noqa: S307 (ffprobe fraction like 30/1)
frames = int(v.get("nb_read_frames", 0))
size_mb = int(info["format"]["size"]) / 1e6
ok = True
print(f"{os.path.relpath(reel, root)}: {v['width']}x{v['height']} {v['codec_name']} {v['pix_fmt']} {fps:g}fps, {dur:.2f}s, {frames} frames, {size_mb:.1f} MB")
if (v["width"], v["height"]) != (1080, 1920):
    print("  !! not 1080x1920"); ok = False
if abs(frames - round(dur * fps)) > 1:
    print(f"  !! frame count {frames} != duration x fps {round(dur * fps)}"); ok = False
if a:
    out = subprocess.run(["ffmpeg", "-i", reel, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    i_lufs = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", out)[-1])
    peak = float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", out)[-1])
    print(f"  loudness {i_lufs:.1f} LUFS (target -14), true peak {peak:.1f} dBFS (keep under -1)")
    if abs(i_lufs + 14) > 1 or peak > -1:
        print("  !! loudness or peak out of range"); ok = False
    if os.path.exists(src):
        name = os.path.splitext(os.path.basename(reel))[0]
        cues_path = os.path.join(root, f"out/cues_{name}.json")
        seg = (json.load(open(cues_path)).get("segments") or [[0, 12, 0]])[0] if os.path.exists(cues_path) else [0, 12, 0]
        span = min(12.0, seg[1] - seg[0])
        x, y = pcm(reel, span), pcm(src, span, seg[0])
        n = min(len(x), len(y))
        c = np.fft.irfft(np.fft.rfft(x[:n], 2 * n) * np.conj(np.fft.rfft(y[:n], 2 * n)))
        lag = (int(np.argmax(np.abs(np.concatenate([c[-400:], c[:401]])))) - 400) / 8
        print(f"  a/v sync vs {os.path.relpath(src, root)}: {lag:+.1f} ms (+ = audio late)")
        if abs(lag) > 33:
            print("  !! audio out of sync by more than a frame"); ok = False
else:
    print("  !! no audio stream"); ok = False
if size_mb > 30:
    print("  note: over 30 MB, send the _preview copy to phones; upload the full file")
print("OK" if ok else "CHECK THE !! LINES")
