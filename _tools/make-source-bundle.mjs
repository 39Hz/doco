// 产出**源码包**：让别人（或另一个 AI）能重建 v0.8、也能接着往下做。
//
// 【和发布包的区别】
//   发布包（多克多比vX.Y单机版.zip）= **成品**：exe + 使用说明 + web/，双击即玩。
//   源码包（本工具）              = **可重建的原料**：源码 + 工具 + 素材 + 文档 + 证据。
//   只拿发布包是**做不出** v0.8 的 —— 这一点写在《复刻与构建手册》§1.2 里。
//
// 【不收什么，以及为什么】（每一条都对应手册 §1.3 的表）
//   · 归档素材 8.8 GB         —— 只有"重新生成美术素材"才需要，日常改代码用不到
//   · assets/sprites 1.86 GB  —— 原版全分辨率动画帧，**运行时不用**（运行时用 assets/anim）
//   · _tools/imgcache 136 MB  —— JPEG→PNG 预解码缓存，`convert-jpg.mjs` 一条命令能重建
//   · _tools/glyphs/*.rgba 178 MB —— 字形图集的中间产物，成品 PNG 才 1.7 MB（在 assets/font）
//   · _tools/ai 51 MB         —— Real-ESRGAN 放大模型，只有做高清立绘才用
//   · docs/sheets 74 MB       —— 审阅用拼图，`sheet.mjs` 可重建
//   · dist/ 及各种中转/历史目录 —— 会重新生成，或与本次交付无关
//
// 用法：node _tools/make-source-bundle.mjs [--out 文件名.zip]
import fs from 'node:fs'
import path from 'node:path'
import { zipDir, collectEntries } from './lib/zip-write.mjs'
import { makeFilter, listOversize, MAX_FILE_MB, mbOf } from './lib/source-filter.mjs'

const ROOT = path.resolve(process.argv[2] || '.')
const ARGS = process.argv.slice(2)
const OUT_ARG = (() => {
  const eq = ARGS.find((a) => a.startsWith('--out='))
  if (eq) return eq.split('=')[1]
  const i = ARGS.indexOf('--out')
  return i >= 0 ? ARGS[i + 1] : null
})()

// 读版本号（单一事实源 = STATE.md）
const state = fs.readFileSync(path.join(ROOT, 'STATE.md'), 'utf8')
const ver = (state.match(/\*\*当前版本\*\*：\s*v([\d.]+)/) || [])[1]
if (!ver) { console.error('★ STATE.md 里找不到「**当前版本**：vX.Y」'); process.exit(1) }

const OUT = path.join(ROOT, OUT_ARG || `多克多比v${ver}-源码包.zip`)
const TOP = `多克多比v${ver}-源码包`

// ── 收录/排除规则：**从 `lib/source-filter.mjs` 来**（第 69 轮抽出）──────
//    交接包（`多克多比制作.zip`）要收的东西和这里几乎一样；规则各写一份的话，
//    改了一边忘了另一边 → 某个包悄悄多带 1.8 GB、或者悄悄少带一个关键目录。
//    所以规则只留一份，两边都 import。
const filter = makeFilter()

// ── 包内说明（写在包里，不落仓库，避免又一份会过期的文档）──────
const now = new Date()
const README = `# 多克多比离线复刻 · 源码包 v${ver}

生成时间：${now.toISOString().slice(0, 19).replace('T', ' ')}

## 这是什么

**能重建出 v${ver} 单机版的原料**：游戏源码 + 工具脚本 + 游戏素材 + 文档与证据。

发布包（\`多克多比v${ver}单机版.zip\`）是**成品**，双击即玩；
**源码包是"能做出那个成品"的东西** —— 两者不是一回事。

## 先读哪份

1. **\`docs/复刻与构建手册.md\`** ← **从这里开始**。环境要求、从零重建的确切命令、
   目录地图、来源等级、已知缺口、以及一串实测踩过的坑。
2. \`00-PLAN.md\` —— 规则（R1–R15）与里程碑优先级。
3. \`STATE.md\` —— 一句话现状 / 测试底线 / 下一步。**版本号的单一事实源**。
4. \`README.md\` —— 给玩家看的说明（它也是发布包里的"使用说明"）。

## 最快跑起来

\`\`\`powershell
node _tools/check-plan-freshness.mjs   # 开工自检（只读，1 秒）
node _tools/run-all-tests.mjs          # 全量回归
node _tools/make-release.mjs           # 打出发布包
node _tools\\smoke-exe.mjs              # 真启动一次 exe
\`\`\`

## 这个包里**没有**什么（都是刻意的）

| 没带 | 体积 | 为什么 / 怎么补 |
|---|---|---|
| 归档素材 \`多克多比专区资料素材/\` | 8.8 GB | 只有**重新生成美术素材**才需要。日常改代码 + 打包 + 跑验证都不用它 |
| \`assets/sprites/\` | 1.86 GB | 原版全分辨率动画帧，**运行时不用**（运行时读 \`assets/anim/\`）。只有重做立绘才需要 |
| \`_tools/imgcache/\` | 136 MB | JPEG→PNG 预解码缓存 → \`node _tools/convert-jpg.mjs\` 重建 |
| \`_tools/glyphs/*.rgba\` | 178 MB | 字形图集中间产物 → 三步重建（见手册 §2 C） |
| \`_tools/ai/\` | 51 MB | Real-ESRGAN 放大模型，只有做高清立绘才用 |
| \`docs/sheets/\` | 74 MB | 审阅用拼图 → \`node _tools/sheet.mjs\` 重建 |
| \`dist/\` | 176 MB | 打包中间产物 → \`make-release.mjs\` 会重新生成 |

**一句话**：这个包够你"改代码 → 跑测试 → 重新打包 → 发版"，
只有当你要**重新生成美术素材**时，才需要额外拿到归档。

## 规矩（照做，别绕）

这个项目最较真的不是功能多少，而是**不许把推算当官方**。三条底线：

1. **不编造**（R1）—— 归档里没有的就标 \`missing\`，不拿"看起来像"的顶替。
2. **标来源等级**（R2）—— \`official\` / \`derived\` / \`community\` / \`missing\`，
   而且要落到**数据**里能被程序读（例如 \`assets/manifest.json\` 的 \`scenes[].conf\`）。
3. **测试只加不减**（R6）—— 断言数下降会被 \`run-all-tests.mjs\` 的基线守卫抓住。

**动手前先跑一遍 \`node _tools/check-plan-freshness.mjs\`** ——
它会核对计划书 / STATE / 发布包 / 手册 / \`game.html\` 里的版本号与数字是否一致。
不一致就**改文档**，不许改校验脚本迁就文档（R12）。

> 仅供个人怀旧与非商业用途。素材版权归原厂所有。
`

const t0 = Date.now()
console.log(`源码包 → ${path.basename(OUT)}`)

// 先按规则收一遍，再过体积上限（这样"被体积挡掉的文件"能明确列出来）
const over = listOversize(ROOT, collectEntries(ROOT, filter))
const overSet = new Set(over.map((o) => o.rel))
if (over.length) {
  console.log(`  ⚠ 以下 ${over.length} 个文件超过 ${MAX_FILE_MB} MB，已跳过（源码包里不该有这么大的东西）：`)
  for (const o of over.slice(0, 8)) console.log(`      ${o.rel}（${o.mb.toFixed(1)} MB）`)
  if (over.length > 8) console.log(`      …还有 ${over.length - 8} 个`)
}

const r = zipDir(ROOT, OUT, {
  filter: (rel, dirent) => filter(rel, dirent) && !overSet.has(rel),
  prefix: TOP + '/',
  extraFiles: [{ name: 'README-源码包.md', text: README }],
  onProgress: (d, t) => console.log(`  … ${d}/${t}`),
})
const secs = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`  条目: ${r.entries} 个（含目录）`)
console.log(`  ${path.basename(OUT)}  ${(r.bytes / 1048576).toFixed(1)} MB  用时 ${secs}s`)

// R11 精神：产物为 0 字节就直接失败，别留下残包
if (r.bytes <= 0) { console.error('★ 产出 0 字节，失败'); process.exit(1) }
console.log('✅ 源码包已产出')
