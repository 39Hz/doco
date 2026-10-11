// 把 APK 里所有 PNG/JPG 拼成总览表，一次看清 855 张图都是什么。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, '_apk', 'assets', 'res', 'raw-assets')
const OUT = path.join(ROOT, 'docs', 'sheets')

// 收集所有位图
const files = []
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(png|jpe?g)$/i.test(e.name)) files.push(p)
  }
}
walk(SRC)
files.sort()
console.log('位图总数: ' + files.length)

// 只处理 PNG（JPEG 需要转换，这里先看 PNG）
const pngs = files.filter((f) => /\.png$/i.test(f))
console.log('其中 PNG: ' + pngs.length)

const CELL = 96, PAD = 3
const COLS = 20
const PER_SHEET = COLS * 12
let sheetNo = 0
for (let start = 0; start < pngs.length; start += PER_SHEET) {
  sheetNo++
  const batch = pngs.slice(start, start + PER_SHEET)
  const ROWS = Math.ceil(batch.length / COLS)
  const W = COLS * (CELL + PAD) + PAD, H = ROWS * (CELL + PAD) + PAD
  const fb = makeFramebuffer(W, H)
  for (let i = 0; i < fb.length; i += 4) { fb[i] = 40; fb[i + 1] = 44; fb[i + 2] = 52; fb[i + 3] = 255 }
  batch.forEach((f, k) => {
    const c = k % COLS, r = Math.floor(k / COLS)
    const x0 = PAD + c * (CELL + PAD), y0 = PAD + r * (CELL + PAD)
    let im = null
    try { im = decodePng(fs.readFileSync(f)) } catch (e) { im = null }
    if (!im) return
    const sc = Math.min((CELL - 6) / im.w, (CELL - 6) / im.h, 1)
    const dw = Math.max(1, Math.round(im.w * sc)), dh = Math.max(1, Math.round(im.h * sc))
    const ox = x0 + Math.floor((CELL - dw) / 2), oy = y0 + Math.floor((CELL - dh) / 2)
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(im.w - 1, Math.floor(x / sc)), sy = Math.min(im.h - 1, Math.floor(y / sc))
        const s = (sy * im.w + sx) * 4
        const a = im.data[s + 3] / 255
        if (a <= 0.02) continue
        const d = ((oy + y) * W + ox + x) * 4
        fb[d] = fb[d] * (1 - a) + im.data[s] * a
        fb[d + 1] = fb[d + 1] * (1 - a) + im.data[s + 1] * a
        fb[d + 2] = fb[d + 2] * (1 - a) + im.data[s + 2] * a
      }
    }
  })
  const p = path.join(OUT, 'apk_' + String(sheetNo).padStart(2, '0') + '.png')
  fs.writeFileSync(p, encodePng(W, H, fb))
  console.log('  ' + path.basename(p) + '  ' + batch.length + ' 张  ' + W + '×' + H)
}
console.log('共 ' + sheetNo + ' 张总览表 → ' + OUT)
