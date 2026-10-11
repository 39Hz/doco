// 从 NuGet 下 Roslyn 编译器（Microsoft.Net.Compilers.Toolset）——用便携 .NET 8 跑
//
// 【为什么必须换编译器】系统自带的 `csc.exe`（.NET Framework 4.0 那个）**最高只支持 C# 5**，
//   而 ilspycmd 反编译出来的是 **C# 9** 代码（模式匹配、switch 表达式、record 等）。
//   报错：`CS1617: 选项"9.0"对 /langversion 无效；必须是 ISO-1…ISO-2、3、4、5 或 Default`。
//   Roslyn 的 csc 支持全部新语法，且包里自带可执行程序集，不需要装 SDK。
//
// 用法: node _tools/setup-roslyn.mjs
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve('.')
const DIR = path.join(ROOT, '_tools/ai/roslyn')
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
      let got = 0, last = Date.now()
      res.on('data', (c) => { got += c.length; if (Date.now() - last > 8000) { last = Date.now(); console.log(`    ${(got / 1048576).toFixed(1)} MB`) } })
      res.pipe(out)
      out.on('finish', () => out.close(() => resolve(got)))
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
function getJson(url, depth = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'node', Accept: 'application/json' }, timeout: 40000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 5) {
        res.resume(); return resolve(getJson(new global.URL(res.headers.location, url).href, depth + 1))
      }
      let b = ''; res.on('data', (c) => { b += c }); res.on('end', () => resolve(JSON.parse(b)))
    }).on('error', reject)
  })
}

const VER = '4.14.0'
const URL = `https://api.nuget.org/v3-flatcontainer/microsoft.net.compilers.toolset/${VER}/microsoft.net.compilers.toolset.${VER}.nupkg`
const NUPKG = path.join(DIR, `roslyn-${VER}.nupkg`)
if (fs.existsSync(NUPKG) && !zipOk(NUPKG)) { console.log('⚠️ 已存在的包不完整，删除重下'); fs.rmSync(NUPKG, { force: true }) }
if (!fs.existsSync(NUPKG)) {
  console.log(`下载 Roslyn ${VER} …`)
  try { console.log(`✓ ${((await fetch(URL, NUPKG)) / 1048576).toFixed(1)} MB`) } catch (e) { console.log(`✗ ${e.message}`); process.exit(1) }
} else console.log(`✓ 包已存在 ${(fs.statSync(NUPKG).size / 1048576).toFixed(1)} MB`)

const EXT = path.join(DIR, 'toolset')
if (!fs.existsSync(path.join(EXT, 'tasks'))) {
  console.log('解压…')
  const Z = NUPKG.replace(/\.nupkg$/, '.zip')
  fs.copyFileSync(NUPKG, Z)
  execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${Z}' -DestinationPath '${EXT}' -Force`], { stdio: 'inherit' })
}
// 找 csc.dll
const cands = []
;(function walk(d, dep) {
  if (dep > 5) return
  let es; try { es = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
  for (const e of es) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, dep + 1)
    else if (/^csc\.dll$/i.test(e.name)) cands.push(p)
  }
})(EXT, 0)
console.log(`\ncsc 候选 ${cands.length} 个：`)
for (const c of cands.slice(0, 6)) console.log(`  ${path.relative(ROOT, c)}`)

// 优先 net8.0 / net7.0 面
const pick = cands.find((c) => /net8\.0|net7\.0|net6\.0/.test(c)) || cands[0]
if (!pick) { console.log('✗ 没找到 csc.dll'); process.exit(1) }

const DN = path.join(ROOT, '_tools/ai/dotnet/runtime/dotnet.exe')
console.log(`\n用便携 .NET 8 试跑：${path.relative(ROOT, pick)}`)
try {
  execFileSync(DN, [pick, '/version'], { stdio: 'inherit', env: { ...process.env, DOTNET_ROOT: path.dirname(DN) } })
  fs.writeFileSync(path.join(DIR, 'csc.txt'), pick, 'utf8')
  console.log('\n✓ Roslyn csc 可用')
} catch (e) { console.log(`\n✗ 跑不起来：${String(e.message).slice(0, 200)}`) }
