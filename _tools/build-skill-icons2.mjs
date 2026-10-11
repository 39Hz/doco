// 从官方技能图鉴大图 `技能ICON.png`（2133×3333，就是「图鉴3.1——技能等ICON」）里补抽缺的图标。
//
// 为什么按行切：这张图是按系别分行的，官方图鉴上每一行下面都写着名字。
// 行的顺序与每行图标个数是固定的：
//   物理系 10 + 3、火系 10、水系 10、土系 10 + 2、风系 10 + 1、光暗毒 5、紫业 12 + 6 …
// 先探测出实际行结构，确认与这个模式吻合，再按行列取需要的图标。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, '多克多比专区资料素材', '多比形态素材', '技能及说明', '技能ICON.png')
const OUT = path.join(ROOT, 'assets', 'skills')

const img = decodePng(fs.readFileSync(SRC))
console.log(`源图 ${img.w}x${img.h}`)

// 连通块
function blobs(im, minPx = 400) {
  const { w, h, data } = im
  const seen = new Uint8Array(w * h)
  const out = []
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || data[s * 4 + 3] < 24) continue
    const q = [s]; seen[s] = 1
    let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0
    while (q.length) {
      const p = q.pop()
      const x = p % w, y = (p / w) | 0
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
const found = blobs(img)
console.log(`连通块 ${found.length} 个`)

// 按 y 分行：同行的 y0 相差不超过图标高度的 60%
const ICON_H = 130
found.sort((a, b) => a.y0 - b.y0)
const rows = []
for (const b of found) {
  const last = rows[rows.length - 1]
  if (last && Math.abs(b.y0 - last.y0) < ICON_H * 0.6) {
    last.items.push(b)
    last.y0 = Math.min(last.y0, b.y0)
  } else {
    rows.push({ y0: b.y0, items: [b] })
  }
}
for (const r of rows) r.items.sort((a, b) => a.x0 - b.x0)
console.log('\n探测到的行（应为 物理10+3 / 火10 / 水10 / 土10+2 / 风10+1 / 光暗毒5 / 紫业12+6 …）：')
rows.forEach((r, i) => {
  const w0 = r.items[0]
  console.log(`  第${String(i).padStart(2)}行 y=${String(Math.round(r.y0)).padStart(4)}  ${String(r.items.length).padStart(2)} 个  首块 ${w0.x1 - w0.x0 + 1}x${w0.y1 - w0.y0 + 1}`)
})

// 按图鉴的固定顺序取需要的：火系第 4 个 = 多重火球；土系第 1~3 个 = 地之咆哮/坚韧/大地之怒
// 行下标：0 物理10、1 物理3、2 火10、3 水10、4 土10、5 土2、6 风10、7 风1、8 光暗毒5
const WANT = [
  [2, 3, 2004, '多重火球'],
  [4, 0, 4001, '地之咆哮'],
  [4, 1, 4002, '坚韧'],
  [4, 2, 4003, '大地之怒'],
]
function crop(b, pad = 2) {
  const x0 = Math.max(0, b.x0 - pad), y0 = Math.max(0, b.y0 - pad)
  const x1 = Math.min(img.w - 1, b.x1 + pad), y1 = Math.min(img.h - 1, b.y1 + pad)
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1
  const d = new Uint8Array(cw * ch * 4)
  for (let y = 0; y < ch; y++) d.set(img.data.subarray(((y + y0) * img.w + x0) * 4, ((y + y0) * img.w + x0 + cw) * 4), y * cw * 4)
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
console.log('\n按行/列取图标：')
const made = []
for (const [ri, ci, id, name] of WANT) {
  const row = rows[ri]
  if (!row || !row.items[ci]) { console.log(`  ★ 第${ri}行第${ci}列取不到`); continue }
  const b = row.items[ci]
  const ic = toIcon(crop(b))
  const f = `skill_icon_${id}.png`
  fs.writeFileSync(path.join(OUT, f), encodePng(ic.w, ic.h, ic.data))
  made.push({ id, name, file: 'assets/skills/' + f, from: `图鉴第${ri}行第${ci}列`, size: `${b.x1 - b.x0 + 1}x${b.y1 - b.y0 + 1}` })
  console.log(`  ${String(id).padEnd(6)} ${name.padEnd(8)} <- 第${ri}行第${ci}列  ${b.x1 - b.x0 + 1}x${b.y1 - b.y0 + 1}  -> ${f}`)
}
const idxPath = path.join(OUT, 'index.json')
const prev = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, 'utf8')) : { icons: [] }
const have = new Set(prev.icons.map((x) => x.id))
for (const m of made) if (!have.has(m.id)) prev.icons.push(m)
fs.writeFileSync(idxPath, JSON.stringify({ generated: new Date().toISOString(), icons: prev.icons.sort((a, b) => a.id - b.id) }, null, 1))
console.log(`\n技能图标合计 ${prev.icons.length} 个：` + prev.icons.map((x) => x.id).join(', '))
