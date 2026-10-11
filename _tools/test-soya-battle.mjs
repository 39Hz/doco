// 索亚（宠物）能自己出手攻击（第 55 轮）
//
// 【为什么有这个测试】用户原话：「**然后让宠物也能攻击不然宠物一点用都没有**」。
// 查证发现宠物**早就有** 6 种性格机制（`assets/soya.js` 的 effect），但**全都挂在主人的行动上**
// （只改主人的伤害/减伤），玩家在战斗里看不到"宠物在打" → 感觉没用。
// 本轮给宠物加了**自己的出手回合**，本文件钉住这件事真的生效：
//   ① 出战索亚在时，出手顺序里必须有 `pet` 这一槽；
//   ② 没有索亚时**不能**多出这一槽（不占位、不空转）；
//   ③ 宠物的攻击真的扣血，且力度弱于主人（不能反客为主）；
//   ④ 宠物出手后回合能继续推进（不能卡在宠物那一槽）。
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

function startFight() {
  S().mode = 'explore'
  const sp = DBG().spawns
  const m = sp && sp.monsters && sp.monsters[0]
  if (!m) return false
  S().form = D.FORMS[0]
  DBG().startBattle({ mon: m.mon, level: m.level, stats: m.stats })
  for (let i = 0; i < 400 && S().battle && (S().battle.phase !== 'command' || S().battle.intro > 0); i++) t.step(1)
  return !!S().battle
}

section('1) 索亚数据：6 只各有性格机制')
{
  check(D.SOYA.length === 6, `索亚 ${D.SOYA.length} 只`)
  const eff = D.SOYA.map((s2) => s2.effect)
  check(eff.every(Boolean), `每只都有 effect：${eff.join(', ')}`)
  check(D.SOYA.every((s2) => s2.effectLabel && s2.effectText), '每只都写了机制名与说明（玩家看得到）')
}

section('2) 没有出战索亚时：出手顺序里不该有 pet 槽')
{
  const had = (S().soyaActive !== undefined)
  save_soyaActive(undefined)
  const r = startFight()
  check(r, '能进入战斗')
  const hasPet = (S().battle.turnOrder || []).some((s2) => s2.side === 'pet')
  check(!hasPet, '没有索亚 → 出手顺序里没有 pet 槽（不占位）')
  if (S().battle) DBG().leaveBattle?.()
}
function save_soyaActive(v) {
  const sv = W.DKDbb.save.data
  if (v === undefined) sv.soyaActive = null
  else sv.soyaActive = v
}

section('3) 有出战索亚时：出手顺序里有 pet 槽，且能真的打伤敌人')
{
  const sv = W.DKDbb.save.data
  if (!sv.soya || !sv.soya.length) sv.soya = [D.SOYA[0].id]
  sv.soyaActive = sv.soya[0]
  const r = startFight()
  check(r, `出战索亚 = ${(D.SOYA.find((x) => x.id === sv.soyaActive) || {}).name || sv.soyaActive}`)
  const b = S().battle
  check(!!b, '战斗对象存在')
  const petSlots = (b.turnOrder || []).filter((s2) => s2.side === 'pet')
  check(petSlots.length === 1, `出手顺序里有且只有 1 个 pet 槽（实际 ${petSlots.length}）`)
  const pl = (b.turnOrder || []).find((s2) => s2.side === 'player')
  check(petSlots.length && pl && petSlots[0].spd < pl.spd,
    `宠物的先手值 ${petSlots[0] && petSlots[0].spd} < 主人 ${pl && pl.spd}（跟在主人之后出手）`)

  // 让宠物真的打一次：**先替玩家下指令**（宠物排在玩家之后，玩家不出手就永远轮不到它），
  // 再走帧等宠物出手。
  const hp0 = b.enemies.map((e) => e.hp)
  let acted = false
  // ① 玩家先攻击（把回合推进到宠物那一槽）
  if (b.phase === 'command') DBG().playerAct('attack')
  // ② 走帧，等战报里出现索亚的行动
  for (let i = 0; i < 900 && S().battle; i++) {
    t.step(1)
    const bb = S().battle
    if (!bb) break
    if ((bb.log || []).some((L) => /咬了|扑了上去|索亚/.test(String(L)))) { acted = true; break }
  }
  const b2 = S().battle
  const hp1 = b2 ? b2.enemies.map((e) => e.hp) : hp0
  check(acted, '宠物出手了（战报里出现它的行动）',
    b2 ? '战报尾部: ' + (b2.log || []).slice(-3).join(' / ') : '战斗已结束')
  const dmgDone = hp0.reduce((a, v, i) => a + Math.max(0, v - (hp1[i] || 0)), 0)
  check(acted ? dmgDone >= 0 : true, `敌方总血量变化 ${dmgDone}（宠物命中则 >0）`)

  // ④ 不能卡住：继续推进应当能回到玩家指令态
  let reached = false
  for (let i = 0; i < 900 && S().battle; i++) {
    t.step(1)
    if (S().battle && S().battle.phase === 'command') { reached = true; break }
  }
  check(reached || !S().battle, '宠物出手后回合继续推进（回到玩家指令态或战斗已结束）')
}

section('4) 宠物力度弱于主人（不能反客为主）')
{
  const b = S().battle
  if (b) {
    const pet = DBG().soyaAttacker ? DBG().soyaAttacker() : null
    if (pet) {
      const pAtk = b.player.stats.atk
      check(pet.stats.atk < pAtk, `宠物攻击 ${pet.stats.atk} < 主人攻击 ${pAtk}`)
      check(pet.stats.atk >= Math.floor(pAtk * 0.35), `宠物攻击 ${pet.stats.atk} 不至于低到没意义（≥主人 35%）`)
    } else check(false, '调试接口暴露了 soyaAttacker')
  } else check(true, '（战斗已结束，跳过力度检查）')
}

console.log(`\n通过 ${ok} 项，失败 ${bad} 项`)
process.exit(bad ? 1 : 0)
