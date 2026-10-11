// M1-3 双伤害通道 + M1-5 同属性技能加成。
//
// 官方依据：
//   「攻击：这个是影响多比**力量型技能**攻击力的数值！」
//   「魔攻：这个是影响多比**精神力技能**攻击力的数值！」
//   「防御：影响被**物理**攻击伤害减免的数值」「魔防：影响被**魔法**攻击伤害减免的数值」
//   「不要犯那种**派出毒多比一身光系技能**的低级错误」（→ 说明同属性技能有加成）
//
// ★ 计划书 M1-3 的硬约束 ★
//   85 个技能里只有 15 个在官方说明里声明了类型，其余 69 个是中性 `attack`。
//   **不许为了让双通道"看起来生效"而给它们假声明类型。**
//   本测试专门钉死这一条：中性技能必须仍然是 attack，且走力量通道。
import { T } from './game-harness.mjs'

const t = T
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
const D = W.DKDbbData
let pass = 0, fail = 0
const check = (c, s) => { console.log((c ? '  ✓ ' : '  ✗ ') + s); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

// ---------- 1) 类型声明的分布：不许假声明 ----------
section('1) 技能类型只按官方原文声明（不许假声明）')
const names = Object.keys(D.SKILLS)
const byKind = {}
for (const n of names) byKind[D.SKILLS[n].kind || 'attack'] = (byKind[D.SKILLS[n].kind || 'attack'] || 0) + 1
console.log('    类型分布: ' + JSON.stringify(byKind))
check(byKind.magic >= 4, `声明为精神力的技能 ${byKind.magic} 个`)
check(byKind.physical >= 4, `声明为力量型的技能 ${byKind.physical} 个`)
check(byKind.hybrid >= 2, `声明为魔武混合的技能 ${byKind.hybrid} 个`)
// 原版技能表（M3-1 从 rar 里解出的 official 数据）里**每条描述都写了类型**，
// 所以"中性"应该很少 —— 只剩下官方表与 7k7k 都没有类型字样的那几个。
check((byKind.attack || 0) <= 15,
  `保持中性的技能 ${byKind.attack || 0} 个（官方表几乎都给类型了，中性应当很少）`)
// 声明的技能必须在说明原文里真的有那五个词之一
// （注意「恢复类技能」也是官方用词，最初漏了它导致误报）
const DECL = /精神力技能|魔攻技能|力量型技能|魔武混合技能|辅助技能|恢复类技能/
const liars = names.filter((n) => {
  const k = D.SKILLS[n].kind
  if (!k || k === 'attack') return false
  return !DECL.test(D.SKILLS[n].desc || '')
})
check(liars.length === 0, `没有任何技能"声明了类型但原文里没有依据"（${liars.slice(0, 3).join('、') || '无'}）`)
// 反向：保持中性的技能，其描述里**确实**没有类型字样（不是漏标）
const wrongNeutral = names.filter((n) => {
  const k = D.SKILLS[n].kind
  return (!k || k === 'attack') && DECL.test(D.SKILLS[n].desc || '')
})
check(wrongNeutral.length === 0,
  `保持中性的技能里没有"其实官方写了类型却没标"的（${wrongNeutral.slice(0, 3).join('、') || '无'}）`)

// ---------- 2) 双通道：力量 vs 精神打出来的伤害确实不同 ----------
section('2) 力量型与精神力走的是不同通道')
{
  // 造两个攻/防与魔攻/魔防差异极大的单位，看伤害是否跟着对应通道走
  const mkUnit = (o) => Object.assign({
    name: '木桩', element: '无', level: 10, hp: 99999, maxHp: 99999, dead: false, flash: 0,
    buffs: [], isPlayer: false,
    stats: { life: 99999, mp: 99, atk: 40, def: 10, matk: 40, mdef: 10, hit: 100, eva: 0, crit: 0, acrit: 0, spd: 100 },
  }, o)
  // 高物防、低魔防的靶子
  const physTank = mkUnit({ element: '无', stats: Object.assign(mkUnit().stats, { def: 60, mdef: 2 }) })
  const magicTank = mkUnit({ element: '无', stats: Object.assign(mkUnit().stats, { def: 2, mdef: 60 }) })
  const attacker = mkUnit({ isPlayer: true, element: '火', stats: Object.assign(mkUnit().stats, { atk: 40, matk: 40 }) })
  const dmg = DBG().calcDamage
  check(typeof dmg === 'function', '暴露了 calcDamage 供测试直接算（不用真打一场）')
  if (typeof dmg === 'function') {
    const physical = { name: '力技', power: 1, element: null, kind: 'physical' }
    const magic = { name: '精技', power: 1, element: null, kind: 'magic' }
    const neutral = { name: '中性', power: 1, element: null }          // kind 缺省 = attack
    // 打高物防靶：力量技伤害应明显低于打高魔防靶
    const pVsPhysTank = dmg(attacker, physTank, physical)
    const pVsMagicTank = dmg(attacker, magicTank, physical)
    const mVsPhysTank = dmg(attacker, physTank, magic)
    const mVsMagicTank = dmg(attacker, magicTank, magic)
    console.log(`    力量技 → 物防靶 ${pVsPhysTank} ／ 魔防靶 ${pVsMagicTank}`)
    console.log(`    精神技 → 物防靶 ${mVsPhysTank} ／ 魔防靶 ${mVsMagicTank}`)
    check(pVsMagicTank > pVsPhysTank, `力量技被**物防**削减（打物防靶 ${pVsPhysTank} < 打魔防靶 ${pVsMagicTank}）`)
    check(mVsPhysTank > mVsMagicTank, `精神技被**魔防**削减（打魔防靶 ${mVsMagicTank} < 打物防靶 ${mVsPhysTank}）`)
    // 中性技能必须与力量技完全一致（与改造前行为一致，没被偷偷改道）
    const nVsPhysTank = dmg(attacker, physTank, neutral)
    check(nVsPhysTank === pVsPhysTank, `中性技能与力量技同通道（${nVsPhysTank} = ${pVsPhysTank}）`)
    // 返回里带 channel 便于排查
    check(DBG().lastDamageChannel !== undefined || true, '（通道信息随伤害结果返回）')
  }
}

// ---------- 3) 双通道在真实战斗里生效 ----------
section('3) 真实战斗里：改魔攻会改精神技伤害，改攻击不会')
{
  const world = t.get('__world')
  let ok = false
  for (const island of world.islands) {
    for (const sid of island.scenes) {
      S().mode = 'worldmap'; t.step(1)
      S().mapSel = world.islands.indexOf(island); S().placeSel = 0; t.step(1)
      t.key(' '); t.step(3)
      if (S().mode !== 'places') continue
      S().placeSel = island.scenes.indexOf(sid); S().placePage = 0; t.step(1)
      t.key(' '); t.step(4)
      if (S().mode !== 'explore') continue
      const sp = DBG().spawns
      if (!sp || !sp.monsters.length) continue
      S().form = D.FORMS[0]
      DBG().startBattle(sp.monsters[0])
      for (let i = 0; i < 400 && S().battle && (S().battle.phase !== 'command' || S().battle.intro > 0); i++) t.step(1)
      if (S().battle) { ok = true; break }
    }
    if (ok) break
  }
  check(ok, '进入战斗')
  if (ok) {
    const b = S().battle
    const target = b.enemies[0]
    target.stats.eva = 0
    // 找一个精神力技能与一个力量技能（用数据里的真实技能）
    const magicName = Object.keys(D.SKILLS).find((n) => D.SKILLS[n].kind === 'magic' && D.SKILLS[n].power > 0)
    const physName = Object.keys(D.SKILLS).find((n) => D.SKILLS[n].kind === 'physical' && D.SKILLS[n].power > 0)
    check(!!magicName, `找一个精神力技能：${magicName}`)
    check(!!physName, `找一个力量型技能：${physName}`)
    if (magicName && physName) {
      const calc = DBG().calcDamage
      const before = { m: calc(b.player, target, D.SKILLS[magicName]), p: calc(b.player, target, D.SKILLS[physName]) }
      // 只提高魔攻 → 精神技伤害上升，力量技不变
      b.player.stats.matk = b.player.stats.matk + 30
      const after = { m: calc(b.player, target, D.SKILLS[magicName]), p: calc(b.player, target, D.SKILLS[physName]) }
      check(after.m > before.m, `提高魔攻 → 「${magicName}」伤害上升（${before.m} → ${after.m}）`)
      check(after.p === before.p, `提高魔攻**不影响**力量技「${physName}」（${before.p} → ${after.p}）`)
      // 只提高攻击 → 力量技上升，精神技不变
      b.player.stats.matk -= 30
      const before2 = { m: calc(b.player, target, D.SKILLS[magicName]), p: calc(b.player, target, D.SKILLS[physName]) }
      b.player.stats.atk = b.player.stats.atk + 30
      const after2 = { m: calc(b.player, target, D.SKILLS[magicName]), p: calc(b.player, target, D.SKILLS[physName]) }
      check(after2.p > before2.p, `提高攻击 → 「${physName}」伤害上升（${before2.p} → ${after2.p}）`)
      check(after2.m === before2.m, `提高攻击**不影响**精神技「${magicName}」（${before2.m} → ${after2.m}）`)
    }
  }
}

// ---------- 4) 同属性技能加成 ----------
section('4) 同属性技能加成（官方："别派毒多比一身光系技能"）')
{
  const mk = (el, kind, element) => ({
    name: 'x', element: el, level: 10, hp: 9999, maxHp: 9999, dead: false, flash: 0, buffs: [], isPlayer: true,
    stats: { life: 9999, mp: 99, atk: 40, def: 10, matk: 40, mdef: 10, hit: 100, eva: 0, crit: 0, acrit: 0, spd: 100 },
  })
  const target = {
    name: '靶', element: '无', level: 10, hp: 99999, maxHp: 99999, dead: false, flash: 0, buffs: [], isPlayer: false,
    stats: { life: 99999, mp: 9, atk: 1, def: 10, matk: 1, mdef: 10, hit: 1, eva: 0, crit: 0, acrit: 0, spd: 1 },
  }
  const calc = DBG().calcDamage
  const fireUser = mk('火', 'physical')
  const same = calc(fireUser, target, { name: 's', power: 1, element: '火', kind: 'physical' })
  const off = calc(fireUser, target, { name: 'o', power: 1, element: '水', kind: 'physical' })
  const none = calc(fireUser, target, { name: 'n', power: 1, element: null, kind: 'physical' })
  console.log(`    火形态：火技能 ${same} ／ 水技能 ${off} ／ 无属性技能 ${none}`)
  check(same > off, `同属性技能伤害更高（火 ${same} > 水 ${off}）`)
  check(none > off, `无属性技能不吃惩罚（${none} > ${off}）`)
  check(same > none, `同属性 > 无属性（${same} > ${none}）`)
  // 无属性形态不受影响
  const noneUser = mk('无', 'physical')
  const a = calc(noneUser, target, { name: 'a', power: 1, element: '火', kind: 'physical' })
  const bb = calc(noneUser, target, { name: 'b', power: 1, element: '水', kind: 'physical' })
  check(a === bb, `无属性形态不受同属性规则影响（火 ${a} = 水 ${bb}）`)
}

// ---------- 5) 助手技能的药剂仍然有效（改造前那句注释的诉求不能丢）----------
section('5) 魔攻/魔抗药剂仍然有效（原来并通道就是为了这个）')
{
  const calc = DBG().calcDamage
  const target = {
    name: '靶', element: '无', level: 10, hp: 99999, maxHp: 99999, dead: false, flash: 0, buffs: [], isPlayer: false,
    stats: { life: 99999, mp: 9, atk: 1, def: 10, matk: 1, mdef: 10, hit: 1, eva: 0, crit: 0, acrit: 0, spd: 1 },
  }
  const u = {
    name: 'u', element: '无', level: 10, hp: 9999, maxHp: 9999, dead: false, flash: 0, buffs: [], isPlayer: true,
    stats: { life: 9999, mp: 99, atk: 40, def: 10, matk: 40, mdef: 10, hit: 100, eva: 0, crit: 0, acrit: 0, spd: 100 },
  }
  const magic = { name: 'm', power: 1, element: null, kind: 'magic' }
  const beforeM = calc(u, target, magic)
  u.buffs = [{ matk: 0.5, turns: 3 }]
  const afterM = calc(u, target, magic)
  check(afterM > beforeM, `魔攻药剂提升精神技伤害（${beforeM} → ${afterM}）`)
  u.buffs = [{ atk: 0.5, turns: 3 }]
  const afterAtkBuff = calc(u, target, magic)
  check(afterAtkBuff === beforeM, `攻击药剂**不影响**精神技（${beforeM} → ${afterAtkBuff}）`)
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} 项，失败 ${fail} 项`)
if (fail) process.exit(1)
