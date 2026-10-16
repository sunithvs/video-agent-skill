// Renders index.html (seek(t) per frame) for long videos: chunked, frames streamed straight into ffmpeg, camera
// frames extracted on demand, resumable.
//
//   node scripts/render.mjs stills 12 95 301   -> out/stills.jpg, those output times side by side
//   node scripts/render.mjs sheet [step]       -> out/sheet.jpg, a frame every `step` seconds (default: 1/48 of the video)
//   node scripts/render.mjs still 12.3         -> out/still.png
//   node scripts/render.mjs full               -> out/<name>.mp4 (+ out/<name>_preview.mp4 when the video is short)
//   node scripts/render.mjs thumb              -> out/<name>_thumbnail.png (1280x720, from thumbnail() in edit.js)
//   node scripts/render.mjs mux                -> swap a new audio mix into out/<name>.mp4
//   node scripts/render.mjs frames             -> extract every camera frame (only for live preview in a browser)
//   node scripts/render.mjs kit [--formats hevc,key] [--zip]
//                                              -> out/kit/<name>/: the edit as layers for a human editor (background,
//                                                 face, one clip per graphics section, captions, audio stems, README).
//                                                 Formats: prores hevc rle png webm key black (see scripts/kit.mjs).
//                                                 ProRes runs about 1 GB per minute per layer: long videos want hevc,key
//   VARIANT=v2 ... / CAPTIONS=1 (burn captions; off by default, YouTube gets the .srt) / CHUNK=60 / SUB=2 / WORKERS=6
//
// Every run writes out/cues.json and out/cues_<name>.json (cues, segments, chapters) for mix_audio.py / youtube.py.
// Chunks (out/chunks/<name>/NNNN.mp4) are reused when edit.js and its inputs did not change, so an interrupted or
// re-run render only redoes what is missing. SUB subframes per frame over a 180-degree shutter give motion blur;
// long videos default to 2 (talking heads barely move; raise it for graphic-heavy edits).
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const root = path.resolve(import.meta.dirname, '..')
const outDir = path.join(root, 'out')
const faceDir = path.join(root, 'tmp', 'face')
const SRC = path.join(root, 'source', 'edit.mp4')
const SUB = Number(process.env.SUB || 2)
const SHUTTER = Number(process.env.SHUTTER || 0.5)
const WORKERS = Number(process.env.WORKERS || 6)
const CHUNK = Number(process.env.CHUNK || 60)
const CAPTIONS = process.env.CAPTIONS === '1'
// Chrome's JPEGs are BT.601 full range: frames go through RGB to BT.709 limited, tagged inside the filter graph
// (ffmpeg 8.1 ignores the -color_* output flags on this path, and relabelling without converting shifts reds)
const TAGS = 'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv'
const VARIANT = process.env.VARIANT || ''

function run(cmd, args, quiet = false) {
  return new Promise((resolve, reject) => {
    if (!quiet) console.log(`$ ${cmd} ${args.join(' ').slice(0, 300)}`)
    const p = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] })
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
  })
}
async function launch() {
  try { return await chromium.launch({ channel: 'chrome' }) } catch { return chromium.launch() }
}
async function openPage(browser, size, query = '') {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 })
  await page.addInitScript(() => { window.__RENDER__ = true })
  page.on('pageerror', (e) => console.error('pageerror', e))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) console.error('console', m.text()) })
  const url = pathToFileURL(path.join(root, 'index.html'))
  const q = new URLSearchParams(query)
  if (VARIANT) q.set('variant', VARIANT)
  url.search = q.toString()
  await page.goto(url.href)
  await page.evaluate(() => window.ready())
  await page.evaluate((c) => window.configure({ captions: c }), CAPTIONS)
  return page
}

// ---------- output time -> camera frame (mirrors toSource in the engine) ----------
function sourceFrame(tl, t) {
  let ts = t
  if (tl.segments) {
    const k = Math.round(t * tl.fps) / tl.fps
    let sg = tl.segments[tl.segments.length - 1]
    for (const s of tl.segments) if (k < s[2] + (s[1] - s[0]) - 1e-6) { sg = s; break }
    ts = sg[0] + (t - sg[2])
  }
  return Math.max(0, Math.min(tl.face.frames - 1, Math.round(ts * tl.fps)))
}
// extract exactly these camera frames into tmp/face (contiguous runs = one ffmpeg call each)
async function extractFrames(tl, indices) {
  if (!tl.face) return
  fs.mkdirSync(faceDir, { recursive: true })
  const need = [...new Set(indices)].filter((i) => !fs.existsSync(path.join(faceDir, `${String(i).padStart(tl.face.digits, '0')}.jpg`))).sort((a, b) => a - b)
  const runs = []
  for (const i of need) { const r = runs[runs.length - 1]; if (r && i === r[1] + 1) r[1] = i; else runs.push([i, i]) }
  for (const [a, b] of runs) {
    await run('ffmpeg', ['-v', 'error', '-y', '-ss', (a / tl.fps).toFixed(4), '-i', SRC, '-frames:v', String(b - a + 1), '-q:v', '2',
      '-start_number', String(a), path.join(faceDir, `%0${tl.face.digits}d.jpg`)], true)
  }
}
const clearFrames = () => { fs.rmSync(faceDir, { recursive: true, force: true }); fs.mkdirSync(faceDir, { recursive: true }) }

async function shot(page, t, type = 'jpeg') {
  await page.evaluate((tt) => window.seek(tt), t)
  return page.screenshot({ type, ...(type === 'jpeg' ? { quality: 92 } : {}), animations: 'disabled' })
}
async function tile(files, cols, w, h, out) {
  const dir = path.dirname(files[0])
  await run('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', path.join(dir, '%03d.jpg'),
    '-vf', `scale=${w}:${h},tile=${cols}x${Math.ceil(files.length / cols)}:padding=6:color=white`, '-frames:v', '1', '-q:v', '3', out])
}
// a signature of everything that changes the picture, so unchanged chunks are reused
function signature(tl) {
  const h = crypto.createHash('sha1')
  for (const f of ['index.html', 'edit.js', 'reel/engine.js', 'reel/engine.css', 'tmp/meta.js', 'tmp/cuts.js', 'scripts/render.mjs']) {
    const p = path.join(root, f)
    if (fs.existsSync(p)) h.update(fs.readFileSync(p))
  }
  h.update(JSON.stringify([tl.width, tl.height, tl.fps, SUB, SHUTTER, CAPTIONS, VARIANT]))
  return h.digest('hex').slice(0, 12)
}

async function renderChunk(pages, tl, f0, f1, file) {
  const fps = tl.fps
  await extractFrames(tl, Array.from({ length: f1 - f0 }, (_, k) => sourceFrame(tl, (f0 + k) / fps)))
  const vf = SUB > 1 ? ['-vf', `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/(${fps}*TB),format=rgb24,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,${TAGS}`] : ['-vf', `format=rgb24,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,${TAGS}`]
  const enc = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps * SUB), '-i', '-', ...vf,
    '-r', String(fps), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high', '-g', String(fps * 2),
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', file], { stdio: ['pipe', 'inherit', 'inherit'] })
  const done = new Promise((res, rej) => enc.on('exit', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))))
  const s0 = f0 * SUB, s1 = f1 * SUB
  const ready = new Map()
  let next = s0
  const flush = async () => {
    while (ready.has(next)) {
      const buf = ready.get(next)
      ready.delete(next)
      next++
      if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r))
    }
  }
  let writing = Promise.resolve()
  await Promise.all(pages.map(async (page, w) => {
    for (let i = s0 + w; i < s1; i += pages.length) {
      while (i - next > pages.length * 8) await new Promise((r) => setTimeout(r, 5)) // keep memory bounded
      const k = Math.floor(i / SUB), j = i % SUB
      const t = (k + ((j - (SUB - 1) / 2) * SHUTTER) / SUB) / fps
      ready.set(i, await shot(page, Math.max(0, t)))
      writing = writing.then(flush)
    }
  }))
  await writing
  enc.stdin.end()
  await done
}

async function main() {
  const mode = process.argv[2] || 'sheet'
  fs.mkdirSync(outDir, { recursive: true })
  const browser = await launch()
  // read the timeline at the default size first, then reopen at the video's size
  let first = await openPage(browser, { width: 1920, height: 1080 })
  const tl = await first.evaluate(() => window.timeline())
  const size = { width: tl.width, height: tl.height }
  await first.close()
  first = await openPage(browser, size)
  fs.writeFileSync(path.join(outDir, 'cues.json'), JSON.stringify(tl, null, 2))
  fs.writeFileSync(path.join(outDir, `cues_${tl.name}.json`), JSON.stringify(tl, null, 2))
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  console.log(`${tl.name}: ${tl.width}x${tl.height} ${fmt(tl.duration)} (${tl.duration}s) cues=${tl.cues.length}${tl.segments ? ` segments=${tl.segments.length}` : ''} chapters=${tl.chapters.length}`)
  const name = tl.name + (CAPTIONS ? '_captions' : '')
  const final = path.join(outDir, `${name}.mp4`)
  const audioFile = path.join(root, 'audio', tl.variant ? `mix_${tl.name}.wav` : 'mix.wav')

  async function full() {
    const frames = Math.round(tl.duration * tl.fps)
    const per = Math.round(CHUNK * tl.fps)
    const sig = signature(tl)
    const chunkDir = path.join(outDir, 'chunks', name)
    fs.mkdirSync(chunkDir, { recursive: true })
    const sigFile = path.join(chunkDir, 'signature.txt')
    if (!fs.existsSync(sigFile) || fs.readFileSync(sigFile, 'utf8') !== `${sig} ${per}`) {
      for (const f of fs.readdirSync(chunkDir)) fs.rmSync(path.join(chunkDir, f))
      fs.writeFileSync(sigFile, `${sig} ${per}`)
    }
    const pages = [first, ...(await Promise.all(Array.from({ length: WORKERS - 1 }, () => openPage(browser, size))))]
    const list = []
    const started = Date.now()
    const nChunks = Math.ceil(frames / per)
    for (let c = 0; c < nChunks; c++) {
      const f0 = c * per, f1 = Math.min(frames, f0 + per)
      const file = path.join(chunkDir, `${String(c).padStart(4, '0')}.mp4`)
      list.push(file)
      if (fs.existsSync(file) && fs.statSync(file).size > 0) { console.log(`chunk ${c + 1}/${nChunks} reused`); continue }
      const t0 = Date.now()
      clearFrames()
      await renderChunk(pages, tl, f0, f1, file + '.part.mp4')
      fs.renameSync(file + '.part.mp4', file)
      const el = (Date.now() - started) / 1000, done = (c + 1) / nChunks
      console.log(`chunk ${c + 1}/${nChunks} ${fmt(f0 / tl.fps)}-${fmt(f1 / tl.fps)} in ${((Date.now() - t0) / 1000).toFixed(0)}s (eta ${fmt(el / done - el)})`)
    }
    clearFrames()
    const listFile = path.join(chunkDir, 'list.txt')
    fs.writeFileSync(listFile, list.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n') + '\n')
    const hasAudio = fs.existsSync(audioFile)
    if (!hasAudio) console.log(`no ${path.relative(root, audioFile)} yet: video only (run scripts/mix_audio.py, then render.mjs mux)`)
    await run('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, ...(hasAudio ? ['-i', audioFile] : []),
      '-map', '0:v', ...(hasAudio ? ['-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest'] : []), '-c:v', 'copy', '-movflags', '+faststart', final])
    console.log(`wrote out/${name}.mp4 in ${fmt((Date.now() - started) / 1000)}`)
    if (tl.duration <= 180) {
      await run('ffmpeg', ['-v', 'error', '-y', '-i', final, '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', path.join(outDir, `${name}_preview.mp4`)])
    }
  }

  if (mode === 'variants') {
    console.log(tl.variants.join(' '))
  } else if (mode === 'frames') {
    await extractFrames(tl, Array.from({ length: tl.face.frames }, (_, i) => i))
    console.log(`extracted ${tl.face.frames} camera frames into tmp/face (open index.html to preview)`)
  } else if (mode === 'still' || mode === 'stills' || mode === 'sheet') {
    let ts = []
    if (mode === 'still') ts = [Number(process.argv[3] || 0)]
    else if (mode === 'stills') ts = process.argv.slice(3).map(Number)
    else { const step = Number(process.argv[3] || Math.max(1, tl.duration / 48)); for (let t = 0; t < tl.duration; t += step) ts.push(+t.toFixed(3)) }
    await extractFrames(tl, ts.map((t) => sourceFrame(tl, t)))
    if (mode === 'still') {
      fs.writeFileSync(path.join(outDir, 'still.png'), await shot(first, ts[0], 'png'))
      console.log('wrote out/still.png')
    } else {
      const dir = path.join(root, 'tmp', mode)
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(dir, { recursive: true })
      const files = []
      for (const [i, t] of ts.entries()) { const f = path.join(dir, `${String(i).padStart(3, '0')}.jpg`); fs.writeFileSync(f, await shot(first, t)); files.push(f) }
      const land = tl.width > tl.height
      if (mode === 'stills') await tile(files, Math.min(land ? 3 : 5, ts.length), land ? 960 : 540, land ? 540 : 960, path.join(outDir, 'stills.jpg'))
      else await tile(files, land ? 8 : 10, land ? 320 : 216, land ? 180 : 384, path.join(outDir, 'sheet.jpg'))
      console.log(`wrote out/${mode === 'stills' ? 'stills' : 'sheet'}.jpg (${ts.length} frames: ${ts.slice(0, 12).join(', ')}${ts.length > 12 ? ' ...' : ''})`)
    }
  } else if (mode === 'thumb') {
    const page = await openPage(browser, { width: 1280, height: 720 }, 'thumb=1')
    await page.evaluate(() => window.thumbMode())
    const want = await page.evaluate(() => [...document.querySelectorAll('#layers img')].map((i) => i.getAttribute('src')).filter((s) => s && s.startsWith('tmp/face/')))
    await extractFrames(tl, want.map((s) => Number(path.basename(s, '.jpg'))))
    await page.reload()
    await page.evaluate(() => window.ready())
    await page.evaluate(() => window.thumbMode())
    await page.evaluate(() => Promise.all([...document.images].filter((i) => i.getAttribute('src')).map((i) => i.decode().catch(() => {}))))
    const file = path.join(outDir, `${tl.name}_thumbnail.png`)
    await page.screenshot({ path: file, type: 'png', clip: { x: 0, y: 0, width: 1280, height: 720 } })
    console.log(`wrote ${path.relative(root, file)}`)
  } else if (mode === 'mux') {
    const tmp = path.join(outDir, 'mux_tmp.mp4')
    await run('ffmpeg', ['-v', 'error', '-y', '-i', final, '-i', audioFile, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', tmp])
    fs.renameSync(tmp, final)
    console.log(`remuxed out/${name}.mp4`)
  } else if (mode === 'full') {
    await full()
  } else if (mode === 'kit') {
    const { renderKit } = await import('./kit.mjs')
    const sig = signature(tl), per = Math.round(CHUNK * tl.fps)
    const sigFile = path.join(outDir, 'chunks', name, 'signature.txt')
    const kitDir = await renderKit({
      root, tl, args: process.argv.slice(3), sub: SUB, shutter: SHUTTER, workers: WORKERS, captions: CAPTIONS,
      signature: sig, masterFile: final, audioFile, batchSeconds: CHUNK,
      launch, openPage: (q, b = browser) => openPage(b, size, q),
      // camera frames are extracted per batch and cleared after, as in full renders, so long kits don't fill the disk
      prepareFrames: async (f0, f1) => { clearFrames(); await extractFrames(tl, Array.from({ length: f1 - f0 }, (_, k) => sourceFrame(tl, (f0 + k) / tl.fps))) },
      releaseFrames: clearFrames,
      ensureMaster: async () => {
        if (fs.existsSync(final) && fs.existsSync(sigFile) && fs.readFileSync(sigFile, 'utf8') === `${sig} ${per}`) return console.log(`master: out/${name}.mp4 is current`)
        console.log(`master: out/${name}.mp4 is missing or older than the edit, rendering it first`)
        await full()
      },
    })
    await run('uv', ['run', path.join(root, 'scripts', 'mix_audio.py'), ...(tl.variant ? [tl.name] : []), '--stems', path.join(kitDir, '05_audio')])
    await run('ffmpeg', ['-v', 'error', '-y', '-i', final, '-i', audioFile, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', path.join(outDir, 'mux_tmp.mp4')])
    fs.renameSync(path.join(outDir, 'mux_tmp.mp4'), final)
    await run('uv', ['run', path.join(root, 'scripts', 'kit.py'), kitDir])
  }
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
