// Editor kit: the finished edit split into layers a human editor can stack again in Premiere, Resolve, Final Cut,
// CapCut or VN: background, face, one clip per graphics section, captions (.srt + styled), audio stems, a manifest.
// Called by `node scripts/render.mjs kit [--formats prores,key] [--only hook,face] [--zip]` (--only: just those
// passes / sections, e.g. after changing one graphic); the same file ships with reel-editor and
// youtube-editor. render.mjs hands in how it opens pages, renders the master and (long-form) extracts camera frames.
//
// Every pass is rendered by the engine with ?pass=... (see reel/engine.js) and streamed straight into one ffmpeg per
// clip that writes every requested format at once, so no frames touch the disk. Alpha passes are captured as PNG with
// omitBackground; motion blur averages premultiplied colour (plain averaging turns moving white edges grey).
// Afterwards scripts/mix_audio.py --stems writes the audio and scripts/kit.py assembles and checks the kit.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

// format -> how one alpha clip is written. src: 'straight' or 'premult' (what the branch starts from)
const TAGS = 'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv'
const X264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-movflags', '+faststart']
const MAC = process.platform === 'darwin'
export const FORMATS = {
  // Apple's ProRes encoder on a Mac: 3.7x faster than prores_ks, same size, closer to the source (both straight alpha)
  prores: MAC
    ? { ext: 'mov', src: 'straight', vf: `scale=out_color_matrix=bt709:out_range=tv,format=ayuv64le,${TAGS}`, args: ['-c:v', 'prores_videotoolbox', '-profile:v', '4444'], alpha: 'straight', gbPerMin: 1.0 }
    : { ext: 'mov', src: 'straight', vf: `scale=out_color_matrix=bt709:out_range=tv,format=yuva444p10le,${TAGS}`, args: ['-c:v', 'prores_ks', '-profile:v', '4444', '-alpha_bits', '16', '-vendor', 'apl0'], alpha: 'straight', gbPerMin: 1.0 },
  hevc: { ext: 'mov', src: 'premult', vf: `scale=out_color_matrix=bt709:out_range=tv,format=ayuv,${TAGS}`, args: ['-c:v', 'hevc_videotoolbox', '-alpha_quality', '0.9', '-q:v', '65', '-tag:v', 'hvc1'], alpha: 'premultiplied', gbPerMin: 0.03, mac: true },
  rle: { ext: 'mov', src: 'straight', vf: 'format=argb', args: ['-c:v', 'qtrle'], alpha: 'straight', gbPerMin: 0.2 },
  png: { ext: '', src: 'straight', vf: 'format=rgba', args: ['-start_number', '0'], alpha: 'straight', gbPerMin: 0.25 },
  webm: { ext: 'webm', src: 'straight', vf: `scale=out_color_matrix=bt709:out_range=tv,format=yuva420p,${TAGS}`, args: ['-c:v', 'libvpx-vp9', '-crf', '18', '-b:v', '0', '-row-mt', '1', '-auto-alt-ref', '0'], alpha: 'straight', gbPerMin: 0.02 },
  key: { ext: 'mp4', src: 'straight', matte: 'key', args: X264, alpha: 'none (chroma key)', gbPerMin: 0.03 },
  black: { ext: 'mp4', src: 'straight', matte: '0x000000', args: X264, alpha: 'none (Screen blend)', gbPerMin: 0.03 },
}
const ALIAS = { green: 'key' }
// chroma-key colours, in order of preference; each clip gets the first one far from every colour it draws
const KEYS = { green: [0, 177, 64], blue: [0, 71, 187], magenta: [255, 0, 255] }

const sh = (cmd, args, stdio = ['pipe', 'inherit', 'inherit']) => {
  const p = spawn(cmd, args, { stdio })
  p.done = new Promise((res, rej) => p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}: ${args.join(' ').slice(0, 400)}`)))))
  return p
}
// mm-ss-ff for file names, hh:mm:ss:ff (SMPTE, as editors show it) for anything printed
const tc = (f, fps, sep = '-') => (sep === ':' ? [Math.floor(f / fps / 3600)] : []).concat([Math.floor(f / fps / 60) % (sep === ':' ? 60 : 1e9), Math.floor(f / fps) % 60, f % fps]).map((x) => String(x).padStart(2, '0')).join(sep)
const human = (s) => `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s`

function parseArgs(argv) {
  const o = { formats: ['prores', 'key'], zip: false, only: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--formats') o.formats = argv[++i].split(',').map((f) => ALIAS[f.trim()] || f.trim())
    else if (argv[i] === '--zip') o.zip = true
    else if (argv[i] === '--only') o.only = argv[++i].split(',').map((x) => x.trim())
  }
  for (const f of o.formats) if (!FORMATS[f]) throw new Error(`unknown format ${f} (have: ${Object.keys(FORMATS).join(' ')}, green = key)`)
  if (!MAC && o.formats.includes('hevc')) {
    console.log('hevc needs macOS (VideoToolbox): skipped')
    o.formats = o.formats.filter((f) => f !== 'hevc')
  }
  return o
}

// CbCr distance between two colours: how far apart a chroma keyer sees them (brightness barely matters to it)
function chromaDist(a, b) {
  const cb = (c) => -0.1146 * c[0] - 0.3854 * c[1] + 0.5 * c[2], cr = (c) => 0.5 * c[0] - 0.4542 * c[1] - 0.0458 * c[2]
  return Math.hypot(cb(a) - cb(b), cr(a) - cr(b))
}
function pickKey(colors) {
  const used = [...(colors || [])].map((s) => s.split(',').map(Number)).filter((c) => chromaDist(c, [128, 128, 128]) > 25) // greys never clash
  for (const [name, k] of Object.entries(KEYS)) if (used.every((c) => chromaDist(c, k) > 60)) return name
  return Object.entries(KEYS).sort((x, y) => Math.min(...used.map((c) => chromaDist(c, y[1]))) - Math.min(...used.map((c) => chromaDist(c, x[1]))))[0][0]
}

// one pass over every output frame: which sections draw something, their colours, and alpha-unsafe styles
async function scan(page, L) {
  const N = Math.round(L.duration * L.fps)
  const runs = {}, colors = {}, warnings = new Set()
  const t0 = Date.now()
  for (let f = 0; f < N; f++) {
    await page.evaluate((t) => window.seek(t), f / L.fps)
    const r = await page.evaluate((k) => ({ vis: window.visibleSections(), col: k % 5 === 0 ? window.sectionColors() : null, warn: k % 10 === 0 ? window.alphaWarnings() : [] }), f)
    for (const id of r.vis) { const rs = (runs[id] ||= []); const last = rs[rs.length - 1]; if (last && last[1] === f) last[1] = f + 1; else rs.push([f, f + 1]) }
    if (r.col) for (const [id, cs] of Object.entries(r.col)) for (const c of cs) (colors[id] ||= new Set()).add(c)
    for (const w of r.warn) warnings.add(w)
  }
  console.log(`scanned ${N} frames for sections in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  return { runs, colors, warnings: [...warnings] }
}

// output frame -> camera frame, as the engine's toSource() picks it
function sourceFrame(tl, f) {
  const t = f / tl.fps
  let ts = t
  if (tl.segments) {
    const k = Math.round(t * tl.fps) / tl.fps
    let sg = tl.segments[tl.segments.length - 1]
    for (const s of tl.segments) if (k < s[2] + (s[1] - s[0]) - 1e-6) { sg = s; break }
    ts = sg[0] + (t - sg[2])
  }
  return Math.max(0, Math.round(ts * tl.fps))
}

function filterFor(fmt, inLabel, outLabel, o) {
  const F = FORMATS[fmt]
  if (!F.matte) return `[${inLabel}]${F.vf}[${outLabel}]`
  const hex = F.matte === 'key' ? '0x' + KEYS[o.key].map((v) => v.toString(16).padStart(2, '0')).join('') : F.matte
  return `color=c=${hex}:s=${o.w}x${o.h}:r=${o.fps},format=rgb24[${outLabel}c];[${outLabel}c][${inLabel}]overlay=format=rgb:shortest=1,` +
    `scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,${TAGS}[${outLabel}]`
}

// Screenshots serialize inside one browser (6 pages there capture only ~2x faster than one), so kit passes use a
// pool of browsers: KIT_BROWSERS (default 4) x KIT_PAGES (default 3) pages, 2.4x faster than 1 x 6 on the face pass.
const BROWSERS = Number(process.env.KIT_BROWSERS || 4), PER = Number(process.env.KIT_PAGES || 3)
async function openPages(ctx, q) {
  ctx.pool ||= await Promise.all(Array.from({ length: BROWSERS }, () => ctx.launch()))
  return Promise.all(ctx.pool.flatMap((b) => Array.from({ length: PER }, () => ctx.openPage(q, b))))
}

// Render frames [f0, f1) of one pass into `outs` ([{ fmt, file }], or [{ fmt: 'h264', file }] for opaque passes).
async function renderClip(ctx, clip, outs) {
  const { fps, w, h } = ctx
  const SUB = ctx.sub, SHUTTER = ctx.shutter
  const alpha = clip.pass !== 'background'
  const q = `pass=${clip.pass}${clip.section ? `&section=${encodeURIComponent(clip.section)}` : ''}`
  const pages = await openPages(ctx, q)
  // alpha frames: raw CDP with a transparent default background set once per page and fast PNG encoding (3.5x faster
  // than page.screenshot({ omitBackground }) on camera pixels, same pixels). Playwright's omitBackground resets the
  // override after every shot, so the two are never mixed on one page.
  const grab = await Promise.all(pages.map(async (page) => {
    if (!alpha) return () => page.screenshot({ type: 'jpeg', quality: 96, animations: 'disabled' })
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
    return async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })).data, 'base64')
  }))
  const L = ['-hide_banner', '-loglevel', 'error', '-y']
  const blur = SUB > 1 ? `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/(${fps}*TB)` : 'null'
  const parts = outs.map((o) => ({ ...o, part: o.fmt === 'png' ? `${o.file}.part` : o.file.replace(/(\.\w+)$/, '.part$1') }))
  let sink, done
  if (!alpha) {
    const ff = sh('ffmpeg', [...L, '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps * SUB), '-i', '-',
      '-vf', `${blur},format=rgb24,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,${TAGS}`, '-r', String(fps), ...X264, parts[0].part]) // as the master: BT.601 JPEG -> RGB -> BT.709
    sink = ff.stdin; done = ff.done
  } else {
    // Chrome writes fully opaque frames as RGB PNGs; a format change mid-stream would re-init the filter graph and
    // break tmix's subframe groups, so stage 1 turns every frame into raw RGBA first
    const dec = sh('ffmpeg', [...L, '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(fps * SUB), '-i', '-', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], ['pipe', 'pipe', 'inherit'])
    const st = parts.filter((p) => FORMATS[p.fmt].src === 'straight'), pm = parts.filter((p) => FORMATS[p.fmt].src === 'premult')
    if (pm.length > 1) throw new Error('only one premultiplied format per clip')
    const head = `[0:v]premultiply=inplace=1,${blur}`
    const g = [st.length && pm.length ? `${head},split=2[pm0][x]` : pm.length ? `${head}[pm0]` : `${head}[x]`]
    if (st.length) g.push(`[x]unpremultiply=inplace=1${st.length > 1 ? `,split=${st.length}${st.map((_, i) => `[s${i}]`).join('')}` : '[s0]'}`)
    const maps = []
    st.forEach((p, i) => { g.push(filterFor(p.fmt, `s${i}`, `o${i}`, { ...ctx, key: clip.key })); maps.push([`o${i}`, p]) })
    pm.forEach((p, i) => { g.push(filterFor(p.fmt, `pm${i}`, `q${i}`, ctx)); maps.push([`q${i}`, p]) })
    const graph = g.join(';')
    const args = [...L, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-video_size', `${w}x${h}`, '-framerate', String(fps * SUB), '-i', '-', '-filter_complex', graph]
    for (const [label, p] of maps) {
      if (p.fmt === 'png') fs.mkdirSync(p.part, { recursive: true })
      args.push('-map', `[${label}]`, '-r', String(fps), ...FORMATS[p.fmt].args, p.fmt === 'png' ? path.join(p.part, `${path.basename(p.file)}_%05d.png`) : p.part)
    }
    const enc = sh('ffmpeg', args)
    dec.stdout.pipe(enc.stdin)
    sink = dec.stdin; done = Promise.all([dec.done, enc.done])
  }
  // subframes in order into the pipe, from all pages at once
  const s0 = clip.f0 * SUB, s1 = clip.f1 * SUB
  const ready = new Map()
  let next = s0, writing = Promise.resolve()
  const flush = async () => {
    while (ready.has(next)) {
      const buf = ready.get(next)
      ready.delete(next)
      next++
      if (!sink.write(buf)) await new Promise((r) => sink.once('drain', r))
      if ((next - s0) % (300 * SUB * fps / 30) === 0) console.log(`  ${clip.base}: frame ${Math.round(next / SUB)}/${clip.f1} (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
    }
  }
  const t0 = Date.now()
  const batch = Math.round((ctx.batchSeconds || 60) * fps)
  for (let b0 = clip.f0; b0 < clip.f1; b0 += batch) {
    const b1 = Math.min(clip.f1, b0 + batch)
    const camera = clip.pass === 'face' || clip.pass === 'background' // only these draw camera frames
    if (camera) await ctx.prepareFrames(b0, b1)
    await Promise.all(pages.map(async (page, wi) => {
      for (let i = b0 * SUB + wi; i < b1 * SUB; i += pages.length) {
        while (i - next > pages.length * 8) await new Promise((r) => setTimeout(r, 5)) // bounded memory
        const k = Math.floor(i / SUB), j = i % SUB
        const t = (k + ((j - (SUB - 1) / 2) * SHUTTER) / SUB) / fps
        await page.evaluate((tt) => window.seek(tt), Math.max(0, t))
        ready.set(i, await grab[wi]())
        writing = writing.then(flush)
      }
    }))
    await writing
    if (camera) ctx.releaseFrames?.()
  }
  if (next !== s1) throw new Error(`pipe stopped at subframe ${next} of ${s1}`)
  sink.end()
  await done
  await Promise.all(pages.map((p) => p.close()))
  for (const p of parts) { fs.rmSync(p.file, { recursive: true, force: true }); fs.renameSync(p.part, p.file) }
}

// the raw camera re-cut like the edit (one run per stretch of consecutive camera frames), frame-exact, 10 ms audio
// fades at every join, fitted into the output size
async function cameraCut(ctx, file) {
  const src = path.join(ctx.root, 'source', 'edit.mp4')
  if (!fs.existsSync(src)) return console.log('no source/edit.mp4: no camera cut')
  const { tl, fps, w, h } = ctx
  const N = Math.round(tl.duration * fps), runs = []
  for (let f = 0; f < N; f++) {
    const s = sourceFrame(tl, f), r = runs[runs.length - 1]
    if (r && s === r[1]) r[1]++; else runs.push([s, s + 1])
  }
  const dir = path.join(path.dirname(file), 'camera_parts')
  fs.mkdirSync(dir, { recursive: true })
  const list = []
  for (const [i, [a, b]] of runs.entries()) {
    const part = path.join(dir, `${String(i).padStart(4, '0')}.mov`), d = (b - a) / fps
    list.push(part)
    if (fs.existsSync(part)) continue
    // video seeks a quarter frame early so frame a is the first one kept; audio seeks exactly
    await sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', ((a - 0.25) / fps).toFixed(5), '-i', src, '-ss', (a / fps).toFixed(5), '-i', src,
      '-map', '0:v:0', '-map', '1:a:0?', '-frames:v', String(b - a), '-t', d.toFixed(5),
      '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,${TAGS}`,
      '-af', `afade=t=in:d=0.01,afade=t=out:st=${Math.max(0, d - 0.01).toFixed(5)}:d=0.01`,
      '-r', String(fps), '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-c:a', 'pcm_s16le', '-ar', '48000', part + '.tmp.mov'], ['ignore', 'inherit', 'inherit']).done
    fs.renameSync(part + '.tmp.mov', part)
  }
  const listFile = path.join(dir, 'list.txt')
  fs.writeFileSync(listFile, list.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n') + '\n')
  await sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', file], ['ignore', 'inherit', 'inherit']).done
  fs.rmSync(dir, { recursive: true, force: true })
  console.log(`camera cut: ${runs.length} run${runs.length > 1 ? 's' : ''} of camera frames`)
}

export async function renderKit(ctx) {
  const opts = parseArgs(ctx.args)
  const { root, tl } = ctx
  const kitDir = path.join(root, 'out', 'kit', tl.name)
  const page = await ctx.openPage('')
  const L = await page.evaluate(() => window.layers())
  const hasFace = await page.evaluate(() => !!(REEL.face && FACE))
  // caption colours (white, the box, *highlighted* words) for the captions clip's key colour
  ctx.capColors = page.evaluate(() => [...new Set([...document.querySelectorAll('#caps span, #caps i')].flatMap((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor])
    .map((c) => (c.match(/[\d.]+/g) || []).slice(0, 3).join(',')))])
  const fps = L.fps, w = L.width, h = L.height, N = Math.round(L.duration * fps)
  Object.assign(ctx, { fps, w, h })

  // a changed edit means a new kit; a new format only adds files
  const sigFile = path.join(kitDir, 'kit.sig')
  if (fs.existsSync(sigFile) && fs.readFileSync(sigFile, 'utf8') !== ctx.signature) fs.rmSync(kitDir, { recursive: true, force: true })
  fs.mkdirSync(path.join(kitDir, '03_graphics'), { recursive: true })
  fs.writeFileSync(sigFile, ctx.signature)

  const sc = await scan(page, L)
  await page.close()

  // clips: full-length layers, then one clip per run of frames a graphics section is on screen
  const clips = [{ pass: 'background', f0: 0, f1: N, base: '01_background', opaque: true }]
  if (hasFace) clips.push({ pass: 'face', f0: 0, f1: N, base: '02_face' })
  if (ctx.captions && tl.captions?.length) clips.push({ pass: 'captions', f0: 0, f1: N, base: '04_captions' })
  let n = 0
  const gap = Math.round(0.5 * fps), padF = 1
  for (const s of L.sections.filter((x) => !x.under)) {
    let rs = s.fixed ? s.fixed.map(([a, b]) => [Math.floor(a * fps), Math.min(N, Math.ceil(b * fps))]) : (sc.runs[s.id] || [])
    rs = rs.reduce((acc, r) => { const l = acc[acc.length - 1]; if (l && r[0] - l[1] <= gap) l[1] = r[1]; else acc.push([...r]); return acc }, [])
    for (const [a, b] of rs) {
      const f0 = Math.max(0, a - padF), f1 = Math.min(N, b + padF)
      clips.push({ pass: 'graphics', section: s.id, f0, f1, key: pickKey(sc.colors[s.id]), base: `03_graphics/${String(++n).padStart(2, '0')}_${s.id}_${tc(f0, fps)}` })
    }
  }
  const capColors = await ctx.capColors
  for (const c of clips) c.key ||= c.pass === 'captions' ? pickKey(capColors) : 'green'
  const fileFor = (c, fmt) => path.join(kitDir, c.opaque ? `${c.base}.mp4` : `${c.base}_${fmt === 'key' ? c.key : fmt}${FORMATS[fmt].ext ? '.' + FORMATS[fmt].ext : ''}`)

  // plan: what renders, how long, how much disk
  const subframes = clips.reduce((s, c) => s + (c.f1 - c.f0) * ctx.sub, 0)
  const msPer = { background: 13, face: 20, captions: 13, graphics: 13 } // per subframe, default pool, 1080x1920 (rough)
  const secs = clips.reduce((s, c) => s + ((c.f1 - c.f0) * ctx.sub * msPer[c.pass]) / 1000, 0)
  const gb = clips.filter((c) => !c.opaque).reduce((s, c) => s + opts.formats.reduce((t, f) => t + FORMATS[f].gbPerMin * (c.pass === 'captions' ? 0.15 : c.pass === 'face' ? 1.2 : 0.6), 0) * (c.f1 - c.f0) / fps / 60, 0)
  console.log(`\neditor kit ${tl.name}: ${w}x${h} ${fps} fps, ${human(L.duration)}, formats ${opts.formats.join(',')}`)
  for (const c of clips) console.log(`  ${c.base.padEnd(40)} ${tc(c.f0, fps, ':')}-${tc(c.f1, fps, ':')} ${String(c.f1 - c.f0).padStart(5)} frames${c.pass === 'graphics' && opts.formats.includes('key') ? `  key ${c.key}` : ''}`)
  console.log(`  ${subframes} subframes, about ${human(secs)} to render, about ${gb.toFixed(1)} GB of layers`)
  if (sc.warnings.length) console.log(`  alpha-unsafe styles (drawn as normal blending / no backdrop blur in the layers):\n    ${sc.warnings.join('\n    ')}`)
  const free = fs.statfsSync(root).bavail * fs.statfsSync(root).bsize / 1e9
  if (gb > free - 2) throw new Error(`about ${gb.toFixed(1)} GB needed, ${free.toFixed(1)} GB free: use --formats hevc,key (small) or free some space`)

  await ctx.ensureMaster()

  const started = Date.now()
  for (const c of clips) {
    if (opts.only && !opts.only.includes(c.pass) && !opts.only.includes(c.section)) continue
    const outs = c.opaque ? [{ fmt: 'h264', file: fileFor(c) }] : opts.formats.map((fmt) => ({ fmt, file: fileFor(c, fmt) }))
    const missing = outs.filter((o) => !fs.existsSync(o.file))
    if (!missing.length) { console.log(`${c.base}: reused`); continue }
    const t0 = Date.now()
    await renderClip(ctx, c, missing)
    console.log(`${c.base}: ${c.f1 - c.f0} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  }
  const cam = path.join(kitDir, '02_camera_cut.mp4')
  if (!fs.existsSync(cam) && !opts.only) await cameraCut(ctx, cam)
  console.log(`layers rendered in ${human((Date.now() - started) / 1000)}`)
  await Promise.all((ctx.pool || []).map((b) => b.close()))

  const kit = {
    name: tl.name, variant: tl.variant || null, width: w, height: h, fps, duration: L.duration, frames: N, sub: ctx.sub,
    formats: Object.keys(FORMATS).filter((f) => clips.some((c) => !c.opaque && fs.existsSync(fileFor(c, f)))),
    segments: L.segments, captions: tl.captions || [], chapters: tl.chapters || [], warnings: sc.warnings, master: ctx.masterFile, audio: ctx.audioFile, zip: opts.zip,
    clips: clips.map((c) => ({ pass: c.pass, section: c.section || null, f0: c.f0, f1: c.f1, key: c.pass === 'face' || c.pass === 'captions' || c.pass === 'graphics' ? c.key : null,
      files: c.opaque ? [{ path: path.relative(kitDir, fileFor(c)), format: 'h264', alpha: 'none' }]
        : Object.keys(FORMATS).filter((f) => fs.existsSync(fileFor(c, f))).map((f) => ({ path: path.relative(kitDir, fileFor(c, f)), format: f === 'key' ? `key-${c.key}` : f, alpha: FORMATS[f].alpha })) })),
  }
  fs.writeFileSync(path.join(kitDir, 'kit.json'), JSON.stringify(kit, null, 2))
  return kitDir
}
