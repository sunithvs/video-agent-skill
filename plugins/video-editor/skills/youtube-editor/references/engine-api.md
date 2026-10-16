# Engine API (reel/engine.js, landscape)

Same engine as the reel-editor skill, generalized to any stage size. Classic scripts, shared globals. `index.html`
loads `tmp/meta.js` (META: duration, faceFrames, fps, srcW, srcH), `tmp/cuts.js` (CUTS from jumpcuts.py or null),
`reel/engine.js`, then `edit.js`. **All times are source seconds** (the camera footage, as in the transcript);
`segments` decide what plays. Stage 1920x1080; positions are stage pixels.

## Contents
- Config, layouts, autoZoom
- Long-form helpers: chapter, chapterCard, lowerThird, fullVideo, fullImage, thumbnail, faceStill
- Timing: at, stagger, show, on, cue, atOut, cueOut, shake
- Components shared with reels
- Captions, springs, render API

## Config

```js
reel({
  name: 'my_video', width: 1920, height: 1080, duration: META.duration,
  face: { frames: META.faceFrames, srcW: META.srcW, srcH: META.srcH, focus: { x: 960, y: 420 }, headHeight: 420,
          pip: 'rect', fill: 'blur' },
  segments: CUTS ? CUTS.segments : null,
  theme: { accent: '#E8774F' },
  layouts: { MY_LAYOUT: { x, y, w, h, r, s, fx, fy, o } },
})
```

`focus`: point between the eyes and the chin (camera pixels). `headHeight`: hair top to chin; sizes the PIP and side
cards so the head is never cropped (measure on a still). `fill: 'blur'`: a blurred copy of a portrait frame fills
the stage behind the card. Captions default to one line position at the bottom (`captionY.FULL` 902).

## Layouts

| name | landscape camera | portrait phone camera |
|---|---|---|
| `FULL` | fills the frame | centered full-height card over the blurred fill |
| `PUNCH` | 1.18x zoom on the face | same card, zoomed 1.22x |
| `SIDE_L` / `SIDE_R` | face in a 780px strip, graphics on the other ~1140px | 540x960 card at the side, graphics beside |
| `CARD_L` / `CARD_R` | floating 760x800 rounded face card | 520x800 card |
| `PIP` | 512x288 card bottom-right with a drop shadow (whole camera frame) | 300x380 card, head fully inside |
| `OFF` | face shrinks into the PIP corner and fades out | same |

A layout is `{ x, y, w, h, r, s, fx, fy, o }`; every value springs, so any two morph. `o` is opacity.

`autoZoom({ except: [[a, b], ...], a: 'FULL', b: 'PUNCH', times })` returns layout keys that switch FULL/PUNCH at
every segment start (the jump cut) except inside your ranges. Use it as the base of `faceAt`:

```js
faceAt([...autoZoom({ except: [[120, 150]] }), [120, 'SIDE_L'], [150, 'FULL']])
```

Keys inside `except` are yours; put a key at the end of each range to hand back to autoZoom. At a cut, layout keys at
or before the segment start count as settled, so a cut lands on its layout instantly.

## Long-form helpers

| function | does |
|---|---|
| `chapter(t, title, { card, full, dur })` | registers a YouTube chapter (youtube.py writes the timestamps) and shows a chapter card at t (`card: false` for the intro); `full: true` covers the frame |
| `chapterCard(parent, num, title, { t, dur, full })` | the card on its own |
| `lowerThird(parent, name, title, { t, dur, x, y })` | accent bar + name + title, bottom left |
| `fullVideo({ t, tout, seq: { dir, count, from }, credit, zoom, fit })` | full-frame b-roll from a frames.sh sequence, behind the face; pair with `PIP` or `OFF` keys |
| `fullImage(src, { t, tout, zoom, pos, fit })` | full-frame still with a slow Ken Burns push, behind the face |
| `thumbnail(st => {...})` | builds the 1280x720 thumbnail (`render.mjs thumb`) in `st`; `faceStill(st, t, css)` adds the camera frame at source time t |
| `layerUnder(name?)` | a layer behind the face (backgrounds, windows the face plays inside) |
| `layer(name?, { from, to })` | a section above the face; the name labels its clip in the editor kit (`render.mjs kit`), `from`/`to` (source time) fix its range instead of the kit's per-frame scan |

## Timing

`at(el, tin, tout, o)`: show from tin to tout (null = to the end). Options `dy`, `dyOut`, `sc`, `rot`, `blur`,
`sin`/`sout` springs (`SPR.enter/exit/pop/snap/slam/morph/punch/line`), `base` transform, `cue` + `gain` +
`cueDelay` sound. `stagger(els, tin, step, tout, o)`. `on(fn)`: `fn(ts, t)` every frame (source / output time);
compute everything from ts. `cue(t, kind, gain)`: click key tick pop thunk stamp scratch success swish whoosh.
`atOut` / `cueOut`: same in output time. `shake(t0, amp, f)`.

## Components shared with reels

`label(parent, html, css)` (section label; landscape position top-left), `text(parent, html, { x, y, size, weight,
color, stretch, css })`, `chip`, `wallCard`, `imageCard(parent, src, { x, y, w, h })`, `browserCard(parent, { x, y,
w, h, url, seq })`, `terminal`, `codeCard`, `stamp`, `highlight`, `strike`, `iconGrid`, `streaks`, `emojiRise`,
`clawd(parent, { u })` (Claude Code mascot, `set()` / `idle()` / `handAt()`), `mascot`. Details and options are in
`references/components.md` (the reel engine's API; its layout and caption sections are vertical-only); positions
are stage pixels, so pass x/y for 1920x1080.

## Captions, springs, render API

`captions([[t0, t1, 'text *word*'], ...], { colors })` burns captions (only when asked; `CAPTIONS=1` at render).
`S(t, f, z)`, `pulse`, `track(keys)`, `clamp`, `lerp`, `smooth`. `window.seek(t)`, `window.timeline()` (name, size,
fps, duration, segments, chapters, cues, captions), `window.ready()`, `window.thumbMode()`. Editor kit
(`scripts/kit.mjs`): `?pass=background|face|graphics|captions[&section=<id>]` renders one layer (transparent except
background); `window.layers()`, `window.visibleSections()`, `window.sectionColors()`, `window.alphaWarnings()`.
`mix-blend-mode` / `backdrop-filter` above the face look plain in kit layers (nothing behind them); the kit lists them.
