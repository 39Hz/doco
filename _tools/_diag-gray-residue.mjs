// 按 test-form-art.mjs 的 grayResidue 口径，逐只量当前成品（定位 52% 从哪来）
// 判据（与 build-form-art.mjs / test-form-art.mjs 一致）：
//   区域 y >= h*0.7；只算 alpha>=40 的像素；
//   其中「色差 <=12 且平均亮度 >=130」的算残留，返回百分比。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng } from './pixel-canvas.mjs'

const DIR = path.resolve('assets', 'forms', 'art')
function grayResidue(img) {
  const { w, h, data } = img
  let n = 0, total = 0
  for (let y = Math.floor(h * 0.7); y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    if (data[i + 3] < 40) continue
    total++
    const r = data[i], g = data[i + 1], b = data[i + 2]
    if (Math.max(r, g, b) - Math.min(r, g, b) <= 12 && (r + g + b) / 3 >= 130) n++
  }
  return total ? +(100 * n / total).toFixed(1) : 0
}
const rows = []
for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.png') && !n.includes('_icon')).sort()) {
  const img = decodePng(fs.readFileSync(path.join(DIR, f)))
  rows.push({ name: f.replace('.png', ''), w: img.w, h: img.h, r: grayResidue(img) })
}
rows.sort((a, b) => b.r - a.r)
console.log('灰影残留前三：')
for (const r of rows.slice(0, 5)) console.log(`   ${r.name}  ${r.w}×${r.h}  ${r.r}%`)
console.log(`\n超过 30% 的：${rows.filter((r) => r.r > 30).length} 只`)
console.log(`超过 15% 的：${rows.filter((r) => r.r > 15).length} 只`)
