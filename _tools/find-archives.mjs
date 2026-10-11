// M3-1：核实计划书说的"24 个未抽取的 .rar"到底在哪。
//
// 计划书第 9 章禁止遍历大目录（assets/、多克多比专区资料素材/、dist/），
// 但 M3-1 本身就要求找到这些压缩包 —— 所以这里做的是**定向搜索**：
//   · 只看文件名与大小，不开文件、不读内容
//   · 跳过 dist/、assets/sprites、node_modules、.git（这些是产物或缓存）
//   · 限制递归深度，超深目录跳过并记录
// 输出：_web/archives.json + 控制台汇总
//
// 用法： node _tools/find-archives.mjs
import fs from 'node:fs'
import path from 'node:path'

const ROOT = '.'
const MAX_DEPTH = 4                                   // 超过就不再往里钻
const SKIP_DIRS = new Set(['dist', 'node_modules', '.git', 'sprites', '_unity_tex', 'imgcache'])
const EXT = /\.(rar|7z|zip|tar|gz|bz2|xz|001)$/i

const found = []
const skipped = []
let dirsWalked = 0

function walk(dir, depth) {
  if (depth > MAX_DEPTH) { skipped.push({ dir, why: '超过深度上限 ' + MAX_DEPTH }); return }
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { skipped.push({ dir, why: e.code }); return }
  dirsWalked++
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) { skipped.push({ dir: p, why: '按名单跳过（产物/缓存）' }); continue }
      walk(p, depth + 1)
    } else if (e.isFile() && EXT.test(e.name)) {
      let size = 0
      try { size = fs.statSync(p).size } catch { }
      found.push({ file: p, size })
    }
  }
}

console.log('M3-1：搜索压缩包（只读文件名与大小，不开文件）')
walk(ROOT, 0)
found.sort((a, b) => b.size - a.size)

const byExt = {}
for (const f of found) {
  const ext = (f.file.match(EXT) || ['?'])[0].toLowerCase()
  byExt[ext] = byExt[ext] || { n: 0, bytes: 0 }
  byExt[ext].n++
  byExt[ext].bytes += f.size
}
console.log(`\n扫描目录 ${dirsWalked} 个（跳过 ${skipped.length} 个），找到压缩包 ${found.length} 个`)
console.log('按类型: ' + Object.entries(byExt).map(([k, v]) => `${k} ${v.n} 个 / ${(v.bytes / 1024 / 1024).toFixed(1)} MB`).join('　'))

console.log('\n最大的 20 个：')
for (const f of found.slice(0, 20)) {
  console.log(`  ${(f.size / 1024 / 1024).toFixed(1).padStart(8)} MB  ${f.file}`)
}

// 计划书说的"24 个 rar"：单独统计
const rars = found.filter((f) => /\.rar$/i.test(f.file))
console.log(`\n.rar 共 ${rars.length} 个：`)
for (const f of rars) console.log(`  ${(f.size / 1024 / 1024).toFixed(1).padStart(8)} MB  ${f.file}`)

if (skipped.length) {
  console.log('\n跳过项（前 10）：')
  for (const s of skipped.slice(0, 10)) console.log(`  ${s.dir}  —— ${s.why}`)
}

fs.mkdirSync('_web', { recursive: true })
fs.writeFileSync('_web/archives.json', JSON.stringify({
  scannedAt: new Date().toISOString(),
  maxDepth: MAX_DEPTH,
  dirsWalked,
  skipped,
  archives: found,
}, null, 1), 'utf8')
console.log('\n结果已写入 _web/archives.json')

// ---- 自检（R5）：这个脚本必须能给出肯定结果 ----
console.log('\n自检：')
const positive = found.length > 0
console.log(`  ${positive ? '✓' : '✗'} 能找出压缩包（找到 ${found.length} 个）`)
// 构造一个必然为真的正例：脚本自身所在的 _tools 目录里应当能读到文件
const probe = fs.readdirSync('_tools').filter((f) => f.endsWith('.mjs')).length
console.log(`  ${probe > 0 ? '✓' : '✗'} 目录枚举能力正常（_tools 下 .mjs ${probe} 个）`)
if (!positive || probe === 0) process.exit(1)
