// 共享的战斗模型：从 game/ 与 assets/ 里**真实加载**数据和系数，
// 然后逐字复刻 game/game.js 的伤害公式与速度连击规则。
//
// 为什么要单独抽出来：之前每个平衡脚本都自己抄一份常量和公式，
// 结果 balance-check.mjs 说"66% 胜率"而真机只有 1% —— 工具和游戏各走各的。
// 现在所有平衡工具都 import 这个模块，公式只在这一处复刻；
// game.js 里的公式改了，这里的 FORMULA_TAG 会跟着改，工具会提醒需要同步核对。
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

export const FORMULA_TAG = 'ratio-v1: dmg = 2.0*atk^2/(atk+def); speedMultiplier 1.15/1.30 -> 2/3 hits'

export function loadGame() {
  const sandbox = { window: {}, console, globalThis: null }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  for (const f of ['game/tables/data.js', 'world.js', 'assets/gamedata.js', 'assets/manifest.js', 'assets/forms.js']) {
    vm.runInContext(readFileSync(f, 'utf8'), sandbox, { filename: f })
  }
  const D = sandbox.window.DKDbbData
  const world = sandbox.window.__DKDbb_WORLD__
  const islName = {}
  for (const i of world.islands) islName[i.id] = i.name
  return { D, world, islName }
}

export const DMG_K = 2.0
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

// 与 game.js 的 speedMultiplier 一致
export function speedMultiplier(a, d) {
  const sa = a.spd || 100, sd = d.spd || 100
  if (sa <= sd) return 1
  const ratio = sa / sd
  if (ratio >= 1.30) return 3
  if (ratio >= 1.15) return 2
  return 1
}

export function rawDamage(atk, def) {
  return (DMG_K * atk * atk) / (atk + def)
}

// 与 game.js 的 damage() 一致
export function damage(D, attacker, defender, atkEl, defEl, skill) {
  const el = (skill && skill.element) || atkEl
  const em = D.multiplier(el, defEl)
  const base = skill && skill.power ? attacker.atk * skill.power : attacker.atk
  let dmg = Math.max(1, Math.round(rawDamage(base, defender.def) * em))
  const crit = Math.random() < (attacker.crit || 3) / 100
  if (crit) dmg = Math.round(dmg * 1.7)
  const hitRate = clamp(0.72 + ((attacker.hit || 40) - (defender.eva || 35)) / 200, 0.5, 0.98)
  const missed = Math.random() > hitRate
  return { dmg: missed ? 0 : dmg, crit, missed, em }
}

// 一次普攻（含连击），与 game.js 的 perform(actor,'attack') 一致
export function basicAttack(D, atk, atkEl, def, defEl) {
  const hits = speedMultiplier(atk, def)
  let total = 0, anyCrit = false, landed = 0
  for (let i = 0; i < hits; i++) {
    const r = damage(D, atk, def, atkEl, defEl, null)
    if (r.missed) continue
    total += r.dmg
    landed++
    if (r.crit) anyCrit = true
  }
  return { dmg: total, hits, landed, crit: anyCrit }
}

// 一场单挑。startHp 用于"连续遭遇"。
export function duel(D, form, ps, mon, ms, startHp) {
  const p = { atk: ps.atk, def: ps.def, hit: ps.hit, eva: ps.eva, crit: ps.crit, spd: ps.spd, hp: startHp === undefined ? ps.life : startHp }
  const e = { atk: ms.atk, def: ms.def, hit: ms.hit, eva: ms.eva, crit: ms.crit, spd: ms.spd, hp: ms.life }
  let t = 0
  while (t < 150 && p.hp > 0 && e.hp > 0) {
    t++
    const a = basicAttack(D, p, form.element, e, mon.element)
    e.hp -= a.dmg
    if (e.hp <= 0) break
    const b = basicAttack(D, e, mon.element, p, form.element)
    p.hp -= b.dmg
  }
  return { win: p.hp > 0, hp: Math.max(0, p.hp), turns: t }
}

// 某个形态在某个岛的胜率
export function winRate(D, form, island, playerLv, trials = 300, opts = {}) {
  const ids = D.ISLAND_MONSTERS[island] || []
  if (!ids.length) return null
  const ps = D.statsAtLevel(form.stats, playerLv)
  let win = 0, turns = 0
  for (let i = 0; i < trials; i++) {
    const mon = D.monster(ids[Math.floor(Math.random() * ids.length)])
    const lv = Math.max(1, D.encounterLevel(island, playerLv) + (opts.levelBias || 0))
    const r = duel(D, form, ps, mon, D.monsterAtLevel(mon, lv))
    if (r.win) { win++; turns += r.turns }
  }
  return { win: win / trials, turns: win ? turns / win : 99 }
}
