# /// script
# dependencies = ["numpy"]
# ///
"""Assembles and checks an editor kit after `node scripts/render.mjs kit` rendered its layers (out/kit/<name>/kit.json).

usage: uv run scripts/kit.py out/kit/<name> [--zip]   (render.mjs kit runs this itself)
writes 00_master.mp4, 04_captions.srt, layers.json, README.txt (and <name>.zip with --zip), then checks that
  - background + face + graphics clips + captions, stacked, look like the master (PSNR in YUV 4:2:0, 40 dB or more)
  - voice + sfx + music add up to the mix, and the single sound files add up to sfx.wav
"""
import json
import os
import shutil
import subprocess
import sys
import wave
import zipfile

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import xmeml  # noqa: E402

KIT = os.path.abspath(sys.argv[1])
K = json.load(open(os.path.join(KIT, "kit.json")))
FPS, W, H, N = K["fps"], K["width"], K["height"], K["frames"]
SR = 48000
FF = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
DECODABLE = ["prores", "png", "rle", "webm"]  # alpha formats ffmpeg reads back (its HEVC decoder drops the alpha layer)


def tc(f):
    """SMPTE timecode hh:mm:ss:ff, as editors show it"""
    return f"{f // (FPS * 3600):02d}:{f // (FPS * 60) % 60:02d}:{f // FPS % 60:02d}:{f % FPS:02d}"


def clone(src, dst):
    # APFS clone on a Mac (no extra disk), plain copy elsewhere
    if os.path.exists(dst):
        os.remove(dst)
    if sys.platform == "darwin" and subprocess.run(["cp", "-c", src, dst]).returncode == 0:
        return
    shutil.copy2(src, dst)


def size_mb(p):
    if os.path.isdir(p):
        return sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(p) for f in fs) / 1e6
    return os.path.getsize(p) / 1e6


# ---------- master and captions ----------
clone(K["master"], os.path.join(KIT, "00_master.mp4"))


def srt_time(x):
    ms = int(round(x * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def wrap(txt, width=42):
    lines = [""]
    for w in txt.split():
        if lines[-1] and len(lines[-1]) + 1 + len(w) > width:
            lines.append(w)
        else:
            lines[-1] = f"{lines[-1]} {w}".strip()
    if len(lines) > 2:  # two lines max: rebalance into two
        words, half = txt.split(), len(txt) / 2
        acc, cut = 0, 0
        for i, w in enumerate(words):
            acc += len(w) + 1
            if acc >= half:
                cut = i + 1
                break
        lines = [" ".join(words[:cut]), " ".join(words[cut:])]
    return "\n".join(lines)


caps = [c for c in K["captions"] if c[1] - c[0] > 0.5 / FPS]
srts = []
if caps:
    with open(os.path.join(KIT, "04_captions.srt"), "w", encoding="utf-8") as f:
        f.write("\n".join(f"{i}\n{srt_time(a)} --> {srt_time(b)}\n{wrap(t)}\n" for i, (a, b, t) in enumerate(caps, 1)))
    srts.append("04_captions.srt")
# long-form: the subtitles youtube.py wrote (out/<name>.<lang>.srt), already in output time
OUT = os.path.dirname(os.path.dirname(KIT))
for f in sorted(os.listdir(OUT)):
    if f.startswith(K["name"] + ".") and f.endswith(".srt"):
        dst = f"04_captions.{f[len(K['name']) + 1:-4]}.srt"
        shutil.copy(os.path.join(OUT, f), os.path.join(KIT, dst))
        srts.append(dst)


# ---------- checks ----------
def pick(files, formats):
    for fmt in formats:
        for f in files:
            if f["format"] == fmt:
                return f
    return None


def recomposite():
    """stack the layers with ffmpeg and compare every frame with the master"""
    layers = []  # (path, start frame, is png dir)
    for c in K["clips"]:
        if c["pass"] == "background":
            continue
        if not c["files"]:
            return False, f"{c['pass']} {c['section'] or ''} has no files (a --only run?): render the kit without --only"
        f = pick(c["files"], DECODABLE)
        if not f:
            return None, "no ffmpeg-readable alpha format in this kit (prores, png, rle or webm): stack check skipped"
        layers.append((os.path.join(KIT, f["path"]), c["f0"], f["format"] == "png", c["pass"]))
    order = {"face": 0, "graphics": 1, "captions": 2}
    layers.sort(key=lambda x: (order[x[3]], x[1]))
    args = FF[:] + ["-i", os.path.join(KIT, "01_background.mp4")]
    for p, _, png, _ in layers:
        args += (["-framerate", str(FPS), "-i", os.path.join(p, f"{os.path.basename(p)}_%05d.png")] if png else ["-i", p])
    args += ["-i", K["master"]]
    g = ["[0:v]scale=in_color_matrix=bt709:in_range=tv,format=rgb24[b0]"]
    for i, (_, f0, _, _) in enumerate(layers, 1):
        # each clip starts at its own frame; before and after it the stack passes through untouched
        g.append(f"[{i}:v]format=rgba,setpts=PTS-STARTPTS+{f0}/({FPS}*TB)[l{i}];[b{i - 1}][l{i}]overlay=format=rgb:eof_action=pass[b{i}]")
    log = os.path.join(KIT, "psnr.log")
    g.append(f"[b{len(layers)}]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[s];[{len(layers) + 1}:v]format=yuv420p[m];[s][m]psnr=stats_file={log}")
    subprocess.run(args + ["-filter_complex", ";".join(g), "-frames:v", str(N), "-f", "null", "-"], check=True)
    vals = [float(ln.split("psnr_avg:")[1].split()[0]) for ln in open(log)]
    os.remove(log)
    vals = [min(v, 99.0) for v in vals]
    bad = [i for i, v in enumerate(vals) if v < 40]
    runs = []
    for i in bad:
        if runs and i == runs[-1][1] + 1:
            runs[-1][1] = i
        else:
            runs.append([i, i])
    msg = f"stack vs master: average {np.mean(vals):.1f} dB, worst {min(vals):.1f} dB at {tc(int(np.argmin(vals)))}, {len(vals)} frames"
    if runs:
        msg += "; under 40 dB: " + ", ".join(f"{tc(a)}-{tc(b)}" for a, b in runs[:8])
    return not runs and len(vals) == N, msg


def read(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f64le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float64).reshape(-1, 2)


def rel_db(diff, ref):
    return 20 * np.log10(np.sqrt(np.mean(diff ** 2)) / (np.sqrt(np.mean(ref ** 2)) + 1e-12) + 1e-12)


def audio_checks():
    A = os.path.join(KIT, "05_audio")
    out = []
    mix = read(K["audio"])
    stems = [read(os.path.join(A, f"{s}.wav")) for s in ("voice", "sfx", "music") if os.path.exists(os.path.join(A, f"{s}.wav"))]
    n = min(len(mix), *(len(s) for s in stems))
    d = rel_db(sum(s[:n] for s in stems) - mix[:n], mix[:n])
    out.append((d < -40, f"voice + sfx{' + music' if len(stems) > 2 else ''} vs the mix: {d:.1f} dB"))
    sfx = read(os.path.join(A, "sfx.wav"))
    acc = np.zeros_like(sfx)
    for line in open(os.path.join(A, "cues.csv")).read().splitlines()[1:]:
        _, f, _, start, *_ = line.split(",")
        x = read(os.path.join(A, f))
        a = int(round(float(start) * SR))
        acc[a:a + len(x)] += x[: max(0, len(acc) - a)]
    d = rel_db(acc - sfx, sfx) if np.any(sfx) else -999
    out.append((d < -40, f"single sound files vs sfx.wav: {d:.1f} dB"))
    return out


checks = []
ok, msg = recomposite()
checks.append((ok, msg))
checks += audio_checks()
for ok, msg in checks:
    print(("PASS " if ok else "SKIP " if ok is None else "FAIL ") + msg, flush=True)


# ---------- timelines: every layer already on its track in Premiere / Resolve ----------
def timelines():
    """06_timeline/Premiere_timeline.xml and Resolve_timeline.xml (Final Cut Pro 7 XML). Alpha layers in the first
    format both apps read with transparency; sound effects also one per clip on extra tracks, switched off."""
    stems = json.load(open(os.path.join(KIT, "05_audio", "stems.json")))
    fmt = next((f for f in ("prores", "hevc", "rle") if f in K["formats"]), None)
    if not fmt:
        return None, f"no transparent format Premiere reads (prores, hevc, rle) in this kit: timeline XML skipped"
    full = lambda path, **o: {"path": os.path.join(KIT, path), "start": 0, "frames": N, **o}
    video = []
    if os.path.exists(os.path.join(KIT, "02_camera_cut.mp4")):
        video.append({"name": "camera (off)", "clips": [full("02_camera_cut.mp4", enabled=False)]})
    video.append({"name": "background", "clips": [full("01_background.mp4")]})
    order = {"face": 0, "graphics": 1, "captions": 2}
    for kind in sorted({c["pass"] for c in K["clips"] if c["pass"] in order}, key=order.get):
        clips = []
        for c in K["clips"]:
            f = pick(c["files"], [fmt]) if c["pass"] == kind else None
            if f:
                clips.append({"path": os.path.join(KIT, f["path"]), "start": c["f0"], "frames": c["f1"] - c["f0"], "alpha": True,
                              "name": os.path.splitext(os.path.basename(f["path"]))[0]})
        if clips:
            video.append({"name": kind, "clips": clips})
    A = os.path.join(KIT, "05_audio")

    def wav_frames(p):
        with wave.open(p) as w:
            return max(1, round(w.getnframes() / w.getframerate() * FPS))

    audio = [{"name": s, "clips": [{"path": os.path.join(A, f"{s}.wav"), "start": 0, "frames": min(N, wav_frames(os.path.join(A, f"{s}.wav"))),
                                    "media_frames": wav_frames(os.path.join(A, f"{s}.wav"))}]} for s in stems["stems"]]
    singles = []
    for line in open(os.path.join(A, "cues.csv")).read().splitlines()[1:]:
        _, f, _, start, *_ = line.split(",")
        fr = wav_frames(os.path.join(A, f))
        st = int(round(float(start) * FPS))
        singles.append({"path": os.path.join(A, f), "start": st, "frames": min(fr, N - st), "media_frames": fr, "enabled": False})
    if singles:
        audio.append({"name": "sfx singles (off)", "clips": [c for c in singles if c["frames"] > 0]})
    markers = [(c["f0"], c["section"], "graphics section") for c in sorted(K["clips"], key=lambda c: c["f0"]) if c["pass"] == "graphics"]
    markers += [(int(round(c["t"] * FPS)), f"Chapter: {c['title']}", "chapter") for c in K.get("chapters", []) if c.get("t") is not None]
    os.makedirs(os.path.join(KIT, "06_timeline"), exist_ok=True)
    for resolve, name in ((False, "Premiere_timeline.xml"), (True, "Resolve_timeline.xml")):
        xmeml.write(os.path.join(KIT, "06_timeline", name), K["name"], W, H, FPS, N, video, audio, sorted(markers), resolve=resolve)
    return True, f"06_timeline: Premiere and Resolve XML ({fmt} layers, {len(video)} video layers, {len(markers)} markers)"


tl_ok, tl_msg = timelines()
print(("" if tl_ok else "note: ") + tl_msg)


# ---------- manifest ----------
stems = json.load(open(os.path.join(KIT, "05_audio", "stems.json")))
files = [{"path": "00_master.mp4", "kind": "master", "z": 0, "start_frame": 0, "frames": N, "format": "h264", "alpha": "none"}]
Z = {"background": 1, "face": 2, "graphics": 3, "captions": 4}
for c in K["clips"]:
    for f in c["files"]:
        files.append({"path": f["path"], "kind": c["pass"], "section": c["section"], "z": Z[c["pass"]], "start_frame": c["f0"], "frames": c["f1"] - c["f0"],
                      "start": round(c["f0"] / FPS, 4), "duration": round((c["f1"] - c["f0"]) / FPS, 4), "start_tc": tc(c["f0"]), "format": f["format"], "alpha": f["alpha"]})
if os.path.exists(os.path.join(KIT, "02_camera_cut.mp4")):
    files.append({"path": "02_camera_cut.mp4", "kind": "camera_cut", "z": 2, "start_frame": 0, "frames": N, "format": "h264", "alpha": "none",
                  "note": "raw camera re-cut like the edit, no layouts, with camera sound; keep it off unless re-framing"})
for f in srts:
    files.append({"path": f, "kind": "captions_text", "start_frame": 0, "frames": N, "format": "srt"})
for s in stems["stems"]:
    files.append({"path": f"05_audio/{s}.wav", "kind": s, "start_frame": 0, "frames": N, "format": "wav 24-bit 48 kHz"})
files.append({"path": "05_audio/cues.csv", "kind": "sfx_list", "format": "csv"})
json.dump({"name": K["name"], "variant": K["variant"], "size": [W, H], "fps": FPS, "duration": K["duration"], "frames": N, "segments": K["segments"],
           "loudness": {"lufs": stems["lufs"], "true_peak_dbtp": stems["true_peak_dbtp"]}, "files": files,
           "warnings": K["warnings"], "checks": [m for _, m in checks]}, open(os.path.join(KIT, "layers.json"), "w"), indent=2)


# ---------- README ----------
fmts = K["formats"]
gfx = sorted((c for c in K["clips"] if c["pass"] == "graphics"), key=lambda c: c["f0"])
has = lambda p: any(c["pass"] == p for c in K["clips"])
FMT_NOTE = {
    "prores": "ProRes 4444 with alpha (.mov): Premiere, Resolve, Final Cut, After Effects, CapCut desktop (Mac). Big files.",
    "hevc": "HEVC with alpha (.mov, premultiplied): Final Cut, iPhone apps, Apple devices. Tiny files. Mac/iOS only.",
    "rle": "QuickTime Animation (.mov): CapCut desktop on Windows. Macs can't play it.",
    "png": "PNG image sequence (folder per clip): import as an image sequence in desktop editors.",
    "webm": "WebM VP9 with alpha: web tools.",
    "key": "Solid key colour behind the graphics (.mp4, colour in the file name): Chroma key it in apps without\n"
           "          transparency (CapCut mobile, VN). Each clip gets a colour it doesn't use itself; edges are softer.",
    "black": "Black behind the graphics (.mp4): set the clip's blend mode to Screen. Only bright graphics survive.",
}
R = []
R.append(f"EDITOR KIT - {K['name']}\n{'=' * (13 + len(K['name']))}\n")
R.append(f"The finished edit split into layers, so you can change it in your editor: move, trim or delete graphics, re-time")
R.append(f"captions, rebalance the sound. 00_master.mp4 is the finished video for reference.\n")
R.append(f"Project settings: {W} x {H}, {FPS} fps, {tc(N)} ({K['duration']:.2f} s, {N} frames). Every layer is frame-exact.\n")
R.append("STACK (bottom to top)\n---------------------")
R.append("  V1  01_background.mp4          everything behind the face. Starts at 00:00:00:00.")
if has("face"):
    R.append(f"  V2  02_face_<format>           the camera with its layouts (moves, corners, shadow). Starts at 00:00:00:00.")
if gfx:
    R.append(f"  V3  03_graphics/              one clip per graphics section, placed at these times (also in each file name, mm-ss-ff):")
    for c in gfx:
        R.append(f"        {tc(c['f0'])}  {(c['f1'] - c['f0']) / FPS:6.2f} s  {c['section']}")
if has("captions"):
    R.append(f"  V4  04_captions_<format>       the styled captions. Starts at 00:00:00:00.")
R.append("  A1  05_audio/voice.wav   A2  05_audio/sfx.wav" + ("   A3  05_audio/music.wav" if "music" in stems["stems"] else "") + "   (all start at 00:00:00)")
R.append("  Stacked like this it matches 00_master.mp4. Mute 00_master if you keep it on the timeline.\n")
R.append("FORMATS IN THIS KIT\n-------------------")
for f in fmts:
    R.append(f"  {f:7s} {FMT_NOTE[f]}")
R.append("  If a layer shows a black box instead of transparency, use another format of the same layer (or key / black).\n")
R.append("WHAT YOU CAN EDIT\n-----------------")
R.append("  Graphics arrive as video: move, trim, delete, re-time or re-order them; their text can't be retyped.")
if srts:
    R.append(f"  Captions: {', '.join(srts)} {'is' if len(srts) == 1 else 'are'} plain text. Import as captions/subtitles to edit wording and")
    R.append("  timing" + (", then hide the styled captions layer (or keep the styled layer and skip the .srt)." if has("captions") else "."))
R.append("  Audio: voice, sound effects and music are separate. Every sound effect is also on its own in 05_audio/sfx/, named")
R.append("  NN_kind_mm-ss-ff (where it starts, on the frame grid); 05_audio/cues.csv lists them. Loudness of the full mix:")
R.append(f"  {stems['lufs']:.1f} LUFS, true peak {stems['true_peak_dbtp']:.1f} dBTP. If you change the balance, re-check loudness on export.")
if os.path.exists(os.path.join(KIT, "02_camera_cut.mp4")):
    R.append("  02_camera_cut.mp4: the raw camera cut like the edit, full frame, no layouts, with camera sound. Use it to re-frame")
    R.append("  the face yourself; keep it off (and muted) otherwise.")
R.append("")
if tl_ok:
    R.append("TIMELINE (everything already on its track)\n------------------------------------------")
    R.append("  Premiere Pro   File > Import > 06_timeline/Premiere_timeline.xml. A bin with the sequence appears; open it.")
    R.append("  DaVinci Resolve  File > Import > Timeline > 06_timeline/Resolve_timeline.xml (tick \"Automatically set project")
    R.append("                 settings\").")
    R.append("  The XML points at this folder where the kit was made. If you moved or unzipped it elsewhere, clips show as")
    R.append("  offline: Premiere > File > Link Media > Locate one file, keep \"Relink others automatically\" on; Resolve asks")
    R.append("  for the folder. Captions aren't in the XML: import the .srt as well. Markers mark each graphics section.")
    R.append("  The camera cut and the single sound effects are on their own tracks, switched off.\n")
R.append("IMPORT BY HAND\n--------------")
R.append("  Premiere Pro   Right-click 00_master.mp4 > New Sequence From Clip. Turn that track off, add the layers above it.")
R.append("                 PNG sequences: Import, select the first PNG, tick Image Sequence. Captions: import the .srt, drag it in.")
R.append("  DaVinci Resolve  Timeline 1080x1920 or 1920x1080 at the kit's fps. If a layer is black: Media Pool > Clip Attributes >")
R.append("                 Alpha mode Straight (ProRes, PNG, RLE) or Premultiplied (HEVC). Captions: File > Import > Subtitle.")
R.append("  Final Cut Pro  Custom project at the kit's size and fps; layers as connected clips. Captions: File > Import > Captions.")
R.append("  CapCut desktop Drag layers to tracks above the main track. Key / Blend are in the clip's Video panel. Captions: import .srt.")
R.append("  CapCut / VN mobile  Add layers as overlays (VN: PIP). Use the key files with Chroma key if transparency doesn't show.")
R.append("                 Mobile CapCut can't import .srt.\n")
if K["warnings"]:
    R.append("NOTES\n-----")
    R.append("  These styles depend on what is behind them, so in the layers they look plainer than in the master:")
    for w in K["warnings"]:
        R.append(f"    {w}")
    R.append("")
R.append("CHECKS (done when this kit was made)\n------------------------------------")
for ok, m in checks:
    R.append(f"  {'ok  ' if ok else 'skip' if ok is None else 'FAIL'} {m}")
R.append("\nFILES\n-----")
for f in sorted(files, key=lambda x: x["path"]):
    p = os.path.join(KIT, f["path"])
    if os.path.exists(p):
        R.append(f"  {f['path']:58s} {size_mb(p):8.1f} MB")
R.append("\nlayers.json lists every file with its start frame, length, format and alpha type (for scripts and timeline tools).")
open(os.path.join(KIT, "README.txt"), "w").write("\n".join(R) + "\n")
print(f"wrote {os.path.relpath(KIT)}/README.txt and layers.json ({size_mb(KIT):.0f} MB kit)")

if "--zip" in sys.argv or K.get("zip"):
    z = KIT.rstrip("/") + ".zip"
    with zipfile.ZipFile(z, "w", zipfile.ZIP_STORED) as zf:  # video and audio don't compress
        for d, _, fs in os.walk(KIT):
            for f in fs:
                if f not in ("kit.json", "kit.sig"):
                    zf.write(os.path.join(d, f), os.path.relpath(os.path.join(d, f), os.path.dirname(KIT)))
    print(f"wrote {os.path.relpath(z)} ({size_mb(z):.0f} MB)")
if not all(ok is not False for ok, _ in checks):
    sys.exit("kit checks failed (see above)")
