// 单连接 + Range 续传下载 Real-ESRGAN（Windows）。
//
// 【为什么不用并发】前一版开了 6 个范围连接，结果段 5 成功、段 1 连续 `ECONNRESET`
//   —— 这个 release 走的共享 CDN 对同一文件的并发连接会掐。所以改成**单连接**，
//   但每收到一块就**追加写盘**，断了就从已有字节数继续（Range）。这样既不会被掐，
//   也不怕中途断（进度真实可见）。
//
// 用法: node _tools/get-realesrgan3.mjs
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'

const ROOT = path.resolve('.')
const DIR = path.join(ROOT, '_tools', 'ai')
const ZIP = path.join(DIR, 'realesrgan-windows.zip')
const PART = ZIP + '.part'
// 【为什么走镜像】直连 GitHub release 实测只有 **2 KB/s**（43 MB 要 5 小时），
// 而 `gh-proxy.com` 镜像实测 **1109 KB/s**（快 500 倍）。镜像只是一个透明反代，
// 下载的还是同一个官方文件；下面用 Content-Length 核对大小，避免被镜像塞别的东西。
const GH = 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip'
const SRC = 'https://gh-proxy.com/' + GH
const EXPECT = 45474481          // 官方 zip 的字节数（实测值；只做 0.5% 容差比对）
const TOTAL = EXPECT

fs.mkdirSync(DIR, { recursive: true })

function get(url, headers = {}, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error('跳转过多'))
    const lib = url.startsWith('http:') ? http : https
    const r = lib.get(url, { headers: { 'User-Agent': 'node', ...headers }, timeout: 60000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return resolve(get(new global.URL(res.headers.location, url).href, headers, depth + 1))
      }
      resolve(res)
    })
    r.on('timeout', () => r.destroy(new Error('超时')))
    r.on('error', reject)
  })
}

let attempt = 0
const MAX_ATTEMPT = 40
while (true) {
  const have = fs.existsSync(PART) ? fs.statSync(PART).size : 0
  if (have >= TOTAL) break
  attempt++
  if (attempt > MAX_ATTEMPT) { console.log(`✗ 重试 ${MAX_ATTEMPT} 次仍未完成（已有 ${(have / 1048576).toFixed(1)} MB）`); process.exit(1) }
  try {
    const res = await get(SRC, have > 0 ? { Range: `bytes=${have}-` } : {})
    if (res.statusCode !== 200 && res.statusCode !== 206) throw new Error('HTTP ' + res.statusCode)
    const cr = res.headers['content-range']
    const total = cr ? Number(cr.split('/')[1]) : Number(res.headers['content-length'])
    const ws = fs.createWriteStream(PART, { flags: have > 0 ? 'a' : 'w' })
    let got = have
    let lastPrint = 0
    await new Promise((resolve, reject) => {
      res.on('data', (c) => {
        got += c.length
        ws.write(c)
        if (got - lastPrint > 2 * 1048576) {
          lastPrint = got
          console.log(`  ${(got / 1048576).toFixed(1)}/${(total / 1048576).toFixed(1)} MB  ${(got / total * 100).toFixed(0)}%`)
        }
      })
      res.on('end', () => ws.end(resolve))
      res.on('error', reject)
      ws.on('error', reject)
    })
    console.log(`  本次连接结束：${(got / 1048576).toFixed(1)} MB`)
    if (got >= total) break
  } catch (e) {
    console.log(`  第 ${attempt} 次中断（${e.message}），从 ${((fs.existsSync(PART) ? fs.statSync(PART).size : 0) / 1048576).toFixed(1)} MB 续传…`)
    await new Promise((r) => setTimeout(r, 1200))
  }
}
const size = fs.statSync(PART).size
// 大小核对：镜像只是反代，但万一返回了别的东西，绝不能改名当成官方包用。
// ⚠️ 容差不能用"硬编码字节数" —— 第一版把 `EXPECT` 写成 45513104（从"43.4 MB"反推的），
//    而实际是 45474481，差 38 KB 就直接误报了。改成**相对容差 0.5%**，
//    真正"下错了文件"（大小差一倍或几倍）照样能抓住。
const REL_TOL = 0.005
const off = Math.abs(size - EXPECT) / EXPECT
if (off > REL_TOL) {
  console.log(`✗ 大小不符：拿到 ${size} 字节，预期约 ${EXPECT}（偏差 ${(off * 100).toFixed(2)}% > ${REL_TOL * 100}%）—— 疑似镜像返回了别的内容；已保留 .part，不改名`)
  process.exit(1)
}
fs.renameSync(PART, ZIP)
console.log(`✓ 下载完成 ${path.relative(ROOT, ZIP)}  ${(size / 1048576).toFixed(1)} MB`)
