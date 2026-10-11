// 源码包自检：中央目录能读、条目数对得上、该有的在、不该有的不在
import fs from 'node:fs'
import { listZip } from './lib/zip-central.mjs'

// 不传参就自己找仓库里最新的源码包（这样它能直接进全量回归）
const p = process.argv[2] || fs.readdirSync('.').filter((f) => /源码包\.zip$/.test(f)).sort().pop()
if (!p || !fs.existsSync(p)) {
  console.log('（仓库里还没有源码包 → 跳过；需要时跑 node _tools/make-source-bundle.mjs）')
  process.exit(0)
}
const size = fs.statSync(p).size
console.log(`包: ${p}  ${(size / 1048576).toFixed(1)} MB`)

let names
try { names = listZip(p) } catch (e) { console.error('★ 中央目录读不出来：' + e.message); process.exit(1) }
console.log(`中央目录条目: ${names.length}`)

// ★ 顶层目录名从 STATE.md 的版本号推出来，**不要写死**。
//   v0.8 → v0.9 时这里写死的 '多克多比v0.8-源码包/' 让整个测试红了 26 项 ——
//   而包本身完全正常（验证过 11842 条目、该有的都在）。版本号是单一事实源（R12）。
const VER = (fs.readFileSync('STATE.md', 'utf8').match(/\*\*当前版本\*\*：\s*v([\d.]+)/) || [])[1]
if (!VER) { console.error('★ STATE.md 里找不到「**当前版本**：vX.Y」'); process.exit(1) }
const TOP = `多克多比v${VER}-源码包/`
let pass = 0, fail = 0
const check = (ok, s) => { console.log((ok ? '  ✓ ' : '  ✗ ') + s); ok ? pass++ : fail++ }

check(names.every((n) => n.startsWith(TOP)), '所有条目都在顶层目录下')
check(names.some((n) => n === TOP), '顶层目录本身有条目')

// 该有的
const MUST = [
  'README-源码包.md', '00-PLAN.md', 'STATE.md', 'README.md',
  'docs/复刻与构建手册.md', 'docs/保真度报告.md', 'docs/deviations.md', 'docs/自主迭代日志.md',
  'game/game.js', 'game/engine/engine.js', 'game/tables/forms-acquire.js',
  '_build/make-dist.mjs', '_build/launcher.cs',
  '_tools/make-release.mjs', '_tools/make-source-bundle.mjs', '_tools/lib/zip-write.mjs',
  '_tools/check-plan-freshness.mjs', '_tools/run-all-tests.mjs',
  'assets/scenes/scene_93.jpg', 'assets/forms/art/英雄多比.png', 'assets/anim/index.json',
  '场景命名工作表.csv', 'game.html', 'world.js',
]
for (const m of MUST) check(names.includes(TOP + m), `有 ${m}`)

// 不该有的（都对应手册 §1.3 那张表）
const MUST_NOT = [
  ['多克多比专区资料素材.7z', '归档压缩包 4.17 GB'],
  ['assets/sprites/', '原版全分辨率帧 1.86 GB（运行时不用）'],
  ['_tools/imgcache/', 'JPEG 预解码缓存（可重建）'],
  ['_tools/ai/', 'Real-ESRGAN 模型（只有高清立绘用）'],
  ['docs/sheets/', '审阅拼图（可重建）'],
  ['dist/', '打包中间产物'],
  ['_tmp_test_out/', '测试中转'],
  ['_unity_tex/', 'Unity 贴图中转'],
  ['多克多比v0.8单机版.zip', '发布包本身'],
]
for (const [frag, why] of MUST_NOT) {
  check(!names.some((n) => n.startsWith(TOP + frag)), `不含 ${frag}（${why}）`)
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
