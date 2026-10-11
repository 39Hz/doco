// 校验效果图的颜色是否正确（不许只靠肉眼）
import fs from 'node:fs'
import { decodePng } from './pixel-canvas.mjs'
const img = decodePng(fs.readFileSync('docs/shots/form-hd-compare.png'))
let best = null, bs = -1, warm = 0, cyan = 0
for (let y = 0; y < img.h; y += 2) for (let x = 0; x < img.w; x += 2) {
  const i = (y * img.w + x) * 4
  const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2]
  const s = Math.max(r, g, b) - Math.min(r, g, b)
  if (s > bs) { bs = s; best = [r, g, b, x, y] }
  if (s > 40) { if (r >= g && g > b) warm++; else if (b >= g && g > r) cyan++ }
}
console.log(`图 ${img.w}×${img.h}`)
console.log(`最饱和像素 rgb(${best.slice(0, 3).join(',')}) @(${best[3]},${best[4]})`)
console.log(`色相分布：橙黄 ${warm}  青蓝 ${cyan}`)
const ok = warm > cyan && best[0] > 150 && best[2] < 120
console.log(ok ? '✅ 颜色正确（橙黄主体）' : '❌ 颜色不对')
process.exit(ok ? 0 : 1)
