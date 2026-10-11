// 对比"改前 vs 改后"的 grayResidue（判断 52% 是我造成的，还是预先存在的误报）
import fs from 'node:fs'
import path from 'node:path'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
function grayResidue(p) {
  const img = decodePng(fs.readFileSync(p))
  const { w, h, data } = img
  let n = 0, total = 0
  for (let y = Math.floor(h * 0.7); y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    if (data[i + 3] < 40) continue
    total++
    const r = data[i], g = data[i + 1], b = data[i + 2]
    if (Math.max(r, g, b) - Math.min(r, g, b) <= 12 && (r + g + b) / 3 >= 130) n++
  }
  return { pct: total ? +(100 * n / total).toFixed(1) : 0, w, h, total }
}
const forms = process.argv.slice(2)
if (!forms.length) forms.push('正义多比', '哈瑞肯多比', '莱特凛多比', '艾斯林')
console.log('形态            改前(官方源直出)      改后(超分)')
for (const f of forms) {
  const before = path.join(ROOT, '_tmp_test_out', 'art-before-sr', f + '.png')
  const after = path.join(ROOT, 'assets', 'forms', 'art', f + '.png')
  const b = fs.existsSync(before) ? grayResidue(before) : null
  const a = fs.existsSync(after) ? grayResidue(after) : null
  console.log(`${f.padEnd(14)} ${b ? `${b.pct}%  (${b.w}×${b.h}, 底带${b.total}px)` : '无备份'}    ${a ? `${a.pct}%  (${a.w}×${a.h})` : '缺'}`)
}
