// 用户报的 bug：「战斗时人物没有攻击动作」。
//
// 根因（两处叠加，缺一不可）：
//   1) 形态立绘加载成功后 drawFigure 直接画静态图，只加 0.06 弧度（约 3.4°）微倾；
//   2) 战斗里写的是 `if (b.action.anim) {...} else lungeP = 40*sin(...)`，
//      而 perform() 对技能一定会填 anim —— 于是前冲分支永远走不到。
// 两者叠加 = 站着不动把技能放了。
//
// 本测试同时验证「动作曲线本身」和「战斗里真的用上了这条曲线」，
// 后者是关键：只测纯函数的话，接线接错了照样测不出来。
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

// ---------- 1) 动作曲线本身 ----------
section('1) 攻击动作曲线')
const pose = DBG().attackPose
check(typeof pose === 'function', 'attackPose 已暴露给测试')
if (typeof pose !== 'function') { console.log('\n❌ 无法继续'); process.exit(1) }

const DUR = 0.8
const at = (k, self) => pose(DUR * k, DUR, !!self)
const p0 = at(0)
check(Math.abs(p0.dx) < 1.5, `起手 dx=${p0.dx.toFixed(1)}（应接近 0）`)

const wind = at(0.15)                       // 蓄力：应向后撤
check(wind.dx < -8, `蓄力后撤 dx=${wind.dx.toFixed(1)}（应 < -8）`)
check(wind.lean < 0, `蓄力后仰 lean=${wind.lean.toFixed(3)}（应 < 0）`)

const hit = at(0.34)                        // 冲到位：应明显前压
check(hit.dx > 60, `冲刺到位 dx=${hit.dx.toFixed(1)}（应 > 60，这是"看得见"的关键）`)
check(hit.lean > 0.1, `前压倾角 lean=${hit.lean.toFixed(3)}（应 > 0.1）`)
check(hit.squash < 0, `前冲拉伸 squash=${hit.squash.toFixed(3)}（应 < 0）`)

const settle = at(0.55)
check(settle.dx > 0, `命中回弹仍在前方 dx=${settle.dx.toFixed(1)}`)

const end = at(1)
check(Math.abs(end.dx) < 2, `收招归位 dx=${end.dx.toFixed(2)}（应回到 0 附近）`)

// 全程位移必须真的"来回"，不是单调平移
let maxDx = -1e9, minDx = 1e9
for (let i = 0; i <= 100; i++) { const p = at(i / 100); maxDx = Math.max(maxDx, p.dx); minDx = Math.min(minDx, p.dx) }
check(maxDx > 60 && minDx < -10, `整段位移区间 ${minDx.toFixed(1)} ~ ${maxDx.toFixed(1)}（要既有后撤又有前冲）`)

// 自身技能：不许往前冲（否则会出现"给自己加血却冲向敌人"）
let selfMax = -1e9
for (let i = 0; i <= 100; i++) selfMax = Math.max(selfMax, at(i / 100, true).dx)
check(selfMax <= 1, `自身技能（治疗/增益）不前冲，最大 dx=${selfMax.toFixed(1)}`)

// ---------- 2) 战斗里真的用上了这条曲线 ----------
section('2) 战斗里真的应用了动作（这条才防得住"接线接错"）')
S().mode = 'title'
t.key(' '); t.step(3)
let entered = false
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
    if (S().battle) { entered = true; break }
  }
  if (entered) break
}
check(entered, '成功进入战斗')

if (entered) {
  const b = S().battle
  const form = S().form
  b.player.hp = b.player.maxHp = 99999
  b.player.mp = b.player.maxMp = 999

  // 找一个打敌人的攻击技（非结印、有伤害倍率）
  const list = form.skills || []
  const idx = list.findIndex((n) => D.SKILLS[n] && !D.SKILLS[n].seal && D.SKILLS[n].power > 0)
  check(idx >= 0, `有可用的攻击技：${list.join('、')}`)
  if (idx >= 0) {
    const name = list[idx]
    b.menu = 'skill'; b.menuSel = 1; b.skillSel = idx
    b.cooldowns = {}
    t.step(1)
    t.key(' ')
    t.step(1)
    check(b.phase === 'acting', `「${name}」进入演出（phase=acting）`)
    // 这是本 bug 的核心断言：技能一定有 action.anim，而旧代码正是因此跳过了前冲
    check(!!b.action && !!b.action.anim,
      `技能演出带 anim（"${b.action ? b.action.anim : '-'}"）—— 旧代码就是因为它跳过了前冲`)
    let seenNull = 0, seenMax = -1e9, seenMin = 1e9, frames = 0
    for (let i = 0; i < 900 && S().battle && b.phase === 'acting'; i++) {
      t.step(1)
      const pp = DBG().playerPose
      if (!pp) { seenNull++; continue }
      frames++
      seenMax = Math.max(seenMax, pp.dx)
      seenMin = Math.min(seenMin, pp.dx)
    }
    check(seenNull === 0 || frames > 0, `演出期间姿态一直被应用（未应用的帧数 ${seenNull}，已应用 ${frames} 帧）`)
    check(frames > 0 && seenMax > 40, `战斗里实际前冲最大 ${seenMax.toFixed(1)}px（旧版本这里恒为 0）`)
    check(frames > 0 && seenMin < -5, `战斗里实际有后撤蓄力 ${seenMin.toFixed(1)}px`)
    for (let i = 0; i < 400 && S().battle && b.phase !== 'command'; i++) t.step(1)
    check(!S().battle || DBG().playerPose === null || Math.abs(DBG().playerPose.dx) < 2,
      '演出结束后姿态归零（不会一直飘在前面）')
  }

  // 自身技能不该前冲
  const selfIdx = (form.skills || []).findIndex((n) => D.SKILLS[n] && (D.SKILLS[n].heal || (D.SKILLS[n].buff && !D.SKILLS[n].seal)))
  if (selfIdx >= 0 && S().battle && b.phase === 'command') {
    const nm = form.skills[selfIdx]
    b.menu = 'skill'; b.menuSel = 1; b.skillSel = selfIdx
    b.cooldowns = {}
    t.step(1)
    t.key(' ')
    t.step(1)
    let selfMax2 = -1e9
    for (let i = 0; i < 900 && S().battle && b.phase === 'acting'; i++) {
      t.step(1)
      const pp = DBG().playerPose
      if (pp) selfMax2 = Math.max(selfMax2, pp.dx)
    }
    check(selfMax2 <= 1, `自身技能「${nm}」在战斗里也不前冲（最大 dx=${selfMax2 === -1e9 ? '未取到' : selfMax2.toFixed(1)}）`)
    for (let i = 0; i < 400 && S().battle && b.phase !== 'command'; i++) t.step(1)
  } else {
    console.log('  （这只多比没有自身增益技，跳过自身技能检查）')
  }
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} 项，失败 ${fail} 项`)
if (fail) process.exit(1)
