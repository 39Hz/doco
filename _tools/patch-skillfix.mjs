// 两处修正：
//   1) 火系行的图标块把官方图鉴的中文标注一起裁进来了（块高 137 vs 正常 108），
//      改成只取块的**下半部分**（图标在下、文字在上）。
//   2) 技能面板右下的翻页按钮压住了最后一排图标，把格子缩小并把翻页挪到网格下方。
import fs from 'node:fs'

// ---- 1) 修裁剪 ----
const bp = '_tools/build-skill-icons3.mjs'
let b = fs.readFileSync(bp, 'utf8')
const a1 = [
  'function crop(b, pad = 2) {',
  '  const x0 = Math.max(0, b.x0 - pad), y0 = Math.max(0, b.y0 - pad)',
  '  const x1 = Math.min(w - 1, b.x1 + pad), y1 = Math.min(h - 1, b.y1 + pad)',
].join('\n')
const b1 = [
  'function crop(bb, pad = 2) {',
  '  // 只取块的**下半部分**：火系那几块把图鉴的中文标注也连进来了（块高 137，',
  '  // 图标本体只有 108），文字在上、图标在下，所以从底部往上取 110px。',
  '  const full = bb.y1 - bb.y0 + 1',
  '  const keepH = Math.min(full, 110)',
  '  const yTop = bb.y1 - keepH + 1',
  '  const b = { x0: bb.x0, x1: bb.x1, y0: Math.max(bb.y0, yTop), y1: bb.y1 }',
  '  const x0 = Math.max(0, b.x0 - pad), y0 = Math.max(0, b.y0 - pad)',
  '  const x1 = Math.min(w - 1, b.x1 + pad), y1 = Math.min(h - 1, b.y1 + pad)',
].join('\n')
if (b.includes(a1)) { b = b.replace(a1, b1); fs.writeFileSync(bp, b, 'utf8'); console.log('✓ 修好图标裁剪（只取图标本体，去掉标注文字）') }
else console.log('✗ 没找到 crop 锚点')

// ---- 2) 修技能面板版式 ----
const gp = 'game/game.js'
let g = fs.readFileSync(gp, 'utf8')
const a2 = "    lib: { cols: 4, rows: 4, size: 80, gap: 10 },"
const b2 = "    // 格子从 80 缩到 72：原来 4 排排到 y=496，把底部的翻页按钮压住了\n    lib: { cols: 4, rows: 4, size: 72, gap: 10 },"
if (g.includes(a2)) { g = g.replace(a2, b2); console.log('✓ 技能库格子缩小') } else console.log('✗ 没找到 lib 配置')

const a3 = "      const y = PR.y + PR.h - 30"
const b3 = "      const y = PR.y + PR.h - 26"
if (g.includes(a3)) { g = g.replace(a3, b3); console.log('✓ 翻页下移') } else console.log('✗ 没找到翻页 y')

fs.writeFileSync(gp, g, 'utf8')
