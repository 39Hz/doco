// M4 周边系统：战报任务 + 恢复生命 NPC。
//
// 官方依据（原文，见 docs/官方资料库.md 12.3）：
//   · 战报：「点击游戏上方的『战报』按钮，即可挑战冒险者试炼……每张练级地图都有相应的
//     战斗任务，战报中详细介绍了完成任务的条件和奖励，首次完成这些任务全部可以重复领取和完成，
//     小多克们可以反复完成相关任务得到多次奖励。」「还有多条战斗线路，可以一步一步解锁」
//   · 恢复生命：「非战斗时，小多克可以找到多比恢复的 npc 来恢复多比的生命。
//     多比恢复的 npc 有：宝石大厅的艾伦、维西岛屿的夏丽」
//
// 本测试除了验证功能，还专门守住一条**血泪教训**：
//   战报任务列表曾经在 drawExplore 里调 sceneSpawns()，把 88 个场景的怪按当时等级**提前固化**，
//   连锁把 test-seal 的命中判定打挂。**绘制函数不许有副作用** —— 见第 8 节。
import { T } from './game-harness.mjs'

const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
const save = W.DKDbb.save
const D = W.DKDbbData
let pass = 0, fail = 0
const check = (c, s) => { console.log((c ? '  ✓ ' : '  ✗ ') + s); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

// ---------- 1) 存档字段 ----------
section('1) 存档里有战报进度字段（老档也能靠 migrate 补上）')
check(save.data.warKills != null && typeof save.data.warKills === 'object', 'warKills 是对象')
check(Array.isArray(save.data.warDone), 'warDone 是数组')
{
  const legacy = { playerName: '老档', level: 5, started: true }
  const r = save.migrate(legacy)
  check(r.data.warKills != null && typeof r.data.warKills === 'object', '老档迁移后补齐 warKills')
  check(Array.isArray(r.data.warDone), '老档迁移后补齐 warDone')
  check(r.changes.some((c) => c.startsWith('warKills')), '补 warKills 有记账')
}

// ---------- 2) 任务列表 ----------
section('2) 任务列表 = 每张"练级地图"一条')
const tasks = DBG().warTasks()
check(tasks.length > 0, `共 ${tasks.length} 条任务`)
check(tasks.every((x) => D.islandHasMonsters(x.island)), '全部来自有怪的岛（安全区不出任务）')
{
  const castle = tasks.filter((x) => x.island === 'castle' || x.island === 'market')
  check(castle.length === 0, `王城/集市（安全区）没有任务（实际 ${castle.length} 条）`)
  const withMon = Object.values(S().scenes).filter((sc) => sc.kind === 'scene' && D.islandHasMonsters(sc.island))
  check(tasks.length === withMon.length, `与"有怪场景数"一致（任务 ${tasks.length} / 有怪场景 ${withMon.length}）`)
}
check(tasks.every((x) => x.monName && x.monName !== 'undefined'), '每条任务都有怪物名')
check(tasks.every((x, i) => i === 0 || tasks[i - 1].sid <= x.sid), '按场景 id 排序（列表稳定）')
check(DBG().warTarget() >= 1, `每次需要击败 ${DBG().warTarget()} 只`)

// ---------- 3) 解锁规则 ----------
section('3) 只解锁"已经去过"的地图（对应官方"一步一步解锁战斗路线"）')
{
  const visited = save.data.visited || []
  check(tasks.every((x) => x.unlocked === visited.includes(x.sid)), 'unlocked 与 visited 完全对应')
  const anyLocked = tasks.some((x) => !x.unlocked)
  check(anyLocked, `存在未解锁的任务（${tasks.filter((x) => !x.unlocked).length} 条）`)
}

// ---------- 4) 领取规则 ----------
section('4) 领取：进度不够不给、没去过不给、够了两档奖励')
{
  const locked = tasks.find((x) => !x.unlocked)
  if (locked) {
    const g0 = save.data.gold
    check(DBG().warClaim(locked) === false, '未解锁的地图不能领')
    check(save.data.gold === g0, '金币没变')
  } else check(false, '（没有未解锁任务可测）')

  const notReady = tasks.find((x) => x.unlocked)
  if (notReady) {
    save.data.warKills[notReady.sid] = DBG().warTarget() - 1
    const g0 = save.data.gold
    check(DBG().warClaim(notReady) === false, '进度不足不能领')
    check(save.data.gold === g0, '金币没变')
  }

  // 备好一条可领的任务
  const t1 = tasks.find((x) => x.unlocked)
  save.data.warKills[t1.sid] = DBG().warTarget()
  const g1 = save.data.gold
  check(DBG().warClaim(t1) === true, '进度够了可以领')
  const firstGold = save.data.gold - g1
  check(firstGold > 0, `首次完成给金币 +${firstGold}`)
  check(save.data.warDone.includes(t1.sid), '已记入 warDone')
  check(save.data.warKills[t1.sid] === 0, '进度已清零（可重复完成）')

  // 再完成一次 → 重复奖励应更少，并给经验
  const lv0 = save.data.exp, g2 = save.data.gold
  save.data.warKills[t1.sid] = DBG().warTarget()
  check(DBG().warClaim(t1) === true, '可以重复完成')
  const repeatGold = save.data.gold - g2
  check(repeatGold > 0 && repeatGold < firstGold, `重复奖励更少（首次 ${firstGold} → 重复 ${repeatGold}）`)
  check(save.data.exp > lv0, `重复完成给经验（${lv0} → ${save.data.exp}）`)
  check(save.data.warDone.filter((x) => x === t1.sid).length === 1, 'warDone 不会重复记录')
}

// ---------- 5) 进度封顶 ----------
section('5) 打得再多也不溢出（计数封顶在目标值）')
{
  const t2 = tasks.find((x) => x.unlocked)
  save.data.warKills[t2.sid] = DBG().warTarget() + 50
  const list = DBG().warTasks()
  const got = list.find((x) => x.sid === t2.sid)
  check(got.kills === DBG().warTarget(), `展示值封顶在 ${got.kills}`)
}

// ---------- 6) 顶栏按钮 ----------
section('6) 顶栏「战报」按钮（原版的入口就是点它）')
{
  const r = DBG().warButtonRect()
  check(r.x > 0 && r.y >= 0 && r.x + r.w <= 960 && r.y + r.h <= 560, `按钮在上屏内 (${r.x},${r.y},${r.w},${r.h})`)
  check(DBG().warButtonHit(r.x + r.w / 2, r.y + r.h / 2) === true, '中心点命中')
  check(DBG().warButtonHit(5, 5) === false, '左上角不命中')
  check(DBG().warButtonHit(r.x - 4, r.y + r.h / 2) === false, '左侧外不命中')
}

// ---------- 7) 进入/退出战报界面 ----------
section('7) Z 键进入战报，Esc 返回')
{
  S().mode = 'explore'; t.step(2)
  t.key('z'); t.step(2)
  check(S().mode === 'warreport', `按 Z 进入战报（mode=${S().mode}）`)
  // 在战报里翻页/移动不应崩
  t.key('ArrowDown'); t.step(1)
  t.key('ArrowRight'); t.step(1)
  t.key(']'); t.step(1)
  check(S().mode === 'warreport', '战报里操作后仍在战报')
  t.key('Escape'); t.step(2)
  check(S().mode === 'explore', `Esc 返回探索（mode=${S().mode}）`)
}

// ---------- 8) 绘制函数不许有副作用（本轮踩过的坑） ----------
section('8) warTasks() 不许固化刷怪（绘制函数无副作用）')
{
  // 先清掉所有场景的缓存，模拟"还没进过任何图"
  const scenes = Object.values(S().scenes)
  const had = scenes.filter((sc) => sc._spawns).length
  for (const sc of scenes) delete sc._spawns
  const list = DBG().warTasks()
  const now = Object.values(S().scenes).filter((sc) => sc._spawns).length
  check(list.length > 0, `warTasks() 仍能列出 ${list.length} 条任务（不依赖刷怪缓存）`)
  check(now === 0, `调用后仍无任何场景被固化刷怪（原来有 ${had} 个，现在 ${now} 个）`)
  // 恢复：进一次图，缓存应正常建立
  const first = list[0]
  DBG().gotoScene(first.sid, 'left'); t.step(3)
  check(!!S().scenes[first.sid]._spawns, '真正进图时才建立刷怪缓存（懒加载仍然有效）')
}

// ---------- 9) 恢复生命 NPC ----------
section('9) 恢复生命 NPC（官方：宝石大厅的艾伦 / 维西岛屿的夏丽）')
{
  const names = DBG().healNpcs()
  check(names.length >= 2, `用了官方的两个 NPC 名：${names.join(' / ')}`)
  check(names.includes('艾伦') && names.includes('夏丽'), '艾伦 与 夏丽 都在名单里')

  // 安宁场景应该有恢复 NPC
  const safe = Object.values(S().scenes).find((sc) => sc.kind === 'scene' && !D.islandHasMonsters(sc.island))
  check(!!safe, '存在安宁场景')
  if (safe) {
    delete safe._spawns
    DBG().gotoScene(safe.id, 'left'); t.step(3)
    const npcs = safe._spawns.npcs
    const healer = npcs.find((n) => n.heal)
    check(!!healer, `安宁场景有恢复 NPC：${healer ? healer.name : '（无）'}`)
    if (healer) {
      // 扣血再恢复
      save.data.hp = 1; save.data.mp = 0
      DBG().doHeal(healer)
      check(save.data.hp === save.data.maxHp, `恢复后 HP 满（${save.data.hp}/${save.data.maxHp}）`)
      check(save.data.mp === save.data.maxMp, `恢复后 MP 满（${save.data.mp}/${save.data.maxMp}）`)
      // 满血再点不应崩
      DBG().doHeal(healer)
      check(save.data.hp === save.data.maxHp, '满血时再交互也安全')
    }
  }
  check(typeof DBG().healerFor(S().scenes[safe.id]) === 'string', 'healerFor 返回 NPC 名')
}

console.log(`\n结果: 通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
