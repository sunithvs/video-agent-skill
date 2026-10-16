# /// script
# dependencies = ["faster-whisper", "numpy"]
# ///
"""Transcript + timing outline of the voice, the input for planning the edit.

usage: uv run scripts/transcribe.py [audio/voice16k.wav]
  WHISPER_MODEL=large-v3 uv run scripts/transcribe.py     pick the model (default: best one already cached)

writes
  audio/transcript.json            native-language pass with word timestamps
  audio/transcript_en.json         (non-English speech) whisper's English translation, segment timing
  audio/transcript_en_forced.json  (non-English speech) forced-English pass: code-mixed speech (Malayalam, Hindi,
                                   Tamil, Spanish...) keeps English loanwords like "Photoshop", "open source" with
                                   usable word timestamps, even when the native-script pass is garbage
  audio/outline.txt                segments, loanword times, and speech runs (pauses) in one readable file
"""
import json
import os
import subprocess
import sys

import numpy as np

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(root, sys.argv[1] if len(sys.argv) > 1 else "audio/voice16k.wav")
hub = os.path.expanduser("~/.cache/huggingface/hub")


def pick_model():
    if os.environ.get("WHISPER_MODEL"):
        return os.environ["WHISPER_MODEL"]
    for name in ("large-v3", "large-v2", "medium", "small"):
        if os.path.isdir(os.path.join(hub, f"models--Systran--faster-whisper-{name}")):
            os.environ["HF_HUB_OFFLINE"] = "1"  # cached: never stall on the network
            return name
    return "medium"


def run(model, task, lang):
    segments, info = model.transcribe(src, word_timestamps=True, vad_filter=True, beam_size=5, task=task, language=lang,
                                      condition_on_previous_text=False)
    data = {"language": info.language, "probability": round(info.language_probability, 3), "task": task, "segments": []}
    for s in segments:
        words = [{"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3), "p": round(w.probability, 3)} for w in (s.words or [])]
        data["segments"].append({"s": round(s.start, 3), "e": round(s.end, 3), "text": s.text.strip(), "words": words})
    return data


def speech_runs(path, min_gap=0.15):
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
            runs.append([start, i]); start = None
    if start is not None:
        runs.append([start, n])
    merged = []
    for a, b in runs:
        if merged and (a - merged[-1][1]) * hop / 16000 < min_gap:
            merged[-1][1] = b
        elif b - a > 5:
            merged.append([a, b])
    return [(a * hop / 16000, b * hop / 16000) for a, b in merged], len(y) / 16000


def main():
    from faster_whisper import WhisperModel

    name = pick_model()
    print(f"model {name}", flush=True)
    model = WhisperModel(name, device="cpu", compute_type="int8")
    native = run(model, "transcribe", None)
    json.dump(native, open(os.path.join(root, "audio/transcript.json"), "w"), indent=1, ensure_ascii=False)
    lang = native["language"]
    print(f"language {lang} (p={native['probability']})", flush=True)
    lines = [f"language: {lang} (p={native['probability']}), model {name}", ""]
    english = native
    if lang != "en":
        english = run(model, "translate", lang)
        forced = run(model, "transcribe", "en")
        json.dump(english, open(os.path.join(root, "audio/transcript_en.json"), "w"), indent=1, ensure_ascii=False)
        json.dump(forced, open(os.path.join(root, "audio/transcript_en_forced.json"), "w"), indent=1, ensure_ascii=False)
        lines += ["## native-language pass (check quality before trusting it)"]
        lines += [f"[{s['s']:6.2f}-{s['e']:6.2f}] {s['text']}" for s in native["segments"]] + [""]
        lines += ["## English translation (meaning; segment timing only)"]
        lines += [f"[{s['s']:6.2f}-{s['e']:6.2f}] {s['text']}" for s in english["segments"]] + [""]
        lines += ["## forced-English words (timestamps for loanwords and names; the filler words are guesses)"]
        lines += [" ".join(f"{w['w']}@{w['s']:.2f}" for s in forced["segments"] for w in s["words"]), ""]
    else:
        lines += ["## transcript"]
        lines += [f"[{s['s']:6.2f}-{s['e']:6.2f}] {s['text']}" for s in native["segments"]] + [""]
        lines += ["## words"]
        lines += [" ".join(f"{w['w']}@{w['s']:.2f}" for s in native["segments"] for w in s["words"]), ""]
    runs, dur = speech_runs(src)
    lines += [f"## speech runs (energy; gaps >= 0.15s). total {dur:.2f}s. quiet speech can look like a gap: don't cut on this alone"]
    lines += [" ".join(f"{a:.2f}-{b:.2f}" for a, b in runs)]
    out = os.path.join(root, "audio/outline.txt")
    open(out, "w").write("\n".join(lines) + "\n")
    print("\n".join(lines), flush=True)
    print(f"\nwrote audio/outline.txt", flush=True)


if __name__ == "__main__":
    main()
