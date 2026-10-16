// Renders index.html by calling seek(t) for every subframe with Playwright, then encodes with ffmpeg.
//
//   node scripts/render.mjs still 12.3          -> out/still.png at t seconds
//   node scripts/render.mjs stills 2.6 7 13.9   -> out/stills.jpg, those moments side by side (half size, 5 per row)
//   node scripts/render.mjs sheet [step]        -> out/sheet.jpg, a frame every `step` seconds (default 0.5)
//   node scripts/render.mjs full                -> out/<name>.mp4 + out/<name>_preview.mp4 (small copy for sharing)
//   CAPTIONS=0 node scripts/render.mjs full     -> out/<name>_nocaptions.mp4
//   node scripts/render.mjs mux                 -> swap a new audio/mix.wav into out/<name>.mp4 without re-rendering
//   VARIANT=v2 node scripts/render.mjs ...      -> one variant of an edit that calls variants() (name <name>_v2, audio
//                                                  audio/mix_<name>_v2.wav); bash scripts/render_variants.sh does all
//   node scripts/render.mjs variants            -> prints the variant keys
//   node scripts/render.mjs kit [--formats prores,key] [--zip]
//                                               -> out/kit/<name>/: the edit as layers for a human editor (background,
//                                                  face, one clip per graphics section, captions .srt + styled, audio
//                                                  stems, README). Formats: prores hevc rle png webm key (chroma-key
//                                                  colour picked per clip; alias green) black. See scripts/kit.mjs
//
// Every run writes out/cues.json and out/cues_<name>.json (sound effect times, segments) for scripts/mix_audio.py.
// Motion blur: SUB subframes spread over SHUTTER of a frame, averaged with tmix. 2 subframes give double images on
// fast moves; 6 over a 180-degree shutter (the default) read as real blur.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const root = path.resolve(import.meta.dirname, '..')
const outDir = path.join(root, 'out')
const framesDir = path.join(root, 'tmp', 'frames')
const SUB = Number(process.env.SUB || 6)
const SHUTTER = Number(process.env.SHUTTER || 0.5)
const WORKERS = Number(process.env.WORKERS || 6)
const CAPTIONS = process.env.CAPTIONS !== '0'
const VARIANT = process.env.VARIANT || ''

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    console.log(`$ ${cmd} ${args.join(' ')}`)
    const p = spawn(cmd, args, { stdio: 'inherit' })
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
  })
}

async function launch() {
  // the system Chrome avoids a mismatch between the playwright package and its downloaded browsers
  try { return await chromium.launch({ channel: 'chrome' }) } catch { return chromium.launch() }
}

async function openPage(browser, query = '') {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })
  await page.addInitScript(() => { window.__RENDER__ = true })
  page.on('pageerror', (e) => console.error('pageerror', e))
  page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text()) })
  const url = pathToFileURL(path.join(root, 'index.html')) // folder names may contain spaces
  const q = new URLSearchParams(query)
  if (VARIANT) q.set('variant', VARIANT)
  url.search = q.toString()
  await page.goto(url.href)
  await page.evaluate(() => window.ready())
  await page.evaluate((c) => window.configure({ captions: c }), CAPTIONS)
  return page
}

async function shot(page, t, file, type = 'png') {
  await page.evaluate((tt) => window.seek(tt), t)
  await page.screenshot({ path: file, type, ...(type === 'jpeg' ? { quality: 96 } : {}), animations: 'disabled' })
}

// everything that changes the picture: a kit reuses out/<name>.mp4 only when this matches the one written with it
function signature() {
  const h = crypto.createHash('sha1')
  for (const f of ['index.html', 'edit.js', 'reel/engine.js', 'reel/engine.css', 'tmp/meta.js', 'scripts/render.mjs']) {
    const p = path.join(root, f)
    if (fs.existsSync(p)) h.update(fs.readFileSync(p))
  }
  h.update(JSON.stringify([SUB, SHUTTER, CAPTIONS, VARIANT]))
  return h.digest('hex').slice(0, 12)
}

async function tile(dir, n, cols, w, h, out) {
  await run('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', path.join(dir, '%03d.jpg'),
    '-vf', `scale=${w}:${h},tile=${cols}x${Math.ceil(n / cols)}:padding=6:color=white`, '-frames:v', '1', '-q:v', '3', out])
}

async function main() {
  const mode = process.argv[2] || 'sheet'
  fs.mkdirSync(outDir, { recursive: true })
  const browser = await launch()
  const first = await openPage(browser)
  const tl = await first.evaluate(() => window.timeline())
  fs.writeFileSync(path.join(outDir, 'cues.json'), JSON.stringify(tl, null, 2))
  fs.writeFileSync(path.join(outDir, `cues_${tl.name}.json`), JSON.stringify(tl, null, 2))
  console.log(`${tl.name}: duration=${tl.duration}s fps=${tl.fps} cues=${tl.cues.length}${tl.segments ? ` segments=${tl.segments.length}` : ''}`)
  if (VARIANT && tl.variant !== VARIANT) throw new Error(`variant ${VARIANT} not defined (have: ${tl.variants.join(' ')})`)
  // a variant mixes its own audio (its cues and voice follow its segments)
  const audioFile = tl.variant ? path.join(root, 'audio', `mix_${tl.name}.wav`) : path.join(root, 'audio', 'mix.wav')
  const name = CAPTIONS ? tl.name : `${tl.name}_nocaptions`
  const final = path.join(outDir, `${name}.mp4`)
  const preview = async () => {
    // under 30 MB so it can be sent to a phone; the full file is the one to upload
    await run('ffmpeg', ['-v', 'error', '-y', '-i', final, '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', path.join(outDir, `${name}_preview.mp4`)])
  }

  async function full() {
    fs.rmSync(framesDir, { recursive: true, force: true })
    fs.mkdirSync(framesDir, { recursive: true })
    const frames = Math.round(tl.duration * tl.fps)
    const total = frames * SUB
    const pages = [first, ...(await Promise.all(Array.from({ length: WORKERS - 1 }, () => openPage(browser))))]
    let done = 0
    const started = Date.now()
    await Promise.all(pages.map(async (page, w) => {
      for (let i = w; i < total; i += WORKERS) {
        // subframes centered on each output frame and under half a frame away, so the engine rounds every subframe
        // to the same source frame: the face never ghosts, only moving graphics blur
        const k = Math.floor(i / SUB), j = i % SUB
        const t = (k + ((j - (SUB - 1) / 2) * SHUTTER) / SUB) / tl.fps
        await shot(page, Math.max(0, t), path.join(framesDir, `${String(i).padStart(6, '0')}.jpg`), 'jpeg')
        if (++done % 500 === 0) console.log(`subframe ${done}/${total} (${((Date.now() - started) / 1000).toFixed(0)}s)`)
      }
    }))
    console.log(`rendered ${total} subframes in ${((Date.now() - started) / 1000).toFixed(0)}s`)
    const audio = audioFile
    const hasAudio = fs.existsSync(audio)
    if (!hasAudio) console.log(`no ${path.relative(root, audio)} yet: rendering silent (run scripts/mix_audio.py ${tl.variant ? tl.name : ''}, then render.mjs mux)`)
    // Chrome's JPEGs are BT.601 full range: convert through RGB to BT.709 limited and tag it in the graph (ffmpeg 8.1
    // ignores the -color_* flags here, and relabelling without converting shifts reds)
    await run('ffmpeg', [
      '-v', 'error', '-y', '-framerate', String(tl.fps * SUB), '-i', path.join(framesDir, '%06d.jpg'),
      ...(hasAudio ? ['-i', audio] : []),
      '-vf', `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/(${tl.fps}*TB),format=rgb24,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv`,
      '-r', String(tl.fps), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      ...(hasAudio ? ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest'] : []),
      '-movflags', '+faststart', final,
    ])
    fs.rmSync(framesDir, { recursive: true, force: true })
    fs.writeFileSync(path.join(outDir, `${name}.sig`), signature())
    await preview()
    console.log(`wrote out/${name}.mp4 and out/${name}_preview.mp4`)
  }

  if (mode === 'variants') {
    console.log(tl.variants.join(' '))
  } else if (mode === 'still') {
    await shot(first, Number(process.argv[3] || 0), path.join(outDir, 'still.png'))
    console.log('wrote out/still.png')
  } else if (mode === 'stills' || mode === 'sheet') {
    const ts = mode === 'stills' ? process.argv.slice(3).map(Number) : []
    if (mode === 'sheet') for (let t = 0, step = Number(process.argv[3] || 0.5); t < tl.duration; t += step) ts.push(+t.toFixed(3))
    const dir = path.join(root, 'tmp', mode)
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    for (const [i, t] of ts.entries()) await shot(first, t, path.join(dir, `${String(i).padStart(3, '0')}.jpg`), 'jpeg')
    if (mode === 'stills') await tile(dir, ts.length, Math.min(5, ts.length), 540, 960, path.join(outDir, 'stills.jpg'))
    else await tile(dir, ts.length, 10, 216, 384, path.join(outDir, 'sheet.jpg'))
    console.log(`wrote out/${mode === 'stills' ? 'stills' : 'sheet'}.jpg (${ts.length} frames)`)
  } else if (mode === 'mux') {
    const tmp = path.join(outDir, 'mux_tmp.mp4')
    await run('ffmpeg', ['-v', 'error', '-y', '-i', final, '-i', audioFile, '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', tmp])
    fs.renameSync(tmp, final)
    await preview()
    console.log(`remuxed out/${name}.mp4`)
  } else if (mode === 'full') {
    await full()
  } else if (mode === 'kit') {
    const { renderKit } = await import('./kit.mjs')
    const sigFile = path.join(outDir, `${name}.sig`)
    const kitDir = await renderKit({
      root, tl, args: process.argv.slice(3), sub: SUB, shutter: SHUTTER, workers: WORKERS, captions: CAPTIONS,
      signature: signature(), masterFile: final, audioFile,
      launch, openPage: (q, b = browser) => openPage(b, q),
      prepareFrames: async () => {}, // reels keep every camera frame in tmp/face
      ensureMaster: async () => {
        if (fs.existsSync(final) && fs.existsSync(sigFile) && fs.readFileSync(sigFile, 'utf8') === signature()) return console.log(`master: out/${name}.mp4 is current`)
        console.log(`master: out/${name}.mp4 is missing or older than the edit, rendering it first`)
        await full()
      },
    })
    // audio stems (same gain and limiter as the mix, so they add up to it), then the master gets that mix
    await run('uv', ['run', path.join(root, 'scripts', 'mix_audio.py'), ...(tl.variant ? [tl.name] : []), '--stems', path.join(kitDir, '05_audio')])
    await run('ffmpeg', ['-v', 'error', '-y', '-i', final, '-i', audioFile, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', path.join(outDir, 'mux_tmp.mp4')])
    fs.renameSync(path.join(outDir, 'mux_tmp.mp4'), final)
    await run('uv', ['run', path.join(root, 'scripts', 'kit.py'), kitDir])
  }
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
