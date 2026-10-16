// Starter long-form edit. Replace the placeholders with the real plan; times are SOURCE seconds (audio/outline.txt),
// the jump cuts in tmp/cuts.js re-time everything automatically. Engine API: references/engine-api.md of the skill.

reel({
  name: 'video',
  width: 1920,
  height: 1080,
  duration: META.duration,
  // focus: between the eyes and the chin in camera pixels; headHeight: hair top to chin (measure on a still)
  face: { frames: META.faceFrames, srcW: META.srcW, srcH: META.srcH, focus: { x: META.srcW / 2, y: META.srcH * 0.4 }, headHeight: META.srcH * 0.38 },
  segments: CUTS ? CUTS.segments : null,
})

// ---------- face: zoom alternates on every jump cut, except where a section places its own layout ----------
faceAt([
  ...autoZoom({ except: [[20, 30]] }),
  // [20, 'SIDE_L'], [30, 'FULL'],
])

// ---------- chapters (YouTube timestamps + a title card) ----------
chapter(0, 'Intro', { card: false })
// chapter(62.4, 'How it works')

// ---------- routine graphics ----------
lowerThird(layer(), 'Your Name', 'What this channel is about', { t: 2 })

// ---------- hand-made moments (one every 30-60 s where the talk needs a visual) ----------
// const L1 = layer()
// at(text(L1, 'Key point', { x: 900, y: 420, size: 96 }), 21, 29, { dy: 40, cue: 'pop' })
// fullVideo({ t: 40, tout: 46, seq: { dir: 'tmp/broll_city', count: 180 }, credit: 'Video: Name / Pexels' })  // + [40, 'PIP'] or 'OFF'

// ---------- thumbnail (node scripts/render.mjs thumb) ----------
thumbnail((st) => {
  mk('div', `left:0;top:0;width:1280px;height:720px;background:${T.ink}`, st, null, 'abs')
  faceStill(st, 5, 'right:0;top:0;height:720px')
  mk('div', 'left:60px;top:200px;width:700px;font-size:110px;font-weight:900;line-height:0.95;letter-spacing:-0.04em', st, 'BIG<br><span style="color:var(--c-accent, #FF6A2B)">TITLE</span>', 'abs disp')
})
