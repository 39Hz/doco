// 按"平均色调"定位图鉴里的火系行与土系行，从正确的行列取图标。
//
// 教训：上一次按固定行号硬取，把水系那两行当成了火系/土系，
// 取出来 4001~4003 是三个蓝色十字。图鉴的行是按系别排的、颜色差异极大，
// 用颜色判定行比数行号可靠。
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
const icons = blobs().filter((b) => {
  const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1
  return bw >= 90 && bw <= 160 && bh >= 90 && bh <= 160
})
icons.sort((a, b) => a.y0 - b.y0)
const rows = []
for (const b of icons) {
  const last = rows[rows.length - 1]
  if (last && Math.abs(b.y0 - last.y0) < 60) last.items.push(b)
  else rows.push({ y0: b.y0, items: [b] })
}
for (const r of rows) {
  r.items.sort((a, b) => a.x0 - b.x0)
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

// 用**行序**定位，不靠颜色阈值。
// 图鉴里"10 个大图标"的行按从上到下依次是：物理、火、水、土、风、紫业。
// 上一版用颜色阈值找土系，结果匹配到了物理系 —— 两者平均色太接近。
const tenRows = rows.filter((r) => r.items.length === 10)
console.log("10 图标行（按 y）: " + tenRows.map((r) => "y" + Math.round(r.y0) + " rgb(" + r.avg.join(",") + ")").join("  |  "))
const fireRow = tenRows[1]
const earthRow = tenRows[3]
if (earthRow && earthRow.avg[2] > 110) console.log("★ 警告：第 4 个 10 图标行蓝色分量偏高，可能不是土系")
if (!fireRow) { console.error('★ 认不出火系行'); process.exit(1) }
if (!earthRow) { console.error('★ 认不出土系行'); process.exit(1) }
console.log(`火系行 y=${Math.round(fireRow.y0)}  平均色 rgb(${fireRow.avg.join(',')})  ${fireRow.items.length} 个`)
console.log(`土系行 y=${Math.round(earthRow.y0)}  平均色 rgb(${earthRow.avg.join(',')})  ${earthRow.items.length} 个`)

function crop(bb, pad = 2) {
  // 只取块的**上半部分**：火系那几块把图鉴的中文标注也连进来了（块高 137，
  // 图标本体只有 108），图标在上、文字在下，所以从上往下取 110px。
  const full = bb.y1 - bb.y0 + 1
  const keepH = Math.min(full, 110)
  const b = { x0: bb.x0, x1: bb.x1, y0: Math.max(bb.y0, bb.y1 - keepH + 1), y1: bb.y1 }
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

// 官方的火系行就是 302001~302010：火球/火雨/狂暴/多重火球…
// 我的数据里对应短号 2001/2002/2003/2004（2003 官方叫「狂暴」，我这边叫「嗜血」）
const WANT = [
  [fireRow, 0, 2001, '火球'],
  [fireRow, 1, 2002, '火雨'],
  [fireRow, 2, 2003, '嗜血'],
  [fireRow, 3, 2004, '多重火球'],
  [earthRow, 0, 4001, '地之咆哮'],
  [earthRow, 1, 4002, '坚韧'],
  [earthRow, 2, 4003, '大地之怒'],
]
const made = []
for (const [row, ci, id, name] of WANT) {
  const b = row.items[ci]
  if (!b) { console.log(`  ★ ${name} 取不到`); continue }
  const ic = toIcon(crop(b))
  const f = `skill_icon_${id}.png`
  fs.writeFileSync(path.join(OUT, f), encodePng(ic.w, ic.h, ic.data))
  made.push({ id, name, file: 'assets/skills/' + f, from: `图鉴 y=${Math.round(row.y0)} 第${ci}列` })
  console.log(`  ${String(id).padEnd(6)} ${name.padEnd(8)} <- y=${Math.round(row.y0)} 第${ci}列  ${b.x1 - b.x0 + 1}x${b.y1 - b.y0 + 1}`)
}
const idxPath = path.join(OUT, 'index.json')
const prev = JSON.parse(fs.readFileSync(idxPath, 'utf8'))
const byId = new Map(prev.icons.map((x) => [x.id, x]))
for (const m of made) byId.set(m.id, m)
const all = [...byId.values()].sort((a, b) => a.id - b.id)
fs.writeFileSync(idxPath, JSON.stringify({ generated: new Date().toISOString(), icons: all }, null, 1))
console.log(`\n技能图标合计 ${all.length} 个`)
