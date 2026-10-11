// 把土系行的定位从"颜色阈值"改成"行序"。
// 颜色阈值会匹配错：物理系 rgb(201,123,68) 和土系 rgb(209,130,39) 太接近。
// 图鉴里 10 个大图标的行按 y 从上到下固定是：物理、火、水、土、风、紫业。
import fs from 'node:fs'
const p = '_tools/build-skill-icons3.mjs'
let s = fs.readFileSync(p, 'utf8')
const a = [
  '// 火系：10 个图标，且整体"又亮又黄"（R 很高、G 也高）',
  'const fireRow = rows.find((r) => r.items.length === 10 && r.avg[0] > 230 && r.avg[1] > 150 && r.avg[2] < 120)',
  '// 土系：10 个图标，偏棕黄（R>G>B，B 很低）',
  'const earthRow = rows.find((r) => r.items.length === 10 && r.avg[0] > 180 && r.avg[0] < 235 && r.avg[2] < 90)',
].join('\n')
const b = [
  '// 用**行序**定位，不靠颜色阈值。',
  '// 图鉴里"10 个大图标"的行按从上到下依次是：物理、火、水、土、风、紫业。',
  '// 上一版用颜色阈值找土系，结果匹配到了物理系 —— 两者平均色太接近。',
  'const tenRows = rows.filter((r) => r.items.length === 10)',
  'console.log("10 图标行（按 y）: " + tenRows.map((r) => "y" + Math.round(r.y0) + " rgb(" + r.avg.join(",") + ")").join("  |  "))',
  'const fireRow = tenRows[1]',
  'const earthRow = tenRows[3]',
  'if (earthRow && earthRow.avg[2] > 110) console.log("★ 警告：第 4 个 10 图标行蓝色分量偏高，可能不是土系")',
].join('\n')
if (!s.includes(a)) { console.error('锚点没找到'); process.exit(1) }
fs.writeFileSync(p, s.replace(a, b), 'utf8')
console.log('已改为按行序定位')
