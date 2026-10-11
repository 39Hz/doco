// 验证"m_*.png 有大片透明边距"这个猜测：统计每个 m_*.png 的实际内容占比。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const files = fs.readdirSync(path.join(ROOT, 'assets', 'monsters')).filter((f) => /^m_\d+\.png$/.test(f)).sort()
console.log('文件'.padEnd(16) + '画布      内容框        内容占比  上下留白')
const rows = []
for (const f of files) {
  const p = decodePng(fs.readFileSync(path.join(ROOT, 'assets', 'monsters', f)))
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, n = 0
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.data[(y * p.w + x) * 4 + 3] < 24) continue
      n++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  const cw = maxX - minX + 1, ch = maxY - minY + 1
  const ratio = (cw * ch) / (p.w * p.h)
  rows.push({ f, w: p.w, h: p.h, cw, ch, minX, minY, ratio })
  console.log(f.padEnd(15) + (p.w + 'x' + p.h).padEnd(10) + (cw + 'x' + ch + ' @' + minX + ',' + minY).padEnd(18) +
    (ratio * 100).toFixed(0).padStart(6) + '%' + String(minY).padStart(9))
}
const avg = rows.reduce((a, r) => a + r.ratio, 0) / rows.length
console.log('\n平均内容占比: ' + (avg * 100).toFixed(0) + '%  →  ' + (avg < 0.6 ? '确实有大片透明边距（应该裁掉）' : '边距正常'))
console.log('平均内容尺寸: ' + Math.round(rows.reduce((a, r) => a + r.cw, 0) / rows.length) + '×' +
  Math.round(rows.reduce((a, r) => a + r.ch, 0) / rows.length))
