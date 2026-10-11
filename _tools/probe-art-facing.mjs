// 核实：形态立绘到底"朝左"的多还是"朝右"的多
//
// 【为什么需要】`game.js` 里写死 `const ART_FACES_LEFT = true`，注释说
//   "官方立绘是朝左的 3/4 侧脸"。但用户指出战斗里朝向不对 ——
//   如果立绘**不是全都朝左**，用同一个常数翻所有立绘就必然有一半是反的。
//
// 判据（对**眼睛/脸**做，不是整张图的包围盒 —— 角色可能歪头）：
//   取立绘上半部（头），计算**左右两半"白色亮部"的重心**；
//   脸/眼睛所在的那一侧通常更亮（眼白 + 高光）。
//   这个判据只能给"多数倾向"，所以输出的是**统计结论 + 逐只明细**，最终仍以人眼抽查为准。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng } from './pixel-canvas.mjs'

const DIR = path.resolve('assets', 'forms', 'art')
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.png') && !f.includes('_icon')).sort()

const rows = []
for (const f of files) {
  const img = decodePng(fs.readFileSync(path.join(DIR, f)))
  // 定位主体包围盒
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.data[(y * img.w + x) * 4 + 3] > 40) {
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
  if (x1 < 0) continue
  // 头部区域 = 上 45%
  const hy1 = y0 + Math.round((y1 - y0) * 0.45)
  const mid = Math.round((x0 + x1) / 2)
  let lw = 0, rw = 0          // 左/右半边的"亮像素"加权重心
  let lsum = 0, rsum = 0, ln = 0, rn = 0
  for (let y = y0; y <= hy1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * img.w + x) * 4
    if (img.data[i + 3] < 40) continue
    const lum = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3
    if (lum < 205) continue                 // 只看接近白的高光/眼白
    if (x < mid) { lw += lum; lsum++; ln++ } else { rw += lum; rsum++; rn++ }
  }
  // 亮部像素数差（脸那一侧通常眼白更多）
  const diff = ln - rn
  rows.push({ name: f.replace('.png', ''), ln, rn, diff, bias: diff > 0 ? '左' : '右' })
}

const left = rows.filter((r) => r.bias === '左').length
const right = rows.filter((r) => r.bias === '右').length
console.log(`形态立绘 ${rows.length} 张（按"头部亮部重心"判，仅供参考）`)
console.log(`  偏左 ${left} 张 / 偏右 ${right} 张`)
console.log('\n明细（按差异绝对值排序，差异大的更可信）：')
rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
for (const r of rows.slice(0, 16)) {
  console.log(`  ${r.name.padEnd(14)} 左亮 ${String(r.ln).padStart(5)}  右亮 ${String(r.rn).padStart(5)}  → 偏${r.bias}`)
}
console.log('\n⚠️ 这只是统计参考：立绘可能歪头、戴头盔、有异色虹膜，都会干扰。')
console.log('   要判断某一只的朝向，**必须看图**。')
