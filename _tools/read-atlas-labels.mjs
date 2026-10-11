// 第四版：用连通块拿立绘 + 在其正下方收集编号文字，然后把文字放大拼成一张对照图。
//
// 目标：把「编号」读出来 → 就可以按 图鉴110001=怪兽10001 的规则精确映射，不再靠尺寸猜。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, '多克多比专区资料素材', 'npc大全', '怪物图鉴.png')
const png = decodePng(fs.readFileSync(SRC))
const { w: PW, h: PH, data: PD } = png
const isBg = (x, y) => (x < 0 || y < 0 || x >= PW || y >= PH) || PD[(y * PW + x) * 4 + 3] < 24

const blobs = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', '_blobs.json'), 'utf8'))
console.log('立绘块 ' + blobs.length + ' 个')

// 对每个块：在它正下方 ±一小段范围内找编号文字（深色、成行、宽度不超过块宽）
// 文字也是不透明像素，只是连通块很小 —— 直接扫一个矩形区域，按行统计
function findLabel(b) {
  const y0 = b.y + b.h
  const y1 = Math.min(PH - 1, y0 + Math.round(b.h * 0.30) + 24)
  const x0 = Math.max(0, b.x - Math.round(b.w * 0.15))
  const x1 = Math.min(PW - 1, b.x + b.w + Math.round(b.w * 0.15))
  // 逐行统计非背景像素
  const rows = []
  for (let y = y0; y <= y1; y++) {
    let n = 0, mn = 1e9, mx = -1
    for (let x = x0; x <= x1; x++) {
      if (isBg(x, y)) continue
      n++
      if (x < mn) mn = x
      if (x > mx) mx = x
    }
    rows.push({ y, n, mn, mx })
  }
  // 找连续有内容的行段，取最靠上的那一段（编号紧贴立绘下方）
  let s = -1
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (r.n > 0) { if (s < 0) s = i }
    else if (s >= 0) {
      const seg = rows.slice(s, i)
      const h = seg[seg.length - 1].y - seg[0].y + 1
      const wmax = Math.max(...seg.map((r) => r.mx)) - Math.min(...seg.map((r) => r.mn)) + 1
      // 编号文字：高度 8~40px，宽度不超过立绘宽度的 1.6 倍
      if (h >= 6 && h <= 46 && wmax <= b.w * 1.7 && wmax >= 20) {
        return {
          x: Math.min(...seg.map((r) => r.mn)), y: seg[0].y,
          w: wmax, h,
        }
      }
      s = -1
    }
  }
  return null
}

const items = []
for (const b of blobs) {
  const lab = findLabel(b)
  items.push({ art: b, label: lab })
}
const withLabel = items.filter((it) => it.label)
console.log('找到编号的块: ' + withLabel.length + '/' + items.length)

// 拼一张"文字放大图"：每个编号放大 4 倍，行高按最大高度
const SCALE = 4
const CW = Math.max(...withLabel.map((it) => it.label.w)) * SCALE + 10
const CH = Math.max(...withLabel.map((it) => it.label.h)) * SCALE + 10
const COLS = 8
const ROWS = Math.ceil(withLabel.length / COLS)
const fb = makeFramebuffer(COLS * CW, ROWS * CH)
for (let i = 0; i < fb.length; i += 4) { fb[i] = 255; fb[i + 1] = 255; fb[i + 2] = 255; fb[i + 3] = 255 }
withLabel.forEach((it, k) => {
  const c = k % COLS, r = Math.floor(k / COLS)
  const ox = c * CW + 5, oy = r * CH + 5
  const L = it.label
  for (let y = 0; y < L.h; y++) {
    for (let x = 0; x < L.w; x++) {
      if (isBg(L.x + x, L.y + y)) continue
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
          const px = ox + x * SCALE + dx, py = oy + y * SCALE + dy
          if (px < 0 || py < 0 || px >= COLS * CW || py >= ROWS * CH) continue
          const d = (py * COLS * CW + px) * 4
          fb[d] = 0; fb[d + 1] = 0; fb[d + 2] = 0; fb[d + 3] = 255
        }
      }
    }
  }
})
const p = path.join(ROOT, 'docs', 'sheets', '_idlabels.png')
fs.writeFileSync(p, encodePng(COLS * CW, ROWS * CH, fb))
console.log('已输出 ' + p + '（' + COLS * CW + '×' + ROWS * CH + '，' + withLabel.length + ' 个编号，放大 ' + SCALE + 'x）')
fs.writeFileSync(path.join(ROOT, '_tools', '_blobs_labeled.json'), JSON.stringify(items), 'utf8')
