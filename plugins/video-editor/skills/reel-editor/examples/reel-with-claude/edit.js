// Reel with Claude: 57s Malayalam talking head about editing this very reel with Claude (prompts + the reel-editor
// skill, HTML graphics, sound effects), with @ajith_io's Claude-made motion reel as the "reference style".
// Times come from audio/outline.txt (forced-English loanwords: motion graphics 3.2, Claude 6.86, 20 minutes 9.3-9.9,
// cut 15.3, parts 16.56, gave 18.76, prompts 21.34, skills 22.14, asked 24.2, reference 26.76, AI video generation
// 31.7-32.6, HTML 34.88, graphical 36.42, sound effects 37.88, human 39.74, flag 46.54, webinar 51.26, emoji 53.88).

reel({
  name: 'reel_with_claude',
  duration: META.duration,
  face: { frames: META.faceFrames, focus: { x: 540, y: 620 }, headHeight: 520 },
  theme: { accent: '#E8774F' },
  // the face inside the editor window's monitor during the hook
  layouts: { MONITOR: { x: 130, y: 540, w: 820, h: 740, r: 18, s: 0.9, fx: 410, fy: 400 } },
})
const CREAM = '#F3EFE6', BLUE = '#3D5AFE'

// ---------- structure ----------
//  0.0 MONITOR Clawd edits the clip in an editor    2.4 SPLIT checklist: cuts, captions, motion graphics, sfx
//  5.8 PIP   terminal: the actual edit steps          9.25 HOOK ~20 min ring
// 13.2 SPLIT raw clips trimmed, handed to Claude     20.1 PIP prompts + the reel-editor skill
// 23.6 HOOK  chat bubble "edit this video"           26.2 PIP reference style: @ajith_io's post + video
// 31.0 HOOK  "AI video generator?" -> NOT AI VIDEO   34.7 PIP HTML / graphics / sound FX + edit.js typing
// 39.05 SPLIT edits like a human: timeline + playhead 43.85 HOOK real footage, no "AI info" label
// 47.5 SPLIT webinar                                 53.0 HOOK comment any emoji -> link in DM
faceAt([
  [-1, 'MONITOR'],
  [2.4, 'SPLIT'],
  [5.8, 'PIP'],
  [9.25, 'HOOK'],
  [13.2, 'SPLIT'],
  [20.1, 'PIP'],
  [23.6, 'HOOK'],
  [26.2, 'PIP'],
  [31.0, 'HOOK'],
  [34.7, 'PIP'],
  [39.05, 'SPLIT'],
  [43.85, 'HOOK'],
  [47.5, 'SPLIT'],
  [53.0, 'HOOK'],
])

const check = `<span style="width:58px;height:58px;border-radius:29px;background:${T.accent};display:inline-grid;place-items:center;flex:none"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>`

// ---------- 0 hook: the mascot edits this very clip ----------
// cream stage and an editor window behind the face; the face plays in the window's monitor (MONITOR layout).
// Clawd hops in, 0.5 / 0.66 snips the head of the first clip, 1.1 tosses an FX sticker, 1.55 a captions sticker,
// 1.95 cheers, 2.22 hops off
const HOOK_OUT = 2.3
const U0 = layerUnder()
at(mk('div', `left:0;top:0;width:1080px;height:1920px;background:linear-gradient(rgba(23,23,28,0.05) 1px, transparent 1px) 0 0 / 120px 120px, linear-gradient(90deg, rgba(23,23,28,0.05) 1px, transparent 1px) 0 0 / 120px 120px, ${CREAM}`, U0, null, 'abs'),
  -1, HOOK_OUT, { dy: 0, dyOut: 0, sc: 1, blur: 0 })
const win = mk('div', 'left:70px;top:470px;width:940px;height:1090px;border-radius:30px;background:#141413;box-shadow:0 40px 90px -30px rgba(23,23,28,0.55)', U0, null, 'abs')
mk('div', 'left:26px;top:21px', win, dots(), 'abs')
mk('div', 'left:0;right:0;top:0;height:56px;line-height:56px;text-align:center;color:#8C8A82;font-size:20px', win, 'Reel with Claude — edit.js', 'abs mono url')

at(win, -1, HOOK_OUT, { dy: 0, dyOut: 40, sc: 1, blur: 8 })

const L0 = layer()
at(mk('div', 'left:70px;top:232px;font-size:26px;color:#6B6B76', L0, 'Video editors <span class="emoji">👀</span>', 'abs mono'), -1, HOOK_OUT, { dy: 0, sc: 1 })
at(text(L0, 'Claude edited', { y: 268, size: 84, weight: 840, color: T.ink }), -1, HOOK_OUT, { dy: 0, sc: 1 })
at(text(L0, 'this entire reel.', { y: 354, size: 84, weight: 840, color: T.accent }), -1, HOOK_OUT, { dy: 0, sc: 1 })

// timeline: four clips from this video; the head of the first gets trimmed
const TL = { x: 372, y: 1330, w: 132, h: 96, gap: 8, cut: 28 }
const SNIP = [0.5, 0.66], SLIDE = 0.8
const clipThumb = (frame, x, w, offset) => {
  const c = mk('div', `left:${x}px;top:${TL.y}px;width:${w}px;height:${TL.h}px;border-radius:10px;overflow:hidden;background:#2a2a2e;box-shadow:inset 0 0 0 2px rgba(255,255,255,0.14)`, L0, null, 'abs')
  img(`tmp/face/${pad(frame, 5)}.jpg`, `position:absolute;left:${-offset}px;top:0;width:${TL.w}px;height:${TL.h}px;object-fit:cover;object-position:50% 26%`, c)
  return c
}
const sliver = clipThumb(80, TL.x, TL.cut, 0)
const clips = [clipThumb(80, TL.x + TL.cut, TL.w - TL.cut, TL.cut), ...[420, 900, 1380].map((f, i) => clipThumb(f, TL.x + (i + 1) * (TL.w + TL.gap), TL.w, 0))]
const slide = track([[0, 0], [SLIDE, -TL.cut, SPR.snap]])
const wave = Array.from({ length: 52 }, (_, i) => mk('div', `left:${TL.x + i * 10}px;top:0;width:5px;border-radius:3px;background:#7BD88F`, L0, null, 'abs'))
on((t) => {
  const vis = clamp(1 - S(t - HOOK_OUT, SPR.exit.f, SPR.exit.z))
  const sx = slide(t)
  clips.forEach((c, i) => { c.style.transform = `translateX(${sx.toFixed(2)}px)`; c.style.opacity = vis })
  const fall = S(t - SNIP[1], 2.6, 1)
  sliver.style.opacity = clamp(vis - fall * 1.2)
  sliver.style.transform = `translate(${(-30 * fall).toFixed(1)}px, ${(260 * fall * fall).toFixed(1)}px) rotate(${(-40 * fall).toFixed(1)}deg)`
  wave.forEach((w, i) => {
    const hgt = 10 + Math.abs(Math.sin(i * 1.3 + 0.4) * Math.cos(i * 0.37)) * 56
    const h2 = hgt * 0.8
    w.style.top = `${1478 - h2 / 2}px`; w.style.height = `${h2}px`; w.style.opacity = vis
  })
})
const cutLine = mk('div', `left:${TL.x + TL.cut - 2}px;top:${TL.y - 16}px;width:4px;height:${TL.h + 210}px;border-radius:2px;background:#fff;box-shadow:0 0 18px #fff`, L0, null, 'abs')
on((t) => { cutLine.style.opacity = clamp((t - 0.3) / 0.1) * (1 - clamp((t - 0.72) / 0.12)) })

// stickers thrown onto the monitor
const sticker = (html, bg, fg) => mk('div', `left:0;top:0;height:84px;padding:0 30px;border-radius:42px;background:${bg};color:${fg};font-size:44px;font-weight:850;line-height:84px;white-space:nowrap;box-shadow:0 14px 34px -10px rgba(0,0,0,0.5)`, L0, html, 'abs disp')
const STICKERS = [
  { el: sticker('<span class="emoji">✨</span> FX', '#17171C', '#fff'), grab: 0.95, toss: 1.1, land: 1.42, to: [180, 580], ctrl: [60, 300], rot: -8 },
  { el: sticker('Aa Captions', '#fff', T.ink), grab: 1.42, toss: 1.55, land: 1.87, to: [600, 1180], ctrl: [420, 520], rot: 6 },
]

// Clawd, the Claude Code mascot (pixel art from the CLI). (x, y) = between its feet
const M = clawd(L0, { u: 20 }), MS = 1
const POS = (t) => {
  const a = S(t + 0.45, SPR.slam.f, SPR.slam.z), ex = S(t - 2.22, 3.4, 1)
  return [lerp(-260, 200, clamp(a)) - 640 * ex, lerp(1760, 1478, a) - 150 * pulse(t - 2.22, 2.5) + 480 * ex * ex]
}
// left arm pose over time: dips to wind up, flings up on each toss, both arms up for the cheer
const armLAt = (t) => STICKERS.reduce((v, k) => v - 1 * (S(t - k.grab, 6, 1) - S(t - k.toss, 9, 1)) + 2.6 * pulse(t - k.toss, 3.2), 0) + 2.4 * pulse(t - 1.95, 2.2)
on((t) => {
  // after the hook: hide everything this function drives (frames render out of order, so never rely on an earlier frame)
  if (t > 3) { M.set({ opacity: 0 }); STICKERS.forEach((k) => { k.el.style.visibility = 'hidden' }); return }
  const [x, y] = POS(t), id = M.idle(t)
  const snip = SNIP.reduce((v, k) => v + pulse(t - k, 7), 0)
  const cheer = pulse(t - 1.95, 2.2)
  const moving = t < 0.05 || t > 2.2
  M.set({
    x, y: y - id.bob - 80 * cheer, s: MS, rot: 3 * Math.sin(t * 2 * Math.PI * 0.8) - 4 * cheer,
    squash: 0.12 * snip + 0.2 * pulse(t + 0.3, 5), blink: cheer > 0.25 ? 0.7 : id.blink,
    armL: armLAt(t), armR: 2.4 * cheer, step: moving ? Math.floor(t * 12) % 2 + 1 : 0,
    open: 26 * clamp(1 - snip), scissors: !(t > 1.9 && t < 2.35),
  })
  for (const k of STICKERS) {
    const vis = t > k.grab ? clamp(1 - S(t - HOOK_OUT, SPR.exit.f, SPR.exit.z)) : 0
    k.el.style.visibility = vis > 0.003 ? 'visible' : 'hidden'
    k.el.style.opacity = vis
    if (!vis) continue
    if (!k.w) k.w = k.el.offsetWidth
    let px, py, rot, sc
    if (t < k.toss) {
      ;[px, py] = M.handAt(x, y - id.bob, MS, 'L', armLAt(t))
      py -= 20; rot = -10; sc = 0.55 * clamp(S(t - k.grab, 4, 0.6), 0, 1.2)
    } else {
      const [rx, ry] = M.handAt(...POS(k.toss), MS, 'L', armLAt(k.toss))
      const p = smooth((t - k.toss) / (k.land - k.toss))
      px = (1 - p) * (1 - p) * rx + 2 * p * (1 - p) * k.ctrl[0] + p * p * (k.to[0] + k.w / 2)
      py = (1 - p) * (1 - p) * (ry - 20) + 2 * p * (1 - p) * k.ctrl[1] + p * p * (k.to[1] + 42)
      rot = lerp(-370, k.rot, p); sc = lerp(0.55, 1, p) + 0.18 * pulse(t - k.land, 4)
    }
    k.el.style.transform = `translate(${(px - k.w / 2).toFixed(1)}px, ${(py - 42).toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${sc.toFixed(3)})`
  }
})
// sparkle burst when it cheers
const sparks = Array.from({ length: 10 }, (_, i) => mk('div', `left:0;top:0;width:34px;height:34px;color:${i % 2 ? T.yellow : T.accent}`, L0,
  '<svg width="34" height="34" viewBox="-17 -17 34 34"><path d="M0 -17 C2 -4 4 -2 17 0 C4 2 2 4 0 17 C-2 4 -4 2 -17 0 C-4 -2 -2 -4 0 -17Z" fill="currentColor"/></svg>', 'abs'))
on((t) => sparks.forEach((el, i) => {
  const p = (t - 1.97 - 0.02 * i) / 0.6, a = (i / sparks.length) * 2 * Math.PI + 0.3
  el.style.visibility = p > 0 && p < 1 ? 'visible' : 'hidden'
  if (p <= 0 || p >= 1) return
  const r = lerp(330, 520, smooth(p))
  el.style.opacity = Math.sin(Math.PI * p)
  el.style.transform = `translate(${(540 + r * Math.cos(a) - 17).toFixed(1)}px, ${(870 + r * 0.9 * Math.sin(a) - 17).toFixed(1)}px) rotate(${(p * 120).toFixed(1)}deg) scale(${(0.6 + 0.8 * Math.sin(Math.PI * p)).toFixed(3)})`
}))
cue(0.04, 'thunk', 0.7)
SNIP.forEach((k) => cue(k, 'click', 0.9)); cue(0.62, 'scratch', 0.9); cue(0.75, 'swish', 0.6)
STICKERS.forEach((k) => { cue(k.grab + 0.05, 'tick', 0.6); cue(k.toss + 0.12, 'whoosh', 0.55); cue(k.land, 'pop') })
cue(1.97, 'success', 0.55)

// ---------- 1 checklist ----------
const L1 = layer()
at(label(L1, '01 — <b>Edited by Claude</b>'), 2.46, 5.75, { dy: 0, sc: 1 })
at(text(L1, 'Every part of this edit:', { y: 278, size: 60 }), 2.5, 5.75, { dy: 30 })
;[['Cuts', 2.62], ['Captions', 2.92], ['Motion graphics', 3.2], ['Sound effects', 3.7]].forEach(([s, t], i) => {
  const row = mk('div', `left:70px;top:${378 + i * 86}px;display:flex;align-items:center;gap:22px;font-size:56px;font-weight:760;white-space:nowrap`, L1, `${check}<span>${s}</span>`, 'abs disp')
  at(row, t, 5.75 + 0.01 * i, { dy: 24, sc: 0.8, sin: SPR.pop, cue: 'pop', gain: 0.8 })
})
at(chip(L1, `by <span style="font-weight:900">Claude</span>`, { x: 70, y: 742, bg: T.accent, fg: '#fff', size: 52 }), 4.6, 5.75, { dy: 20, sc: 0.6, rot: -4, sin: SPR.pop, cue: 'click' })

// ---------- 2 terminal: the actual steps ----------
const L2 = layer()
at(label(L2, '02 — <b>The editor</b>'), 5.86, 9.2, { dy: 0, sc: 1 })
at(text(L2, `The editor? <span style="color:${T.accent}">Claude.</span>`, { y: 274, size: 66 }), 6.82, 9.2, { dy: 36, cue: 'tick' })
const term = terminal(L2, {
  prompt: 'edit the new video in "Reel with Claude"', tIn: 6.0,
  steps: [
    ['Read SKILL.md', 'reel-editor', 7.1],
    ['Transcribe', 'Malayalam → English', 7.55],
    ['Plan 14 sections', 'build edit.js', 8.0],
    ['Render 1,713 frames', 'mix audio', 8.45],
    ['✓ out/reel_with_claude.mp4', '', 8.9],
  ],
})
at(term, 5.86, 9.2, { dy: 240, dyOut: -40, sc: 0.92, sin: SPR.morph })

// ---------- 3 twenty minutes ----------
const L3 = layer()
const stat = wallCard(L3, null, { css: 'display:flex;align-items:center;gap:30px;height:172px;padding:0 36px' })
const ring = mk('div', 'position:relative;width:118px;height:118px;flex:none', stat,
  `<svg width="118" height="118" viewBox="0 0 118 118"><circle cx="59" cy="59" r="49" fill="none" stroke="#ECEAE4" stroke-width="12"/><circle class="arc" cx="59" cy="59" r="49" fill="none" stroke="${T.accent}" stroke-width="12" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" transform="rotate(-90 59 59)"/></svg><div class="emoji abs" style="left:0;top:0;width:118px;line-height:118px;text-align:center;font-size:50px">⏱️</div>`)
const statNum = mk('div', 'font-size:104px;font-weight:900;font-stretch:112%;line-height:110px;letter-spacing:-0.04em', stat, '', 'disp')
mk('div', 'font-size:32px;font-weight:600;color:#55555E;line-height:40px', stat, 'minutes<br>to edit this reel')
on((t) => {
  const p = clamp(S(t - 9.45, 0.9, 1))
  ring.querySelector('.arc').style.strokeDashoffset = (1 - p).toFixed(4)
  statNum.textContent = '~' + Math.round(20 * p)
})
at(stat, 9.3, 13.1, { dy: -50, sc: 0.9, rot: -3, sin: SPR.pop, cue: 'pop' })

// ---------- 4 trimmed the raw clips ----------
const L4 = layer()
at(label(L4, '03 — <b>My part</b>'), 13.3, 20.0, { dy: 0, sc: 1 })
at(text(L4, 'I only trimmed', { y: 274, size: 68 }), 13.45, 20.0, { dy: 36, cue: 'tick', gain: 0.6 })
at(text(L4, `the <span style="color:${T.accent}">raw clips</span>`, { y: 350, size: 68 }), 13.75, 20.0, { dy: 36 })
const THUMBS = [60, 300, 520, 760, 980, 1200, 1420, 1650]
const CUT = new Set([2, 5, 6])
const kept = THUMBS.map((_, i) => i).filter((i) => !CUT.has(i))
const BW = 108, BG = 8, x0 = (1080 - (THUMBS.length * BW + (THUMBS.length - 1) * BG)) / 2, xk = (1080 - (kept.length * BW + (kept.length - 1) * BG)) / 2
const CUT_T = 16.55, CLOSE_T = 17.3
const blocks = THUMBS.map((f, i) => {
  const b = mk('div', `left:0;top:470px;width:${BW}px;height:170px;border-radius:14px;overflow:hidden;background:#222;box-shadow:0 0 0 2px rgba(255,255,255,0.18)`, L4, null, 'abs')
  img(`tmp/face/${pad(f, 5)}.jpg`, `width:${BW}px;height:170px;object-fit:cover;object-position:50% 28%`, b)
  if (CUT.has(i)) {
    const red = mk('div', `left:0;top:0;width:${BW}px;height:170px;background:rgba(255,71,71,0.55);display:grid;place-items:center;font-size:64px;font-weight:900;color:#fff`, b, '✕', 'abs disp')
    on((t) => { red.style.opacity = clamp((t - CUT_T) / 0.08) })
    cue(CUT_T + 0.04 + 0.08 * [...CUT].indexOf(i), 'scratch', 0.8)
  }
  const ki = kept.indexOf(i)
  const xs = track(ki < 0 ? [[0, x0 + i * (BW + BG)]] : [[0, x0 + i * (BW + BG)], [CLOSE_T + 0.1, xk + ki * (BW + BG), SPR.snap]])
  const tin = 14.9 + 0.05 * i
  on((t) => {
    const a = S(t - tin, SPR.pop.f, SPR.pop.z)
    const drop = ki < 0 ? S(t - CLOSE_T, 3, 1) : 0
    const out = S(t - 19.95, SPR.exit.f, SPR.exit.z)
    const op = clamp(Math.min(a, 1) - drop - out)
    b.style.opacity = op
    b.style.visibility = op < 0.003 ? 'hidden' : 'visible'
    b.style.left = xs(t) + 'px'
    b.style.transform = `translateY(${((1 - a) * 40 + drop * 120).toFixed(2)}px) scale(${lerp(0.5, 1, a).toFixed(4)}) rotate(${(drop * (i % 2 ? 14 : -14)).toFixed(2)}deg)`
  })
  return b
})
cue(14.95, 'tick', 0.5); cue(CLOSE_T + 0.15, 'swish', 0.7)
const playhead = mk('div', 'left:0;top:452px;width:4px;height:206px;border-radius:2px;background:#fff;box-shadow:0 0 12px rgba(255,255,255,0.7)', L4, null, 'abs')
on((t) => {
  const p = clamp((t - 15.25) / 1.25)
  playhead.style.left = lerp(x0 - 10, x0 + THUMBS.length * (BW + BG), smooth(p)) + 'px'
  playhead.style.opacity = p > 0 && p < 1 ? 1 : 0
})
at(mk('div', `left:${xk}px;top:700px;display:flex;align-items:center;gap:18px;white-space:nowrap`, L4,
  `<svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="${T.accent}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg><span class="chip disp" style="background:${T.accent};color:#fff;font-size:50px;font-weight:850">handed to Claude</span>`, 'abs'),
  18.72, 20.0, { dy: 20, sc: 0.6, sin: SPR.pop, cue: 'pop' })

// ---------- 5 prompts + skills ----------
const L5 = layer()
at(label(L5, '04 — <b>Prompts + skills</b>'), 20.16, 23.5, { dy: 0, sc: 1 })
const promptCard = mk('div', 'left:60px;top:290px;width:960px;height:230px;background:#141413;padding:30px 40px;box-sizing:border-box', L5,
  `<div class="disp" style="font-size:44px;font-weight:760;color:#fff"><span class="emoji">💬</span> Prompts</div>` +
  `<div class="mono url" style="font-size:27px;line-height:46px;color:#F3EFE6;margin-top:18px"><span style="color:${T.accent}">&gt;</span> edit the new video<br><span style="color:${T.accent}">&gt;</span> use the X post as a sample</div>`, 'abs card')
at(promptCard, 21.22, 23.5, { dy: 60, sc: 0.9, sin: SPR.pop, cue: 'pop' })
const skillCard = mk('div', 'left:60px;top:550px;width:960px;height:520px;background:#141413;padding:30px 40px;box-sizing:border-box', L5,
  `<div class="disp" style="font-size:44px;font-weight:760;color:#fff"><span class="emoji">🧩</span> Skill <span style="color:${T.accent}">reel-editor</span></div>`, 'abs card')
;['reel-editor/', '├─ SKILL.md', '├─ reel/engine.js', '└─ scripts/', '   ├─ transcribe.py', '   ├─ render.mjs', '   └─ mix_audio.py'].forEach((s, i) => {
  const ln = mk('div', `left:40px;top:${106 + i * 56}px;font-size:29px;white-space:pre;color:${i === 1 ? T.accent : '#D8D5CC'}`, skillCard, s, 'abs mono url')
  at(ln, 22.2 + 0.08 * i, 23.5, { dy: 10, sc: 1, blur: 3, cue: i % 2 ? undefined : 'tick', gain: 0.4 })
})
at(skillCard, 22.04, 23.5, { dy: 80, sc: 0.9, sin: SPR.pop, cue: 'pop' })

// ---------- 6 asked claude ----------
const L6 = layer()
const bubble = mk('div', `right:70px;top:236px;max-width:760px;padding:22px 34px;border-radius:36px 36px 10px 36px;background:${T.accent};color:#fff;font-size:52px;font-weight:760;white-space:nowrap;box-shadow:0 24px 60px -20px rgba(0,0,0,0.5)`, L6, 'Edit this video <span class="emoji">✂️</span>', 'abs disp')
at(bubble, 24.15, 26.1, { dy: 30, sc: 0.7, sin: SPR.pop, cue: 'click' })
const typing = mk('div', `left:70px;top:330px;height:78px;padding:0 30px;border-radius:39px 39px 39px 12px;background:#fff;display:flex;align-items:center;gap:16px;color:${T.ink};font-size:36px;font-weight:600;white-space:nowrap`, L6,
  `<span style="color:${T.accent}" class="disp">Claude</span><span class="tdot"></span><span class="tdot"></span><span class="tdot"></span>`, 'abs')
const tdots = [...typing.querySelectorAll('.tdot')]
tdots.forEach((d) => { d.style.cssText = 'width:14px;height:14px;border-radius:7px;background:#9A9AA2;display:inline-block' })
on((t) => tdots.forEach((d, i) => { d.style.transform = `translateY(${(-7 * Math.max(0, Math.sin((t * 2.2 - i * 0.18) * 2 * Math.PI))).toFixed(2)}px)` }))
at(typing, 24.9, 26.1, { dy: 20, sc: 0.7, sin: SPR.pop, cue: 'tick' })

// ---------- 7 reference style: @ajith_io ----------
const L7 = layer()
at(label(L7, '05 — Reference style · <b>@ajith_io</b>'), 26.26, 30.9, { dy: 0, sc: 1 })
const head = mk('div', 'left:90px;top:286px;width:900px;height:208px;border-radius:26px;overflow:hidden;background:#15202B;box-shadow:0 0 0 1.5px rgba(255,255,255,0.14),0 30px 70px -20px rgba(0,0,0,0.7)', L7, null, 'abs')
img('assets/shots/tweet_head.png', 'left:0;top:0;width:900px', head, 'abs')
at(head, 26.3, 30.9, { dy: -40, sc: 0.9, rot: -2, sin: SPR.pop, cue: 'pop', base: 'rotate(-1deg)' })
// tmp/xvid = the whole 15s post video; play its "EVERY FRAME ON PURPOSE" stretch from 1.6s
const vid = mk('div', 'left:40px;top:526px;width:1000px;height:563px;background:#000', L7, null, 'abs card')
const vimg = img('', 'left:0;top:0;width:1000px;height:563px', vid, 'abs')
on((t) => { if (t > 25.9 && t < 31.3) setSrc(vimg, seqFrame('tmp/xvid', 1.6 + (t - 26.4), 450)) })
at(vid, 26.4, 30.9, { dy: 220, dyOut: -40, sc: 0.9, sin: SPR.morph })
at(mk('div', 'left:40px;top:1104px;font-size:19px;color:#6C6C76', L7, 'Video: @ajith_io on X · made with Claude', 'abs mono'), 26.8, 30.9, { dy: 0, sc: 1 })

// ---------- 8 not an ai video model ----------
const L8 = layer()
at(chip(L8, 'AI video generator?', { x: 70, y: 236, bg: '#fff', fg: T.ink, size: 46, css: 'height:80px;box-shadow:0 20px 50px -20px rgba(0,0,0,0.5)' }), 30.86, 34.55, { dy: 26, sc: 0.8, rot: -3, sin: SPR.pop, cue: 'click' })
stamp(L8, '✕ NOT AI VIDEO', { x: 560, y: 372, size: 80, t: 32.55, tout: 34.55 })

// ---------- 9 how it works ----------
const L9 = layer()
at(label(L9, '06 — <b>How it works</b>'), 34.76, 39.0, { dy: 0, sc: 1 })
const row9 = mk('div', 'left:60px;top:286px;display:flex;gap:16px', L9, null, 'abs')
;[['&lt;/&gt; HTML', BLUE, '#fff', 34.86], ['Graphics', T.yellow, T.ink, 36.4], [`<span class="emoji" style="font-size:40px">🔊</span> Sound FX`, T.accent, '#fff', 37.86]].forEach(([h, bg, fg, t]) =>
  at(chip(row9, h, { bg, fg }), t, 39.0, { dy: 30, sc: 0.5, rot: -6, sin: SPR.pop, cue: 'pop' }))
const K = '#FF7AB6', F = '#FFD866', P = '#D8D5CC', C = '#77756E', S_ = '#9BD68F'
at(codeCard(L9, {
  y: 416, h: 470, file: 'edit.js', dot: T.accent, tIn: 35.1, tEnd: 38.7,
  lines: [
    [['// every frame is HTML', C]],
    [['const', K], [' card = ', P], ['mk', F], ['(', P], ["'div'", S_], [', css)', P]],
    [['at', F], ['(card, ', P], ['34.9', T.accent], [')', P], ['  // springs in', C]],
    [['stamp', F], ['(L, ', P], ["'NOT AI VIDEO'", S_], [')', P]],
    [['cue', F], ['(', P], ['37.9', T.accent], [', ', P], ["'whoosh'", S_], [')', P]],
  ],
}), 34.8, 39.0, { dy: 220, dyOut: -40, sc: 0.92, sin: SPR.morph })

// ---------- 10 like a human editor ----------
const L10 = layer()
at(label(L10, '07 — <b>Like a human editor</b>'), 39.1, 43.8, { dy: 0, sc: 1 })
at(text(L10, 'Edits like a', { y: 274, size: 72 }), 39.2, 43.8, { dy: 36 })
at(text(L10, `<span style="color:${T.accent}">human editor</span> <span class="emoji" style="font-size:62px">✂️</span>`, { y: 354, size: 72 }), 39.7, 43.8, { dy: 36, cue: 'pop' })
const nle = mk('div', 'left:60px;top:470px;width:960px;height:400px;background:#141413', L10, null, 'abs card')
const TRACKS = [
  ['V2', [[40, 150, T.accent], [230, 120, BLUE], [400, 170, T.yellow], [620, 110, T.green], [760, 120, T.accent]]],
  ['V1', [[40, 820, '#4A4A52']]],
  ['A1', [[40, 820, '#2C5E46']]],
]
TRACKS.forEach(([name, clips], r) => {
  const y = 40 + r * 112
  mk('div', `left:22px;top:${y + 30}px;font-size:20px;color:#77756E`, nle, name, 'abs mono')
  clips.forEach(([x, w, col]) => mk('div', `left:${x + 60}px;top:${y}px;width:${w}px;height:90px;border-radius:10px;background:${col}`, nle, null, 'abs'))
})
// waveform on A1 and frame ticks on V1
for (let i = 0; i < 82; i++) {
  const hgt = 12 + Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.43)) * 62
  mk('div', `left:${104 + i * 10}px;top:${264 + 45 - hgt / 2}px;width:5px;height:${hgt}px;border-radius:3px;background:#7BD88F`, nle, null, 'abs')
}
for (let i = 0; i < 6; i++) mk('div', `left:${100 + i * 137}px;top:152px;width:128px;height:90px;border-radius:8px;overflow:hidden;background:#333`, nle, `<img src="tmp/face/${pad(140 + i * 260, 5)}.jpg" style="width:128px;height:90px;object-fit:cover;object-position:50% 25%">`, 'abs')
const nlePlay = mk('div', 'left:0;top:24px;width:4px;height:356px;border-radius:2px;background:#fff;box-shadow:0 0 14px rgba(255,255,255,0.8)', nle, null, 'abs')
const kfs = [190, 330, 470, 560, 700, 840].map((x) => ({ x, el: mk('div', `left:${x + 60 - 9}px;top:20px;width:18px;height:18px;background:#fff;transform:rotate(45deg)`, nle, null, 'abs') }))
on((t) => {
  const px = lerp(100, 880, smooth((t - 40.0) / 3.6))
  nlePlay.style.left = px + 'px'
  kfs.forEach((k) => { const a = clamp((px - (k.x + 60)) / 30); k.el.style.opacity = a; k.el.style.transform = `rotate(45deg) scale(${lerp(0.2, 1, a) + 0.4 * pulse((px - (k.x + 60)) / 400, 2)})` })
})
kfs.forEach((k) => cue(40.0 + 3.6 * ((k.x + 60 - 100) / 780) + 0.05, 'tick', 0.45))
at(nle, 39.3, 43.8, { dy: 80, sc: 0.92, sin: SPR.pop })

// ---------- 11 not flagged ----------
const L11 = layer()
at(chip(L11, `Real footage + code graphics <span style="width:46px;height:46px;border-radius:23px;background:${T.green};display:inline-grid;place-items:center"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>`, { x: 70, y: 236, bg: '#fff', fg: T.ink, size: 42, weight: 760, css: 'height:80px;box-shadow:0 20px 50px -20px rgba(0,0,0,0.5)' }),
  44.0, 47.35, { dy: 26, sc: 0.8, rot: -3, sin: SPR.pop, cue: 'pop' })
const aiLabel = mk('div', 'left:70px;top:332px;height:72px;padding:0 30px;border-radius:36px;background:rgba(14,14,17,0.8);color:#fff;font-size:36px;font-weight:600;line-height:72px;white-space:nowrap', L11, 'ⓘ AI info', 'abs')
at(aiLabel, 45.55, 47.35, { dy: 20, sc: 0.7, sin: SPR.pop, cue: 'tick' })
strike(aiLabel, 46.45)
at(mk('div', `left:300px;top:334px;height:68px;padding:0 26px;border-radius:34px;background:${T.red};color:#fff;font-size:36px;font-weight:800;line-height:56px;white-space:nowrap`, L11, 'no label', 'abs disp'),
  46.6, 47.35, { dy: 0, sc: 0.5, rot: -8, sin: SPR.pop, cue: 'click', base: 'rotate(-4deg)' })

// ---------- 12 webinar ----------
const L12 = layer()
at(label(L12, '08 — <b>Webinar</b>'), 47.56, 52.95, { dy: 0, sc: 1 })
const live = mk('div', `left:70px;top:286px;height:62px;padding:0 24px;border-radius:31px;background:${T.red};color:#fff;font-size:28px;line-height:62px;white-space:nowrap`, L12, '<span class="emoji" style="margin-right:12px">🎓</span>WEBINAR', 'abs mono')
at(live, 47.7, 52.95, { dy: 20, sc: 0.6, sin: SPR.pop, cue: 'pop' })
at(text(L12, 'How to edit videos', { y: 380, size: 80, weight: 800 }), 48.2, 52.95, { dy: 40 })
at(text(L12, `with <span style="color:${T.accent}">Claude</span>`, { y: 470, size: 80, weight: 800 }), 48.6, 52.95, { dy: 40, cue: 'tick', gain: 0.6 })
const row12 = mk('div', 'left:70px;top:610px;display:flex;gap:14px', L12, null, 'abs')
stagger(['Prompts', 'Skills', 'Motion graphics'].map((s) => chip(row12, s, { bg: 'transparent', fg: '#fff', size: 34, weight: 650, css: 'height:72px;padding:0 26px;font-family:var(--font-body);box-shadow:inset 0 0 0 2.5px rgba(255,255,255,0.35)' })),
  50.4, 0.12, 52.95, { dy: 24, sc: 0.6, sin: SPR.pop, cue: 'tick' })
at(mk('div', 'left:70px;top:730px;font-size:28px;color:#C9C9D1', L12, 'Comment any emoji → link in DM', 'abs mono'), 51.6, 52.95, { dy: 16 })

// ---------- 13 comment any emoji ----------
const L13 = layer()
const cta = wallCard(L13, `<div class="disp" style="font-size:62px;font-weight:840;line-height:72px">Comment any emoji <span class="emoji">👇</span></div><div style="font-size:32px;font-weight:600;color:#55555E;margin-top:8px">I'll DM you the webinar link</div>`)
at(cta, 53.05, null, { dy: -50, sc: 0.86, rot: 2, sin: SPR.pop, cue: 'pop' })
emojiRise(L13, ['🔥', '🤯', '😍', '🙌', '🚀', '💯', '🔥', '🤩'], { t0: 53.85 })

// ---------- captions (English, translated from the Malayalam; the opening line was unclear, the hook card covers it) ----------
captions([
  [2.44, 4.2, 'This video, motion graphics and all,'],
  [4.2, 5.8, 'was edited by *Claude*.'],
  [6.9, 9.2, '*Claude* edited this video.'],
  [9.3, 12.9, 'It took about *20 minutes*.'],
  [14.2, 16.3, 'I only cut the raw footage,'],
  [16.3, 20.0, 'cut out the bad parts, gave it to *Claude*'],
  [20.3, 23.4, 'with a set of prompts and *skills*.'],
  [24.1, 26.1, 'I asked Claude to edit it'],
  [26.3, 29.9, 'and gave it reference videos for the style.'],
  [31.1, 34.3, 'This is *not* an AI video generation model.'],
  [34.8, 39.0, 'It uses HTML, graphic elements and sound effects.'],
  [39.1, 43.8, '*Claude* edits it just like a human editor.'],
  [43.9, 47.4, 'So it is not flagged as AI-generated content.'],
  [47.6, 52.95, "We're running a *webinar* on editing videos with Claude."],
], { colors: { Claude: T.accent, '20 minutes': T.accent, skills: T.accent, not: T.red, webinar: T.accent } })

// ---------- variants: the same take re-cut in a different order (Instagram trial reels, A/B hooks) ----------
// Every cut sits in a pause (speech runs in audio/outline.txt). A segment that starts just after a layout key opens on
// that layout already in place; one that starts exactly on a key shows the morph.
variants({
  // v1: as recorded. Clawd hook, the story, webinar + comment CTA at the end
  v1: {},
  // v2: Clawd hook, then the webinar straight away, then the story, the comment CTA at the end
  v2: { segments: [[0, 5.8], [47.5, 53.0], [5.8, 47.45], [53.0, 57.1]] },
  // v3: cold open on "this is NOT an AI video model" + stamp, then the Clawd hook, the webinar, the story, the CTA
  v3: { segments: [[31.1, 34.62], [0, 5.8], [47.5, 53.0], [5.8, 30.85], [34.7, 47.45], [53.0, 57.1]] },
})

