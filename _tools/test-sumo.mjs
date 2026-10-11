// 大陆棋（第 51 轮按官方原文重做）
//
// 【为什么要单独一个测试文件】它原本被实现成"对 AI 打一局"（`kind:'boss'`），
// 与原文**根本不是一个玩法**。第 47 轮把官方原文挖出来（4 篇攻略/新闻），
// 这个文件逐条钉住那 4 篇里说过的每一件事 —— 尤其是**它必须是个物理对战，不是回合制战斗**。
//
// 官方原文（逐字，出处见 game/tables/sumo.js 文件头）：
//   ·「将鼠标指向出招的多比会出现一个箭头，移动鼠标调整箭头的方向和大小，
//      箭头越大多比前进的距离就越大，中远程多比攻击的距离也越远」
//   ·「瞄准敌人后松开鼠标就可以进行发射」
//   ·「将多比撞出地图范围，也就是撞进河里也可以消灭多比」
//   ·「重量：被击中以后移动的距离，重量越大越难被推开」
//   ·「冷却：影响出手顺序，冷却越小的出手越快」
//   · 四种类型：近身（只有撞到才造成伤害 / 前进最快冲击力最大）· 中距离（攻击波，1-3 个光波）·
//     远距离（攻击范围非常远，一次打一片区域）· 治疗（没有攻击力，治疗光波在多比间弹射）
//   · 两种地图：长方形（四周是河，比较安全）· I 形（中间有桥，容易被推下去）
//   ·「石头，墓碑和树木可以抵挡攻击」
import { T } from './game-harness.mjs'

const t = T
t.load('game/game.js')
await T.settle()

const W = t.get('window')
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
const D = W.DKDbbData
const save = W.DKDbb.save
let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n== ' + s + ' ==')

// ---------- 1) 数据：四类与六项属性都要在，且都能追到官方出处 ----------
section('1) 四类多比与六项属性（官方原文）')
{
  const P = DBG().sumoParams()
  check(P.types.length === 4, `四类多比（${P.types.map((x) => x.name).join('/')}）`)
  const ids = P.types.map((x) => x.id)
  for (const id of ['melee', 'mid', 'long', 'heal']) check(ids.includes(id), `有「${id}」这一类`)
  // 官方给每类点了代表多比
  check(P.types.every((x) => !!x.rep && /[·\u4e00-\u9fa5]/.test(x.rep)),
    `每类都有官方点名的代表多比（${P.types.map((x) => x.rep).join('/')}）`)
  // 六项属性：生命 威力 防御 重量 移动 冷却
  for (const k of ['life', 'power', 'defense', 'weight', 'move', 'cooldown']) {
    check(P.types.every((x) => typeof x[k] === 'number'), `每类都定义了「${k}」`)
  }
  // 官方：近身"前进速度最快，冲击力也最大"
  const melee = P.types.find((x) => x.id === 'melee')
  check(P.types.every((x) => x.id === 'melee' || x.move <= melee.move),
    `近身的移动最快（${melee.move}，其余 ≤ 它）`)
  check(P.types.every((x) => x.id === 'melee' || x.power <= melee.power),
    `近身的威力最大（${melee.power}）`)
  // 官方：治疗"没有攻击力"
  check(P.types.find((x) => x.id === 'heal').power === 0, '治疗类威力为 0（官方："没有攻击力"）')
  // 官方：中距离"可以同时发射 1-3 个光波"
  const mid = P.types.find((x) => x.id === 'mid')
  check(Array.isArray(mid.waves) && mid.waves[0] === 1 && mid.waves[1] === 3,
    `中距离可发 1-3 个光波（${JSON.stringify(mid.waves)}）`)
  // 官方：远距离"一次可以攻击一片区域内的所有敌人"
  check(P.types.find((x) => x.id === 'long').areaR > 0, '远距离有范围伤害半径')
  // 官方：治疗"治疗光波在多比间弹射"
  check(P.types.find((x) => x.id === 'heal').heal > 0, '治疗类有治疗量')
  // 物理参数在
  for (const k of ['friction', 'minPower', 'maxPower', 'dmgK', 'pushK', 'collideR']) {
    check(typeof P.phys[k] === 'number' && P.phys[k] > 0, `物理参数「${k}」已定义`)
  }
  check(/official/.test(P.note) && /derived/.test(P.note), '数据自己写明了哪部分是官方、哪部分是推算')
}

// ---------- 2) 两种官方地图 ----------
section('2) 两种地图（官方：长方形 / I 形，随机且不可更换）')
{
  const maps = DBG().sumoMaps()
  check(maps.length === 2, `两张地图（${maps.map((m) => m.name).join('/')}）`)
  const rect = maps.find((m) => m.id === 'rect')
  const i = maps.find((m) => m.id === 'i')
  check(rect && rect.river === 'border', '长方形：河在四周（官方："轻易不会被撞进河里"）')
  check(i && i.river === 'middle' && i.bridge && i.bridge.w > 0,
    'I 形：中间是河、河上有一座桥（官方："中间的桥很容易让多比被推下去"）')
  check(maps.every((m) => m.obstacleCount > 0), '两张地图都放了障碍（官方："注意要避开石头树木等障碍物"）')
  // 河判定：**两种地图各自显式验一遍**，不要"按随机抽到哪张图二选一"。
  // 那样写会让断言条数在 71/72 之间跳（抽到 I 形多一条）—— 本项目第 43 轮定的规矩：
  // 断言条数不许随运行情况浮动，否则"某条悄悄没跑"就看不出来了。
  S().mode = 'explore'
  save.data.level = 25
  DBG().enterDungeon('daluqi')
  check(!!DBG().sumoState(), '能进入大陆棋（拿到局面）')
  // ① 两种地图的公共规则：走出地图边界就是河
  check(DBG().sumoInRiver(-5, 100) === true, '走出左边界 = 掉进河里')
  check(DBG().sumoInRiver(rect.w + 5, 100) === true, '走出右边界 = 掉进河里')
  check(DBG().sumoInRiver(100, i.h + 5) === true, '走出下边界 = 掉进河里')
  // ② 长方形：河只在四周，里面到处是陆地
  DBG().sumoReset('rect')
  check(DBG().sumoInRiver(rect.w / 2, rect.h / 2) === false, '长方形：地图正中是陆地')
  check(DBG().sumoInRiver(60, 60) === false && DBG().sumoInRiver(rect.w - 60, rect.h - 60) === false,
    '长方形：四角仍在陆地上（官方："比较安全，轻易不会被撞进河里"）')
  // ③ I 形：中间是河，只有桥那一段能站
  DBG().sumoReset('i')
  {
    const bx = i.bridge.x > 100 ? 60 : i.bridge.x + i.bridge.w + 60
    check(DBG().sumoInRiver(bx, i.bridge.y + i.bridge.h / 2) === true, 'I 形：河道里、桥外 = 掉进河里')
    check(DBG().sumoInRiver(i.bridge.x + i.bridge.w / 2, i.bridge.y + i.bridge.h / 2) === false, 'I 形：桥上不是河')
    check(DBG().sumoInRiver(100, i.bridge.y - 60) === false && DBG().sumoInRiver(100, i.bridge.y + i.bridge.h + 60) === false,
      'I 形：河道上下两侧的陆地都能站')
  }
  DBG().sumoReset('rect')
}

// ---------- 3) 队伍：四类各一只，来源可解释 ----------
section('3) 队伍编成（官方：出战的多比是从你拥有的多比中选的）')
{
  const P = DBG().sumoParams()
  const g = DBG().sumoState()
  const mine = g.units.filter((u) => u.side === 'mine')
  const foe = g.units.filter((u) => u.side === 'foe')
  check(mine.length === 4 && foe.length === 4, `每边 4 只（我方 ${mine.length} / 对方 ${foe.length}）`)
  check(new Set(mine.map((u) => u.typeId)).size === mine.length, '我方四只类型互不相同（四类各一只）')
  check(new Set(foe.map((u) => u.typeId)).size === foe.length, '对方四只类型也互不相同')
  check(mine.every((u) => P.types.some((x) => x.id === u.typeId)), '我方的类型都在官方四类里')
  // 官方只说"从你拥有的多比中选"，没说怎么分类 → 我们的规则必须可解释：
  //   有治疗技的 → 治疗；其余按 攻+防 / 魔攻 / 速度 依次挑。
  const owned = (save.data.forms || []).map((n) => D.FORMS.find((f) => f.name === n)).filter(Boolean)
  const healers = owned.filter((f) => D.isHealForm(f))
  const healUnit = mine.find((u) => u.typeId === 'heal')
  check(!!healUnit, '治疗位有人')
  if (healUnit && healers.length) {
    check(healers.some((f) => f.name === healUnit.name),
      `治疗位来自"有恢复技的形态"（${healUnit.name}）—— 规则可复核`)
  }
  // 缺人时才用官方代表多比补位，且必须标出来（不借别的多比的立绘）
  const repUnits = mine.filter((u) => u.artMissing)
  check(repUnits.every((u) => P.types.some((x) => x.id === u.typeId && x.rep === u.name)),
    `补位的那几只用的正是官方点名的代表多比（${repUnits.map((u) => u.name).join('/') || '无'}）`)
  // 等级影响"不大"（官方），所以只有很轻的加成
  // 注意字段名是 maxHp（sumoState 的投影里没有 life —— 第一版写成 u.life，拿到 undefined）
  const lvMul = (lv) => { save.data.level = lv; DBG().sumoReset(); const u = DBG().sumoState().units.find((x) => x.side === 'mine'); return u.maxHp }
  const lo = lvMul(1), hi = lvMul(60)
  save.data.level = 25
  check(typeof lo === 'number' && typeof hi === 'number' && hi > lo && hi / lo < 2,
    `等级只给很轻的加成（1 级 ${lo} → 60 级 ${hi}，不到 2 倍）—— 官方："等级影响并不大"`)
}

// ---------- 4) 弹弓：方向 + 大小 → 发射（官方操作） ----------
section('4) 拉弓与发射（官方："调整箭头的方向和大小…松开鼠标就可以进行发射"）')
{
  DBG().sumoReset()
  const g0 = DBG().sumoState()
  const nx = DBG().sumoNext()
  check(!!nx, `有单位可以出手（${nx && nx.name}）`)
  if (nx && nx.side === 'mine') {
    check(DBG().sumoStartAim(nx.uid) === true, '能开始拉弓')
    const a0 = DBG().sumoState().aiming
    check(!!a0, '拉弓状态已建立（相当于"箭头出现了"）')
    DBG().sumoSetAim(1, 0, 0.2)
    const a1 = DBG().sumoState().aiming
    check(Math.abs(a1.power - 0.2) < 1e-6, `力度可调（${a1.power}）`)
    DBG().sumoSetAim(0, 1, 0.9)
    const a2 = DBG().sumoState().aiming
    // 官方："移动鼠标调整箭头的方向和大小"
    check(Math.abs(a2.dx) < 1e-6 && Math.abs(a2.dy - 1) < 1e-6, '方向可调（改成朝下）')
    check(a2.power > a1.power, `力度可加大（${a1.power} → ${a2.power}）`)
    // 官方："箭头越大多比前进的距离就越大" → 力度越大初速越大
    const speedAt = (p) => {
      DBG().sumoReset()
      const n2 = DBG().sumoNext()
      DBG().sumoStartAim(n2.uid)
      DBG().sumoSetAim(1, 0, p)
      DBG().sumoFire()
      const u = DBG().sumoState().units.find((x) => x.uid === n2.uid)
      return Math.abs(u.vx)
    }
    const vLow = speedAt(0.1), vHigh = speedAt(1.0)
    check(vHigh > vLow * 2, `箭头越大前进越远（力度 0.1 → ${vLow.toFixed(0)}；1.0 → ${vHigh.toFixed(0)}）`)
    // 发射后不能再改（箭已经出去了）
    check(DBG().sumoState().aiming === null, '发射后拉弓状态清空')
  }
}

// ---------- 5) 物理：撞人掉血、重量影响被推开的距离、能被打进河里 ----------
// ⚠️ 这几个子测试是**手工摆位**的，所以必须自己把随机因素钉死：
//    ① 指定地图（`sumoReset(mapId)`；正常游玩仍是随机的，官方要求"随机且不可更换"）；
//    ② 摆位时 y 不能落在 I 形地图的河道里 —— 第一版写死 y=210，而 I 形的河正好在 186~234，
//       两个单位一开局就掉河里，于是"撞上去会掉血"偶发变成 141→141（实测 6 次里错 2 次）。
//    下面两种地图各跑一遍，顺便把"两种地图都能玩"也验了。
section('5) 物理与胜负（官方：撞进河里也淘汰 · 重量越大越难被推开）')
// 受控摆位用的辅助：开一局指定地图，并**清掉障碍**。
// ⚠️ 障碍是随机撒的，可能正好挡在两名单位之间 —— 那样"撞上去"会变成"撞在石头上"，
//    于是同一段测试时对时错（实测 6 次里错 3 次）。障碍本身在第 7 节单独验。
function clean(mapId) {
  DBG().sumoReset(mapId)
  DBG().dungeonState().su.obstacles.length = 0
  return DBG().dungeonState().su
}
function groundY(mapId) {
  const m = DBG().sumoMaps().find((x) => x.id === mapId)
  if (m.river === 'middle' && m.bridge) return m.bridge.y - 70      // 河道上方的陆地
  return 210
}
for (const mapId of ['rect', 'i']) {
  const GY = groundY(mapId)
  console.log(`  —— 地图「${mapId}」，摆位 y=${GY} ——`)
  // 撞人掉血 + 被推开
  const runHit = (foeWeight) => {
    const gg = clean(mapId)
    // 必须挑**有攻击力**的那只（治疗类威力 0）—— 官方："治疗多比没有攻击力"
    const a = gg.units.find((u) => u.side === 'mine' && u.power > 0)
    const b = gg.units.find((u) => u.side === 'foe')
    gg.units = [a, b]
    a.x = 300; a.y = GY; a.vx = 600; a.vy = 0; a.typeId = 'melee'; a.power = 40; a.defense = 18; a.weight = 34
    a.hp = a.maxHp
    b.x = 380; b.y = GY; b.vx = 0; b.vy = 0; b.weight = foeWeight; b.defense = 12; b.hp = b.maxHp
    const bHp0 = b.hp, bX0 = b.x
    let peak = bX0
    for (let i = 0; i < 12; i++) {
      DBG().sumoTick(1 / 60)
      const cur = DBG().sumoState().units.find((u) => u.uid === b.uid)
      if (cur) peak = Math.max(peak, cur.x)
    }
    const s = DBG().sumoState().units.find((u) => u.uid === b.uid)
    return { hp0: bHp0, hp1: s.hp, push: peak - bX0 }
  }
  const light = runHit(10), heavy = runHit(80)
  check(light.hp1 < light.hp0, `[${mapId}] 撞上去会掉血（${light.hp0} → ${light.hp1}）`)
  check(light.push > 5, `[${mapId}] 被撞的会被推开（推开 ${light.push.toFixed(0)}px）`)
  check(light.push > heavy.push,
    `[${mapId}] 重量越大越难被推开（轻 10 → 推 ${light.push.toFixed(0)}px；重 80 → 推 ${heavy.push.toFixed(0)}px）`)

  // 撞进河里 = 淘汰（官方最重要的一条）
  {
    const g2 = clean(mapId)
    const a = g2.units.find((u) => u.side === 'mine' && u.power > 0)
    const b = g2.units.find((u) => u.side === 'foe')
    g2.units = [a, b]
    const m = DBG().sumoMaps().find((x) => x.id === mapId)
    if (m.river === 'middle' && m.bridge) {
      // I 形：把敌人放到**河道里、桥外**，它一开局就在河里 → 直接淘汰
      const bx = m.bridge.x > 120 ? 60 : m.bridge.x + m.bridge.w + 60
      b.x = bx; b.y = m.bridge.y + m.bridge.h / 2
      a.x = bx; a.y = GY; a.vx = 0; a.vy = 0
      DBG().sumoTick(1 / 60)
    } else {
      // 长方形：贴着左边界，我方高速撞过去把它顶出界
      b.x = 30; b.y = GY; b.vx = 0; b.vy = 0; b.weight = 8
      a.x = 90; a.y = GY; a.vx = -700; a.vy = 0; a.typeId = 'melee'; a.power = 40; a.defense = 18; a.weight = 34
      for (let i = 0; i < 40 && DBG().sumoState().units.find((u) => u.uid === b.uid).alive; i++) DBG().sumoTick(1 / 60)
    }
    const bAfter = DBG().sumoState().units.find((u) => u.uid === b.uid)
    check(!bAfter.alive, `[${mapId}] 掉进河里 = 淘汰（x=${bAfter.x.toFixed(0)}, y=${bAfter.y.toFixed(0)}）`)
  }
}
DBG().sumoReset('rect')

// ---------- 6) 出手顺序由冷却决定 ----------
section('6) 出手顺序（官方："冷却越小的出手越快"）')
{
  DBG().sumoReset('rect')
  const g = DBG().sumoState()
  const first = DBG().sumoNext()
  const minCd = Math.min(...g.units.filter((u) => u.alive).map((u) => u.cooldown))
  check(first.cooldown === minCd, `第一个出手的是冷却最小的（${first.name} 冷却 ${first.cooldown}，全场最小 ${minCd}）`)
  // 出手之后它的下次行动时间被推后
  const before = g.units.find((u) => u.uid === first.uid).actAt
  DBG().sumoStartAim(first.uid)
  DBG().sumoSetAim(1, 0, 0.3)
  DBG().sumoFire()
  const after = DBG().sumoState().units.find((u) => u.uid === first.uid).actAt
  check(after > before, `出手后它的下次行动被推后（${before} → ${after}）`)
  // 冷却越小的出手越快：冷却 2 的治疗应该比冷却 4 的远距离先动
  const heal = g.units.find((u) => u.typeId === 'heal')
  const lng = g.units.find((u) => u.typeId === 'long')
  if (heal && lng) check(heal.cooldown < lng.cooldown, `治疗（冷 ${heal.cooldown}）比远距离（冷 ${lng.cooldown}）先动`)
}

// ---------- 7) 障碍可挡可碎 ----------
section('7) 障碍（官方："石头，墓碑和树木可以抵挡攻击"）')
{
  DBG().sumoReset('rect')
  const gg = DBG().dungeonState().su
  const kinds = new Set(gg.obstacles.map((o) => o.kind))
  const m = DBG().sumoMaps().find((x) => x.id === gg.mapId)
  check(gg.obstacles.length === m.obstacleCount, `障碍数量与地图配置一致（${gg.obstacles.length}）`)
  check([...kinds].every((k) => ['石头', '树木', '墓碑'].includes(k)),
    `障碍种类只来自官方点名的三种（${[...kinds].join('/')}）`)
  // 挡路：把一只多比朝障碍高速推过去，它应该被挡住（不会穿过去）
  // ⚠️ 只留下一颗障碍：别的障碍可能挡在中间，那样撞的就不是这一颗了（会偶发）
  const o = gg.obstacles[0]
  gg.obstacles = [o]
  // ⚠️ 必须挑**有攻击力**的那只：治疗类威力为 0（官方"没有攻击力"），拿它撞石头永远撞不碎
  const u = gg.units.find((x) => x.power > 0 && x.side === 'mine') || gg.units.find((x) => x.power > 0)
  u.x = o.x - 90; u.y = o.y; u.vx = 700; u.vy = 0
  const x0 = u.x
  const hp0 = o.hp
  // ⚠️ 记**过程里的最远位置**，不能只看最终位置：撞上障碍后会被弹回来
  //    （官方："不要把自己弹进河里了"—— 障碍物确实会把多比弹开），
  //    最终位置可能比起点还靠左，只看末态会误判成"它根本没动"。
  let peakX = x0
  for (let i = 0; i < 30; i++) {
    DBG().sumoTick(1 / 60)
    const cur = DBG().sumoState().units.find((x) => x.uid === u.uid)
    if (cur) peakX = Math.max(peakX, cur.x)
  }
  const oAfter = DBG().sumoState().obstacles[0]
  const uAfter = DBG().sumoState().units.find((x) => x.uid === u.uid)
  // 先证明"它真的朝障碍冲过去了" —— 否则断言会空过（阶段不对时 sumoTick 直接早退，一步没走）
  check(peakX > x0 + 10, `多比确实朝障碍冲过去了（最远冲到 x=${peakX.toFixed(0)}，起点 ${x0.toFixed(0)}）`)
  check(peakX < oAfter.x, `多比被障碍挡住，没有穿过去（最远 ${peakX.toFixed(0)} < 障碍 x=${oAfter.x.toFixed(0)}）`)
  check(oAfter.hp < hp0 || oAfter.broken, `撞击会打碎障碍（${hp0} → ${oAfter.hp}${oAfter.broken ? ' 已碎' : ''}）`)
  // 治疗类撞上去不该造成伤害（官方："治疗多比没有攻击力"）
  {
    const g2 = clean('rect')
    const g2o = { x: 400, y: 300, r: 17, kind: '石头', hp: 120, maxHp: 120, broken: false }
    g2.obstacles = [g2o]
    const healer = g2.units.find((x) => x.typeId === 'heal')
    healer.x = g2o.x - 80; healer.y = g2o.y; healer.vx = 700; healer.vy = 0
    const h2 = g2o.hp
    for (let i = 0; i < 24; i++) DBG().sumoTick(1 / 60)
    const o2After = DBG().sumoState().obstacles[0]
    check(o2After.hp === h2, `治疗类撞不碎障碍（官方："没有攻击力"）(${h2} → ${o2After.hp})`)
  }
  DBG().sumoReset('i')
  {
    // I 形地图也要能正常开局（单位不能一出生就掉河里）
    const g3 = DBG().sumoState()
    const drowned = g3.units.filter((u) => !u.alive).length
    check(drowned === 0, `I 形地图开局时没有单位落在河里（掉水 ${drowned} 只）`)
    const m3 = DBG().sumoMaps().find((x) => x.id === 'i')
    check(g3.units.every((u) => !DBG().sumoInRiver(u.x, u.y)), 'I 形地图：所有单位的出生点都在陆地上')
    check(m3.bridge.w > 60 && m3.bridge.h > 20, `桥的尺寸够站人（${m3.bridge.w}×${m3.bridge.h}）`)
  }
  DBG().sumoReset('rect')
}

// ---------- 8) 打完能出结算（不是卡死） ----------
section('8) 打完整局 → 走到结算')
{
  save.data.level = 25
  S().mode = 'explore'
  const st = DBG().dungeonState()
  st.id = null; st.phase = 'list'
  check(DBG().enterDungeon('daluqi') === true, '能进大陆棋')
  let frames = 0
  while (DBG().dungeonState().phase === 'sumo' && frames < 60 * 300) {
    const g = DBG().sumoState()
    const nx = DBG().sumoNext()
    if (nx && nx.side === 'mine' && !g.aiming) {
      const me = g.units.find((u) => u.uid === nx.uid)
      const foes = g.units.filter((u) => u.side === 'foe' && u.alive)
      if (foes.length) {
        const tgt = foes.slice().sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0]
        DBG().sumoStartAim(nx.uid)
        DBG().sumoSetAim(tgt.x - me.x, tgt.y - me.y, 0.85)
        DBG().sumoFire()
      }
    }
    DBG().sumoTick(1 / 60)
    t.step(1)
    frames++
  }
  check(DBG().dungeonState().phase !== 'sumo', `能打完（阶段=${DBG().dungeonState().phase}，${(frames / 60).toFixed(1)}s）`)
  const g = DBG().sumoState()
  if (g) check(g.win === true || g.units.filter((u) => u.side === 'mine' && u.alive).length === 0,
    `结束时有明确胜负（win=${g.win}）`)
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
