// 零依赖本地静态服务器（README 里推荐的第二种打开方式）
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

const ROOT = path.resolve(process.argv[2] || '.')
const PORT = Number(process.argv[3] || 8080)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

http.createServer((req, res) => {
  let p
  try {
    p = decodeURIComponent(url.parse(req.url).pathname)
  } catch {
    res.writeHead(400).end('bad request')
    return
  }
  if (p === '/') p = '/index.html'

  // 拒绝任何含 .. 的路径段（在解码之后判断，覆盖 %2e%2e 之类绕过）
  // 注意：path.join 会先把 .. 规范化掉，之后再做 startsWith 检查是无效的。
  const segs = p.split(/[\\/]+/)
  if (segs.some((s) => s === '..')) {
    res.writeHead(403).end('forbidden')
    return
  }

  const full = path.resolve(ROOT, '.' + path.posix.normalize(p))
  const rel = path.relative(ROOT, full)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(403).end('forbidden')
    return
  }

  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end('404 ' + p); return }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    })
    fs.createReadStream(full).pipe(res)
  })
}).listen(PORT, '127.0.0.1', () => {
  console.log(`多克多比 · 场景档案馆`)
  console.log(`   http://127.0.0.1:${PORT}/`)
  console.log(`   根目录: ${ROOT}`)
  console.log(`   按 Ctrl+C 停止`)
})
