// 下载官方 **netstandard2.1 引用程序集**（NuGet `NETStandard.Library.Ref`）
//
// 【为什么需要】编译 Unity(Mono) 的代码时，引用面必须与目标一致：
//   · 用 .NET 9 核心库 → `System.Object 未定义`（CS0518）
//   · 用 .NET Framework 4.0 csc → 只支持 C# 5（CS1617）
//   · 用游戏自带的 netstandard.dll → `Queue<>` 类型转发失败（CS1069）
//   → 正解是**官方 netstandard2.1 引用面**，配 Roslyn netcore csc（用便携 .NET 9 跑）。
//
// 用法: node _tools/setup-netstandard-ref.mjs
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve('.')
const DIR = path.join(ROOT, '_tools/ai/netstandard-ref')
fs.mkdirSync(DIR, { recursive: true })

function fetch(url, dst, depth = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'node' }, timeout: 300000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 5) {
        res.resume()
        return resolve(fetch(new global.URL(res.headers.location, url).href, dst, depth + 1))
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)) }
      const out = fs.createWriteStream(dst)
      res.pipe(out)
      out.on('finish', () => out.close(() => resolve(fs.statSync(dst).size)))
      out.on('error', reject)
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('超时')) })
  })
}
function zipOk(p) {
  try {
    const b = fs.readFileSync(p)
    for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65536); i--) if (b.readUInt32LE(i) === 0x06054b50) return true
    return false
  } catch { return false }
}

const VER = '2.1.0'
const URL = `https://api.nuget.org/v3-flatcontainer/netstandard.library.ref/${VER}/netstandard.library.ref.${VER}.nupkg`
const NUPKG = path.join(DIR, `netstandard-ref-${VER}.nupkg`)
if (fs.existsSync(NUPKG) && !zipOk(NUPKG)) { console.log('⚠️ 包不完整，重下'); fs.rmSync(NUPKG, { force: true }) }
if (!fs.existsSync(NUPKG)) {
  console.log(`下载 NETStandard.Library.Ref ${VER} …`)
  try { console.log(`✓ ${((await fetch(URL, NUPKG)) / 1048576).toFixed(1)} MB`) } catch (e) { console.log(`✗ ${e.message}`); process.exit(1) }
} else console.log(`✓ 包已存在 ${(fs.statSync(NUPKG).size / 1048576).toFixed(1)} MB`)

const EXT = path.join(DIR, 'ref')
if (!fs.existsSync(EXT)) {
  console.log('解压…')
  const Z = NUPKG.replace(/\.nupkg$/, '.zip')
  fs.copyFileSync(NUPKG, Z)
  execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${Z}' -DestinationPath '${EXT}' -Force`], { stdio: 'inherit' })
}
// 找 netstandard.dll
const cands = []
;(function walk(d, dep) {
  if (dep > 6) return
  let es; try { es = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
  for (const e of es) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, dep + 1)
    else if (/^netstandard\.dll$/i.test(e.name)) cands.push(p)
  }
})(EXT, 0)
console.log(`\nnetstandard.dll 候选 ${cands.length} 个：`)
for (const c of cands) console.log(`  ${path.relative(ROOT, c)}`)
if (cands.length) {
  fs.writeFileSync(path.join(DIR, 'netstandard.txt'), cands[0], 'utf8')
  console.log(`\n✓ 已记下路径到 ${path.relative(ROOT, path.join(DIR, 'netstandard.txt'))}`)
}
