// 小怪刷新。
//
// 用户要求：「怪物的刷新 —— 打完怪物需要刷新小怪」（不然一张图清完就永远没得打）。
//
// 规则（原版刷新表未留存，本项目自定 → derived）：
//   1) 打死之后**计时刷新**：等 RESPAWN_SEC 秒原地重新出现；
//   2) **重新进图**立刻全部刷新（走到相邻场景再走回来 / 从大地图进来）。
// 本测试把三条路径都跑一遍，并确认"刚打完不会原地立刻复活"。
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
const aliveCnt = () => DBG().spawnState.filter((x) => x.alive).length
// 重要：游戏的时钟是**沙箱里的假时钟**（每 step 前进 16.7ms），
// 和 Node 主进程的 performance.now() 不是同一条时间轴。凡是比较时间都要用这个。
const snow = () => t.get('window').performance.now() / 1000

// 打完一场：把敌人血量压到 1，用正常攻击收掉，让游戏自己走结算流程。
// 不能直接把 hp 置 0 —— checkBattleEnd 只在特定时机调用，强改血量不会触发结算。
function winBattle() {
  const b = S().battle
  if (!b) return false
  b.player.hp = b.player.maxHp = 99999
  for (const e of b.enemies) e.hp = Math.min(e.hp, 1)
  for (let round = 0; round < 30 && S().mode === 'battle'; round++) {
    for (let i = 0; i < 900 && S().battle && b.phase !== 'command'; i++) t.step(1)
    if (!S().battle || b.phase !== 'command') break
    b.menu = 'main'
    const atk = DBG().cmdRects().find((r) => r.label === '攻击')
    if (atk) b.menuSel = atk.i
    t.step(1)
    t.key(' ')
    for (let i = 0; i < 900 && S().battle && b.phase === 'acting'; i++) t.step(1)
  }
  return true
}

// ---------- 找一张有怪的图 ----------
function findSceneWithMonsters() {
  for (const isl of world.islands) {
    for (const sid of isl.scenes) {
      S().mode = 'worldmap'; t.step(1)
      S().mapSel = world.islands.indexOf(isl); S().placeSel = 0; t.step(1)
      t.key(' '); t.step(3)
      if (S().mode !== 'places') continue
      S().placeSel = isl.scenes.indexOf(sid); S().placePage = 0; t.step(1)
      t.key(' '); t.step(4)
      if (S().mode !== 'explore') continue
      if (aliveCnt() > 0) return { isl, sid }
    }
  }
  return null
}

section('1) 刷新机制存在')
check(typeof DBG().refreshSpawns === 'function', '暴露了 refreshSpawns 供界面与测试共用')
check(DBG().respawnSec() > 0, `计时刷新时长 ${DBG().respawnSec()} 秒`)
const found = findSceneWithMonsters()
check(!!found, found ? `找到有怪的图：${found.isl.name} / 场景 ${found.sid}（${aliveCnt()} 只）` : '没找到有怪的图')
if (!found) { console.log('\n❌ 无法继续'); process.exit(1) }

// ---------- 打赢一场 → 该只怪进入刷新计时 ----------
section('2) 打赢一场之后，那只怪进入刷新计时')
{
  const sp = DBG().spawns
  const before = aliveCnt()
  const m = sp.monsters.find((x) => x.alive)
  S().form = D.FORMS[0]
  // 必须传**真实的那只怪对象**（游戏里点怪开战就是这么传的）：
  // b.spawn 就是它，打赢时靠 `b.spawn.alive = false` 把它标成倒下。
  // 传一个 {mon,level,stats} 的副本的话，标记的是副本，场上那只不会消失。
  DBG().startBattle(m)
  for (let i = 0; i < 400 && S().battle && (S().battle.phase !== 'command' || S().battle.intro > 0); i++) t.step(1)
  check(!!S().battle, '进入战斗')
  if (S().battle) {
    winBattle()
    for (let i = 0; i < 300 && S().mode === 'battle'; i++) t.step(1)
    check(S().mode === 'result', `战斗结束并进入结算（mode=${S().mode}）`)
    // 结算 → 回场景
    for (let i = 0; i < 900 && S().mode === 'result'; i++) { t.key(' '); t.step(2) }
    for (let i = 0; i < 300 && S().mode !== 'explore'; i++) t.step(1)
    check(S().mode === 'explore', `回到场景（mode=${S().mode}）`)
    const after = aliveCnt()
    check(after === before - 1, `场上少了一只（${before} → ${after}）`)
    const dead = DBG().spawnState.filter((x) => !x.alive)
    check(dead.length >= 1 && dead.every((x) => x.respawnIn > 0),
      `倒下那只有刷新倒计时（${dead.map((x) => x.respawnIn.toFixed(0) + 's').join(',') || '无'}）`)
    // 关键：刚打完**不能**原地立刻复活
    for (let i = 0; i < 120; i++) t.step(1)
    check(aliveCnt() === after, `刚打完 2 秒内没有原地复活（仍 ${aliveCnt()} 只）`)
  }
}

// ---------- 走出去再进来 → 立刻刷新 ----------
section('3) 走到相邻场景再走回来，小怪立刻刷新')
{
  const ex = DBG().sceneExits()
  if (!ex || (ex.left == null && ex.right == null)) {
    check(false, '这张图没有相邻场景，无法验证（应挑链中间的图）')
  } else {
    const sid = S().current.id
    const to = ex.right != null ? ex.right : ex.left
    const side = ex.right != null ? 'left' : 'right'
    const okGo = DBG().gotoScene(to, side)
    t.step(3)
    check(okGo && S().current.id === to, `走到了相邻场景（${sid} → ${S().current ? S().current.id : '-'}）`)
    const okBack = DBG().gotoScene(sid, ex.right != null ? 'right' : 'left')
    t.step(3)
    check(okBack && S().current.id === sid, `又走了回来（→ ${S().current ? S().current.id : '-'}）`)
    const back = aliveCnt()
    check(back > 0, `回来后小怪已经刷新（${back} 只）`)
    const noTimer = DBG().spawnState.filter((x) => !x.alive)
    check(noTimer.length === 0, `没有残留"还在倒计时"的怪（${noTimer.length} 只）`)
  }
}

// ---------- 计时刷新 ----------
section('4) 待着不动，到点也会刷新')
{
  const sp = DBG().spawns
  const m = sp.monsters.find((x) => x.alive) || sp.monsters[0]
  if (!m) { check(false, '场上没有怪，无法验证计时刷新') } else {
    // 手动标成"刚被打倒、2 秒后刷新"。注意用**沙箱时钟**算这个绝对时间。
    m.alive = false
    m.respawnAt = snow() + 2
    t.step(2)
    const deadBefore = DBG().spawnState.filter((x) => !x.alive).length
    check(deadBefore >= 1, `已标记为倒下，处于倒计时（${deadBefore} 只）`)
    check(DBG().spawnState.filter((x) => !x.alive).every((x) => x.respawnIn > 0),
      `倒计时读数为正（${DBG().spawnState.filter((x) => !x.alive).map((x) => x.respawnIn.toFixed(1)).join(',')}s）`)
    // 推进约 3 秒（每步 16.7ms → 约 180 帧）
    for (let i = 0; i < 200; i++) t.step(1)
    check(aliveCnt() >= 1, `到点自动刷新了（场上 ${aliveCnt()} 只）`)
    check(DBG().spawnState.every((x) => x.alive), '所有怪都回来了')
  }
}

// ---------- 重复刷：刷完还能再打 ----------
section('5) 刷完还能再打（可循环）')
{
  const before = aliveCnt()
  const m = DBG().spawns.monsters.find((x) => x.alive)
  if (!m) { check(false, '没有活怪可打') } else {
    DBG().startBattle(m)
    for (let i = 0; i < 400 && S().battle && (S().battle.phase !== 'command' || S().battle.intro > 0); i++) t.step(1)
    check(!!S().battle, '刷新出来的怪能正常开战（第 2 次）')
    if (S().battle) {
      winBattle()
      for (let i = 0; i < 300 && S().mode === 'battle'; i++) t.step(1)
      for (let i = 0; i < 900 && S().mode === 'result'; i++) { t.key(' '); t.step(2) }
      for (let i = 0; i < 300 && S().mode !== 'explore'; i++) t.step(1)
      check(S().mode === 'explore', `第二次战斗也正常结算（mode=${S().mode}，场上 ${aliveCnt()} 只）`)
      check(aliveCnt() === before - 1, `打完仍然进入刷新流程（${before} → ${aliveCnt()} 只）`)
    }
  }
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} 项，失败 ${fail} 项`)
if (fail) process.exit(1)
