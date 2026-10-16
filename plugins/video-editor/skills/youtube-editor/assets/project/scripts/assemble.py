# /// script
# dependencies = []
# ///
"""Builds source/edit.mp4, the camera footage everything else reads: SDR, 30fps, H.264 + AAC 48k, joined per an edit
list. Landscape footage becomes 1920x1080, portrait (phone) footage stays 1080x1920 (the 16:9 layouts show it as a card
over a blurred fill). SIZE=1920x1080 forces a size. Long takes: keep everything here and let jumpcuts.py and
edl drops handle the trimming, since edit.js times are in source time.

usage:
  uv run scripts/assemble.py                  every video in source/ (name order), full length
  uv run scripts/assemble.py edl.json         {"clips": [{"src": "source/IMG_1.MOV", "in": 1.2, "out": 14.8}, ...]}
  FOCUS_X=700 uv run scripts/assemble.py      horizontal footage: crop 9:16 around this x (source pixels)

HDR footage (iPhone HLG, PQ) is tonemapped first: macOS `avconvert` when present (AVFoundation's SDR export),
else ffmpeg zscale+tonemap when built in. Decoding HDR straight to 8-bit looks washed out and desaturated.
Cuts get 10ms audio fades so joins never click. Writes tmp/edl_map.json (output time -> source clip/time).
"""
import json
import os
import shutil
import subprocess
import sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FPS = 30
VIDEO_EXT = (".mp4", ".mov", ".m4v", ".mkv", ".webm")


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path], check=True, capture_output=True, text=True).stdout
    d = json.loads(out)
    v = next(s for s in d["streams"] if s["codec_type"] == "video")
    rot = 0
    for sd in v.get("side_data_list", []):
        if "rotation" in sd:
            rot = int(sd["rotation"])
    w, h = int(v["width"]), int(v["height"])
    if abs(rot) in (90, 270):
        w, h = h, w
    return {
        "w": w, "h": h, "dur": float(d["format"]["duration"]),
        "hdr": v.get("color_transfer") in ("arib-std-b67", "smpte2084"),
        "audio": any(s["codec_type"] == "audio" for s in d["streams"]),
    }


def has_filter(name):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True).stdout
    return any(line.split()[1:2] == [name] for line in out.splitlines() if len(line.split()) > 1)


def to_sdr(src):
    os.makedirs(os.path.join(root, "tmp/sdr"), exist_ok=True)
    dst = os.path.join(root, "tmp/sdr", os.path.splitext(os.path.basename(src))[0] + ".mp4")
    if os.path.exists(dst) and os.path.getmtime(dst) > os.path.getmtime(src):
        return dst
    if shutil.which("avconvert"):
        # the 3840x2160 preset never upscales and keeps portrait 1080x1920 / 2160x3840 sources big enough
        print(f"tonemap (avconvert) {src}", flush=True)
        subprocess.run(["avconvert", "-s", src, "-p", "Preset3840x2160", "-o", dst, "--replace"], check=True, capture_output=True)
    elif has_filter("zscale"):
        print(f"tonemap (zscale) {src}", flush=True)
        vf = "zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vf", vf, "-c:v", "libx264", "-crf", "14", "-c:a", "copy", dst], check=True)
    else:
        print(f"WARNING: {src} is HDR but neither avconvert nor ffmpeg zscale is available; colors will look washed out", flush=True)
        return src
    return dst


def main():
    if len(sys.argv) > 1:
        clips = json.load(open(sys.argv[1]))["clips"]
    else:
        files = sorted(f for f in os.listdir(os.path.join(root, "source")) if f.lower().endswith(VIDEO_EXT) and f != "edit.mp4")
        clips = [{"src": f"source/{f}"} for f in files]
    if not clips:
        sys.exit("no clips: put the talking-head videos in source/ or pass an edl.json")

    inputs, filters, labels, mapping, t_out = [], [], [], [], 0.0
    focus_x = os.environ.get("FOCUS_X")
    global W, H
    if os.environ.get("SIZE"):
        W, H = (int(v) for v in os.environ["SIZE"].split("x"))
    else:
        first = probe(os.path.join(root, clips[0]["src"]))
        W, H = (1920, 1080) if first["w"] >= first["h"] else (1080, 1920)
    for i, c in enumerate(clips):
        src = os.path.join(root, c["src"])
        info = probe(src)
        use = to_sdr(src) if info["hdr"] else src
        a, b = float(c.get("in", 0)), float(c.get("out", info["dur"]))
        inputs += ["-ss", f"{a:.3f}", "-to", f"{b:.3f}", "-i", use]
        k = max(W / info["w"], H / info["h"])
        sw, sh = round(info["w"] * k / 2) * 2, round(info["h"] * k / 2) * 2
        cx = (sw - W) / 2 if focus_x is None else min(max(float(focus_x) * k - W / 2, 0), sw - W)
        filters.append(f"[{i}:v]scale={sw}:{sh}:flags=lanczos,crop={W}:{H}:{cx:.0f}:{(sh - H) / 2:.0f},fps={FPS},setsar=1,format=yuv420p,setpts=PTS-STARTPTS[v{i}]")
        d = b - a
        if info["audio"]:
            filters.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS,afade=t=in:d=0.01,afade=t=out:st={max(0, d - 0.01):.3f}:d=0.01[a{i}]")
        else:
            filters.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{d:.3f}[a{i}]")
        labels.append(f"[v{i}][a{i}]")
        mapping.append({"out_start": round(t_out, 3), "out_end": round(t_out + d, 3), "src": c["src"], "in": a, "out": b})
        t_out += d
        print(f"clip {i}: {c['src']} {a:.2f}-{b:.2f}s ({info['w']}x{info['h']}{', HDR' if info['hdr'] else ''})", flush=True)

    filters.append(f"{''.join(labels)}concat=n={len(clips)}:v=1:a=1[v][a]")
    out = os.path.join(root, "source/edit.mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(filters), "-map", "[v]", "-map", "[a]",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p",
                    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
                    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-movflags", "+faststart", out], check=True)
    os.makedirs(os.path.join(root, "tmp"), exist_ok=True)
    json.dump({"clips": mapping, "duration": round(t_out, 3)}, open(os.path.join(root, "tmp/edl_map.json"), "w"), indent=1)
    print(f"wrote source/edit.mp4 ({t_out:.2f}s, {len(clips)} clip{'s' if len(clips) > 1 else ''})", flush=True)


if __name__ == "__main__":
    main()
