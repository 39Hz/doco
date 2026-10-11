// 列出 Real-ESRGAN releases 里的可下载资产（Windows 版）
import https from 'node:https'
function get(url, depth = 0) {
  return new Promise((resolve) => {
    if (depth > 4) return resolve({ err: '跳转过多' })
    https.get(url, { timeout: 20000, headers: { 'User-Agent': 'node', Accept: 'application/vnd.github+json' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); return resolve(get(new URL(res.headers.location, url).href, depth + 1))
      }
      const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(c) }))
    }).on('error', (e) => resolve({ err: e.message }))
  })
}
const r = await get('https://api.github.com/repos/xinntao/Real-ESRGAN/releases')
if (r.err) { console.log('失败:', r.err); process.exit(1) }
const rel = JSON.parse(r.buf.toString('utf8'))
console.log(`拿到 ${rel.length} 个 release（只列带 Windows 资产的）\n`)
for (const x of rel.slice(0, 8)) {
  const win = (x.assets || []).filter((a) => /win|windows/i.test(a.name) || /\.zip$/i.test(a.name))
  if (!win.length) continue
  console.log(`【${x.tag_name}】${x.published_at ? x.published_at.slice(0, 10) : ''}`)
  for (const a of win) {
    console.log(`   ${a.name}  ${(a.size / 1048576).toFixed(1)} MB`)
    console.log(`      ${a.browser_download_url}`)
  }
  console.log('')
}
