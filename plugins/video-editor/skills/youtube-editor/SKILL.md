---
name: youtube-editor
description: Edit full-length horizontal YouTube videos (5-60 min talking heads, explainers, tutorials, screen recordings) into finished 1920x1080 uploads - automatic jump cuts that remove pauses, zoom changes on every cut, chapter cards and YouTube chapter timestamps, lower thirds, stock b-roll and royalty-free music from free APIs, occasional motion graphics, English subtitles (.srt, translated for Malayalam / Hindi / other speech), a description with credits, and a thumbnail. Rendered in resumable chunks with Playwright + ffmpeg. Use this whenever the user wants a YouTube video (not a Short or Reel) edited, drops a long recording or several takes in a folder, asks for jump cuts, chapters, subtitles, b-roll or a thumbnail for YouTube, or says "full length", "long video", "podcast", "tutorial" or "YouTube video". For vertical Shorts / Reels / TikToks use the reel-editor skill instead.
---

# YouTube editor

Long-form is a different job from reels: most of the video is the person talking, so the edit is mostly automatic
(jump cuts, zoom on cuts, chapters, lower thirds, subtitles, music bed) and hand-made graphics are rare, one moment
every 30-60 seconds where the talk needs a visual. Don't animate every sentence.

Same engine idea as reel-editor: `edit.js` places elements on springs in **source time** (seconds of the camera
footage, straight from the transcript), `reel/engine.js` turns it into `seek(t)`, `scripts/render.mjs` renders it.
Jump cuts are just `segments` (which stretches of source time play), so cutting never shifts any edit.js time.
Rendering runs in chunks (default 60 s) piped straight into ffmpeg, extracts only the camera frames each chunk needs,
and reuses unchanged chunks: about 1.7 min of render per minute of video at 1080p.

## Setup

```bash
bash <skill dir>/scripts/new_project.sh "<project dir>" [video ...]
```

`<skill dir>` is this skill's folder (the directory holding this SKILL.md; shown as the base directory when the
skill loads). It works the same from a plugin install, `~/.claude/skills/youtube-editor` or a project's `.claude/skills/`.

One folder per video. The script copies the template (`index.html`, starter `edit.js`, `reel/` engine,
`scripts/`), moves the videos into `source/`, installs Playwright and reports missing tools.

## Workflow

**1. Look.** `bash scripts/probe.sh source/<video>` (format, HDR, levels, contact sheet: view it). Landscape camera
or portrait phone? Where is the face (focus point, head height in pixels)? Screen recordings to show?

**2. Assemble** `source/edit.mp4`: `uv run scripts/assemble.py` (all clips in name order) or with an `edl.json` to
order takes. HDR is tonemapped (background it: minutes). Landscape stays 1920x1080; portrait phone footage stays
portrait and the 16:9 layouts show it as a card over a blurred fill. Then `bash scripts/prep.sh`.

**3. Transcribe**: `uv run scripts/transcribe.py` writes `audio/outline.txt` (transcript, English translation for
non-English speech, loanword timestamps, speech runs). Read it end to end and outline the video: sections, chapter
titles, the 5-15 moments that deserve a visual, any retakes ("let me say that again") to drop.

**4. Jump cuts**: `uv run scripts/jumpcuts.py [--gap 0.6] [--keep 0.3] [--drop 812.4-819.0 ...]` writes
`tmp/cuts.js`; it prints the cut count and the longest removed pauses. Defaults are conservative (whisper's words
plus energy: quiet speech is never cut). Drop retakes with `--drop` after hearing/reading them. Re-run any time;
nothing in edit.js moves.

**5. Assets** (only for the moments you picked): stock b-roll and music with `uv run scripts/stock.py`
(`video|music|sfx "<query>"`, look at `tmp/stock_results.jpg`, then `get <n> --name <slug>`; every license goes to
`assets/credits.json`). With no keys it searches Wikimedia, NASA, Internet Archive (video), Openverse, Incompetech,
ccMixter (music) and Openverse/Freesound (sfx). Pexels, Pixabay, Coverr and Freesound need free keys: the user signs
up (never create accounts yourself) and puts them in `~/.config/reel-tools/keys.json`; `stock.py keys` shows what is
missing and where to sign up. Licenses: CC0 / public domain / CC BY / Pexels / Pixabay / Coverr only; never NC or ND;
BY-SA only if the user accepts the whole video becoming BY-SA (`--allow-sa`). Incompetech tracks are pre-registered in
Content ID: the credit must be in the description. Details per provider: `references/stock.md`. Also: X posts with `fetch_x.py` /
`capture.mjs tweet`, website shots with `capture.mjs site`, any video b-roll to frames with `frames.sh`. View
what you download.

**6. Build** `edit.js` (`references/engine-api.md`, `references/design.md`):
- `reel({ width: 1920, height: 1080, face: {...}, segments: CUTS.segments })`
- `faceAt([...autoZoom({ except }), ...your layout keys])`: FULL/PUNCH alternate on every cut automatically
- `chapter(t, title)` at each section (card + YouTube timestamp), `lowerThird()` near the start
- per moment: `SIDE_L` + text/cards on the right, `fullVideo()` / `fullImage()` b-roll with `PIP` or `OFF`,
  `codeCard`, `browserCard`, `terminal`, `stamp`, characters (`clawd`, `mascot`) from the reel engine
- `thumbnail(st => ...)` (1280x720)
Captions are off in long-form by default (YouTube gets the .srt); burn them only if asked (`CAPTIONS=1`).

**7. Check**: `node scripts/render.mjs sheet` (48 frames across the video), then `stills` at every chapter card,
layout change and graphic. Same checklist as reels: legible, nothing clipped, graphics land on their words, face
never cropped (head fully inside PIP/side cards), b-roll credits not hidden.

**8. Audio**: `uv run scripts/mix_audio.py` (voice cleanup and cut stitching, sound cues, optional music bed from
`audio/music.*` ducked under the voice, -14 LUFS with one gain and a peak limiter). Music only if the user wants it.

**9. Render**: `node scripts/render.mjs full` (prints a per-chunk ETA; re-run resumes), `node scripts/render.mjs thumb`,
`uv run scripts/youtube.py` (subtitles, chapters, description + credits), `uv run scripts/verify.py`.

**Editor kit** (when the user's editor wants to change the edit by hand): `node scripts/render.mjs kit --formats
hevc,key` writes `out/kit/<name>/` (master, background, face, one clip per graphics section placed by the start time
in its name, captions, the `.srt` files from youtube.py, `05_audio/` stems with every sound effect on its own,
`06_timeline/` Premiere and Resolve XML with everything on its track and chapter markers, `layers.json`, a README). Long videos want `hevc,key`: ProRes (`prores`) runs about 1 GB per minute
per layer. Run it in the background like `full`; it reuses the master when the edit is unchanged and checks itself.

**10. Deliver**: the video path, thumbnail, `.srt` files and `_description.md`; a short table of chapters; what to
check (translated subtitles, credits, chapter titles). Files over 30 MB can't be sent to a phone; a `_preview.mp4`
is made for videos up to 3 minutes.

## Gotchas

- Everything from reel-editor applies: HDR tonemap, styles as pure functions of t (also in early returns), voice
  latency compensation, captions/graphics never over the mouth, emoji fonts, `url` class on URLs.
- **Face never cropped** (user preference): PIP and side cards are sized from `headHeight`; measure it on a still.
- **b-roll behind the face**: `fullVideo` / `fullImage` draw under the face so `PIP` floats on top; credits sit
  bottom-left, clear of the PIP corner.
- **Chapters**: YouTube needs 00:00 first, 3 or more, each 10 s or longer (`youtube.py` warns).
- **Long renders**: run `render.mjs full` in the background and report the ETA; a crash costs one chunk. Changing
  edit.js invalidates all chunks (one signature per project), so batch edits before re-rendering.
- **Disk**: chunk files stay in `out/chunks/` for resuming (~0.8 GB per 10 min); delete after delivery.
- **Licenses**: only use stock media whose license allows monetized YouTube; keep `assets/credits.json` complete and
  put the credits in the description even when not required.

## Files

```
scripts/new_project.sh       scaffold a project (run from the skill)
assets/project/              template: index.html, edit.js, reel/ (engine, fonts), scripts/
  scripts/                   probe, assemble, prep, transcribe, jumpcuts, stock, fetch_x, capture, fonts, frames,
                             render (chunked), kit (editor kit: kit.mjs + kit.py + xmeml.py), mix_audio, youtube, verify
references/engine-api.md     engine API: layouts, autoZoom, chapter, lowerThird, fullVideo, thumbnail, ...
references/design.md         long-form pacing, layouts, chapters, b-roll, thumbnails
references/stock.md          stock video / music / sfx sources, keys and licenses
references/components.md     the shared components in detail (chip, terminal, codeCard, clawd, ...)
```
