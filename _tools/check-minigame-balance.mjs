// 小游戏「能不能正常玩」体检：对每个已实现的小游戏跑简单机器人，量出通关率与耗时。
//
// 【为什么要写这个】第 40 轮用户报「王牌大空战出怪量不正常、不能正常游玩」——
// 那是我自己把出怪间隔拍成 0.75 秒造成的，而且**测试全绿**：
// 单元测试能验"机制对不对"，但**验不出"人玩得下去吗"**。
// 这个工具就是补这一层：用机器人真的把每个小游戏打到通关或超时，
// 把"通关率 / 平均耗时 / 卡在哪"量出来。数字难看的就是要改的。
//
// 注意：机器人是**机械操作**，人类玩家会更强，所以：
//   · 机器人 0% 通关 → 一定有问题（人只会更慢/更慌）；
//   · 机器人 100% 且几秒就过 → 可能太简单，但不一定是错。
//
// 用法: node _tools/check-minigame-balance.mjs [每个游戏跑几局=6]
import { T } from './game-harness.mjs'
import { STAGE_BOTS, makeInput } from './bot-lib.mjs'

const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const D = W.DKDbbData
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
const { kd, ku, allUp } = makeInput(W)

// ⚠️ 局数**不能走 argv[2]**：game-harness 把 argv[2] 当项目根目录用
//（传个 "4" 进去它会去找 `4/game.html`）。所以用环境变量：MG_ROUNDS=4 node ...
const ROUNDS = Number(process.env.MG_ROUNDS || 6)
const MAX_SEC = 90        // 单局上限（超过就算"打不完"）

// 通用跑法：每帧给机器人一次决策机会
// ⚠️ ctx 必须**整局共用一份**（不是每帧新建）：有的机器人会把穷举出来的解放进 ctx，
// 每帧新建就会每帧重算（副本体检那边踩过这个坑，一直卡在管线关）。
function play(id, bot, maxSec = MAX_SEC) {
  allUp()
  S().mode = 'explore'
  if (DBG().startMinigame(id) !== true) return { err: '开不起来' }
  const ctx = { t, kd, ku, frame: 0 }
  let frames = 0
  const cap = maxSec * 60
  while (DBG().dungeonState().phase !== 'miniDone' && frames < cap) {
    ctx.frame = frames
    // ⚠️ 机器人要**按当前阶段**取，不能整局死用开局那一个。
    // 【第 58 轮修】小游戏通关后会进**翻牌奖励关**（phase 变成 'flip'），
    // 而死用开局机器人的话，flip 阶段没人操作 → 永远到不了 'miniDone' →
    // 体检把这局记成"打不过"。实测：冲上云霄 10 秒就爬到 50400 分（达标），
    // 却被报成 0/6 —— 卡的不是游戏，是体检脚本自己。
    // 副本体检（check-dungeon-playthrough）本来就是按 phase 取机器人的，这里对齐它。
    const phase = DBG().dungeonState().phase
    const cur = STAGE_BOTS[phase] || bot
    cur(t, DBG, ctx)
    t.step(1)
    frames++
    // 结算画面要按空格离开，否则循环卡住
    if (S().mode === 'result') { t.key(' '); t.step(2) }
  }
  allUp()
  const done = DBG().dungeonState().phase === 'miniDone'
  const r = { done, sec: frames / 60 }
  S().mode = 'explore'
  DBG().dungeonState().id = null
  DBG().dungeonState().phase = 'list'
  return r
}

// ---------- 各小游戏的机器人 ----------
// 【第 44 轮】这里原来**自己复制了一份机器人**（按小游戏 id 索引，约 95 行），
// 与 _tools/bot-lib.mjs 的 STAGE_BOTS（按关卡类型索引）是同一套逻辑的两份实现 ——
// 正是本仓库自己记过的「同一个逻辑复制成两份，就一定会分叉」。
// 现在统一走 bot-lib：小游戏的 kind 本来就是关卡类型，一一对应。
// 好处是以后再加关卡类型，体检**自动**覆盖，不用记得来这里补一份。
function botFor(id) {
  const m = D.minigameById(id)
  return m && m.kind ? STAGE_BOTS[m.kind] : null
}

// ---------- 跑 ----------
// 每个"已实现"的小游戏都要有一个能跑它的机器人。**没有机器人的不许静默跳过**：
// 早先的写法是 `.filter((id) => BOTS[id])`，于是漏了机器人就等于这个游戏悄悄没体检，
// 而输出里看还是一切正常。现在缺机器人就列出来报错（R5：工具要能自证覆盖完整）。
const playable = D.playableMinigames()
const ids = playable.filter((m) => typeof botFor(m.id) === 'function').map((m) => m.id)
const noBot = playable.filter((m) => typeof botFor(m.id) !== 'function')
if (noBot.length) {
  console.log(`❌ 有 ${noBot.length} 个已实现的小游戏没有对应的机器人，等于没体检：`)
  for (const m of noBot) console.log(`   - ${m.name}（kind=${m.kind}，STAGE_BOTS 里没有这个关卡类型）`)
  process.exit(1)
}
console.log(`自动试玩体检：${ids.length} 个小游戏（已实现的全部覆盖）× ${ROUNDS} 局，单局上限 ${MAX_SEC} 秒\n`)
const rows = []
for (const id of ids) {
  const m = D.minigameById(id)
  const bot = botFor(id)
  let win = 0, total = 0, fastest = Infinity
  for (let i = 0; i < ROUNDS; i++) {
    const r = play(id, bot)
    if (r.err) { console.log(`  ${m.name}：${r.err}`); break }
    if (r.done) { win++; total += r.sec; fastest = Math.min(fastest, r.sec) }
  }
  const rate = Math.round(100 * win / ROUNDS)
  rows.push({ name: m.name, id, rate, avg: win ? (total / win) : null, fastest: win ? fastest : null })
  const tag = rate === 0 ? '  ← 机器人一局都赢不了，基本可以断定有问题' : rate === 100 ? '  ← 稳定可过' : ''
  console.log(`  ${(m.name + '          ').slice(0, 12)} 通关 ${String(win).padStart(2)}/${ROUNDS}（${String(rate).padStart(3)}%）`
    + (win ? `  平均 ${(total / win).toFixed(1)}s  最快 ${fastest.toFixed(1)}s` : '') + tag)
}
const bad = rows.filter((r) => r.rate === 0)
console.log('')
if (bad.length) {
  console.log(`❌ ${bad.length} 个小游戏机器人打不过：${bad.map((r) => r.name).join('、')}`)
  process.exit(1)
}
console.log('✅ 每个小游戏机器人都能打通')
