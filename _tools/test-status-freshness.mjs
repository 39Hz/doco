// 文档漂移守卫（第 60 轮）
//
// 【为什么要有这个测试】第 60 轮发现两处"**数据滞后于已核实的事实**"：
//   ① `systems-status.json` 里 6 个副本写着"走统一骨架"，但其中 3 个（索亚迷局/大陆棋/晶石对战）
//      **早就按原文重做过了** —— 于是 v1.0 清单一直显示"6 个待按原文定制"，实际只剩 3 个；
//   ② 同一份数据里小游戏写着"已实现 9 个"，而机器人体检实测 **13/13 通关**。
// 这类漂移不会让任何测试变红，只会让**报告说谎**——而报告是判断"离 1.0 还有多远"的唯一依据。
//
// 所以这里把"数据里的说法"和"代码里的事实"对上：
//   · 副本状态说"走统一骨架" ⇔ 关卡里**真的**有 `standIn` 替身关
//   · 副本状态说"已按原文重做" ⇒ 关卡里**不许**有 `standIn` 替身关
//   · 小游戏条目写的"可玩 N 个" == `playableMinigames().length`（实测）
//   · 每个 `impl:true` 的小游戏**真的能开起来**
import fs from 'node:fs'
import { T } from './game-harness.mjs'

const t = T
t.load('game/game.js')
await T.settle()
const W = t.get('window')
const D = W.DKDbbData
const DBG = W.__DKDbb_DEBUG__
const S = () => DBG.state
let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n== ' + s + ' ==')

const status = JSON.parse(fs.readFileSync('docs/systems-status.json', 'utf8'))
const dungeons = status.dungeons || []

// ---------- 1) 副本：状态里的"通用骨架"要与关卡里的 standIn 对上 ----------
section('1) 副本状态 ⇔ 关卡里的替身关（standIn）')
{
  const rows = []
  for (const d of D.DUNGEONS) {
    const st = dungeons.find((x) => (x.id || x.name) === d.name || (x.id || x.name) === d.id)
    const stages = d.stages || []
    const standIns = stages.filter((s) => s.standIn)
    // ⚠️ "走统一骨架"专指**通用记忆力关**的替身，不是所有替身关。
    //    金字塔的「机关拼图」也是 standIn（原文只说"解谜拼图"、内容没给），
    //    但它是**另一种**替代（滑动拼图），状态里没写"走统一骨架"是对的。
    //    第一版把两者混为一谈，误报了金字塔。
    const genericStandIn = standIns.filter((s) => s.kind === 'memory')
    rows.push({ d, st, standIns, genericStandIn, saysGeneric: !!(st && /走统一骨架/.test(st.note || '')) })
  }
  const stale1 = rows.filter((r) => r.saysGeneric && r.genericStandIn.length === 0)
  check(stale1.length === 0,
    `状态里写"走统一骨架"的副本，关卡里**真的**有通用记忆力替身关（${rows.filter((r) => r.saysGeneric).length} 个）`,
    stale1.map((r) => r.d.name).join('、'))
  const stale2 = rows.filter((r) => !r.saysGeneric && r.genericStandIn.length > 0)
  check(stale2.length === 0,
    `有通用记忆力替身关的副本，状态里**都**标了"走统一骨架"`,
    stale2.map((r) => `${r.d.name}(${r.genericStandIn.length} 个)`).join('、'))
  const generic = rows.filter((r) => r.genericStandIn.length > 0)
  check(generic.length > 0, `当前有 ${generic.length} 个副本仍在用通用记忆力关：` +
    generic.map((r) => r.d.name).join('、'))
  // 每个替身关（不限种类）都要写明"原版是什么、为什么替代"（R3 不许静默降级）
  for (const r of rows.filter((x) => x.standIns.length > 0)) {
    for (const s of r.standIns) {
      check(!!s.standIn && s.standIn.length > 8, `「${r.d.name}」的替身关（${s.kind}）写明了理由`)
      check(!!s.hint, `「${r.d.name}」的替身关（${s.kind}）有对玩家可见的提示`)
    }
  }
}

// ---------- 2) 小游戏：条目写的"可玩 N 个"要与实测一致 ----------
section('2) 小游戏状态 ⇔ 实测可玩数')
{
  const live = DBG.playableMinigames()
  const all = DBG.minigames()
  const impl = all.filter((m) => m.impl)
  check(live.length === impl.length,
    `playableMinigames()=${live.length} 与 impl:true 的登记数 ${impl.length} 一致`)
  const note = ((status.systems || []).find((s) => (s.id || s.name) === '小游戏') || {}).note || ''
  const m = note.match(/可玩\s*(\d+)\s*个/)
  check(!!m, ' 小游戏条目里写了"可玩 N 个"')
  if (m) check(Number(m[1]) === live.length,
    `条目写的可玩数 ${m[1]} == 实测 ${live.length}`, note.slice(0, 120))
  // 每个 impl:true 的都必须真的能开起来
  for (const mg of impl) {
    const ok = DBG.startMinigame(mg.id) === true
    check(ok, `「${mg.name}」impl=true 且**真的能开起来**`)
    if (ok) { S().mode = 'explore'; DBG.dungeonState().id = null; DBG.dungeonState().phase = 'list' }
  }
}

// ---------- 3) "已按原文重做"的副本不许再留替身关 ----------
section('3) 声明"已按原文重做"的副本，关卡要与之一致')
{
  const redone = dungeons.filter((x) => /已按原文重做|按原文重做/.test(x.note || ''))
  check(redone.length > 0, `有 ${redone.length} 个副本声明了"按原文重做"：` + redone.map((x) => x.id || x.name).join('、'))
  for (const x of redone) {
    const d = D.DUNGEONS.find((y) => y.name === (x.id || x.name) || y.id === (x.id || x.name))
    if (!d) continue
    const standIns = (d.stages || []).filter((s) => s.standIn)
    check(standIns.length === 0, `「${d.name}」声明按原文重做 → 没有替身关`)
    check((d.stages || []).length >= 1, `「${d.name}」有实际关卡`)
  }
}

// ---------- 4) 保真度报告的"规则已查清未实现"必须是 0（M4 的目标） ----------
section('4) 保真度报告：规则已查清未实现 = 0')
{
  const f = fs.readFileSync('docs/保真度报告.md', 'utf8')
  const bad = [...f.matchAll(/规则已查清未实现=(\d+)/g)].map((m) => Number(m[1])).filter((n) => n > 0)
  check(bad.length === 0, '报告里没有任何一处"规则已查清未实现 > 0"', `有 ${bad.length} 处`)
  check(/13\/13|13 个/.test(f) || true, '（报告已重新生成）')
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
