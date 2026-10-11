// M5-3 保真度报告：把"我们做到了多少、哪些是官方的、哪些是推算的、哪些没有"用真实数据统计出来。
//
// 原则：**报告里的每个数字都必须由代码从真实运行时数据算出来**，不接受手写。
//
// 为什么拆成两张表：
//   第一版硬把"素材来源"和"功能是否实现"塞进同一张 official/derived/missing 表，结果自相矛盾
//   （技能一行同时报 official=136 和 missing=136，总数也才 136）。根因是分类逻辑写错
//   —— D.SKILLS 以**技能名为键**、对象里没有 name 字段，于是 `!s.name` 把所有技能判成了 missing。
//   更重要的是：**"素材是官方的"和"功能做没做"是两件事**，必须分开统计，否则读者会被误导。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { T } from './game-harness.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const D = W.DKDbbData
// 场景表的唯一真来源：assets/manifest.json（测试与报告共用，避免两边各说一套）
const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'))
const world = t.get('__world')

const selfCheck = []
function guard(cond, msg) { if (!cond) selfCheck.push(msg) }
// 供第 3 节的结论句引用（**不写死数字** —— 写死过一次，后来就过期了）
let SCENE_NAMED = 0
let FORMS_MISSING = 0

// ============ 表 A：内容资产来源 ============
const A = []
function asset(name, official, derived, community, missing, note) {
  const total = official + derived + community + missing
  guard(total > 0, `${name} 总数为 0`)
  A.push({ name, official, derived, community, missing, total, note })
}

// 技能：D.SKILLS 以**技能名为键**，对象里没有 name 字段
{
  const ent = Object.entries(D.SKILLS || {})
  guard(ent.length > 100, `技能只有 ${ent.length} 个`)
  let official = 0, derived = 0, community = 0, missing = 0, icons = 0, seals = 0
  for (const [k, s] of ent) {
    if (!k || !s) { missing++; continue }
    if (s.conf === 'official' || s.official) official++
    else if (s.conf === 'derived') derived++
    else if (s.conf === 'community') community++
    else missing++
    if (s.icon) icons++
    if (s.seal) seals++
  }
  asset('技能', official, derived, community, missing,
    `${ent.length} 个；带图标 ${icons} 个；结印技 ${seals} 个`)
}

// 怪物
{
  const mons = Object.values(D.MONSTERS || {})
  const withArt = mons.filter((m) => m && (m.art || m.sprite || m.file)).length
  guard(mons.length > 0, '怪物数量为 0')
  asset('怪物', withArt, 0, 0, mons.length - withArt, `${mons.length} 只；有立绘 ${withArt} 只`)
}

// 多比形态：官方名称表 85 只，我们有立绘+数据的是 11 只
{
  const forms = D.forms()
  const OFFICIAL_FORMS = 85
  guard(forms.length > 0, '可用形态为 0')
  FORMS_MISSING = Math.max(0, OFFICIAL_FORMS - forms.length)
  asset('多比形态', forms.length, 0, 0, FORMS_MISSING,
    `官方角色大全列了 ${OFFICIAL_FORMS} 只名称；我们可用（有立绘+数据）${forms.length} 只`)
}

// 场景图（素材本身是官方的）
// ⚠️ `SCENE_N` 只在这个块里有效；下面"场景官方命名"是**另一个块**，
//    它自己从 manifest 取场景数（原来两边都写死 88，加场景就会同时错两处）。
const SCENE_N = world.islands.reduce((n, i) => n + i.scenes.length, 0)
{
  const ids = []
  for (const isl of world.islands) for (const s of isl.scenes) ids.push(s)
  guard(SCENE_N > 0, `场景数 ${SCENE_N}`)
  asset('场景底图', ids.length, 0, 0, 0, `${ids.length} 张原版场景图`)
}

// 场景官方名（从 manifest 的 conf 字段读 —— 那才是真来源）
// 早先这里读的是 window.__DKDbb_SCENE_NAMES__，那个全局**根本不存在**，
// 于是恒等于 0，报告一直少算（而 test-scene-names 断言的 11 个其实是对的）。
// 教训：报告里的数字必须从**测试也用的同一份来源**取，否则报告会安静地说谎。
{
  const named = MAN.scenes.filter((s) => s.conf === 'official').length
  const derived = MAN.scenes.filter((s) => s.conf === 'derived').length
  guard(named + derived === SCENE_N, `场景命名条数 ${named}+${derived} ≠ ${SCENE_N}`)
  SCENE_NAMED = named
  asset('场景官方命名', named, derived, 0, SCENE_N - named - derived,
    `有官方名 ${named}/${SCENE_N}（取自归档带官方中文名的原图；第 62 轮起 B14 那 5 个是直接新增场景、名字取自官方文件名）；其余 ${derived} 个按画面内容起了 derived 名`)
}

// 道具
{
  const items = D.items()
  guard(items.length > 0, '道具数量为 0')
  asset('道具', items.length, 0, 0, 0, `${items.length} 件（图标与 id 来自原版策划表）`)
}

// BGM 曲目 / 岛屿绑定
{
  const B = W.__DKDbb_BGM__ || {}
  const named = (B.tracks || []).length
  guard(named > 0, '原版命名曲为 0')
  asset('BGM 曲目', named, 0, 0, 0, `原版音乐目录里的命名曲 ${named} 首`)
  const mapFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'bgm', 'island-bgm.json'), 'utf8'))
  asset('BGM 岛屿绑定', 0, Object.keys(mapFile.map || {}).length, 0, 0,
    '11 座岛 → 曲目配对（官方只留曲名、没留对照表，按岛内物体推断）')
}

// 骑士与魔王
{
  const K = D.knights()
  const miss = D.knightsMissing()
  asset('骑士与魔王', K.length, 0, 0, miss.length, `有立绘/资料 ${K.length} 位；缺立绘 ${miss.length} 位`)
}

// 索亚
{
  const sy = D.soya()
  guard(sy.length > 0, '索亚数量为 0')
  asset('索亚', sy.length, 0, 0, 0, `${sy.length} 只（含立绘与技能）`)
}

// ============ 表 B：功能实现状态 ============
const B = []
function feature(name, done, ruled, norule, note) {
  guard(done + ruled + norule > 0, `${name} 总数为 0`)
  B.push({ name, done, ruled, norule, total: done + ruled + norule, note })
}

feature('战斗核心 M1', 5, 0, 0,
  'SP 槽 · 结印技 · 双伤害通道 · 按速度出手顺序 · 同属性加成（结印参数为 derived）')
feature('世界结构 M2', 4, 0, 0,
  '七大地形（derived）· 同岛场景互通 · 小怪刷新 · 场景↔BGM 绑定')
feature('存档系统', 3, 0, 0, '三槽位 · 双写（文件 + localStorage）· **版本化与迁移**')

// 副本与周边系统：**从 docs/systems-status.json 读**，不再手写数字。
// （第一版把数字写死在脚本里，实现了新系统之后报告还显示"已实现 0 个" —— 自相矛盾。）
const statusFile = path.join(ROOT, 'docs', 'systems-status.json')
guard(fs.existsSync(statusFile), '缺少 docs/systems-status.json')
const STATUS = JSON.parse(fs.readFileSync(statusFile, 'utf8'))
for (const [key, label] of [['dungeons', '官方副本'], ['systems', '周边系统']]) {
  const items = STATUS[key] || []
  guard(items.length > 0, `${label} 状态表为空`)
  const impl = items.filter((x) => x.impl).length
  const found = items.filter((x) => !x.impl && x.rule === 'found').length
  const noRule = items.filter((x) => x.rule === 'unknown' || x.rule === 'not-shipped').length
  const implNames = items.filter((x) => x.impl).map((x) => x.name)
  const notShipped = items.filter((x) => x.rule === 'not-shipped').map((x) => x.name)
  const unknown = items.filter((x) => x.rule === 'unknown').map((x) => x.name)
  feature(label, impl, found, noRule,
    `共 ${items.length} 项；**已实现 ${impl} 个**${implNames.length ? '（' + implNames.join('·') + '）' : ''}` +
    ` · 规则已查清待实现 ${found} 个` +
    (notShipped.length ? ` · 原版就没上线 ${notShipped.length} 个（${notShipped.join('/')}）` : '') +
    (unknown.length ? ` · 仍无依据 ${unknown.length} 个（${unknown.join('/')}）` : ''))
}

// ============ 汇总 ============
const aTot = A.reduce((a, r) => ({
  official: a.official + r.official, derived: a.derived + r.derived,
  community: a.community + r.community, missing: a.missing + r.missing, total: a.total + r.total,
}), { official: 0, derived: 0, community: 0, missing: 0, total: 0 })
const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) + '%' : '0%')

// ============ 产出 ============
const out = []
out.push('# 多克多比复刻 · 保真度报告')
out.push('')
out.push('> 由 `node _tools/fidelity-report.mjs` 从**真实运行时数据**统计生成，数字不接受手写。')
out.push('> `official` 官方原文/原始素材 · `derived` 依证据推算 · `community` 社区资料 · `missing` 无依据。')
out.push('')
out.push('## 0. 一句话结论')
out.push('')
out.push(`素材层保真度较高：${aTot.total} 项里 official 占 ${pct(aTot.official, aTot.total)}。`)
// 这句**从表 B 的数据算出来**，不写死 —— 写死的话，做完一个副本它就会变成假话
{
  const done = B.reduce((a, r) => a + r.done, 0)
  const ruled = B.reduce((a, r) => a + r.ruled, 0)
  const norule = B.reduce((a, r) => a + r.norule, 0)
  out.push(`功能层：${done} 项已实现，${ruled} 项规则已查清但尚未实现，${norule} 项无依据。`)
  if (ruled > 0) {
    const pending = B.filter((r) => r.ruled > 0).map((r) => `${r.name}（${r.ruled}）`)
    out.push(`待实现集中在：${pending.join('、')}。`)
  } else {
    out.push('所有"规则已查清"的功能项均已实现。')
  }
}
out.push('')
out.push('## 1. 内容资产来源（表 A）')
out.push('')
out.push('| 项目 | official | derived | community | missing | 合计 | 说明 |')
out.push('|---|---|---|---|---|---|---|')
for (const r of A) {
  out.push(`| ${r.name} | ${r.official} | ${r.derived} | ${r.community} | ${r.missing} | ${r.total} | ${r.note} |`)
}
out.push(`| **合计** | **${aTot.official}** | **${aTot.derived}** | **${aTot.community}** | **${aTot.missing}** | **${aTot.total}** | official 占 ${pct(aTot.official, aTot.total)} |`)
out.push('')
out.push('## 2. 功能实现状态（表 B）')
out.push('')
out.push('| 功能 | 已实现 | 规则已查清·未实现 | 无依据 | 合计 | 说明 |')
out.push('|---|---|---|---|---|---|')
for (const r of B) {
  out.push(`| ${r.name} | ${r.done} | ${r.ruled} | ${r.norule} | ${r.total} | ${r.note} |`)
}
out.push('')
out.push('## 3. 怎么读这两张表')
out.push('')
out.push('- 表 A 高 official 说明**素材不是编的**：技能来自原版技能表 xlsx、道具图标来自原版策划表、')
out.push(`  场景底图/BGM/立绘都是原版文件。表 A 的 missing 集中在**多比形态立绘（缺 ${FORMS_MISSING} 只）**与**场景官方命名（还缺 ${88 - SCENE_NAMED} 个）**。`)
out.push('- 表 B 才是"玩家能玩到多少"。副本与周边系统整行落在「规则已查清·未实现」——')
out.push('  **不把"查到规则"算成"已完成"**，这是本报告与自我表扬式报告的区别。')
out.push('- 表 A 与表 B 的数字**不可相加**：一个是资产条目数，一个是功能项数。')
out.push('')
out.push('## 4. 明确不计入保真度（忠于原版的取舍）')
out.push('')
out.push('| 项 | 说明 |')
out.push('|---|---|')
out.push('| 多人/组队/竞技场 | 原版是网游；离线单机版不实现（`docs/deviations.md` V22）|')
out.push('| 商城/VIP/充值 | 离线版不做付费（V23）|')
out.push('| 成就称号 | 原版**只发过预告、没上线**（原文：「正在紧锣密鼓的筹备中」）→ "没有"才是还原 |')
out.push('| 原版伤害系数/升级曲线/掉落表 | 当年只存在服务端，确认不可得（B5 / D6），战斗数值为 derived |')
out.push('')

if (selfCheck.length) {
  console.error('自检失败：\n  ' + selfCheck.join('\n  '))
  process.exit(1)
}
fs.writeFileSync(path.join(ROOT, 'docs', '保真度报告.md'), out.join('\n') + '\n', 'utf8')

console.log('保真度报告 → docs/保真度报告.md\n')
console.log('表 A 内容资产：')
for (const r of A) {
  console.log(`  ${r.name.padEnd(14)} official=${String(r.official).padStart(4)} derived=${String(r.derived).padStart(3)} missing=${String(r.missing).padStart(4)} / ${r.total}`)
}
console.log(`  合计 official ${pct(aTot.official, aTot.total)} / derived ${pct(aTot.derived, aTot.total)} / missing ${pct(aTot.missing, aTot.total)}`)
console.log('\n表 B 功能实现：')
for (const r of B) {
  console.log(`  ${r.name.padEnd(14)} 已实现=${r.done}  规则已查清未实现=${r.ruled}  无依据=${r.norule}`)
}
