// M4-4 变身唤醒（官方系统）。
//
// 官方依据：
//   · 7k7k/178924：「每个小多克都有另一种形态，即战斗形态。小多克可以通过**唤醒多比**，
//     战斗时就可以变成该多比咯。唤醒多比：小多克们可以去**宝石大厅**唤醒多比哦。
//     在宝石大厅那里，还有多比的**唤醒条件**~~」
//   · 7k7k/167013：「完成这些小游戏…还有增加多克属性的奖励，包括智慧、勇气和魅力~
//     **这些都是唤醒多比所必不可少的东西**」
//
// **唤醒条件的数值是官方的**：原版策划表 `多比名称和描述.xlsx` 的第 13/14/15 列
// 就是「勇气 / 智慧 / 魅力」。本测试把这几组数值**写死对照**，
// 这样以后谁改了生成脚本、把官方数值弄丢了，会立刻被发现。
import { T } from './game-harness.mjs'

const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
const save = W.DKDbb.save
const D = W.DKDbbData
let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

// ---------- 1) 官方唤醒条件（写死对照） ----------
section('1) 唤醒条件的数值必须是官方表里的（写死对照）')
{
  // 原版策划表「多比名称和描述」第 13/14/15 列 = 勇气 / 智慧 / 魅力
  const OFFICIAL = {
    '费尔·凌 多比': [200, 50, 0],
    '沃特·空 多比': [0, 200, 200],
    '温德·冽 多比': [100, 150, 200],
    '厄斯·垒 多比': [150, 100, 50],
  }
  for (const [name, [c, w, ch]] of Object.entries(OFFICIAL)) {
    const r = DBG().awakenRequire(name)
    check(r && r.courage === c && r.wisdom === w && r.charm === ch,
      `${name} → 勇气 ${c} / 智慧 ${w} / 魅力 ${ch}`,
      r ? `实际 ${r.courage}/${r.wisdom}/${r.charm}` : '取不到')
  }
  // 原表里三项全 0 的是限定版
  check(DBG().awakenRequire('克罗 多比').courage === 0, '克罗 多比 的唤醒条件为 0（初始形态）')
  check(DBG().isAwakenable('克罗 多比') === false, '全 0 的形态不给"免费唤醒"')
  check(DBG().isAwakenable('温德·冽 多比') === true, '有条件的形态可以唤醒')
}

// ---------- 2) 字段名对应（踩过的坑） ----------
section('2) 原表叫 courage，存档里叫 brave —— 必须显式对应')
{
  check(D.REQ_TO_ATTR.courage === 'brave', `courage → ${D.REQ_TO_ATTR.courage}`)
  check(D.REQ_TO_ATTR.wisdom === 'wisdom' && D.REQ_TO_ATTR.charm === 'charm', 'wisdom/charm 同名直通')
  const names = DBG().attrNames()
  check(names.brave === '勇气', `存档字段 brave 显示为「${names.brave}」`)
}

// ---------- 3) 唤醒的判定与扣费 ----------
section('3) 唤醒：条件不足拒绝、够了才扣、不能重复')
{
  const NAME = '费尔·凌 多比'
  save.data.forms = ['克罗 多比', '超级克罗 多比']
  save.data.attrs = { wisdom: 0, brave: 0, love: 0, charm: 0, fame: 0 }
  check((save.data.forms || []).includes(NAME) === false, `先确保还没拥有 ${NAME}`)

  const r0 = DBG().canAwaken(NAME)
  check(r0.ok === false, '条件为 0 时不能唤醒')
  check(/勇气|智慧|魅力/.test(r0.why), `拒绝理由说清了差什么：${r0.why}`)
  check(DBG().awaken(NAME) === false, 'awaken 返回 false')
  check(!save.data.forms.includes(NAME), '失败时不会白送形态')

  const miss0 = DBG().awakenMissing(NAME)
  check(miss0.length === 2, `该形态需要 2 项属性（勇气/智慧），实际 ${miss0.length} 项`)
  check(miss0.every((m) => m.ok === false), '初始都未达标')
  check(miss0.every((m) => m.have === 0 && m.need > 0), '每项都给出 已有/需要')

  // 只补够一项 → 仍不够
  save.data.attrs.brave = 200
  check(DBG().canAwaken(NAME).ok === false, '只满足勇气、智慧还不够 → 仍拒绝')
  save.data.attrs.wisdom = 50
  check(DBG().canAwaken(NAME).ok === true, '两项都够了 → 可以唤醒')

  const before = { brave: save.data.attrs.brave, wisdom: save.data.attrs.wisdom }
  check(DBG().awaken(NAME) === true, '唤醒成功')
  check(save.data.forms.includes(NAME), `形态已入库（${NAME}）`)
  check(save.data.attrs.brave === before.brave - 200, `勇气扣掉 200（${before.brave} → ${save.data.attrs.brave}）`)
  check(save.data.attrs.wisdom === before.wisdom - 50, `智慧扣掉 50（${before.wisdom} → ${save.data.attrs.wisdom}）`)
  check(DBG().awaken(NAME) === false, '同一只不能重复唤醒')
}

// ---------- 4) 属性来源（原文：小游戏给的属性是唤醒多比必不可少的） ----------
section('4) 属性来源：小游戏 + 副本')
{
  const g = DBG().stageGain()
  check(g.memory && g.memory.wisdom > 0, `解谜关给智慧 +${g.memory ? g.memory.wisdom : '?'}`)
  check(g.stealth && g.stealth.brave > 0, `潜行关给勇气 +${g.stealth ? g.stealth.brave : '?'}`)
  check(g.morale && g.morale.charm > 0, `士气关给魅力 +${g.morale ? g.morale.charm : '?'}`)
  // 魅力只能从副本获得（官方硬规则）：三个来源都在副本内的关卡里，符合
  const stageKinds = ['memory', 'stealth', 'morale']
  const charmFrom = Object.entries(g).filter(([, v]) => v.charm).map(([k]) => k)
  check(charmFrom.every((k) => stageKinds.includes(k)), '给魅力的只有副本内的关卡')

  // 真跑一次解谜关，确认智慧真的涨
  save.data.level = 70
  save.data.attrs = { wisdom: 0, brave: 0, love: 0, charm: 0, fame: 0 }
  DBG().enterDungeon('jinzita')
  const st = DBG().dungeonState()
  const w0 = save.data.attrs.wisdom
  let guard = 0
  while (st.phase === 'memory' && guard++ < 6000) {
    if (st.seq.showing) { t.step(1); continue }
    const k = st.seq.show[st.seq.input.length]
    if (!k) { t.step(1); continue }
    t.key(k); t.step(1)
  }
  check(save.data.attrs.wisdom === w0 + g.memory.wisdom, `解谜关通过后智慧 +${save.data.attrs.wisdom - w0}`)
}

// ---------- 5) 界面与入口 ----------
section('5) 界面：H 键 / 宝石大厅的艾伦')
{
  save.data.forms = ['克罗 多比']
  const list = DBG().awakenList()
  check(list.length > 0, `未拥有形态 ${list.length} 只`)
  check(!list.includes('克罗 多比'), '已有形态不出现在唤醒列表')
  const rects = DBG().awakenRects()
  check(rects.length > 0 && rects.every((r) => r.x >= 0 && r.x + r.w <= 960 && r.y >= 0 && r.y + r.h <= 560),
    `列表 ${rects.length} 个矩形都在屏内`)

  S().mode = 'explore'; t.step(2)
  t.key('h'); t.step(2)
  check(S().mode === 'awaken', `按 H 进入唤醒界面（mode=${S().mode}）`)
  t.key('ArrowDown'); t.step(1)
  check(S().mode === 'awaken', '界面内操作不崩')
  t.key('Escape'); t.step(2)
  check(S().mode === 'explore', `Esc 返回（mode=${S().mode}）`)

  // 官方 NPC：艾伦（原文说艾伦在宝石大厅，而宝石大厅正是唤醒的地方）
  const castle = Object.values(S().scenes).find((sc) => sc.island === 'castle' && sc.kind === 'scene')
  S().mode = 'explore'
  DBG().gotoScene(castle.id, 'left'); t.step(3)
  const healer = DBG().spawns.npcs.find((n) => n.heal)
  check(!!healer, `王城有恢复 NPC：${healer ? healer.name : '（无）'}`)
  check(healer && healer.name === '艾伦', '用的官方 NPC 名「艾伦」（原文：宝石大厅的艾伦）')
}

console.log(`\n结果: 通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
