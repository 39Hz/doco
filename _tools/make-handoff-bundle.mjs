// 产出**交接包**：`多克多比制作.zip` —— 把所有东西装进**一个**压缩包，交给别人。
//
// 【里面三块，各有各的用处】
//   1-游戏-双击即玩/   = 发布包的内容（exe + 使用说明 + web/）→ 不懂技术的人解压就能玩
//   2-源码-可重建/     = 源码包的内容（源码 + 工具 + 素材 + 文档）→ 能重建、能接手
//   3-计划与手册/      = 最关键的几份文档单独放一层 → 不用翻源码包就能先读懂
//
// 用法：node _tools/make-handoff-bundle.mjs
import fs from 'node:fs'
import path from 'node:path'
import { zipEntries, stageDir, collectEntries } from './lib/zip-write.mjs'
import { makeFilter, listOversize, MAX_FILE_MB, mbOf } from './lib/source-filter.mjs'

const ROOT = path.resolve(process.argv[2] || '.')
const P = (...p) => path.join(ROOT, ...p)

const state = fs.readFileSync(P('STATE.md'), 'utf8')
const ver = (state.match(/\*\*当前版本\*\*：\s*v([\d.]+)/) || [])[1]
if (!ver) { console.error('★ STATE.md 里找不到「**当前版本**：vX.Y」'); process.exit(1) }

const OUT = P('多克多比制作.zip')
const TOP = '多克多比制作'
const DIST = P('dist')

if (!fs.existsSync(path.join(DIST, '多克多比.exe'))) {
  console.error('★ dist/ 里没有 多克多比.exe —— 先跑 node _tools/make-release.mjs')
  process.exit(1)
}

// ── 1) 游戏（= dist/ 的内容）────────────────────────────────
const gameEntries = stageDir(DIST, { prefix: `${TOP}/1-游戏-双击即玩/` })

// ── 2) 源码（与源码包同一套规则）────────────────────────────
const filter = makeFilter()
const srcAll = collectEntries(ROOT, filter)
const over = listOversize(ROOT, srcAll)
const overSet = new Set(over.map((o) => o.rel))
const srcEntries = stageDir(ROOT, {
  prefix: `${TOP}/2-源码-可重建/`,
  filter: (rel, dirent) => filter(rel, dirent) && !overSet.has(rel),
  extraFiles: [{
    name: 'README-源码包.md',
    text: `# 2-源码-可重建

这一块是**能做出 \`1-游戏-双击即玩\` 那个成品**的原料：游戏源码 + 工具脚本 + 游戏素材 + 文档与证据。

**先读 [\`docs/复刻与构建手册.md\`](docs/复刻与构建手册.md)** —— 环境要求、
从零重建的确切命令、目录地图、来源等级、已知缺口、实测踩过的坑。

最快跑起来：

\`\`\`powershell
node _tools/check-plan-freshness.mjs   # 开工自检（只读，1 秒）
node _tools/run-all-tests.mjs          # 全量回归
node _tools/make-release.mjs           # 打出发布包
node _tools\\smoke-exe.mjs              # 真启动一次 exe
\`\`\`

**包里没有**：原版归档（8.8 GB）、\`assets/sprites/\`（1.86 GB 全分辨率帧，运行时不用）、
各种可重建的缓存。详见手册 §1.3。

> 完整说明见交接包顶层的 \`先读我.md\`，或另有一份独立的 \`多克多比vX.Y-源码包.zip\`。
`,
  }],
})
if (over.length) {
  console.log(`  ⚠ 跳过 ${over.length} 个超过 ${MAX_FILE_MB} MB 的文件：`)
  for (const o of over.slice(0, 5)) console.log(`      ${o.rel}（${o.mb.toFixed(1)} MB）`)
}

// ── 3) 计划与手册（单独一层，方便先读）──────────────────────
const DOCS = [
  ['README.md', 'README-给玩家.md'],
  // ★ 交接与协作指南放**第一位**：给接手的人和协作的 AI 看，5 分钟看懂怎么改而不改坏
  ['docs/交接与协作指南.md', '★交接与协作指南-先读这个.md'],
  ['docs/复刻与构建手册.md', '复刻与构建手册.md'],
  ['00-PLAN.md', '00-PLAN-计划书.md'],
  ['STATE.md', 'STATE-现状.md'],
  ['BLOCKED.md', 'BLOCKED-阻塞项.md'],
  ['docs/保真度报告.md', '保真度报告.md'],
  ['docs/v1.0符合度清单.md', 'v1.0符合度清单.md'],
  ['docs/deviations.md', 'deviations-与原版不同之处.md'],
  ['docs/自主迭代日志.md', '自主迭代日志-历史.md'],
  ['场景命名工作表.csv', '场景命名工作表.csv'],
]
const docEntries = [{ name: `${TOP}/3-计划与手册/`, dir: true }]
const missingDoc = []
for (const [src, dst] of DOCS) {
  if (!fs.existsSync(P(src))) { missingDoc.push(src); continue }
  docEntries.push({ name: `${TOP}/3-计划与手册/${dst}`, full: P(src) })
}
if (missingDoc.length) console.log(`  ⚠ 这些文档没找到，已跳过：${missingDoc.join('、')}`)

// ── 包内第一页 ──────────────────────────────────────────────
const FIRST = `# 多克多比 · 离线单机复刻 v${ver} · 制作包

生成时间：${new Date().toISOString().slice(0, 19).replace('T', ' ')}

这个压缩包里有**三块**，按你的目的选一块看就行。

---

## 1️⃣ 想直接玩 → \`1-游戏-双击即玩/\`

解压出来，双击 **\`多克多比.exe\`**。出一个没有地址栏的游戏窗口，**不用装任何东西**。

- 鼠标左键点地面走路、点 NPC/怪物交互；**界面上能点的东西都可以直接左键点**
- \`V\` 技能（配招）· \`Tab\` 大地图 · \`B\` 背包 · \`Q\` 任务 · \`G\` 杂货铺 · \`L\` 图鉴 · \`Z\` 战报
- \`F\` 全屏 · \`M\` 静音 · \`N\` 难度 · \`T\` 在线礼包 · \`F3\` 卡顿面板
- 进度自动存在本地，**三个存档槽**

内容：**93 个场景** · **52 只多比形态（29 只有官方立绘）** · **14 个副本** · **小游戏** · **136 技能（84 个带图标）** · 36 怪物。

**配招怎么用**：按 \`V\`（或点顶栏「技能」）→ 先点左边想要的那一格（会亮黄框）→
再点右边技能库里想装的技能，就装上了；点已装的格子则卸下。\`1~6\` 选格、\`Del\` 卸下。

---

## 2️⃣ 想重建 / 接手开发 → \`2-源码-可重建/\`

这是**能做出上面那个成品**的原料：游戏源码 + 工具脚本 + 游戏素材 + 文档与证据。

**想改东西，先读 \`3-计划与手册/★交接与协作指南-先读这个.md\`** ——
五条铁律、每轮改动的标准流程、三个"照着做就行"的任务模板、以及一份**已知坑清单**（能省几小时）。

**想重建，读 \`2-源码-可重建/docs/复刻与构建手册.md\`** —— 环境要求、
**从零重建的确切命令**、目录地图、来源等级、已知缺口，以及一串实测踩过的坑。

最快跑起来：

\`\`\`powershell
node _tools/check-plan-freshness.mjs   # 开工自检（只读，1 秒）
node _tools/run-all-tests.mjs          # 全量回归（54 文件 / 2218 项断言）
node _tools/make-release.mjs           # 打出发布包
node _tools\\smoke-exe.mjs              # 真启动一次 exe
\`\`\`

**包里没有**：原版归档（8.8 GB）、\`assets/sprites/\`（1.86 GB 全分辨率帧，运行时不用）、
各种可重建的缓存。细节见手册 §1.3。

---

## 3️⃣ 想先搞懂"为什么这么做" → \`3-计划与手册/\`

| 文件 | 讲什么 |
|---|---|
| \`复刻与构建手册.md\` | **从零重建的确切步骤**（最该先看的一份）|
| \`00-PLAN-计划书.md\` | 硬性规则 R1–R15、里程碑优先级 |
| \`STATE-现状.md\` | 一句话现状 / 测试底线 / 下一步；**版本号的单一事实源** |
| \`保真度报告.md\` | 逐项列出哪些是官方的、哪些是推算的 |
| \`v1.0符合度清单.md\` | 离"完全符合原版"还差什么 |
| \`deviations-与原版不同之处.md\` | 每一处与原版不同的登记（V1–V89）|
| \`场景命名工作表.csv\` | **唯一需要人来定的一件事**：93 个场景的官方名 |

---

## 三条底线（接手请照做）

这个项目最较真的不是功能多少，而是**不许把推算当官方**：

1. **不编造**（R1）—— 归档里没有的就标 \`missing\`，不拿"看起来像"的顶替。
2. **标来源等级**（R2）—— \`official\` / \`derived\` / \`community\` / \`missing\`，
   而且要落到**数据**里能被程序读。
3. **测试只加不减**（R6）—— 断言数下降会被回归的基线守卫抓住。

动手前先跑 \`node _tools/check-plan-freshness.mjs\`：它会核对计划书 / STATE / 发布包 /
手册 / \`game.html\` 里的数字是否一致。**不一致就改文档，不许改校验脚本迁就文档**（R12）。

---

## 已知缺口（不是"没做"，是"没依据"）

| 缺口 | 性质 |
|---|---|
| **77 个场景官方名** | **只有原版玩家能定** —— 工作表已做成"一勾就完" |
| **22 只多比立绘** | 6 只卡在 FLA/SWF 格式（**取不出**，已复核）；16 只归档里根本没有 |
| **2 个小游戏**（疯狂冰激凌 / 多克大富翁）| 2672 篇语料里查不到规则，**不编** |
| S/A 评级分数线、\`music006\` | 同上 |

> 仅供个人怀旧与非商业用途。素材版权归原厂所有。
`

const firstEntry = [{ name: `${TOP}/`, dir: true }, { name: `${TOP}/先读我.md`, buf: Buffer.from(FIRST, 'utf8') }]

// ── 合并写出 ────────────────────────────────────────────────
const entries = [...firstEntry, ...gameEntries, ...srcEntries, ...docEntries]
console.log(`多克多比制作.zip  ← 游戏 ${gameEntries.length} + 源码 ${srcEntries.length} + 文档 ${docEntries.length} + 首页`)
const t0 = Date.now()
const r = zipEntries(entries, OUT, { onProgress: (d, t) => console.log(`  … ${d}/${t}`) })
console.log(`  条目: ${r.entries} 个（含目录）`)
console.log(`  多克多比制作.zip  ${mbOf(r.bytes)} MB  用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
if (r.bytes <= 0) { console.error('★ 产出 0 字节，失败'); process.exit(1) }
console.log('✅ 交接包已产出')
