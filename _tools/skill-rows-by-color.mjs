// 用"平均色调"认出图鉴里每一行是哪个系，再按行列取图标。
// 上一次我按固定的行号硬取，结果把水系那行当成了土系（取出来三个蓝色十字）。
// 行是按系别排的、颜色差异极大，所以用颜色判定比数行号可靠得多。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, '多克多比专区资料素材', '多比形态素材', '技能及说明', '技能ICON.png')
const OUT = path.join(ROOT, 'assets', 'skills')
const img = decodePng(fs.readFileSync(SRC))
const { w, h, data } = img

function blobs(minPx = 3000) {
  const seen = new Uint8Array(w * h)
  const out = []
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || data[s * 4 + 3] < 24) continue
    const q = [s]; seen[s] = 1
    let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0
    while (q.length) {
      const p = q.pop(); const x = p % w, y = (p / w) | 0
      n++
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const np = ny * w + nx
        if (seen[np] || data[np * 4 + 3] < 24) continue
        seen[np] = 1; q.push(np)
      }
    }
    if (n >= minPx) out.push({ x0, y0, x1, y1, n })
  }
  return out
}
const found = blobs()
// 只保留"图标尺寸"的块：边长 90~150
const icons = found.filter((b) => {
  const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1
  return bw >= 90 && bw <= 160 && bh >= 90 && bh <= 160
})
icons.sort((a, b) => a.y0 - b.y0)

// 分行
const rows = []
for (const b of icons) {
  const last = rows[rows.length - 1]
  if (last && Math.abs(b.y0 - last.y0) < 60) last.items.push(b)
  else rows.push({ y0: b.y0, items: [b] })
}
for (const r of rows) {
  r.items.sort((a, b) => a.x0 - b.x0)
  // 平均色（只统计不透明像素）
  let R = 0, G = 0, B = 0, n = 0
  for (const b of r.items) {
    for (let y = b.y0; y <= b.y1; y += 3) for (let x = b.x0; x <= b.x1; x += 3) {
      const i = (y * w + x) * 4
      if (data[i + 3] < 200) continue
      R += data[i]; G += data[i + 1]; B += data[i + 2]; n++
    }
  }
  r.avg = n ? [Math.round(R / n), Math.round(G / n), Math.round(B / n)] : [0, 0, 0]
}
console.log('大图标行（按位置）：')
rows.forEach((r, i) => {
  const [R, G, B] = r.avg
  // 粗略判色：红多=B<G<R、绿多=G最大、蓝多=B最大
  let tone = '?'
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B)
  if (mx - mn < 20) tone = '灰'
  else if (B >= R && B >= G) tone = '蓝'
  else if (G >= R && G >= B) tone = '绿'
  else if (R > G && G > B) tone = '橙/棕'
  else tone = '红/紫'
  console.log(`  第${String(i).padStart(2)}行 y=${String(r.y0).padStart(4)} ${String(r.items.length).padStart(2)} 个  平均色 rgb(${R},${G},${B})  ${tone}`)
})

// 找"火系行"：10 个图标、平均色偏橙红（R>G>B 且 R-B 大）
const fireRows = rows.filter((r) => r.items.length === 10 && r.avg[0] > r.avg[2] + 40 && r.avg[1] > r.avg[2])
// 土系行：10 个图标、偏棕黄（R>G>B，但 B 很低、G 中等）
const earthRows = rows.filter((r) => r.items.length === 10 && r.avg[0] > r.avg[2] + 40 && r.avg[2] < 90)
console.log('\n候选火系行: ' + fireRows.map((r) => 'y' + Math.round(r.y0)).join(', '))
console.log('候选土系行: ' + earthRows.map((r) => 'y' + Math.round(r.y0)).join(', '))

function crop(b, pad = 2) {
  const x0 = Math.max(0, b.x0 - pad), y0 = Math.max(0, b.y0 - pad)
  const x1 = Math.min(w - 1, b.x1 + pad), y1 = Math.min(h - 1, b.y1 + pad)
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1
  const d = new Uint8Array(cw * ch * 4)
  for (let y = 0; y < ch; y++) d.set(data.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + cw) * 4), y * cw * 4)
  return { w: cw, h: ch, data: d }
}
function toIcon(im, size = 64) {
  const s = Math.min(size / im.w, size / im.h)
  const dw = Math.max(1, Math.round(im.w * s)), dh = Math.max(1, Math.round(im.h * s))
  const out = new Uint8Array(size * size * 4)
  const ox = (size - dw) >> 1, oy = (size - dh) >> 1
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sx = Math.min(im.w - 1, Math.round(x * im.w / dw)), sy = Math.min(im.h - 1, Math.round(y * im.h / dh))
    const si = (sy * im.w + sx) * 4, di = ((y + oy) * size + x + ox) * 4
    out[di] = im.data[si]; out[di + 1] = im.data[si + 1]; out[di + 2] = im.data[si + 2]; out[di + 3] = im.data[si + 3]
  }
  return { w: size, h: size, data: out }
}
module.exports = {}
export { crop, toIcon, rows }
