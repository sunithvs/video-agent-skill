# Engine API (reel/engine.js)

Classic scripts, shared globals. `index.html` loads `tmp/meta.js` (`META.faceFrames`, `META.duration` from prep.sh),
`reel/engine.js`, then the project's `edit.js`. All times are seconds of `source/edit.mp4`. Stage is 1080x1920;
all positions are stage pixels.

## Contents
- Config: `reel`, `REEL`, `T`
- Variants and segments: `variants`, `atOut`, `cueOut`
- Face: `faceAt`, layouts
- Timing: `at`, `stagger`, `show`, `on`, `cue`, `shake`
- DOM: `layer`, `mk`, `img`, CSS classes
- Components
- Captions
- Springs and helpers
- Render API

## Config

```js
reel({
  name: 'my_reel',                  // output file out/my_reel.mp4
  duration: META.duration,          // or shorter to drop the tail
  face: { frames: META.faceFrames, focus: { x: 540, y: 820 }, headHeight: 600, pip: 'rect' },  // face: null = graphics only
  theme: { accent: '#7AA7FF' },     // merged into REEL.theme (T): ink muted accent orange green red yellow
  captionY: { SPLIT: 924 },         // caption top edge per layout
  layouts: { SIDE: {...} },         // add or replace face layouts
})
```

`focus` is the point that layouts keep framed: between the eyes and the chin, in source pixels. `headHeight` (top of
hair to chin, source px) sizes the picture-in-picture so the whole head fits. `pip`: `'rect'` (default, 300x340
rounded card), `'square'` (300x300) or `'circle'`; measure headHeight on a frame, an underestimate crops the hair. `T` is the theme object (`T.accent`, `T.ink`, ...).

## Variants and segments

```js
variants({
  v1: {},                                                     // as recorded
  v2: { segments: [[0, 5.8], [47.5, 53], [5.8, 47.45], [53, 57.1]] },
  v3: { segments: [...], cutSound: false, setup() { atOut(chip(L, 'NEW'), 0, 2); cueOut(0.1, 'pop') } },
})
```

Call it last in `edit.js`. The first key renders by default; `VARIANT=v2 node scripts/render.mjs ...` picks one and
`bash scripts/render_variants.sh` renders them all to `out/<name>_<key>.mp4`. A variant's `segments` are stretches of
source time in output order (also settable as `reel({ segments })` for a single re-cut). Output time t maps to source
time inside the segment holding t's frame; everything authored with source times (layouts, `at`, `on`, `cue`,
captions, face frames) follows. At each cut, layout keys at or before the segment start (+0.05s) count as settled, so
start a segment a frame after a key to open on that layout, or exactly on a key to show its morph. A swish plays on each
cut. `on(fn)` callbacks receive `(ts, t)`: source and output time. `atOut(el, tin, tout, o)` and `cueOut(t, kind)` time
variant-only extras in output time.

## Face

```js
faceAt([
  [-1, 'HOOK'],                 // starting layout (negative time)
  [2.0, 'SPLIT'],               // morph with SPR.morph
  [5.3, 'PUNCH', SPR.punch],    // optional spring per change
], { swish: true })             // a swish sound on every change (default)
```

Default layouts (computed from `focus`, always covering their container):

| name | what | container |
|---|---|---|
| `FULL` | face fills the frame | 0,0 1080x1920 |
| `HOOK` | zoom 1.25, face pushed down: room for a card at the top | full frame |
| `PUNCH` | zoom 1.14, emphasis beat | full frame |
| `SPLIT` | face in the bottom half with rounded top corners, graphics on top (y 0-960) | 0,960 1080x1010 |
| `PIP` | rounded card with a drop shadow, bottom center (300x340 at y 1090-1430; head and shoulders fully in frame) | graphics get the frame above y ~1060 |

A layout is `{ x, y, w, h, r, s, fx, fy }`: container rect and radius, scale `s`, and where the focus point lands
inside the container (`fx`, `fy`). Every parameter springs separately, so any two layouts morph smoothly.

## Timing

`at(el, tin, tout, o)` shows `el` from `tin` until `tout` (`null` = to the end). Returns `el`. Options:

| option | default | meaning |
|---|---|---|
| `dy` | 36 | enters from this many px below (negative = from above) |
| `dyOut` | -24 | leaves moving this many px |
| `sc` | 0.94 | starting scale (0.3-0.6 for pops) |
| `rot` | 0 | starting rotation, degrees |
| `blur` | 10 | blur while entering and leaving |
| `sin` / `sout` | `SPR.enter` / `SPR.exit` | entrance / exit springs (`SPR.pop`, `SPR.snap`, `SPR.slam` bounce) |
| `base` | '' | transform kept underneath, e.g. `'translateX(-50%)'` to center, `'rotate(-1.2deg)'` |
| `cue`, `gain`, `cueDelay` | | sound on entry (`'pop'`, `'click'`, `'tick'`...), at `tin + cueDelay` (0.1) |

`stagger(els, tin, step, tout, o)`: `at()` for each element, `step` seconds apart; `o.cue` plays per element.

`show(el, t, tin, tout, o)`: the function `at()` registers, for use inside your own `on()`.

`on(fn)`: `fn(t)` runs every frame, after the face and before captions. Use it for anything custom (a sweep, a
counter, a bounce): compute from `t` only.

`cue(t, kind, gain = 1)`: sound effect whose peak lands at `t`. Kinds: `click` (UI click), `key` (keyboard),
`tick` (small pop for list items), `pop` (cards, chips), `thunk` (heavy card landing), `stamp` (rubber stamp),
`scratch` (marker strike), `success` (two-note chime), `swish` (layout change), `whoosh` (speed lines).

`shake(t0, amp = 11, f = 9)`: decaying camera shake. Keep `f` under ~10.

## DOM

`layer(name?)`: a full-stage container for one section (above the face). `layerUnder(name?)`: same, drawn behind the
face (a background, a device frame or app window the face plays inside; pair it with a custom layout that puts the
face in the window). The name (`'hook'`, `'checklist'`) labels the section's clip in the editor kit; unnamed sections
are `section_<n>`. The kit finds when a section is on screen by scanning every frame; `layer('cta', { from: 50, to:
null })` (source time, null = the end) fixes the range instead. In kit layers there is nothing behind a section, so
`mix-blend-mode` draws as normal and `backdrop-filter` blurs nothing (`highlight()` switches to a plain fill there);
the kit lists any such element. `mk(tag, css, parent, html, cls)`: create an element. `img(src, css, parent, cls)`. `$('id')`.

CSS classes (`reel/engine.css`): `abs` (absolute), `disp` (display font, tight tracking), `mono` (mono uppercase
label style), `url` (no uppercase), `emoji`, `label` (section label position), `chip`, `icon` (rounded app icon with
shadow), `card` (rounded, hairline border, deep shadow), `code`. Fonts are `--font-display`, `--font-body`,
`--font-mono`; override them and the `--c-*` colors in `index.html`.

## Components

All return the element (time it with `at()`), unless noted.

| component | use |
|---|---|
| `label(parent, html)` | section label at the top: `'01 — <b>Topic</b>'` |
| `text(parent, html, { x, y, size, weight, color, stretch, css })` | display text line (nowrap) |
| `chip(parent, html, { bg, fg, size, weight, x, y, css })` | pill; put several in a flex row `mk('div','left:60px;top:290px;display:flex;gap:16px', L, null, 'abs')` |
| `wallCard(parent, html, { y, css })` | white card over the wall above the head (HOOK band, y 232); one or two short lines |
| `imageCard(parent, src, { x, y, w, h, fit, pos, bg })` | screenshot / photo in a card; `.img` is the image |
| `browserCard(parent, { x, y, w, h, url, seq: { dir, count, from, at, digits }, zoom })` | browser window playing a frames.sh sequence; `from` = seconds into the sequence at time `at` |
| `terminal(parent, { x, y, w, h, title, prompt, tIn, typeDur, steps: [[text, dim, t]], size })` | terminal window: the prompt types from `tIn`, steps appear on their times (text starting with `✓` = green done line); time the card with `at()` |
| `stamp(parent, html, { x, y, color, size, rot, t, tout, shakeAmp })` | slams in at `t` with a shake and sound; times itself |
| `highlight(parent, { x, y, w, h, t, color, bar })` | marker sweep (e.g. over a post's key line); times itself |
| `strike(el, t, color)` | strike-through across `el`'s first text node; times itself |
| `codeCard(parent, { x, y, w, h, file, lines, tIn, tEnd })` | editor that types `lines` (`[[[text, color], ...], ...]`) from `tIn` to `tEnd`, with key sounds |
| `iconGrid(parent, [{ src, name }], { x, y, cols, size, cellW, cellH })` | returns cell elements: `stagger()` them |
| `streaks(parent, { y, count, t, dur })` | speed lines across a band at `t`, with a whoosh; times itself |
| `emojiRise(parent, emojis, { t0, step, x, spread, from, to, dur, size })` | emoji floating up like live reactions (comment CTAs); times itself |
| `clawd(parent, { u, color })` | **Clawd, the Claude Code mascot**, pixel-exact from the CLI block art (`u` = pixel width, pixels are 2u tall; u 20 = 360x200). No timing: drive it with `c.set({ x, y, s, rot, squash, blink, armL, armR, step, open, scissors, opacity })` in `on()`. `x, y` = between its feet. Arm poses -1 down, 0 out, 1 diagonal up, 2 up. `c.idle(t)` gives `{ bob, blink }`; `c.handAt(x, y, s, 'L'/'R', pose)` is where a hand is (pure, for things it holds or throws). Use it for reels about Claude / Claude Code |
| `mascot(parent, { color, dark, light, spark })` | original cartoon character (gumdrop with a spark antenna, scissors) for other topics; same `set()` / `idle()` idea with `x, y` = body center, `armL` positive / `armR` negative raise the arms, `mouth`, `look`, `antenna` |

For a JPEG sequence anywhere else: `on(t => setSrc(imgEl, seqFrame('tmp/name', t - startTime, count)))`.

## Captions

```js
captions([[0.1, 2.0, 'The complete Adobe suite'], [2.0, 3.7, 'rebuilt in *Rust*']], { colors: { Rust: T.orange } })
```

`*word*` is colored (`colors[word]` or the accent). Captions follow the face layout (`REEL.captionY`): chest height
in FULL/PUNCH/PIP, on the seam in SPLIT. `?captions=0` in the preview or `CAPTIONS=0` when rendering hides them.

## Springs and helpers

`S(t, f, z)` spring step 0 to 1 (`f` Hz, `z` damping, < 1 overshoots). `pulse(t, f)` one-shot bump.
`track([[t, value, spring], ...])` value that springs to each new target (first key = resting value). `SPR`:
`morph punch enter exit pop snap slam line`. `clamp`, `lerp`, `smooth`.

## Render API

`window.seek(t)` (returns a promise that resolves once frame images are decoded), `window.timeline()`
(`{ name, fps, duration, cues, captions }`, captions as `[start, end, text]` in output time), `window.ready()`,
`window.configure({ captions })`. Editor kit (`scripts/kit.mjs`): `?pass=background|face|graphics|captions`
(`&section=<id>` for one section, `&matte=green|black` to preview a pass on a colour) renders one layer, transparent
for face / graphics / captions; `window.layers()` (sections, segments), `window.visibleSections()`,
`window.sectionColors()`, `window.alphaWarnings()` after a seek. Preview: open `index.html`
directly; click to play with `audio/mix.wav`; `?t=12.3` freezes a frame.
