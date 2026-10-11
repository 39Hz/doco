// 全量回归运行器 —— **自动发现**测试，不再手写清单。
//
// 为什么要有它（计划书 R6 的血泪教训，本项目真实踩过两次）：
//   · game-harness.mjs 的脚本清单是硬编码的，漏掉了 assets/soya.js 与官方技能表，
//     导致 143 项测试全绿，但那两块代码一行都没被加载；
//   · shoot.mjs 也是硬编码清单，同样漏了；
//   · 我自己的"全套回归"清单漏掉了 test-battle-mouse.mjs，它长期失败却没人知道。
// 手写清单一定会过期。这里改成：**扫描 _tools 下所有引用测试台的脚本**，
// 全部跑一遍，并把"发现数"和"实际跑了多少"都打出来 —— 少了东西一眼就能看见。
//
// 用法： node _tools/run-all-tests.mjs
// 退出码：有任何失败/未跑成 → 非 0
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const DIR = '_tools'
const HARNESS = 'game-harness.mjs'
const SELF = 'run-all-tests.mjs'
// 排除项必须写明理由，否则以后没人知道为什么少了它
const EXCLUDE = {
  'game-harness.mjs': '测试台本身，不是测试',
  [SELF]: '运行器自己（源码里出现 game-harness.mjs 字样，会被自己的规则误命中）',
  'diag-click.mjs': '人工排查用的一次性诊断脚本，不产出通过/失败',
  'diag-menu.mjs': '同上',
  'diag-npc.mjs': '同上',
  'diag-skillicon.mjs': '同上',
  'fidelity-report.mjs': '报告生成器（为了取真实数据 import 了测试台，会被规则 2 误命中；它产出 md 报告，不产出通过/失败）',
  'scan-corpus.mjs': '语料查证工具，产出 md 报告，不产出通过/失败',
  'v1-checklist.mjs': 'v1.0 符合度清单生成器（同 fidelity-report：import 测试台取真实数据，产出 md 报告；它的正确性由 test-v1-checklist.mjs 覆盖）',
  'bind-scene-districts.mjs': '场景→七大地形归属表生成器（第 51 轮；同样 import 测试台取真实 world.js，产出 docs/场景地形归属.json+md。它**自带自检**：场景数不是 88、有重复、有遗漏就直接非 0 退出；归属本身的正确性由 test-scene-district.mjs 覆盖）',
  'check-minigame-balance.mjs': '小游戏"能不能正常玩"体检（机器人试玩，输出通关率/耗时；跑一轮要几分钟，不适合放进每次回归。第 44 轮起它自带覆盖自检：**哪个已实现的小游戏没有机器人就直接报错退出**，不再静默跳过）',
  'check-dungeon-playthrough.mjs': '副本"能不能从头打到尾"体检（同上，机器人试玩 13 个副本；它抓到的卡死 bug 已由 test-dungeon 第 16 节钉成回归用例）',
  'bot-lib.mjs': '自动试玩的机器人库（被上面两个体检脚本 import，本身不是测试；它没有 main，跑起来什么都不做）',
  'check-plan-freshness.mjs': '开工自检（计划书/状态表/发布包一致性，00-PLAN.md §1 第 1 步）。' +
    '它**只读**、且会在"本轮改完但还没打包"的正常中间态报错（版本号领先最新发布包），' +
    '放进回归就是制造偶发假红。它的硬约束 R11 落在 make-release.mjs 里（0 字节包直接终结）',
}

// 【第 48 轮补】`diag-*.mjs` 是**人工排查用的一次性脚本**，按命名约定排除。
// 起因：本轮调试冲上云霄时写了 9 个 diag-soar*.mjs，忘了删/没登记，回归立刻把它们当测试跑，
// 报了一串"退出码 1，无汇总"。原来的 EXCLUDE 只逐条列了 4 个 diag 文件 ——
// 那就是"手写清单一定会过期"的老毛病（R6/R13）。改成**按命名约定**排除，写多少都不会漏。
const EXCLUDE_PATTERN = [
  [/^diag-.*\.mjs$/, '人工排查用的一次性诊断脚本（约定：diag- 开头），不产出通过/失败'],
  // 【第 53 轮补】`_` 开头的脚本是**临时排查 / 截图工具**（`_probe-art` / `_probe-walk` /
  // `_walkshot` / `_walkcmp` …）。它们被自动发现当成了测试，回归于是报"无汇总行"。
  // 同样按**命名约定**排除，不逐条列 —— "手写清单一定会过期"这个教训第 48 轮已经记过一次了。
  [/^_.*\.mjs$/, '临时排查/截图脚本（约定：`_` 开头），不产出通过/失败'],
]
// 自检下限（R5：工具必须能自证"该找到的都找到了"）
const MIN_TESTS = 18
const MUST_HAVE = [
  'playthrough.mjs', 'playtest.mjs',
  'test-mouse.mjs', 'test-battle-mouse.mjs', 'test-battle-bugs.mjs',
  'test-bgm.mjs', 'test-form-art.mjs', 'test-official-data.mjs',
  'test-attack-anim.mjs', 'test-seal.mjs', 'test-mainmenu.mjs', 'test-mapgraph.mjs',
  'test-glyphs.mjs', 'test-savever.mjs', 'test-warreport.mjs', 'test-dungeon.mjs', 'test-treasure.mjs', 'test-awaken.mjs', 'test-scene-names.mjs',
  'test-minigame.mjs', 'test-v1-checklist.mjs', 'test-npcs.mjs',
  'test-difficulty.mjs', 'check-world-playthrough.mjs',
  // 第 52 轮：切片断言（记录每一次 fillText 的真实坐标，按**真实文本**核对越界/压字）
  'check-canvas-text.mjs', 'test-scene-district.mjs', 'test-sumo.mjs',
]

// 发现规则（两条并集，宁可多跑也不要漏）：
//   1) 文件名以 test- 开头 —— 静态素材类检查（如 test-form-art.mjs 直接解码 PNG 校验立绘）
//      不需要游戏运行时，因此不引用测试台，靠命名识别
//   2) 引用了 game-harness.mjs —— 需要跑游戏循环的行为类测试
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.mjs')).sort()
const discovered = files.filter((f) => {
  if (EXCLUDE[f]) return false
  if (EXCLUDE_PATTERN.some(([re]) => re.test(f))) return false
  if (/^test-.*\.mjs$/.test(f)) return true
  const s = fs.readFileSync(path.join(DIR, f), 'utf8')
  return s.includes(HARNESS)
})

console.log('===== 自动发现 =====')
console.log(`  _tools 下 .mjs 共 ${files.length} 个`)
console.log(`  认定为测试的：${discovered.length} 个 → ${discovered.join(', ')}`)
for (const [f, why] of Object.entries(EXCLUDE)) {
  if (files.includes(f)) console.log(`  排除 ${f}（${why}）`)
}
for (const [re, why] of EXCLUDE_PATTERN) {
  const hit = files.filter((f) => re.test(f))
  if (hit.length) console.log(`  排除 ${hit.length} 个按约定命名的脚本（${re}）（${why}）：${hit.join(', ')}`)
}

// ---- 自检：发现能力必须成立 ----
const missingMust = MUST_HAVE.filter((m) => !discovered.includes(m))
if (missingMust.length) {
  console.error(`!! 自检失败：以下已知测试没被发现 → ${missingMust.join(', ')}`)
  console.error('   （要么被误排除，要么文件名变了；先修运行器再跑）')
  process.exit(2)
}
if (discovered.length < MIN_TESTS) {
  console.error(`!! 自检失败：只发现 ${discovered.length} 个测试，少于下限 ${MIN_TESTS}`)
  process.exit(2)
}
console.log(`  自检通过：已知的 ${MUST_HAVE.length} 个测试全部在列，且不少于 ${MIN_TESTS} 个`)

console.log('\n===== 逐个运行 =====')
// 关键：子进程输出**重定向到临时文件**，不用管道。
// 沙箱下 Node 的 child_process 用默认 stdio:'pipe' 会去开命名管道，直接被拒（EPERM），
// 表现就是所有子进程「退出码 null、0.0 秒、没有输出」——看起来像测试全崩，其实是跑不起来。
const TMP = path.join('_tmp_test_out')
fs.mkdirSync(TMP, { recursive: true })
const rows = []
let totalPass = 0, totalFail = 0, noSummary = 0
for (const f of discovered) {
  const t0 = Date.now()
  const outPath = path.join(TMP, f + '.log')
  const fd = fs.openSync(outPath, 'w')
  let r
  try {
    r = spawnSync(process.execPath, [path.join(DIR, f)], {
      stdio: ['ignore', fd, fd], timeout: 900000,
    })
  } finally {
    fs.closeSync(fd)
  }
  const out = fs.readFileSync(outPath, 'utf8')
  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  // 汇总行形如「✅ 通过 53 项，失败 0 项」
  const m = out.match(/通过\s*(\d+)\s*项，失败\s*(\d+)\s*项/)
  const p = m ? Number(m[1]) : 0
  const fl = m ? Number(m[2]) : 0
  totalPass += p; totalFail += fl
  if (!m) noSummary++
  const okExit = r.status === 0
  rows.push({ f, p, fl, secs, ok: okExit && fl === 0, noSummary: !m, status: r.status, err: r.error ? r.error.code : null })
  const mark = okExit && fl === 0 ? '✅' : '❌'
  const detail = m ? `通过 ${p} 项，失败 ${fl} 项` : `未输出汇总（退出码 ${r.status}${r.error ? ' / ' + r.error.code : ''}）`
  console.log(`  ${mark} ${f.padEnd(26)} ${detail.padEnd(26)} ${secs}s`)
}

console.log('\n===== 汇总 =====')
const failed = rows.filter((x) => !x.ok)
console.log(`  测试文件 ${rows.length} 个，通过 ${rows.length - failed.length}，失败 ${failed.length}`)
console.log(`  断言合计：通过 ${totalPass} 项，失败 ${totalFail} 项`)
if (noSummary) console.log(`  没有输出汇总的脚本 ${noSummary} 个（可能是崩溃或非标准测试）`)

// 加固：被判定为测试、却拿不出汇总行 → 视为**发现规则出错**，直接失败。
// 起因：fidelity-report.mjs 为了取真实数据 import 了测试台，被规则 2 误当成测试，
// 于是"21 个测试文件"里混进一个报告生成器，而它 0 断言却显示 ✅。
// 只允许白名单里的脚本不输出汇总（它们以退出码判定）。
const NO_SUMMARY_OK = { 'ui-overlap.mjs': '只做重叠检查，以退出码判定' }
const weird = rows.filter((x) => x.noSummary && !NO_SUMMARY_OK[x.f])
if (weird.length) {
  console.log('  ❌ 以下脚本被当成测试但没有汇总行，也不是白名单里的：')
  for (const x of weird) console.log(`     - ${x.f}（应在 EXCLUDE 里说明理由，或补上「通过 N 项，失败 M 项」汇总）`)
}

if (failed.length) {
  console.log('  失败清单：')
  for (const x of failed) console.log(`    - ${x.f}（退出码 ${x.status}${x.err ? ' / ' + x.err : ''}${x.noSummary ? '，无汇总' : ''}）`)
}
// 底线：测试数不能比已知的少；断言必须真的被数出来
if (rows.length < MIN_TESTS || failed.length || totalFail || weird.length) {
  console.log('\n❌ 回归未通过')
  process.exit(1)
}

// ---- 断言数下限：只许涨，不许跌 ----
// 起因（第 43 轮实测）：test-minigame 的总断言数在 256/258 之间浮动。
// 追下去发现是"魔法工匠"那节把断言写在 `if (能滑) { ... }` 里 —— 空位落在角上时
// 少两个方向，两条断言就**静默消失**，而且"走不动时盘面不该变"这条从来没被测过。
// 这类漏测从"全绿"里看不出来，只有断言数会变。所以这里记一份基线：
//   跌了 → 失败（测试被削弱，或有分支被跳过）
//   涨了 → 自动更新基线并提示（R6：测试只增不减）
const BASE_PATH = path.join('docs', 'test-baseline.json')
let baseline = {}
let baselineBroken = null
try {
  // 去掉 BOM：PowerShell 的 Set-Content -Encoding UTF8 会写 BOM，JSON.parse 会直接抛异常，
  // 于是基线被当成空、守卫**静默失效**（我自己验证这个守卫时就是这么被骗过一次）。
  const raw = fs.readFileSync(BASE_PATH, 'utf8').replace(/^\uFEFF/, '')
  baseline = JSON.parse(raw)
} catch (e) {
  if (e.code !== 'ENOENT') baselineBroken = e.message
  baseline = {}
}
if (baselineBroken && fs.existsSync(BASE_PATH)) {
  console.log(`  ⚠ ${BASE_PATH} 存在但读不出来（${baselineBroken}）—— 基线守卫本次不生效`)
}
const prev = baseline.files || {}
const dropped = []
const grown = []
const nextFiles = {}
for (const x of rows) {
  if (x.noSummary) continue
  nextFiles[x.f] = x.p
  const was = prev[x.f]
  if (typeof was === 'number') {
    if (x.p < was) dropped.push(`${x.f}：${was} → ${x.p}`)
    else if (x.p > was) grown.push(`${x.f}：${was} → ${x.p}`)
  }
}
console.log('\n===== 断言数基线 =====')
if (!Object.keys(prev).length) console.log('  （首次记录基线）')
if (grown.length) console.log(`  ↑ 新增断言：${grown.join('；')}`)
if (dropped.length) {
  console.log('  ❌ 以下文件的断言数**比基线少**了 —— 测试被削弱，或有断言走了条件分支被跳过：')
  for (const d of dropped) console.log(`     - ${d}`)
}
const total = Object.values(nextFiles).reduce((a, b) => a + b, 0)
fs.writeFileSync(BASE_PATH, JSON.stringify({
  note: '断言数基线（run-all-tests.mjs 自动维护）：跌了就是回归，涨了自动记账',
  total, files: nextFiles,
}, null, 2) + '\n')
console.log(`  基线已更新：${rows.filter((x) => !x.noSummary).length} 个文件、断言合计 ${total} 项（${BASE_PATH}）`)
if (dropped.length) { console.log('\n❌ 回归未通过'); process.exit(1) }

console.log('\n✅ 全量回归通过')
