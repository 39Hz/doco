// 量走路帧的运动学：每帧的落地高度、抬升量、宽度变化（判断"蹦"得对不对）
// 用法: node _tools/probe-walk-motion.mjs 龙多比
import fs from 'node:fs'
import path from 'node:path'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const form = process.argv[2] || '龙多比'
const dir = path.join(ROOT, 'assets', 'forms', 'walk')

const files = fs.readdirSync(dir).filter((f) => f.startsWith(form + '_') && f.endsWith('.png'))
  .sort((a, b) => Number(a.match(/_(\d+)\./)[1]) - Number(b.match(/_(\d+)\./)[1]))
if (!files.length) { console.log('没找到 ' + form + ' 的走路帧'); process.exit(1) }

console.log(`${form}：${files.length} 帧\n`)
console.log('  帧   画布        有效高   脚底y    离地     宽度    重心x偏移')
const rows = []
for (const f of files) {
  const img = decodePng(fs.readFileSync(path.join(dir, f)))
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1
  let sx = 0, n = 0
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.data[(y * img.w + x) * 4 + 3] > 40) {
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
      sx += x; n++
    }
  }
  // ⚠️ 衡量"摆动"要用**重心位移**，不是包围盒宽度：
  //    横向错切只是把上半身平移，包围盒宽度几乎不变（实测只差几个像素），
  //    第一版用宽度当指标，误判成"没摆动"。
  rows.push({ f, w: img.w, h: img.h, eff: y1 - y0 + 1, bottom: y1, width: x1 - x0 + 1, cx: n ? sx / n : 0 })
}
const maxBottom = Math.max(...rows.map((r) => r.bottom))
const cx0 = rows[0].cx
for (const r of rows) {
  const lift = maxBottom - r.bottom
  console.log(`  ${r.f.match(/_(\d+)\./)[1]}   ${String(r.w + '×' + r.h).padEnd(10)} ${String(r.eff).padStart(5)}   ${String(r.bottom).padStart(5)}   ${String(lift).padStart(4)}   ${String(r.width).padStart(5)}   ${(r.cx - cx0).toFixed(1).padStart(8)}`)
}
// 判读
const lifts = rows.map((r) => maxBottom - r.bottom)
const effs = rows.map((r) => r.eff)
const cxs = rows.map((r) => r.cx)
const maxLift = Math.max(...lifts)
const swayRange = Math.max(...cxs) - Math.min(...cxs)
console.log(`\n判读：`)
console.log(`  最大离地 ${maxLift}px（占有效高 ${(maxLift / Math.max(...effs) * 100).toFixed(1)}%）`)
console.log(`  重心摆动范围 ${swayRange.toFixed(1)}px（占有效高 ${(swayRange / Math.max(...effs) * 100).toFixed(1)}%）`)
console.log(`  不同姿势数 ${new Set(rows.map((r) => `${r.eff}|${r.cx.toFixed(1)}`)).size} / ${rows.length} 帧（应等于帧数，否则有重复帧）`)
console.log(`  → 离地 >8% 显得"蹦"；重心摆动 >2% 才有"迈步感"；重复帧 = 循环里白占一帧`)
