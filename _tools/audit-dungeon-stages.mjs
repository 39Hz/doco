// 盘点副本关卡：哪些还在走"通用记忆力关"（v1.0 清单里的待办：3 个待按原文定制）
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const t = fs.readFileSync(path.join(ROOT, 'game/tables/dungeons.js'), 'utf8')

// 抓每个副本块：id/name + 其 stages 里的 kind 与 label
const blocks = []
const re = /\{\s*\n\s*id:\s*'([^']+)',\s*name:\s*'([^']+)'/g
let m
const starts = []
while ((m = re.exec(t)) !== null) starts.push({ id: m[1], name: m[2], at: m.index })
for (let i = 0; i < starts.length; i++) {
  const seg = t.slice(starts[i].at, i + 1 < starts.length ? starts[i + 1].at : t.length)
  const kinds = [...seg.matchAll(/kind:\s*'([^']+)'/g)].map((x) => x[1])
  const labels = [...seg.matchAll(/label:\s*'([^']+)'/g)].map((x) => x[1])
  const conf = (seg.match(/conf:\s*'([^']+)'/) || [, '?'])[1]
  blocks.push({ ...starts[i], kinds, labels, conf })
}
console.log(`副本 ${blocks.length} 个\n`)

// 统计关卡种类
const kindCount = {}
for (const b of blocks) for (const k of b.kinds) kindCount[k] = (kindCount[k] || 0) + 1
console.log('关卡种类统计：' + Object.entries(kindCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('  '))

// 哪些副本含通用 memory 关
console.log('\n=== 含「memory（通用记忆力关）」的副本 ===')
const withMemory = blocks.filter((b) => b.kinds.includes('memory'))
for (const b of withMemory) {
  const idx = b.kinds.indexOf('memory')
  console.log(`  ${b.name.padEnd(14)} [${b.conf}]  关卡：${b.labels.join(' → ')}`)
  console.log(`       memory 那关叫「${b.labels[idx] || '?'}」`)
}
console.log(`\n共 ${withMemory.length} 个副本含通用记忆力关`)

// 已有专属机制的种类（按原文定制过的）
console.log('\n=== 已按原文定制的关卡种类 ===')
const bespoke = Object.keys(kindCount).filter((k) => k !== 'memory' && k !== 'battle' && k !== 'boss')
console.log('  ' + bespoke.join('、'))
