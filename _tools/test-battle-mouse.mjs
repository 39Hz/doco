// 战斗界面的鼠标操作：指令方格、技能格、道具格、点敌人换目标。
//
// 【本文件在 2026-09-26 被重写】原版是对着**旧战斗界面**写的：
//   · 写死指令按钮坐标 `bw=108 bh=30 起点 x=20,y=524`
//   · 假设「逃跑」在下标 2、「道具」在下标 3
// 但战斗栏在第 9/11 轮已重做成「底部蓝框 + 六方格 + 大红圆钮」，
// 指令变成 攻击/技能/道具/防御/逃跑 —— 于是这个文件长期失败，
// 又因为它不在手写的回归清单里，一直没人发现（R6 警告的正是这种情况）。
//
// 重写原则：**几何一律向游戏查询**（cmdRects / skillRects / itemRects），
// 测试里不再出现任何写死的界面坐标。
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

// ---------- 进战斗 ----------
function enterBattle() {
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
      const m = sp.monsters[0]
      DBG().startBattle({ mon: m.mon, level: m.level, stats: m.stats })
      for (let i = 0; i < 400 && S().battle && (S().battle.phase !== 'command' || S().battle.intro > 0); i++) t.step(1)
      if (S().battle) return true
    }
  }
  return false
}

const ok = enterBattle()
check(ok, '进入战斗')
if (!ok) { console.log('\n❌ 无法继续'); process.exit(1) }
const b = S().battle
b.player.hp = b.player.maxHp = 99999
b.player.mp = b.player.maxMp = 999
// ⚠️ **敌人也要"打不死"**。这个测试为了验证指令格会**真的点击执行**（点「攻击」就出手），
//    而进入战斗时刷到的是**随机怪**：弱怪会被一击打死 → `phase` 变 `over` →
//    后面"点道具/点防御/换目标"整段全部失效（实测 10 次里偶发 1 次，且只在机器忙时出现，
//    因为忙的时候刷到的怪不同）。玩家早就设了 99999，敌人却漏了 —— 这就是那 4 条偶发红的根因。
//    这样做不影响任何断言：第 2 节判的是"phase 变成 acting **或** 敌人掉血"，敌人活着照样成立。
for (const e of b.enemies) { const hp = Math.max(e.maxHp, 99999); e.hp = e.maxHp = hp }
const waitCmd = (max = 900) => { for (let i = 0; i < max && S().battle && (b.phase !== 'command' || b.intro > 0); i++) t.step(1) }
const cmdAt = (label) => DBG().cmdRects().find((r) => r.label === label)
const cxy = (r) => [r.x + r.w / 2, r.y + r.h / 2]

// ---------- 指令方格：悬停 ----------
section('1) 指令方格：鼠标悬停要高亮对应的格子')
const labels = DBG().cmdRects().map((r) => r.label)
check(labels.length >= 5, `指令 ${labels.length} 个：${labels.join(' / ')}`)
for (const want of ['攻击', '技能', '道具', '防御', '逃跑']) {
  check(labels.includes(want), `有「${want}」指令`)
}
let hoverOk = 0
for (const r of DBG().cmdRects()) {
  const [x, y] = cxy(r)
  t.move(x, y); t.step(1)
  if (S().hoverCmd === r.i && b.menuSel === r.i) hoverOk++
}
check(hoverOk === labels.length, `每一格悬停都被命中（${hoverOk}/${labels.length}）`)

// ---------- 点击「攻击」 ----------
section('2) 点击「攻击」真的出手')
waitCmd()
{
  const hp0 = b.enemies[0].hp
  const r = cmdAt('攻击')
  const [x, y] = cxy(r)
  t.move(x, y); t.step(1)
  t.click(x, y); t.step(2)
  const acted = b.phase === 'acting' || b.enemies[0].hp < hp0
  check(acted, `点「攻击」触发攻击（phase=${b.phase}，敌人 HP ${hp0} → ${b.enemies[0].hp}）`)
  for (let i = 0; i < 900 && S().battle && b.phase === 'acting'; i++) t.step(1)
}

// ---------- 点击「技能」打开技能面板 ----------
section('3) 点击「技能」打开技能面板，并能点技能格释放')
waitCmd()
{
  const r = cmdAt('技能')
  const [x, y] = cxy(r)
  t.move(x, y); t.step(1)
  t.click(x, y); t.step(2)
  check(b.menu === 'skill', `点「技能」打开技能面板（menu=${b.menu}）`)
  const srs = DBG().skillRects()
  check(srs.length > 0, `技能格 ${srs.length} 个`)
  // 悬停第 2 格
  let target = srs[Math.min(1, srs.length - 1)]
  const [sx, sy] = cxy(target)
  t.move(sx, sy); t.step(1)
  check(b.skillSel === target.i, `悬停技能格被识别（skillSel=${b.skillSel}，期望 ${target.i}）`)
  // 点一个能放的技能（耗得起蓝、不在冷却）
  const usable = srs.find((r2) => {
    const sk = D.SKILLS[r2.name] || {}
    return !(b.cooldowns && b.cooldowns[r2.name] > 0) && (b.player.mp >= (sk.energy || 0)) && !sk.seal
  })
  if (usable) {
    const [ux, uy] = cxy(usable)
    t.move(ux, uy); t.step(1)
    t.click(ux, uy); t.step(2)
    const acted = b.phase === 'acting' || b.phase === 'sealing' || !!b.action
    check(acted, `点技能格「${usable.name}」触发了释放（phase=${b.phase}）`)
    for (let i = 0; i < 900 && S().battle && (b.phase === 'acting' || b.phase === 'sealing'); i++) t.step(1)
  } else {
    check(false, '找不到可用的技能格（无法验证点击释放）')
  }
}

// ---------- 点击「道具」 ----------
section('4) 点击「道具」打开道具面板')
// 背包为空时「道具」指令不会开面板（只给一句提示），所以先按游戏自己的数据发几个道具。
// 不写死道具 id：从 D.ITEMS 里取前几个，形制变了也不会失效。
{
  const items = D.ITEMS || {}
  const keys = Array.isArray(items) ? items.map((x) => x.id) : Object.keys(items)
  const grant = keys.slice(0, 3)
  for (const k of grant) W.DKDbb.save.data.items[k] = 3
  check(grant.length > 0, `测试前发放 ${grant.length} 种道具：${grant.join('、')}`)
}
waitCmd()
{
  const r = cmdAt('道具')
  const [x, y] = cxy(r)
  t.move(x, y); t.step(1)
  t.click(x, y); t.step(2)
  check(b.menu === 'item', `点「道具」打开道具面板（menu=${b.menu}）`)
  if (b.menu === 'item') { t.key('Escape'); t.step(2) }
}

// ---------- 点击「防御」 ----------
section('5) 点击「防御」进入防御演出')
waitCmd()
{
  const r = cmdAt('防御')
  const [x, y] = cxy(r)
  t.move(x, y); t.step(1)
  t.click(x, y); t.step(2)
  check(b.phase === 'acting' || !!(b.action && b.action.isDefend),
    `点「防御」触发防御（phase=${b.phase}，isDefend=${b.action ? !!b.action.isDefend : '-'}）`)
  for (let i = 0; i < 900 && S().battle && b.phase === 'acting'; i++) t.step(1)
}

// ---------- 点击敌人换目标 ----------
section('6) 点击敌人切换目标')
waitCmd()
if (S().battle && b.enemies.length >= 2) {
  const before = b.target
  const e1 = b.enemies[1]
  // 敌人位置由游戏的命中测试决定：扫一遍上半屏，找能命中下标 1 的点
  let hit = null
  for (let x = 560; x <= 900 && !hit; x += 12) {
    for (let y = 180; y <= 430; y += 12) {
      t.move(x, y); t.step(1)
      if (S().hoverEnemy === 1) { hit = [x, y]; break }
    }
  }
  check(!!hit, hit ? `找到敌人 1 的命中点 (${hit[0]},${hit[1]})` : '扫描全屏也没命中敌人 1')
  if (hit) {
    t.click(hit[0], hit[1]); t.step(2)
    check(b.target === 1, `点敌人后目标切到 1（${before} → ${b.target}）`)
  }
} else {
  // 只有一只敌人时，构造第二只再测
  const e0 = b.enemies[0]
  b.enemies.push(Object.assign({}, e0, { name: e0.name + '·乙', hp: e0.maxHp, dead: false }))
  let hit = null
  for (let x = 560; x <= 930 && !hit; x += 10) {
    for (let y = 170; y <= 440; y += 10) {
      t.move(x, y); t.step(1)
      if (S().hoverEnemy === 1) { hit = [x, y]; break }
    }
  }
  check(!!hit, hit ? `补一只敌人后找到命中点 (${hit[0]},${hit[1]})` : '扫描全屏也没命中第二只敌人')
  if (hit) {
    t.click(hit[0], hit[1]); t.step(2)
    check(b.target === 1, `点敌人后目标切到 1（target=${b.target}）`)
  }
  check(S().hoverEnemy >= 0, `敌人悬停命中测试生效（hoverEnemy=${S().hoverEnemy}）`)
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail === 0 ? 0 : 1)
