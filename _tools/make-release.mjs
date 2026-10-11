// 发布（R11 的执行体 · 00-PLAN.md §6 第 ⑥ 条）
//
// 【为什么必须存在】
// `多克多比v0.6单机版.zip` 曾经实测 **0 字节**，而 `STATE.md` 写着"exe 已实测启动、
// /__ping 200、game.html 200" —— 躺在仓库根目录 5 个小时没人发现。
// 根因不是某次意外，而是**打包这一步从来不是一个脚本**：
//   · 组装 dist 有脚本（_build/make-dist.mjs）；
//   · 产出 zip 是每次手敲的 PowerShell 命令 —— 手敲的东西失败了不会有人知道；
//   · 校验发布包的 verify-zip.mjs 又"自动挑最新包"，于是它挑中了那个 0 字节残包，白验。
// 所以 R11 的落法就是这一个脚本：**打包 + 校验 + 打印验收凭据，任何一步不对就非 0 退出。**
//
// 用法:
//   node _tools/make-release.mjs              # 用 STATE.md 里写的版本号打包
//   node _tools/make-release.mjs --no-build   # 跳过 make-dist（dist 已经是最新的，快速重打包）
//   node _tools/make-release.mjs --ver v0.7   # 显式版本号（版本号会**同时**写回 STATE.md 与 00-PLAN.md，
//                                             #   这是"状态单一事实源"的直接落地，不许手动改一处）
// 退出码: 0 = 包有效；1 = 任何一步失败（含 0 字节、缺 exe、状态表版本不一致）
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { checkZip, listZip } from './lib/zip-central.mjs'
import { zipDir } from './lib/zip-write.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const P = (...p) => path.join(ROOT, ...p)
const ARGS = process.argv.slice(2)
const NO_BUILD = ARGS.includes('--no-build')
// ⚠️ **三种**写法都要吃：`--ver=0.7`、`--ver=v0.7`、`--ver v0.8`。
//    STATE.md 里存的是**不带 v** 的版本号（正则捕获 `v([\d.]+)`），而 zip 名模板自己加 `v`；
//    第 54 轮用 `--ver=v0.7` 打包，于是产出过 `多克多比vv0.7单机版.zip`（两个 v）。
//    这里统一剥掉前缀 v，让"带不带 v"都得到同一个包名。
//    ★ 第 66 轮补上**空格写法**：原先只认 `--ver=`，于是
//      `node _tools/make-release.mjs --ver v0.8` **静默按旧版本号打包**（包名还是 v0.7、
//      退出码 0、看起来一切正常）—— 参数被悄悄忽略是最容易骗过人的一类 bug，实测踩到。
const VER_ARG = (() => {
  const eq = ARGS.find((a) => a.startsWith('--ver='))
  if (eq) return (eq.split('=')[1] || '').replace(/^v/i, '') || null
  const i = ARGS.indexOf('--ver')
  if (i >= 0 && ARGS[i + 1]) return String(ARGS[i + 1]).replace(/^v/i, '') || null
  return null
})()
const read = (p) => fs.readFileSync(P(p), 'utf8').replace(/^\uFEFF/, '')

let failed = 0
const step = (s) => console.log('\n=== ' + s + ' ===')
const ok = (c, msg, extra) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + msg + (extra ? ' → ' + extra : ''))
  if (!c) failed++
  return c
}

// ─────────────────────────── 1) 版本号 ───────────────────────────
step('1) 版本号（单一事实源：STATE.md）')
const stateRaw = read('STATE.md')
const stateVer = VER_ARG || ((stateRaw.match(/\*\*当前版本\*\*：\s*v([\d.]+)/) || [])[1])
if (!stateVer) {
  console.error('  ✗ STATE.md 里找不到「**当前版本**：vX.Y」—— 先把它写上，不要靠参数猜')
  process.exit(1)
}
const zipName = `多克多比v${stateVer}单机版.zip`
console.log(`  STATE.md 当前版本 = v${stateVer}   →   目标包: ${zipName}`)
if (VER_ARG) {
  // 显式换版本：同时改 STATE.md 与 00-PLAN.md，避免"两处版本号"分叉（v3 §2）
  const newState = stateRaw.replace(/(\*\*当前版本\*\*：\s*v)[\d.]+/, `$1${stateVer}`)
  const planRaw = read('00-PLAN.md')
  const newPlan = planRaw
    .replace(/(\*\*当前基线版本\*\*：\s*v)[\d.]+/, `$1${stateVer}`)
    .replace(/(\|\s*\*\*当前版本\*\*\s*\|\s*\*\*v)[\d.]+/, `$1${stateVer}`)
  fs.writeFileSync(P('STATE.md'), newState, 'utf8')
  fs.writeFileSync(P('00-PLAN.md'), newPlan, 'utf8')
  console.log(`  已把 v${stateVer} 写回 STATE.md 与 00-PLAN.md`)
}

// ─────────────────────────── 2) 组装 dist ───────────────────────────
if (!NO_BUILD) {
  step('2) 组装 dist（_build/make-dist.mjs）')
  const r = spawnSync(process.execPath, [P('_build', 'make-dist.mjs')], { cwd: ROOT, stdio: 'inherit' })
  if (r.status !== 0) { console.error(`  ✗ make-dist 退出码 ${r.status}`); process.exit(1) }
} else {
  step('2) 组装 dist（--no-build，跳过）')
}
const dist = P('dist')
if (!fs.existsSync(path.join(dist, '多克多比.exe'))) { console.error('  ✗ dist/多克多比.exe 不存在'); process.exit(1) }
ok(fs.existsSync(path.join(dist, 'web', 'game.html')), 'dist/web/game.html 在')
ok(fs.existsSync(path.join(dist, 'web', 'game', 'tables', 'skills-official.js')), 'dist/web/game/tables/skills-official.js 在')

// ─────────────────────────── 3) 打包（自己写 zip，零依赖）───────────────────────────
// 为什么不用 Compress-Archive：① 它写反斜杠条目名（本项目踩过，导致统计假警报）；
// ② 它是外部 PowerShell 命令，失败时不一定有人看；③ 走 SDK 的 ZipFile 在本机沙箱里加载不稳定。
// 自己写 zip 反而最短：本地头 + 数据 + 中央目录 + EOCD，全部用 node:zlib 压。
//
// 【第 68 轮】写出器抽到 `_tools/lib/zip-write.mjs` —— 源码包也要压 zip，
//   逻辑一模一样；复制一份的话，那个"偏移必须在写之前记"的坑就会只在一边被修。
step('3) 打包 zip')
const zipPath = P(zipName)
const zr = zipDir(dist, zipPath, { onProgress: (d, t) => console.log(`  … ${d}/${t}`) })
console.log(`  条目: ${zr.entries} 个（含目录）`)
console.log(`  ${zipName}  ${(zr.bytes / 1048576).toFixed(1)} MB`)

// ─────────────────────────── 4) 校验（R11 的硬底线）───────────────────────────
step('4) 校验发布包内容（rules 与 verify-zip.mjs 一致）')
const RULES = {
  'web/game.html': 1,
  'web/world.js': 1,
  'web/game/tables/skills-official.js': 1,
  'web/assets/bgm/named/': 15,
  'web/assets/scenes/': 80,
  'web/assets/forms/art/': 11,
  'web/assets/items/': 30,
  'web/assets/skills/': 10,
  'web/assets/knights/': 14,
  'web/assets/monsters/': 100,
  'web/assets/anim/': 1000,
}
const res = checkZip(zipPath, RULES)
for (const c of res.checks) ok(c.ok, c.msg, c.extra)
ok(res.bytes > 0, '★ R11：发布包字节数 > 0', `${res.bytes} 字节`)

// game.html 的 <script src> 清单必须全部在包内（清单靠解析，不靠硬编码 —— R6）
const html = read('dist/web/game.html')
const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1])
const names = new Set(listZip(zipPath))
const missing = srcs.filter((s) => !names.has('web/' + s.replace(/^\.\//, '')))
ok(missing.length === 0, `game.html 引用的 ${srcs.length} 个脚本全部在包内`, missing.length ? '缺: ' + missing.join(', ') : '')

// ─────────────────────────── 5) 验收凭据 ───────────────────────────
step('5) 验收凭据（R11：三次实测的证据必须打出来）')
console.log(`  包名  : ${zipName}`)
console.log(`  字节  : ${res.bytes}（${(res.bytes / 1048576).toFixed(1)} MB）`)
console.log(`  条目  : ${res.names.length}`)
console.log(`  校验  : 通过 ${res.pass} 项，失败 ${res.fail} 项`)
console.log('  下一步（这一步必须真的跑，不许只写在 STATE.md 里）：')
console.log('    node _tools\\smoke-exe.mjs        # exe 启动 + /__ping + /game.html + /__save + 不双开（12 项）')
console.log(`  然后把「发布包 ${zipName}（N 条目，verify-zip 全绿；exe 实测启动、/__ping 200、game.html 200）」写进本轮日志。`)

if (failed) {
  console.log(`\n❌ 发布未通过：${failed} 项失败 —— 0 字节包/缺文件就是死在这里，别往下走`)
  process.exit(1)
}
console.log('\n✅ 发布包可用')
