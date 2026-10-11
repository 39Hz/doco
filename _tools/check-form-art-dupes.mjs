// 查重：assets/forms/art 里是否有两张图**像素完全相同**（同图双挂会让两只形态长得一样）
// 用法: node _tools/check-form-art-dupes.mjs
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const DIR = path.join(path.resolve('.'), 'assets', 'forms', 'art')
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.png'))
const byHash = new Map()
for (const f of files) {
  const buf = fs.readFileSync(path.join(DIR, f))
  const h = crypto.createHash('sha256').update(buf).digest('hex')
  if (!byHash.has(h)) byHash.set(h, [])
  byHash.get(h).push(f)
}
let dup = 0
for (const [h, list] of byHash) {
  if (list.length < 2) continue
  dup++
  console.log(`⚠️ 字节相同（sha256 ${h.slice(0, 12)}…）：${list.join('  =  ')}`)
}
console.log(dup ? `\n发现 ${dup} 组重复 —— 必须处理（同图双挂 = 两只形态长得一模一样）`
  : `\n✅ ${files.length} 张立绘两两不同（无重复）`)

// 额外：尺寸完全相同也提示一下（可能内容接近，肉眼复核）
const bySize = new Map()
for (const f of files) {
  const s = fs.statSync(path.join(DIR, f)).size
  if (!bySize.has(s)) bySize.set(s, [])
  bySize.get(s).push(f)
}
const sizeDup = [...bySize.entries()].filter(([, l]) => l.length > 1)
if (sizeDup.length) {
  console.log('\n（仅供参考）字节数相同、但内容是不同图的：')
  for (const [s, l] of sizeDup) if (new Set(l.map((f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR, f))).digest('hex'))).size > 1) {
    console.log(`  ${s} 字节：${l.join(', ')}`)
  }
}
