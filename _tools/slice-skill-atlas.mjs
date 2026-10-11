// 第一步：从权威源图按行裁出全部技能图标，输出"行/列 + 平均色 + 建议元素"
// 不猜技能名 —— 先把图标踏实裁出来，配对留给下一步（有据可查）
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, '多克多比专区资料素材/多比形态素材/技能及说明/技能ICON.png')
const OUT = path.join(ROOT, '_tmp_test_out/skill-atlas-icons')
fs.mkdirSync(OUT, { recursive: true })

const img = decodePng(fs.readFileSync(SRC))
const W = img.w, H = img.h, data = img.data
console.log(`源图 ${W}×${H}`)

const isInk = (x, y) => {
  const i = (y * W + x) * 4
  if (data[i + 3] < 40) return false
  return !(data[i] > 242 && data[i + 1] > 242 && data[i + 2] > 242)
}
const seen = new Uint8Array(W * H)
const boxes = []
const stack = []
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const p0 = y * W + x
    if (seen[p0] || !isInk(x, y)) continue
    seen[p0] = 1
    stack.length = 0; stack.push(p0)
    let n = 0, x0 = x, x1 = x, y0 = y, y1 = y
    while (stack.length) {
      const c = stack.pop(), cx = c % W, cy = (c / W) | 0
      n++
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx
      if (cy < y0) y0 = cy; if (cy > y1) y1 = cy
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const np = ny * W + nx
        if (!seen[np] && isInk(nx, ny)) { seen[np] = 1; stack.push(np) }
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1
    if (n > 800 && bw > 45 && bh > 45 && bw / bh > 0.7 && bw / bh < 1.45) boxes.push({ x0, y0, x1, y1, n, bw, bh })
  }
}
console.log(`图标格 ${boxes.length} 个`)

// 行聚类（阈值放宽，让同一行尽量聚在一起）
boxes.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
const rows = []
for (const b of boxes) {
  const cy = (b.y0 + b.y1) / 2
  let r = rows.find((rr) => Math.abs(rr.cy - cy) < Math.max(50, b.bh * 0.7))
  if (!r) { r = { cy, items: [] }; rows.push(r) }
  r.items.push(b)
}
rows.sort((a, b) => a.cy - b.cy)
for (const r of rows) r.items.sort((a, b) => a.x0 - b.x0)

// 元素参考色（按官方元素组的图标主色）
const EL_COLORS = {
  物理: [190, 120, 70], 火: [249, 181, 38], 水: [110, 180, 238], 土: [208, 128, 38],
  风: [140, 148, 217], 光: [159, 78, 153], 暗: [213, 157, 74], 毒: [136, 174, 179],
}
const nearestEl = (r, g, b) => {
  let best = null, bd = 1e9
  for (const [el, c] of Object.entries(EL_COLORS)) {
    const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2
    if (d < bd) { bd = d; best = el }
  }
  return { el: best, d: Math.sqrt(bd) | 0 }
}

const SIZE = 64
const report = []
let idx = 0
console.log('\n行 / 列 / 颜色 / 建议元素')
const manifest = []
for (let ri = 0; ri < rows.length; ri++) {
  const r = rows[ri]
  // 只要"多数是大块"的行
  const big = r.items.filter((b) => b.bw >= 95)
  if (big.length < r.items.length * 0.5) continue
  r.items = big
  let sr = 0, sg = 0, sb = 0, n = 0
  for (const b of r.items) {
    for (let y = b.y0; y <= b.y1; y += 2) for (let x = b.x0; x <= b.x1; x += 2) {
      const i = (y * W + x) * 4
      if (data[i + 3] > 40) { sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; n++ }
    }
  }
  const avg = [(sr / n) | 0, (sg / n) | 0, (sb / n) | 0]
  const sug = nearestEl(...avg)
  console.log(`  r${String(ri).padStart(2)}  y≈${String(Math.round(r.cy)).padStart(4)}  ${String(r.items.length).padStart(2)} 列  rgb(${avg.join(',')})  → ${sug.el}（色距 ${sug.d}）`)
  const rowRec = { row: ri, cy: Math.round(r.cy), count: r.items.length, avg, suggest: sug.el, colorDist: sug.d, files: [] }
  for (let k = 0; k < r.items.length; k++) {
    const b = r.items[k]
    const out = new Uint8ClampedArray(SIZE * SIZE * 4)
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const sx = b.x0 + Math.min(b.bw - 1, Math.floor(x * b.bw / SIZE))
        const sy = b.y0 + Math.min(b.bh - 1, Math.floor(y * b.bh / SIZE))
        const si = (sy * W + sx) * 4, di = (y * SIZE + x) * 4
        out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3]
      }
    }
    const nm = `r${String(ri).padStart(2, '0')}_c${String(k).padStart(2, '0')}__${sug.el}.png`
    fs.writeFileSync(path.join(OUT, nm), encodePng(SIZE, SIZE, out))
    rowRec.files.push(nm)
    idx++
  }
  manifest.push(rowRec)
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ source: path.relative(ROOT, SRC), total: idx, rows: manifest }, null, 1))
console.log(`\n✓ 裁出 ${idx} 个图标 → ${path.relative(ROOT, OUT)}`)
