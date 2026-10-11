// 合并两个来源，产出最终技能表。
//
// 来源 A： assets/forms.js 里的 skills 表（17 个）
//          来自原版策划表，是**一手数据**，含： desc / icon / cd / seal / energy / range
//          注意 energy 不是 MP！只有结印技才有值（1 或 2），对应原版的 SP 消耗
//          （官方《结印技能特点》：每个多比最多积累 3 SP）。
// 来源 B： _web/skills.json（85 个，从 7k7k 逐技能详情页解析）
//          含： 属性 / 范围 / 消耗MP / 冷却 / 说明 / 掉落
//
// 合并规则：
//   - 两个来源都有的技能：icon/seal/SP 用 A（一手），MP 用 B（A 没有 MP）
//   - 只有 A 有的（嗜血）：保留
//   - 只有 B 有的（68 个）：用 B，icon 为空
//   - 官方同时给出 cd 时以 A 为准（策划表更权威）
//
// 输出： game/tables/skills-official.js
// 用法： node _tools/merge-skills.mjs
import fs from 'node:fs'

// ---------- 读来源 A ----------
const formsSrc = fs.readFileSync('assets/forms.js', 'utf8')
const jsonText = formsSrc.slice(formsSrc.indexOf('{'), formsSrc.lastIndexOf('}') + 1)
const FORMS = JSON.parse(jsonText)
const A = FORMS.skills || {}
console.log(`来源A（原版策划表）技能 ${Object.keys(A).length} 个`)

// ---------- 读来源 B ----------
const B = JSON.parse(fs.readFileSync('_web/skills.json', 'utf8'))
console.log(`来源B（7k7k 详情页）技能 ${B.length} 个`)

// ---------- 读 B 的推导结果（复用生成器的规则） ----------
const gen = fs.readFileSync('_tools/gen-skills-official.mjs', 'utf8')
// 直接把生成器里的 enrich 逻辑重跑一遍：改为调用生成器产出的 intermediate
// 简单起见：重新 require 生成器不现实（它会写文件），这里内联同一套规则。
const EVIDENCED = {
  平衡风暴: { heal: 0.3, note: '上古技能获得大全：平衡风暴增加血' },
  海市蜃楼: { buff: { eva: 0.5, turns: 3 }, note: '上古技能获得大全：海市蜃楼增加闪避' },
  信标: { buff: { crit: 0.5, turns: 3 }, note: '上古技能获得大全：信标增加暴击' },
  疾风翼: { buff: { spd: 0.3, turns: 3 }, note: '上古技能获得大全：疾风翼增加速度' },
  泼沙: { debuff: { hit: -0.5, turns: 3 }, note: '上古技能获得大全：泼沙有几率令对手降低50%命中率' },
}
function kindOf(desc) {
  if (/精神力技能|魔攻技能/.test(desc)) return 'magic'
  if (/力量型技能/.test(desc)) return 'physical'
  if (/魔武混合/.test(desc)) return 'hybrid'
  if (/辅助技能/.test(desc)) return 'support'
  return 'attack'
}
const RANGE = { 单体: 0, 全体: 2 }
const ELEM_ONE = { 火: '火', 水: '水', 土: '土', 风: '风', 光: '光', 暗: '暗', 毒: '毒' }
const pct = (d, re) => { const m = d.match(re); return m ? Number(m[1]) / 100 : null }

function enrichB(s, cdOverride) {
  const mp = s.mp == null ? 0 : s.mp
  const cd = cdOverride != null ? cdOverride : (s.cooldown == null ? 0 : s.cooldown)
  const range = RANGE[s.range] != null ? RANGE[s.range] : 0
  const desc = s.desc || ''
  const kind = kindOf(desc)
  const isSeal = mp === 0 && cd >= 4
  let power = (0.75 + mp / 40) * (1 + cd * 0.06) * (range === 2 ? 0.7 : 1)
  if (isSeal) power *= 3.0
  power = Math.round(power * 100) / 100
  const o = {
    cd, mp, range, power,
    element: ELEM_ONE[s.element] || null,
    kind, sealAuto: isSeal, desc,
    official: '7k7k', src: s.src,
    drop: [s.dropScene, s.dropMonster].filter(Boolean).join(' '),
  }
  const ev = []
  if (/清除敌人身上的增益/.test(desc)) { o.purge = true; ev.push('原文：清除敌人身上的增益状态') }
  else if (/移除|解除|清除/.test(desc) && /负面|异常|状态/.test(desc)) { o.cleanse = true; ev.push('原文：解除负面状态') }
  if (/持续受到伤害|中毒|灼烧|燃烧/.test(desc)) {
    o.dot = { power: Math.round(power * 0.28 * 100) / 100, turns: 3, chance: pct(desc, /(\d+)%持续伤害/) || 1 }
    ev.push('原文：持续伤害')
  }
  if (/麻痹/.test(desc)) { o.paralyze = { chance: pct(desc, /(\d+)%几率麻痹/) || 0.3, turns: 2 }; ev.push('原文：麻痹') }
  if (/腐蚀/.test(desc)) { o.corrode = { chance: pct(desc, /(\d+)%腐蚀/) || 0.3, turns: 3 }; ev.push('原文：腐蚀') }
  if (/抵御敌人的物理攻击/.test(desc)) { o.buff = { def: 0.5, turns: 3 }; ev.push('原文：抵御物理攻击') }
  else if (/削弱受到的魔法/.test(desc)) { o.buff = { mdef: 0.5, turns: 3 }; ev.push('原文：削弱受到的魔法') }
  if (/治疗|恢复|抚平伤口|回春|振作/.test(desc) && !/降低|伤害/.test(desc)) {
    o.heal = Math.min(0.5, Math.round((0.2 + mp / 200) * 100) / 100)
    if (kind === 'support') o.power = 0
    ev.push('原文：恢复类')
  }
  if (!o.buff && /提高|提升|增加|强化|加强/.test(desc)) {
    const b = {}
    if (/魔法防御|魔防/.test(desc)) b.mdef = 0.5
    if (/防御/.test(desc)) b.def = 0.5
    if (/攻击力|攻击/.test(desc) || /力量得到强化/.test(desc)) b.atk = 0.3
    if (/速度/.test(desc)) b.spd = 0.3
    if (/命中/.test(desc)) b.hit = 0.3
    if (/生命|血/.test(desc)) b.life = 0.3
    if (Object.keys(b).length) { b.turns = 3; o.buff = b; ev.push('原文：提升类') }
  }
  if (!o.debuff && /降低|减少|削弱|迷住/.test(desc)) {
    const d = {}
    if (/攻击力|攻击/.test(desc)) d.atk = -0.3
    if (/魔防/.test(desc)) d.mdef = -0.3
    if (/防御/.test(desc)) d.def = -0.3
    if (/命中/.test(desc)) d.hit = pct(desc, /降低(\d+)%命中/) ? -pct(desc, /降低(\d+)%命中/) : -0.3
    if (/速度/.test(desc)) d.spd = -0.3
    if (Object.keys(d).length) { d.turns = 3; o.debuff = d; ev.push('原文：降低类') }
  }
  const hard = EVIDENCED[s.name]
  if (hard) { Object.assign(o, hard); ev.push(hard.note) }
  if (kind === 'support' && (o.buff || o.heal || o.cleanse || o.purge) && !/攻击|打击|伤害/.test(desc)) o.power = 0
  if (o.heal) o.power = 0
  o.evidence = ev.join('；')
  return o
}

// ---------- 合并 ----------
const merged = {}
const fromA = []
for (const s of B) {
  const name = s.name.replace(/（超级技能）$/, '')
  const a = A[name]
  if (merged[name]) continue
  const o = enrichB(s, a ? a.cd : null)
  if (a) {
    // 一手数据覆盖
    if (a.desc) o.desc = a.desc
    if (a.icon) o.icon = a.icon
    if (a.range != null) o.range = a.range
    if (a.cd != null) o.cd = a.cd
    o.seal = a.seal ? 1 : 0
    o.sp = a.energy || 0
    o.official = '策划表+7k7k'
    o.evidence = (o.evidence ? o.evidence + '；' : '') + '结印标记与图标来自原版策划表'
    fromA.push(name)
  } else {
    o.seal = o.sealAuto ? 1 : 0
    o.sp = o.seal ? 1 : 0
    delete o.sealAuto
  }
  delete o.sealAuto
  merged[name] = o
}
// A 独有的（例如「嗜血」）补进来
const onlyA = []
for (const [name, a] of Object.entries(A)) {
  if (merged[name]) continue
  onlyA.push(name)
  merged[name] = {
    cd: a.cd != null ? a.cd : 1, mp: 0, range: a.range || 0,
    power: 1.2, element: null, kind: 'attack',
    seal: a.seal ? 1 : 0, sp: a.energy || 0,
    desc: a.desc || '', icon: a.icon || null,
    official: '策划表', evidence: '仅原版策划表有，7k7k 未收录',
  }
}

const names = Object.keys(merged)
const list = (f) => names.filter((n) => f(merged[n]))
console.log(`\n合并后技能 ${names.length} 个（其中 ${fromA.length} 个同时有两种来源，${onlyA.length} 个仅策划表: ${onlyA.join('、')}）`)
console.log(`带官方图标 ${list((s) => s.icon).length} 个`)
console.log(`结印技 ${list((s) => s.seal).length}: ` + list((s) => s.seal).join('、'))
const sps = list((s) => s.seal).map((n) => merged[n].sp)
console.log(`结印技 SP 消耗: ${[...new Set(sps)].sort().join('/')}（官方：每个多比最多积 3 SP）`)
const mps = names.map((n) => merged[n].mp)
console.log(`MP 消耗 ${Math.min(...mps)} ~ ${Math.max(...mps)}；其中 0MP ${list((s) => s.mp === 0).length} 个`)
const elems = {}
for (const n of names) elems[merged[n].element || '无'] = (elems[merged[n].element || '无'] || 0) + 1
console.log('属性分布: ' + JSON.stringify(elems))
if (list((s) => s.icon).length < 17) { console.error('!! 官方图标丢失'); process.exit(1) }
if (!list((s) => s.seal).length) { console.error('!! 没有结印技'); process.exit(1) }
if (merged['多重火球'] && merged['多重火球'].seal !== 1) { console.error('!! 多重火球应为结印技'); process.exit(1) }

const js = `// 本文件由 _tools/merge-skills.mjs 自动生成，请勿手改。
// 合并两个来源：
//   A) assets/forms.js 的 skills 表 —— 原版策划表一手数据，提供 图标 / 结印标记 / SP消耗 / 官方描述
//   B) _web/skills.json —— 7k7k 逐技能详情页解析，提供 属性 / 范围 / MP消耗 / 冷却 / 说明 / 掉落
// 注意：策划表里的 energy 字段【不是 MP】，只有结印技有值（1 或 2），对应结印技的 SP 消耗。
// 每个技能都带 evidence 字段记录判定依据。共 ${names.length} 个。
(function () {
  var D = (typeof window !== 'undefined' ? window : globalThis).DKDbbData
  if (!D) return
  var T = ${JSON.stringify(merged, null, 1)}
  D.OFFICIAL_SKILLS = T
  D.SKILL_NAMES = ${JSON.stringify(names)}
  // 只覆盖同名条目，保留旧表里可能存在的其它技能，避免形态引用了不存在的技能名导致崩溃
  var base = D.SKILLS || {}
  for (var k in T) base[k] = T[k]
  // 旧表字段名兼容：game.js 读的是 energy（当 MP 用），这里统一给 MP
  for (var k2 in base) {
    if (base[k2].mp != null) base[k2].energy = base[k2].mp
    else if (base[k2].energy == null) base[k2].energy = 0
  }
  D.SKILLS = base
})()
`
fs.writeFileSync('game/tables/skills-official.js', js, 'utf8')
console.log(`\n写出 game/tables/skills-official.js  ${(js.length / 1024) | 0} KB`)
console.log('自检通过')
