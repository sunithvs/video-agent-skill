# Design guide for reels

## Contents
- Frame and safe zones
- Layout choice
- Pacing and structure
- Type and color
- Captions
- Section patterns
- Sound
- Review checklist

## Frame and safe zones

1080x1920. Instagram, TikTok and Shorts draw UI over the video:
- top ~220px: header, camera icon. Section labels start at y 238.
- bottom ~380px (y > 1540): username, caption, audio. Keep captions and text above 1540.
- right ~120px in the lower half (x > 960, y 1100-1750): like / comment / share buttons. Nothing important there.

Keep a 60-70px left/right margin for text. The panel area in SPLIT is y 220-940 (the seam is at 960).

## Layout choice

| layout | when |
|---|---|
| HOOK | first 2s: zoomed face, a card (post, claim) over the top of the frame |
| FULL | the person's own point, opinion, emotion; text over the wall above the head (y 230-560) |
| PUNCH | a beat of emphasis: the punchline, a pause, "send this to..." |
| SPLIT | showing something while they keep talking about it: screenshots, names, lists, big type |
| PIP | b-roll that needs the whole frame (screen recordings, code, grids), face stays in a small card at the bottom; keep the section's content above y ~1060 |

Alternate: a typical 30-60s reel goes HOOK, SPLIT, PUNCH, PIP, FULL, SPLIT, PIP, SPLIT, PUNCH. Morph on the word
that introduces the next idea, slightly before it (0.05-0.1s), so the graphic is there when the word is heard.
Text over the face only works where the background is plain (a wall above the head); use solid cards there.

## Pacing and structure

- 0-2s hook. Show it from frame 0 (cards can enter at t = -0.2 so they are already landing at 0).
- Something changes every 2-4s. Inside a section, items arrive on their words (stagger ~0.03-0.07s for lists).
- Exits are fast (SPR.exit), entrances are springy; never overlap two sections' text.
- Section labels (`01 — Topic`) give a magazine rhythm; keep them short.
- End: CTA card (share / follow / comment keyword) and the URL or handle, held for 1.5s+.

## Type and color

- Match the product's brand when there is one (fonts.sh + the colors from `capture.mjs site`), otherwise the defaults
  (Archivo display, Inter body, Geist Mono labels, dark #0E0E11 background with a faint grid).
- Sizes: section label 24 mono; headlines 66-88; hero words 160-232 (`stretch` 112-125 for width); chips 46;
  captions 46. Max ~16 characters per line at 88px, ~10 at 160px.
- One accent color carries the product name or key word. Semantic colors for chips: orange (tech), green (open
  source / free / yes), red (problem, warning), yellow (speed, highlight).
- White cards with ink text over the face/wall; dark cards with white text over the dark background.

## Captions

- English captions by default; for non-English speech translate from the whisper translate pass, then tighten into
  short chunks (2-6 words, 1.5-3s each) that follow the speech segments. Say in the handoff that they are
  machine-translated.
- Mark 1-2 keywords per caption with `*word*` and semantic colors.
- Skip a caption when an on-screen card says the same sentence.

## Section patterns

From the worked example, mix and match:
- **Post hook**: real post card (capture.mjs tweet, cropped to header + text), slams in with a slight tilt; marker
  highlight sweeps the key line.
- **Old to new swaps**: muted old name with a red strike, new name with icon in accent, product screenshot below;
  one per spoken name; finish with "+N more" and an icon burst.
- **Browser b-roll**: browserCard with the site URL playing a screen recording; 2-3 chips above it pop on keywords;
  small mono credit under it.
- **Problem stamp**: question card, then a red stamp slams with a shake on the problem word.
- **Big word**: one huge word (product, language, number) with an emoji, a chip below, speed streaks.
- **Code typing**: what-is-X explainer; code types across the sentence; keep it plausible and short (5-8 lines).
- **Grid**: all products/features as an icon grid, staggered pop.
- **Stat block**: "100%" huge, label below, platform/feature chips.
- **CTA**: white card ("Send this to your ... friends") with an icon that bounces, URL pill under it.

From the reel-with-claude example (process / behind-the-scenes reels):
- **Mascot hook** (its opening): light stage, an editor window behind the face (`layerUnder` + a MONITOR layout), the
  face talking inside the monitor, the title above. Clawd hops in, snips the head of the first clip on the timeline
  (cut line, sliver falls, clips close up), throws FX and Captions stickers onto the monitor, cheers with sparkles,
  hops off as the monitor morphs into the next layout. Frame 0 already shows title + window + mascot (thumbnail).
- **Wall card hook**: mono kicker ("VIDEO EDITORS 👀") + a two-line claim on a white card in the HOOK band.
- **Checklist**: 3-5 rows with accent check circles, the key one landing on its word, then a summary chip.
- **Terminal**: the real prompt typing, then the real steps appearing (`terminal`). Only list steps that happened.
- **Stat ring**: wall card with a progress ring and a counter that springs to the spoken number.
- **Cut timeline**: thumbnails from `tmp/face` as clips, a playhead sweep, the cut ones turn red and fall away, the
  rest close the gap, "handed to X" chip.
- **Prompt + skill cards**: chat prompt lines and a file tree, each line staggered.
- **Chat bubble**: user bubble in the accent color, then a typing-dots bubble.
- **Reference video**: the post's header cropped to one strip above its video in a card, credit underneath.
- **Editor timeline**: V2 graphics clips, V1 thumbnails, A1 waveform, playhead sweeping, keyframe diamonds lighting.
- **Comment CTA**: wall card ("Comment any emoji 👇", what they get) with `emojiRise` reactions; no caption under it.

## Sound

Every entrance gets a small sound, every layout change a swish (automatic). Keep them under the voice (the mixer
normalizes speech to -20 dBFS and sets effects relative to it); `SFX=0.7` lowers them all. Heavier sounds (stamp,
thunk) only for the 1-2 biggest moments.

## Variants

Instagram favours testing several cuts of one video (trial reels). Re-cut instead of re-editing (`variants()`):
- **Offer first**: hook, then the offer (webinar, workshop, registration, launch) as the second beat, then the story,
  the CTA at the end. Put the "how to get it" line (comment keyword, link in bio, DM) on the offer card itself so the
  offer works before the CTA arrives.
- **Cold open**: open on the boldest 2-4 seconds (a contrarian claim with a stamp, a number, a result), then the
  usual hook. Make sure frame 0 already shows that beat's text (start its card a little before the cut point, and
  check that it does not leak into another segment that ends near there).
- **Short cut**: drop a middle section for a tighter version.
Cuts go in pauses; the same captions and sounds follow automatically.

## Review checklist

Run stills at every entrance, morph and dense moment:
- captions never over the mouth or cut by the seam; legible everywhere
- nothing in the safe zones, nothing clipped at the edges (long words at hero sizes, emoji at the right edge)
- each graphic lands on its word; nothing visible after its idea is over
- no empty panel for more than ~0.3s; no two sections' text overlapping
- fonts and emoji rendered (no fallback boxes), screenshots sharp
- the first frame works as a thumbnail
