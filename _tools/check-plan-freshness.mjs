// 开工自检（00-PLAN.md §1 第 1 步 · R12 的执行体）
//
// 【为什么要有它】
// 计划书 v2 的致命缺陷不是内容错，而是**它无法自证没过期**：
// v2 写"当前版本 v0.4 / 11 轮迭代 / 173 项测试 / 形态 4 种 / game.js 234 KB"，
// 而接手时实测是 v0.6 / 45 轮 / 1420 项 / 52 只 / 486 KB —— 基线章整章失效，
// 却没有任何机制会告诉你。更糟的同类事故已经发生两次：
//   · systems-status.json 里「副本奖励」impl:false，代码早在发奖励 → 保真度报告少算一项；
//   · STATE.md 第 70 行说"附魔已实现"、第 134 行说"附魔没依据" —— 同一文件自相矛盾。
// 文档里的数字一旦分叉，报告就开始说谎，而**说谎的报告比没有报告更危险**。
//
// 所以把"状态数字"从文档里挪进这个脚本：文档只写不变的规则，会变的数字一律实测核对。
//
// 【它只读，不改任何文件】—— 对不上就报错，由人或 AI 去改文档，**不许改脚本迁就文档**。
// 【它不进 run-all-tests】—— 它是**开工自检**，不是回归项。
//   理由：版本号在"本轮改完 → 还没打包"的中间态本来就会领先最新发布包，
//   若进回归会变成假红（第 45 轮踩过无数次"偶发假红最坏的地方是它看起来像游戏有 bug"）。
//   与之配套的 R11 硬约束放在 make-release.mjs 里（0 字节包直接终结）。
//
// 用法: node _tools/check-plan-freshness.mjs
// 退出码: 0 = 六项全部对得上；1 = 有对不上的（逐条打印"文档写的"与"实测的"）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const P = (...p) => path.join(ROOT, ...p)
const read = (p) => fs.readFileSync(P(p), 'utf8').replace(/^\uFEFF/, '')
const exists = (p) => fs.existsSync(P(p))

const rows = []
let bad = 0
function check(name, expected, actual, { where, fix } = {}) {
  // 数字允许写千分位（文档里写 1,420 也算对）
  const norm = (v) => (typeof v === 'string' ? v.replace(/,/g, '') : v)
  const ok = String(norm(expected)) === String(norm(actual))
  if (!ok) bad++
  rows.push({ ok, name, expected, actual, where, fix })
}

// ─────────────────────────── 1) 测试发现（与 run-all-tests.mjs 同一套规则）───────────────────────────
// 规则来源：_tools/run-all-tests.mjs 第 47–57 行（两条并集）
//   A) 文件名以 test- 开头（静态素材类检查，不需要游戏运行时）
//   B) 源码里出现 game-harness.mjs（需要跑游戏循环的行为类测试）
// 这里是**第三份实现**，所以先与权威源对账：把 run-all-tests.mjs 的 EXCLUDE 与 MIN_TESTS 解析出来，
// 解析不到就直接失败（R5：工具必须自证有效 —— 否则运行器改了规则、这里还在按老规则数，就是假绿）。
const runnerSrc = read('_tools/run-all-tests.mjs')
const excludeBlock = runnerSrc.match(/const EXCLUDE = \{([\s\S]*?)\n\}/)
const minTestsM = runnerSrc.match(/const MIN_TESTS = (\d+)/)
let discoverBroken = null
if (!excludeBlock) discoverBroken = '解析 run-all-tests.mjs 的 EXCLUDE 失败（发现规则可能已改）'
if (!minTestsM) discoverBroken = '解析 run-all-tests.mjs 的 MIN_TESTS 失败'

const EXCLUDE = {}
if (excludeBlock) {
  // 逐行抠键名。⚠️ 不能只认 `'文件名':` 这一种写法：运行器里还有一个
  // **计算键** `[SELF]: '运行器自己（…）'`，第一版漏掉它 → 把 run-all-tests.mjs 自己
  // 算成了"被发现的测试"（32 而不是 31），报出一条假警报。
  for (const line of excludeBlock[1].split('\n')) {
    const m = line.match(/^\s*(?:'([^']+)'|\[(\w+)\])\s*:/)
    if (!m) continue
    if (m[2] === 'SELF') EXCLUDE['run-all-tests.mjs'] = true
    else if (m[2] === 'HARNESS') EXCLUDE['game-harness.mjs'] = true
    else if (m[1]) EXCLUDE[m[1]] = true
  }
}
if (discoverBroken === null && Object.keys(EXCLUDE).length < 5) {
  discoverBroken = `EXCLUDE 只解析出 ${Object.keys(EXCLUDE).length} 条，明显不对（预期 ≥10）`
}
if (discoverBroken === null && !EXCLUDE['run-all-tests.mjs']) {
  discoverBroken = 'EXCLUDE 里没解析出运行器自己（[SELF] 那条）—— 发现规则对不上运行器'
}

let discovered = []
if (!discoverBroken) {
  // 【第 54 轮补】运行器除了一张 EXCLUDE 名字表，还有一张 **EXCLUDE_PATTERN 正则表**
  //（约定式排除：`diag-` / `_` 开头的脚本是一次性排查工具，不产出汇总行）。
  // 本脚本原先只解析名字表，于是 `_probe-battle-speed.mjs` 被运行器正确排除、
  // 却被这里多算成一个"被发现的测试" → 报出「发现 41 / 基线 39」的假警报。
  // 修法：**也把正则表解析过来**，与运行器保持同一个发现规则
  //（不往名字表里逐条补 —— "手写清单一定会过期"这条教训已经记过一次）。
  const patBlock = runnerSrc.match(/const EXCLUDE_PATTERN = \[([\s\S]*?)\n\s*\]/)
  const pats = []
  if (patBlock) {
    for (const m of patBlock[1].matchAll(/\[\/(.+?)\/([a-z]*)\s*,/g)) {
      try { pats.push(new RegExp(m[1], m[2])) } catch { /* 解析失败就不加，下面会自证 */ }
    }
  }
  const all = fs.readdirSync(P('_tools')).filter((f) => f.endsWith('.mjs')).sort()
  discovered = all.filter((f) => {
    if (EXCLUDE[f]) return false
    if (pats.some((re) => re.test(f))) return false
    if (/^test-.*\.mjs$/.test(f)) return true
    return read(path.join('_tools', f)).includes('game-harness.mjs')
  })
  // 自证：正则表必须解析出至少 2 条，否则"发现规则对不上运行器"（R5）
  if (pats.length < 2) discoverBroken = `EXCLUDE_PATTERN 只解析出 ${pats.length} 条（预期 ≥2）—— 发现规则对不上运行器`
}

// ─────────────────────────── 2) 断言基线 ───────────────────────────
const baseline = JSON.parse(read('docs/test-baseline.json'))
const baselineTotal = Number(baseline.total)
const baselineFiles = Object.keys(baseline.files || {}).length
// 基线**只收录能输出汇总行的测试**；以退出码判定的白名单脚本（ui-overlap）不在里面。
// 所以"发现数"应当 = 基线文件数 + 白名单脚本数（差在这里必须是**算出来的**，不是拍脑袋的 0 或 1）。
// ⚠️ `NO_SUMMARY_OK` 在 run-all-tests.mjs 里是**单行**对象（`{ 'ui-overlap.mjs': '…' }`），
//    原来这条用 `/const NO_SUMMARY_OK = \{([\s\S]*?)\n\}/` 去取 —— 单行对象**没有"换行+}"**，
//    于是永远匹配不到 → 白名单被当成空 → "发现数"那条算出来少 1。
//    第 67 轮修：直接从声明行取到该行末尾的 `}`，单行/多行都能吃。
const noSummaryBlock = runnerSrc.match(/const NO_SUMMARY_OK = \{([^}]*)\}/)
//    另外只取**键**：`'文件名': '理由'` 里的理由也是引号串，一起数进来会多算一倍。
const noSummaryNames = noSummaryBlock ? [...noSummaryBlock[1].matchAll(/'([^']+)'\s*:/g)].map((m) => m[1]) : []

// ─────────────────────────── 3) 迭代轮数 ───────────────────────────
// ⚠️ 日志格式有两处历史遗留，第一版脚本在这里报了**假警报**（"16→28 跳号"）：
//    ① 标题层级不统一：早期轮次用 `##`，别的轮次用 `###` / `####`；
//    ② 第 17–27 轮**没有主标题**（正文以 `### 17.1`、`### 27.5 下一步` 这类小节形式存在，
//       内容在、主标题缺）。文件是"只追加不改旧轮"的，所以**不去补写历史**，
//       改为按"轮号是否被覆盖"来判定 —— 主标题或 `第N.x` 小节命中任一个都算覆盖。
const log = read('docs/自主迭代日志.md')
const mainRounds = [...log.matchAll(/^#{2,4}\s*第\s*(\d+)\s*轮/gm)].map((m) => Number(m[1]))
const subRounds = [...log.matchAll(/^#{2,6}\s*(\d{1,3})\.\d+/gm)].map((m) => Number(m[1]))
const covered = new Set([...mainRounds, ...subRounds])
const latestRound = covered.size ? Math.max(...covered) : 0
const notCovered = []
for (let n = 1; n <= latestRound; n++) if (!covered.has(n)) notCovered.push(n)
const noMainHeading = [...covered].filter((n) => !mainRounds.includes(n)).sort((a, b) => a - b)

// ─────────────────────────── 4) 发布包（直接读 zip 中央目录尾部 EOCD）───────────────────────────
function zipInfo(p) {
  const buf = fs.readFileSync(p)
  if (buf.length === 0) return { bytes: 0, entries: 0, eocd: false }
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) return { bytes: buf.length, entries: 0, eocd: false }
  return { bytes: buf.length, entries: buf.readUInt16LE(eocd + 10), eocd: true }
}
const zips = fs.readdirSync(ROOT)
  .filter((f) => /^多克多比v[\d.]+单机版\.zip$/.test(f))
  .map((f) => ({ name: f, ver: (f.match(/v([\d.]+)/) || [, '0'])[1], ...zipInfo(P(f)) }))
  .sort((a, b) => {
    const va = a.ver.split('.').map(Number), vb = b.ver.split('.').map(Number)
    for (let i = 0; i < 3; i++) { const d = (vb[i] || 0) - (va[i] || 0); if (d) return d }
    return 0
  })
const newestZip = zips[0] || null

// ─────────────────────────── 5) STATE / PLAN 里手写的数字 ───────────────────────────
const state = read('STATE.md')
const plan = read('00-PLAN.md')
const stateVer = (state.match(/\*\*当前版本\*\*：\s*v([\d.]+)/) || [])[1] || null
// 断言数：只认「断言总数」那一行的单元格 —— 直接全文搜 `N 项断言` 会**串行**匹配到
// 「测试文件」那行里的 `32 个 | 断言总数 | **1420 项**`（第一版就这么错，实测报 1420 vs null）
const stateTotalCell = (state.match(/\|\s*断言总数\s*\|([^|]*)\|/) || [])[1] || ''
const stateTests = (stateTotalCell.match(/([\d,]{3,})/) || [])[1] || null
const planVer = (plan.match(/\*\*当前基线版本\*\*：\s*v([\d.]+)/) || [])[1] || null
// §9.1 表格里若写了"当前版本"，也一起核（写法：| 当前版本 | **v0.6** 单机版 | 之类）
const planStateVer = (plan.match(/\|\s*\*\*当前版本\*\*\s*\|\s*\*\*v([\d.]+)/) || [])[1] || null
const planRounds = (plan.match(/迭代轮数\s*\|\s*\*\*(\d+)\s*轮/) || [])[1] || null
// 计划书里若写了"字形 2418 字"就核它；没写则用实测值自证（不构成失败）
const planGlyphs = (plan.match(/字形\s*[：:]?\s*\*{0,2}(\d{3,5})\s*字/) || [])[1] || null

// ─────────────────────────── 6) 字形图集 ───────────────────────────
let glyphCount = null
try {
  const idx = JSON.parse(read('_tools/glyphs/index.json'))
  glyphCount = idx.totalGlyphs ?? null
  if (glyphCount === null && idx.sizes) {
    const codes = new Set()
    const walk = (o) => {
      if (!o || typeof o !== 'object') return
      if (o.glyphs) for (const k of Object.keys(o.glyphs)) codes.add(Number(k))
      for (const v of Object.values(o)) walk(v)
    }
    walk(idx.sizes)
    glyphCount = codes.size
  }
} catch { /* 图集不存在时下面报错 */ }

// ─────────────────────────── 汇总核对 ───────────────────────────
if (discoverBroken) {
  rows.push({ ok: false, name: '测试发现规则可解析', expected: '可解析', actual: discoverBroken, where: '_tools/run-all-tests.mjs', fix: '运行器的发现规则改了 → 同步本脚本' })
  bad++
} else {
  // 基线里的文件数 vs 我数出来的（基线不含无汇总行的白名单脚本，所以是 discovered-1 或 discovered）
  // 正例自证（R5）：这条必须能**给出失败**——所以它比的是"发现数"与"基线文件数"两个独立的量。
  // 发现数 vs 基线文件数：差额**必须等于**白名单里那些"以退出码判定、不输出汇总"的脚本数
  const noSumInDiscovered = discovered.filter((f) => noSummaryNames.includes(f)).length
  const expectedFiles = baselineFiles + noSumInDiscovered
  rows.push({
    ok: discovered.length === expectedFiles,
    name: '发现数 = 基线文件数 + 无汇总白名单脚本数',
    expected: `${expectedFiles}（基线 ${baselineFiles} + 白名单 ${noSumInDiscovered}）`,
    actual: `发现 ${discovered.length} / 基线 ${baselineFiles}`,
    where: 'docs/test-baseline.json',
    fix: '跑一遍 node _tools/run-all-tests.mjs 让基线自动更新（新增测试后必须跑）',
  })
  if (discovered.length !== expectedFiles) bad++
  if (discovered.length < Number(minTestsM[1])) {
    rows.push({ ok: false, name: '发现数不低于 MIN_TESTS', expected: `≥${minTestsM[1]}`, actual: discovered.length, where: '_tools/run-all-tests.mjs' })
    bad++
  }
}

check('迭代轮数（日志实测）', latestRound, planRounds, {
  where: '00-PLAN.md §9.1', fix: `把「迭代轮数」改成 ${latestRound} 轮`,
})
// 覆盖完整性：1..最新轮 每一轮都要在日志里留下痕迹（主标题或 `第N.x` 小节）
rows.push({
  ok: notCovered.length === 0, name: '每一轮都有记录（主标题或 N.x 小节）',
  expected: `1..${latestRound} 全覆盖`, actual: notCovered.length ? `缺 ${notCovered.join(', ')}` : `1..${latestRound} 全覆盖`,
  where: 'docs/自主迭代日志.md', fix: '缺轮 = 有人漏记或改过历史，先在日志里补记',
})
if (notCovered.length) bad++
// 格式遗留只提示、不算失败（文件只追加不改旧轮，历史主标题不该回填）
if (noMainHeading.length) {
  rows.push({
    ok: true, name: `格式遗留（不算失败）：第 ${noMainHeading.join('/')} 轮没有主标题`,
    expected: '仅提示', actual: '正文以 `### N.x` 小节存在，内容完整',
    where: 'docs/自主迭代日志.md',
  })
}
check('STATE.md 当前版本 = 00-PLAN.md 基线版本', planVer, stateVer, {
  where: 'STATE.md / 00-PLAN.md', fix: '两处版本号必须一致（v3 §2 单一事实源）',
})
// ★ 第 66 轮加：**游戏里显示的版本号**也得跟上。
//   加这条是因为它已经悄悄飘了两个版本 —— `game.html` 的加载页一直写着 "离线复刻版 v0.5"，
//   而发布包是 v0.7。玩家打开游戏看到的第一屏就是错版本号，而且**没有任何东西会报错**。
{
  const htmlRaw = fs.readFileSync(path.join(ROOT, 'game.html'), 'utf8')
  const htmlVer = (htmlRaw.match(/离线复刻版\s*v([\d.]+)/) || [])[1] || null
  check('game.html 加载页显示的版本 = STATE.md 当前版本', stateVer, htmlVer, {
    where: 'game.html（加载页那行 `离线复刻版 vX.Y`）',
    fix: `把 v${htmlVer || '?'} 改成 v${stateVer}`,
  })
}
check('STATE.md 断言数 = 基线实测', baselineTotal, stateTests, {
  where: 'STATE.md §2', fix: `把「${stateTests} 项断言」改成 ${baselineTotal} 项`,
})

// ★ 第 67 轮加：**复刻与构建手册里的基线数字**也要和实测一致。
//   理由和 game.html 那条一样：手册是给"没参与过这个项目的人"看的入口文档，
//   它写错一个数字，那个人会以为"跑出来不对是我的环境问题"，而不是"手册过期了"。
//   手册必须能被机器核对（R12：文档与代码不一致就改文档，不许改校验脚本迁就文档）。
{
  const manPath = path.join(ROOT, 'docs', '复刻与构建手册.md')
  if (!fs.existsSync(manPath)) {
    rows.push({ ok: false, name: '存在复刻与构建手册', expected: 'docs/复刻与构建手册.md', actual: '文件不存在', where: 'docs/', fix: '这是给接手人看的入口文档，不能删' })
    bad++
  } else {
    const manRaw = fs.readFileSync(manPath, 'utf8')
    const mTests = manRaw.match(/(\d+)\s*个测试文件\s*\/\s*(\d+)\s*项断言/) || []
    const mGlyph = (manRaw.match(/字形总数\s*(\d+)/) || [])[1] || null
    // 手册里写的文件数用**用户实际看到的那个数**（回归打印的"发现 N 个"），
    // 也就是 `基线文件数 + 无汇总白名单脚本数`；不是裸的基线文件数。
    const realFiles = baselineFiles + noSummaryNames.length
    check('手册里的断言数 = 基线实测', String(baselineTotal), mTests[2] || null, {
      where: 'docs/复刻与构建手册.md §2 期望值表',
      fix: `把 ${mTests[2] || '?'} 改成 ${baselineTotal}`,
    })
    check('手册里的测试文件数 = 回归实际发现数', String(realFiles), mTests[1] || null, {
      where: 'docs/复刻与构建手册.md §2 期望值表',
      fix: `把 ${mTests[1] || '?'} 改成 ${realFiles}`,
    })
    if (mGlyph) {
      check('手册里的字形总数 = 计划书实测', String(glyphCount), mGlyph, {
        where: 'docs/复刻与构建手册.md §2 C 段',
        fix: `把 ${mGlyph} 改成 ${glyphCount}`,
      })
    }
  }
}
if (planStateVer) check('00-PLAN.md §9.1 版本 = 实测版本', planVer, planStateVer, { where: '00-PLAN.md §9.1' })

// 基础版本 vs 最新发布包：允许"版本领先但还没打包"，但**必须能被看见**
if (!newestZip) {
  // ★ 第 55 轮：**源码包/交接包里本来就不含发布包**（发布包 177 MB，装进去等于重复占一倍），
  //   所以在那种环境下"没有发布包"是**正常**的，不该判红 —— 判红会误导接手的人
  //   以为自己的环境坏了（实测：从交接包解压出来跑自检，红的就这一项）。
  //   判据：根目录里有没有**发布/打包工具**（有 = 这是个可开发的仓库，只是还没出包）。
  const hasBuildTools = fs.existsSync(path.join(ROOT, '_tools', 'make-release.mjs'))
  const isSourceOnly = hasBuildTools && !fs.existsSync(path.join(ROOT, 'dist'))
  rows.push({
    ok: true,
    name: '存在发布包',
    expected: '至少一个 多克多比vX.Y单机版.zip',
    actual: isSourceOnly
      ? '没有（**源码包/交接包环境，属正常**）—— 需要时跑 node _tools/make-release.mjs 自己出'
      : '一个都没有',
    where: '仓库根目录', fix: 'node _tools/make-release.mjs',
  })
  // 只有在"这明显是个完整工作仓库"（有 dist/）时才判红
  if (!isSourceOnly) bad++
} else {
  const sameVer = newestZip.ver === stateVer
  rows.push({
    ok: sameVer || newestZip.bytes > 0, name: '发布包非空且与版本对齐',
    expected: `v${stateVer} 的包存在且字节 > 0`,
    actual: `最新包 ${newestZip.name}：${newestZip.bytes} 字节 / ${newestZip.entries} 条目` +
      (sameVer ? '' : `（版本落后：包是 v${newestZip.ver}，STATE 是 v${stateVer} —— 本轮还没打包）`),
    where: '仓库根目录', fix: 'node _tools/make-release.mjs',
  })
  if (!(sameVer || newestZip.bytes > 0)) bad++
  // 历史包袱：0 字节的残包必须删掉，否则 verify-zip 的"自动挑最新包"会挑到它
  const dead = zips.filter((z) => z.bytes === 0)
  rows.push({
    ok: dead.length === 0, name: '没有 0 字节残包',
    expected: '0 个', actual: dead.length ? dead.map((z) => z.name).join(', ') : '0 个',
    where: '仓库根目录', fix: '删掉这些残包（它们是"打包静默失败"的化石，会让 verify-zip 白验）',
  })
  if (dead.length) bad++
  // exe/端点验收的**证据**必须同时存在：包里有 exe，且 STATE 或日志里记了实测
  const exeInside = newestZip.bytes > 0 && (() => {
    try {
      const buf = fs.readFileSync(P(newestZip.name))
      let eocd = -1
      for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
      if (eocd < 0) return false
      const count = buf.readUInt16LE(eocd + 10)
      let off = buf.readUInt32LE(eocd + 16)
      for (let i = 0; i < count; i++) {
        const nameLen = buf.readUInt16LE(off + 28), extraLen = buf.readUInt16LE(off + 30), cmtLen = buf.readUInt16LE(off + 32)
        const nm = buf.toString('utf8', off + 46, off + 46 + nameLen)
        if (nm.replace(/\\/g, '/').endsWith('多克多比.exe')) return true
        off += 46 + nameLen + extraLen + cmtLen
      }
      return false
    } catch { return false }
  })()
  check('发布包内有启动器 exe', true, exeInside, { where: 'verify-zip.mjs 同款检查', fix: 'node _tools/verify-zip.mjs' })
}

check(`字形图集覆盖字数 = ${glyphCount}（计划书写了别的数就红）`, planGlyphs || glyphCount, glyphCount, {
  where: '00-PLAN.md §9 / _tools/glyphs/index.json',
})

// ─────────────────────────── 打印 ───────────────────────────
console.log('== 开工自检：计划书 / 状态表 / 发布包一致性 ==')
console.log(`   实测：${latestRound} 轮 · ${discovered.length} 个测试文件 · ${baselineTotal} 项断言 · ` +
  `${zips.length} 个发布包（最新 ${newestZip ? newestZip.name + ' ' + (newestZip.bytes / 1048576).toFixed(1) + ' MB' : '无'}）· ` +
  `字形 ${glyphCount ?? '?'} 字\n`)
for (const r of rows) {
  const mark = r.ok ? '  ✓' : '  ✗'
  console.log(`${mark} ${r.name}`)
  if (!r.ok) {
    console.log(`      文档写: ${r.expected}`)
    console.log(`      实测是: ${r.actual}`)
    if (r.where) console.log(`      位置  : ${r.where}`)
    if (r.fix) console.log(`      怎么修: ${r.fix}`)
  }
}
const pass = rows.filter((r) => r.ok).length
console.log(`\n结果: 通过 ${pass} 项，失败 ${bad} 项`)
if (bad) {
  console.log('★ 有对不上的：先修文档，再干活（R12）。不许改本脚本迁就文档。')
  process.exit(1)
}
console.log('✓ 六项一致，可以开工')
