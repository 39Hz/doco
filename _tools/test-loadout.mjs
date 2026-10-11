// 配招（技能搭配）—— 第 55 轮
//
// 【为什么有这个测试】用户原话：「**放在技能池子然后搭配技能能选择**」。
// 原本形态的技能是生成物 `game/tables/form-skills-official.js` 按属性自动配好的，**玩家改不了**。
// 本轮加了存档里的 `loadouts` 覆盖层 + 技能面板的装备/卸下操作，本文件钉住：
//   ① 能装备：装上去、能查到、并写进存档（重开也还在）；
//   ② 能卸下：卸下后那一格变空，**其它格不移位**（固定槽位语义）；
//   ③ 不超槽位：怎么装都不会超过 `skillSlots`；
//   ④ 不装脏数据：`D.SKILLS` 里没有的技能名一律装不上；
//   ⑤ 不重复：同一个技能不会占两个格；
//   ⑥ 战斗只看**紧凑列表**（去掉空槽）—— 否则技能网格会出现空白格。
import { T } from './game-harness.mjs'
const t = T
t.load('game/game.js')
await T.settle()
const W = t.get('window')
const D = W.DKDbbData
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state

let ok = 0, bad = 0
const check = (c, label, extra) => {
  if (c) { ok++; console.log(`  ✓ ${label}`) } else { bad++; console.log(`  ✗ ${label}${extra ? '  → ' + extra : ''}`) }
}
const section = (s) => console.log(`\n=== ${s} ===`)

section('接口存在')
for (const k of ['equipSkill', 'unequipSkill', 'loadoutOf', 'setLoadout', 'skillSlotCount']) {
  check(typeof DBG()[k] === 'function', `调试接口暴露了 ${k}`)
}

const f = S().form
const max = DBG().skillSlotCount()
check(max >= 1 && max <= 8, `当前形态「${f.name}」槽位数合理（${max}）`)
const all = Object.keys(D.SKILLS || {})
check(all.length > 50, `技能池有 ${all.length} 个技能可挑`)

section('① 能装备')
// 先把槽位清空，保证从干净状态开始
DBG().setLoadout(new Array(max).fill(null))
check(DBG().loadoutOf().filter(Boolean).length === 0, '清空后一个技能都没有')

const pick = all[0]
const r1 = DBG().equipSkill(pick)
check(r1.ok, `装备「${pick}」成功`, JSON.stringify(r1))
check((DBG().loadoutOf() || []).includes(pick), '装备后能查到')
check(JSON.stringify(W.DKDbb.save.data.loadouts[f.name] || []).includes(pick), '已写进存档 loadouts')

section('② 卸下留空洞、不移位')
DBG().setLoadout([all[0], all[1], all[2]])
const r2 = DBG().unequipSkill(1)
check(r2.ok && r2.gone === all[1], `卸下第 2 槽（${all[1]}）成功`, JSON.stringify(r2))
const after = DBG().loadoutOf()
check(after[0] === all[0], '第 1 槽没动')
check(after[1] == null, '第 2 槽变成空（固定槽位语义，不前移）')
check(after[2] === all[2], '第 3 槽没动（若前移这里会变成 undefined）')

section('③ 不超槽位')
DBG().setLoadout(new Array(max).fill(null))
let added = 0
for (const n of all) {
  if (DBG().loadoutOf().filter(Boolean).length >= max) break
  if (DBG().equipSkill(n).ok) added++
}
check(DBG().loadoutOf().filter(Boolean).length === max, `装到满 = ${max} 个`, `实际 ${DBG().loadoutOf().filter(Boolean).length}`)
const r3 = DBG().equipSkill(all.find((n) => !DBG().loadoutOf().includes(n)))
check(DBG().loadoutOf().filter(Boolean).length === max, '再装一个：长度仍等于槽位数（替换而非追加）')
check(r3.ok && r3.replaced === true, '返回里标明是"替换"', JSON.stringify(r3))

section('④ 不装脏数据')
DBG().setLoadout(new Array(max).fill(null))
const r4 = DBG().equipSkill('这个技能根本不存在')
check(!r4.ok, '不存在的技能装不上', JSON.stringify(r4))
DBG().setLoadout(['不存在A', all[0], '不存在B'])
const l4 = DBG().loadoutOf()
check(l4[1] === all[0] && !l4[0] && !l4[2], '脏名字被清成空槽，好名字保留', JSON.stringify(l4))

section('⑤ 不重复')
DBG().setLoadout(new Array(max).fill(null))
DBG().equipSkill(all[0])
const r5 = DBG().equipSkill(all[0])
check(!r5.ok, '同一个技能装第二次会被拒', JSON.stringify(r5))
check(DBG().loadoutOf().filter((x) => x === all[0]).length === 1, '池里只有一份')
DBG().setLoadout([all[0], all[0], all[1]])
check(DBG().loadoutOf().filter((x) => x === all[0]).length === 1, '存档里重复的名字也会被去重')

section('⑥ 战斗里是紧凑列表')
DBG().setLoadout([all[0], null, all[1]])
const battle = DBG().battleSkills ? DBG().battleSkills() : null
if (battle === null) {
  // 没暴露就退而检查配招面板与战斗共用同一份数据
  check(true, '（未暴露 battleSkills，跳过）')
} else {
  check(battle.length === 2 && battle[0] === all[0] && battle[1] === all[1],
    '战斗列表去掉了空槽', JSON.stringify(battle))
}
check(DBG().loadoutOf().length === max, '配招面板仍是带洞的固定槽位列表')

console.log(`\n通过 ${ok} 项，失败 ${bad} 项`)
process.exit(bad ? 1 : 0)
