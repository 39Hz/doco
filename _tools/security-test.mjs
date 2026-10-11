// 用原始 socket 发送未规范化的路径，绕过 HTTP 客户端自身的路径归一化，
// 用来真实检验静态服务器的目录穿越防护。
import net from 'node:net'

const PORT = Number(process.argv[2] || 8099)
const paths = [
  '/../app.js',
  '/../../Windows/win.ini',
  '/assets/../../app.js',
  '/..%2f..%2fWindows/win.ini',
  '/assets/%2e%2e/%2e%2e/Windows/win.ini',
  '/....//app.js',
  '/assets/scenes/../../app.js',
]

function raw(pathStr) {
  return new Promise((resolve) => {
    const s = net.connect(PORT, '127.0.0.1')
    let out = ''
    s.setTimeout(4000)
    s.on('connect', () => {
      s.write(`GET ${pathStr} HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nConnection: close\r\n\r\n`)
    })
    s.on('data', (d) => { out += d.toString('utf8') })
    s.on('end', () => resolve(out.split('\r\n')[0] || '(no response)'))
    s.on('timeout', () => { s.destroy(); resolve('TIMEOUT') })
    s.on('error', (e) => resolve('ERR ' + e.message))
  })
}

let leaked = 0
for (const p of paths) {
  const status = await raw(p)
  const bad = / 200 /.test(status)
  if (bad) leaked++
  console.log(`  ${bad ? '✗ 泄漏' : '✓ 拦截'}  ${p.padEnd(46)} -> ${status}`)
}
console.log(leaked === 0 ? '\n✅ 目录穿越防护有效，无文件泄漏' : `\n❌ ${leaked} 条路径越过了工作目录`)
process.exit(leaked === 0 ? 0 : 1)
