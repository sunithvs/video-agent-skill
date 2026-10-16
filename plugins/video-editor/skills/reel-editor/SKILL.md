---
name: reel-editor
description: Edit talking-head / selfie videos into finished Instagram Reels, TikToks and YouTube Shorts with code-rendered motion graphics - face layouts that morph (split screen, picture-in-picture, punch-ins), kinetic text, captions (including English captions for Malayalam, Hindi or other non-English speech), b-roll from X/Twitter posts, websites and screen recordings, synced sound effects, and loudness mastering. Everything is drawn by one HTML file as a pure function of time and rendered frame by frame with Playwright + ffmpeg. Use this whenever the user drops a video into a folder and wants it edited, asks for a reel / short / TikTok, wants captions, subtitles, b-roll, motion graphics or sound design on a clip, or shares tweet / X links, product URLs or clips "to use when editing" - even if they only say "edit this video", "check the new video" or "make it like the last one".
---

# Reel editor

Turns a talking-head clip plus a few links into a finished 1080x1920 30fps reel. The edit is code: `edit.js` places
every element on springs keyed to the speech, `reel/engine.js` turns it into `seek(t)`, `scripts/render.mjs`
screenshots each subframe with Playwright and ffmpeg blends and encodes them. This means exact timing, any visual
the browser can draw, and edits that are cheap to change and re-render (a 35s reel renders in about 2 minutes).

Two complete worked edits; read the closer one before writing a new edit, most reels reuse their patterns:
- `examples/artcraft/edit.js`: 35s reel about an app suite. X post hook, old-to-new app swaps with screenshots,
  browser card playing the post's video, legal-issues stamp, code typing, icon grid, share CTA.
- `examples/reel-with-claude/edit.js`: 57s reel about editing reels with Claude. Clawd mascot hook (snips the clip
  in an editor window, throws stickers on the monitor), checklist, terminal with
  the real steps, minutes ring, trimmed-clips timeline, prompt + skill cards, chat bubble, a post's video as
  "reference style", NOT AI VIDEO stamp, editor timeline with playhead, webinar card, comment-an-emoji CTA.

## Setup

```bash
bash <skill dir>/scripts/new_project.sh "<project dir>" [video ...]
```

`<skill dir>` is this skill's folder (the directory holding this SKILL.md; shown as the base directory when the
skill loads). It works the same from a plugin install, `~/.claude/skills/reel-editor` or a project's `.claude/skills/`.

The project dir is the folder the user named or put the video in (a new folder per reel, inside their reels folder
if there is one). The script copies the template (`index.html`, starter `edit.js`, `reel/` engine, `scripts/`),
moves the videos into `source/`, installs Playwright and reports missing tools (ffmpeg, node, uv; avconvert or
ffmpeg zscale for HDR). Folder names with spaces are fine; quote them.

## Workflow

Work through these in order; steps 2 and 4 can run at the same time (assembling HDR footage takes minutes).

**1. Look at the source.** `bash scripts/probe.sh source/<video>` prints format, HDR, audio level and writes a
contact sheet: view it. Note where the face sits (the `focus` point: between the eyes and chin, in source pixels,
about (540, 620-820) for a phone selfie, lower when the person sits further from the camera; note the hair top too),
whether the background is plain (text can sit over it) and whether there are retakes or dead air. In HOOK the wall
band free for cards runs from y 230 to the hair, at about `fy - (focus.y - hairTop) * 1.25` (fy = `LAYOUTS.HOOK.fy`):
around 180px for a selfie framed with little headroom, so wall cards hold one or two short lines.

**2. Assemble** `source/edit.mp4`, the single clip everything else reads:
`uv run scripts/assemble.py` (every video in `source/`, full length) or `uv run scripts/assemble.py edl.json` with
`{"clips": [{"src": "source/A.MOV", "in": 0.4, "out": 21.8}, ...]}` to trim the head and tail, drop retakes or join
takes. It tonemaps HDR, crops to 9:16 (`FOCUS_X=` for horizontal footage) and normalizes to 30fps. HDR tonemapping
usually takes about a minute per minute of footage but has taken 8; run it in the background. Only cut what you understand: in another language a "pause" in the energy is often quiet
speech, so cut the obvious (before the first word, after the last, a clear retake) and leave the rest.
Then `bash scripts/prep.sh` (face frames, voice wavs, `tmp/meta.js`).

**3. Transcribe.** `uv run scripts/transcribe.py` writes `audio/outline.txt`: transcript, word times, speech runs.
For non-English speech it also runs whisper's English translation (meaning, segment timing) and a forced-English pass
whose word timestamps locate the English loanwords people mix in ("Photoshop", "open source", product names). Those
loanwords are the anchors graphics land on. The native-script pass is often garbage for Indic languages; don't use it
for captions. Read the whole outline and write down the story beat by beat before designing anything.

**4. Gather assets** from the links the user gave (and the product site if there is one). View every image you plan
to use so you know what is in it.
- X posts: `uv run scripts/fetch_x.py <url>` (text, stats, video/photos into `assets/x/<id>/`) and
  `node scripts/capture.mjs tweet <url> <name>` for the real post card (crop the tall card with ffmpeg `crop=`).
- Websites: `node scripts/capture.mjs site <url> <name> [--desktop]` saves screenshots plus a JSON of every image
  (icons, product shots: download the originals with curl), the brand fonts and colors. Match the brand:
  `bash scripts/fonts.sh "<Family>:<axes>" <name>` and override `--font-*` / colors in `index.html`.
- Stock footage, music, sound effects: `uv run scripts/stock.py video|music|sfx "<query>" [--portrait]`, look at
  `tmp/stock_results.jpg`, `get <n> --name <slug>` (licenses recorded in `assets/credits.json`; put credits in the
  post caption). Sources, keys and licenses: `references/stock.md`.
- Video b-roll (the post's video, screen recordings): `bash scripts/frames.sh <video> <name> [start] [dur] [width]`
  gives a JPEG sequence for `browserCard` / `seqFrame`. Look at its contact sheet (`probe.sh`) to pick the section.

**5. Plan the edit** as a table in the header comment of `edit.js`: time range, face layout, what is on screen, the
word it lands on. Read `references/design.md` first. The short version:
- Hook in the first 2 seconds (the claim, the post that went viral, the surprising number); the first frame is the
  thumbnail, so have the hook already on screen at t=0.
- Change something every 2-4 seconds: a layout morph, a new card, a punch-in. Alternate graphic-heavy sections
  (split, pip) with full-face beats so the person stays present.
- Each section says one thing in a few words. Graphics carry the keywords; captions carry the sentence.
- End on a call to action and the URL/handle.

**6. Build** `edit.js` with the engine API (`references/engine-api.md`). `reel()` config, `faceAt()` layout
timeline, one `layer('name')` per section (the name labels its clip in the editor kit), elements timed with `at()` / `stagger()`, components (`chip`, `text`,
`wallCard`, `imageCard`, `browserCard`, `terminal`, `stamp`, `highlight`, `strike`, `codeCard`, `iconGrid`,
`streaks`, `emojiRise`, and the characters `clawd` (the Claude Code mascot) and `mascot`), sounds with `cue()` (most
components add their own), then `captions()`. Characters make strong hooks: one acting out the claim ("Claude
edited this reel": Clawd cutting the clip) beats a static card. Anything custom is
an `on(t => ...)` that computes styles from `t` (the examples have counters, rings, cut timelines, playheads).

**7. Check visually, then fix.** `node scripts/render.mjs sheet` (a frame every 0.5s) for flow, then
`node scripts/render.mjs stills <t> <t> ...` at every entrance, morph and dense moment, and look at them at full size.
Check: captions never cross the mouth; text is legible over the background; nothing clipped at the edges or hidden
under platform UI (safe zones in design.md); no empty panel lingers; graphics land on their words; emoji and fonts
rendered. Iterate until clean. This loop is where the quality comes from; expect two or three rounds.

**8. Audio.** `uv run scripts/mix_audio.py` (reads `out/cues.json`, written by every render run): cleans the voice,
removes the denoiser's latency, places synthesized UI sounds on the cues, masters to -14 LUFS (one gain and a peak
limiter, so the editor kit's stems add up to the mix exactly). Add a music bed only
when asked (`audio/music.mp3`, ducked automatically); creators usually add trending audio in the app.

**9. Render and verify.** `node scripts/render.mjs full` (writes `out/<name>.mp4` and a small `_preview.mp4`), then
`uv run scripts/verify.py`: 1080x1920, frame count, -14 LUFS, true peak, A/V sync against `source/edit.mp4`.
After changing only audio: `node scripts/render.mjs mux`.

**Variants (when asked for several versions / hooks, or for Instagram trial reels).** Don't duplicate the edit.
`variants({ v1: {}, v2: { segments: [[0, 5.8], [47.5, 53], [5.8, 47.45], [53, 57.1]] }, ... })` at the end of
`edit.js` re-cuts the same take: each segment is a stretch of source time, in output order; graphics, captions, face
frames and sound cues follow their segment, layouts snap into place at each cut. Typical variants: the offer (webinar,
workshop, registration, giveaway) moved right after the hook; a cold open on the boldest line (a claim, a number, a
"this is NOT ..."); a shorter cut without a middle section. Put every cut in a pause (speech runs in the outline),
check stills just before and after each cut, then `bash scripts/render_variants.sh` (cues, mix, render and verify
per variant). Variant-only extras go in `setup()` with `atOut()` / `cueOut()` in output time.

**Editor kit (when the user, or an editor they work with, wants to change the edit by hand).**
`node scripts/render.mjs kit [--formats prores,key] [--zip]` writes `out/kit/<name>/`: the master, the background,
the face with its layouts, one clip per graphics section (placed by the start time in its name), styled captions plus
`04_captions.srt`, `05_audio/` (voice, sfx, music, every sound effect on its own, `cues.csv`), `06_timeline/`
(`Premiere_timeline.xml` / `Resolve_timeline.xml`: File > Import opens a sequence with every layer and sound on its
track; one Link Media relink if the kit moved), `layers.json` and a README with import steps for Premiere, Resolve,
Final Cut, CapCut and VN. Formats: `prores` (ProRes 4444, the pro
default, about 1 GB per minute of face), `hevc` (tiny, Apple only), `key` (a chroma-key colour each clip doesn't use;
for CapCut mobile / VN), `black`, `rle` (CapCut Windows), `png`, `webm`. It reuses `out/<name>.mp4` when the edit is
unchanged, takes about 4x a render, and checks itself (layers restacked vs the master, stems summed vs the mix).
Name sections (`layer('hook')`) so the clips are easy to find. Variants: `VARIANT=v2 node scripts/render.mjs kit`.

**10. Deliver.** Send the preview (file tools often cap at 30 MB; the full file is for uploading) and give the path of
the full file. Summarize the edit as a short time/what table and list what the user should check: translated
caption wording, credit for third-party posts and videos (on screen and in the post caption), any illustrative
content (example code, mock UI), music. Offer a no-captions render (`CAPTIONS=0 node scripts/render.mjs full`), and
an editor kit if someone will touch the edit by hand.

## Gotchas (each one cost a render)

- **HDR iPhone footage** (`color_transfer=arib-std-b67` HLG or `smpte2084` PQ) decoded straight to 8-bit is washed
  out and gray. `assemble.py` tonemaps it (macOS `avconvert`, which can take several minutes, or ffmpeg zscale).
  Homebrew ffmpeg often has no zscale, drawtext or libplacebo; never rely on ffmpeg for text, the HTML draws it.
- **Motion blur needs 6 subframes.** Two show fast morphs as two distinct ghost copies, four still step on the
  fastest layout changes. The default is 6 over a 180-degree shutter (a 57s reel renders in about 4 minutes); the
  engine rounds each subframe to the same face frame so the face itself never ghosts.
- **Shakes under ~10 Hz.** Faster shakes alias at 30fps into jitter and doubled text.
- **Captions over the mouth** happen in split layout if captions stay at chest height; the engine moves them to the
  seam per layout (`REEL.captionY`). Captions sit on a dark pill so colored keywords stay legible over a shirt or
  a busy background. Drop the caption where an on-screen card already says the same sentence (e.g. the CTA).
- **Voice denoise delays audio ~25 ms**; `mix_audio.py` measures it on 8 kHz mono copies (correlating decimated or
  single-channel audio locked onto wrong peaks) and removes it. `verify.py` checks sync; expect +0.0 ms.
- **Playwright browser mismatch**: scripts launch the system Chrome first, then bundled chromium.
- **Whisper**: `transcribe.py` prefers an already cached faster-whisper model and goes offline when one exists (a
  fresh download can stall). Code-mixed speech is detected as the native language; that's expected.
- **`text-transform: uppercase`** on `.mono` labels also uppercases URLs; give URL elements the `url` class.
- **Measure text after fonts load**: components that need widths (`strike`) measure lazily on the first seek.
- **Every style must be a function of t.** No CSS transitions or animations, no `setTimeout`, no state that depends
  on the previous frame (the renderer seeks out of order in 6 parallel pages, and variants jump around the source).
  That includes early returns: an `on()` that returns early after its section must still hide what it drives, or an
  element keeps whatever an earlier frame left (a sticker stuck in the corner of every later frame). Cache derived
  values only if they are pure (a measured width, a release point computed from constants).

## Content honesty

Graphics state what the speaker says and what the sources show. Don't invent numbers, features, quotes, prices or
availability, and don't add qualifiers the speaker didn't say ("LIVE", "free", a date). Illustrative code or UI is
fine when it reads as an illustration. When the translation of a line is unclear, leave that caption out (a card can
carry the idea in safer words) and tell the user which line it was. Use the real post card from the
official embed rather than recreating a post, and credit the author on screen when showing their post or video.

## Files

```
scripts/new_project.sh        scaffold a project (run from the skill)
assets/project/               template copied into each project
  index.html, edit.js         compositor page and starter edit
  reel/engine.js, engine.css  the engine (springs, layouts, components, captions, seek API), default fonts
  scripts/                    probe, assemble, prep, transcribe, fetch_x, capture, fonts, frames,
                              render, kit (editor kit: kit.mjs renders the layers, kit.py assembles and checks
                              them, xmeml.py writes the Premiere / Resolve XML), mix_audio, verify
references/engine-api.md      every engine function and option
references/design.md          layouts and coordinates, safe zones, type scale, pacing, captions, sound
examples/artcraft/edit.js     worked edit: product / app-suite explainer
examples/reel-with-claude/    worked edit: process / behind-the-scenes reel
```
