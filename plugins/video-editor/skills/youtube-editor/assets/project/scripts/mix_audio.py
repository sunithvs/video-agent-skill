# /// script
# dependencies = ["numpy"]
# ///
"""Clean up the voice, synthesize UI sounds, place each one by its measured peak on its cue, optional music bed
ducked under the voice, master to -14 LUFS (Instagram / TikTok / Shorts playback level).

usage: uv run scripts/mix_audio.py [name] [--stems DIR]   (needs audio/voice_raw.wav from prep.sh and out/cues.json)
  name: a variant's output name (e.g. reel_v2): reads out/cues_<name>.json, writes audio/mix_<name>.wav. Its segments
        decide which stretches of the voice play, in what order (10 ms fades at every cut).
  --stems DIR: also writes the editor-kit audio (render.mjs kit does this): voice.wav, sfx.wav, music.wav (with a bed),
        sfx/NN_<kind>_<mm-ss-ff>.wav (every sound on its own, starting on a frame), cues.csv, stems.json.
        The stems carry the master's gain and limiter, so voice + sfx + music adds up to the mix exactly.
writes audio/voice_clean.wav, audio/sfx/*.wav, audio/mix.wav
  SFX=0.8              overall sound-effect level (default 1)
  MUSIC=audio/bed.mp3  music bed (default: audio/music.* if present). MUSIC_DB=-16 sets how far under the voice it
                       sits, MUSIC_START=12.5 skips into the track. Often the creator adds trending audio in the app
                       instead, so leave it out unless asked.
sound kinds: click key tick pop thunk stamp scratch success swish whoosh
"""
import json
import os
import sys
import re
import subprocess
import wave

import numpy as np

SR = 48000
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rng = np.random.default_rng(7)
SFX_LEVEL = float(os.environ.get("SFX", "1"))
MUSIC_DB = float(os.environ.get("MUSIC_DB", "-16"))  # music rms relative to speech rms, before ducking
MUSIC_START = float(os.environ.get("MUSIC_START", "0"))
TARGET_LUFS = -14.0
VOICE_RMS = -20.0  # dBFS of active speech before the sound effects go in


def t_axis(dur):
    return np.arange(int(SR * dur)) / SR


def env(t, attack, decay):
    a = np.clip(t / attack, 0, 1) if attack > 0 else np.ones_like(t)
    return a * np.exp(-np.maximum(0, t - attack) / decay)


def onepole_hp(x, fc):
    rc = 1 / (2 * np.pi * fc)
    a = rc / (rc + 1 / SR)
    y = np.zeros_like(x)
    for i in range(1, len(x)):
        y[i] = a * (y[i - 1] + x[i] - x[i - 1])
    return y


def onepole_lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.zeros_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def norm(x, peak):
    return x / (np.abs(x).max() + 1e-9) * peak


def click(freq=2100, dur=0.05, body=0.012, peak=0.5):
    t = t_axis(dur)
    noise = onepole_hp(rng.standard_normal(len(t)), 3000) * env(t, 0.0004, 0.0025)
    tone = np.sin(2 * np.pi * freq * t) * env(t, 0.0008, body)
    return norm(noise * 0.6 + tone, peak)


def sweep_noise(dur, lo, hi, shape_pow=2):
    t = t_axis(dur)
    n = onepole_lp(onepole_hp(rng.standard_normal(len(t)), lo), hi)
    return n * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** shape_pow


def sfx():
    s = {}
    # levels are set against speech normalized to VOICE_RMS
    s["click"] = click(2100, peak=0.2)
    s["key"] = click(3400, dur=0.03, body=0.004, peak=0.09)
    t = t_axis(0.08)
    s["tick"] = norm(np.sin(2 * np.pi * 2900 * t) * env(t, 0.0006, 0.012) + click(4200, dur=0.08, body=0.004, peak=0.3), 0.1)
    t = t_axis(0.12)
    f = 380 + 700 * (1 - np.exp(-t / 0.02))
    s["pop"] = norm(np.sin(2 * np.pi * np.cumsum(f) / SR) * env(t, 0.004, 0.03), 0.18)
    # soft low thump for the tweet card landing
    t = t_axis(0.25)
    s["thunk"] = norm(np.sin(2 * np.pi * (60 + 90 * np.exp(-t / 0.03)) * t) * env(t, 0.002, 0.07) + 0.3 * click(1800, dur=0.25, body=0.01, peak=1), 0.26)
    # rubber stamp: body thump + paper slap
    t = t_axis(0.4)
    body = np.sin(2 * np.pi * (48 + 120 * np.exp(-t / 0.02)) * t) * env(t, 0.001, 0.09)
    slap = onepole_lp(rng.standard_normal(len(t)), 5000) * env(t, 0.0005, 0.018)
    s["stamp"] = norm(body + 0.55 * slap, 0.42)
    # marker strike-through: short bright scratch
    t = t_axis(0.16)
    s["scratch"] = norm(onepole_hp(rng.standard_normal(len(t)), 2500) * env(t, 0.01, 0.05) * (1 + 0.5 * np.sin(2 * np.pi * 45 * t)), 0.06)
    t = t_axis(0.6)
    n1 = np.sin(2 * np.pi * 1318.5 * t) * env(t, 0.002, 0.12)
    t2 = np.maximum(0, t - 0.075)
    n2 = np.sin(2 * np.pi * 1975.5 * t2) * env(t2, 0.002, 0.18) * (t >= 0.075)
    s["success"] = norm(n1 + 0.9 * n2 + 0.15 * np.sin(2 * np.pi * 2637 * t2) * env(t2, 0.002, 0.08) * (t >= 0.075), 0.15)
    s["swish"] = norm(sweep_noise(0.26, 900, 4500), 0.05)
    s["whoosh"] = norm(sweep_noise(0.45, 400, 3000, 3), 0.08)
    return s


def read_wav(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def write_wav(path, data):
    data = np.clip(data, -1, 1)
    pcm = (data * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1 if data.ndim == 1 else data.shape[1])
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def measured_peak(x):
    # peak of the smoothed amplitude envelope, so the hit lands where the ear hears it
    k = int(SR * 0.002)
    return int(np.argmax(np.convolve(np.abs(x), np.ones(k) / k, mode="same")))


def latency(processed_path, raw_path):
    """Samples (at SR) the processing chain delayed the voice (afftdn adds ~25ms). Both files go through ffmpeg to
    8 kHz mono first: the same measurement verify.py uses, robust against stereo differences and aliasing."""
    def pcm(path):
        raw = subprocess.run(["ffmpeg", "-v", "error", "-t", "12", "-i", path, "-ac", "1", "-ar", "8000", "-f", "f32le", "-"], check=True, capture_output=True).stdout
        x = np.frombuffer(raw, np.float32).astype(np.float64)
        return x - x.mean()
    a, b = pcm(processed_path), pcm(raw_path)
    n = min(len(a), len(b))
    c = np.fft.irfft(np.fft.rfft(a[:n], 2 * n) * np.conj(np.fft.rfft(b[:n], 2 * n)))
    w = 1600  # +-200 ms
    lag8k = int(np.argmax(np.abs(np.concatenate([c[-w:], c[: w + 1]])))) - w
    return round(lag8k * SR / 8000)


def music_bed(voice, n):
    path = os.environ.get("MUSIC")
    if not path:
        for f in sorted(os.listdir(os.path.join(root, "audio"))):
            if f.startswith("music.") and f.rsplit(".", 1)[-1] in ("mp3", "wav", "m4a", "aac", "flac", "ogg"):
                path = f"audio/{f}"
    if not path:
        return None
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{MUSIC_START:.3f}", "-i", os.path.join(root, path), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"],
                         check=True, capture_output=True).stdout
    m = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)
    if len(m) < n:
        m = np.tile(m, (n // len(m) + 1, 1))
    m = m[:n]
    m *= 10 ** ((VOICE_RMS + MUSIC_DB - 20 * np.log10(np.sqrt(np.mean(m ** 2)) + 1e-9)) / 20)
    # duck about 7 dB while speaking: 20ms rms envelope, fast attack, slow release
    w = int(SR * 0.02)
    env_v = np.repeat(np.sqrt((voice[: n // w * w, 0].reshape(-1, w) ** 2).mean(1)), w)
    env_v = np.pad(env_v, (0, n - len(env_v)))
    talk = (20 * np.log10(env_v + 1e-9) > VOICE_RMS - 18).astype(float)
    g, out = 1.0, np.empty(n)
    att, rel = np.exp(-1 / (SR * 0.03)), np.exp(-1 / (SR * 0.35))
    for i in range(0, n, 64):  # control rate is plenty for a gain curve
        target = 1 - 0.55 * talk[i]
        g = target + (g - target) * (att if target < g else rel) ** 64
        out[i:i + 64] = g
    m *= out[:, None]
    fi, fo = int(SR * 0.4), int(SR * 1.5)
    m[:fi] *= np.linspace(0, 1, fi)[:, None]
    m[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 2
    print(f"music bed {path} from {MUSIC_START}s, {MUSIC_DB} dB under the voice, ducked while speaking", flush=True)
    return m


def loudness(x):
    """integrated loudness (EBU R128, LUFS) and true peak (dBTP) of a float stereo array, measured by ffmpeg"""
    out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-af", "ebur128=peak=true", "-f", "null", "-"],
                         input=np.ascontiguousarray(x, dtype=np.float32).tobytes(), capture_output=True).stderr.decode()
    return float(re.findall(r"I:\s+(-?[\d.]+|-inf) LUFS", out)[-1]), float(re.findall(r"Peak:\s+(-?[\d.]+|-inf) dBFS", out)[-1])


def limiter(x, ceiling_db, look=0.005, release=0.08, block=32):
    """Gain curve (<= 1 per sample) that keeps |x * g| under the ceiling: look-ahead minimum, smoothed, slow release.
    The same curve goes on every stem, so the stems still add up to the master."""
    need = np.minimum(1, 10 ** (ceiling_db / 20) / np.maximum(np.abs(x).max(1), 1e-9))
    if need.min() >= 1:
        return np.ones(len(x))
    nb = -(-len(need) // block)
    blk = np.pad(need, (0, nb * block - len(need)), constant_values=1).reshape(nb, block).min(1)
    L = max(1, int(look * SR / block))
    m = np.lib.stride_tricks.sliding_window_view(np.pad(blk, L, constant_values=1), 2 * L + 1).min(1)
    a, g, prev = np.exp(-block / (release * SR)), np.empty(nb), 1.0
    for i in range(nb):  # instant attack (the look-ahead already starts early), exponential release
        prev = m[i] if m[i] <= prev else a * prev + (1 - a) * m[i]
        g[i] = prev
    # averaging over +-L blocks stays under every block's need (each value is a minimum over a window that covers it),
    # and so does the linear interpolation between neighbouring blocks
    g = np.convolve(np.pad(g, L, mode="edge"), np.ones(2 * L + 1) / (2 * L + 1), mode="valid")
    centers = np.arange(nb) * block + block / 2
    return np.minimum(np.interp(np.arange(len(x)), centers, g), 1.0)


def master(pre):
    """One static gain to -14 LUFS (Instagram / TikTok / YouTube playback level) plus a peak limiter. Returns the
    gain and the limiter curve: the mix is pre * gain * curve, and so is every stem."""
    level, _ = loudness(pre)
    if level == float("-inf") or level < -70:
        return 1.0, np.ones(len(pre)), level, -99.0
    gain, ceiling = 10 ** ((TARGET_LUFS - level) / 20), -2.0
    for _ in range(6):
        curve = limiter(pre * gain, ceiling)
        level, tp = loudness(pre * gain * curve[:, None])
        if tp > -1.2:  # inter-sample peaks above the sample ceiling: lower it
            ceiling -= tp + 1.3
        elif abs(level - TARGET_LUFS) > 0.15:  # the limiter took some loudness away: push a little harder
            gain *= 10 ** ((TARGET_LUFS - level) / 20)
        else:
            break
    print(f"master: {20 * np.log10(gain):+.1f} dB, limiter up to {-20 * np.log10(curve.min()):.1f} dB on "
          f"{100 * np.mean(curve < 0.999):.1f}% of samples -> {level:.1f} LUFS, true peak {tp:.1f} dBTP", flush=True)
    return gain, curve, level, tp


def write_wav24(path, data):
    pcm = (np.clip(data, -1, 1 - 2 ** -23) * 2 ** 23).astype("<i4")
    with wave.open(path, "wb") as w:
        w.setnchannels(data.shape[1])
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(pcm.view(np.uint8).reshape(-1, 4)[:, :3].tobytes())


def write_stems(out_dir, k, voice, fx, bed, placed, fps, info):
    """editor-kit audio: stems and every sound effect on its own, each multiplied by the master's gain curve k"""
    os.makedirs(os.path.join(out_dir, "sfx"), exist_ok=True)
    for f in os.listdir(os.path.join(out_dir, "sfx")):
        os.remove(os.path.join(out_dir, "sfx", f))
    write_wav24(os.path.join(out_dir, "voice.wav"), voice * k)
    write_wav24(os.path.join(out_dir, "sfx.wav"), fx * k)
    if bed is not None:
        write_wav24(os.path.join(out_dir, "music.wav"), bed * k)
    n = len(k)
    tc = lambda f: f"{f // (fps * 60):02d}-{f // fps % 60:02d}-{f % fps:02d}"
    rows = ["n,file,kind,start_s,start_tc,peak_s,gain,peak_offset_ms"]
    for i, (start, x, cue, peak) in enumerate(sorted(placed, key=lambda p: p[0]), 1):
        s0, s1 = max(0, start), min(n, start + len(x))
        f0 = int(s0 * fps // SR)  # the file starts on the frame the sound starts in: drop it on the frame grid
        a = int(round(f0 * SR / fps))
        clip = np.zeros((s1 - a, 2))
        clip[s0 - a:] = x[s0 - start: s1 - start] * k[s0:s1]
        name = f"{i:02d}_{cue['kind']}_{tc(f0)}.wav"
        write_wav24(os.path.join(out_dir, "sfx", name), clip)
        rows.append(f"{i},sfx/{name},{cue['kind']},{a / SR:.6f},{f0 // (fps * 3600):02d}:{tc(f0).replace('-', ':')},{cue['t']:.4f},{cue.get('gain', 1)},{(start + peak - a) / SR * 1000:.1f}")
    open(os.path.join(out_dir, "cues.csv"), "w").write("\n".join(rows) + "\n")
    json.dump(info, open(os.path.join(out_dir, "stems.json"), "w"), indent=2)
    print(f"stems: voice, sfx{', music' if bed is not None else ''} and {len(rows) - 1} single sounds in {os.path.relpath(out_dir, root)}", flush=True)


def main():
    args = sys.argv[1:]
    stems_dir = None
    if "--stems" in args:
        i = args.index("--stems")
        stems_dir = os.path.abspath(args[i + 1])
        del args[i:i + 2]
    name = args[0] if args else None
    cues = json.load(open(os.path.join(root, f"out/cues_{name}.json" if name else "out/cues.json")))
    out_path = os.path.join(root, f"audio/mix_{name}.wav" if name else "audio/mix.wav")
    dur = cues["duration"]
    n = int(round(dur * SR))
    segments = cues.get("segments")

    # voice: rumble cut, gentle denoise, de-harsh, level it, then a soft compressor
    clean = os.path.join(root, "audio/voice_clean.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(root, "audio/voice_raw.wav"), "-af",
                    "highpass=f=80,afftdn=nf=-48:nr=10,equalizer=f=3500:t=q:w=1.2:g=-1.5,equalizer=f=200:t=q:w=1:g=1,"
                    "acompressor=threshold=-24dB:ratio=3:attack=6:release=120:makeup=4dB,"
                    "pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1",
                    "-ar", str(SR), clean], check=True)
    voice = read_wav(clean)
    lag = latency(clean, os.path.join(root, "audio/voice_raw.wav"))
    print(f"voice chain latency {lag / SR * 1000:.1f}ms, removed", flush=True)
    voice = voice[max(0, lag):]
    if segments:
        # re-cut: concatenate the source stretches in output order, short fades so the joins never click
        f = int(SR * 0.01)
        parts = []
        for a, b, _ in segments:
            p = voice[int(round(a * SR)): int(round(b * SR))].copy()
            p[:f] *= np.linspace(0, 1, min(f, len(p)))[:, None]
            p[-f:] *= np.linspace(1, 0, min(f, len(p)))[:, None]
            parts.append(p)
        voice = np.concatenate(parts)
        print(f"voice re-cut into {len(segments)} segments", flush=True)
    voice = voice[:n]
    voice = np.pad(voice, ((0, n - len(voice)), (0, 0)))
    w = int(SR * 0.05)
    frames = voice[: len(voice) // w * w, 0].reshape(-1, w)
    rms = np.sqrt((frames ** 2).mean(1))
    active = rms[20 * np.log10(rms + 1e-9) > 20 * np.log10(rms.max()) - 30]
    voice *= 10 ** ((VOICE_RMS - 20 * np.log10(np.sqrt((active ** 2).mean()))) / 20)
    fade = int(SR * 0.25)
    voice[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2

    os.makedirs(os.path.join(root, "audio/sfx"), exist_ok=True)
    sounds = sfx()
    peaks = {}
    for name, x in sounds.items():
        write_wav(os.path.join(root, f"audio/sfx/{name}.wav"), x)
        peaks[name] = measured_peak(x)
    fx = np.zeros((n, 2))
    placed = []  # (start sample, stereo sound, cue, peak offset) for the single-sound files
    for cue in cues["cues"]:
        x = sounds[cue["kind"]] * cue.get("gain", 1) * SFX_LEVEL
        start = int(round(cue["t"] * SR)) - peaks[cue["kind"]]
        lo, hi = max(0, start), min(n, start + len(x))
        if hi <= lo:
            continue
        seg = x[lo - start: hi - start]
        pan = 0.2 if cue["kind"] in ("swish", "whoosh") else 0.0
        fx[lo:hi, 0] += seg * (1 - pan)
        fx[lo:hi, 1] += seg * (1 + pan)
        placed.append((start, np.stack([x * (1 - pan), x * (1 + pan)], 1), cue, peaks[cue["kind"]]))

    bed = music_bed(voice, n)
    pre = voice + fx + (bed if bed is not None else 0)
    gain, curve, level, tp = master(pre)
    k = gain * curve[:, None]
    write_wav(out_path, pre * k)
    if stems_dir:
        write_stems(stems_dir, k, voice, fx, bed, placed, int(round(cues.get("fps", 30))),
                    {"gain_db": round(20 * np.log10(gain), 2), "limiter_max_db": round(-20 * np.log10(curve.min()), 2), "lufs": level,
                     "true_peak_dbtp": tp, "sample_rate": SR, "stems": ["voice", "sfx"] + (["music"] if bed is not None else []),
                     "mix": os.path.relpath(out_path, root)})
    vr = 20 * np.log10(np.sqrt(np.mean(voice ** 2)) + 1e-9)
    fr = 20 * np.log10(np.abs(fx).max() + 1e-9)
    print(f"{len(cues['cues'])} cues placed; voice rms {vr:.1f} dBFS, loudest sfx peak {fr:.1f} dBFS", flush=True)
    print(f"wrote {os.path.relpath(out_path, root)}", flush=True)


if __name__ == "__main__":
    main()
