# /// script
# dependencies = []
# ///
"""Upload extras for YouTube: subtitles (.srt), chapter timestamps and a description with credits.

usage: uv run scripts/youtube.py [name]      (needs out/cues_<name>.json from a render.mjs run, audio/transcript*.json)
writes
  out/<name>.en.srt          English subtitles (whisper's translation for non-English speech, else the transcript),
                             re-timed through the jump cuts; upload in YouTube Studio > Subtitles
  out/<name>.<lang>.srt      native-language subtitles too, when the speech is not English (check them: Indic scripts
                             from whisper are often poor)
  out/<name>_description.md  chapters (YouTube needs 00:00 first, 3+ chapters, each 10s+) and the credits from
                             assets/credits.json (stock.py writes it) with a placeholder intro to edit
"""
import json
import os
import re
import sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def ts(t, srt=True):
    t = max(0.0, t)
    h, m, s = int(t // 3600), int(t % 3600 // 60), t % 60
    return f"{h:02d}:{m:02d}:{int(s):02d},{int(round((s % 1) * 1000)) % 1000:03d}" if srt else (f"{h}:{m:02d}:{int(s):02d}" if h else f"{m}:{int(s):02d}")


def mapper(segments):
    """source time -> output time (None when cut)"""
    def f(t):
        if not segments:
            return t
        for a, b, at in segments:
            if a - 1e-6 <= t < b:
                return at + t - a
        return None
    return f


def cues_from(transcript, to_out, max_chars=84, max_dur=5.5):
    """subtitle cues: word-timed transcripts are re-chunked per word; translations split segments evenly by words"""
    out = []
    for s in transcript.get("segments", []):
        words = s.get("words") or []
        if transcript.get("task") == "translate" or not words:
            toks = s["text"].split()
            if not toks:
                continue
            n = max(1, round(len(s["text"]) / max_chars + 0.49), round((s["e"] - s["s"]) / max_dur + 0.49))
            per = len(toks) / n
            for i in range(n):
                part = toks[round(i * per): round((i + 1) * per)]
                a = s["s"] + (s["e"] - s["s"]) * i / n
                b = s["s"] + (s["e"] - s["s"]) * (i + 1) / n
                if part:
                    out.append((a, b, " ".join(part)))
        else:
            cur, a = [], None
            for w in words:
                if a is None:
                    a = w["s"]
                cur.append(w["w"])
                if len(" ".join(cur)) > max_chars or w["e"] - a > max_dur or w["w"].endswith((".", "?", "!")):
                    out.append((a, w["e"], " ".join(cur)))
                    cur, a = [], None
            if cur:
                out.append((a, words[-1]["e"], " ".join(cur)))
    res = []
    for a, b, text in out:
        oa, ob = to_out(a), to_out(max(a, b - 0.01))
        if oa is None and ob is None:
            continue
        oa = oa if oa is not None else ob - (b - a)
        ob = ob if ob is not None else oa + (b - a)
        res.append((oa, ob, re.sub(r"\s+", " ", text).strip()))
    return res


def write_srt(path, cues):
    lines = []
    for i, (a, b, text) in enumerate(cues, 1):
        if len(text) > 42 and " " in text:  # two lines max
            mid = len(text) // 2
            cut = min((abs(m.start() - mid), m.start()) for m in re.finditer(" ", text))[1]
            text = text[:cut] + "\n" + text[cut + 1:]
        lines += [str(i), f"{ts(a)} --> {ts(b)}", text, ""]
    open(path, "w").write("\n".join(lines))


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else None
    tl = json.load(open(os.path.join(root, f"out/cues_{name}.json" if name else "out/cues.json")))
    name = tl["name"]
    to_out = mapper(tl.get("segments"))
    tdir = os.path.join(root, "audio")
    native = json.load(open(os.path.join(tdir, "transcript.json"))) if os.path.exists(os.path.join(tdir, "transcript.json")) else None
    english = json.load(open(os.path.join(tdir, "transcript_en.json"))) if os.path.exists(os.path.join(tdir, "transcript_en.json")) else native
    if english:
        write_srt(os.path.join(root, f"out/{name}.en.srt"), cues_from(english, to_out))
        print(f"wrote out/{name}.en.srt")
    if native and native.get("language") not in (None, "en"):
        write_srt(os.path.join(root, f"out/{name}.{native['language']}.srt"), cues_from(native, to_out))
        print(f"wrote out/{name}.{native['language']}.srt (check it: whisper's native script can be poor)")

    chapters = sorted(tl.get("chapters", []), key=lambda c: c["t"])
    if chapters and chapters[0]["t"] > 0.5:
        chapters.insert(0, {"t": 0, "title": "Intro"})
    if chapters:
        chapters[0]["t"] = 0
    warn = []
    if 0 < len(chapters) < 3:
        warn.append("YouTube shows chapters only with 3 or more")
    for a, b in zip(chapters, chapters[1:] + [{"t": tl["duration"]}]):
        if b["t"] - a["t"] < 10:
            warn.append(f"chapter '{a['title']}' is under 10s; YouTube needs 10s+")
    credits = json.load(open(os.path.join(root, "assets/credits.json"))) if os.path.exists(os.path.join(root, "assets/credits.json")) else []
    md = ["<!-- edit the intro; keep the chapter lines exactly as they are -->", "", "WRITE A 2-3 LINE INTRO HERE.", ""]
    if chapters:
        md += ["Chapters"] + [f"{ts(c['t'], srt=False)} {c['title']}" for c in chapters] + [""]
    if credits:
        md += ["Credits"]
        for c in credits:
            # the license's own attribution sentence when the source gives one (title, author, license, link)
            if c.get("attribution"):
                md.append(f"- {c['attribution']} {c.get('url', '')}".rstrip())
            else:
                md.append(f"- {c.get('title') or c.get('kind', 'media')} by {c.get('author', 'unknown')} ({c.get('source', '')}, {c.get('license', '')}) {c.get('url', '')}".rstrip())
        md.append("")
    open(os.path.join(root, f"out/{name}_description.md"), "w").write("\n".join(md))
    print(f"wrote out/{name}_description.md ({len(chapters)} chapters, {len(credits)} credits)")
    for w in warn:
        print("  note:", w)


if __name__ == "__main__":
    main()
