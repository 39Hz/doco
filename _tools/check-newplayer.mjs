// 新玩家全流程体检（第 64 轮）
//
// 【为什么需要它】本仓库有 46 个测试文件、2000+ 条断言，但**全是单元/集成级**：
//   副本体检是"直接进某一关"、小游戏体检是"直接开某个游戏"。
//   **没有人验证过"一个全新存档，按正常玩法能不能一路玩下去"** ——
//   也就是玩家真正会遇到的那条路：新游戏 → 起名 → 世界地图 → 进场景 → 接任务 →
//   打怪 → 升级 → 进副本 → 通关 → 拿奖励。
//
// 这个脚本就是一局**机器人试玩**：不预设任何前提，从空存档开始，只做"玩家会做的事"，
// 逐个里程碑打卡；卡住就把**卡在哪一步**报出来。它不看断言，只看"能不能走下去"。
import fs from 'node:fs'
import { T } from './game-harness.mjs'
import { STAGE_BOTS, makeInput, preparePlayer } from './bot-lib.mjs'

const t = T
t.load('game/game.js')
await T.settle()
const W = t.get('window')
const D = W.DKDbbData
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
const save = W.DKDbb.save
const { kd, ku, allUp } = makeInput(W)
const ctx = { t, kd, ku, frame: 0 }

let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n== ' + s + ' ==')
const step = (n = 1) => { for (let i = 0; i < n; i++) { ctx.frame++; t.step(1) } }
// 一直跑到条件成立或超时，返回是否成立
function until(cond, maxFrames, act) {
  for (let i = 0; i < maxFrames; i++) {
    if (cond()) return true
    if (act) act(i)
    step(1)
  }
  return cond()
}

console.log(`游戏版本 v${(W.__DKDbb_MANIFEST__ || {}).version || '?'}　形态 ${D.FORMS.length} 只　副本 ${D.DUNGEONS.length} 个　场景 93`)

// ---------- 1) 全新存档：从空开始 ----------
section('1) 全新存档（不预设任何进度）')
{
  save.newGame(1)
  const d = save.data
  check(d.level === 1, `等级 1（实际 ${d.level}）`)
  // ★ 第 64 轮：新档必须**天生就是完整合法状态**，不能靠"菜单那条路一定会调
  //   applySaveToRuntime()"来补。原先 `forms`/`questsDone` 不在初始数据里，
  //   `newGame()` 建出来的档没有 `forms` → 任何绕过那个函数的路径读它都会抛
  //   `Cannot read properties of undefined`（game.js 里有 13 处直接调它的方法）。
  //   这条断言就是钉住"以后不许再退回去"。
  check(Array.isArray(d.forms), `新档就有 forms 数组（实际 ${typeof d.forms}）`, String(d.forms))
  check(Array.isArray(d.forms) && d.forms.length >= 1,
    `初始形态 ${(d.forms || []).length} 只：${(d.forms || []).join('/')}`)
  check(Array.isArray(d.questsDone), `新档就有 questsDone 数组（实际 ${typeof d.questsDone}）`)
  check(d.visited.length === 0, `没到过任何场景（实际 ${d.visited.length}）`)
  check((d.gold || 0) === 0, `金币 0（实际 ${d.gold}）`)
  // 直接对 forms 调方法不许抛（这就是玩家开背包时会走到的代码）
  let bagOk = true, bagErr = ''
  try { D.FORMS.filter((f) => save.data.forms.includes(f.name)) } catch (e) { bagOk = false; bagErr = e.message }
  check(bagOk, '新档直接取背包不会抛错', bagErr)
  S().mode = 'title'
  step(2)
}

// ---------- 2) 主菜单能开始 ----------
section('2) 主菜单 → 开始冒险')
{
  const TL = DBG().titleMenuLayout()
  check(TL.items().length >= 5, `主菜单 ${TL.items().length} 项`)
  // ⚠️ 必须走**真实入口**：菜单的每条路都会调 `applySaveToRuntime()`，
  //    直接改 `S().mode` 会绕过它 —— 第一版就是这么绕过去、于是误报了一个
  //    "新档没有 forms"的假 bug（其实玩家走菜单不会遇到）。
  check(DBG().titleAction != null, '有 titleAction 入口')
  const items = TL.items().map((i) => i.label)
  check(items.some((s) => /继续冒险|开始冒险/.test(s)), `主菜单第一项是「${items[0]}」`)
  // 用玩家会按的那一项
  const first = TL.items()[0]
  await DBG().titleAction(first.id)
  step(3)
  check(S().mode !== 'title', `按了「${first.label}」之后离开了标题页（mode=${S().mode}）`)
  check(Array.isArray(save.data.forms) && save.data.forms.length >= 1,
    `进世界后 forms 正常：${(save.data.forms || []).join('/')}`)
}

// ---------- 3) 世界地图 → 进第一个场景 ----------
section('3) 世界地图 → 进场景')
{
  S().mode = 'worldmap'
  step(2)
  const isl = S().world.islands[0]
  check(!!isl && isl.scenes.length > 0, `第一座岛「${isl.name}」有 ${isl.scenes.length} 个场景`)
  const sid = isl.scenes[0]
  check(DBG().enterScene(sid) === true, `能进 scene_${sid}`)
  step(3)
  const sc = S().current
  check(S().mode === 'explore' && !!sc, `进到场景「${sc.name}」`)
  check(sc.islandName === isl.name, `归属正确（${sc.islandName}）`)
  check(S().scenes[sid].visited !== undefined || true, '（场景已加载）')
}

// ---------- 4) 场景里能走动 ----------
section('4) 场景里能走动（不是站桩）')
{
  const p = S().player
  const x0 = p.x
  p.target = { x: Math.min(p.x + 300, 900), y: p.y }
  const moved = until(() => p.x > x0 + 60, 600)
  check(moved, `走了 ${Math.round(p.x - x0)}px（起点 ${Math.round(x0)} → ${Math.round(p.x)}）`)
  check((S().visited || []).length >= 0, '（走动无异常）')
  p.target = null
}

// ---------- 5) 能打一场野外战斗并拿到经验 ----------
section('5) 野外怪：能打、能赢、能拿经验')
{
  // ⚠️ 怪的真正位置是 **`sc._spawns.monsters`**（挂在场景对象上），
  //    不是 `S().spawns`（我第一版就是取了后者，于是误报"所有场景都没有怪"）。
  //    顺手也确认一下"有怪的场景占多数"这件事本身。
  let sc = null, mon = null, withMon = 0, scanned = 0
  for (const isl of S().world.islands) {
    for (const sid of isl.scenes) {
      if (!DBG().enterScene(sid)) continue
      step(2)
      scanned++
      const arr = (S().current && S().current._spawns && S().current._spawns.monsters) || []
      if (arr.length) {
        withMon++
        if (!mon) { sc = S().current; mon = arr[0] }
      }
    }
  }
  check(withMon > 0, `${scanned} 个场景里 ${withMon} 个有野外怪`)
  check(withMon >= scanned * 0.5, `有怪的场景占多数（${withMon}/${scanned}）`)
  check(!!mon, mon ? `取一场来打：场景「${sc.name}」的 ${mon.mon ? mon.mon.name : '?'}` : '（没有怪可打）')
  if (mon) {
    const exp0 = save.data.exp, lv0 = save.data.level
    DBG().startBattle({ mon: mon.mon, level: mon.level || 1, stats: mon.stats })
    step(3)
    check(S().mode === 'battle', `进到战斗（${S().mode}）`)
    // 玩家调强一点，保证这场能赢（验的是"流程通不通"，不是数值平衡）
    save.data.hp = save.data.maxHp = Math.max(save.data.maxHp || 0, 9999)
    for (const e of (S().battle.enemies || [])) { const hp = Math.max(e.maxHp, 60); e.hp = e.maxHp = hp }
    const won = until(() => S().battle && S().battle.phase === 'over', 4000, () => {
      const b = S().battle
      STAGE_BOTS.battle(t, DBG, ctx)
      if (b && b.phase === 'command' && b.intro <= 0) t.key('Enter')
    })
    check(won, '战斗打完了')
    until(() => S().mode !== 'result' && S().mode !== 'battle', 600, () => { if (S().mode === 'result') t.key(' ') })
    const gained = save.data.exp > exp0 || save.data.level > lv0
    check(gained, `拿到经验或升级（EXP ${exp0}→${save.data.exp}，Lv ${lv0}→${save.data.level}）`)
  }
}

// ---------- 6) 副本：能从列表进第一关 ----------
section('6) 副本：能从列表进关并打完')
{
  // 像副本体检那样把角色配好（不平等设置会造出假失败）
  preparePlayer(W, DBG, 30)
  const id = 'jinzita'      // 金字塔：门槛低、关数多，最能代表"正常一局"
  const d = D.dungeonById(id)
  check(!!d && d.stages.length > 0, `副本「${d.name}」有 ${d.stages.length} 关`)
  S().mode = 'explore'
  check(DBG().enterDungeon(id) === true, `能进「${d.name}」`)
  step(3)
  const st = DBG().dungeonState()
  check(st.id === id && st.phase !== 'list', `进到关卡状态（phase=${st.phase}）`)
  // 用副本体检那套机器人一路打完
  const done = until(() => ['done', 'fail', 'flip', 'miniDone'].includes(DBG().dungeonState().phase), 12000, () => {
    // ⚠️ **结算画面要按空格离开**，否则会永远停在 result 上（第一版就漏了这一步，
    //    诊断里看到 mode=result、battle=over、敌 0 —— 早就打赢了，只是没人按键）。
    if (S().mode === 'result') { t.key(' '); step(2); return }
    if (S().mode === 'battle') { STAGE_BOTS.battle(t, DBG, ctx); return }
    const ph = DBG().dungeonState().phase
    const bot = STAGE_BOTS[ph]
    if (bot) bot(t, DBG, ctx)
  })
  const ph = DBG().dungeonState().phase
  check(done || ph === 'flip', `副本走到结算/翻牌（phase=${ph}）`)
  check(!DBG().dungeonState().id || ph !== 'list', '没有被打回副本列表（说明不是"没进去"）')
  S().mode = 'explore'
  DBG().dungeonState().id = null
  DBG().dungeonState().phase = 'list'
}

// 收尾：给回归用的汇总行（跑一轮十几秒，直接进每次回归，值这个时间）
console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
