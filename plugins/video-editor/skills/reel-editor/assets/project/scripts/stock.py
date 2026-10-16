# /// script
# dependencies = []
# ///
"""Stock b-roll, music and sound effects from free APIs, with the license of every file recorded.

usage
  uv run scripts/stock.py video "night city traffic" [--source pexels,pixabay,wikimedia] [--n 8] [--min 4] [--portrait]
  uv run scripts/stock.py music "calm piano" [--source openverse,incompetech,ccmixter] [--n 8] [--min 60]
  uv run scripts/stock.py sfx "whoosh" [--source freesound,openverse] [--n 8]
  uv run scripts/stock.py get 3 [--name city_night]     download result #3 of the last search
  uv run scripts/stock.py keys                          which sources are ready, where to get free keys

A search prints numbered results (source, duration, size, author, license) and, for video, writes a contact sheet of
the posters to tmp/stock_results.jpg (left to right, top to bottom = result numbers): look before picking. `get`
saves to assets/broll/<name>.mp4 (video) or audio/<name>.mp3 (music / sfx) and appends the credit to
assets/credits.json; youtube.py puts every credit in the description.

Licenses kept (monetized YouTube, no strings on the whole video): Pexels / Pixabay / Coverr licenses, CC0, public
domain, CC BY. CC BY-SA only with --allow-sa (syncing it into a video makes the video an adaptation that must be
released under BY-SA). NC, ND and Sampling+ never. Sources (details: references/stock.md):
  video  pexels* pixabay* coverr* wikimedia nasa archive      music  openverse incompetech ccmixter
  sfx    freesound* openverse                                  (* free key; the rest need none)
Keys: environment or ~/.config/reel-tools/keys.json: PEXELS_API_KEY, PIXABAY_API_KEY, COVERR_API_KEY, FREESOUND_API_KEY.
Wikimedia asks for contact info in the User-Agent: set REEL_TOOLS_CONTACT (a URL or email) for higher limits.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTACT = os.environ.get("REEL_TOOLS_CONTACT", "personal video editing script")
UA = f"reel-tools-stock/1.1 ({CONTACT})"
KEYS_FILE = os.path.expanduser("~/.config/reel-tools/keys.json")
CACHE = os.path.expanduser("~/.cache/reel-tools")
LAST = os.path.join(root, "tmp/stock_last.json")
SIGNUP = {
    "PEXELS_API_KEY": "https://www.pexels.com/api/ (free, instant; 200 req/h)",
    "PIXABAY_API_KEY": "https://pixabay.com/api/docs/ (free account, key on the docs page)",
    "COVERR_API_KEY": "https://coverr.co/developers (free account, add an app; 50 req/h)",
    "FREESOUND_API_KEY": "https://freesound.org/apiv2/apply (free account, 'Client secret/Api key')",
}
NEEDS = {"pexels": "PEXELS_API_KEY", "pixabay": "PIXABAY_API_KEY", "coverr": "COVERR_API_KEY", "freesound": "FREESOUND_API_KEY"}


def keys():
    k = {}
    if os.path.exists(KEYS_FILE):
        k.update(json.load(open(KEYS_FILE)))
    for name in SIGNUP:
        if os.environ.get(name):
            k[name] = os.environ[name]
    return k


def http(url, headers=None, method="GET", tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})}, method=method)
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < tries - 1:
                time.sleep(int(e.headers.get("Retry-After", "5")))
                continue
            raise


def get_json(url, headers=None):
    return json.loads(http(url, headers))


def download(url, path, headers=None, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
            with urllib.request.urlopen(req, timeout=600) as r, open(path + ".part", "wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            os.replace(path + ".part", path)
            return
        except urllib.error.HTTPError as e:
            # media servers (upload.wikimedia.org especially) throttle; wait as told and retry
            if e.code == 429 and i < tries - 1:
                wait = int(e.headers.get("Retry-After") or 15 * (i + 1))
                print(f"  rate limited, retrying in {wait}s")
                time.sleep(wait)
                continue
            raise


def lic_ok(code, allow_sa):
    c = (code or "").lower().replace("cc ", "").strip()
    if any(x in c for x in ("nc", "nd", "sampling")):
        return False
    if "sa" in c.split("-"):
        return allow_sa
    return c in ("cc0", "pdm", "by") or c.startswith("by") or "public domain" in c or c.startswith("cc0")


def secs(v):
    """'HH:MM:SS' / 'M:SS' / number -> seconds"""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        parts = [float(p) for p in str(v).split(":")]
    except ValueError:
        return None
    return sum(p * 60 ** i for i, p in enumerate(reversed(parts)))


def rec(**kw):
    base = {"kind": "video", "duration": None, "size": None, "poster": None, "attribution": None, "credit_required": True, "note": None}
    base.update(kw)
    return base


# ---------- video ----------
def pexels_video(q, a, k):
    url = "https://api.pexels.com/v1/videos/search?" + urllib.parse.urlencode({"query": q, "per_page": min(80, a.n * 2), "orientation": "portrait" if a.portrait else "landscape", "size": "medium"})
    out = []
    for v in get_json(url, {"Authorization": k["PEXELS_API_KEY"]}).get("videos", []):
        if (v.get("duration") or 0) < a.min:
            continue
        side = (lambda f: f["height"]) if a.portrait else (lambda f: f["width"])
        files = [f for f in v.get("video_files", []) if f.get("file_type") == "video/mp4" and f.get("width")]
        # smallest rendition that is still at least 1080p on the long side, else the biggest there is
        big = sorted([f for f in files if side(f) >= (1920 if not a.portrait else 1920)], key=side) or sorted(files, key=side, reverse=True)
        if not big:
            continue
        f = big[0]
        who = v.get("user", {}).get("name")
        out.append(rec(source="pexels", id=v["id"], title=(v.get("url", "").rstrip("/").split("/")[-1] or str(v["id"])).replace("-", " "), duration=v.get("duration"),
                       size=[f["width"], f["height"]], file=f["link"], poster=v.get("image"), author=who, url=v.get("url"), license="Pexels License",
                       credit_required=False, attribution=f"Video by {who} from Pexels"))
    return out[: a.n]


def pixabay_video(q, a, k):
    url = "https://pixabay.com/api/videos/?" + urllib.parse.urlencode({"key": k["PIXABAY_API_KEY"], "q": q[:100], "per_page": max(3, min(200, a.n * 2)), "safesearch": "true"})
    out = []
    for h in get_json(url).get("hits", []):
        vids = h.get("videos", {})
        f = vids.get("large") if vids.get("large", {}).get("url") else vids.get("medium")
        if not f or not f.get("url") or (h.get("duration") or 0) < a.min or a.portrait != (f.get("height", 0) > f.get("width", 0)):
            continue
        out.append(rec(source="pixabay", id=h["id"], title=h.get("tags", ""), duration=h.get("duration"), size=[f.get("width"), f.get("height")], file=f["url"],
                       poster=f.get("thumbnail"), author=h.get("user"), url=h.get("pageURL"), license="Pixabay Content License", credit_required=False,
                       attribution=f"Video by {h.get('user')} from Pixabay"))
    return out[: a.n]


def coverr_video(q, a, k):
    url = "https://api.coverr.co/videos?" + urllib.parse.urlencode({"query": q, "page": 0, "page_size": min(20, a.n * 2), "sort": "popular", "urls": "true"})
    out = []
    for h in get_json(url, {"Authorization": f"Bearer {k['COVERR_API_KEY']}"}).get("hits", []):
        if (h.get("duration") or 0) < a.min or bool(h.get("is_vertical")) != a.portrait:
            continue
        u = h.get("urls") or {}
        out.append(rec(source="coverr", id=h["id"], title=h.get("title"), duration=round(h.get("duration") or 0, 1), size=[h.get("max_width"), h.get("max_height")],
                       file=u.get("mp4_download") or u.get("mp4"), poster=h.get("thumbnail") or h.get("poster"), author="Coverr", url=f"https://coverr.co/videos/{h.get('id')}",
                       license="Coverr License", credit_required=False, attribution="Video from Coverr"))
    return out[: a.n]


def commons_license_ok(lic, allow_sa):
    l = lic.lower()
    if any(x in l for x in ("nc", "nd", "fair use", "gfdl")):
        return False
    if "by-sa" in l or "by sa" in l:
        return allow_sa
    return l.startswith(("cc0", "public domain", "pd", "cc by", "cc-by")) or l in ("no restrictions",)


def wikimedia_video(q, a, k):
    params = {"action": "query", "format": "json", "formatversion": 2, "generator": "search", "gsrnamespace": 6, "gsrsearch": f"{q} filetype:video",
              "gsrlimit": min(20, a.n * 3), "prop": "imageinfo|videoinfo", "iiprop": "url|size|mime|extmetadata|user", "iiurlwidth": 320,
              "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|AttributionRequired", "viprop": "derivatives"}
    data = get_json("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params))
    out = []
    for p in (data.get("query") or {}).get("pages", []):
        ii = (p.get("imageinfo") or [{}])[0]
        md = ii.get("extmetadata", {})
        lic = (md.get("LicenseShortName") or {}).get("value", "").strip()
        if not commons_license_ok(lic, a.allow_sa):
            continue
        dur = ii.get("duration")
        if a.min and dur and dur < a.min:
            continue
        artist = re.sub(r"<[^>]+>", "", (md.get("Artist") or {}).get("value", "")).strip() or ii.get("user")
        # the original (often 1080p Theora/VP9) unless it is huge; MP4 derivatives top out at 360p, WebM ones go higher.
        # Codec does not matter: frames.sh turns everything into JPEGs.
        ders = [d for d in ((p.get("videoinfo") or [{}])[0].get("derivatives") or []) if "webm" in d.get("type", "")]
        best_der = max(ders, key=lambda d: d.get("height") or 0, default=None)
        src = ii.get("url") if (ii.get("size") or 0) < 400e6 or not best_der else best_der["src"]
        title = p.get("title", "").replace("File:", "")
        out.append(rec(source="wikimedia", id=p.get("pageid"), title=title, duration=round(dur, 1) if dur else None,
                       size=[ii.get("width"), ii.get("height")], file=src, poster=ii.get("thumburl"), author=artist, url=ii.get("descriptionurl"), license=lic,
                       credit_required=not lic.lower().startswith(("cc0", "public domain", "pd")),
                       attribution=f"\"{title}\" by {artist}, {lic}, via Wikimedia Commons"))
        if len(out) >= a.n:
            break
    return out


def nasa_video(q, a, k):
    out = []
    for it in get_json("https://images-api.nasa.gov/search?" + urllib.parse.urlencode({"q": q, "media_type": "video", "page_size": 40})).get("collection", {}).get("items", []):
        d = (it.get("data") or [{}])[0]
        try:
            files = [f.replace("http://", "https://") for f in get_json(it["href"])]
            meta = get_json(next(f for f in files if f.endswith("metadata.json")))
        except Exception:  # noqa: BLE001
            continue
        credit = str(meta.get("XMP:Credit") or d.get("photographer") or d.get("secondary_creator") or "NASA")
        if "nasa" not in credit.lower():
            continue  # third-party footage (e.g. a launch provider) is not NASA's to give away
        dur = secs(meta.get("QuickTime:Duration"))
        if a.min and dur and dur < a.min:
            continue
        mp4 = [f for f in files if f.endswith(".mp4")]
        pick = next((f for f in mp4 if "~large" in f), None) or next((f for f in mp4 if "~medium" in f), None) or next((f for f in mp4 if "~orig" in f), None)
        if not pick:
            continue
        poster = next((ln.get("href") for ln in it.get("links", []) if ln.get("render") == "image"), None)
        out.append(rec(source="nasa", id=d.get("nasa_id"), title=d.get("title", ""), duration=round(dur, 1) if dur else None,
                       size=[meta.get("QuickTime:ImageWidth"), meta.get("QuickTime:ImageHeight")], file=pick, poster=poster, author=credit,
                       url=f"https://images.nasa.gov/details/{d.get('nasa_id')}", license="NASA (public domain; no endorsement implied)",
                       attribution=f"Video: {credit}", note="no NASA logos or implied endorsement"))
        if len(out) >= a.n:
            break
    return out


def archive_video(q, a, k):
    lucene = f"({q}) AND mediatype:movies AND (licenseurl:*publicdomain* OR licenseurl:*cc0* OR licenseurl:*licenses/by/*)"
    data = get_json("https://archive.org/advancedsearch.php?" + urllib.parse.urlencode([("q", lucene), ("fl[]", "identifier"), ("fl[]", "title"), ("fl[]", "licenseurl"), ("rows", a.n * 2), ("output", "json")]))
    out = []
    for doc in data.get("response", {}).get("docs", []):
        try:
            m = get_json(f"https://archive.org/metadata/{doc['identifier']}")
        except Exception:  # noqa: BLE001
            continue
        vids = [f for f in m.get("files", []) if f.get("format") in ("h.264", "MPEG4", "512Kb MPEG4", "h.264 IA")]
        if not vids:
            continue
        f = max(vids, key=lambda f: int(f.get("height") or 0))
        out.append(rec(source="archive", id=doc["identifier"], title=doc.get("title"), duration=secs(f.get("length")), size=[f.get("width"), f.get("height")],
                       file=f"https://archive.org/download/{doc['identifier']}/{urllib.parse.quote(f['name'])}", poster=f"https://archive.org/services/img/{doc['identifier']}",
                       author=m.get("metadata", {}).get("creator") or "Internet Archive", url=f"https://archive.org/details/{doc['identifier']}", license=doc.get("licenseurl"),
                       note="uploader-asserted license; mute the original audio (old soundtracks can be claimed)"))
        if len(out) >= a.n:
            break
    return out


# ---------- audio ----------
def openverse_audio(q, a, k, source=None, category=None):
    lic = "cc0,pdm,by" + (",by-sa" if a.allow_sa else "")
    params = {"q": q[:200], "page_size": 20, "license": lic}
    if source:
        params["source"] = source
    if category:
        params["category"] = category
    out = []
    for r in get_json("https://api.openverse.org/v1/audio/?" + urllib.parse.urlencode(params)).get("results", []):
        code = (r.get("license") or "").lower()
        if not lic_ok(code, a.allow_sa):
            continue
        dur = (r.get("duration") or 0) / 1000  # milliseconds
        if a.min and dur and dur < a.min:
            continue
        label = code.upper() if code in ("cc0", "pdm") else f"CC {code.upper()} {r.get('license_version') or ''}".strip()
        out.append(rec(kind="audio", source=f"openverse/{r.get('source')}", id=r["id"], title=r.get("title"), duration=round(dur, 1) or None, file=r.get("url"),
                       author=r.get("creator"), url=r.get("foreign_landing_url"), license=label, credit_required=code not in ("cc0", "pdm"),
                       attribution=r.get("attribution"), note="Openverse does not verify licenses; the landing page is the proof"))
        if len(out) >= a.n:
            break
    return out


def incompetech_music(q, a, k):
    os.makedirs(CACHE, exist_ok=True)
    cache = os.path.join(CACHE, "incompetech_pieces.json")
    if not os.path.exists(cache) or time.time() - os.path.getmtime(cache) > 7 * 86400:
        open(cache, "wb").write(http("https://incompetech.com/music/royalty-free/pieces.json"))
    words = [w for w in re.findall(r"[a-z]+", q.lower()) if len(w) > 2]
    scored = []
    for p in json.load(open(cache)):
        hay = " ".join(str(p.get(f, "")) for f in ("title", "feel", "genre", "description", "instruments")).lower()
        score = sum(hay.count(w) for w in words)
        dur = secs(p.get("length"))
        if score and not (a.min and dur and dur < a.min):
            scored.append((score, p, dur))
    out = []
    for _, p, dur in sorted(scored, key=lambda x: -x[0])[: a.n]:
        title = p.get("title")
        out.append(rec(kind="audio", source="incompetech", id=p.get("filename"), title=title, duration=dur,
                       file="https://incompetech.com/music/royalty-free/mp3-royaltyfree/" + urllib.parse.quote(p.get("filename", "")),
                       author="Kevin MacLeod", url="https://incompetech.com", license="CC BY 4.0",
                       attribution=f"\"{title}\" Kevin MacLeod (incompetech.com)\nLicensed under Creative Commons: By Attribution 4.0\nhttps://creativecommons.org/licenses/by/4.0/",
                       note=f"pre-registered in Content ID: keep this credit in the description and dispute any claim with it (ISRC {p.get('isrc', '?')})"))
    return out


def ccmixter_music(q, a, k):
    out = []
    words = [w for w in re.findall(r"[a-z]+", q.lower()) if len(w) > 2][:2]
    for lic in ("zero", "by"):
        tags = "+".join(["instrumental"] + words)
        data = json.loads(http("https://ccmixter.org/api/query?" + urllib.parse.urlencode({"f": "json", "tags": tags, "type": "any", "lic": lic, "sort": "rank", "limit": a.n})))
        for u in data:
            f = next((x for x in u.get("files", []) if "audio/mpeg" in ((x.get("file_format_info") or {}).get("mime_type") or "")), None)
            if not f:
                continue
            dur = secs((f.get("file_format_info") or {}).get("ps"))
            if a.min and dur and dur < a.min:
                continue
            lname = u.get("license_name") or ("CC0" if lic == "zero" else "CC BY")
            out.append(rec(kind="audio", source="ccmixter", id=u.get("upload_id"), title=u.get("upload_name"), duration=dur, file=f.get("download_url"),
                           author=u.get("user_name"), url=u.get("file_page_url"), license=lname, credit_required=lic != "zero",
                           attribution=f"\"{u.get('upload_name')}\" by {u.get('user_name')} ({u.get('file_page_url')}), {lname}"))
    return out[: a.n]


def freesound_sfx(q, a, k):
    flt = 'license:("Creative Commons 0" OR "Attribution")' if a.allow_by_sfx else 'license:"Creative Commons 0"'
    url = "https://freesound.org/apiv2/search/?" + urllib.parse.urlencode({"query": q, "filter": flt, "sort": "score", "page_size": a.n,
                                                                          "fields": "id,name,url,username,license,duration,previews"})
    out = []
    for s in get_json(url, {"Authorization": f"Token {k['FREESOUND_API_KEY']}"}).get("results", []):
        cc0 = "zero" in s.get("license", "") or "Creative Commons 0" in s.get("license", "")
        out.append(rec(kind="audio", source="freesound", id=s["id"], title=s.get("name"), duration=round(s.get("duration", 0), 1), file=s.get("previews", {}).get("preview-hq-mp3"),
                       author=s.get("username"), url=s.get("url"), license="CC0" if cc0 else "CC BY 4.0", credit_required=not cc0,
                       attribution=f"\"{s.get('name')}\" by {s.get('username')} ({s.get('url')}) licensed under {'CC0' if cc0 else 'CC BY 4.0'}"))
    return out


SOURCES = {
    "video": {"pexels": pexels_video, "pixabay": pixabay_video, "coverr": coverr_video, "wikimedia": wikimedia_video, "nasa": nasa_video, "archive": archive_video},
    "music": {"openverse": lambda q, a, k: openverse_audio(q, a, k, category="music"), "incompetech": incompetech_music, "ccmixter": ccmixter_music},
    "sfx": {"freesound": freesound_sfx, "openverse": lambda q, a, k: openverse_audio(q, a, k, source="freesound")},
}
DEFAULTS = {"video": "pexels,pixabay,coverr,wikimedia,nasa", "music": "openverse,incompetech", "sfx": "freesound,openverse"}


def contact_sheet(results):
    d = os.path.join(root, "tmp/stock_posters")
    os.makedirs(d, exist_ok=True)
    for f in os.listdir(d):
        os.remove(os.path.join(d, f))
    vf = "scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:-1:-1:color=black"
    for i, r in enumerate(results, 1):
        p = os.path.join(d, f"{i:03d}.jpg")
        ok = False
        if r.get("poster"):
            try:
                download(r["poster"], p + ".src")
                ok = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", p + ".src", "-vf", vf, "-frames:v", "1", p]).returncode == 0
            except Exception:  # noqa: BLE001
                pass
        if not ok and r.get("file"):
            # no poster: grab a frame from the file itself over https
            try:
                ok = subprocess.run(["ffmpeg", "-v", "error", "-y", "-user_agent", UA, "-ss", "2", "-i", r["file"], "-frames:v", "1", "-vf", vf, p], timeout=90).returncode == 0
            except subprocess.TimeoutExpired:
                ok = False
        if not ok:
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x222222:s=320x180", "-frames:v", "1", p], check=True)
        if os.path.exists(p + ".src"):
            os.remove(p + ".src")
    if results:
        cols = 4
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", "1", "-i", os.path.join(d, "%03d.jpg"), "-vf", f"tile={cols}x{(len(results) + cols - 1) // cols}:padding=4:color=white",
                        "-frames:v", "1", os.path.join(root, "tmp/stock_results.jpg")], check=True)
        print("posters: tmp/stock_results.jpg (left to right, top to bottom = result numbers)")


def search(kind, q, a):
    k = keys()
    results, notes = [], []
    for n in (a.source or DEFAULTS[kind]).split(","):
        fn = SOURCES[kind].get(n)
        if not fn:
            notes.append(f"unknown source {n} (have: {', '.join(SOURCES[kind])})")
            continue
        if n in NEEDS and not k.get(NEEDS[n]):
            notes.append(f"{n}: skipped, no {NEEDS[n]} (free: {SIGNUP[NEEDS[n]]})")
            continue
        try:
            results += fn(q, a, k)
        except Exception as e:  # noqa: BLE001
            notes.append(f"{n}: {e}")
    os.makedirs(os.path.join(root, "tmp"), exist_ok=True)
    json.dump({"kind": kind, "query": q, "results": results}, open(LAST, "w"), indent=1)
    for i, r in enumerate(results, 1):
        size = f"{r['size'][0]}x{r['size'][1]}" if r.get("size") and r["size"][0] else ""
        dur = f"{r['duration']:.0f}s" if r.get("duration") else ""
        print(f"{i:2d}. [{r['source']}] {str(r.get('title') or '')[:46]:46s} {dur:>5s} {size:>10s}  {(r.get('author') or '')[:24]} · {r['license']}")
    for n in notes:
        print("  note:", n)
    if kind == "video" and results:
        contact_sheet(results)


def get(i, name):
    r = json.load(open(LAST))["results"][i - 1]
    slug = name or re.sub(r"[^a-z0-9]+", "_", (r.get("title") or str(r["id"])).lower()).strip("_")[:40] or str(r["id"])
    if r["kind"] == "video":
        os.makedirs(os.path.join(root, "assets/broll"), exist_ok=True)
        ext = os.path.splitext(urllib.parse.urlparse(r["file"]).path)[1].lower()
        path = os.path.join(root, f"assets/broll/{slug}{ext if ext in ('.mp4', '.webm', '.ogv', '.mov', '.mkv') else '.mp4'}")
    else:
        ext = os.path.splitext(urllib.parse.urlparse(r["file"]).path)[1]
        path = os.path.join(root, f"audio/{slug}{ext if ext in ('.mp3', '.wav', '.ogg', '.flac', '.m4a') else '.mp3'}")
    download(r["file"], path)
    if r["source"] == "coverr":  # Coverr requires a download ping for every file
        try:
            http(f"https://api.coverr.co/videos/{r['id']}/stats/downloads", {"Authorization": f"Bearer {keys().get('COVERR_API_KEY', '')}"}, method="PATCH")
        except Exception as e:  # noqa: BLE001
            print("  note: coverr download ping failed:", e)
    cred_path = os.path.join(root, "assets/credits.json")
    credits = json.load(open(cred_path)) if os.path.exists(cred_path) else []
    rel = os.path.relpath(path, root)
    credits = [c for c in credits if c.get("file") != rel]
    credits.append({"file": rel, "kind": r["kind"], "title": r.get("title"), "author": r.get("author"), "source": r["source"], "license": r["license"],
                    "url": r.get("url"), "credit_required": r.get("credit_required", True), "attribution": r.get("attribution"), "note": r.get("note"),
                    "downloaded": time.strftime("%Y-%m-%d")})
    json.dump(credits, open(cred_path, "w"), indent=1)
    print(f"saved {rel} ({r['license']}; credit {'required' if r.get('credit_required', True) else 'optional, listed anyway'})")
    if r.get("note"):
        print("  note:", r["note"])
    if r["kind"] == "video":
        print(f"next: bash scripts/frames.sh {rel} {slug} <start> <dur> 1920")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["video", "music", "sfx", "get", "keys"])
    ap.add_argument("arg", nargs="?")
    ap.add_argument("--source")
    ap.add_argument("--n", type=int, default=8)
    ap.add_argument("--min", type=float, default=0)
    ap.add_argument("--portrait", action="store_true")
    ap.add_argument("--allow-sa", action="store_true", help="also CC BY-SA (the whole video must then be CC BY-SA)")
    ap.add_argument("--allow-by-sfx", action="store_true", help="Freesound CC BY too (credit required), not just CC0")
    ap.add_argument("--name")
    a = ap.parse_args()
    if a.cmd == "keys":
        k = keys()
        for env, url in SIGNUP.items():
            print(f"{env:18s} {'set' if k.get(env) else 'missing -> ' + url}")
        print(f"no key needed: wikimedia, nasa, archive (video); openverse, incompetech, ccmixter (music); openverse (sfx)\nkeys file: {KEYS_FILE}")
    elif a.cmd == "get":
        get(int(a.arg), a.name)
    else:
        if not a.arg:
            sys.exit("give a search query")
        search(a.cmd, a.arg, a)


if __name__ == "__main__":
    main()
