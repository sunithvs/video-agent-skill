// Worked example: 35.5s reel about the ArtCraft Crafting Apps (getartcraft.com/apps), Malayalam talking head.
// Assets: X post by @AiwithYasir (embed screenshot + its screen recording as tmp/xvid), the site's app icons and hero
// screenshots, brand fonts Archivo / Inter / Geist Mono (the engine defaults).
// Times come from audio/outline.txt: whisper translate pass for meaning, forced-English pass for loanword timestamps
// (Photoshop 2.18, Lightroom 3.00, After Effects 3.74, Rust 6.1 / 18.1, legal issues 13.6, open source 29.8 ...).

reel({
  name: 'artcraft_reel',
  duration: 35.5,
  face: { frames: META.faceFrames, focus: { x: 540, y: 820 } },
})

// ---------- structure ----------
//  0.0 hook: the X post          2.0 Photoshop / Lightroom / After Effects swaps, 4.5 "etc"
//  5.3 punch-in                  5.9 X screen recording: rust, open source, from scratch
// 10.3 reverse engineering -> 13.5 legal issues stamp
// 15.1 so they rebuilt it in RUST, ultra-fast    20.4 what rust is (code)
// 25.5 twelve apps grid          28.9 100% open source      31.6 send this to your editor friends
faceAt([
  [-1, 'HOOK'],
  [2.0, 'SPLIT'],
  [5.26, 'PUNCH', SPR.punch],
  [5.9, 'PIP'],
  [10.28, 'FULL'],
  [13.5, 'PUNCH', SPR.punch],
  [15.12, 'SPLIT'],
  [20.42, 'PIP'],
  [25.52, 'SPLIT'],
  [31.6, 'PUNCH'],
])

// ---------- 0 hook: the X post, key line highlighted ----------
const L0 = layer()
const tweet = mk('div', 'left:110px;top:226px;width:860px;height:496px;border-radius:30px;overflow:hidden;background:#15202B;box-shadow:0 0 0 1.5px rgba(255,255,255,0.14),0 40px 90px -20px rgba(0,0,0,0.75)', L0, null, 'abs')
img('assets/shots/tweet_crop.png', 'left:0;top:0;width:860px', tweet, 'abs')
highlight(tweet, { x: 20, y: 110, w: 666, t: 0.5 })
at(tweet, -0.22, 1.96, { dy: -60, dyOut: -60, sc: 1.12, rot: -5, sin: SPR.slam, base: 'rotate(-1.2deg)' })
cue(0.04, 'thunk', 0.8)

// ---------- 1 Adobe -> Craft swaps ----------
const L1 = layer()
at(label(L1, '01 — <b>Adobe</b> → Craft'), 2.06, 5.26, { dy: 0, sc: 1 })
const PAIRS = [
  { old: 'Photoshop', neu: 'PhotoCraft', id: 'photocraft', t: 2.12 },
  { old: 'Lightroom', neu: 'LightCraft', id: 'lightcraft', t: 2.94 },
  { old: 'After Effects', neu: 'EffectCraft', id: 'effectcraft', t: 3.68 },
]
const ETC = 4.46, SWAP_OUT = 5.26
const heroCard = mk('div', 'left:90px;top:474px;width:900px;height:420px;background:#000', L1, null, 'abs card')
at(heroCard, 2.02, ETC, { dy: 60, sc: 0.92 })
PAIRS.forEach((p, i) => {
  const tin = p.t - 0.08, tout = i < PAIRS.length - 1 ? PAIRS[i + 1].t - 0.08 : ETC - 0.04
  const old = mk('div', `left:70px;top:276px;font-size:50px;font-weight:600;color:${T.muted}`, L1, `${p.old}<span style="font-family:Inter"> →</span>`, 'abs disp')
  at(old, tin, tout, { dy: 26, dyOut: -20, cue: 'click' })
  strike(old, tin + 0.16)
  const neu = mk('div', 'left:70px;top:346px;display:flex;align-items:center;gap:22px;white-space:nowrap', L1, null, 'abs')
  img(`assets/icons/${p.id}.webp`, 'width:104px;height:104px', neu, 'icon')
  mk('div', 'font-size:88px;font-weight:780;line-height:104px', neu, p.neu.replace('Craft', `<span style="color:${T.accent}">Craft</span>`), 'disp')
  at(neu, tin + 0.06, tout, { dy: 50, dyOut: -30, sc: 0.9, sin: SPR.snap })
  const hero = img(`assets/heroes/${p.id}.webp`, 'left:0;top:0;width:900px;height:420px;object-fit:cover;object-position:50% 0%', heroCard, 'abs')
  at(hero, tin + 0.04, tout + 0.12, { dy: 0, dyOut: 0, sc: 1.06, blur: 0, sout: SPR.line })
})
at(mk('div', `left:70px;top:276px;font-size:50px;font-weight:600;color:${T.muted}`, L1, 'and the rest of the suite', 'abs disp'), ETC, SWAP_OUT, { dy: 26 })
at(mk('div', 'left:70px;top:346px;font-size:88px;font-weight:780;line-height:104px;white-space:nowrap', L1, `+9 more <span style="color:${T.accent}">Crafts</span>`, 'abs disp'), ETC + 0.06, SWAP_OUT, { dy: 50, sc: 0.9, sin: SPR.snap })
const REST = ['vectorcraft', 'filmcraft', 'pdfcraft', 'designcraft', 'wordcraft', 'soundcraft', 'deckcraft', 'cadcraft', 'gridcraft']
const restEls = REST.map((id, i) => {
  const row = i < 5 ? 0 : 1, col = row ? i - 5 : i, n = row ? 4 : 5
  return img(`assets/icons/${id}.webp`, `left:${(1080 - (n * 132 + (n - 1) * 26)) / 2 + col * 158}px;top:${516 + row * 166}px;width:132px;height:132px`, L1, 'abs icon')
})
stagger(restEls, ETC + 0.04, 0.03, SWAP_OUT, { dy: 40, sc: 0.3, rot: -16, sin: SPR.pop, cue: 'tick' })

// ---------- 3 the X screen recording ----------
const L3 = layer()
at(label(L3, '02 — Live on X · <b>@AiwithYasir</b>'), 5.96, 10.28, { dy: 0, sc: 1 })
const chipRow = mk('div', 'left:60px;top:290px;display:flex;gap:16px', L3, null, 'abs')
const crab = `<span style="width:62px;height:62px;margin-left:-16px;border-radius:31px;background:${T.ink};display:grid;place-items:center"><span class="emoji" style="font-size:36px">🦀</span></span>Rust`
;[[crab, T.orange, 6.02], ['Open source', T.green, 6.82], ['From scratch', '#fff', 8.42]].forEach(([html, bg, t]) =>
  at(chip(chipRow, html, { bg }), t, 10.28, { dy: 30, sc: 0.5, rot: -6, sin: SPR.pop, cue: 'pop' }))
// tmp/xvid starts 3.5s into the X video (frames.sh ... 3.5 7.5); play from 4.0s at 5.92
at(browserCard(L3, { y: 418, url: 'getartcraft.com/apps', seq: { dir: 'tmp/xvid', count: 225, from: 0.5, at: 5.92 } }), 5.94, 10.28, { dy: 260, dyOut: -40, sc: 0.9, sin: SPR.morph })
at(mk('div', 'left:40px;top:1080px;font-size:19px;color:#6C6C76', L3, 'Video: @AiwithYasir on X', 'abs mono'), 6.3, 10.28, { dy: 0, sc: 1 })

// ---------- 4 reverse engineering -> legal issues ----------
const L4 = layer()
at(mk('div', `left:70px;top:248px;padding:18px 30px;border-radius:24px;background:#fff;color:${T.ink};font-size:58px;font-weight:740;white-space:nowrap;box-shadow:0 24px 60px -20px rgba(0,0,0,0.5)`, L4, 'Reverse-engineered clones?', 'abs disp'),
  10.46, 15.06, { dy: 30, sc: 0.85, rot: -3, sin: SPR.pop, cue: 'click' })
stamp(L4, '<span class="emoji" style="font-size:70px;vertical-align:6px">⚠️</span> LEGAL ISSUES', { t: 13.52, tout: 15.06 })

// ---------- 5 so they rebuilt it in rust ----------
const L5 = layer()
at(label(L5, '03 — <b>The fix</b>'), 15.2, 20.38, { dy: 0, sc: 1 })
at(text(L5, 'So they rebuilt', { y: 278 }), 15.28, 20.38, { dy: 40, cue: 'tick', gain: 0.6 })
at(text(L5, 'everything in', { y: 364 }), 16.2, 20.38, { dy: 40, cue: 'tick', gain: 0.6 })
at(mk('div', 'left:62px;top:440px;display:flex;align-items:center;gap:26px;white-space:nowrap', L5,
  `<span class="disp" style="font-size:232px;line-height:250px;font-weight:900;font-stretch:125%;color:${T.orange};letter-spacing:-0.04em">RUST</span><span class="emoji" style="font-size:150px">🦀</span>`, 'abs'),
  17.92, 20.38, { dy: 40, sc: 0.55, rot: -4, sin: SPR.pop, cue: 'pop' })
at(chip(L5, '<span class="emoji" style="font-size:48px">⚡</span>Ultra-fast', { x: 70, y: 716, bg: T.yellow, size: 56, weight: 850 }), 18.46, 20.38, { dy: 0, sc: 0.6, sin: SPR.pop })
streaks(L5, { y: 708, t: 18.42 })
at(mk('div', `left:70px;top:846px;font-size:24px;color:${T.muted}`, L5, 'Native · no Electron · no web views', 'abs mono'), 19.25, 20.38, { dy: 16 })

// ---------- 6 what rust is (illustrative code, not ArtCraft's) ----------
const L6 = layer()
at(label(L6, "04 — <b>What's Rust?</b>"), 20.5, 25.5, { dy: 0, sc: 1 })
at(text(L6, 'A language built for', { y: 276, size: 66 }), 20.56, 25.5, { dy: 36 })
at(text(L6, 'fast, optimized software', { y: 350, size: 66, color: T.accent }), 20.7, 25.5, { dy: 36 })
const K = '#FF7AB6', TY = T.accent, F = '#FFD866', P = '#C9C9D1', CM = '#6E6E7A'
at(codeCard(L6, {
  tIn: 21.05, tEnd: 24.75,
  lines: [
    [['// native, memory-safe, fast', CM]],
    [['fn', K], [' main', F], ['() {', P]],
    [['    let', K], [' apps = ', P], ['Craft', TY], ['::', P], ['suite', F], ['();', P]],
    [['    for', K], [' app ', P], ['in', K], [' apps {', P]],
    [['        app.', P], ['launch', F], ['();', P]],
    [['    }', P]],
    [['}', P]],
  ],
}), 20.62, 25.5, { dy: 220, dyOut: -40, sc: 0.92, sin: SPR.morph })

// ---------- 7 the full suite ----------
const L7 = layer()
at(label(L7, '05 — <b>The full suite</b>'), 25.6, 28.88, { dy: 0, sc: 1 })
at(text(L7, `12 apps. One <span style="color:${T.accent}">craft.</span>`, { y: 272, size: 88, weight: 760 }), 25.66, 28.88, { dy: 40 })
const ALL = ['PhotoCraft', 'VectorCraft', 'FilmCraft', 'LightCraft', 'PdfCraft', 'EffectCraft', 'DesignCraft', 'WordCraft', 'SoundCraft', 'DeckCraft', 'CADCraft', 'GridCraft']
stagger(iconGrid(L7, ALL.map((n) => ({ src: `assets/icons/${n.toLowerCase()}.webp`, name: n }))), 26.12, 0.055, 28.88, { dy: 30, sc: 0.3, rot: -14, sin: SPR.pop, cue: 'tick' })

// ---------- 8 open source ----------
const L8 = layer()
at(label(L8, '06 — <b>Open source</b>'), 28.98, 31.5, { dy: 0, sc: 1 })
at(text(L8, '100%', { x: 62, y: 262, size: 210, weight: 900, stretch: 120, css: 'line-height:220px' }), 29.1, 31.5, { dy: 50, sc: 0.7, sin: SPR.pop, cue: 'pop' })
at(text(L8, 'OPEN SOURCE', { x: 66, y: 478, size: 104, weight: 900, stretch: 112, color: T.green, css: 'line-height:116px' }), 29.72, 31.5, { dy: 40, sc: 0.8, sin: SPR.pop, cue: 'pop' })
const chipLine = mk('div', 'left:70px;top:640px;display:flex;gap:14px', L8, null, 'abs')
stagger(['Free', 'macOS', 'Windows', 'Linux', 'Web'].map((s, i) =>
  chip(chipLine, s, { size: 32, weight: 650, bg: i ? 'transparent' : '#fff', fg: i ? '#fff' : T.ink, css: `height:72px;padding:0 26px;font-family:var(--font-body);${i ? 'box-shadow:inset 0 0 0 2.5px rgba(255,255,255,0.35)' : ''}` })),
  30.15, 0.07, 31.5, { dy: 24, sc: 0.6, sin: SPR.pop, cue: 'tick' })
at(mk('div', 'left:70px;top:756px;font-size:26px;color:#C9C9D1', L8, 'Every line on GitHub →', 'abs mono'), 30.62, 31.5, { dy: 16 })
cue(30.66, 'success')

// ---------- 9 send this ----------
const L9 = layer()
const cta = mk('div', `left:70px;top:236px;width:940px;padding:30px 40px 34px;box-sizing:border-box;border-radius:36px;background:#fff;color:${T.ink};box-shadow:0 30px 80px -24px rgba(0,0,0,0.55)`, L9, null, 'abs')
mk('div', 'font-size:38px;font-weight:600;color:#55555E', cta, 'Send this to your')
mk('div', 'font-size:72px;font-weight:820;line-height:82px;margin-top:6px', cta, 'video editor &amp;<br>designer friends', 'disp')
const plane = mk('div', `right:44px;top:56px;width:150px;height:150px;border-radius:75px;background:${T.accent};display:grid;place-items:center`, cta,
  '<svg width="76" height="76" viewBox="0 0 24 24" fill="none" stroke="#0E0E11" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>', 'abs')
on((t) => { const p = pulse(t - 32.9, 2.4); plane.style.transform = `translate(${(10 * p - 6 * pulse(t - 33.8, 2.4)).toFixed(2)}px, ${(-12 * p).toFixed(2)}px) rotate(${(12 * p).toFixed(2)}deg)` })
cue(32.92, 'swish', 0.5)
at(cta, 31.92, null, { dy: -40, sc: 0.86, rot: 2, sin: SPR.pop, cue: 'pop', cueDelay: 0.08 })
at(mk('div', `left:540px;top:556px;height:76px;padding:0 34px;border-radius:38px;background:${T.ink};color:#fff;font-size:32px;line-height:76px;white-space:nowrap;box-shadow:0 0 0 2px rgba(255,255,255,0.2)`, L9, `<span style="color:${T.accent}">●</span>&nbsp; getartcraft.com/apps`, 'abs mono url'),
  34.02, null, { dy: 30, sc: 0.7, sin: SPR.pop, base: 'translateX(-50%)', cue: 'click', cueDelay: 0.08 })

// ---------- captions (English; the speech is Malayalam). no caption under the CTA card: it already says it ----------
captions([
  [0.1, 2.0, 'The complete Adobe suite'],
  [2.0, 3.66, 'Photoshop, Lightroom,'],
  [3.66, 5.2, 'After Effects and more'],
  [6.0, 7.45, 'rebuilt in *Rust*, *open source*,'],
  [7.45, 9.7, 'completely from scratch.'],
  [10.4, 12.75, 'Reverse-engineered apps'],
  [12.75, 14.75, 'run into *legal issues*.'],
  [15.25, 17.05, "That's why they rebuilt it"],
  [17.05, 20.0, 'in *Rust*, as ultra-fast apps.'],
  [20.55, 22.75, 'Rust is a programming language'],
  [22.75, 25.5, 'for fast, optimized software.'],
  [26.2, 28.5, 'They rebuilt the whole suite'],
  [29.15, 31.55, 'and released it as *open source*.'],
], { colors: { Rust: T.orange, 'open source': T.green, 'legal issues': T.red } })
