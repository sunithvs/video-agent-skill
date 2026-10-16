// Starter edit: replace every section with the real plan. Times are seconds of source/edit.mp4 (audio/outline.txt).
// The engine API is in references/engine-api.md of the reel-editor skill; examples/artcraft/edit.js is a full worked edit.

reel({
  name: 'reel',
  duration: META.duration,
  face: { frames: META.faceFrames, focus: { x: 540, y: 820 } }, // focus: between the eyes and the chin, source pixels
})

// ---------- structure ----------
//  0.0 hook card over the wall        2.5 split: title + screenshot
//  6.0 pip: chips + browser recording 10.0 full: call to action
faceAt([
  [-1, 'HOOK'],
  [2.5, 'SPLIT'],
  [6.0, 'PIP'],
  [10.0, 'PUNCH'],
])

// ---------- 0 hook ----------
const L0 = layer('hook') // section names label the clips of the editor kit (render.mjs kit)
const hook = mk('div', `left:70px;top:236px;width:940px;padding:30px 40px 34px;box-sizing:border-box;border-radius:36px;background:#fff;color:${T.ink};box-shadow:0 30px 80px -24px rgba(0,0,0,0.55)`, L0, null, 'abs')
mk('div', 'font-size:38px;font-weight:600;color:#55555E', hook, 'Small setup line')
mk('div', 'font-size:72px;font-weight:820;line-height:82px;margin-top:6px', hook, 'The big hook,<br>two lines max', 'disp')
at(hook, -0.2, 2.4, { dy: -60, sc: 1.1, rot: -4, sin: SPR.slam, cue: 'thunk', cueDelay: 0.24 })

// ---------- 1 split ----------
const L1 = layer('title')
at(label(L1, '01 — <b>Section</b>'), 2.56, 6.0, { dy: 0, sc: 1 })
at(text(L1, `Title with an <span style="color:${T.accent}">accent</span>`, { y: 280, size: 72 }), 2.6, 6.0, { dy: 40, cue: 'tick' })
// at(imageCard(L1, 'assets/shots/site_top.png', { y: 400, h: 500 }), 2.7, 6.0, { dy: 60, sc: 0.92 })

// ---------- 2 pip ----------
const L2 = layer('chips')
const row = mk('div', 'left:60px;top:290px;display:flex;gap:16px', L2, null, 'abs')
stagger(['One', 'Two', 'Three'].map((s) => chip(row, s)), 6.1, 0.6, 10.0, { dy: 30, sc: 0.5, rot: -6, sin: SPR.pop, cue: 'pop' })
// at(browserCard(L2, { url: 'example.com', seq: { dir: 'tmp/broll', count: 225, from: 0, at: 6.0 } }), 6.0, 10.0, { dy: 260, sin: SPR.morph })

// ---------- 3 call to action ----------
const L3 = layer('cta')
at(chip(L3, 'Follow for more', { x: 70, y: 260 }), 10.2, null, { dy: 30, sc: 0.7, sin: SPR.pop, cue: 'pop' })

// ---------- captions (*word* gets the accent) ----------
captions([
  [0.1, 2.4, 'First caption line'],
  [2.5, 5.9, 'Second line with a *keyword*'],
])
