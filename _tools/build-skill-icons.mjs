// 抽取官方技能图标。
//
// 素材形态：`图片资源/icon/skill_icon_1001_1020.png` 这种**竖排长条**
// （74×342 之类），文件名里的数字就是图标 ID 区间的起点。
// 所以按连通块切、从上到下排，依次对应 1001、1002、1003……
//
// 自检：切出来的块数必须 ≤ 文件名区间的容量，而且每个块都要有实际像素。
// 归档里没有 4xxx（土系）单独的条，那部分单独找。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, '多克多比专区资料素材', '图片资源', 'icon')
const OUT = path.join(ROOT, 'assets', 'skills')
fs.mkdirSync(OUT, { recursive: true })

const STRIPS = [
  ['skill_icon_1001_1020.png', 1001],
  ['skill_icon_2001_2020.png', 2001],
  ['skill_icon_3001_3020.png', 3001],
  ['skill_icon_5001_5020.png', 5001],
]

function blobs(img, minPx = 30) {
  const { w, h, data } = img
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
function crop(img, b, pad = 1) {
  const x0 = Math.max(0, b.x0 - pad), y0 = Math.max(0, b.y0 - pad)
  const x1 = Math.min(img.w - 1, b.x1 + pad), y1 = Math.min(img.h - 1, b.y1 + pad)
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1
  const d = new Uint8Array(cw * ch * 4)
  for (let y = 0; y < ch; y++) d.set(img.data.subarray(((y + y0) * img.w + x0) * 4, ((y + y0) * img.w + x0 + cw) * 4), y * cw * 4)
  return { w: cw, h: ch, data: d }
}
// 统一缩到 64×64（不变形，居中）
function toIcon(img, size = 64) {
  const s = Math.min(size / img.w, size / img.h)
  const dw = Math.max(1, Math.round(img.w * s)), dh = Math.max(1, Math.round(img.h * s))
  const out = new Uint8Array(size * size * 4)
  const ox = (size - dw) >> 1, oy = (size - dh) >> 1
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx0 = Math.floor(x * img.w / dw), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * img.w / dw))
      const sy0 = Math.floor(y * img.h / dh), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * img.h / dh))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let yy = sy0; yy < sy1 && yy < img.h; yy++) for (let xx = sx0; xx < sx1 && xx < img.w; xx++) {
        const i = (yy * img.w + xx) * 4, al = img.data[i + 3] / 255
        r += img.data[i] * al; g += img.data[i + 1] * al; b += img.data[i + 2] * al; a += al; n++
      }
      if (!n) continue
      r /= n; g /= n; b /= n; a /= n
      const di = ((y + oy) * size + x + ox) * 4
      if (a > 0.001) { out[di] = Math.round(r / a); out[di + 1] = Math.round(g / a); out[di + 2] = Math.round(b / a) }
      out[di + 3] = Math.round(a * 255)
    }
  }
  return { w: size, h: size, data: out }
}

const made = []
for (const [file, startId] of STRIPS) {
  const p = path.join(SRC, file)
  if (!fs.existsSync(p)) { console.log('★ 缺 ' + file); continue }
  const img = decodePng(fs.readFileSync(p))
  const list = blobs(img)
  list.sort((a, b) => a.y0 - b.y0)          // 竖排：从上到下就是 ID 递增
  console.log(`${file}  ${img.w}x${img.h}  切出 ${list.length} 块`)
  list.forEach((b, i) => {
    const id = startId + i
    const ic = toIcon(crop(img, b))
    const name = `skill_icon_${id}.png`
    fs.writeFileSync(path.join(OUT, name), encodePng(ic.w, ic.h, ic.data))
    made.push({ id, file: 'assets/skills/' + name, src: file, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 })
    console.log(`   ${String(id).padEnd(6)} 原图 ${String(b.x1 - b.x0 + 1).padStart(3)}x${String(b.y1 - b.y0 + 1).padEnd(3)} -> ${name}`)
  })
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ generated: new Date().toISOString(), icons: made }, null, 1))
console.log(`\n已导出 ${made.length} 个技能图标 -> assets/skills/`)
console.log('ID 列表: ' + made.map((m) => m.id).join(', '))
