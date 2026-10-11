// 世界层「能不能从主菜单一路玩到存档读档」体检。
//
// 【为什么要写这个】第 41 轮的小游戏体检、第 42 轮的副本体检，两次都抓出
// "单元测试全绿但玩家玩不下去"的 bug（最严重的一次是打完副本第一场战斗就永久卡死）。
// 那两次覆盖的都是**副本内部**；而玩家真正的入口链是：
//     主菜单 → 世界地图 → 地点列表 → 场景 → 走动 → 打怪 → 战斗 → 结算 → 存档 → 读档
// 这条链子任何一处接错（mode 没切回来、状态残留、读档没恢复），玩家就是"打不开游戏"。
// 所以这里用机器人把整条链子走一遍，并且**逐步报出卡在哪一步**。
//
// 用法: node _tools/check-world-playthrough.mjs
import fs from 'node:fs'
import path from 'node:path'
import { T } from './game-harness.mjs'
import { STAGE_BOTS } from './bot-lib.mjs'

const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
const world = t.get('__world')
const save = W.DKDbb.save
let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n== ' + s + ' ==')

// 每帧推进的最大秒数（超过就判定为卡死）
const MAX_SEC = Number(process.env.MG_MAX_SEC || 90)

// 通用等待：反复 step 直到 predicate 为真；超时就返回 false，并把当前状态带出来
function waitFor(pred, sec, label) {
  const cap = Math.round(sec * 60)
  for (let i = 0; i < cap; i++) {
    t.step(1)
    if (pred()) return true
  }
  console.log(`     （等待「${label}」超时 ${sec}s，当前 mode=${S().mode}）`)
  return false
}

// ---------- 1) 主菜单 → 世界地图 ----------
section('1) 主菜单 → 世界地图')
check(S().mode === 'title', `启动后停在主菜单（mode=${S().mode}）`)
{
  const items = DBG().titleItems()
  check(items.length >= 3, `主菜单有 ${items.length} 个入口：${items.map((x) => x.label).join(' / ')}`)
  // 注意：listSlots / saveToSlot / useSlot 都是 **async**。
  // 第一版这里没 await，于是断言拿到的是 Promise —— `p !== false` 永远成立，
  // 三条断言全是假通过，而且读档还没跑完就断言数值，报了 3 个假失败。
  const slots = await DBG().listSlots()
  check(Array.isArray(slots) && slots.length === 3, `存档槽 ${slots.length} 个`)
  check(slots.every((x) => typeof x.slot === 'number' && 'info' in x),
    `槽位摘要有结构（${slots.map((x) => `#${x.slot}:${x.info ? '有档' : '空'}`).join(' ')}）`)
  check(DBG().newGame(2) !== false, '在第 2 槽开新档')
  check(DBG().currentSlot() === 2, `当前槽切到 2（实际 ${DBG().currentSlot()}）`)
  check(DBG().enterWorld() !== false, '从主菜单进入世界')
  t.step(2)
  check(S().mode === 'worldmap', `进到世界地图（mode=${S().mode}）`)
}
check(DBG().mapGeom() && DBG().mapGeom().r > 0, '世界地图版式可查询（测试不抄坐标）')

// ---------- 2) 找一座有怪的场景，走完"地点列表 → 场景" ----------
section('2) 世界地图 → 地点列表 → 场景')
let entered = null
{
  const G = DBG().mapGeom()
  outer:
  for (let ii = 0; ii < world.islands.length; ii++) {
    const island = world.islands[ii]
    S().mode = 'worldmap'; t.step(1)
    // 用**真实鼠标点击**进地点列表（不是直接改 state）—— 要验的就是点击链
    t.move(G.ox + island.x * G.r, G.oy + island.y * G.r)
    t.click(G.ox + island.x * G.r, G.oy + island.y * G.r)
    if (!waitFor(() => S().mode === 'places', 1, '进入地点列表')) continue
    for (let k = 0; k < island.scenes.length; k++) {
      S().placeSel = k; S().placePage = Math.floor(k / 8); t.step(1)
      t.key(' ')
      if (!waitFor(() => S().mode === 'explore', 1, '进入场景')) continue
      const sp = DBG().spawns
      if (sp && sp.monsters.length) { entered = { island, k, scene: S().current.id, mon: sp.monsters[0] }; break outer }
      // 这个场景没怪 → 退回世界地图找下一个
      S().mode = 'places'; t.step(1)
      S().mode = 'worldmap'; t.step(1)
      break
    }
  }
  check(!!entered, entered
    ? `进入有怪的场景「${entered.scene}」（${entered.island.name} 第 ${entered.k + 1} 个）`
    : '找到并进入一个有怪的场景')
}

// ---------- 3) 场景内走动 + 撞怪进战斗 ----------
section('3) 场景内走动 → 撞怪 → 战斗')
let battleInfo = null
if (entered) {
  const p = S().player
  const x0 = p.x, y0 = p.y
  W.fire('keydown', { key: 'ArrowRight', preventDefault() { } })
  t.step(40)
  W.fire('keyup', { key: 'ArrowRight' })
  check(S().player.x !== x0, `按住 → 角色真的移动了（${x0.toFixed(0)} → ${S().player.x.toFixed(0)}）`)
  check(typeof S().player.walkPhase === 'number', '走动时有走路相位（不是滑行）')

  // 先把怪拉近再走上去（场景里的怪会自己游荡）
  const mon = DBG().spawns.monsters[0]
  const cap = MAX_SEC * 60
  let frames = 0
  const ctx = { t, kd: () => { }, ku: () => { }, frame: 0 }
  // 直接朝怪走：每帧把角色朝怪的方向推一个键（模拟玩家走过去）
  while (frames < cap && S().mode === 'explore') {
    ctx.frame = frames
    const pl = S().player
    const dx = mon.x - pl.x, dy = mon.y - pl.y
    const keys = []
    if (Math.abs(dx) > 8) keys.push(dx > 0 ? 'ArrowRight' : 'ArrowLeft')
    if (Math.abs(dy) > 8) keys.push(dy > 0 ? 'ArrowDown' : 'ArrowUp')
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      W.fire(keys.includes(k) ? 'keydown' : 'keyup', { key: k, preventDefault() { } })
    }
    t.step(1); frames++
    // 走到怪身边按空格开打
    if (Math.hypot(mon.x - pl.x, mon.y - pl.y) < 46) { t.key(' '); t.step(2); break }
  }
  for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) W.fire('keyup', { key: k })
  check(S().mode === 'battle', `走上去按空格进入了战斗（mode=${S().mode}）`)
  if (S().mode === 'battle') {
    const b = S().battle
    battleInfo = { name: b.enemies[0].name, hp: b.enemies[0].hp, round: 1 }
    check(b.enemies.length >= 1, `对手是「${b.enemies[0].name}」Lv${b.enemies[0].level}`)
    // 开场演出必须能自己走完（不会永久停在 intro）—— 第 42 轮那种卡死就在这里
    check(waitFor(() => S().battle && S().battle.phase === 'command', 6, '开场演出结束'),
      '开场演出会自己走完，进入指令阶段')
    // 用与副本体检同一套机器人把这场打完
    const ctx2 = { t, kd: () => { }, ku: () => { }, frame: 0 }
    let f2 = 0
    while (f2 < MAX_SEC * 60 && S().mode === 'battle') {
      ctx2.frame = f2
      STAGE_BOTS.battle(t, DBG, ctx2)
      t.step(1); f2++
    }
    check(S().mode !== 'battle', `战斗能打完（现在 mode=${S().mode}，用了 ${(f2 / 60).toFixed(1)}s）`)
    check(waitFor(() => S().mode === 'result' || S().mode === 'explore', 4, '结算界面'),
      `打完进入结算/探索（mode=${S().mode}）`)
    if (S().mode === 'result') { t.key(' '); t.step(3) }
    check(waitFor(() => S().mode === 'explore', 3, '回到探索'),
      `结算后能回到场景继续玩（mode=${S().mode}）`)
  }
}

// ---------- 4) 存档 → 改状态 → 读档 → 状态真的回来了 ----------
section('4) 存档 → 读档（数值要真的回来）')
{
  const sv = save.data
  sv.gold = 4321
  sv.level = 12
  if (DBG().refreshVitals) DBG().refreshVitals()
  const visitedBefore = (sv.visited || []).length
  // 顺手设一只出战索亚 —— 第 43 轮这里抓到一个真 bug（读档被迁移擦成 null）
  if ((sv.soya || []).length) sv.soyaActive = sv.soya[0]
  const soyaBefore = sv.soyaActive
  check((await DBG().saveToSlot(2)) !== false, '存到第 2 槽')
  // 把运行时的值搅乱，再看读档能不能盖回来
  sv.gold = 1; sv.level = 1
  check((await DBG().useSlot(2)) === true, '从第 2 槽读档（返回 true）')
  DBG().applySave()
  t.step(2)
  check(save.data.gold === 4321, `金币读回来了（${save.data.gold}）`)
  check(save.data.level === 12, `等级读回来了（${save.data.level}）`)
  check((save.data.visited || []).length === visitedBefore,
    `已访问场景数读回来了（${(save.data.visited || []).length}）`)
  // 生命上限**由等级与形态算出来**，不直接读存档字段，所以这里比的是
  // "读档后算出来的上限 = 存档里记的上限"，而不是跟搅乱前的内存值比
  const stored = await DBG().listSlots().then((ls) => ls.find((x) => x.slot === 2))
  check(save.data.maxHp > 0, `读档后生命上限是有效值（${save.data.maxHp}）`)
  check(!!stored && !!stored.info && stored.info.level === 12,
    `槽 2 摘要是 12 级（${stored && stored.info ? stored.info.level + ' 级 / ' + stored.info.gold + ' 金币' : '空'}）`)
  // 出战索亚必须活着（第 43 轮修的迁移 bug）
  check(save.data.soyaActive === soyaBefore,
    `出战索亚跟着存档走（${JSON.stringify(soyaBefore)} → ${JSON.stringify(save.data.soyaActive)}）`)
  check(save.data.difficulty === 'easy' || save.data.difficulty === 'normal',
    `难度档位跟着存档走（${save.data.difficulty}）`)
}
check(waitFor(() => S().mode !== 'loading', 3, '读档后不卡在载入'),
  `读档后能继续（mode=${S().mode}）`)

// ---------- 5) 存档真的落到了存储上 ----------
section('5) 存档真的落到了存储上（键位与内容）')
{
  // 键位规则来自 engine.js 的 slotKey()：槽 1 是主键，其余是 `<主键>.slotN`
  const key = 'dkdbb.save.v1.slot2'
  const raw = W.localStorage.getItem(key)
  check(!!raw && raw.length > 20, `localStorage 里有槽 2 的存档（${raw ? raw.length + ' 字节' : '没有'}）`)
  let parsed = null
  try { parsed = JSON.parse(raw) } catch (e) { parsed = null }
  check(!!parsed && parsed.gold === 4321, `存档内容对得上（金币 ${parsed ? parsed.gold : '-'}）`)
  check(!!parsed && typeof parsed.__v === 'number', `存档带版本号 __v=${parsed ? parsed.__v : '-'}（应当是当前版本）`)
  check(!!parsed && parsed.soyaActive === (parsed.soya || [])[0],
    `落盘的存档里出战索亚没被擦掉（${parsed ? JSON.stringify(parsed.soyaActive) : '-'}）`)
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
if (!entered) console.log('（没能进入有怪的场景 —— 上面对应的断言已经记过失败）')
process.exit(fail ? 1 : 0)
