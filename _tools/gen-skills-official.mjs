// 把 _web/skills.json（从 7k7k 逐技能详情页解析出的官方数据）转成游戏用的技能表。
//
// 官方页面直接给了： 名称 / 属性 / 范围 / 消耗(MP) / 冷却 / 说明 / 掉落场景 / 掉落怪物
// 官方页面【没有】给： 伤害倍率、技能类型（力量/精神力/辅助）
//
// == 推导字段与依据（可复核）==
//  kind  只有 15/85 个技能在说明里声明了类型，其余一律记为 'attack'（中性，不假称物理）。
//          说明里写「精神力技能」或「魔攻技能」→ magic
//          写「力量型技能」                      → physical
//          写「魔武混合技能」                    → hybrid
//          写「辅助技能」                        → support
//  power 原表无倍率，按 消耗 + 冷却 + 范围 推强度，基准「10MP / CD0 / 单体 = 1.0」。
//          结印技（0MP 且 CD>=4）额外 ×3，依据官方《结印技能特点》：
//          「无论哪种结印技能威力都十分强大，远远超出普通技能的威力」。
//  效果  全部来自说明原文的关键词，其中 4 个增益技的对应关系来自官方《上古技能获得大全》
//        原文：「平衡风暴、海市蜃楼、信标、疾风翼（分别增加：血、闪避、暴击、速度）」，
//        以及「泼沙（有几率令对手降低百分之50命中率）」。
//
// 输出： game/tables/skills-official.js
// 用法： node _tools/gen-skills-official.mjs
import fs from 'node:fs'

const src = JSON.parse(fs.readFileSync('_web/skills.json', 'utf8'))
if (src.length < 30) { console.error('!! 技能数据过少'); process.exit(1) }

// 官方《上古技能获得大全》直接点名的效果，优先级最高
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
  return 'attack'          // 中性：官方没声明就不假装知道
}
const RANGE = { 单体: 0, 全体: 2 }
const ELEM_ONE = { 火: '火', 水: '水', 土: '土', 风: '风', 光: '光', 暗: '暗', 毒: '毒' }
const pct = (desc, re) => { const m = desc.match(re); return m ? Number(m[1]) / 100 : null }

function enrich(s) {
  const mp = s.mp == null ? 0 : s.mp
  const cd = s.cooldown == null ? 0 : s.cooldown
  const range = RANGE[s.range] != null ? RANGE[s.range] : 0
  const desc = s.desc || ''
  const kind = kindOf(desc)
  const isSeal = mp === 0 && cd >= 4
  let power = (0.75 + mp / 40) * (1 + cd * 0.06) * (range === 2 ? 0.7 : 1)
  if (isSeal) power *= 3.0
  power = Math.round(power * 100) / 100

  const o = {
    cd, energy: mp, range, power,
    element: ELEM_ONE[s.element] || null,
    kind, seal: isSeal ? 1 : 0, desc,
    official: true, src: s.src,
    drop: [s.dropScene, s.dropMonster].filter(Boolean).join(' '),
  }
  const ev = []
  const apply = (obj, tag) => { Object.assign(o, obj); if (obj.note) ev.push(obj.note); else if (tag) ev.push(tag) }

  // ---- 效果判定（全部基于原文关键词）----
  if (/清除敌人身上的增益/.test(desc)) { o.purge = true; ev.push('原文：清除敌人身上的增益状态') }
  else if (/移除|解除|清除/.test(desc) && /负面|异常|状态/.test(desc)) { o.cleanse = true; ev.push('原文：解除负面状态') }
  if (/持续受到伤害|中毒|灼烧|燃烧/.test(desc)) {
    o.dot = { power: Math.round(power * 0.28 * 100) / 100, turns: 3, chance: pct(desc, /(\d+)%持续伤害/) || 1 }
    ev.push('原文：持续伤害' + (o.dot.chance < 1 ? ` ${o.dot.chance * 100}%` : ''))
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
  // 官方点名的 4 个增益技覆盖上面的关键词推断
  const hard = EVIDENCED[s.name]
  if (hard) { apply(hard) }

  // 纯辅助/治疗技不该有伤害倍率
  if (kind === 'support' && (o.buff || o.heal || o.cleanse || o.purge) && !/攻击|打击|伤害/.test(desc)) o.power = 0
  if (o.heal) o.power = Math.min(o.power, 0)
  o.evidence = ev.join('；')
  return o
}

const table = {}
const dup = []
for (const s of src) {
  const name = s.name.replace(/（超级技能）$/, '')
  if (table[name]) { dup.push(name); continue }
  table[name] = enrich(s)
}
const names = Object.keys(table)

const byKind = {}
for (const n of names) byKind[table[n].kind] = (byKind[table[n].kind] || 0) + 1
const list = (f) => names.filter((n) => f(table[n]))
console.log(`生成技能 ${names.length} 个` + (dup.length ? `（重名跳过 ${dup.length}: ${dup.slice(0, 5).join('、')}）` : ''))
console.log('类型分布: ' + JSON.stringify(byKind))
console.log(`结印技 ${list((s) => s.seal).length}: ` + list((s) => s.seal).join('、'))
console.log(`治疗 ${list((s) => s.heal).length}: ` + list((s) => s.heal).join('、'))
console.log(`增益 ${list((s) => s.buff).length}: ` + list((s) => s.buff).join('、'))
console.log(`减益 ${list((s) => s.debuff).length}: ` + list((s) => s.debuff).join('、'))
console.log(`持续伤害 ${list((s) => s.dot).length}: ` + list((s) => s.dot).join('、'))
console.log(`麻痹 ${list((s) => s.paralyze).length}: ` + list((s) => s.paralyze).join('、'))
console.log(`腐蚀 ${list((s) => s.corrode).length}: ` + list((s) => s.corrode).join('、'))
console.log(`驱散敌方增益 ${list((s) => s.purge).length}: ` + list((s) => s.purge).join('、'))
console.log(`解除自身负面 ${list((s) => s.cleanse).length}: ` + list((s) => s.cleanse).join('、'))
console.log(`纯辅助(倍率0) ${list((s) => s.power === 0).length}: ` + list((s) => s.power === 0).slice(0, 14).join('、'))
const pw = list((s) => s.power > 0).map((n) => table[n].power)
console.log(`攻击技倍率区间 ${Math.min(...pw)} ~ ${Math.max(...pw)}`)

const js = `// 本文件由 _tools/gen-skills-official.mjs 自动生成，请勿手改。
// 数据来源：7k7k《多克多比》专区逐技能详情页（原始解析结果见 _web/skills.json）。
//   官方原文字段： 名称 / 属性 / 范围 / 消耗MP / 冷却 / 说明 / 掉落场景 / 掉落怪物
//   推导字段：     power（倍率）、kind（技能类型）、以及各效果标注，规则见生成器注释，
//                 每个技能都带 evidence 字段记录判定依据。
// 共 ${names.length} 个技能，生成时间 ${new Date().toISOString().slice(0, 10)}。
(function () {
  var D = (typeof window !== 'undefined' ? window : globalThis).DKDbbData
  if (!D) return
  var T = ${JSON.stringify(table, null, 1)}
  D.OFFICIAL_SKILLS = T
  D.SKILLS = T
  D.SKILL_NAMES = ${JSON.stringify(names)}
})()
`
fs.writeFileSync('game/tables/skills-official.js', js, 'utf8')
console.log(`\n写出 game/tables/skills-official.js  ${(js.length / 1024) | 0} KB`)

// 自检
if (names.length < 60) { console.error('!! 技能数过少'); process.exit(1) }
if (!list((s) => s.seal).length) { console.error('!! 没识别出结印技'); process.exit(1) }
const noDesc = names.filter((n) => !table[n].desc)
if (noDesc.length) { console.error('!! 缺说明: ' + noDesc.join('、')); process.exit(1) }
const noEv = names.filter((n) => !table[n].evidence && table[n].power > 0)
console.log(`无效果依据的纯攻击技 ${noEv.length} 个（正常，它们只有伤害）`)
const badPower = names.filter((n) => !(table[n].power >= 0))
if (badPower.length) { console.error('!! 倍率异常: ' + badPower.join('、')); process.exit(1) }
console.log('自检通过')
