// B-roll stills from the web with Playwright.
//
//   node scripts/capture.mjs site <url> <name> [--desktop] [--light]
//       assets/shots/<name>_top.png (first screen) and <name>_full.png (whole page), 3x scale.
//       assets/shots/<name>.json: every image (src, alt, size, position), links, and the brand fonts/colors of h1/body
//       -> download icons and hero shots from the image list; fonts.sh fetches Google Fonts by family name
//   node scripts/capture.mjs tweet <id|url> <name> [--light]
//       assets/shots/<name>.png: the post card from the official embed (crop it with ffmpeg if it is tall)
//   node scripts/capture.mjs element <url> <css selector> <name>
//       assets/shots/<name>.png: one element, transparent background
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, 'assets', 'shots')
fs.mkdirSync(out, { recursive: true })
const [mode, target, name, ...rest] = process.argv.slice(2)
const flags = new Set(rest.filter((a) => a.startsWith('--')))
const dark = !flags.has('--light')

async function launch() {
  try { return await chromium.launch({ channel: 'chrome' }) } catch { return chromium.launch() }
}
const browser = await launch()

async function loadAll(page, height) {
  // scroll once so lazy images and reveal-on-scroll sections load
  const h = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < h; y += height / 2) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y)
    await page.waitForTimeout(150)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(800)
}

if (mode === 'site') {
  const desktop = flags.has('--desktop')
  const vp = desktop ? { width: 1440, height: 900 } : { width: 430, height: 932 }
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 3, colorScheme: dark ? 'dark' : 'light' })
  await page.goto(target, { waitUntil: 'networkidle', timeout: 60000 })
  await loadAll(page, vp.height)
  await page.screenshot({ path: path.join(out, `${name}_top.png`) })
  await page.screenshot({ path: path.join(out, `${name}_full.png`), fullPage: true })
  const info = await page.evaluate(() => {
    const st = (sel) => {
      const e = document.querySelector(sel)
      if (!e) return null
      const c = getComputedStyle(e)
      return { text: e.textContent.trim().slice(0, 120), font: c.fontFamily, weight: c.fontWeight, size: c.fontSize, letterSpacing: c.letterSpacing, color: c.color, background: c.backgroundColor }
    }
    const accent = [...document.querySelectorAll('h1 *, h2 *')].map((e) => ({ text: e.textContent.trim().slice(0, 40), color: getComputedStyle(e).color })).slice(0, 8)
    return {
      title: document.title,
      h1: st('h1'), h2: st('h2'), body: st('body'), button: st('a[class*=btn], button'), accent,
      fonts: [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family))],
      images: [...document.querySelectorAll('img')].map((i) => { const r = i.getBoundingClientRect(); return { src: i.currentSrc || i.src, alt: i.alt, w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.top + scrollY) } }).filter((i) => i.src),
      links: [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.href))],
    }
  })
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(info, null, 2))
  console.log(`wrote assets/shots/${name}_top.png, ${name}_full.png, ${name}.json (${info.images.length} images, fonts: ${info.fonts.join(', ')})`)
} else if (mode === 'tweet') {
  const id = (target.match(/status\/(\d+)/) || [null, target])[1]
  const page = await browser.newPage({ viewport: { width: 550, height: 1400 }, deviceScaleFactor: 3, colorScheme: dark ? 'dark' : 'light' })
  await page.goto(`https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=${dark ? 'dark' : 'light'}&dnt=true`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(1500)
  await page.locator('article').first().screenshot({ path: path.join(out, `${name}.png`) })
  console.log(`wrote assets/shots/${name}.png`)
} else if (mode === 'element') {
  const [selector, nm] = [name, rest[0]]
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3, colorScheme: dark ? 'dark' : 'light' })
  await page.goto(target, { waitUntil: 'networkidle', timeout: 60000 })
  await page.locator(selector).first().screenshot({ path: path.join(out, `${nm}.png`), omitBackground: true })
  console.log(`wrote assets/shots/${nm}.png`)
} else {
  console.log('usage: capture.mjs site <url> <name> [--desktop] | tweet <id|url> <name> | element <url> <selector> <name>')
}
await browser.close()
