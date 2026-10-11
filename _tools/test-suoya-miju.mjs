// 索亚迷局的三段可玩段落（第 58 轮）
//
// 【官方原文】7k7k/179859《多克多比索亚迷局副本攻略》，11 步全剧情（见 docs/官方资料库.md 16.6）。
// 其中明确写了三处可玩段落，但**只说了"要做什么"、没写"怎么做"**：
//   第 3 步「经过**密林危途小游戏**才可以顺利到达索亚森林！」
//   第 6 步「这个叫**米雅**的索亚还真**难抓**，想要抓到它得费点劲了。」
//   第 9 步「为了解救索亚，众人决定到**变异索亚的根源黑水晶**之处！
//            当然想要达到黑水晶之处**首先要躲开重重陷阱**。」
//
// 所以本文件的判据分两层：
//   ① **存在与顺序**（official）：三段都要在关卡表里，且顺序与剧情一致（3 → 6 → 9）
//   ② **具体玩法**（derived）：必须**标出来**，而且**对玩家可见**（R3：不许静默降级）
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

const d = D.dungeonById('suoyamiju')

// ---------- ① 存在与顺序 ----------
section('① 三段都在，且顺序与剧情一致（第 3 → 6 → 9 步）')
{
  check(!!d, '找得到「索亚迷局」副本')
  const labels = d.stages.map((s) => s.label || '')
  check(labels.some((l) => /密林危途/.test(l)), '有「密林危途」（原文第 3 步）')
  check(labels.some((l) => /米雅/.test(l)), '有「抓捕米雅」（原文第 6 步）')
  check(labels.some((l) => /陷阱/.test(l)), '有「躲开重重陷阱」（原文第 9 步）')
  const iThicket = labels.findIndex((l) => /密林危途/.test(l))
  const iMiya = labels.findIndex((l) => /米雅/.test(l))
  const iTrap = labels.findIndex((l) => /陷阱/.test(l))
  check(iThicket >= 0 && iMiya > iThicket && iTrap > iMiya,
    `顺序是 密林危途(${iThicket}) → 抓捕米雅(${iMiya}) → 躲陷阱(${iTrap})`)
  // 关卡名里带步号，玩家能对上剧情
  check(/第 3 步/.test(labels[iThicket]) && /第 6 步/.test(labels[iMiya]) && /第 9 步/.test(labels[iTrap]),
    '三段的关键字里标了剧情步号')
  // 入口也照原文：遇到咪鲁才能接任务
  check(d.entry && d.entry.npc === '咪鲁', `入口 NPC = ${d.entry && d.entry.npc}（原文：「遇到咪鲁以后就可以接取任务了」）`)
  check(/索亚/.test((d.entry && d.entry.place) || ''), `入口地点 = ${d.entry && d.entry.place}`)
}

// ---------- ② 玩法是 derived，而且标出来了 ----------
section('② 具体玩法没有原文 → 必须标 derived，并对玩家可见')
{
  const three = d.stages.filter((s) => /密林危途|米雅|陷阱/.test(s.label || ''))
  check(three.length === 3, `三段都取到了（${three.length}）`)
  for (const s of three) {
    check(!!s.hint, `「${s.label}」有关卡提示`)
    check(/原文没有|没有原文/.test(s.hint || ''),
      `「${s.label}」的提示里**写明了"玩法原文没有"**（R3 不静默降级）`)
    check(/derived/.test(s.hint || ''), `「${s.label}」标了 derived`)
  }
  check(/derived/i.test(d.derivedNote || ''), '副本自己有一条 derivedNote 说明这三段的来历')
  check(/V79/.test(d.derivedNote || ''), 'derivedNote 里登记了 V 号（V79）')
  // 三段用的都是**已经实现过的**关卡类型（不新造机制）
  const kinds = three.map((s) => s.kind)
  const supported = ['runner', 'catch', 'stealth', 'memory', 'battle', 'boss', 'pipe', 'quiz',
    'shooter', 'morale', 'sumo', 'crystal', 'platformer', 'chargeshooter', 'soar', 'ballpush', 'slide']
  check(kinds.every((k) => supported.includes(k)), `三段用的是已有机制：${kinds.join(' / ')}`)
  check(kinds.every((k) => k !== 'battle' && k !== 'boss'),
    `三段**不是**拿普通战斗糊过去（实际：${kinds.join(' / ')}）`)
}

// ---------- ③ 真的能进、能玩（不是只写在表里） ----------
section('③ 三段都真的能进到对应玩法')
{
  const want = { runner: '密林危途', catch: '抓捕米雅', stealth: '躲开重重陷阱' }
  for (const [kind, name] of Object.entries(want)) {
    // 直接把关卡指针挪到那一段
    S().mode = 'dungeon'
    const st0 = DBG.dungeonState && DBG.dungeonState()
    const idx = d.stages.findIndex((s) => s.kind === kind)
    if (!st0) { check(false, '取不到 dungeonState，无法逐段验证'); continue }
    st0.id = d.id
    st0.idx = idx
    st0.tries = 0
    DBG.startDungeonStage ? DBG.startDungeonStage() : null
    const st = DBG.dungeonState()
    const ok = st.phase === kind || (kind === 'stealth' && st.phase === 'stealth')
    check(ok, `「${name}」进到 phase=${kind}（实际 ${st.phase}）`)
    // 该玩法的状态对象真的建起来了
    const hasState = (kind === 'runner' && !!st.rn) || (kind === 'catch' && !!st.cc) || (kind === 'stealth' && !!st.st)
    check(hasState, `「${name}」的玩法状态建起来了`)
  }
}

// ---------- ④ 机器人体检要能覆盖到这三段 ----------
section('④ 副本"能不能从头打到尾"的体检认得这三段')
{
  const src = fs.readFileSync('_tools/bot-lib.mjs', 'utf8')
  check(/export const STAGE_BOTS/.test(src), '机器人在 _tools/bot-lib.mjs 的 STAGE_BOTS 里')
  // ⚠️ 先查的是 check-dungeon-playthrough.mjs，那里根本没有机器人表（它在 bot-lib.mjs）——
  //    断言写错了文件，报了三处假红。
  for (const k of ['runner', 'catch', 'stealth']) {
    check(new RegExp(`\\n\\s{2}${k}\\(`).test(src), `STAGE_BOTS 里有 ${k} 的机器人`)
  }
  check(/suoyamiju/.test(fs.readFileSync('game/tables/dungeons.js', 'utf8')), '副本表里索亚迷局的 id 没变（suoyamiju）')
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
