// 回归测试：截图字形图集必须覆盖运行时所有会被绘制的文字。
//
// 背景（真实事故）：_tools/gen-glyphs-prep.mjs 原先硬编码 14 个源文件，漏了
// game/tables/skills-official.js（官方技能表），于是 27 个字（滞割虎扑尘棱掩杜钻柄惧煦益藉蜃绞瞄扁劈诛盛曼陀绽蜂痹肌）
// 不在图集里，_tools/shoot.mjs 生成的截图静默丢字 —— 而截图正是我验证界面的唯一手段。
// 教训与 assets/soya.js 漏加载、测试文件漏跑完全一致：**硬编码清单一定会过时**。
// 本测试保证这个缺陷不会再次静默回来。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`) }
  else { fail++; console.log(`  ✗ ${msg}${extra ? ' → ' + extra : ''}`) }
}

console.log('== 字形图集覆盖测试 ==')

// ---- 1. 图集存在且结构可解析 ----
const idxPath = path.join(ROOT, '_tools', 'glyphs', 'index.json')
ok(fs.existsSync(idxPath), 'index.json 存在')
if (!fs.existsSync(idxPath)) { console.log(`\n结果: ${pass} 通过 / ${fail} 失败`); process.exit(1) }
const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'))

// ---- 2. 定位字形表（结构是 sizes[*][*].glyphs，不是 atlas[*].glyphs —— 曾因此误报"缺 607 字"）----
const maps = []
for (const [size, styles] of Object.entries(idx.sizes || {})) {
  for (const [style, def] of Object.entries(styles || {})) {
    if (def && def.glyphs && Object.keys(def.glyphs).length) maps.push({ key: `${size}_${style}`, glyphs: def.glyphs })
  }
}
ok(maps.length >= 2, '定位到 regular 与 bold 两套字形表', `实际 ${maps.length} 套`)
if (!maps.length) { console.log(`\n结果: ${pass} 通过 / ${fail} 失败`); process.exit(1) }

const codes = new Set()
for (const m of maps) for (const c of Object.keys(m.glyphs)) codes.add(Number(c))
ok(codes.size > 1000, `字形数量合理（${codes.size}）`)

// ---- 3. 正例自证：连常见字都缺说明定位错了 ----
const SELF = '的多比克攻击技能力血量'
const selfMiss = [...SELF].filter((c) => !codes.has(c.codePointAt(0)))
ok(selfMiss.length === 0, '正例自证：常见字全部命中', selfMiss.join(''))

// ---- 4b. 源码字符必须全部在图集里（这是**生成脚本的契约**，直接照它核对）----
// 为什么单列这一条：上面第 5 段只比对"**本次渲染采样到**的文本"，
// 而一个界面只要没被巡检到，它引入的新字就查不出来 ——
// 第 29 轮的「多克大富翁」的「翁」就是这么溜过去的：图集是上一轮生成的，
// 新代码引入了新字，采样又没进小游戏面板，于是测试说"全覆盖"、截图里却少一个字。
// 生成脚本（gen-glyphs-prep.mjs）本来就是**按源码字符集**建图集的，
// 所以这里直接核对同一件事：源码里出现过的字，图集里必须有。
{
  const html = fs.readFileSync(path.join(ROOT, 'game.html'), 'utf8')
  const files = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1])
  ok(files.length >= 10, `从 game.html 解析到 ${files.length} 个脚本（与生成脚本同源）`)
  const srcChars = new Set()
  let scanned = 0
  for (const f of files) {
    const p = path.join(ROOT, f)
    if (!fs.existsSync(p)) continue
    scanned++
    for (const ch of fs.readFileSync(p, 'utf8')) srcChars.add(ch)
  }
  const need = [...srcChars].filter((c) => {
    const cp = c.codePointAt(0)
    return cp > 31 && cp <= 0xffff
  })
  const miss = need.filter((c) => !codes.has(c.codePointAt(0)))
  ok(miss.length === 0,
    `源码里 ${need.length} 个字（扫了 ${scanned} 个脚本）全部在图集里`,
    miss.length ? `缺 ${miss.length} 个：${miss.join('')}　→ 跑 _tools/gen-glyphs-prep.mjs 重新生成` : '')
}

// ---- 5. 覆盖运行时真正会画出来的字符串 ----
const probes = []
const probesByFile = {}
function probe(file, patterns) {
  const p = path.join(ROOT, file)
  if (!fs.existsSync(p)) return
  const src = fs.readFileSync(p, 'utf8')
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      probes.push(m[1] ?? '')
      probesByFile[file] = (probesByFile[file] || 0) + 1
    }
  }
}
probe('game/tables/skills-official.js', [/"name"\s*:\s*"([^"]+)"/g, /"desc"\s*:\s*"([^"]+)"/g])
probe('game/tables/form-skills-official.js', [/"name"\s*:\s*"([^"]+)"/g])
probe('game/tables/data.js', [/name\s*:\s*'([^']+)'/g, /title\s*:\s*'([^']+)'/g])
probe('world.js', [/name\s*:\s*'([^']+)'/g])
probe('game/game.js', [
  /drawText\([^,]+,\s*'([^']+)'/g,
  /drawText\([^,]+,\s*"([^"]+)"/g,
  /label\s*:\s*'([^']+)'/g,
  // 【补上的三类】原先只扫 drawText/label，于是**界面里直接写在 stroked/notice/toast 的字面量**
  // 从来没进过采集范围 —— 新关卡里的「湍流」就是这么漏掉的（截图里只剩「流」）。
  /text\.stroked\(ctx,\s*'([^']+)'/g,
  /text\.stroked\(ctx,\s*"([^"]+)"/g,
  /notice\('([^']+)'\)/g,
  /toast\('([^']+)'\)/g,
  /hint:\s*'([^']+)'/g,
])

ok(probes.length >= 100, `采集到足够的运行时文本样本（${probes.length} 条）`)
// 关键：必须真的读到了曾经漏掉的那个文件，否则这条测试就是在自欺欺人
ok((probesByFile['game/tables/skills-official.js'] || 0) >= 100,
  `覆盖到官方技能表文本（${probesByFile['game/tables/skills-official.js'] || 0} 条）—— 这正是当初漏掉的文件`)
// 这条只是"确认读到了 world.js"的哨兵，不是精确数量断言（具体覆盖由下面的全量比对负责）
ok((probesByFile['world.js'] || 0) >= 10, `覆盖到场景名（${probesByFile['world.js'] || 0} 条）`)

const missing = new Map()
for (const t of probes) {
  for (const ch of t) {
    if (ch === '\n' || ch === '\t' || ch === ' ') continue
    if (!codes.has(ch.codePointAt(0)) && !missing.has(ch)) missing.set(ch, t)
  }
}
ok(missing.size === 0, '图集覆盖全部运行时文本（技能名/描述、道具、场景名、UI 文案）',
  missing.size ? `${missing.size} 个缺失: ${[...missing.keys()].join('')}` : '')

// 汇总行必须匹配 _tools/run-all-tests.mjs 的解析格式「通过 N 项，失败 M 项」，
// 否则断言数不会被计入全量回归，测试等于白跑。
console.log(`\n结果: 通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
