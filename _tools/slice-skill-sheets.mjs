// 切分用户提供的技能图标素材表（白底，图标是圆角方块）
// 输出：每个图标一个 PNG + 一份清单（坐标/尺寸），供后续"图标→技能名"映射
//
// 用法: node _tools/slice-skill-sheets.mjs
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, '多克多比专区资料素材/技能素材/用户提供')
const OUT = path.join(ROOT, '_tmp_test_out/skill-icons-sliced')
fs.mkdirSync(OUT, { recursive: true })

const sheets = fs.readdirSync(SRC).filter((f) => f.endsWith('.png'))
const report = []

for (const sheet of sheets) {
  const el = sheet.replace(/\.png$/, '')
  const img = decodePng(fs.readFileSync(path.join(SRC, sheet)))
  const { w: W, h: H, data } = img
  // "有内容"= 不是白底（白底阈值放高一点，图标边缘有抗锯齿）
  const isInk = (x, y) => {
    const i = (y * W + x) * 4
    if (data[i + 3] < 40) return false
    return !(data[i] > 242 && data[i + 1] > 242 && data[i + 2] > 242)
  }
  // 连通域（8 邻域，跳过 1px 的空隙以免被抗锯齿断开）
  const seen = new Uint8Array(W * H)
  const boxes = []
  const stack = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p0 = y * W + x
      if (seen[p0] || !isInk(x, y)) continue
      seen[p0] = 1
      stack.length = 0
      stack.push(p0)
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
      // 只保留"像图标"的块：面积够大、且接近方形
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1
      if (n > 900 && bw > 40 && bh > 40 && bw / bh > 0.7 && bw / bh < 1.4) boxes.push({ x0, y0, x1, y1, n })
    }
  }
  // 按行（y 中心聚类）再按列排序，得到阅读顺序
  boxes.sort((a, b) => ((a.y0 + a.y1) / 2) - ((b.y0 + b.y1) / 2) || a.x0 - b.x0)
  const rows = []
  for (const b of boxes) {
    const cy = (b.y0 + b.y1) / 2
    let r = rows.find((rr) => Math.abs(rr.cy - cy) < Math.max(20, (b.y1 - b.y0) * 0.5))
    if (!r) { r = { cy, items: [] }; rows.push(r) }
    r.items.push(b)
  }
  rows.sort((a, b) => a.cy - b.cy)
  let idx = 0
  const list = []
  for (const r of rows) {
    r.items.sort((a, b) => a.x0 - b.x0)
    for (const b of r.items) {
      idx++
      const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1
      // 裁出来（外扩 1px）
      const px0 = Math.max(0, b.x0 - 1), py0 = Math.max(0, b.y0 - 1)
      const px1 = Math.min(W - 1, b.x1 + 1), py1 = Math.min(H - 1, b.y1 + 1)
      const cw = px1 - px0 + 1, ch = py1 - py0 + 1
      const sub = new Uint8ClampedArray(cw * ch * 4)
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const s = ((py0 + y) * W + (px0 + x)) * 4, d = (y * cw + x) * 4
        sub[d] = data[s]; sub[d + 1] = data[s + 1]; sub[d + 2] = data[s + 2]; sub[d + 3] = data[s + 3]
      }
      const name = `${el}_${String(idx).padStart(2, '0')}.png`
      fs.writeFileSync(path.join(OUT, name), encodePng(cw, ch, sub))
      list.push({ idx, name, x: b.x0, y: b.y0, w: bw, h: bh })
    }
  }
  report.push({ sheet, element: el, count: list.length, icons: list })
  console.log(`${el.padEnd(6)} 切出 ${String(list.length).padStart(3)} 个图标`)
}

fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ generated: new Date().toISOString(), sheets: report }, null, 1))
const total = report.reduce((s, r) => s + r.count, 0)
console.log(`\n合计 ${total} 个图标 → ${path.relative(ROOT, OUT)}`)
console.log('\n各系数量：' + report.map((r) => `${r.element} ${r.count}`).join('  '))
