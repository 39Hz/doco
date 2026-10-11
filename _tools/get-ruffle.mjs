// 下载 Ruffle nightly（Windows x64）—— Flash 模拟器，用于渲染归档里的纯矢量 SWF/FLA
//
// 【为什么需要它】归档里有大量**纯矢量**素材（多比战斗动画、技能图标 FLA、动作序列），
//   `carve-fla.mjs` 只能抠内嵌位图，对这些文件抠出 0 张 —— 所以一直没法出图。
//   Ruffle 是 Rust 写的 Flash 模拟器，能把 SWF 渲染出来。
//
// ⚠️ 网络实测：GitHub 直连 ~5 KB/s（20MB 要 1 小时），`gh-proxy.com` 镜像 ~14 KB/s（约 25 分钟）。
//    所以走镜像 + 单连接 + Range 续传（并发会被共享 CDN 掐连接，本项目早先踩过）。
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'

const ROOT = path.resolve('.')
const DIR = path.join(ROOT, '_tools', 'ai', 'ruffle')
const ZIP = path.join(DIR, 'ruffle.zip')
const TAG = 'nightly-2026-09-29'
const ASSET = `ruffle-nightly-2026_09_29-windows-x86_64.zip`
const TARGET = `https://github.com/ruffle-rs/ruffle/releases/download/${TAG}/${ASSET}`
const URLS = [
  `https://gh-proxy.com/${TARGET}`,
  TARGET,
]
fs.mkdirSync(DIR, { recursive: true })

function head(url, depth = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'node' }, timeout: 30000, method: 'GET' }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 5) {
        res.resume()
        return resolve(head(new global.URL(res.headers.location, url).href, depth + 1))
      }
      res.destroy()
      resolve({ status: res.statusCode, len: Number(res.headers['content-length'] || 0), acceptRanges: res.headers['accept-ranges'] })
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('超时')) })
  })
}

// 带续传的下载（单连接）
function download(url, dst) {
  return new Promise((resolve, reject) => {
    let have = fs.existsSync(dst) ? fs.statSync(dst).size : 0
    const headers = { 'User-Agent': 'node' }
    if (have > 0) headers.Range = `bytes=${have}-`
    const req = https.get(url, { headers, timeout: 120000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return resolve(download(new global.URL(res.headers.location, url).href, dst))
      }
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        res.resume()
        return reject(new Error('HTTP ' + res.statusCode))
      }
      if (res.statusCode === 200 && have > 0) { have = 0; fs.rmSync(dst, { force: true }) }  // 服务器不支持续传 → 重头来
      const total = have + Number(res.headers['content-length'] || 0)
      const out = fs.createWriteStream(dst, { flags: have > 0 ? 'a' : 'w' })
      let got = have
      let lastTick = Date.now()
      res.on('data', (c) => {
        got += c.length
        if (Date.now() - lastTick > 15000) {
          lastTick = Date.now()
          const pct = total ? (got / total * 100).toFixed(1) : '?'
          console.log(`    ${(got / 1048576).toFixed(1)}/${(total / 1048576).toFixed(1)} MB  ${pct}%`)
        }
      })
      res.pipe(out)
      out.on('finish', () => out.close(() => resolve({ got, total })))
      out.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('超时')))
  })
}

let ok = false
for (const u of URLS) {
  const host = new global.URL(u).host
  try {
    const h = await head(u)
    console.log(`源 ${host}: HTTP ${h.status}  大小 ${(h.len / 1048576).toFixed(1)}MB  支持续传 ${h.acceptRanges || '未知'}`)
    if (h.status >= 400) { console.log('  跳过'); continue }
    if (fs.existsSync(ZIP) && fs.statSync(ZIP).size === h.len) { console.log('  已下载完整，跳过'); ok = true; break }
    console.log(`  开始下载 → ${path.relative(ROOT, ZIP)}`)
    const r = await download(u, ZIP)
    console.log(`  ✓ 完成 ${(r.got / 1048576).toFixed(1)}MB`)
    ok = true
    break
  } catch (e) {
    console.log(`  ✗ ${host} 失败: ${e.message}`)
  }
}
if (!ok) { console.log('\n✗ 所有源都失败'); process.exit(1) }
console.log(`\n✓ 已下载 ${path.relative(ROOT, ZIP)}`)
console.log('下一步：解压后运行 ruffle.exe --help 看是否支持导出帧')
