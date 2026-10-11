// 副本「能不能从头打到尾」体检：用机器人把每个可玩副本打一遍，量出耗时与卡点。
//
// 【为什么要写这个】第 41 轮的小游戏体检抓出两个"测试全绿但玩不下去"的 bug。
// 副本比小游戏更复杂（多关卡串联 + 战斗 + 结算），更适合用"真的打一遍"来验。
// 这个脚本会报出：每个副本是否通关、用了多久、以及**卡在哪一关**。
//
// ⚠️ 机器人是机械操作，人类会更强；所以「机器人打不过」= 一定有问题。
//
// 用法: MG_ROUNDS=1 node _tools/check-dungeon-playthrough.mjs
import { T } from './game-harness.mjs'
import { makeInput, STAGE_BOTS, preparePlayer } from './bot-lib.mjs'

const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const D = W.DKDbbData
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
const { kd, ku, allUp } = makeInput(W)
const MAX_SEC = Number(process.env.MG_MAX_SEC || 120)

function playDungeon(d) {
  allUp()
  S().mode = 'explore'
  // 按副本门槛把角色配好（见 bot-lib 的 preparePlayer：不平等的设置会造出假失败）
  preparePlayer(W, DBG, (d.minLevel || 1) + 5)
  if (DBG().enterDungeon(d.id) !== true) return { err: '进不去（玩法无依据）' }
  const seen = []
  let lastPhase = null
  let frames = 0
  const cap = MAX_SEC * 60
  // ⚠️ ctx 必须**整个副本共用一份**：机器人（比如管线关）会把穷举出来的解放进 ctx 里，
  // 每帧新建对象的话它就会每帧重新穷举 26 万次，永远走不到"转那一下"
  //（第一版就是这么写的，战神金刚一直卡在 pipe）。
  const ctx = { t, kd, ku, frame: 0 }
  while (frames < cap) {
    ctx.frame = frames
    const mode = S().mode
    if (mode === 'explore' || mode === 'places') break            // 回到探索 = 打完了
    if (mode === 'result') { t.key(' '); t.step(2); frames += 2; continue }
    const st = DBG().dungeonState()
    const phase = st.phase
    if (phase !== lastPhase) { seen.push(`${phase}${st.idx != null ? '#' + st.idx : ''}`); lastPhase = phase }
    if (mode === 'battle') {
      STAGE_BOTS.battle(t, DBG, ctx)
      t.step(1); frames++
      continue
    }
    if (phase === 'done' || phase === 'fail') break
    const bot = STAGE_BOTS[phase]
    if (bot) bot(t, DBG, ctx)
    t.step(1); frames++
  }
  allUp()
  const st = DBG().dungeonState()
  const out = {
    ok: st.phase === 'done' || S().mode === 'explore',
    phase: st.phase, sec: frames / 60, path: seen.join(' → '),
    cleared: DBG().dungeonClears(d.id),
  }
  S().mode = 'explore'
  st.id = null; st.phase = 'list'
  return out
}

// playableDungeons() 返回的是 **id 数组**（不是对象），名字要从 dungeons() 里查
const ids = DBG().playableDungeons()
const byId = new Map(DBG().dungeons().map((x) => [x.id, x]))
const list = ids.map((id) => Object.assign({ id }, byId.get(id) || { name: id }))
console.log(`副本通关体检：${list.length} 个 × 单局上限 ${MAX_SEC} 秒\n`)
let bad = [], ran = 0
for (const d of list) {
  const r = playDungeon(d)
  if (r.err) { console.log(`  ${(d.name + '          ').slice(0, 11)} ${r.err}`); continue }
  ran++
  const tag = r.ok ? '' : `  ← 卡在 ${r.phase}`
  if (!r.ok) bad.push({ name: d.name, phase: r.phase, path: r.path })
  console.log(`  ${(d.name + '          ').slice(0, 11)} ${r.ok ? '通关' : '未通关'}  ${r.sec.toFixed(1).padStart(6)}s  关卡：${r.path}${tag}`)
}
console.log('')
// 自检（R5）：**一个都没跑成**的时候不许报绿 —— 第一版就是这里漏了，
// 13 个副本全部"进不去"，脚本却打印了"✅ 每个副本都能打通"。
if (!ran) {
  console.log('❌ 一个副本都没跑起来（检查 playableDungeons / enterDungeon 的用法）')
  process.exit(1)
}
if (bad.length) {
  console.log(`❌ ${bad.length} 个副本机器人打不通：`)
  for (const b of bad) console.log(`   · ${b.name} 卡在 ${b.phase}　走过：${b.path}`)
  process.exit(1)
}
console.log(`✅ ${ran} 个可玩副本机器人全部能从头打到尾`)
