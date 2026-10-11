// M3-1：解包素材目录里未抽取的 .rar。
//
// 环境事实（实测，不是猜的）：
//   · 机器上**没有** 7z / UnRAR / WinRAR
//   · Windows 自带的 bsdtar（libarchive 3.8.8）**能读 rar**，且中文文件名转换正确
//     （实测解 icon.rar 得到「多克.png」「多克20X20.png」）
//   · 沙箱下 Node 子进程**不能用管道**（EPERM），所以用 stdio:'ignore' + 退出码判断
//
// 遵守 R4（原始资产只读）：只读 .rar，解到新目录 `_rar_extracted/`，绝不改动原文件。
//
// 用法： node _tools/extract-rars.mjs
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = '.'
const OUT_ROOT = '_rar_extracted'
const listFile = '_web/archives.json'
if (!fs.existsSync(listFile)) {
  console.error('缺 _web/archives.json —— 先跑 node _tools/find-archives.mjs')
  process.exit(2)
}
const rars = JSON.parse(fs.readFileSync(listFile, 'utf8')).archives.filter((a) => /\.rar$/i.test(a.file))
console.log(`待解包 .rar ${rars.length} 个，共 ${(rars.reduce((s, a) => s + a.size, 0) / 1024 / 1024).toFixed(1)} MB`)

// 目标目录名：用 rar 的文件名（去掉扩展名），并做安全化处理
function safeName(p) {
  const base = path.basename(p).replace(/\.rar$/i, '')
  return base.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60) || 'unnamed'
}
function walkFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walkFiles(p, acc)
    else acc.push(p)
  }
  return acc
}

fs.mkdirSync(OUT_ROOT, { recursive: true })
const results = []
let okCount = 0, failCount = 0
for (const a of rars) {
  const name = safeName(a.file)
  const out = path.join(OUT_ROOT, name)
  fs.mkdirSync(out, { recursive: true })
  // stdio:'ignore' —— 沙箱下不能用管道；只看退出码
  const r = spawnSync('tar', ['-xf', a.file, '-C', out], { stdio: 'ignore', timeout: 300000 })
  const code = r.status
  if (r.error) {
    console.log(`  ✗ ${name}  —— 启动失败 ${r.error.code}`)
    failCount++
    results.push({ rar: a.file, out, error: r.error.code, files: 0, bytes: 0 })
    continue
  }
  let files = []
  try { files = walkFiles(out) } catch { }
  const bytes = files.reduce((s, f) => s + (fs.statSync(f).size || 0), 0)
  const bad = files.filter((f) => /\uFFFD/.test(f)).length
  results.push({ rar: a.file, out, exit: code, files: files.length, bytes, mojibake: bad, names: files.map((f) => path.relative(out, f)) })
  if (code === 0 && files.length) {
    okCount++
    console.log(`  ✓ ${name.padEnd(34)} ${String(files.length).padStart(4)} 个文件  ${(bytes / 1024 / 1024).toFixed(2).padStart(7)} MB${bad ? `  ⚠ 乱码名 ${bad}` : ''}`)
  } else {
    failCount++
    console.log(`  ✗ ${name.padEnd(34)} 退出码 ${code}，解出 ${files.length} 个`)
  }
}

fs.mkdirSync('_web', { recursive: true })
fs.writeFileSync('_web/rar_contents.json', JSON.stringify({
  extractedAt: new Date().toISOString(), okCount, failCount, results,
}, null, 1), 'utf8')

// ---------- 汇总：按扩展名看我们拿到了什么 ----------
const byExt = {}
let totalBytes = 0
for (const r of results) for (const n of (r.names || [])) {
  const ext = (n.match(/\.[A-Za-z0-9]+$/) || ['(无扩展名)'])[0].toLowerCase()
  byExt[ext] = (byExt[ext] || 0) + 1
}
for (const r of results) totalBytes += r.bytes || 0
console.log(`\n汇总：成功 ${okCount}，失败 ${failCount}，共 ${(totalBytes / 1024 / 1024).toFixed(1)} MB`)
console.log('按扩展名：' + Object.entries(byExt).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k} ${v}`).join('　'))
console.log(`清单已写入 _web/rar_contents.json`)

// ---------- 自检（R5）----------
console.log('\n自检：')
const totalFiles = results.reduce((s, r) => s + (r.files || 0), 0)
const mojiTotal = results.reduce((s, r) => s + (r.mojibake || 0), 0)
console.log(`  ${totalFiles > 0 ? '✓' : '✗'} 解出文件 ${totalFiles} 个`)
console.log(`  ${mojiTotal === 0 ? '✓' : '✗'} 文件名无乱码（乱码 ${mojiTotal} 个）`)
// 正例：至少有一个 rar 应当解出图片（icon.rar 里确定有 PNG）
const hasPng = (byExt['.png'] || 0) > 0
console.log(`  ${hasPng ? '✓' : '✗'} 至少解出了 PNG（${byExt['.png'] || 0} 个）—— 证明这条链路真的能出图`)
if (!(totalFiles > 0 && mojiTotal === 0 && hasPng)) process.exit(1)
