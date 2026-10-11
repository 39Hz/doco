// 查找精灵帧的重复来源目录：同一帧内容出现在哪些子树里
// 用途：识别归档中纯备份的重复目录
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const ROOT = path.resolve(process.argv[2])
const TOPN = Number(process.argv[3] || 30)

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (/\.png$/i.test(e.name)) acc.push(p)
  }
  return acc
}

const files = walk(ROOT, [])
console.log(`扫描 ${files.length} 个 PNG`)

// 按大小预分组，再算哈希
const bySize = new Map()
for (const f of files) {
  const s = fs.statSync(f).size
  if (!bySize.has(s)) bySize.set(s, [])
  bySize.get(s).push(f)
}

const hashToFiles = new Map()
for (const [size, group] of bySize) {
  if (group.length < 2) continue
  for (const f of group) {
    const h = crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex')
    if (!hashToFiles.has(h)) hashToFiles.set(h, [])
    hashToFiles.get(h).push(f)
  }
}

const dupGroups = [...hashToFiles.entries()].filter(([, v]) => v.length > 1)
console.log(`重复内容组: ${dupGroups.length}`)

// 统计「目录对」共现：同一内容同时出现在目录 A 和 B
const pairCount = new Map()
const topDirs = new Map()
for (const [, fl] of dupGroups) {
  const dirs = new Set(fl.map((f) => {
    const rel = path.relative(ROOT, f)
    return rel.split(path.sep).slice(0, 2).join('/')
  }))
  for (const d of dirs) topDirs.set(d, (topDirs.get(d) || 0) + 1)
  const arr = [...dirs]
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const key = arr[i] + '  ⇄  ' + arr[j]
      pairCount.set(key, (pairCount.get(key) || 0) + 1)
    }
  }
}

console.log('\n=== 重复内容涉及的顶层目录（按涉及组数）===')
;[...topDirs.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOPN)
  .forEach(([d, n]) => console.log(`  ${String(n).padStart(5)} 组  ${d}`))

console.log('\n=== 目录对共现（说明这两个目录互为重复）===')
;[...pairCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOPN)
  .forEach(([k, n]) => console.log(`  ${String(n).padStart(5)} 组  ${k}`))

// 可回收空间：每组保留一份
let waste = 0
for (const [, fl] of dupGroups) {
  const size = fs.statSync(fl[0]).size
  waste += size * (fl.length - 1)
}
console.log(`\n可回收空间: ${(waste / 1048576).toFixed(1)} MB`)
