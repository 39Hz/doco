// 三方合并，产出最终技能表（v3）。
//
// 三个来源，各管一段：
//   A) **原版技能表** `_rar_extracted/VIP技能/VIP技能/多克多比技能.xlsx`（official）
//      名称 / 描述 / 冷却 / 是否结印 / 消耗生命 / 消耗魔法 —— 129 个
//      ★ 描述里每条都写了技能类型，所以 kind 有官方依据（128/129）
//   B) **7k7k 详情页** `_web/skills.json`（community，但页面本身抄的是游戏内说明）
//      属性(元素) / 范围 / 掉落 —— 这是 A 完全没有的字段
//   C) **原版策划表** `assets/forms.js` 的 skills（official）
//      技能图标（17 个）
//
// 官方表没有属性与范围，而这两项战斗要用。对官方独有的技能，
// 从**官方描述原文**里推导（不是凭空猜）：
//   范围：描述里写「所有敌人 / 全体 / 敌方全体」→ 全体
//   属性：描述或名字里出现火/冰/土/风/光/暗/毒的关键词 → 对应属性
// 推导结果逐条写进 evidence 字段，便于复核。
//
// 输出：game/tables/skills-official.js
// 用法： node _tools/merge-skills3.mjs
import fs from 'node:fs'

const OFFICIAL = '_web/official_skills.json'
const SEVEN = '_web/skills.json'
const FORMS_JS = 'assets/forms.js'

for (const p of [OFFICIAL, SEVEN, FORMS_JS]) {
  if (!fs.existsSync(p)) { console.error('缺少 ' + p + (p === OFFICIAL ? '\n（先跑 node _tools/parse-official-table.mjs）' : '')); process.exit(2) }
}

const official = JSON.parse(fs.readFileSync(OFFICIAL, 'utf8'))
const seven = JSON.parse(fs.readFileSync(SEVEN, 'utf8'))
const formsSrc = fs.readFileSync(FORMS_JS, 'utf8')
const FORMS = JSON.parse(formsSrc.slice(formsSrc.indexOf('{'), formsSrc.lastIndexOf('}') + 1))
const planSkills = FORMS.skills || {}

// ---------- 来源 D：7k7k 角色大全的技能图标（第 55 轮新增）----------
// 为什么需要它：来源 C（原版策划表）只覆盖 17 个技能，技能表 136 条里 119 条没有图标。
// 7k7k 角色大全每个技能条目带「技能名称 + 技能属性」，与官方技能表**双重确认**后可用。
// 编号沿用游戏既有规则 `<元素位><三位序号>`：物理 1xxx / 火 2xxx / 水 3xxx / 土 4xxx / 风 5xxx，
// 毒没有既有约定，用 6xxx（光/暗 7k7k 里没有，留空）。
// 注意：本脚本一贯用**相对路径**且未导入 path 模块，保持一致
const SEVEN_ICONS = 'assets/skill-icons-7k7k.json'
const EL_DIGIT = { 物理: 1, 火: 2, 水: 3, 土: 4, 风: 5, 毒: 6 }
const iconBySkill = new Map()
let iconSrcCount = 0
if (fs.existsSync(SEVEN_ICONS)) {
  const m = JSON.parse(fs.readFileSync(SEVEN_ICONS, 'utf8'))
  for (const [name, rec] of Object.entries(m.bySkill || {})) {
    iconBySkill.set(name, rec)
    iconSrcCount++
  }
}

console.log(`来源 A 原版技能表：${official.length} 个（official）`)
console.log(`来源 B 7k7k 详情页：${seven.length} 个（补属性/范围/掉落）`)
console.log(`来源 C 原版策划表：${Object.keys(planSkills).length} 个（补图标）`)
console.log(`来源 D 7k7k 技能图标：${iconSrcCount} 个（补图标）`)

// ---------- 名称别名（官方表里有个别错别字，与 7k7k 的写法不同）----------
// 只用于**关联**两个来源，输出仍用官方写法。每一条都要能对上同一件事。
const ALIAS = {
  海市唇楼: '海市蜃楼',     // 官方表错字「唇」，7k7k 作「蜃」
  拨沙: '泼沙',             // 官方表作「拨」，7k7k 作「泼」
}
const bySeven = new Map()
for (const s of seven) bySeven.set(s.name.replace(/（超级技能）$/, ''), s)

// ---------- 从描述推范围 / 属性 ----------
// 范围：官方描述里写了"所有敌人/全体"就是一招打全部
function deriveRange(name, desc) {
  if (/所有敌人|全体|全部的敌人|敌方全体|所有敌|每个人/.test(desc)) return { range: 2, why: '描述含「全体/所有敌人」' }
  if (/周围|区域|范围内/.test(desc)) return { range: 1, why: '描述含「周围/区域」' }
  return { range: 0, why: '' }
}
// 属性：按关键词判定，顺序即优先级（先看描述再退到名字）
const ELEM_RULES = [
  [/火|炎|焰|燃烧|炙热|烈焰|凤凰|不死鸟/, '火'],
  [/冰|霜|寒|水|潮|海|浪/, '水'],
  [/土|岩|大地|沙|石|尘|山/, '土'],
  [/风|雷|电|飓|旋|气流|音障/, '风'],
  [/光|圣|神圣|光辉/, '光'],
  [/暗|影|吞噬|魔|鬼魅/, '暗'],
  [/毒|蔓|曼陀罗|剧毒/, '毒'],
]
function deriveElement(name, desc) {
  for (const [re, el] of ELEM_RULES) if (re.test(desc)) return { element: el, why: `描述命中「${re.source.split('|')[0]}」等关键词` }
  for (const [re, el] of ELEM_RULES) if (re.test(name)) return { element: el, why: `名字命中「${re.source.split('|')[0]}」等关键词` }
  return { element: null, why: '' }
}

const RANGE_LABEL = ['单体', '范围', '全体']
const pct = (d, re) => { const m = String(d).match(re); return m ? Number(m[1]) / 100 : null }

// 类型判定：官方用词一共五种，任何来源的描述都可以拿来判（只要有原文依据）
// （7k7k 独有的技能也要判 —— 「龙卷火焰」的原文写着"魔攻技能"，一律记 attack 是错的）
function kindFromDesc(desc) {
  if (/精神力技能|魔攻技能/.test(desc)) return { kind: 'magic', why: (desc.match(/精神力技能|魔攻技能/) || [''])[0] }
  if (/力量型技能/.test(desc)) return { kind: 'physical', why: '力量型技能' }
  if (/魔武混合技能/.test(desc)) return { kind: 'hybrid', why: '魔武混合技能' }
  if (/辅助技能/.test(desc)) return { kind: 'support', why: '辅助技能' }
  if (/恢复类技能/.test(desc)) return { kind: 'support', why: '恢复类技能' }
  return { kind: 'attack', why: '' }
}

// ---------- 合并 ----------
const out = {}
const report = { fromB: 0, derivedRange: 0, derivedElement: 0, noElement: [], noRange: [] }
for (const o of official) {
  const b = bySeven.get(o.name) || bySeven.get(ALIAS[o.name])
  const plan = planSkills[o.name]
  const desc = o.desc || (b && b.desc) || ''
  const el = b ? { element: (b.element && b.element !== '无属性') ? b.element : null, why: '7k7k 详情页' } : deriveElement(o.name, desc)
  const rg = b ? { range: ({ 单体: 0, 全体: 2 }[b.range] != null ? { 单体: 0, 全体: 2 }[b.range] : 0), why: '7k7k 详情页' } : deriveRange(o.name, desc)
  if (b) report.fromB++
  else { if (rg.why) report.derivedRange++; if (el.why) report.derivedElement++ }
  if (!el.element) report.noElement.push(o.name)
  if (!b && rg.range === 0 && !rg.why) report.noRange.push(o.name)

  const mp = o.mpCost || 0
  const cd = o.cd || 0
  const range = rg.range
  const isSeal = !!o.seal
  // 倍率：原表没给，按 消耗+冷却+范围 推（基准 10MP/CD0/单体 = 1.0）；
  // 结印技额外 ×3 —— 官方《结印技能特点》："威力远远超出普通技能"
  let power = (0.75 + mp / 40) * (1 + cd * 0.06) * (range === 2 ? 0.7 : 1)
  if (isSeal) power *= 3.0

  const ev = []
  ev.push('名称/描述/冷却/结印/消耗 来自原版技能表')
  if (b) ev.push('属性与范围来自 7k7k 详情页')
  if (el.why && !b) ev.push('属性为推导：' + el.why)
  if (rg.why && !b) ev.push('范围为推导：' + rg.why)
  if (o.kindEvidence) ev.push('类型依据原文「' + o.kindEvidence + '」')
  if (plan && plan.icon) ev.push('图标来自原版策划表')

  const o2 = {
    cd, mp, energy: mp, range,
    power: Math.round(power * 100) / 100,
    element: el.element,
    kind: o.kind,
    seal: isSeal ? 1 : 0,
    sp: isSeal ? 1 : 0,          // 结印技消耗 SP（官方：每个多比最多 3 点）
    desc,
    official: b ? '原版表+7k7k' : '原版表',
    conf: 'official',
    evidence: ev.join('；'),
  }
  // 效果标注：仍从官方描述原文的关键词判定
  if (/持续受到伤害|中毒|灼烧|燃烧|持续伤害/.test(desc)) o2.dot = { power: Math.round(o2.power * 0.28 * 100) / 100, turns: 3, chance: pct(desc, /(\d+)%持续伤害/) || 1 }
  if (/麻痹/.test(desc)) o2.paralyze = { chance: pct(desc, /(\d+)%几率麻痹/) || 0.3, turns: 2 }
  if (/腐蚀/.test(desc)) o2.corrode = { chance: pct(desc, /(\d+)%腐蚀/) || 0.3, turns: 3 }
  if (/吸取.*生命|吸血/.test(desc)) o2.lifesteal = 0.3
  if (/恢复|治疗|回复|疗伤/.test(desc) && !/降低|伤害/.test(desc)) {
    o2.heal = Math.min(0.5, Math.round((0.2 + mp / 200) * 100) / 100)
    if (o2.kind === 'support') o2.power = 0
  }
  if (/提高|提升|增加|强化/.test(desc)) {
    const b2 = {}
    if (/魔法防御|魔防/.test(desc)) b2.mdef = 0.5
    if (/防御/.test(desc)) b2.def = 0.5
    if (/物理攻击|魔法攻击|攻击力/.test(desc)) b2.atk = 0.3
    if (/速度/.test(desc)) b2.spd = 0.3
    if (/命中/.test(desc)) b2.hit = 0.3
    if (Object.keys(b2).length) { b2.turns = 3; o2.buff = b2 }
  }
  if (/降低|减少|削弱/.test(desc)) {
    const d = {}
    if (/物理攻击|攻击力/.test(desc)) d.atk = -0.3
    if (/魔法防御|魔防|魔法攻击/.test(desc)) d.mdef = -0.3
    if (/防御/.test(desc)) d.def = -0.3
    if (/命中/.test(desc)) d.hit = -0.3
    if (/速度|迟缓/.test(desc)) d.spd = -0.3
    if (Object.keys(d).length) { d.turns = 3; o2.debuff = d }
  }
  if (/清除|驱散/.test(desc) && /增益/.test(desc)) o2.purge = true
  else if (/移除|解除|清除/.test(desc) && /负面|异常/.test(desc)) o2.cleanse = true
  if (o2.kind === 'support' && (o2.buff || o2.heal || o2.cleanse || o2.purge) && !/攻击|打击|伤害/.test(desc)) o2.power = 0
  if (plan && plan.icon) o2.icon = plan.icon
  // 来源 D 补图标：**只补空的**，绝不覆盖来源 C（原版策划表）已有的 ——
  // 后者是官方图鉴来源且已核对，7k7k 是社区 wiki，不能静默降级（R1/R9）。
  // ⚠️ 映射里的字段叫 `gameIcon`（不是 `icon`）。第一版写成 `rec.icon`，
  //    结果**静默不生效**：图标数还是 17，却没有任何报错 —— 这类字段名写错只能靠自检抓。
  if (!o2.icon) {
    const rec = iconBySkill.get(o.name) || (ALIAS[o.name] ? iconBySkill.get(ALIAS[o.name]) : null)
    if (rec && rec.gameIcon) {
      o2.icon = rec.gameIcon
      o2.evidence = (o2.evidence ? o2.evidence + '；' : '') + '图标来自 7k7k 角色大全（名称+属性与官方表双重确认）'
    }
  }
  out[o.name] = o2
}

// 7k7k 独有、官方表没有的：保留（它们来自游戏内说明页，不算编造）
const onlySeven = []
for (const s of seven) {
  const n = s.name.replace(/（超级技能）$/, '')
  if (out[n]) continue
  onlySeven.push(n)
  const mp = s.mp == null ? 0 : s.mp
  const cd = s.cooldown == null ? 0 : s.cooldown
  const range = ({ 单体: 0, 全体: 2 }[s.range] != null ? { 单体: 0, 全体: 2 }[s.range] : 0)
  const isSeal = mp === 0 && cd >= 4
  let power = (0.75 + mp / 40) * (1 + cd * 0.06) * (range === 2 ? 0.7 : 1)
  if (isSeal) power *= 3
  const elem = { 火: '火', 水: '水', 土: '土', 风: '风', 光: '光', 暗: '暗', 毒: '毒' }[s.element] || null
  // 7k7k 独有的技能同样按**它自己的描述原文**判类型（有依据就标，没有才留中性）
  const kd = kindFromDesc(s.desc || '')
  out[n] = {
    cd, mp, energy: mp, range, power: Math.round(power * 100) / 100, element: elem,
    kind: kd.kind, seal: isSeal ? 1 : 0, sp: isSeal ? 1 : 0,
    desc: s.desc || '', official: '7k7k', conf: 'community',
    evidence: '仅 7k7k 详情页有（原版技能表未收录）' + (kd.why ? `；类型依据原文「${kd.why}」` : ''),
  }
  // 这条分支同样要补图标：这些技能**官方表里没有**（走不到上面那段），
  // 第一版就漏了它们 —— 实测「龙卷火焰」在技能面板里一直显示为空占位。
  {
    const rec = iconBySkill.get(n)
    if (rec && rec.gameIcon) {
      out[n].icon = rec.gameIcon
      out[n].evidence += '；图标来自 7k7k 角色大全'
        + (rec.appended ? '（官方表无此技能 → 追加式编号，不占官方序号位）' : '')
    }
  }
}

// ★ 只有原版策划表有的技能也必须保留 ★
// 实测踩到：策划表里的「嗜血」既不在原版技能表、也不在 7k7k 详情页里，
// 前两轮合并会把它整个丢掉 —— 连带它的官方图标一起消失（图标数从 17 掉到 16）。
// 规则：**任何一个来源有的技能都要留下**，缺的字段留空并标注。
const onlyPlan = []
for (const [n, p] of Object.entries(planSkills)) {
  if (out[n]) continue
  onlyPlan.push(n)
  out[n] = {
    cd: p.cd != null ? p.cd : 1,
    mp: 0, energy: 0,
    range: p.range != null ? p.range : 0,
    power: 1.2,
    element: null,
    kind: 'attack',
    seal: p.seal ? 1 : 0,
    sp: p.energy || 0,
    desc: p.desc || '',
    icon: p.icon || undefined,
    official: '策划表', conf: 'official',
    evidence: '仅原版策划表有（原版技能表与 7k7k 详情页都未收录）',
  }
}

// ★ 结印技必须"远超普通技能"（官方《结印技能特点》原话）★
// 原版技能表的耗魔最高到 100（早期 7k7k 数据只到 60），
// 于是按 mp/cd 推出来的普通技倍率会**盖过**结印技（实测普通 4.23 > 结印 3.33），
// 直接违反官方设定。这里做一次收口：先算出普通技的最高倍率，
// 再把结印技整体抬到它之上（冷却越长抬得越多），保证相对次序不变。
{
  const normalPowers = Object.values(out).filter((s) => !s.seal && s.power > 0).map((s) => s.power)
  const maxNormal = normalPowers.length ? Math.max(...normalPowers) : 1
  for (const s of Object.values(out)) {
    if (!s.seal) continue
    const before = s.power
    s.power = Math.round(maxNormal * (1.15 + (s.cd || 0) * 0.03) * 100) / 100
    s.evidence = (s.evidence ? s.evidence + '；' : '')
      + `倍率收口：结印技必须"远超普通技能"，由普通技最高倍率 ${maxNormal} 反推（原推算值 ${before}）`
  }
}

const names = Object.keys(out)
const list = (f) => names.filter((n) => f(out[n]))
console.log(`\n合并后技能 ${names.length} 个`)
console.log(`  其中 ${report.fromB} 个的属性/范围来自 7k7k，${report.derivedElement} 个属性为推导，${report.derivedRange} 个范围为推导`)
console.log(`  仅 7k7k 有、官方表未收录：${onlySeven.length} 个 → ${onlySeven.join('、')}`)
console.log(`  仅原版策划表有：${onlyPlan.length} 个 → ${onlyPlan.join('、') || '（无）'}`)
const byKind = {}
for (const n of names) byKind[out[n].kind] = (byKind[out[n].kind] || 0) + 1
console.log('  类型分布：' + JSON.stringify(byKind))
console.log(`  官方声明类型的比例：${((names.length - (byKind.attack || 0)) / names.length * 100).toFixed(0)}%`)
console.log(`  带官方图标：${list((s) => s.icon).length} 个`)
console.log(`  结印技：${list((s) => s.seal).length} 个`)
console.log(`  有属性（元素）：${list((s) => s.element).length} 个；无属性：${list((s) => !s.element).length} 个`)
const byElem = {}
for (const n of names) byElem[out[n].element || '无'] = (byElem[out[n].element || '无'] || 0) + 1
console.log('  属性分布：' + JSON.stringify(byElem))
console.log(`  范围为推导且未能判定为全体/范围的（按单体处理）：${report.noRange.length} 个`)

// ---------- 写出 ----------
const js = `// 本文件由 _tools/merge-skills3.mjs 自动生成，请勿手改。
// 主来源：**原版技能表**（从 多比形态素材/技能及说明/VIP技能.rar 解出）
//         _rar_extracted/VIP技能/VIP技能/多克多比技能.xlsx
//         字段：名称/描述/冷却/是否结印/消耗生命/消耗魔法（游戏数据导出格式，official）
// 补充来源：7k7k 逐技能详情页（属性/范围/掉落）、原版策划表（图标）
// 每个技能都带 evidence 字段说明各字段的来路；推导字段已标明"为推导"。
// 共 ${names.length} 个技能。
(function () {
  var D = (typeof window !== 'undefined' ? window : globalThis).DKDbbData
  if (!D) return
  var T = ${JSON.stringify(out, null, 1)}
  D.OFFICIAL_SKILLS = T
  D.SKILL_NAMES = ${JSON.stringify(names)}
  var base = D.SKILLS || {}
  for (var k in T) base[k] = T[k]
  for (var k2 in base) {
    if (base[k2].mp != null) base[k2].energy = base[k2].mp
    else if (base[k2].energy == null) base[k2].energy = 0
  }
  D.SKILLS = base
})()
`
fs.writeFileSync('game/tables/skills-official.js', js, 'utf8')
console.log(`\n写出 game/tables/skills-official.js  ${(js.length / 1024) | 0} KB`)

// ---------- 自检（R5）----------
console.log('\n自检：')
const c1 = names.length >= 125
console.log(`  ${c1 ? '✓' : '✗'} 技能总数 ${names.length}（应 ≥125）`)
const c2 = (byKind.attack || 0) / names.length < 0.2
console.log(`  ${c2 ? '✓' : '✗'} 中性(attack)占比 ${((byKind.attack || 0) / names.length * 100).toFixed(0)}%（应 <20%）`)
const c3 = list((s) => s.seal).length >= 14
console.log(`  ${c3 ? '✓' : '✗'} 结印技 ${list((s) => s.seal).length} 个（应 ≥14）`)
// 结印技必须强过所有普通技（官方原话："威力远远超出普通技能"）
const maxNormal = Math.max(...list((s) => !s.seal && s.power > 0).map((n) => out[n].power))
const minSeal = Math.min(...list((s) => s.seal).map((n) => out[n].power))
const c3b = minSeal > maxNormal
console.log(`  ${c3b ? '✓' : '✗'} 结印技最低倍率 ${minSeal} > 普通技最高 ${maxNormal}（"远超普通技能"）`)
const c3c = list((s) => s.icon).length >= 17
console.log(`  ${c3c ? '✓' : '✗'} 带官方图标 ${list((s) => s.icon).length} 个（应 ≥17，一个都不能丢）`)
const c4 = names.filter((n) => !out[n].desc).length === 0
console.log(`  ${c4 ? '✓' : '✗'} 每个技能都有描述`)
// 正例：新手技能必须在，且类型必须是官方声明过的
const probe = ['重击', '火球'].map((n) => ({ n, k: out[n] && out[n].kind, ok: out[n] && out[n].kind !== 'attack' }))
console.log(`  ${probe.every((p) => p.ok) ? '✓' : '✗'} 正例：${probe.map((p) => `${p.n}=${p.k}`).join('、')}（类型来自官方描述）`)
if (!(c1 && c2 && c3 && c3b && c3c && c4 && probe.every((p) => p.ok))) process.exit(1)
