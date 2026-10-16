# Long-form design guide

## Contents
- How much to edit
- Structure
- Layouts per moment
- Text and type on 16:9
- B-roll and music
- Thumbnail
- Review checklist

## How much to edit

Reels change something every 2-4 s; long-form does not. Viewers chose to watch, so the person talking is the
content. The automatic layer (jump cuts, FULL/PUNCH alternating on cuts, chapter cards, a lower third, the music bed)
already keeps a talking head moving. On top of that, add a hand-made moment only where the talk needs a visual:
- a name, product, site or tool the viewer should see (screenshot, browser card, logo-free title)
- a list, a number, a comparison (side layout with text, a big stat)
- a demo or screen recording (fullVideo with the face in PIP)
- a joke or emphasis beat (stamp, punch-in, emoji) sparingly
About one moment every 30-60 s; 10-minute video: 10-20 moments, not 150.

## Structure

- 0:00-0:30 hook: the promise of the video in one sentence, a quick look at the result. A lower third with the
  speaker's name in the first 10 s.
- Chapters every 1-4 minutes, each with a short title (3-5 words) that reads as a YouTube chapter.
- End: recap + call to action (subscribe / comment / the offer), end-screen space: keep the last 10-20 s calm
  (FULL layout, no graphics in the right half) so YouTube end-screen elements fit.

## Layouts per moment

| moment | layout |
|---|---|
| talking | FULL/PUNCH from autoZoom |
| explaining a list or concept | SIDE_L + text and cards on the right |
| demo, screen recording, stock footage | fullVideo + PIP (or OFF for a cinematic beat) |
| screenshot, article, post | SIDE_L + imageCard, or fullImage + PIP |
| big statement | OFF + huge text, or PUNCH + stamp |

## Text and type on 16:9

Safe area: 96 px from the left/right edges and 76 px from the top; keep the bottom 120 px for captions/YouTube's
controls. Headlines 72-120 px, body 40-56 px, labels 24-30 px mono. Graphics in SIDE_L start at x ~760.

## B-roll and music

- Stock clips 4-8 s, matched to the exact words; never generic filler for long stretches. Trim to the useful part
  with `frames.sh <video> <name> <start> <dur> 1920`.
- Credit every clip in the frame (fullVideo `credit`) when the license asks, and always in the description
  (youtube.py lists `assets/credits.json`).
- Music: one calm instrumental bed per video or per chapter, ducked under the voice (`mix_audio.py`); never vocals
  under speech. Only licenses that allow monetized YouTube (see stock.md).

## Thumbnail

1280x720. Face large (one side), 2-4 huge words (900 weight, 100-130 px) with one accent word, high contrast, no small
text. Use the frame with the strongest expression (`faceStill(st, t, css)` with a time picked from the contact sheet).

## Review checklist

- sheet across the whole video: no section where nothing happens for minutes, no graphic left on screen
- every chapter card readable and on its words; chapter timestamps 10 s+ apart
- jump cuts never clip a word (raise `--keep` or add a `--drop` instead)
- face never cropped in PIP / side cards; b-roll credits visible
- the last 10-20 s free for end screens
