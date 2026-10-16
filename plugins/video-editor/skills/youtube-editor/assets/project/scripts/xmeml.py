"""Final Cut Pro 7 XML ("xmeml") timelines that Premiere Pro (File > Import) and DaVinci Resolve (File > Import >
Timeline) open with every layer already on its track. Used by kit.py; same file in reel-editor and youtube-editor.

Structure follows Premiere's own exports and auto-editor's writer (research: premiere-xml.md in the kit research):
- full sequence <format> block (Premiere invents settings when it is sparse), square pixels, 1080x1920 or 1920x1080
- each file described once in full, then referenced by id; every clip enabled explicitly; no Motion filters (every
  layer is rendered full frame, in point 0), so nothing depends on disputed keyframe units
- Premiere: stereo files as exploded track pairs (explodedTracks="true", channel 1 and 2 linked); Resolve: one clip per
  audio track (exploded pairs arrive there as duplicated mono)
- pathurl = file://localhost/ + %-escaped absolute path: xmeml has no relative paths, so a moved kit is relinked once
  (Premiere: Link Media > Locate one file, "Relink others automatically"; Resolve asks for the folder)
"""
import os
import sys
import xml.etree.ElementTree as ET
from urllib.parse import quote


def pathurl(p):
    p = os.path.abspath(p).replace("\\", "/")
    if len(p) > 1 and p[1] == ":":  # Windows drive, written the way Premiere writes it: /D%3a/...
        p = "/" + p[0] + "%3a" + quote(p[2:], safe="/")
        return "file://localhost" + p
    return "file://localhost" + quote(p, safe="/")


def _el(parent, tag, text=None, **attrs):
    e = ET.SubElement(parent, tag, {k: str(v) for k, v in attrs.items()})
    if text is not None:
        e.text = str(text)
    return e


def _rate(parent, fps):
    r = _el(parent, "rate")
    _el(r, "timebase", fps)
    _el(r, "ntsc", "FALSE")
    return r


def pack(clips):
    """Spread clips over as few tracks as possible so none overlap on a track (first-fit by start time)."""
    tracks = []
    for c in sorted(clips, key=lambda c: c["start"]):
        for t in tracks:
            if t[-1]["start"] + t[-1]["frames"] <= c["start"]:
                t.append(c)
                break
        else:
            tracks.append([c])
    return tracks


def write(out, name, width, height, fps, frames, video, audio, markers=(), resolve=False):
    """video: [{'name', 'clips': [{'path', 'start', 'frames', 'alpha', 'width', 'height', 'enabled', 'media_frames'}]}]
    bottom track first; overlapping clips in one entry are packed onto extra tracks.
    audio: [{'name', 'clips': [{'path', 'start', 'frames', 'channels', 'enabled', 'media_frames'}]}].
    markers: [(frame, name, comment)]. Times in frames at fps."""
    files, ids = {}, {"clip": 0, "file": 0}

    def file_ref(parent, c, kind):
        p = os.path.abspath(c["path"])
        if p in files:
            _el(parent, "file", id=files[p])
            return
        ids["file"] += 1
        fid = files[p] = f"file-{ids['file']}"
        f = _el(parent, "file", id=fid)
        _el(f, "name", os.path.basename(p))
        _el(f, "pathurl", pathurl(p))
        _rate(f, fps)
        _el(f, "duration", c.get("media_frames", c["frames"]))
        tc = _el(f, "timecode")
        _rate(tc, fps)
        _el(tc, "string", "00:00:00:00")
        _el(tc, "frame", 0)
        _el(tc, "displayformat", "NDF")
        m = _el(f, "media")
        if kind == "video":
            sc = _el(_el(m, "video"), "samplecharacteristics")
            _rate(sc, fps)
            _el(sc, "width", c.get("width", width))
            _el(sc, "height", c.get("height", height))
            _el(sc, "anamorphic", "FALSE")
            _el(sc, "pixelaspectratio", "square")
            _el(sc, "fielddominance", "none")
        if kind == "audio" or c.get("has_audio"):
            a = _el(m, "audio")
            sc = _el(a, "samplecharacteristics")
            _el(sc, "depth", 24)
            _el(sc, "samplerate", 48000)
            _el(a, "channelcount", c.get("channels", 2))

    def clipitem(track, c, kind, **attrs):
        ids["clip"] += 1
        cid = f"clipitem-{ids['clip']}"
        ci = _el(track, "clipitem", id=cid, **attrs)
        _el(ci, "name", c.get("name", os.path.splitext(os.path.basename(c["path"]))[0]))
        _el(ci, "enabled", "TRUE" if c.get("enabled", True) else "FALSE")
        _el(ci, "duration", c.get("media_frames", c["frames"]))
        _rate(ci, fps)
        _el(ci, "start", c["start"])
        _el(ci, "end", c["start"] + c["frames"])
        _el(ci, "in", c.get("in", 0))
        _el(ci, "out", c.get("in", 0) + c["frames"])
        if kind == "video":
            _el(ci, "alphatype", "straight" if c.get("alpha") else "none")
            _el(ci, "pixelaspectratio", "square")
            _el(ci, "anamorphic", "FALSE")
        file_ref(ci, c, kind)
        if kind == "video":
            _el(ci, "compositemode", "normal")
        return ci, cid

    root = ET.Element("xmeml", version="4")
    seq = _el(root, "sequence", id="sequence-1", **({} if resolve else {
        "explodedTracks": "true", "MZ.Sequence.PreviewFrameSizeWidth": width, "MZ.Sequence.PreviewFrameSizeHeight": height}))
    _el(seq, "name", name)
    _el(seq, "duration", frames)
    _rate(seq, fps)
    tc = _el(seq, "timecode")
    _rate(tc, fps)
    _el(tc, "string", "00:00:00:00")
    _el(tc, "frame", 0)
    _el(tc, "displayformat", "NDF")
    media = _el(seq, "media")

    v = _el(media, "video")
    sc = _el(_el(v, "format"), "samplecharacteristics")
    _rate(sc, fps)
    _el(sc, "width", width)
    _el(sc, "height", height)
    _el(sc, "anamorphic", "FALSE")
    _el(sc, "pixelaspectratio", "square")
    _el(sc, "fielddominance", "none")
    _el(sc, "colordepth", 24)
    for layer in video:
        for clips in pack(layer["clips"]):
            t = _el(v, "track")
            for c in clips:
                clipitem(t, c, "video")
            _el(t, "enabled", "TRUE" if layer.get("enabled", True) else "FALSE")
            _el(t, "locked", "FALSE")

    a = _el(media, "audio")
    if not resolve:
        _el(a, "numOutputChannels", 2)  # Premiere's own extension (not in the DTD)
    sc = _el(_el(a, "format"), "samplecharacteristics")
    _el(sc, "depth", 24)
    _el(sc, "samplerate", 48000)
    for layer in audio:
        for clips in pack(layer["clips"]):
            stereo = not resolve and all(c.get("channels", 2) >= 2 for c in clips)
            if not stereo:
                t = _el(a, "track")
                for c in clips:
                    ci, _ = clipitem(t, c, "audio")
                    st = _el(ci, "sourcetrack")
                    _el(st, "mediatype", "audio")
                    _el(st, "trackindex", 1)
                _el(t, "enabled", "TRUE")
                _el(t, "locked", "FALSE")
                continue
            # Premiere: the left and right channel of every clip sit on a pair of tracks, linked to each other
            pair = [_el(a, "track", currentExplodedTrackIndex=i, totalExplodedTrackCount=2, premiereTrackType="Stereo") for i in (0, 1)]
            k = len(a.findall("track")) - 1  # 1-based index of the second track of the pair
            for j, c in enumerate(clips, 1):
                items = [clipitem(pair[i], c, "audio", premiereChannelType="stereo") for i in (0, 1)]
                for i, (ci, _) in enumerate(items):
                    st = _el(ci, "sourcetrack")
                    _el(st, "mediatype", "audio")
                    _el(st, "trackindex", i + 1)
                    for i2, (_, cid2) in enumerate(items):
                        ln = _el(ci, "link")
                        _el(ln, "linkclipref", cid2)
                        _el(ln, "mediatype", "audio")
                        _el(ln, "trackindex", k + i2)
                        _el(ln, "clipindex", j)
                        _el(ln, "groupindex", 1)
            for i, t in enumerate(pair):
                _el(t, "enabled", "TRUE")
                _el(t, "locked", "FALSE")
                _el(t, "outputchannelindex", i + 1)

    for f, mname, comment in markers:
        m = _el(seq, "marker")
        _el(m, "comment", comment)
        _el(m, "name", mname)
        _el(m, "in", f)
        _el(m, "out", -1)

    ET.indent(root, "  ")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n')
        fh.write(ET.tostring(root, encoding="unicode"))
        fh.write("\n")


if __name__ == "__main__":
    sys.exit("import this from kit.py")
