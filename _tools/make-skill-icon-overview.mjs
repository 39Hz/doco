// 技能图标总览：把切好的 124 个图标按元素分行、编号排列（核对切图 + 后续映射用）
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SRCDIR = path.join(ROOT, '_tmp_test_out/skill-icons-sliced')
const idx = JSON.parse(fs.readFileSync(path.join(SRCDIR, 'index.json'), 'utf8'))

const CELL = 64, GAP = 10, PAD = 14, LABEL = 22
const order = ['火系', '水系', '风系', '土系', '光系', '暗系', '毒系', '无属性系', '宠物技能']
const sheets = order.map((el) => idx.sheets.find((s) => s.element === el)).filter(Boolean)
const maxCols = Math.max(...sheets.map((s) => s.count))
const cols = Math.min(maxCols, 26)
const totW = PAD * 2 + cols * (CELL + GAP)
const rowHeights = sheets.map(() => CELL + GAP + LABEL)
const totH = PAD * 2 + rowHeights.reduce((a, b) => a + b, 0)

const fb = new Uint8ClampedArray(totW * totH * 4)
for (let i = 0; i < totW * totH; i++) { fb[i * 4] = 18; fb[i * 4 + 1] = 22; fb[i * 4 + 2] = 36; fb[i * 4 + 3] = 255 }

let oy = PAD
for (const s of sheets) {
  let ox = PAD
  let n = 0
  for (const ic of s.icons) {
    if (n >= cols) { ox = PAD; oy += CELL + GAP; n = 0 }   // 超宽换行（同一元素内）
    const p = path.join(SRCDIR, `_${''}`)                   // 占位，下面用真实名
    const file = path.join(SRCDIR, ic.name)
    if (fs.existsSync(file)) {
      const im = decodePng(fs.readFileSync(file))
      const sc = Math.min(CELL / im.w, CELL / im.h)
      const dw = Math.max(1, Math.round(im.w * sc)), dh = Math.max(1, Math.round(im.h * sc))
      const dx = ox + ((CELL - dw) >> 1), dy = oy + ((CELL - dh) >> 1)
      for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
        const si = (Math.min(im.h - 1, Math.floor(y / sc)) * im.w + Math.min(im.w - 1, Math.floor(x / sc))) * 4
        const al = im.data[si + 3] / 255
        if (al <= 0) continue
        const tx = dx + x, ty = dy + y
        if (tx < 0 || ty < 0 || tx >= totW || ty >= totH) continue
        const d = (ty * totW + tx) * 4
        fb[d] = im.data[si] * al + fb[d] * (1 - al)
        fb[d + 1] = im.data[si + 1] * al + fb[d + 1] * (1 - al)
        fb[d + 2] = im.data[si + 2] * al + fb[d + 2] * (1 - al)
        fb[d + 3] = 255
      }
    }
    // 编号条（图标下方 4px）
    for (let y = oy + CELL; y < oy + CELL + 3; y++) for (let x = ox; x < ox + CELL; x++) {
      if (x < 0 || y < 0 || x >= totW || y >= totH) continue
      const d = (y * totW + x) * 4
      const k = (n + 1) / Math.max(1, s.count)
      fb[d] = 60 + 180 * k; fb[d + 1] = 200 - 120 * k; fb[d + 2] = 120
    }
    ox += CELL + GAP
    n++
  }
  oy += CELL + GAP + LABEL
}

fs.mkdirSync(path.join(ROOT, 'docs/shots'), { recursive: true })
const OUT = path.join(ROOT, 'docs/shots/skill-icons-overview.png')
fs.writeFileSync(OUT, encodePng(totW, totH, fb))
console.log(`已写出 ${path.relative(ROOT, OUT)}  ${totW}×${totH}`)
console.log('行顺序（上→下）：' + sheets.map((s) => `${s.element}(${s.count})`).join('  '))
