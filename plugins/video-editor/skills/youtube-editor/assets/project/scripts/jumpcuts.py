# /// script
# dependencies = ["numpy"]
# ///
"""Automatic jump cuts: keeps the speech, shortens every pause longer than --gap, drops ranges you name.

usage: uv run scripts/jumpcuts.py [--gap 0.6] [--keep 0.3] [--drop 12.4-15.8 --drop 40-41.2] [--off]
  --gap   pauses longer than this get shortened (seconds)
  --keep  how much of a shortened pause stays (split before/after the cut), so speech never sounds clipped
  --drop  source ranges to remove entirely (retakes, mistakes, "let me say that again")
  --off   no automatic cuts (only --drop ranges)
writes tmp/cuts.json and tmp/cuts.js (const CUTS = { segments, ... }); edit.js passes CUTS.segments to reel().

Speech = the union of whisper's word spans (every transcript in audio/) and the energy envelope. The union is the
conservative choice: quiet speech whisper heard but the energy missed (or the other way round) is never cut. Re-run
after changing options; edit.js times stay in source time, so nothing else needs updating.
"""
import argparse
import glob
import json
import os
import subprocess

import numpy as np

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def energy_runs(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    y = np.frombuffer(raw, np.float32)
    hop = 160
    n = len(y) // hop
    db = 20 * np.log10(np.sqrt((y[: n * hop].reshape(n, hop) ** 2).mean(1)) + 1e-9)
    on = db > np.percentile(db, 30) + 6
    runs, start = [], None
    for i, v in enumerate(on):
        if v and start is None:
            start = i
        if not v and start is not None:
            if i - start > 4:
                runs.append((start * hop / 16000, i * hop / 16000))
            start = None
    if start is not None:
        runs.append((start * hop / 16000, n * hop / 16000))
    return runs, len(y) / 16000


def word_spans():
    spans = []
    for p in glob.glob(os.path.join(root, "audio/transcript*.json")):
        d = json.load(open(p))
        for s in d.get("segments", []):
            words = s.get("words") or []
            if words and d.get("task") != "translate":
                spans += [(w["s"], w["e"]) for w in words if w["e"] > w["s"]]
            else:
                spans.append((s["s"], s["e"]))
    return spans


def merge(spans, join=0.0):
    out = []
    for a, b in sorted(spans):
        if out and a <= out[-1][1] + join:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gap", type=float, default=0.6)
    ap.add_argument("--keep", type=float, default=0.3)
    ap.add_argument("--drop", action="append", default=[])
    ap.add_argument("--off", action="store_true")
    a = ap.parse_args()
    runs, dur = energy_runs(os.path.join(root, "audio/voice16k.wav"))
    speech = merge(runs + word_spans(), join=0.05)
    speech = [[max(0, s), min(dur, e)] for s, e in speech]
    if a.off or not speech:
        keep = [[0.0, dur]]
    else:
        # keep each speech island plus half the allowed pause on each side; join islands closer than --gap
        half = a.keep / 2
        keep = merge([[max(0, s - half), min(dur, e + half)] for s, e in speech], join=max(0, a.gap - a.keep))
        keep[0][0] = max(0.0, keep[0][0])
    for d in a.drop:
        x, y = (float(v) for v in d.split("-"))
        nxt = []
        for s, e in keep:
            if e <= x or s >= y:
                nxt.append([s, e])
                continue
            if s < x:
                nxt.append([s, x])
            if e > y:
                nxt.append([y, e])
        keep = nxt
    keep = [[round(s, 3), round(e, 3)] for s, e in keep if e - s >= 0.2]
    edited = sum(e - s for s, e in keep)
    removed = sorted(((keep[i + 1][0] - keep[i][1], keep[i][1], keep[i + 1][0]) for i in range(len(keep) - 1)), reverse=True)
    data = {"segments": keep, "original": round(dur, 3), "edited": round(edited, 3), "cuts": len(keep) - 1,
            "options": {"gap": a.gap, "keep": a.keep, "drop": a.drop, "off": a.off}}
    os.makedirs(os.path.join(root, "tmp"), exist_ok=True)
    json.dump(data, open(os.path.join(root, "tmp/cuts.json"), "w"), indent=1)
    open(os.path.join(root, "tmp/cuts.js"), "w").write("const CUTS = " + json.dumps(data) + "\n")
    print(f"{dur:.1f}s -> {edited:.1f}s ({dur - edited:.1f}s removed, {len(keep) - 1} cuts)")
    for g, x, y in removed[:10]:
        print(f"  cut {g:5.2f}s pause {x:7.2f} -> {y:7.2f}")
    print("wrote tmp/cuts.json, tmp/cuts.js")


if __name__ == "__main__":
    main()
