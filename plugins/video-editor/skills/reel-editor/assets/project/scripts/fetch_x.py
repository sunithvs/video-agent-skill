# /// script
# dependencies = []
# ///
"""X (Twitter) posts: text, author, stats and media, from the public syndication endpoint the embeds use.

usage: uv run scripts/fetch_x.py <post url or id> [...]
writes assets/x/<id>/post.json, video.mp4 (highest bitrate mp4 variant), photo_N.jpg, poster.jpg
For the post card itself use: node scripts/capture.mjs tweet <id> <name>
"""
import json
import os
import re
import sys
import urllib.request

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()


def fetch(arg):
    m = re.search(r"status/(\d+)", arg)
    pid = m.group(1) if m else arg.strip()
    data, err = None, "empty response"
    for token in ("a", "0", "x"):
        try:
            data = json.loads(get(f"https://cdn.syndication.twimg.com/tweet-result?id={pid}&token={token}"))
            if data:
                break
        except Exception as e:  # noqa: BLE001
            err = e
    if not data:
        print(f"{pid}: could not fetch ({err}); the post may be private, deleted or age-restricted")
        return
    out = os.path.join(root, "assets/x", pid)
    os.makedirs(out, exist_ok=True)
    post = {
        "id": pid,
        "author": data.get("user", {}).get("name"),
        "handle": data.get("user", {}).get("screen_name"),
        "created_at": data.get("created_at"),
        "text": data.get("text"),
        "likes": data.get("favorite_count"),
        "replies": data.get("conversation_count"),
        "media": [],
    }
    for i, md in enumerate(data.get("mediaDetails", [])):
        if md.get("type") in ("video", "animated_gif"):
            mp4 = [v for v in md.get("video_info", {}).get("variants", []) if v.get("content_type") == "video/mp4"]
            best = max(mp4, key=lambda v: v.get("bitrate", 0))
            path = os.path.join(out, "video.mp4" if i == 0 else f"video_{i}.mp4")
            open(path, "wb").write(get(best["url"]))
            open(os.path.join(out, "poster.jpg"), "wb").write(get(md["media_url_https"]))
            post["media"].append({"type": md["type"], "file": os.path.relpath(path, root), "duration_ms": md.get("video_info", {}).get("duration_millis"),
                                  "size": [md["original_info"]["width"], md["original_info"]["height"]]})
        else:
            path = os.path.join(out, f"photo_{i}.jpg")
            open(path, "wb").write(get(md["media_url_https"] + "?name=orig"))
            post["media"].append({"type": "photo", "file": os.path.relpath(path, root)})
    json.dump(post, open(os.path.join(out, "post.json"), "w"), indent=2, ensure_ascii=False)
    print(f"@{post['handle']} {post['created_at']}: {post['text']!r}")
    for m in post["media"]:
        print(f"  {m['type']}: {m['file']}" + (f" {m.get('size')} {m.get('duration_ms', 0) / 1000:.1f}s" if m["type"] != "photo" else ""))


if __name__ == "__main__":
    for a in sys.argv[1:]:
        fetch(a)
