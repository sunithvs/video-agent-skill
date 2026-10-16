// Reel engine: one 1080x1920 stage where every style is a pure function of time, seek(t).
// No CSS transitions, timers or state carried between frames: the renderer jumps to arbitrary times in parallel.
//
// Load order in index.html: reel/engine.css, reel/engine.js, then the project's edit.js, which
//   1. calls reel({...}) with duration, face frames and focus point
//   2. calls faceAt([...]) with the layout timeline
//   3. builds sections with layer()/mk()/components and times them with at()/on()/cue()
//   4. calls captions([...])
// See references/engine-api.md in the reel-editor skill for the full API.

// ---------- springs ----------
// closed-form step response of a damped spring, 0 -> 1. f in Hz, z = damping ratio (< 1 overshoots)
function S(t, f, z) {
  if (t <= 0) return 0
  const w = 2 * Math.PI * f
  if (z >= 1) return 1 - Math.exp(-w * t) * (1 + w * t)
  const wd = w * Math.sqrt(1 - z * z)
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t))
}
// one-shot bump peaking at 1 after 1/(2*pi*f) seconds, then decaying to 0
function pulse(t, f) {
  if (t <= 0) return 0
  const x = 2 * Math.PI * f * t
  return x * Math.exp(1 - x)
}
const SPR = {
  morph: { f: 2.1, z: 0.84 }, // face layout changes
  punch: { f: 4.2, z: 0.82 }, // punch-in zooms
  enter: { f: 3.2, z: 1 }, // default entrance
  exit: { f: 7, z: 1 }, // default exit: fast so swapped content never overlaps
  pop: { f: 3.4, z: 0.6 }, // bouncy pop-in
  snap: { f: 3, z: 0.72 },
  slam: { f: 4.4, z: 0.48 }, // stamps, cards landing
  line: { f: 2.6, z: 1 }, // wipes, strike-throughs, highlights
}
// a value that changes target many times is the sum of one spring per change; the first key is the resting value.
// settle: keys at or before this time count as finished (used at segment cuts so a jump cut lands on settled values)
function track(keys, def = SPR.morph) {
  const ks = keys.map(([t, v, s]) => [t, v, s || def]).sort((a, b) => a[0] - b[0])
  const deltas = ks.map((k, i) => (i ? k[1] - ks[i - 1][1] : 0))
  return (t, settle = -Infinity) => {
    let v = ks[0][1]
    for (let i = 1; i < ks.length; i++) if (deltas[i]) v += deltas[i] * (ks[i][0] <= settle ? 1 : S(t - ks[i][0], ks[i][2].f, ks[i][2].z))
    return v
  }
}
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const lerp = (a, b, p) => a + (b - a) * p
const smooth = (p) => { p = clamp(p); return p * p * (3 - 2 * p) }

// ---------- config ----------
const REEL = {
  name: 'reel',
  fps: 30,
  duration: 30,
  width: 1080,
  height: 1920,
  // talking head as a JPEG sequence (scripts/prep.sh). focus = a point between the eyes and the chin in source pixels,
  // headHeight = hair top to chin in source pixels. pip: 'rect' (default, portrait rounded rect), 'square' or 'circle';
  // the head fills about 60% of the pip so hair and chin are never cropped. face: null renders graphics only.
  face: { dir: 'tmp/face', frames: 0, digits: 5, focus: { x: 540, y: 820 }, headHeight: 600, pip: 'rect' },
  theme: { ink: '#0E0E11', muted: '#8B8B96', accent: '#7AA7FF', orange: '#FF6A2B', green: '#2BD47D', red: '#FF4747', yellow: '#FFD23F' },
  // caption top edge per layout: over the chest in full/pip, on the seam in split so it never crosses the mouth
  captionY: { FULL: 1446, HOOK: 1446, PUNCH: 1446, PIP: 1458, SPLIT: 924 },
  // [[in, out], ...] stretches of source time in output order (re-cut without touching edit.js times); null = as recorded
  segments: null,
  variant: null,
}
const T = REEL.theme
let LAYOUTS = {}

function reel(o = {}) {
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && REEL[k] && typeof REEL[k] === 'object') Object.assign(REEL[k], v)
    else REEL[k] = v
  }
  if (REEL.face) LAYOUTS = Object.assign(defaultLayouts(), o.layouts || {})
  buildSegments()
  return REEL
}

// ---------- segments and variants ----------
// Everything in edit.js is authored in source time (seconds of source/edit.mp4). Segments re-cut it: output time t maps
// to source time ts inside the segment that holds t's frame. Graphics, captions, face frames and sound cues follow.
let SEGS = null
function buildSegments() {
  if (!REEL.segments) { SEGS = null; return }
  let at = 0
  SEGS = REEL.segments.map(([a, b]) => { const sg = { in: a, out: b, at }; at += b - a; return sg })
  REEL.duration = +at.toFixed(4)
}
function toSource(t) {
  if (!SEGS) return { ts: t, seg: null }
  // pick the segment by the frame this time belongs to, so every subframe of a frame stays in one segment
  const k = Math.round(t * REEL.fps) / REEL.fps
  let seg = SEGS[SEGS.length - 1]
  for (const sg of SEGS) if (k < sg.at + (sg.out - sg.in) - 1e-6) { seg = sg; break }
  return { ts: seg.in + (t - seg.at), seg }
}
// Several cuts of the same edit (A/B hooks, Instagram trial reels). The first key is the default; render one with
// VARIANT=<key> node scripts/render.mjs ... or all with bash scripts/render_variants.sh. Output: <name>_<key>.mp4
//   variants({ v1: {}, v2: { segments: [[0, 5.8], [47.5, 53], [5.8, 47.45]], setup() { ...atOut / cueOut extras } } })
// Start segments a frame or two after a layout key that should already be in place, or exactly on a key to show the
// morph after the cut. A swish plays on every cut (cutSound: false to drop it).
const VARIANT_PARAM = new URLSearchParams(location.search).get('variant')
function variants(map) {
  const keys = Object.keys(map)
  const key = VARIANT_PARAM && map[VARIANT_PARAM] ? VARIANT_PARAM : keys[0]
  const v = map[key]
  REEL.variant = key
  REEL.variants = keys
  REEL.name = `${REEL.name}_${key}`
  REEL.segments = v.segments || null
  buildSegments()
  if (SEGS && v.cutSound !== false) SEGS.slice(1).forEach((sg) => cueOut(sg.at + 0.02, 'swish', 0.6))
  if (v.setup) v.setup()
}

// Face layouts: container rect (x, y, w, h, r) plus where the focus point lands inside it (fx, fy) at scale s.
// fx/fy are clamped so the frame always covers its container (no empty edges during or after a morph).
function defaultLayouts() {
  const W = REEL.width, H = REEL.height, f = REEL.face.focus
  const cover = (w, h, s, fx, fy) => ({
    fx: clamp(fx, w - (W - f.x) * s, f.x * s),
    fy: clamp(fy, h - (H - f.y) * s, f.y * s),
  })
  const full = (s, dy = 0) => ({ x: 0, y: 0, w: W, h: H, r: 0, s, ...cover(W, H, s, W / 2, f.y + dy) })
  const splitH = H / 2 + 50 // runs past the bottom edge so the rounded corners stay off screen
  // pip: the head (headHeight) takes ~62% of the box height, its top sits ~16% down, so nothing gets cropped
  const shape = REEL.face.pip || 'rect'
  const PW = shape === 'rect' ? 300 : 300, PH = shape === 'rect' ? 340 : 300, PR = shape === 'circle' ? 150 : 40
  const ps = (PH * 0.62) / REEL.face.headHeight
  return {
    FULL: full(1),
    HOOK: full(1.25, 180), // zoomed, face pushed down to leave the top for a card
    PUNCH: full(1.14, 40),
    SPLIT: { x: 0, y: H / 2, w: W, h: splitH, r: 56, s: 1, ...cover(W, splitH, 1, W / 2, 380) },
    PIP: { x: (W - PW) / 2, y: 1090, w: PW, h: PH, r: PR, s: ps, fx: PW / 2, fy: PH * 0.16 + 0.56 * REEL.face.headHeight * ps },
  }
}

// ---------- DOM ----------
const $ = (id) => document.getElementById(id)
function mk(tag, css, parent, html, cls) {
  const e = document.createElement(tag)
  if (css) e.style.cssText = css
  if (cls) e.className = cls
  if (html != null) e.innerHTML = html
  ;(parent || $('layers')).appendChild(e)
  return e
}
function img(src, css, parent, cls) {
  const i = mk('img', css, parent, null, cls)
  if (src) i.src = src
  return i
}
// Sections. layer(name?) is a full-stage container for one section, above the face; layerUnder(name?) is drawn behind
// the face (backgrounds, device frames and app windows the face sits inside). The name labels the section's clip in
// the editor kit (render.mjs kit): 'hook', 'checklist' ... (unnamed: section_<n>). The kit finds when a section is on
// screen by itself; { from, to } in source time (to: null = the end) overrides that: layer('cta', { from: 50 }).
const SECTIONS = []
function section(parent, under, name, o = {}) {
  if (name && typeof name === 'object') { o = name; name = null }
  let id = String(name || `section_${SECTIONS.length + 1}`).replace(/[^\w-]+/g, '_')
  if (SECTIONS.some((s) => s.id === id)) id += `_${SECTIONS.length + 1}`
  const el = mk('div', '', $(parent), null, 'layer')
  el.dataset.section = id
  const fixed = 'from' in o || 'to' in o ? [o.from ?? 0, o.to ?? null] : null
  SECTIONS.push({ id, name: name || null, under, el, fixed })
  return el
}
const layer = (name, o) => section('layers', false, name, o)
const layerUnder = (name, o) => section('under', true, name, o)

document.body.insertAdjacentHTML('afterbegin', `
<div id="stage">
  <div id="cam"><div id="bg"></div><div id="under" class="layer"></div><div id="face"><img id="faceImg" /></div><div id="layers"></div></div>
  <div id="caps" class="layer"></div>
</div>`)

// ---------- per-frame registry ----------
const UPDATES = []
const CUES = []
const CUES_OUT = []
// fn(ts, t) every frame: ts = source time (what edit.js times use), t = output time (after segment re-cuts)
const on = (fn) => { UPDATES.push(fn); return fn }
// sound effect whose peak lands at source time t. kinds (scripts/mix_audio.py): click key tick pop thunk stamp scratch success swish whoosh
const cue = (t, kind, gain = 1) => CUES.push({ t: +t.toFixed(4), kind, gain })
// same, in output time (variant extras)
const cueOut = (t, kind, gain = 1) => CUES_OUT.push({ t: +t.toFixed(4), kind, gain })

// ---------- appear / leave ----------
// a = entrance spring from tin, b = exit spring from tout. dy/sc/rot/blur are where the element comes from.
function show(el, t, tin, tout, o = {}) {
  const { dy = 36, dyOut = -24, sc = 0.94, blur = 10, rot = 0, sin = SPR.enter, sout = SPR.exit, base = '' } = o
  const a = S(t - tin, sin.f, sin.z)
  const b = tout == null ? 0 : S(t - tout, sout.f, sout.z)
  const op = clamp(Math.min(a, 1) - b)
  el.style.opacity = op.toFixed(4)
  el.style.visibility = op < 0.003 ? 'hidden' : 'visible'
  if (op < 0.003) return 0
  const bl = (1 - clamp(a)) * blur + b * blur
  el.style.filter = bl > 0.05 ? `blur(${bl.toFixed(2)}px)` : 'none'
  el.style.transform = `${base} translateY(${((1 - a) * dy + b * dyOut).toFixed(2)}px) scale(${(lerp(sc, 1, a) + 0.04 * b).toFixed(4)}) rotate(${((1 - a) * rot).toFixed(2)}deg)`
  return op
}
// time an element: visible from tin to tout (null = until the end), optional sound on entry
function at(el, tin, tout, o = {}) {
  on((t) => show(el, t, tin, tout, o))
  if (o.cue) cue(tin + (o.cueDelay ?? 0.1), o.cue, o.gain ?? 1)
  return el
}
// same as at() but in output time: for variant-only extras that belong to the cut, not to the source
function atOut(el, tin, tout, o = {}) {
  on((ts, t) => show(el, t, tin, tout, o))
  if (o.cue) cueOut(tin + (o.cueDelay ?? 0.1), o.cue, o.gain ?? 1)
  return el
}
// time a list of elements one after another
function stagger(els, tin, step, tout, o = {}) {
  els.forEach((el, i) => at(el, tin + step * i, tout == null ? null : tout + 0.008 * i, { ...o, cue: undefined }))
  if (o.cue) els.forEach((_, i) => cue(tin + step * i + 0.1, o.cue, o.gain ?? 0.6))
  return els
}

// ---------- face ----------
let FACE = null
// keys: [[t, 'LAYOUT', spring?], ...]; the first key is the starting layout (use a negative time)
function faceAt(keys, { swish = true } = {}) {
  FACE = { keys }
  for (const p of ['x', 'y', 'w', 'h', 'r', 's', 'fx', 'fy']) FACE[p] = track(keys.map(([t, n, s]) => [t, LAYOUTS[n][p], s]))
  FACE.capY = track(keys.map(([t, n, s]) => [t, REEL.captionY[n] ?? 1446, s]))
  if (swish) keys.slice(1).forEach(([t]) => cue(t + 0.12, 'swish'))
}

// ---------- frame sequences ----------
let pending = []
function setSrc(el, src) {
  if (el.dataset.src === src) return
  el.dataset.src = src
  el.src = src
  pending.push(el.decode().catch(() => {}))
}
const pad = (n, w) => String(n).padStart(w, '0')
// frame of a JPEG sequence at local time tl (seconds from the sequence's first frame)
const seqFrame = (dir, tl, count, digits = 4, fps = REEL.fps) => `${dir}/${pad(clamp(Math.round(tl * fps), 0, count - 1), digits)}.jpg`

// ---------- camera ----------
const SHAKES = []
// short decaying shake of the whole frame. keep the frequency under ~10 Hz or 30fps aliases it into a jitter
const shake = (t0, amp = 11, f = 9) => SHAKES.push({ t0, amp, f })

// ---------- components ----------
const dots = () => `<div class="dots">${['#FF5F57', '#FEBC2E', '#28C840'].map((c) => `<div style="background:${c}"></div>`).join('')}</div>`
// small uppercase section label at the top of the panel area ("01 — <b>Topic</b>")
const label = (parent, html, css = '') => mk('div', css, parent, html, 'abs mono label')
// pill. o: bg, fg, size, weight, x, y, css
function chip(parent, html, o = {}) {
  const { bg = '#fff', fg = T.ink, size = 46, weight = 800, x, y, css = '' } = o
  const pos = x != null ? `position:absolute;left:${x}px;top:${y}px;` : ''
  return mk('div', `${pos}background:${bg};color:${fg};font-size:${size}px;font-weight:${weight};${css}`, parent, html, 'chip disp')
}
// display text. o: x, y, size, weight, color, stretch, css
function text(parent, html, o = {}) {
  const { x = 70, y = 280, size = 76, weight = 720, color = '#fff', stretch = 100, css = '' } = o
  return mk('div', `left:${x}px;top:${y}px;font-size:${size}px;font-weight:${weight};color:${color};font-stretch:${stretch}%;white-space:nowrap;${css}`, parent, html, 'abs disp')
}
// rounded card holding an image (screenshot, tweet, hero shot)
function imageCard(parent, src, o = {}) {
  const { x = 90, y = 474, w = 900, h = 420, bg = '#000', fit = 'cover', pos = '50% 0%', radius = 28, css = '' } = o
  const c = mk('div', `left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${bg};border-radius:${radius}px;${css}`, parent, null, 'abs card')
  c.img = img(src, `left:0;top:0;width:${w}px;height:${h}px;object-fit:${fit};object-position:${pos}`, c, 'abs')
  return c
}
// browser window playing a JPEG sequence (scripts/frames.sh). seq: { dir, count, digits, from (seconds into the
// sequence at time `at`), at }. Plays only while visible.
function browserCard(parent, o = {}) {
  const { x = 40, y = 418, w = 1000, h = 590, url = '', seq, zoom = 0.012 } = o
  const c = mk('div', `left:${x}px;top:${y}px;width:${w}px;height:${h + 52}px;background:#1B1B21`, parent, null, 'abs card')
  mk('div', 'left:26px;top:20px', c, dots(), 'abs')
  if (url) mk('div', `left:${w / 2 - 200}px;top:10px;width:400px;height:34px;border-radius:17px;background:#26262E;color:#B4B4BE;font-size:19px;line-height:34px;text-align:center`, c, url, 'abs mono url')
  const wrap = mk('div', `left:0;top:52px;width:${w}px;height:${h}px;overflow:hidden;background:#000`, c, null, 'abs')
  c.img = img('', `left:0;top:0;width:${w}px;height:${h}px;object-fit:cover;transform-origin:50% 40%`, wrap, 'abs')
  if (seq) {
    on((t) => {
      if (c.style.visibility === 'hidden') return
      const tl = seq.from + (t - seq.at)
      setSrc(c.img, seqFrame(seq.dir, tl, seq.count, seq.digits ?? 4))
      c.img.style.transform = `scale(${(1 + zoom * Math.max(0, t - seq.at)).toFixed(4)})`
    })
  }
  return c
}
// rubber stamp that slams in at t and leaves at tout, with a camera shake. html: text (emoji allowed)
function stamp(parent, html, o = {}) {
  const { x = 540, y = 468, color = T.red, size = 86, rot = -6, t, tout = null, shakeAmp = 11 } = o
  const wrap = mk('div', `left:${x}px;top:${y}px;width:0;height:0`, parent, null, 'abs')
  mk('div', `left:0;top:0;transform:translate(-50%,-50%);padding:6px 34px 10px;border:8px solid ${color};border-radius:22px;background:rgba(255,255,255,0.96);color:${color};font-size:${size}px;font-weight:900;font-stretch:112%;white-space:nowrap;box-shadow:0 30px 70px -20px rgba(0,0,0,0.55)`, wrap, html, 'abs disp')
  on((tt) => {
    const a = S(tt - t, SPR.slam.f, SPR.slam.z), b = tout == null ? 0 : S(tt - tout, SPR.exit.f, SPR.exit.z)
    const op = clamp(clamp((tt - t) / 0.06) - b)
    wrap.style.opacity = op
    wrap.style.visibility = op < 0.003 ? 'hidden' : 'visible'
    wrap.style.transform = `rotate(${rot}deg) scale(${(lerp(2.3, 1, a) + 0.06 * b).toFixed(4)})`
    wrap.style.filter = b > 0.01 ? `blur(${(10 * b).toFixed(2)}px)` : 'none'
  })
  if (shakeAmp) shake(t, shakeAmp)
  cue(t + 0.03, 'stamp')
  return wrap
}
// marker sweep across a region of a card (e.g. the key line of a tweet). starts at t
function highlight(parent, o = {}) {
  const { x, y, w, h = 46, t, color = 'rgba(255,210,63,0.30)', bar = '#FFD23F' } = o
  const hi = mk('div', `left:${x}px;top:${y}px;height:${h}px;border-radius:8px;background:${color};${ALPHA_PASS ? '' : 'mix-blend-mode:screen'}`, parent, null, 'abs')
  const ln = bar ? mk('div', `left:${x + 2}px;top:${y + h - 3}px;height:5px;border-radius:3px;background:${bar}`, parent, null, 'abs') : null
  on((tt) => {
    const ww = w * clamp(S(tt - t, 1.9, 1))
    hi.style.width = ww + 'px'
    if (ln) ln.style.width = ww + 'px'
  })
  cue(t + 0.1, 'swish', 0.5)
  return hi
}
// width of an element's first text node in stage pixels, ignoring its own transform and the preview scale
function textWidth(el) {
  const tr = el.style.transform
  el.style.transform = 'none'
  const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
  let w = el.offsetWidth
  if (node) {
    const r = document.createRange()
    r.selectNodeContents(node)
    w = r.getBoundingClientRect().width / ($('stage').getBoundingClientRect().width / REEL.width)
  }
  el.style.transform = tr
  return w
}
// red strike-through drawn across an element's first text node (old name -> new name), starting at t
function strike(el, t, color = T.red) {
  const s = mk('div', `left:0;top:50%;height:5px;border-radius:3px;background:${color}`, el, null, 'abs')
  on((tt) => {
    if (!el._w) el._w = textWidth(el)
    s.style.width = el._w * clamp(S(tt - t, 3.2, 1)) + 'px'
  })
  cue(t + 0.12, 'scratch', 0.6)
  return s
}
// editor window that types code. lines: [[[text, color], ...], ...]. typing runs from tIn to tEnd
function codeCard(parent, o = {}) {
  const { x = 60, y = 470, w = 960, h = 620, file = 'main.rs', dot = T.orange, lines, tIn, tEnd, caret = T.accent, keyGain = 0.45 } = o
  const c = mk('div', `left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:#15151A`, parent, null, 'abs card')
  mk('div', 'left:0;top:0;right:0;height:58px;background:#1D1D24', c, null, 'abs')
  mk('div', 'left:26px;top:22px', c, dots(), 'abs')
  mk('div', 'left:120px;top:0;height:58px;padding:0 26px;background:#15151A;color:#D8D8E0;font-size:21px;line-height:58px', c, `<span style="color:${dot}">●</span>&nbsp; ${file}`, 'abs mono url')
  const body = mk('div', 'left:46px;top:96px', c, '', 'abs code')
  const chars = []
  let raw = 0
  lines.forEach((line, li) => {
    for (const [txt, col] of line) for (const ch of txt) { chars.push({ li, col, ch, raw }); raw += ch === ' ' ? 0.6 : 1 }
    raw += 5 // pause at the end of each line
  })
  for (const ch of chars) ch.t = tIn + (ch.raw / raw) * (tEnd - tIn)
  chars.forEach((ch, i) => { if (ch.ch !== ' ' && i % 2 === 0) cue(ch.t, 'key', keyGain) })
  let shown = -1, shownCaret = null
  on((t) => {
    let n = 0
    while (n < chars.length && chars[n].t <= t) n++
    const caretOn = n < chars.length || Math.floor(t * 2.4) % 2 === 0
    if (n === shown && caretOn === shownCaret) return
    shown = n; shownCaret = caretOn
    const out = lines.map(() => '')
    const last = n > 0 ? chars[n - 1].li : 0
    for (let i = 0; i < n; i++) out[chars[i].li] += `<span style="color:${chars[i].col}">${chars[i].ch === '<' ? '&lt;' : chars[i].ch}</span>`
    if (caretOn) out[last] += `<span style="display:inline-block;width:4px;height:42px;vertical-align:-9px;background:${caret}"></span>`
    body.innerHTML = out.join('\n')
  })
  return c
}
// grid of app icons with labels. items: [{ src, name }]. returns the cell elements (time them with stagger)
function iconGrid(parent, items, o = {}) {
  const { x = 120, y = 394, cols = 4, size = 116, cellW = 210, cellH = 170, labelSize = 22 } = o
  return items.map((it, i) => {
    const g = mk('div', `left:${x + (i % cols) * cellW}px;top:${y + Math.floor(i / cols) * cellH}px;width:${cellW}px;text-align:center`, parent, null, 'abs')
    img(it.src, `width:${size}px;height:${size}px`, g, 'icon')
    if (it.name) mk('div', `font-size:${labelSize}px;font-weight:600;color:#C9C9D1;margin-top:6px`, g, it.name)
    return g
  })
}
// speed lines sweeping left to right across a band, starting at t
function streaks(parent, o = {}) {
  const { y = 708, count = 7, t, dur = 0.42 } = o
  const els = Array.from({ length: count }, (_, i) => mk('div', `top:${y + i * 16}px;height:${3 + (i % 3)}px;width:${180 + ((i * 97) % 160)}px;border-radius:3px;background:rgba(255,255,255,0.85)`, parent, null, 'abs'))
  on((tt) => els.forEach((el, i) => {
    const p = clamp((tt - t - i * 0.028) / dur)
    el.style.left = lerp(-420, REEL.width + 100, smooth(p)) + 'px'
    el.style.opacity = p > 0 && p < 1 ? 0.9 * Math.sin(Math.PI * p) : 0
  }))
  cue(t + 0.08, 'whoosh')
  return els
}

// white card over the wall above the head. In HOOK the band from y 230 down to the hair is free (about 180px for a
// centered selfie; check with a still); keep wall cards to one or two short lines
function wallCard(parent, html, o = {}) {
  const { y = 232, css = '' } = o
  return mk('div', `left:70px;top:${y}px;width:940px;padding:24px 36px 28px;box-sizing:border-box;border-radius:32px;background:#fff;color:${T.ink};box-shadow:0 30px 80px -24px rgba(0,0,0,0.55);${css}`, parent, html, 'abs')
}
// terminal window: `prompt` types from tIn over typeDur seconds, then each step [text, dim text, t] appears with a
// tick; a step whose text starts with '✓' is drawn green with a success chime. Time the card itself with at()
function terminal(parent, o = {}) {
  const { x = 60, y = 390, w = 960, h = 590, title = 'claude', prompt = '', tIn, typeDur = 0.85, steps = [], size = 31, accent = T.accent } = o
  const c = mk('div', `left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:#141413`, parent, null, 'abs card')
  mk('div', 'left:0;top:0;right:0;height:58px;background:#1E1E1C', c, null, 'abs')
  mk('div', 'left:26px;top:22px', c, dots(), 'abs')
  mk('div', 'left:0;right:0;top:0;height:58px;line-height:58px;text-align:center;color:#9A9A92;font-size:21px', c, title, 'abs mono url')
  const pr = mk('div', `left:36px;top:96px;font-size:${size}px;color:#F3EFE6;white-space:pre`, c, '', 'abs mono url')
  const end = tIn + typeDur
  on((t) => {
    const n = Math.round(clamp((t - tIn) / typeDur) * prompt.length)
    const caret = t < end + 0.1 ? `<span style="display:inline-block;width:14px;height:${size + 4}px;vertical-align:-6px;background:${accent}"></span>` : ''
    pr.innerHTML = `<span style="color:${accent}">&gt;</span> ${prompt.slice(0, n).replace(/</g, '&lt;')}${caret}`
  })
  for (let i = 0; i < prompt.length; i += 2) cue(tIn + (i / prompt.length) * typeDur, 'key', 0.4)
  steps.forEach(([a, b, t], i) => {
    const done = a.startsWith('✓')
    const el = mk('div', `left:36px;top:${96 + (i + 1) * (size * 2.45)}px;font-size:${size}px;white-space:nowrap;color:${done ? '#7BD88F' : '#F3EFE6'}`, c,
      `${done ? '' : `<span style="color:${accent}">⏺</span>&nbsp; `}${a}${b ? `<span style="color:#8C8A82"> · ${b}</span>` : ''}`, 'abs mono url')
    at(el, t, null, { dy: 16, sc: 1, blur: 4, cue: done ? 'success' : 'tick', gain: done ? 0.7 : 0.6 })
  })
  return c
}
// emoji floating up like live reactions, one every `step` seconds from t0. Keep x left of the platform buttons (< 900)
function emojiRise(parent, emojis, o = {}) {
  const { t0, step = 0.38, x = 690, spread = 140, from = 1500, to = 620, dur = 2.6, size = 84, gain = 0.35 } = o
  emojis.forEach((e, i) => {
    const el = mk('div', `left:0;top:0;font-size:${size}px`, parent, e, 'abs emoji')
    const ts = t0 + step * i, xi = x + ((i * 53) % spread)
    on((t) => {
      const p = (t - ts) / dur
      const v = p > 0 && p < 1
      el.style.visibility = v ? 'visible' : 'hidden'
      if (!v) return
      el.style.opacity = Math.min(1, p * 6, (1 - p) * 3)
      el.style.transform = `translate(${(xi + 26 * Math.sin(p * 6 + i)).toFixed(1)}px, ${lerp(from, to, p).toFixed(1)}px) scale(${(0.6 + 0.5 * S(t - ts, 3, 0.6)).toFixed(3)})`
    })
    if (gain) cue(ts + 0.05, 'pop', gain)
  })
}

// Cartoon mascot: a chubby gumdrop with a spark antenna, big eyes, arms and a pair of scissors (an original character;
// recolor with `color` / `dark` / `spark` to match the topic). It has no timing of its own: call m.set({...}) from
// on(t => ...). m.idle(t) gives a bob and blinks. Origin (x, y) is the body center; feet are 100*s below it.
//   s         scale (1 = about 240x300 px)    rot     tilt, degrees      squash  0..1 squash toward the feet
//   blink     0..1                            look    [dx, dy] pupils, about -6..6
//   armL/armR arm rotation, degrees: positive raises the left arm, negative raises the right arm (the scissors hand)
//   open      scissor blades, degrees (0 = closed)    scissors  false hides them
//   mouth     'smile' | 'open' | 'o'          opacity
function mascot(parent, o = {}) {
  const { color = '#E8774F', dark = '#B8532F', light = '#F49A76', spark = '#FFE2CC', blade = '#E9E9EE', handle = '#3D5AFE' } = o
  const el = mk('div', 'left:0;top:0;width:240px;height:300px;transform-origin:120px 270px', parent, `
<svg width="240" height="300" viewBox="-120 -170 240 300" style="overflow:visible">
  <ellipse cx="-34" cy="98" rx="26" ry="13" fill="${dark}"/><ellipse cx="34" cy="98" rx="26" ry="13" fill="${dark}"/>
  <g class="armL" transform="translate(-74 18)"><path d="M0 0 Q -28 8 -46 32" stroke="${dark}" stroke-width="14" stroke-linecap="round" fill="none"/><circle cx="-46" cy="32" r="13" fill="${color}"/></g>
  <g class="armR" transform="translate(74 18)"><path d="M0 0 Q 28 8 46 32" stroke="${dark}" stroke-width="14" stroke-linecap="round" fill="none"/><circle cx="46" cy="32" r="13" fill="${color}"/>
    <g class="sc" transform="translate(52 30) rotate(-24)">
      <g class="b1"><path d="M0 -2 L70 -11 L70 -2 L0 3 Z" fill="${blade}"/><circle cx="-17" cy="-10" r="11" fill="none" stroke="${handle}" stroke-width="6"/></g>
      <g class="b2"><path d="M0 2 L70 11 L70 2 L0 -3 Z" fill="${blade}"/><circle cx="-17" cy="10" r="11" fill="none" stroke="${handle}" stroke-width="6"/></g>
      <circle r="5" fill="#55555E"/>
    </g></g>
  <g class="ant"><path d="M0 -92 Q 6 -112 2 -128" stroke="${dark}" stroke-width="7" stroke-linecap="round" fill="none"/>
    <path transform="translate(2 -142)" d="M0 -22 C3 -6 6 -3 22 0 C6 3 3 6 0 22 C-3 6 -6 3 -22 0 C-6 -3 -3 -6 0 -22Z" fill="${spark}" stroke="${color}" stroke-width="3"/></g>
  <path d="M -82 58 C -88 -36 -52 -96 0 -96 C 52 -96 88 -36 82 58 C 78 96 -78 96 -82 58 Z" fill="${color}"/>
  <path d="M -54 66 C -50 88 50 88 54 66 C 40 80 -40 80 -54 66 Z" fill="${light}" opacity="0.8"/>
  <ellipse cx="-38" cy="-62" rx="16" ry="9" fill="#fff" opacity="0.28" transform="rotate(-28 -38 -62)"/>
  <ellipse cx="-50" cy="12" rx="13" ry="8" fill="#FF8E78" opacity="0.7"/><ellipse cx="50" cy="12" rx="13" ry="8" fill="#FF8E78" opacity="0.7"/>
  <g class="eyes"><ellipse cx="-27" cy="-22" rx="16" ry="21" fill="#fff"/><ellipse cx="27" cy="-22" rx="16" ry="21" fill="#fff"/>
    <g class="pl"><circle cx="-25" cy="-18" r="9.5" fill="#17171C"/><circle cx="-21" cy="-23" r="3" fill="#fff"/></g>
    <g class="pr"><circle cx="29" cy="-18" r="9.5" fill="#17171C"/><circle cx="33" cy="-23" r="3" fill="#fff"/></g>
    <rect class="lid" x="-46" y="-45" width="92" height="0" fill="${color}"/></g>
  <path class="mouth" d="M -16 16 Q 0 31 16 16" stroke="#17171C" stroke-width="5.5" fill="none" stroke-linecap="round"/>
</svg>`, 'abs')
  const q = (c) => el.querySelector('.' + c)
  const parts = { armL: q('armL'), armR: q('armR'), sc: q('sc'), b1: q('b1'), b2: q('b2'), pl: q('pl'), pr: q('pr'), lid: q('lid'), mouth: q('mouth'), ant: q('ant') }
  const MOUTH = { smile: 'M -16 16 Q 0 31 16 16', open: 'M -18 13 Q 0 44 18 13 Z', o: 'M -8 17 Q 0 31 8 17 Q 0 6 -8 17 Z' }
  el.set = (p = {}) => {
    const { x = 540, y = 960, s = 1, rot = 0, squash = 0, blink = 0, look = [0, 0], armL = 0, armR = 0, open = 18, scissors = true, mouth = 'smile', opacity = 1, antenna = 0 } = p
    el.style.opacity = opacity
    el.style.visibility = opacity < 0.003 ? 'hidden' : 'visible'
    el.style.transform = `translate(${(x - 120).toFixed(1)}px, ${(y - 170).toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${(s * (1 + 0.5 * squash)).toFixed(4)}, ${(s * (1 - squash)).toFixed(4)})`
    parts.armL.setAttribute('transform', `translate(-74 18) rotate(${armL.toFixed(1)})`)
    parts.armR.setAttribute('transform', `translate(74 18) rotate(${armR.toFixed(1)})`)
    parts.sc.style.display = scissors ? '' : 'none'
    parts.b1.setAttribute('transform', `rotate(${(-open / 2).toFixed(1)})`)
    parts.b2.setAttribute('transform', `rotate(${(open / 2).toFixed(1)})`)
    parts.pl.setAttribute('transform', `translate(${look[0]} ${look[1]})`)
    parts.pr.setAttribute('transform', `translate(${look[0]} ${look[1]})`)
    parts.lid.setAttribute('height', (44 * clamp(blink)).toFixed(1))
    parts.mouth.setAttribute('d', MOUTH[mouth] || MOUTH.smile)
    parts.mouth.setAttribute('fill', mouth === 'smile' ? 'none' : '#17171C')
    parts.ant.setAttribute('transform', `rotate(${antenna.toFixed(1)} 0 -92)`)
  }
  // deterministic idle: blink every ~2.3s, gentle bob and antenna sway; add these to set()
  el.idle = (t) => ({ bob: 7 * Math.sin(t * 2 * Math.PI * 1.4), blink: (((t + 1.2) % 2.3) + 2.3) % 2.3 < 0.09 ? 1 : 0, antenna: 9 * Math.sin(t * 2 * Math.PI * 1.1 - 0.6) })
  el.set({ opacity: 0 })
  return el
}

// Clawd, the Claude Code mascot, rebuilt pixel for pixel from the CLI's block art
//    ▐▛███▜▌
//   ▝▜█████▛▘
//     ▘▘ ▝▝
// Each block character is 2x2 quadrant pixels and terminal cells are twice as tall as wide, so a pixel is u wide and
// 2u tall: 18u x 10u overall. Use it for reels about Claude / Claude Code. Animate with c.set({...}) from on(t => ...).
//   x, y       the point between its feet on the ground (stage px)    s  scale     rot  tilt, degrees
//   squash     0..1 toward the feet           blink   0..1 (also a happy squint)
//   armL/armR  pose: -1 down, 0 out (rest), 1 diagonal up, 2 straight up (fractions round to the nearest pose)
//   step       0 / 1 alternates the legs (walking)    open  scissor blades, degrees    scissors  true shows them
// c.handAt(x, y, s, side, pose) is the stage position of hand 'L' or 'R' for those values; pure, so things it holds or
// throws can follow it from any frame.
function clawd(parent, o = {}) {
  const { u = 14, color = '#D77757', eye = '#17171C', blade = '#E9E9EE', handle = '#3D5AFE' } = o
  const W = 18 * u, H = 10 * u
  const px = (x, y, w = 1, h = 1, fill = color, cls = '') => `<rect ${cls ? `class="${cls}"` : ''} x="${x * u}" y="${y * 2 * u}" width="${w * u}" height="${h * 2 * u}" fill="${fill}"/>`
  const el = mk('div', `left:0;top:0;width:${W}px;height:${H}px;transform-origin:${W / 2}px ${H}px`, parent, `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" style="overflow:visible">
  ${px(3, 0, 12, 4)}
  ${px(5, 1, 1, 1, eye, 'eyeL')}${px(12, 1, 1, 1, eye, 'eyeR')}
  <g class="armL">${px(2, 2, 1, 1)}${px(1, 2, 1, 1)}</g><g class="armR">${px(15, 2, 1, 1)}${px(16, 2, 1, 1)}</g>
  ${px(4, 4, 1, 1, color, 'leg0')}${px(6, 4, 1, 1, color, 'leg1')}${px(11, 4, 1, 1, color, 'leg2')}${px(13, 4, 1, 1, color, 'leg3')}
  <g class="sc" shape-rendering="geometricPrecision">
    <g class="b1"><path d="M0 -2 L64 -10 L64 -2 L0 3 Z" fill="${blade}"/><circle cx="-15" cy="-9" r="10" fill="none" stroke="${handle}" stroke-width="6"/></g>
    <g class="b2"><path d="M0 2 L64 10 L64 2 L0 -3 Z" fill="${blade}"/><circle cx="-15" cy="9" r="10" fill="none" stroke="${handle}" stroke-width="6"/></g>
    <circle r="4.5" fill="#55555E"/>
  </g>
</svg>`, 'abs')
  const q = (c) => el.querySelector('.' + c)
  const P = { armL: q('armL'), armR: q('armR'), eyeL: q('eyeL'), eyeR: q('eyeR'), sc: q('sc'), b1: q('b1'), b2: q('b2'), legs: [0, 1, 2, 3].map((i) => q('leg' + i)) }
  // arm pixels per pose, left side (shoulder first); the right arm mirrors x -> 17 - x
  const POSES = { '-1': [[2, 2], [1, 3]], 0: [[2, 2], [1, 2]], 1: [[2, 2], [1, 1]], 2: [[2, 1], [2, 0]] }
  const pose = (v) => POSES[String(Math.max(-1, Math.min(2, Math.round(v))))]
  const drawArm = (g, v, mirror) => {
    const r = g.querySelectorAll('rect')
    pose(v).forEach(([x, y], i) => { r[i].setAttribute('x', (mirror ? 17 - x : x) * u); r[i].setAttribute('y', y * 2 * u) })
  }
  el.handAt = (x0, y0, s, side, v) => {
    const [x, y] = pose(v)[1]
    const hx = ((side === 'R' ? 17 - x : x) + 0.5) * u, hy = (y * 2 + 1) * u
    return [x0 + s * (hx - W / 2), y0 + s * (hy - H)]
  }
  el.set = (p = {}) => {
    const { x = 540, y = 1200, s = 1, rot = 0, squash = 0, blink = 0, armL = 0, armR = 0, step = 0, open = 18, scissors = false, opacity = 1 } = p
    el.style.opacity = opacity
    el.style.visibility = opacity < 0.003 ? 'hidden' : 'visible'
    el.style.transform = `translate(${(x - W / 2).toFixed(1)}px, ${(y - H).toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${(s * (1 + 0.5 * squash)).toFixed(4)}, ${(s * (1 - squash)).toFixed(4)})`
    drawArm(P.armL, armL, false)
    drawArm(P.armR, armR, true)
    const eh = 2 * u * (1 - 0.75 * clamp(blink))
    for (const e of [P.eyeL, P.eyeR]) { e.setAttribute('height', eh); e.setAttribute('y', 2 * u + (2 * u - eh)) }
    P.legs.forEach((l, i) => { const up = step && i % 2 === (step % 2 ? 1 : 0); l.setAttribute('height', up ? u : 2 * u) })
    P.sc.style.display = scissors ? '' : 'none'
    if (scissors) {
      const [hx, hy] = pose(armR)[1]
      P.sc.setAttribute('transform', `translate(${(17 - hx + 1) * u + 6} ${(hy * 2 + 1) * u}) rotate(${-18 - 25 * (Math.round(armR) > 0)}) scale(${(u / 15).toFixed(3)})`)
      P.b1.setAttribute('transform', `rotate(${(-open / 2).toFixed(1)})`)
      P.b2.setAttribute('transform', `rotate(${(open / 2).toFixed(1)})`)
    }
  }
  el.idle = (t) => ({ bob: 5 * Math.abs(Math.sin(t * 2 * Math.PI * 0.9)), blink: (((t + 1.2) % 2.3) + 2.3) % 2.3 < 0.09 ? 1 : 0 })
  el.set({ opacity: 0 })
  return el
}

// ---------- captions ----------
// list: [[start, end, text]]; *word* gets colors[word] or the accent. Captions follow the face layout (REEL.captionY).
let CAPS = []
let captionsOn = new URLSearchParams(location.search).get('captions') !== '0'
function captions(list, { colors = {} } = {}) {
  CAPS = list.map(([a, b, txt]) => ({
    a, b, txt,
    el: mk('div', '', $('caps'), '<span>' + txt.replace(/\*(.+?)\*/g, (_, w) => `<i style="color:${colors[w] || T.accent}">${w}</i>`) + '</span>', 'abs cap'),
  }))
}

// ---------- editor kit: render passes (node scripts/render.mjs kit) ----------
// ?pass=background|face|graphics|captions renders one layer of the frame, so an editor can stack them again:
//   background = #bg + layerUnder() sections (opaque)     face = the camera with its layout, corners and shadow
//   graphics = layer() sections (&section=<id>: just one)  captions = the styled captions
// Alpha passes (face, graphics, captions) leave the page transparent for screenshots with omitBackground; &matte=green
// or black paints that colour behind them instead (preview). Camera shake moves #cam in every pass, so layers align.
const PASS = (() => {
  const q = new URLSearchParams(location.search)
  return { pass: q.get('pass') || 'master', section: q.get('section'), matte: q.get('matte') || 'transparent', setup: false }
})()
const ALPHA_PASS = ['face', 'graphics', 'captions'].includes(PASS.pass)
function passSetup() {
  PASS.setup = true
  if (PASS.pass === 'master') return
  const root = document.documentElement
  root.classList.add(`pass-${PASS.pass}`)
  if (ALPHA_PASS) root.classList.add('pass-alpha')
  if (PASS.matte !== 'transparent') root.style.setProperty('--pass-matte', { green: '#00B140', black: '#000' }[PASS.matte] || PASS.matte)
  if (PASS.section) {
    const s = SECTIONS.find((x) => x.id === PASS.section)
    if (!s) throw new Error(`no section ${PASS.section} (have: ${SECTIONS.map((x) => x.id).join(' ')})`)
    for (const x of SECTIONS) if (x !== s) x.el.classList.add('pass-off')
  }
}
// a source-time range as output-time ranges, one per segment that plays part of it (b null = the end)
function outRanges(a, b) {
  const segs = SEGS || [{ in: 0, out: REEL.duration, at: 0 }]
  return segs.map((sg) => [Math.max(a, sg.in), Math.min(b ?? Infinity, sg.out), sg]).filter(([x, y]) => y - x > 1e-3)
    .map(([x, y, sg]) => [+(sg.at + x - sg.in).toFixed(4), +(sg.at + y - sg.in).toFixed(4)])
}
const VIS = { opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true }
// does this element draw anything itself (not just hold children)?
function paints(e) {
  if (/^(IMG|CANVAS|VIDEO|svg)$/.test(e.tagName)) return true
  for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true
  const cs = getComputedStyle(e)
  if (cs.backgroundImage !== 'none' || cs.boxShadow !== 'none' || cs.textShadow !== 'none') return true
  if (!/^(transparent|rgba\(.*,\s*0\))$/.test(cs.backgroundColor)) return true
  return ['Top', 'Right', 'Bottom', 'Left'].some((k) => cs[`border${k}Style`] !== 'none' && parseFloat(cs[`border${k}Width`]) > 0)
}
// after seek(t): ids of the sections that put anything on screen (the kit cuts one clip per run of frames)
window.visibleSections = () => SECTIONS.filter((s) => {
  for (const e of [s.el, ...s.el.querySelectorAll('*')]) {
    if (e.ownerSVGElement || !e.checkVisibility(VIS) || !paints(e)) continue
    let op = 1
    for (let x = e; x && op >= 0.004; x = x === s.el ? null : x.parentElement) op *= parseFloat(getComputedStyle(x).opacity)
    if (op < 0.004) continue // fading out: 1/255 or less never shows
    const r = e.getBoundingClientRect()
    if (r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < REEL.width && r.top < REEL.height) return true
  }
  return false
}).map((s) => s.id)
// after seek(t): { section id: ['r,g,b', ...] } colours drawn by visible sections (text, fills, borders, svg), so the
// kit can pick a chroma-key colour that none of them use
window.sectionColors = () => {
  const out = {}, rgb = (s) => (s.match(/rgba?\([^)]*\)/g) || []).map((c) => c.match(/[\d.]+/g).map(Number)).filter((c) => c.length < 4 || c[3] > 0.1).map((c) => c.slice(0, 3).join(','))
  for (const s of SECTIONS) {
    if (s.under || s.el.classList.contains('pass-off')) continue
    const set = new Set()
    for (const e of s.el.querySelectorAll('*')) {
      if (!e.checkVisibility(VIS)) continue
      const cs = getComputedStyle(e)
      const own = [cs.backgroundColor, cs.backgroundImage, cs.borderTopColor, cs.boxShadow === 'none' ? '' : cs.boxShadow, e.ownerSVGElement ? `${cs.fill} ${cs.stroke}` : '']
      if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) own.push(cs.color)
      for (const c of rgb(own.join(' '))) set.add(c)
    }
    if (set.size) out[s.id] = [...set]
  }
  return out
}
// after seek(t): visible elements whose look depends on what is under them. In an alpha pass there is nothing under
// them, so Chrome draws blend modes as normal and backdrop filters as nothing (opaque layerUnder() content is fine)
window.alphaWarnings = () => {
  const out = new Set()
  for (const e of document.querySelectorAll('#layers *, #caps *, #face')) {
    if (!e.checkVisibility(VIS)) continue
    const cs = getComputedStyle(e), where = e.closest('[data-section]')?.dataset.section || e.id || 'captions'
    const what = `<${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? ` class="${e.className}"` : ''}> in ${where}`
    if (cs.mixBlendMode !== 'normal') out.add(`mix-blend-mode: ${cs.mixBlendMode} on ${what}`)
    if (cs.backdropFilter && cs.backdropFilter !== 'none') out.add(`backdrop-filter on ${what}`)
  }
  return [...out]
}

// ---------- seek ----------
function apply(t) {
  const { ts, seg } = toSource(t)
  const settle = seg ? seg.in + 0.05 : -Infinity
  let sx = 0, sy = 0
  for (const s of SHAKES) {
    const st = ts - s.t0
    if (st <= 0 || st > 1) continue
    const k = s.amp * pulse(st, 7)
    sx += k * Math.sin(st * 2 * Math.PI * s.f)
    sy += 0.6 * k * Math.cos(st * 2 * Math.PI * s.f * 0.78)
  }
  $('cam').style.transform = `translate(${sx.toFixed(2)}px, ${sy.toFixed(2)}px)`
  $('bg').style.backgroundPosition = `${(t * 6).toFixed(2)}px ${(t * 10).toFixed(2)}px, ${(t * 6).toFixed(2)}px ${(t * 10).toFixed(2)}px, 0 0`

  if (REEL.face && FACE) {
    const fw = FACE.w(ts, settle), s = FACE.s(ts, settle), f = REEL.face.focus
    // the smaller the face box, the more it reads as a floating card: hairline edge + drop shadow
    const pip = clamp((REEL.width - fw) / (REEL.width - 300))
    Object.assign($('face').style, {
      left: FACE.x(ts, settle) + 'px', top: FACE.y(ts, settle) + 'px', width: fw + 'px', height: FACE.h(ts, settle) + 'px', borderRadius: Math.max(0, FACE.r(ts, settle)) + 'px',
      boxShadow: `0 0 0 ${(1.5 * pip).toFixed(2)}px rgba(255,255,255,${(0.22 * pip).toFixed(3)}), 0 ${(30 * pip).toFixed(1)}px ${(70 - 10 * pip).toFixed(1)}px rgba(0,0,0,${(0.55 + 0.1 * pip).toFixed(3)}), 0 -24px 70px rgba(0,0,0,${(0.55 * (1 - pip)).toFixed(3)})`,
    })
    $('faceImg').style.transform = `translate(${(FACE.fx(ts, settle) - f.x * s).toFixed(2)}px, ${(FACE.fy(ts, settle) - f.y * s).toFixed(2)}px) scale(${s.toFixed(5)})`
    // nearest source frame: render subframes sit within half a frame, so they all show the same face (no ghosting)
    setSrc($('faceImg'), `${REEL.face.dir}/${pad(clamp(Math.round(ts * REEL.fps), 0, REEL.face.frames - 1), REEL.face.digits)}.jpg`)
  } else {
    $('face').style.display = 'none'
  }

  for (const fn of UPDATES) fn(ts, t)

  $('caps').style.transform = `translateY(${(FACE ? FACE.capY(ts, settle) : REEL.captionY.FULL).toFixed(2)}px)`
  for (const c of CAPS) {
    if (!captionsOn) { c.el.style.visibility = 'hidden'; continue }
    show(c.el, ts, c.a, c.b, { dy: 18, dyOut: -10, sc: 0.96, blur: 6, sin: SPR.snap })
  }
}

function seek(t) {
  if (!PASS.setup) passSetup()
  pending = []
  apply(clamp(t, 0, REEL.duration))
  return Promise.all(pending)
}

// ---------- api (scripts/render.mjs) ----------
window.seek = seek
window.configure = (o) => { if ('captions' in o) captionsOn = !!o.captions }
window.timeline = () => {
  // source-time cues land wherever their segment plays (once per segment that contains them)
  const mapped = SEGS ? CUES.flatMap((c) => SEGS.filter((sg) => c.t >= sg.in && c.t < sg.out).map((sg) => ({ ...c, t: +(sg.at + c.t - sg.in).toFixed(4) }))) : CUES
  return {
    name: REEL.name, fps: REEL.fps, duration: REEL.duration, variant: REEL.variant, variants: REEL.variants || [],
    segments: SEGS ? SEGS.map((sg) => [sg.in, sg.out, +sg.at.toFixed(4)]) : null,
    cues: [...mapped, ...CUES_OUT].filter((c) => c.t >= 0 && c.t < REEL.duration).sort((a, b) => a.t - b.t),
    // [start, end, plain text] in output time, for .srt files
    captions: CAPS.flatMap((c) => outRanges(c.a, c.b).map(([a, b]) => [a, b, c.txt.replace(/\*(.+?)\*/g, '$1')])).sort((x, y) => x[0] - y[0]),
  }
}
// sections for the editor kit: fixed = output-time ranges from layer(name, { from, to }), null = found by scanning
window.layers = () => ({
  width: REEL.width, height: REEL.height, fps: REEL.fps, duration: REEL.duration,
  segments: SEGS ? SEGS.map((sg) => [sg.in, sg.out, +sg.at.toFixed(4)]) : null,
  sections: SECTIONS.map((s) => ({ id: s.id, name: s.name, under: s.under, fixed: s.fixed ? outRanges(...s.fixed) : null })),
})
window.ready = async () => {
  await document.fonts.ready
  const fams = ['--font-display', '--font-body', '--font-mono'].map((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim())
  await Promise.all(fams.flatMap((f) => ['400', '700', '900'].map((w) => document.fonts.load(`${w} 40px ${f}`).catch(() => {}))))
  await Promise.all([...document.images].filter((i) => i.getAttribute('src')).map((i) => i.decode().catch(() => {})))
}

// preview: open index.html directly. click plays with audio/mix.wav, ?t=12.3 freezes a frame, ?captions=0 hides captions
addEventListener('load', () => {
  if (window.__RENDER__) return
  document.body.classList.add('preview')
  const fit = () => document.body.style.setProperty('--fit', Math.min(innerWidth / REEL.width, innerHeight / REEL.height))
  fit(); addEventListener('resize', fit)
  const params = new URLSearchParams(location.search)
  window.ready().then(() => {
    if (params.has('t')) { seek(+params.get('t')); return }
    const audio = new Audio(REEL.variant ? `audio/mix_${REEL.name}.wav` : 'audio/mix.wav')
    let t0 = performance.now(), playing = false
    addEventListener('click', () => { audio.currentTime = 0; audio.play().then(() => (playing = true)).catch(() => {}); t0 = performance.now() })
    const loop = () => {
      seek(playing && !audio.paused ? audio.currentTime : ((performance.now() - t0) / 1000) % REEL.duration)
      requestAnimationFrame(loop)
    }
    loop()
  })
})
