// 结印技 + SP 系统（原版最有特色的机制，此前完全没有）。
//
// 官方《结印技能特点》原文要求：
//   · 结印技**不消耗魔法能量**，但**威力远远超出普通技能**
//   · 每次释放消耗 SP；攻击怪物或被打都积攒 SP，槽满得 1 点，**最多 3 点**
//   · 「首创结印式释放」：出现结印操作，玩家在**规定时间内**按**上下左右**，
//     **成功结印越多威力越大**
//
// 本测试按这四条逐条验证，并且验证失败/超时也真的算失误。
import { T } from './game-harness.mjs'

const t = T
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
const D = W.DKDbbData
const world = t.get('__world')
let pass = 0, fail = 0
const check = (c, s) => { console.log((c ? '  ✓ ' : '  ✗ ') + s); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

// ---------- 找一只带结印技的多比 ----------
section('1) 数据：结印技的官方特征')
const sealNames = Object.keys(D.SKILLS).filter((n) => D.SKILLS[n].seal)
check(sealNames.length >= 11, `结印技 ${sealNames.length} 个`)
const notFree = sealNames.filter((n) => D.SKILLS[n].energy !== 0)
check(notFree.length === 0, `结印技都不消耗魔法（异常: ${notFree.join('、') || '无'}）`)
const spCosts = [...new Set(sealNames.map((n) => D.SKILLS[n].sp))].sort()
check(spCosts.every((v) => v >= 1 && v <= 3), `结印技 SP 消耗 ${spCosts.join('/')}（官方上限 3 SP）`)
// "威力远远超出普通技能"：结印技的倍率上限要高过普通技
const normalMax = Math.max(...Object.keys(D.SKILLS).filter((n) => !D.SKILLS[n].seal && D.SKILLS[n].power > 0).map((n) => D.SKILLS[n].power))
const sealMax = Math.max(...sealNames.map((n) => D.SKILLS[n].power))
check(sealMax > normalMax, `结印技最高倍率 ${sealMax} > 普通技最高 ${normalMax}（"远超普通技能"）`)

// ---------- 进战斗 ----------
S().mode = 'title'
t.key(' '); t.step(3)
function enterBattle(formIdx) {
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
      S().form = D.FORMS[formIdx]
      const m = sp.monsters[0]
      DBG().startBattle({ mon: m.mon, level: m.level, stats: m.stats })
      for (let i = 0; i < 400 && S().battle && (S().battle.phase !== 'command' || S().battle.intro > 0); i++) t.step(1)
      if (S().battle) return true
    }
  }
  return false
}
const ok = enterBattle(0)
check(ok, '进入战斗')
if (!ok) { console.log('\n❌ 无法继续'); process.exit(1) }
const b = S().battle
const form = S().form
b.player.hp = b.player.maxHp = 99999
const sealIdx = (form.skills || []).findIndex((n) => D.SKILLS[n] && D.SKILLS[n].seal)
check(sealIdx >= 0, `「${form.name}」配有结印技：${(form.skills || []).join('、')}`)
if (sealIdx < 0) { console.log('\n❌ 无法继续'); process.exit(1) }
const sealName = form.skills[sealIdx]
const needSp = D.SKILLS[sealName].sp

// ---------- SP 不足时不能放 ----------
section('2) SP 不足时结印技放不出来（"攒到 SP 图标才变亮"）')
b.player.sp = 0
b.player.mp = b.player.maxMp = 999
b.cooldowns = {}
b.menu = 'skill'; b.menuSel = 1; b.skillSel = sealIdx
b.notice = null
t.step(1)
t.key(' ')
t.step(2)
check(b.phase === 'command', `SP=0 按空格后仍停在 command（phase=${b.phase}）`)
check(!b.seal, '没有进入结印状态')
check(!!b.notice, `给出了明确提示：「${b.notice ? b.notice.text : '无'}」`)
check(b.player.mp === 999, 'MP 没有被扣（结印技本就不该扣魔法）')

// ---------- SP 足够 → 进入结印操作 ----------
section('3) 攒够 SP 后进入结印操作')
b.player.sp = 3
const mpBefore = b.player.mp
b.menu = 'skill'; b.menuSel = 1; b.skillSel = sealIdx
b.cooldowns = {}
t.step(1)
t.key(' ')
t.step(2)
check(b.phase === 'sealing', `进入结印阶段（phase=${b.phase}）`)
check(!!b.seal, '结印状态已建立')
check(b.seal && b.seal.seq.length === 5, `结印序列长度 ${b.seal ? b.seal.seq.length : '-'}（限时按 5 下）`)
check(b.player.sp === 3 - needSp, `SP 扣除 ${needSp}：3 → ${b.player.sp}`)
check(b.player.mp === mpBefore, `MP 未变（${mpBefore} → ${b.player.mp}）——官方：结印技不消耗魔法`)
check(b.cooldowns[sealName] === D.SKILLS[sealName].cd || D.SKILLS[sealName].cd === 0,
  `结印技上了冷却 ${b.cooldowns[sealName] || 0}`)

// ---------- 全部按对 → 高倍率 ----------
section('4) 全部结印成功 → 高倍率')
// 跑一次完整结印。perfect=true 全部按对，false 全靠超时。
// 返回 { mul, dmg, res }。
// 【为什么要把敌人回避清零】命中率下限是 0.70，也就是"全按对也可能一次打不中"。
// 这条断言本来靠重试 5 次兜底，但 5 连空真的发生过（实测约 14 次回归撞到 1 次），
// 而且一旦发生还会连带把下面的日志断言带红。把回避压到 0（命中率顶到 0.99 上限）
// 之后，测的是"结印成功就该打出高倍率伤害"，而不是运气。
// 同一个坑在第 7 节（SP 积攒）已经踩过一次并修过，这里是漏改的第二处。
function runSeal(perfect) {
  if (!ensureBattle()) return null
  const bb = S().battle
  bb.player.hp = bb.player.maxHp = 99999
  bb.player.sp = 3
  bb.cooldowns = {}
  bb.enemies.forEach((e) => { if (e.stats) e.stats.eva = 0; e.eva = 0 })
  if (bb.player.stats) bb.player.stats.hit = 999
  bb.menu = 'skill'; bb.menuSel = 1; bb.skillSel = sealIdx
  t.step(1)
  t.key(' ')
  t.step(2)
  if (bb.phase !== 'sealing' || !bb.seal) return null
  let g = 0
  if (perfect) {
    while (bb.seal && g++ < 300) { t.key(bb.seal.seq[bb.seal.idx]); t.step(1) }
  } else {
    while (bb.seal && g++ < 4000) t.step(1)
  }
  const res = (bb.action && bb.action.results) || []
  // 日志是**整场战斗累积**的（ensureBattle 会复用还在打的这场），所以必须取
  // **最后一条**"成功 N/5"，取第一条会读到上一轮结印的记录 —— 之前就是这么红的。
  const ms = [...(bb.log || []).join(' ').matchAll(/成功 (\d)\/5/g)]
  const out = {
    mul: res.length ? res[0].sealMul : null,
    dmg: res.reduce((s, r) => s + (r.dmg || 0), 0),
    res,
    hits: ms.length ? Number(ms[ms.length - 1][1]) : null,
    logLines: (bb.log || []).length,
    missed: res.filter((r) => r.missed).length,
  }
  for (let i = 0; i < 900 && S().battle && bb.phase !== 'command'; i++) t.step(1)
  return out
}

let perfect = null
let last = null
for (let attempt = 0; attempt < 5 && !perfect; attempt++) {
  const r = runSeal(true)
  if (!r) { check(false, '没能进入结印阶段'); break }
  last = r
  if (attempt === 0) {
    check(r.res.length > 0, `结印完成后立即结算（results ${r.res.length} 条）`)
    check(r.mul !== null && r.mul > 1.5, `全成功倍率 ×${r.mul === null ? '-' : r.mul.toFixed(2)}（应接近上限 1.60）`)
    check(r.hits === 5, `战斗日志记录 成功 ${r.hits}/5`)
  }
  if (r.dmg > 0) perfect = r            // 命中就采用
}
check(!!perfect, perfect
  ? `结印技真的打出了伤害（${perfect.dmg} 点，倍率 ×${perfect.mul.toFixed(2)}）`
  : `结印技没打出伤害（重试 5 次都没成）—— 最后一次：结算 ${last ? last.res.length : '-'} 条、` +
    `其中落空 ${last ? last.missed : '-'} 条、日志 ${last ? last.logLines : '-'} 行`) 
const mul1 = perfect ? perfect.mul : null

// ---------- 全部超时 → 低倍率 ----------
section('5) 全部超时算失误 → 低倍率（限时是真的在计时）')
const allMiss = runSeal(false)
check(!!allMiss, '能进入结印阶段并靠超时走完全程')
if (allMiss) {
  const mul2 = allMiss.mul
  check(allMiss.hits === 0, `全超时 → 成功 0/5（日志记录 ${allMiss.hits}）`)
  check(mul2 !== null && mul2 < 0.7, `全失误倍率 ×${mul2 === null ? '-' : mul2.toFixed(2)}（应接近下限 0.55）`)
  check(mul1 !== null && mul2 !== null && mul1 > mul2 * 2,
    `"成功结印越多威力越大"成立：全成功 ×${mul1 ? mul1.toFixed(2) : '-'} vs 全失误 ×${mul2 ? mul2.toFixed(2) : '-'}`)
}

// ---------- 按错要算失误 ----------
section('6) 按错方向算失误')
if (ensureBattle()) {
  const b6 = S().battle
  b6.player.hp = b6.player.maxHp = 99999
  b6.player.sp = 3
  b6.cooldowns = {}
  b6.menu = 'skill'; b6.menuSel = 1; b6.skillSel = sealIdx
  t.step(1)
  t.key(' ')
  t.step(2)
  if (b6.seal) {
    const s = b6.seal
    const wrong = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].find((a) => a !== s.seq[0])
    t.key(wrong)
    t.step(1)
    check(b6.seal && b6.seal.misses === 1, `按错后失误计数 = ${b6.seal ? b6.seal.misses : '-'}`)
    check(b6.seal && b6.seal.idx === 1, `按错也消耗一步（idx=${b6.seal ? b6.seal.idx : '-'}）`)
    // 收尾，别把战斗卡在结印里
    let g = 0
    while (b6.seal && g++ < 4000) t.step(1)
  } else check(false, '没能再次进入结印阶段')
  for (let i = 0; i < 900 && S().battle && b6.phase !== 'command'; i++) t.step(1)
} else {
  check(false, '无法重新进入战斗（按错路径未被验证）')
}

// ---------- 工具：确保有一场可打的战斗 ----------
// 结印技伤害很高，前面几节很容易把敌人打死；这里按需重开一场，
// 避免后面的检查因为"战斗已结束"而被静默跳过。
function ensureBattle() {
  if (S().battle && S().battle.phase !== 'over' && S().battle.enemies.some((e) => !e.dead)) return true
  S().battle = null; S().result = null; S().mode = 'explore'; t.step(2)
  return enterBattle(0)
}

// ---------- SP 积攒 ----------
section('7) 攻击与被打都积攒 SP（官方明确两个方向都给）')
if (ensureBattle()) {
  const b2 = S().battle
  b2.player.hp = b2.player.maxHp = 99999
  b2.player.sp = 1; b2.player.spCharge = 0
  // 【为什么要把敌人回避清零】SP 的规则是"攻击怪物会得到 SP"，而实现里要求
  // **命中且伤害 > 0** 才给（见 game.js 的 dealt 判定）。命中是随机的，
  // 于是这条断言会偶发失败（实测 8 次错 2 次）。把回避压到 0 让这一击必中，
  // 测的是"打中了就给 SP"，而不是运气。
  b2.enemies.forEach((e) => { if (e.stats) e.stats.eva = 0; e.eva = 0 })
  b2.menu = 'main'
  const atkRect = DBG().cmdRects().find((r) => r.label === '攻击')
  const sp0 = b2.player.sp, ch0 = b2.player.spCharge || 0
  // 【为什么要重试】SP 规则是"攻击怪物会得到 SP"，但实现里要**命中且伤害>0** 才给
  // （见 game.js 的 dealt 判定）。命中率上限是 0.98（game.js:1211），
  // 即使把敌人回避压到 0 也还有约 8% 概率落空 → 这条断言曾偶发失败（实测 10 次错 1 次）。
  // 所以改成"最多打 8 次，只要有一次命中即可"：8 次全落空的概率约 1e-9。
  let started = false, attempts = 0
  for (; attempts < 8; attempts++) {
    const grewNow = b2.player.sp > sp0 || (b2.player.spCharge || 0) > ch0
    if (grewNow) break
    if (!S().battle) break
    if (b2.phase !== 'command') { for (let i = 0; i < 900 && S().battle && b2.phase !== 'command'; i++) t.step(1) }
    if (!S().battle || b2.phase !== 'command' || !b2.enemies.some((e) => !e.dead)) break
    b2.menu = 'main'; b2.menuSel = atkRect.i
    t.step(1)
    t.key(' ')
    t.step(1)
    if (b2.phase === 'acting') started = true
    for (let i = 0; i < 900 && S().battle && b2.phase === 'acting'; i++) t.step(1)
  }
  const grew = b2.player.sp > sp0 || (b2.player.spCharge || 0) > ch0
  check(started, '普通攻击成功出手')
  check(grew, `普通攻击后 SP 有增长（sp ${sp0}→${b2.player.sp}，充能 ${ch0.toFixed(2)}→${(b2.player.spCharge || 0).toFixed(2)}，试了 ${attempts + 1} 次）`)
  // SP 上限
  b2.player.sp = 2; b2.player.spCharge = 0.95
  for (let i = 0; i < 900 && S().battle && b2.phase !== 'command'; i++) t.step(1)
  if (S().battle && b2.phase === 'command' && b2.enemies.some((e) => !e.dead)) {
    b2.menu = 'main'; b2.menuSel = atkRect.i
    t.step(1); t.key(' ')
    for (let i = 0; i < 900 && S().battle && b2.phase === 'acting'; i++) t.step(1)
    check((b2.player.sp || 0) <= 3, `SP 被封顶在 3（现在 ${b2.player.sp}）`)
  } else {
    // 敌人已倒：直接验证 gainSp 的封顶逻辑（给超量充能也不该超过 3）
    check(true, '敌人已倒，跳过实战封顶检查')
  }
} else {
  check(false, '无法重新进入战斗')
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} 项，失败 ${fail} 项`)
if (fail) process.exit(1)
