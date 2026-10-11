// 下载便携版 .NET 运行时（解压即用，不装到系统里）——为了跑 ilspycmd
//
// 【为什么】ilspycmd 9.x 目标框架是 net8.0，而本机只有 `Microsoft.NETCore.App 6.0.5`。
//   装 SDK 太重（>200MB）且要写系统目录；**下运行时 zip 解到工作区**最干净。
//
// 用法: node _tools/get-dotnet-runtime.mjs [8.0|6.0]
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve('.')
const WANT = process.argv[2] || '8.0'
const DIR = path.join(ROOT, '_tools', 'ai', 'dotnet')
fs.mkdirSync(DIR, { recursive: true })

function get(url, depth = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'node', Accept: 'application/json' }, timeout: 40000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 5) {
        res.resume()
        return resolve(get(new global.URL(res.headers.location, url).href, depth + 1))
      }
      let b = ''
      res.on('data', (c) => { b += c })
      res.on('end', () => resolve({ status: res.statusCode, body: b }))
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('超时')) })
  })
}
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
      res.on('data', (c) => {
        got += c.length
        if (Date.now() - last > 10000) { last = Date.now(); console.log(`    ${(got / 1048576).toFixed(1)} MB`) }
      })
      res.pipe(out)
      out.on('finish', () => out.close(() => resolve(got)))
      out.on('error', reject)
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('超时')) })
  })
}

console.log(`查 .NET ${WANT} 运行时的下载地址…`)
const r = await get('https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json')
if (r.status !== 200) { console.log(`✗ 查询失败 HTTP ${r.status}`); process.exit(1) }
const idx = JSON.parse(r.body)
const rel = (idx['releases-index'] || []).find((x) => String(x['channel-version']).startsWith(WANT))
if (!rel) { console.log(`✗ 没有 ${WANT} 频道`); process.exit(1) }
const rr = await get(rel['releases.json'])
const rj = JSON.parse(rr.body)
const latest = rj.releases[0]
const ver = latest['release-version']
console.log(`最新 ${WANT} 运行时：${ver}`)

// 找 win-x64 的 "Microsoft.NETCore.App" 运行时 zip
let url = null
for (const f of latest.files || []) {
  if (/win-x64/i.test(f.rid || '') && /dotnet-runtime/i.test(f.name || '') && /\.zip$/i.test(f.name)) { url = f.url; break }
}
if (!url) {
  // 兜底：按命名规则拼
  url = `https://dotnetcli.blob.core.windows.net/dotnet/Runtime/${ver}/dotnet-runtime-${ver}-win-x64.zip`
}
console.log(`下载 ${url}`)
const zip = path.join(DIR, `dotnet-runtime-${ver}-win-x64.zip`)
// ⚠️ 必须校验完整性：上一次下载被中断，留了个 8.2MB 的残缺 zip，脚本却当成'已下载'跳过，
//    结果 Expand-Archive 报 'End of Central Directory record could not be found'。
//    所以：**存在也要校验 zip 目录**，坏了就删掉重下。
function zipOk(p) {
  try {
    const b = fs.readFileSync(p)
    // zip 末尾 22 字节起是 EOCD，签名 0x06054b50（允许 64KB 注释）
    for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65536); i--) {
      if (b.readUInt32LE(i) === 0x06054b50) return true
    }
    return false
  } catch { return false }
}
if (fs.existsSync(zip) && !zipOk(zip)) { console.log('⚠️ 已存在的 zip 不完整，删除重下'); fs.rmSync(zip, { force: true }) }
if (!fs.existsSync(zip)) {
  try {
    const n = await fetch(url, zip)
    console.log(`✓ ${(n / 1048576).toFixed(1)} MB → ${path.relative(ROOT, zip)}`)
  } catch (e) { console.log(`✗ 下载失败：${e.message}`); process.exit(1) }
} else console.log('✓ 已有该 zip')

const EXT = path.join(DIR, 'runtime')
if (!fs.existsSync(path.join(EXT, 'dotnet.exe'))) {
  console.log('解压…')
  execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${EXT}' -Force`], { stdio: 'inherit' })
}
const exe = path.join(EXT, 'dotnet.exe')
console.log(`\n便携运行时: ${path.relative(ROOT, exe)}`)
try {
  execFileSync(exe, ['--list-runtimes'], { stdio: 'inherit' })
  console.log('\n✓ 便携 .NET 可用（跑 ilspycmd 时设 DOTNET_ROOT 指到它）')
  fs.writeFileSync(path.join(DIR, 'root.txt'), EXT, 'utf8')
} catch (e) { console.log(`✗ 跑不起来：${String(e.message).slice(0, 160)}`) }
