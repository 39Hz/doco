// 盘点：旧图标（skill_icon_1001 这类）在项目里被谁引用 —— 决定能不能替换
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const oldIds = ['1001', '1002', '1003', '1004', '2001', '2002', '2003', '2004', '3001', '3002', '3003', '3004', '4001', '4002', '4003', '5001', '5002']

// 搜源码与数据文件里的引用
const targets = []
;(function walk(d, dep) {
  if (dep > 3) return
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(d, e.name)
    if (e.isDirectory()) { if (!/^(多克多比|_tmp_test_out|_rar_extracted|多克多比专区资料素材)/.test(e.name)) walk(p, dep + 1) }
    else if (/\.(mjs|js|json|html|md)$/i.test(e.name)) targets.push(p)
  }
})(ROOT, 0)

console.log(`扫描 ${targets.length} 个文件里的旧图标 ID 引用\n`)
const hits = new Map()
for (const f of targets) {
  let t
  try { t = fs.readFileSync(f, 'utf8') } catch { continue }
  for (const id of oldIds) {
    const re = new RegExp('skill_icon_' + id + '\\b', 'g')
    const n = (t.match(re) || []).length
    if (n) {
      if (!hits.has(id)) hits.set(id, [])
      hits.get(id).push(`${path.relative(ROOT, f)}×${n}`)
    }
  }
}
for (const id of oldIds) {
  const h = hits.get(id) || []
  console.log(`  skill_icon_${id.padEnd(5)} 被 ${h.length} 处引用${h.length ? '：' + h.slice(0, 4).join('  ') : ''}`)
}

// 也看 index.json 里旧 ID 的条目
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/skills/index.json'), 'utf8'))
const oldEntries = idx.icons.filter((i) => oldIds.includes(String(i.id)))
console.log(`\nindex.json 里旧 ID 条目 ${oldEntries.length} 个：`)
for (const e of oldEntries) console.log(`  ${e.id}  name=${e.name || '(无)'}  file=${e.file}`)
