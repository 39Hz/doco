// 难度层（第 43 轮，用户要求"游戏难度还是太难，请调整至简单模式"）。
//
// 为什么值得单独一个测试文件：
//   难度层是**唯一一处"故意偏离推算原值"的地方** —— 它会同时影响战斗伤害、命中和
//   8 个可玩小游戏的过关要求。任何一处接漏了（比如某个小游戏忘了走 needOf），
//   玩家感受到的就是"说好了简单模式，某一关还是过不去"，而这种漏接从代码上看不出来。
// 所以这里逐个关卡**问游戏自己的有效值**，而不是抄倍率常量 ——
// 抄常量的话改倍率时测试会跟着一起改，等于没测。
import { T } from './game-harness.mjs'

const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const DBG = W.__DKDbb_DEBUG__
let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n== ' + s + ' ==')

// ---------- 1) 默认档位 ----------
section('1) 默认就是简单模式（用户要求打开就能玩）')
check(DBG.difficulty() === 'easy', `新存档默认难度是简单（实际 ${DBG.difficulty()}）`)
{
  const info = DBG.difficultyInfo()
  check(info.name === '简单', `档位有中文名（${info.name}）`)
  check(info.atkMul > 1, `我方伤害有加成（×${info.atkMul}）`)
  check(info.defMul < 1, `我方受伤有减免（×${info.defMul}）`)
  check(info.needMul < 1, `小游戏过关要求更少（×${info.needMul}）`)
  check(info.windowMul > 1, `小游戏判定窗口更宽（×${info.windowMul}）`)
  check(typeof info.note === 'string' && info.note.length > 10, '档位自带说明文案（要能显示给玩家）')
}

// ---------- 2) 切换与持久化 ----------
section('2) 切换（N 键）与存档字段')
{
  check(DBG.setDifficulty('normal') === true, '切到普通档')
  check(DBG.difficulty() === 'normal', '当前档位已变')
  check(DBG.toggleDifficulty() === 'easy', 'toggle 能在两档之间来回')
  check(DBG.toggleDifficulty() === 'normal', '再 toggle 回到普通')
  check(DBG.setDifficulty('不存在的档位') === false, '非法档位被拒绝（不静默改成别的）')
  check(DBG.difficulty() === 'normal', '拒绝之后档位没被改动')
  DBG.setDifficulty('easy')
}

// ---------- 3) 每个小游戏的有效过关要求都要跟着难度走 ----------
section('3) 8 个可玩小游戏的过关要求都要接上难度层')
{
  DBG.setDifficulty('normal')
  const normal = DBG.needs()
  DBG.setDifficulty('easy')
  const easy = DBG.needs()
  check(Object.keys(normal).length >= 7, `探针覆盖 ${Object.keys(normal).length} 个关卡`)
  for (const k of Object.keys(normal)) {
    if (k === 'skiPass') {
      check(easy[k] < normal[k], `滑雪跳台的过关分：普通 ${normal[k]} → 简单 ${easy[k]}`)
      continue
    }
    check(easy[k] <= normal[k], `关卡「${k}」简单档要求不高于普通档（${normal[k]} → ${easy[k]}）`)
    check(easy[k] >= 2, `关卡「${k}」简单档仍有下限 2，不会变成没得玩（${easy[k]}）`)
  }
  // 至少要有几个是**真的变少了**，否则说明只有部分关卡接上了
  const shrunk = Object.keys(normal).filter((k) => k !== 'skiPass' && easy[k] < normal[k])
  check(shrunk.length >= 5, `至少 5 个关卡的要求实际变少（实际 ${shrunk.length}：${shrunk.join('、')}）`)
}

// ---------- 4) 真实战斗里的期望伤害 ----------
section('4) 简单模式：打得更痛、挨得更少（用真实战斗算，不抄倍率）')
{
  const S = () => DBG.state
  const world = t.get('__world')
  // 进一场真实战斗：走"大地图 → 地点 → 场景 → 打第一只怪"的正常路径
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
        const sp = DBG.spawns
        if (!sp || !sp.monsters.length) continue
        DBG.startBattle(sp.monsters[0])
        if (S().battle) return true
      }
    }
    return false
  }
  DBG.setDifficulty('normal')
  const ok = enterBattle()
  check(ok, '能进入一场真实战斗')
  const probe = DBG.damageProbe()
  if (!ok || !probe) {
    check(false, '拿到期望伤害探针（damageProbe）', String(probe))
  } else {
    const normalDeal = probe.playerDeals
    const normalTake = probe.enemyDeals
    check(normalDeal > 0 && normalTake > 0, `普通档期望伤害有效（打出 ${normalDeal} / 承受 ${normalTake}）`)
    DBG.setDifficulty('easy')
    const easyProbe = DBG.damageProbe()
    check(easyProbe.playerDeals > normalDeal,
      `简单模式我方打得更痛（${normalDeal} → ${easyProbe.playerDeals}）`)
    check(easyProbe.enemyDeals < normalTake,
      `简单模式我方挨得更少（${normalTake} → ${easyProbe.enemyDeals}）`)
    DBG.setDifficulty('normal')
    check(DBG.damageProbe().playerDeals === normalDeal, '切回普通档后伤害回到原值（档位真的在生效）')
    DBG.setDifficulty('easy')
    // 小怪一招打不死我方 —— 这是"简单"的最低要求
    const sv = t.get('DKDbb').save
    const hp = sv.data.maxHp
    check(DBG.damageProbe().enemyDeals < hp,
      `简单模式下小怪一下打不空血（${DBG.damageProbe().enemyDeals} < ${hp}）`)
  }
}

// ---------- 5) 说明文案不能吹牛：note 里的数字要和实际倍率一致 ----------
section('5) 界面文案与实际数值一致（不能写着×1.4 实际是别的）')
{
  for (const id of ['easy', 'normal']) {
    DBG.setDifficulty(id)
    const d = DBG.difficultyInfo()
    const nums = (d.note.match(/[\d.]+/g) || []).map(Number)
    const expect = [d.atkMul, d.defMul, d.needMul, d.windowMul].filter((v) => v !== 1)
    const missing = expect.filter((v) => !nums.includes(v))
    check(missing.length === 0,
      `「${d.name}」的说明里写全了非 1 的倍率（缺 ${missing.join('、') || '无'}）`)
  }
  DBG.setDifficulty('easy')
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
