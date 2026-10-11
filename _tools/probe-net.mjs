// 测试 Node 原生网络栈能否下载（shell 的 curl 不通，但 harness 的 web_fetch 通 —— 试试 Node 这条路）
import https from 'node:https'
import fs from 'node:fs'

function get(url, depth = 0) {
  return new Promise((resolve) => {
    if (depth > 4) return resolve({ err: '跳转过多' })
    const req = https.get(url, { timeout: 15000, headers: { 'User-Agent': 'node' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return resolve(get(new URL(res.headers.location, url).href, depth + 1))
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks), headers: res.headers }))
    })
    req.on('timeout', () => { req.destroy(new Error('超时')) })
    req.on('error', (e) => resolve({ err: e.message }))
  })
}

const tests = [
  ['https://registry.npmjs.org/-/ping', 'npm registry（小文本）'],
  ['https://github.com/xinntao/Real-ESRGAN/releases/latest', 'GitHub releases（跳转）'],
  ['https://api.github.com/repos/xinntao/Real-ESRGAN/releases/latest', 'GitHub API（JSON）'],
]
for (const [u, label] of tests) {
  const r = await get(u)
  if (r.err) { console.log(`✗ ${label}: ${r.err}`); continue }
  console.log(`✓ ${label}: HTTP ${r.status}  ${r.buf.length} 字节`)
  if (r.headers && r.headers.location) console.log(`    跳转到: ${r.headers.location}`)
}
