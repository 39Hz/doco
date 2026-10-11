// exe 冒烟测试（R11 的第 2 步）：启动打包好的启动器，验证它真的能服务游戏。
//
// 【为什么从 PowerShell 搬过来（第 46 轮）】
// 原版是 `_build/smoke-exe.ps1`，两个毛病：
//   ① 所有失败只印一行、**退出码恒为 0** —— "exe 根本没起来"和"全部通过"在自动化眼里一模一样（已修）；
//   ② 它用 `Start-Process` + `Invoke-WebRequest`，实测会**卡住不返回**（子进程继承控制台句柄 +
//      启动器自己往 stdout 打横幅）。冒烟测试卡住 = 发布流程卡住，比失败还糟。
// Node 版没有这些问题：`spawn` 时 stdio 一律 'ignore'（顺带绕开沙箱对命名管道的限制），
// 轮询用 `fetch` + AbortSignal，退出前一定 kill 掉自己起的进程。
//
// 用法: node _tools/smoke-exe.mjs            # 测 dist/
//       node _tools/smoke-exe.mjs --keep     # 测完不杀进程（人工接手看画面时用）
// 退出码: 0 = 全部通过；1 = 任一条失败
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXE = path.join(ROOT, 'dist', '多克多比.exe')
const PORT = 8765
const KEEP = process.argv.includes('--keep')

let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (!fs.existsSync(EXE)) { console.error('找不到 ' + EXE + '（先 node _tools/make-release.mjs）'); process.exit(1) }

async function get(pathname, ms = 4000) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}${pathname}`, { signal: ctl.signal })
    const body = await r.text()
    return { status: r.status, body, headers: r.headers }
  } catch (e) {
    return { status: 0, body: '', error: String(e && e.message || e) }
  } finally { clearTimeout(t) }
}

console.log('== exe 冒烟测试 ==')
const child = spawn(EXE, ['--no-browser'], { cwd: path.join(ROOT, 'dist'), stdio: 'ignore', windowsHide: true, detached: false })
let exitedEarly = null
child.on('exit', (code) => { exitedEarly = code })
console.log(`  已启动 ${path.basename(EXE)}（pid ${child.pid}）`)

// 1) 轮询到服务起来（最多 15 秒；这只启动器要在 8765-8805 里挑端口，8765 被占时会换端口）
let up = false
for (let i = 0; i < 30; i++) {
  if (exitedEarly !== null) break
  const r = await get('/__ping', 1500)
  if (r.status === 200) { up = true; break }
  await sleep(500)
}
check(exitedEarly === null, `启动器进程没有提前退出（退出码 ${exitedEarly}）`)
check(up, `127.0.0.1:${PORT}/__ping 能应答（轮询 15 秒）`)

if (up) {
  const ping = await get('/__ping')
  check(ping.status === 200, `/__ping → HTTP ${ping.status}`, ping.error || '')
  check(/dkdbb/i.test(ping.body), `__ping 认得出"这是我们自己"（body=${ping.body.trim()}）`)
  check(ping.headers.get('x-dkdbb') === '1', `标记头 X-DKDbb=1（实际 ${ping.headers.get('x-dkdbb')}）`)

  const page = await get('/game.html')
  check(page.status === 200, `/game.html → HTTP ${page.status}`, page.error || '')
  check(page.body.includes('__DKDbb') || page.body.includes('<canvas'), 'game.html 返回的是游戏页面而不是错误页')

  // 存档写入 / 读回（用户报过"存档重启又从头开始"）
  const payload = JSON.stringify({ level: 9, gold: 777, forms: ['克罗多比'], items: { 291001: 3 } })
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000)
  let post = { status: 0 }
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/__save`, { method: 'POST', body: payload, signal: ctl.signal })
    post = { status: r.status, body: await r.text() }
  } catch (e) { post.error = String(e.message || e) } finally { clearTimeout(t) }
  check(post.status === 200, `POST /__save → HTTP ${post.status}`, post.error || '')
  const saveFile = path.join(ROOT, 'dist', 'save.json')
  check(fs.existsSync(saveFile), '存档文件落在 exe 旁边（dist/save.json）')
  const back = await get('/__save')
  check(back.status === 200 && back.body.includes('777'), `GET /__save 读回刚写的内容（${back.body.slice(0, 60)}）`)

  // 第二个实例：应当认出"已在运行"，不双开
  const before = await get('/__ping')
  const child2 = spawn(EXE, ['--no-browser'], { cwd: path.join(ROOT, 'dist'), stdio: 'ignore', windowsHide: true })
  const code2 = await new Promise((res) => {
    const timer = setTimeout(() => res('timeout'), 12000)
    child2.on('exit', (c) => { clearTimeout(timer); res(c) })
  })
  const after = await get('/__ping')
  check(String(code2) !== 'timeout', `第二个实例自己退出了（退出码 ${code2}）`)
  check(before.body === after.body && after.status === 200, `起第二个实例没有把服务搞挂（__ping 仍然 200）`)
  if (String(code2) === 'timeout') { try { child2.kill() } catch { } }
  try { fs.rmSync(saveFile, { force: true }) } catch { }
}

if (!KEEP) { try { child.kill() } catch { } await sleep(300) }
console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
if (!KEEP) console.log('（进程已结束；要人工看画面请加 --keep）')
process.exit(fail ? 1 : 0)
