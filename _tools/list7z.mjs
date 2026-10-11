// 解析 7z -slt 清单，输出按大小/类型筛选的条目
// 用法: node list7z.mjs <清单文件> [--ext fla,swf] [--top 40] [--under 20MB] [--grep 关键词]
import fs from 'node:fs'

const file = process.argv[2]
const argv = process.argv.slice(3)
const getArg = (k, d) => {
  const i = argv.indexOf(k)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}

const exts = (getArg('--ext', '') || '').toLowerCase().split(',').filter(Boolean)
const topN = Number(getArg('--top', 0)) || 0
const underMB = Number(getArg('--under', 0)) || 0
const grep = getArg('--grep', '')
const minKB = Number(getArg('--minKB', 0)) || 0

const text = fs.readFileSync(file, 'utf8')
const lines = text.split(/\r?\n/)

const entries = []
let cur = {}
for (const line of lines) {
  if (line === '') {
    if (cur.Path) entries.push(cur)
    cur = {}
    continue
  }
  const m = line.match(/^([A-Za-z ]+?) = (.*)$/)
  if (m) cur[m[1]] = m[2]
}
if (cur.Path) entries.push(cur)

const files = entries.filter((e) => e.Attributes !== 'D')

let sel = files
if (exts.length) sel = sel.filter((e) => exts.includes((e.Path.split('.').pop() || '').toLowerCase()))
if (grep) sel = sel.filter((e) => e.Path.includes(grep))
if (underMB) sel = sel.filter((e) => Number(e.Size) <= underMB * 1048576)
if (minKB) sel = sel.filter((e) => Number(e.Size) >= minKB * 1024)

const total = sel.reduce((a, e) => a + Number(e.Size), 0)
console.log(`条目总数 ${entries.length}，其中文件 ${files.length}；筛选后 ${sel.length} 项，合计 ${(total / 1048576).toFixed(1)} MB`)
console.log('')

const show = topN ? [...sel].sort((a, b) => Number(b.Size) - Number(a.Size)).slice(0, topN) : sel
for (const e of show) {
  console.log(`  ${(Number(e.Size) / 1048576).toFixed(2).padStart(9)} MB  ${e.Path}`)
}

// 按扩展名汇总
if (!exts.length && !topN) {
  const byExt = {}
  for (const e of files) {
    const x = (e.Path.split('.').pop() || '无扩展名').toLowerCase()
    if (!byExt[x]) byExt[x] = { n: 0, s: 0 }
    byExt[x].n++
    byExt[x].s += Number(e.Size)
  }
  console.log('\n=== 扩展名分布 ===')
  Object.entries(byExt).sort((a, b) => b[1].s - a[1].s)
    .forEach(([k, v]) => console.log(`  ${k.padEnd(10)} ${String(v.n).padStart(6)} 项  ${(v.s / 1048576).toFixed(1).padStart(9)} MB`))
}
