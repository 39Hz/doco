// 出手顺序：速度决定谁先进入回合。
//
// 官方依据（7k7k《多克多比属性介绍》原文）：
//   「速度：这个直接影响多比是否能够**快速进入回合**的数值。」
// 改之前是固定"玩家先手，然后所有敌人各打一次"，速度只拿来做伤害浮动 —— 与官方不符。
//
// 本测试证明：序列按速度从高到低排；比玩家快的敌人**真的会先出手**；
// 同速时玩家优先；每回合每个行动者各动一次；麻痹的会被跳过。
import { T } from './game-harness.mjs'

const t = T
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
const D = W.DKDbbData
const world = t.get('__world')
// 全程打开战斗输入的逐帧诊断（这个测试就是来查"空格有没有被接住"的）
t.run('window.__DKDbb_DBG_CMD__ = true')
let pass = 0, fail = 0
const check = (c, s) => { console.log((c ? '  ✓ ' : '  ✗ ') + s); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

// ---------- 进一场战斗（先不推进开场演出） ----------
function startBattle() {
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
      if (S().battle) return true
    }
  }
  return false
}
check(startBattle(), '进入战斗')
if (!S().battle) { console.log('\n❌ 无法继续'); process.exit(1) }
const b = S().battle

// ---------- 1) 序列按速度降序 ----------
section('1) 出手序列按速度从高到低排')
{
  b.player.stats.spd = 150
  b.enemies.forEach((e, i) => { e.stats.spd = 100 - i * 10 })
  const order = DBG().buildTurnOrder(b)
  check(order.length === 1 + b.enemies.length, `序列包含全部行动者（玩家 + ${b.enemies.length} 敌人 = ${order.length}）`)
  let sorted = true
  for (let i = 1; i < order.length; i++) if (order[i - 1].spd < order[i].spd) sorted = false
  check(sorted, `速度降序：${order.map((x) => `${x.side === 'player' ? '玩家' : x.name}(${x.spd})`).join(' > ')}`)
  check(order[0].side === 'player', '玩家最快时排在第一位')
}

// ---------- 2) 同速时玩家优先 ----------
section('2) 同速时玩家优先（避免同配置先手随机）')
{
  b.player.stats.spd = 120
  b.enemies.forEach((e) => { e.stats.spd = 120 })
  const order = DBG().buildTurnOrder(b)
  check(order[0].side === 'player', `同速 120 时玩家仍排第一（${order.map((x) => x.side === 'player' ? '玩家' : x.name).join(' > ')}）`)
}

// ---------- 3) 更快的敌人真的先出手 ----------
section('3) 比玩家快的敌人会**先于玩家**出手')
{
  // 重开一场，避免上一场残留
  S().battle = null; S().result = null; S().mode = 'explore'; t.step(2)
  check(startBattle(), '重新进入战斗')
  const b2 = S().battle
  b2.player.hp = b2.player.maxHp = 99999
  b2.player.stats.spd = 1                      // 玩家慢到极点
  b2.enemies.forEach((e) => { e.stats.spd = 9999; e.hp = e.maxHp = 99999 })
  // 等开场演出结束（结束后才会排第一回合的序列）
  for (let i = 0; i < 400 && S().battle && b2.intro > 0; i++) t.step(1)
  t.step(3)
  const to = DBG().turnOrder
  check(!!to && to.list.length > 0, `开场演出后已排出顺序（${to ? to.list.map((x) => x.side === 'player' ? '玩家' : x.name).join(' > ') : '无'}）`)
  check(to.list[0].side === 'enemy', `第一个行动的是敌人（${to.list[0].side === 'enemy' ? to.list[0].name : '玩家'}）`)
  const enemyFirst = b2.enemyPhase === true || b2.phase === 'acting' || !!b2.action
  check(enemyFirst, `敌人已经先出手了，而不是等玩家先按（enemyPhase=${b2.enemyPhase}, phase=${b2.phase}）`)
  check(b2.phase !== 'command', `此时**没有**把控制权交给玩家（phase=${b2.phase}）`)
}

// ---------- 4) 更快的玩家先手 ----------
section('4) 玩家更快时由玩家先手')
{
  S().battle = null; S().result = null; S().mode = 'explore'; t.step(2)
  check(startBattle(), '再开一场')
  const b3 = S().battle
  b3.player.stats.spd = 9999
  b3.enemies.forEach((e) => { e.stats.spd = 1 })
  for (let i = 0; i < 400 && S().battle && b3.intro > 0; i++) t.step(1)
  t.step(3)
  check(b3.phase === 'command', `控制权直接交给玩家（phase=${b3.phase}）`)
  const to = DBG().turnOrder
  check(to.list[0].side === 'player', `玩家排在第一位（速度 ${to.list[0].spd}）`)
}

// ---------- 5) 每回合每个行动者各动一次 ----------
section('5) 一回合内每个行动者各行动一次')
{
  // 接着第 4 节那场打（玩家最快、正在等我方输入），不重开 ——
  // 重开要走一整套"大地图→地点→场景"，中途还会踩到按键状态的问题，与本节无关。
  const b4 = S().battle
  check(!!b4 && b4.phase === 'command', `续用第 4 节的战斗（phase=${b4 ? b4.phase : '无'}）`)
  b4.player.hp = b4.player.maxHp = 99999
  const nBefore = b4.enemies.filter((e) => !e.dead).length
  // 回合中途补一只敌人：它**不应该**出现在本回合已经排好的序列里（序列是回合开始时定的）
  if (nBefore < 2) {
    const e0 = b4.enemies[0]
    b4.enemies.push(Object.assign({}, e0, { name: e0.name + '·乙', hp: e0.maxHp, maxHp: e0.maxHp, dead: false }))
  }
  b4.player.stats.spd = 9999
  b4.enemies.forEach((e) => { e.stats.spd = 1 })
  const orderNow = DBG().turnOrder
  check(orderNow.list.length === 1 + nBefore,
    `本回合序列仍是回合开始时的样子（${orderNow.list.length} 个，含 ${nBefore} 只敌人）`)

  // 用**鼠标点击**「攻击」格出手（键盘走的是同一条 doCommand，这里避开按键状态干扰）
  const atk = DBG().cmdRects().find((r) => r.label === '攻击')
  let enemyActs = 0, wasEnemyTurn = false
  if (atk) {
    t.move(atk.x + atk.w / 2, atk.y + atk.h / 2); t.step(1)
    t.click(atk.x + atk.w / 2, atk.y + atk.h / 2); t.step(1)
  }
  check(b4.phase === 'acting' || !!b4.action, `点「攻击」出手成功（phase=${b4.phase}）`)
  for (let i = 0; i < 3000 && S().battle && b4.phase !== 'command'; i++) {
    t.step(1)
    const onEnemyTurn = b4.phase === 'acting' && b4.actionSide === 'enemy'
    if (onEnemyTurn && !wasEnemyTurn) enemyActs++
    wasEnemyTurn = onEnemyTurn
  }
  check(S().battle && b4.phase === 'command', `一整轮走完回到玩家输入（phase=${b4.phase}）`)
  console.log(`    [诊断] 一轮结束 round=${b4.round} turnIdx=${b4.turnIdx} 敌人出手次数=${enemyActs}`)
  check(enemyActs >= nBefore, `每只（本回合序列里的）敌人都出手了（${enemyActs} 次 / 应有 ${nBefore} 次）`)
  check(b4.round >= 2, `回合数已推进（round=${b4.round}）`)
  // 新回合的序列应该把新补的那只也算进去
  const orderNext = DBG().turnOrder
  check(orderNext.list.length === 1 + b4.enemies.filter((e) => !e.dead).length,
    `新回合重新排了序列，含新补的敌人（${orderNext.list.length} 个）`)
}

// ---------- 6) 麻痹的敌人被跳过 ----------
section('6) 被静电麻痹的敌人跳过这一回合')
{
  const b5 = S().battle
  b5.player.hp = b5.player.maxHp = 99999
  b5.player.stats.spd = 9999
  b5.enemies.forEach((e) => { e.stats.spd = 1; e.stun = 1 })
  b5.menu = 'main'
  const atk5 = DBG().cmdRects().find((r) => r.label === '攻击')
  const logLen0 = b5.log.length
  const round0 = b5.round || 1
  if (atk5) {
    t.move(atk5.x + atk5.w / 2, atk5.y + atk5.h / 2); t.step(1)
    t.click(atk5.x + atk5.w / 2, atk5.y + atk5.h / 2); t.step(1)
  }
  // 【为什么不写 `phase !== 'command'`】phase 一变回 command 就退出，可能**还有敌人没轮到**，
  // 于是"所有敌人的 stun 都应为 0"会随机失败（这个测试曾经偶发红过一次）。
  // 改成等**整整一回合过去**（b.round 增加），这样每个行动者都确实动过一次。
  for (let i = 0; i < 3000 && S().battle && (b5.round || 1) <= round0; i++) t.step(1)
  const numb = b5.log.slice(logLen0).filter((x) => x.includes('麻痹')).length
  check(numb >= 1, `日志里出现「被静电麻痹，动弹不得」（${numb} 条）`)
  // 只检查还站着的敌人（被打死的不会再有回合）
  const alive5 = b5.enemies.filter((e) => !e.dead)
  check(alive5.length > 0 && alive5.every((e) => e.stun === 0),
    `stun 计数已消耗（全体 ${b5.enemies.map((e) => e.stun).join(',')}；存活 ${alive5.length} 只）`)
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} 项，失败 ${fail} 项`)
if (fail) process.exit(1)
