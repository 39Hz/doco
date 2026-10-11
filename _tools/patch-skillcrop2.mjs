// 裁剪方向修正：火系那几个块是「图标在上、文字在下」，应该取**顶部** 110px。
// 上一版取了底部，结果把图标切掉一半、只剩下半截花纹。
import fs from 'node:fs'
const p = '_tools/build-skill-icons3.mjs'
let s = fs.readFileSync(p, 'utf8')
const a = [
  '  const full = bb.y1 - bb.y0 + 1',
  '  const keepH = Math.min(full, 110)',
  '  const yTop = bb.y1 - keepH + 1',
  '  const b = { x0: bb.x0, x1: bb.x1, y0: Math.max(bb.y0, yTop), y1: bb.y1 }',
].join('\n')
const b = [
  '  const full = bb.y1 - bb.y0 + 1',
  '  const keepH = Math.min(full, 110)',
  '  const b = { x0: bb.x0, x1: bb.x1, y0: bb.y0, y1: Math.min(bb.y1, bb.y0 + keepH - 1) }',
].join('\n')
if (!s.includes(a)) { console.error('没找到锚点'); process.exit(1) }
s = s.replace(a, b)
s = s.replace('// 只取块的**下半部分**：火系那几块把图鉴的中文标注也连进来了（块高 137，',
  '// 只取块的**上半部分**：火系那几块把图鉴的中文标注也连进来了（块高 137，')
s = s.replace('// 图标本体只有 108），文字在上、图标在下，所以从底部往上取 110px。',
  '// 图标本体只有 108），图标在上、文字在下，所以从上往下取 110px。')
fs.writeFileSync(p, s, 'utf8')
console.log('✓ 改成取顶部')
