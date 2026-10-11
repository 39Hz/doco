// 盘点技能图标源图 `技能ICON.png` 的结构（行 × 列 + 每行平均色）
// 与官方技能表的 ID 段对照 → 建立"技能 ID → 图标"的完整映射
import fs from 'node:fs'
import path from 'node:path'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, '多克多比专区资料素材/多比形态素材/技能及说明/技能ICON.png')
const img = decodePng(fs.readFileSync(SRC))
console.log(`源图 ${path.basename(SRC)}  ${img.w}×${img.h}`)

// 连通域找图标格子
const W = img.w, H = img.h, data = img.data
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
    if (n > 600 && bw > 30 && bh > 30 && bw / bh > 0.6 && bw / bh < 1.7) boxes.push({ x0, y0, x1, y1, n, bw, bh })
  }
}
console.log(`连通域图标 ${boxes.length} 个`)

// 按行聚类
boxes.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
const rows = []
for (const b of boxes) {
  const cy = (b.y0 + b.y1) / 2
  let r = rows.find((rr) => Math.abs(rr.cy - cy) < Math.max(24, b.bh * 0.6))
  if (!r) { r = { cy, items: [] }; rows.push(r) }
  r.items.push(b)
}
rows.sort((a, b) => a.cy - b.cy)
console.log(`分成 ${rows.length} 行\n`)

// 官方技能表的 ID 段（从 assets/skills-official.json）
const off = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/skills-official.json'), 'utf8'))
const seg = {}
for (const s of off.skills) {
  const k = Math.floor(s.id / 1000)
  if (!seg[k]) seg[k] = []
  seg[k].push(s)
}

console.log('行结构（每行：y范围 · 列数 · 平均色 · 尺寸）')
for (const r of rows) {
  r.items.sort((a, b) => a.x0 - b.x0)
  let sr = 0, sg = 0, sb = 0, n = 0
  for (const b of r.items) {
    for (let y = b.y0; y <= b.y1; y += 2) for (let x = b.x0; x <= b.x1; x += 2) {
      const i = (y * W + x) * 4
      if (data[i + 3] > 40) { sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; n++ }
    }
  }
  const yMid = Math.round(r.cy)
  const w0 = r.items[0].bw, h0 = r.items[0].bh
  console.log(`  y≈${String(yMid).padStart(4)}  ${String(r.items.length).padStart(2)} 列  rgb(${(sr / n) | 0},${(sg / n) | 0},${(sb / n) | 0})  ${w0}×${h0}  x: ${r.items.map((b) => Math.round(b.x0)).join(',')}`)
}

console.log('\n官方技能表 ID 段：')
for (const [k, list] of Object.entries(seg).sort()) {
  console.log(`  ${k}xxx  ${String(list.length).padStart(3)} 个  ${list[0].name.slice(0, 10)} … ${list[list.length - 1].name.slice(0, 10)}`)
}
