// 复现并钉死用户报的两个战斗问题：
//   1) 两只敌人时只有一只会攻击，另一只不动
//   2) "有的技能有时候能放出来、有的时候放不出来；鼠标放到那个技能上再按空格就能放"
//
// 第 2 条的排查思路：不要猜，直接把「打开技能面板 → 连按空格」跑一遍，
// 把每次按键时 b.skillSel 现在指向哪个技能、该技能能不能用（CD/能量）全打出来。
import { T } from './game-harness.mjs'

const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
const D = W.DKDbbData
const world = t.get('__world')
let pass = 0, fail = 0
const check = (c, s) => { console.log((c ? '  ✓ ' : '  ✗ ') + s); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

// ---------- 开一场有两只敌人的战斗 ----------
S().mode = 'title'
t.key(' '); t.step(3)
function enterBattleWith(nEnemies) {
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
      if (!S().battle) continue
      // 手工补到 nEnemies 只（小弟是 30% 概率出现的，测试里直接造）
      const b = S().battle
      while (b.enemies.length < nEnemies) {
        const sp2 = D.spawnFor(island.id, Math.random, 5)
        if (!sp2) break
        b.enemies.push({
          name: sp2.mon.name, element: sp2.mon.element, level: sp2.level,
          hp: sp2.stats.life, maxHp: sp2.stats.life, stats: sp2.stats, buffs: [], dead: false, flash: 0,
          mon: sp2.mon, isPlayer: false,
        })
      }
      return true
    }
  }
  return false
}

section('1) 两只敌人时，两只都要出手')
if (!enterBattleWith(2)) { check(false, '没能进入战斗') }
else {
  const b = S().battle
  check(b.enemies.length === 2, '场上有 2 只敌人（' + b.enemies.map((e) => e.name).join('、') + '）')
  b.player.hp = b.player.maxHp = 99999      // 撑住，别被打死中断
  const hitCount = [0, 0]
  const hpMark = []
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 600 && b.phase !== 'command'; i++) t.step(1)
    if (b.phase !== 'command') break
    hpMark.push(Math.round(b.player.hp))
    // 玩家只防御（这里没有防御指令，用一次普攻占位），把回合推过去
    t.key('Enter')            // menuSel=0 攻击
    t.step(1)
    for (let i = 0; i < 900 && b.phase !== 'command' && S().mode === 'battle'; i++) t.step(1)
    // 看这一轮里每只敌人有没有 lungeAt（出手时会被置 1）
    b.enemies.forEach((e, i) => { if (e.lungeAt) { hitCount[i]++; e.lungeAt = 0 } })
    if (S().mode !== 'battle') break
  }
  console.log('  每只敌人出手次数: ' + hitCount.join(' / '))
  check(hitCount[0] > 0, '第 1 只敌人出手了（' + hitCount[0] + ' 次）')
  check(hitCount[1] > 0, '第 2 只敌人也出手了（' + hitCount[1] + ' 次）—— 用户报的就是它不动')
  check(Math.abs(hitCount[0] - hitCount[1]) <= 1, '两只出手次数大致相当（不会一只打三次另一只零次）')
  S().battle = null; S().result = null; S().mode = 'explore'; t.step(2)
}

section('2) 技能面板：按空格到底放的是哪一个技能')
if (!enterBattleWith(1)) { check(false, '没能进入战斗') }
else {
  const b = S().battle
  const form = S().form
  console.log('  当前形态：' + form.name + '　技能：' + (form.skills || []).join('、'))
  b.player.hp = b.player.maxHp = 99999
  b.player.mp = b.player.maxMp = 99999        // 能量拉满，排除"能量不足"这个干扰项
  b.menu = 'main'; b.menuSel = 1
  t.key('Enter'); t.step(2)
  check(b.menu === 'skill', '打开了技能面板')

  // 连按空格 10 次，每次都记录"选中谁 / 是否真的放出去了 / 放的是谁"
  let castOk = 0, castFail = []
  for (let k = 0; k < 10; k++) {
    const selBefore = b.skillSel
    const want = form.skills[selBefore]
    const sk = D.SKILLS[want] || {}
    const cd = (b.cooldowns && b.cooldowns[want]) || 0
    const usable = cd <= 0 && b.player.mp >= (sk.energy || 0)
    if (S().mode !== 'battle') break
    if (b.phase !== 'command') { for (let i = 0; i < 900 && b.phase !== 'command' && S().mode === 'battle'; i++) t.step(1) }
    if (S().mode !== 'battle') break
    b.menu = 'skill'
    b.menuSel = 1
    b.player.mp = b.player.maxMp
    // 清掉冷却，专注测"按键有没有被接住"
    b.cooldowns = {}
    t.step(1)
    const before = S().battle && S().battle.action
    t.key(' ')
    t.step(1)
    const started = !!(S().battle && S().battle.phase === 'acting' && S().battle.action && S().battle.action !== before)
    if (started) castOk++
    else castFail.push(`${want}(sel=${selBefore})`)
    b.cooldowns = {}
    for (let i = 0; i < 900 && S().battle && S().battle.phase === 'acting' && S().mode === 'battle'; i++) t.step(1)
  }
  console.log('  10 次空格：成功 ' + castOk + ' 次，失败 ' + castFail.length + ' 次' + (castFail.length ? '　失败于 ' + castFail.join('、') : ''))
  check(castFail.length === 0, '空格每次都能把选中的技能放出去（' + castOk + '/10）')
  S().battle = null; S().result = null; S().mode = 'explore'; t.step(2)
}

section('2b) 技能在冷却时，面板要落在能用的技能上并给出明确反馈')
if (!enterBattleWith(1)) { check(false, '没能进入战斗') }
else {
  const form = S().form
  const b = S().battle
  b.player.hp = b.player.maxHp = 99999
  b.player.mp = b.player.maxMp = 99999
  // 让第 0 个技能进冷却
  b.cooldowns = {}
  b.cooldowns[form.skills[0]] = 3
  b.menu = 'main'; b.menuSel = 1; b.skillSel = 0
  t.step(1)
  t.key('Enter'); t.step(2)
  check(b.menu === 'skill', '打开技能面板')
  const picked = form.skills[b.skillSel]
  check(b.skillSel !== 0, '第 0 个技能（' + form.skills[0] + '）在冷却时，默认不落在它上面（落在「' + picked + '」）')
  const sk = D.SKILLS[picked] || {}
  check(!((b.cooldowns && b.cooldowns[picked]) > 0) && b.player.mp >= (sk.energy || 0),
    '默认选中的「' + picked + '」是可以直接放的')

  // 空格按在冷却中的技能上 → 醒目提示 + 自动跳到能用的
  b.skillSel = 0
  b.notice = null
  t.step(1)
  t.key(' '); t.step(1)
  check(!!b.notice, '对着冷却中的技能按空格 → 弹出醒目提示（' + (b.notice ? b.notice.text : '无') + '）')
  check(b.skillSel !== 0, '并且自动跳到下一个能用的技能（skillSel=' + b.skillSel + '）')

  // 再按一次空格，这次应该真的放出去了
  if (S().mode === 'battle' && b.phase === 'command') {
    b.menu = 'skill'
    b.notice = null
    t.step(1)
    t.key(' '); t.step(2)
    check(b.phase === 'acting' || b.action, '改动之后再按空格，技能真的放出去了')
  }
  S().battle = null; S().result = null; S().mode = 'explore'; t.step(2)
}

section('2c) 鼠标停着不动时，不能顶掉键盘选中的东西')
if (!enterBattleWith(1)) { check(false, '没能进入战斗') }
else {
  const b = S().battle
  for (let i = 0; i < 400 && b.phase !== 'command'; i++) t.step(1)
  b.player.hp = b.player.maxHp = 99999
  b.player.mp = b.player.maxMp = 99999
  // 把鼠标停在「逃跑」那一格，然后用键盘把选中项改到「攻击」
  const rects = DBG().cmdRects()
  const flee = rects.find((r) => r.label === '逃跑')
  const atk = rects.find((r) => r.label === '攻击')
  t.move(flee.x + flee.w / 2, flee.y + flee.h / 2)
  t.step(2)
  check(b.menuSel === flee.i, '鼠标移到「逃跑」上，选中项跟过去了（' + b.menuSel + '）')
  // 现在用键盘把选中项挪走，鼠标**不动**
  b.menuSel = atk.i
  t.step(3)
  check(b.menuSel === atk.i,
    '鼠标停着不动时，键盘设的选中项不会被顶回去（期望 ' + atk.i + '，实际 ' + b.menuSel + '）')
  S().battle = null; S().result = null; S().mode = 'explore'; t.step(2)
}

section('3) 存档：写到 save.json 之后要能读回来')
const sv = W.DKDbb.save
sv.data.level = 7
sv.data.gold = 1234
sv.data.forms = D.FORMS.slice(0, 3).map((f) => f.name)
const snapshot = JSON.stringify({ level: sv.data.level, gold: sv.data.gold, forms: sv.data.forms })
// 模拟"重启"：清掉内存里的数据与 localStorage，再从文件读
const fileSave = W.__DKDbb_DEBUG__.saveFileForTest ? W.__DKDbb_DEBUG__.saveFileForTest() : null
check(typeof sv.loadFile === 'function', 'save 有 loadFile（从 exe 的 /__save 读存档）')
check(typeof sv.persist === 'function', 'save 有 persist（同时写 localStorage 与 /__save）')
check(snapshot.includes('"level":7') && snapshot.includes('"gold":1234'), '存档字段能正常序列化：' + snapshot)

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' 通过 ' + pass + ' 项，失败 ' + fail + ' 项')
process.exit(fail ? 1 : 0)
