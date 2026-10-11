// 生成「怪物名称 ↔ 当前模型」核对表（给用户一眼看出哪些对不上）
// 每行：怪名 | 元素 | 现在用的素材 | 是精确还是替身 | 素材图
// 用法: node _tools/make-monster-sheet.mjs
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const raw = fs.readFileSync(path.join(ROOT, 'assets/monsters/map.js'), 'utf8')
const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
const det = j.detail || []
const isPrecise = (s) => String(s || '').startsWith('atlas')

const CELL = 118, PAD = 8, COLS = 6
const rows = Math.ceil(det.length / COLS)
const W = PAD + COLS * (CELL + PAD)
const H = PAD + rows * (CELL + PAD + 14) + 26

const fb = new Uint8ClampedArray(W * H * 4)
// 背景：对不上的一行用偏红底、精确的用偏绿底（一眼分辨）
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4
  fb[i] = 12; fb[i + 1] = 16; fb[i + 2] = 28; fb[i + 3] = 255
}

function drawImg(img, ox, oy, box) {
  // 等比缩放进 box×box
  let x0 = 0, y0 = 0, x1 = img.w - 1, y1 = img.h - 1
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.data[(y * img.w + x) * 4 + 3] > 30) {
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
  const sw = x1 - x0 + 1, sh = y1 - y0 + 1
  const sc = Math.min(box / sw, box / sh)
  const dw = Math.max(1, Math.round(sw * sc)), dh = Math.max(1, Math.round(sh * sc))
  const dx = ox + ((box - dw) >> 1), dy = oy + ((box - dh) >> 1)
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sx = x0 + Math.min(sw - 1, Math.floor(x / sc)), sy = y0 + Math.min(sh - 1, Math.floor(y / sc))
    const s = (sy * img.w + sx) * 4, al = img.data[s + 3] / 255
    if (al <= 0.02) continue
    const tx = dx + x, ty = dy + y
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue
    const d = (ty * W + tx) * 4
    fb[d] = img.data[s] * al + fb[d] * (1 - al)
    fb[d + 1] = img.data[s + 1] * al + fb[d + 1] * (1 - al)
    fb[d + 2] = img.data[s + 2] * al + fb[d + 2] * (1 - al)
    fb[d + 3] = 255
  }
}
function fillRect(x0, y0, w, h, r, g, b, a) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue
    const i = (y * W + x) * 4
    fb[i] = r * a + fb[i] * (1 - a)
    fb[i + 1] = g * a + fb[i + 1] * (1 - a)
    fb[i + 2] = b * a + fb[i + 2] * (1 - a)
  }
}

let ok = 0, bad = 0
det.forEach((d, k) => {
  const col = k % COLS, row = (k / COLS) | 0
  const x = PAD + col * (CELL + PAD), y = PAD + row * (CELL + PAD + 14)
  const p = isPrecise(d.source)
  if (p) ok++; else bad++
  // 格子底：精确=绿调，替身=红调
  fillRect(x, y, CELL, CELL, p ? 24 : 60, p ? 46 : 22, p ? 30 : 22, 0.85)
  const sp = path.join(ROOT, d.sprite)
  if (fs.existsSync(sp)) drawImg(decodePng(fs.readFileSync(sp)), x, y, CELL)
  // 底部色条：精确绿 / 替身红
  fillRect(x, y + CELL + 1, CELL, 4, p ? 60 : 200, p ? 180 : 60, p ? 80 : 60, 1)
})
fs.mkdirSync(path.join(ROOT, 'docs', 'shots'), { recursive: true })
const OUT = path.join(ROOT, 'docs', 'shots', 'monster-name-model-sheet.png')
fs.writeFileSync(OUT, encodePng(W, H, fb))
console.log(`已写出 ${path.relative(ROOT, OUT)}  ${W}×${H}`)
console.log(`  ${det.length} 只：精确 ${ok}（绿条） / 替身 ${bad}（红条）`)
console.log('  顺序（左→右、上→下）：')
det.forEach((d, k) => {
  const mark = isPrecise(d.source) ? '✓' : '✗'
  process.stdout.write(`${mark}${d.name}  `)
  if ((k + 1) % COLS === 0) process.stdout.write('\n')
})
console.log()
