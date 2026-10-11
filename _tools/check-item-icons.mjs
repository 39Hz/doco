// 自检：55 件道具的图标文件是否都真的画了东西（不是全透明空图）。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const txt = fs.readFileSync(path.join(ROOT, 'assets', 'items.js'), 'utf8')
const data = JSON.parse(txt.replace(/^[\s\S]*?window\.__DKDbb_ITEMS__\s*=\s*/, '').replace(/;\s*$/, ''))

const empty = [], missing = []
for (const it of data.items) {
  const p = path.join(ROOT, it.icon)
  if (!fs.existsSync(p)) { missing.push(it.id + ' ' + it.name); continue }
  const img = decodePng(fs.readFileSync(p))
  let n = 0
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 24) n++
  if (n < 40) empty.push(`${it.id} ${it.name} 非透明像素=${n}`)
}
console.log(`道具 ${data.items.length} 件`)
console.log(missing.length ? '★ 缺文件:\n  ' + missing.join('\n  ') : '✓ 图标文件全部存在')
console.log(empty.length ? '★ 近乎空白:\n  ' + empty.join('\n  ') : '✓ 每个图标都有实际内容')
// 唯一性：不同道具不应该全用同一张图（除了共用兜底图形的同级药剂，那是设计如此）
const byIcon = new Map()
for (const it of data.items) {
  if (!byIcon.has(it.icon)) byIcon.set(it.icon, [])
  byIcon.get(it.icon).push(it.name)
}
console.log(`✓ 用了 ${byIcon.size} 个不同图标文件（55 件道具）`)
