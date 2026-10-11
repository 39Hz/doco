// 从导出的一堆贴图里挑出「角色精灵表」：
// 特征是大图、背景大量透明、上面散着若干个人物。
// 第三方 UI 包（btnIcon*、icon_* 这种）会被透明度和尺寸两个条件排掉。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const index = JSON.parse(fs.readFileSync(path.join(ROOT, '_unity_tex', 'index.json'), 'utf8'))

const STOCK = /^(btnIcon|icon_|UI_|ui_|btn_|slider_|cfxr|Textures|Sprite|sprite_|font|Font|Material|mat_)/i

const rows = []
for (const t of index) {
  if (!/\.png$/.test(t.file)) continue
  let img
  try { img = decodePng(fs.readFileSync(path.join(ROOT, t.file))) } catch { continue }
  const n = img.w * img.h
  let opaque = 0
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 24) opaque++
  const fill = opaque / n
  rows.push({ ...t, fill: +fill.toFixed(3), stock: STOCK.test(t.name) })
}

// 精灵表：面积够大 + 有相当比例的透明（人物只占一部分）
const sheets = rows.filter((r) => r.w >= 400 && r.h >= 300 && r.fill > 0.04 && r.fill < 0.92 && !r.stock)
sheets.sort((a, b) => b.w * b.h - a.w * a.h)
console.log(`共 ${rows.length} 张；判定为「疑似角色精灵表」${sheets.length} 张：\n`)
for (const s of sheets.slice(0, 80)) {
  console.log(`  ${s.name.slice(0, 34).padEnd(34)} ${String(s.w).padStart(5)}x${String(s.h).padEnd(5)} 不透明占比 ${String(s.fill).padStart(5)}  ${s.file}`)
}

// 顺便看看「不透明的整图」（多半是场景/背景/原画）
const full = rows.filter((r) => r.fill > 0.95 && r.w >= 400).sort((a, b) => b.w * b.h - a.w * a.h)
console.log(`\n整幅不透明的图 ${full.length} 张（前 20）：`)
for (const s of full.slice(0, 20)) console.log(`  ${s.name.slice(0, 34).padEnd(34)} ${s.w}x${s.h}  ${s.file}`)

fs.writeFileSync(path.join(ROOT, '_tools', '_unity_sheets.json'), JSON.stringify({ sheets, full }, null, 1))
