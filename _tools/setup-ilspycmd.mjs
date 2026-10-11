// 装 ilspycmd（ILSpy 命令行反编译器）——用于把 Assembly-CSharp.dll 反编译成完整 C#
//
// 【为什么绕这一圈】本机 `dotnet` 只有**运行时**（6.0.5），没有 SDK，
//   所以 `dotnet tool install` 用不了。但 ilspycmd 的 NuGet 包里有**预编译的程序集**，
//   可以直接 `dotnet <dll>` 跑（只要运行时版本够）。
//
// 用法: node _tools/setup-ilspycmd.mjs
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve('.')
const DIR = path.join(ROOT, '_tools', 'ai', 'ilspy')
const NUPKG = path.join(DIR, 'ilspycmd.nupkg')
fs.mkdirSync(DIR, { recursive: true })

// NuGet 的 flat container 直链（省去解析 service index）
const VER = '9.0.0.7889'
const URL = `https://api.nuget.org/v3-flatcontainer/ilspycmd/${VER}/ilspycmd.${VER}.nupkg`

function fetch(url, dst, depth = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'node' }, timeout: 180000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
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

if (!fs.existsSync(NUPKG)) {
  console.log(`下载 ilspycmd ${VER} …`)
  try {
    const n = await fetch(URL, NUPKG)
    console.log(`✓ ${(n / 1048576).toFixed(1)} MB → ${path.relative(ROOT, NUPKG)}`)
  } catch (e) {
    console.log(`✗ 下载失败：${e.message}`)
    console.log(`  （可换版本：先跑 node 脚本查 https://api.nuget.org/v3-flatcontainer/ilspycmd/index.json）`)
    process.exit(1)
  }
} else console.log(`✓ 包已存在（${(fs.statSync(NUPKG).size / 1048576).toFixed(1)} MB）`)

// .nupkg 就是 zip → 解压
const EXT = path.join(DIR, 'ilspycmd')
if (!fs.existsSync(path.join(EXT, 'tools'))) {
  console.log('解压 …')
  // Expand-Archive 只认 .zip 扩展名 → 先复制一份成 .zip 再解（.nupkg 本质就是 zip）
  const ZIPCOPY = NUPKG.replace(/\.nupkg$/, '.zip')
  fs.copyFileSync(NUPKG, ZIPCOPY)
  execFileSync('powershell', ['-NoProfile', '-Command',
    `Expand-Archive -LiteralPath '${ZIPCOPY}' -DestinationPath '${EXT}' -Force`], { stdio: 'inherit' })
}
// 找入口 dll
const cands = []
;(function walk(d, dep) {
  if (dep > 4) return
  let es; try { es = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
  for (const e of es) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, dep + 1)
    else if (/^ilspycmd\.dll$/i.test(e.name) || /ilspycmd.*\.dll$/i.test(e.name)) cands.push(p)
  }
})(EXT, 0)
console.log(`\n找到入口候选 ${cands.length} 个：`)
for (const c of cands.slice(0, 6)) console.log(`  ${path.relative(ROOT, c)}`)

const entry = cands[0]
if (!entry) { console.log('✗ 没找到 ilspycmd.dll'); process.exit(1) }
// 自证：能 --help
try {
  execFileSync('C:/Program Files/dotnet/dotnet.exe', [entry, '--help'], { stdio: 'inherit' })
  console.log('\n✓ ilspycmd 可用')
  fs.writeFileSync(path.join(DIR, 'entry.txt'), entry, 'utf8')
  console.log(`入口已记到 ${path.relative(ROOT, path.join(DIR, 'entry.txt'))}`)
} catch (e) {
  console.log(`\n✗ ilspycmd 跑不起来：${String(e.message).slice(0, 200)}`)
  console.log('  可能原因：运行时版本不匹配（包要求 .NET 9，本机只有 6.0.5）→ 需换更低的 ilspycmd 版本')
  process.exit(1)
}
