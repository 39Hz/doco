// 盘点：每个形态的立绘**有效像素高度** vs 目标 640px（= 屏幕最大显示 320px 的 2 倍）
//
// 目的：找出"小图拉大的"形态 —— 那才是看起来糊的原因（尺寸够但源像素不够）。
// 用法: node _tools/audit-form-art-2x.mjs
import fs from 'node:fs'
import path from 'node:path'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const DIR = path.join(ROOT, 'assets', 'forms', 'art')
const TARGET_H = 640          // = 屏幕最大显示 320px × 2

const rows = []
for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.png') && !n.includes('_icon')).sort()) {
  const img = decodePng(fs.readFileSync(path.join(DIR, f)))
  // 有效内容外框（去掉透明留白）
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.data[(y * img.w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x
        if (y < y0) y0 = y; if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) { rows.push({ name: f.replace('.png', ''), w: img.w, h: img.h, cw: 0, ch: 0, kb: 0, verdict: '空图' }); continue }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1
  const kb = Math.round(fs.statSync(path.join(DIR, f)).size / 1024)
  // 有效内容高度 / 目标：<1 说明源像素不足（会被放大 → 糊）
  // ⚠️ 用 ±2 容差判"够"：AI 超分流程里的去灰影会削掉 1~2px 边缘（实测 638/639），
  //    严格按 640 判会把**已达标**的判成"不足"，制造假报警。
  const ratio = ch / TARGET_H
  const verdict = ch >= TARGET_H - 2 ? '够' : ratio >= 0.75 ? '偏小' : '不足'
  rows.push({ name: f.replace('.png', ''), w: img.w, h: img.h, cw, ch, kb, ratio, verdict })
}

rows.sort((a, b) => (a.ratio || 0) - (b.ratio || 0))
console.log(`目标有效高度 ${TARGET_H}px（= 屏幕最大显示 320px 的 2 倍）\n`)
console.log('  形态            画布      有效内容    有效高/目标  体积   判定')
for (const r of rows) {
  if (r.verdict === '空图') { console.log(`  ${r.name.padEnd(14)} ${r.w}×${r.h}  —  空图`); continue }
  console.log(`  ${r.name.padEnd(14)} ${String(r.w + '×' + r.h).padEnd(9)} ${String(r.cw + '×' + r.ch).padEnd(11)} ` +
    `${r.ratio.toFixed(2).padStart(6)}      ${String(r.kb + 'KB').padStart(6)}  ${r.verdict}`)
}
const short = rows.filter((r) => r.verdict === '不足')
const near = rows.filter((r) => r.verdict === '偏小')
console.log(`\n合计 ${rows.length} 张：够 ${rows.length - short.length - near.length} / 偏小 ${near.length} / 不足 ${short.length}`)
console.log(`需要重新同步的（不足 + 偏小）：${[...short, ...near].map((r) => r.name).join('、') || '无'}`)
