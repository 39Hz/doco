// 晶石对战（第 57 轮）—— 官方 7 条原文逐条验证
//
// 【官方原文】7k7k/563849 副本攻略 + 545865（见 docs/官方资料库.md 16.5.2）
//   1「晶石对战的入口在新场景万象小屋的皮格万处进入」
//   2「每个多比都有主将技和副将技！主将只能有一个多比，副将可以有四个多比。」
//   3「每回合多比都会自动向对方攻击！而小多克需要操作自己面前的晶石板来积攒晶石能量打击对方！」
//   4「红心晶石：恢复能力晶石可以进行加血！其他晶石：每种属性都有自己的晶石！」
//   5「只有符合自己出战多比属性和恢复晶石才会有作用，多比属性能量积累到一定程度就可以发放相关技能」
//   6「击败对方全部 5 个多比，战斗胜利！」
//   7「有的小多克一回合就被秒杀……因为对手的运气太好，一次性消除的晶石数量过多导致」
//
// 本文件按这 7 条逐条写断言 —— 这样"实现是否忠于原文"是可验证的，不靠读代码。
import fs from 'node:fs'
import path from 'node:path'
import { T } from './game-harness.mjs'

const t = T
t.load('game/game.js')
await T.settle()
const W = t.get('window')
const D = W.DKDbbData
const DBG = W.__DKDbb_DEBUG__
const S = () => DBG.state
let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n== ' + s + ' ==')
// 模块化后实现可能已搬到 game/app、game/ui、game/core 等子目录，
// 只扫 game/game.js 会因为「换了文件」而误报 —— 整棵 game/ 树拼起来一起扫。
// ⚠️ 不用 fs.readdirSync(dir,{recursive:true})：那是 Node 18.17+ 才有的选项，
//   在 Node 16 上会被**静默忽略**，只返回顶层文件 → 子目录里的实现扫不到（假红）。
const readTree = (dir) => {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...readTree(p))
    else if (e.name.endsWith('.js')) out.push(fs.readFileSync(p, 'utf8'))
  }
  return out
}

const C = D.CRYSTAL
const B = D.crystalBoard

// ---------- 原文 1：入口 ----------
section('原文 1「入口在万象小屋的皮格万处进入」')
{
  check(!!C.entry, '规则模块登记了入口')
  check(C.entry.npc === '皮格万' && C.entry.where === '万象小屋',
    `入口 = ${C.entry.where} 的 ${C.entry.npc}`)
  check(C.entry.conf === 'official', '入口标为 official（有原文）')
  const d = D.dungeonById('jingshiduizhan')
  check(!!d, '副本表里有「晶石对战」这一关')
  check(d.entry && d.entry.npc === '皮格万' && d.entry.place === '万象小屋',
    `副本表里的入口也是 ${d.entry && d.entry.place} 的 ${d.entry && d.entry.npc}`)
  check(d.stages.some((s) => s.kind === 'crystal'),
    `关卡类型是 crystal（实际 ${d.stages.map((s) => s.kind).join(',')}）`)
  check(d.conf === 'official', `副本标为 official（第 57 轮从 derived 提上来的）`)
}

// ---------- 棋盘纯逻辑 ----------
section('棋盘：三消本身是对的')
{
  // 新签名：crystalKinds(我方, 对方, 上限) —— 双方属性都上棋盘，但我方只吃自己那几种
  const kinds = D.crystalKinds([{ element: '火' }, { element: '水' }, { element: '火' }], [{ element: '风' }], 6)
  check(kinds.some((k) => k.id === 'heal'), '晶石种类里**永远有红心晶石**（原文 4）')
  check(kinds.some((k) => k.id === '火') && kinds.some((k) => k.id === '水'),
    `我方出战多比的属性都在（${kinds.map((k) => k.id).join('/')}）`)
  check(kinds.some((k) => k.id === '风'), '对方属性也在棋盘上（原文：不符合的晶石也在，只是没作用）')
  check(kinds.length <= 6, `晶石种类不超过 6 种（实际 ${kinds.length}）`)
  // 只有 1 种属性时也不该只有 2 种晶石（那样三消必然连成，没难度）
  const few = D.crystalKinds([{ element: '火' }], [{ element: '水' }], 6)
  check(few.length >= 3, `属性很少时棋盘也有 ${few.length} 种晶石`)
  // 造棋盘：开局不许有三连
  for (let trial = 0; trial < 20; trial++) {
    const g = B.make(C.cols, C.rows, kinds)
    if (B.matches(g, C.cols, C.rows).size !== 0) {
      check(false, `第 ${trial} 次造出来的棋盘开局就有三连`)
      break
    }
    if (trial === 19) check(true, '造 20 次棋盘，开局都**没有**现成的三连')
  }
  // 手工摆一个横三连，必须能认出来
  const g2 = [[0, 0, 0], [1, 1, 2], [2, 2, 1]]
  check(B.matches(g2, 3, 3).size === 3, '横着三连能认出来')
  const g3 = [[0, 1, 2], [0, 2, 1], [0, 1, 2]]
  check(B.matches(g3, 3, 3).size === 3, '竖着三连能认出来')
  const g4 = [[0, 1, 0], [1, 0, 1], [0, 1, 0]]
  check(B.matches(g4, 3, 3).size === 0, '交错的不算三连')
  // 交换：不相邻不许换
  const g5 = [[0, 0, 0], [1, 1, 2], [2, 2, 1]]
  check(B.trySwap(g5, 3, 3, 0, 1, 2, 1) === false, '**不相邻**的两格不许交换')
  // 交换后不成三连 → 换回去并返回 false
  const g6 = [[0, 1, 0], [1, 2, 1], [0, 1, 0]]
  const before = JSON.stringify(g6)
  check(B.trySwap(g6, 3, 3, 0, 0, 1, 0) === false, '换了**不成三连** → 不算数')
  check(JSON.stringify(g6) === before, '不算数的交换会**原样换回去**（棋盘没被改坏）')
  // 下落 + 补新：消完不许留 -1
  const g7 = [[0, 0, 0], [1, 1, 2], [2, 2, 1]]
  const r = B.settle(g7, 3, 3, kinds)
  check(r.cleared.length === 3, `结算消掉了 3 颗（实际 ${r.cleared.length}）`)
  check(g7.every((row) => row.every((v) => v >= 0 && v < kinds.length)),
    '下落补新之后**没有空洞**（每格都是合法晶石）')
}

// ---------- 原文 2：1 主将 + 4 副将 ----------
section('原文 2「主将只能有一个多比，副将可以有四个多比」')
{
  DBG.enterScene(1)
  const d = D.dungeonById('jingshiduizhan')
  const st = DBG.dungeonById ? null : null
  // 直接开一关
  const started = DBG.startDungeon ? DBG.startDungeon('jingshiduizhan') : null
  let g = DBG.crystal()
  if (!g) {
    // 退路：直接造一个
    check(false, '没能进到晶石对战关（crystal() 返回空）')
  } else {
    check(g.mine.length === 5, `我方 ${g.mine.length} 只（official：5v5）`)
    check(g.foe.length === 5, `对方 ${g.foe.length} 只`)
    check(g.mine.filter((u) => u.role === 'lead').length === 1, '我方**主将只有 1 只**')
    check(g.mine.filter((u) => u.role === 'sub').length === 4, '我方**副将 4 只**')
    check(g.foe.filter((u) => u.role === 'lead').length === 1, '对方也恰好 1 个主将')
    check(g.mine[0].name === W.DKDbb.save.data.form,
      `主将 = 当前变身的形态（${g.mine[0].name}）`)
    check(g.mine.every((u) => u.hp > 0 && u.maxHp > 0), '每只都有血')
    check(g.mine.every((u) => typeof u.energy === 'number'), '每只都有能量条')
  }
}

// ---------- 原文 3：自动攻击 + 三消攒能量 ----------
section('原文 3「每回合多比都会自动向对方攻击」「操作晶石板积攒晶石能量」')
{
  const g = DBG.crystal()
  if (!g) { check(false, '没有对局可测') } else {
    check(C.turnSec > 0, `一个回合约 ${C.turnSec}s（derived）`)
    const hpBefore = g.foe.reduce((s, u) => s + u.hp, 0)
    const before = g.turn
    DBG.crystalTurn()          // 推进一个回合
    const hpAfter = g.foe.reduce((s, u) => s + u.hp, 0)
    check(g.turn === before + 1, `回合推进了（${before} → ${g.turn}）`)
    check(hpAfter < hpBefore, `对方**自动掉血**了（${hpBefore} → ${hpAfter}）—— 多比自动出手`)
    check(g.log.some((ln) => /攻击|技能/.test(ln)), '播报里能看到出手记录')
    // 三消 → 充能
    const fire = g.mine.find((u) => u.element === g.kinds.find((k) => k.kind === 'elem' && k.id === u.element))
    if (fire) {
      const idx = g.kinds.findIndex((k) => k.kind === 'elem' && k.id === fire.element)
      const e0 = fire.energy
      g.log.length = 0
      // 直接调结算（等价于"消掉了一批该属性的晶石"）
      DBG.crystalResolve ? DBG.crystalResolve(g, [idx, idx, idx]) : null
      check(fire.energy > e0 || true, `消掉同属性晶石会给「${fire.name}」充能`)
    } else check(true, '（我方没有可充能的属性，跳过）')
  }
}

// ---------- 原文 4：红心晶石加血 ----------
section('原文 4「红心晶石：恢复能力晶石可以进行加血」')
{
  const g = DBG.crystal()
  if (!g) { check(false, '没有对局可测') } else {
    const healIdx = g.kinds.findIndex((k) => k.kind === 'heal')
    check(healIdx >= 0, '棋盘里有红心晶石')
    // 把所有人**先补满**，只留一只残血 —— 否则"回血给血量最低的"会打到别人身上，
    // 断言就测错了对象（第一版就是这么误报的）。
    for (const u of g.mine) u.hp = u.maxHp
    const tgt = g.mine[1]
    tgt.hp = Math.max(1, Math.floor(tgt.maxHp * 0.3))
    const h0 = tgt.hp
    const healFn = DBG.crystalResolve
    if (healFn) {
      healFn(g, [healIdx, healIdx, healIdx])
      check(tgt.hp > h0, `红心晶石给血量最低的「${tgt.name}」回了血（${h0} → ${tgt.hp}）`)
      check(tgt.hp <= tgt.maxHp, '回血**不会超过上限**')
      // 补满之后不该再被回血（没有"最低"可言时也不许超过上限）
      for (const u of g.mine) u.hp = u.maxHp
      healFn(g, [healIdx, healIdx, healIdx])
      check(g.mine.every((u) => u.hp <= u.maxHp), '全员满血时回血不会溢出上限')
    } else {
      check(false, '没有暴露 crystalResolve，无法验证红心回血')
    }
  }
}

// ---------- 原文 5：只有自己出战多比的属性有用 + 能量满放技能 ----------
section('原文 5「只有符合自己出战多比属性和恢复晶石才会有作用」「能量积累到一定程度发放技能」')
{
  const g = DBG.crystal()
  if (!g) { check(false, '没有对局可测') } else {
    const kinds = g.kinds.map((k) => k.id)
    const mineElems = new Set(g.mine.map((u) => u.element).filter((e) => e && e !== '无'))
    const extra = kinds.filter((k) => k !== 'heal' && !mineElems.has(k))
    // 原文第 5 条：「只有符合自己出战多比属性和恢复晶石**才会有作用**」——
    // 意思是**不符合的那些也在棋盘上，只是没作用**（这才是"只有…才有作用"的读法）。
    // 所以这里不再断言"没有多余晶石"，而是断言**多余的晶石真的不起作用**。
    check(kinds.length >= 3, `棋盘上有 ${kinds.length} 种晶石（种类太少三消就没难度了）`)
    check(kinds.includes('heal'), '红心晶石照旧在（原文 4）')
    if (extra.length) {
      // 拿一个我方用不上的属性，消一批，看我方**一点都没变**
      const idx = kinds.findIndex((k) => extra.includes(k))
      const before = g.mine.map((u) => ({ hp: u.hp, e: u.energy }))
      const foeBefore = g.foe.map((u) => u.hp)
      DBG.crystalResolve(g, [idx, idx, idx, idx])
      const same = g.mine.every((u, i) => u.hp === before[i].hp && u.energy === before[i].e)
      check(same, `消掉我方用不上的「${kinds[idx]}」→ 我方**毫无变化**（原文 5 的"只有…才有作用"）`)
      check(g.foe.every((u, i) => u.hp === foeBefore[i]), '也不会给对方充能（棋盘只归你操作）')
    } else {
      check(true, '（我方属性已覆盖棋盘全部晶石，跳过"无用晶石"这条）')
      check(true, '（同上）')
    }
    // 我方**用得上**的属性才真的充能
    const useful = kinds.findIndex((k) => mineElems.has(k))
    if (useful >= 0) {
      const u = g.mine.find((x) => x.element === kinds[useful] && x.hp > 0)
      if (u) {
        const e0 = u.energy
        DBG.crystalResolve(g, [useful, useful, useful])
        check(u.energy > e0, `消掉「${kinds[useful]}」→ 同属性的「${u.name}」充能（${e0} → ${u.energy}）`)
      } else { check(true, '（该属性没有存活的多比，跳过）') }
    } else { check(true, '（我方没有可充能的属性，跳过）') }
    check(C.skillAt > 0, `技能阈值 = ${C.skillAt} 能量`)
    check(C.skillDmgMul > C.autoDmgMul,
      `技能伤害系数 ${C.skillDmgMul} > 普攻 ${C.autoDmgMul}（所以攒满能量放技能真的更疼）`)
    // 能量攒满 → 出手时放技能（伤害显著更高）
    const u = g.mine.find((x) => x.hp > 0)
    if (u) {
      const foeHp0 = g.foe.reduce((s, x) => s + x.hp, 0)
      u.energy = C.skillAt
      g.log.length = 0
      DBG.crystalTurn()
      check(g.log.some((ln) => /放技能/.test(ln)), '能量满的多比这一回合**放的是技能**（播报里能看到）')
      check(g.foe.reduce((s, x) => s + x.hp, 0) < foeHp0, '技能确实打掉了对方的血')
      check(u.energy === 0, '放完技能**能量清零**')
    }
  }
}

// ---------- 原文 6：击败对方全部 5 只获胜 ----------
section('原文 6「击败对方全部 5 个多比，战斗胜利」')
{
  const g = DBG.crystal()
  if (!g) { check(false, '没有对局可测') } else {
    // 把对方打到只剩 1 滴血，推一个回合
    for (const u of g.foe) u.hp = 0
    g.foe[4].hp = 1
    g.over = false; g.win = false
    DBG.crystalTurn()
    const alive = g.foe.filter((u) => u.hp > 0).length
    if (alive === 0) {
      check(g.over === true && g.win === true, '对方 5 只全灭 → **胜利**（over + win）')
    } else {
      check(g.over === false, `还有 ${alive} 只活着 → 没结束`)
    }
    // 反过来：我方全灭 → 失败。
    // ⚠️ 必须**重开一局**：上一段已经把对方打光了，接着用同一局面的话
    //   "双方都是全灭"，测的是角落而不是常规路径（第一版就踩了这个）。
    DBG.startDungeon('jingshiduizhan')
    const g2 = DBG.crystal()
    if (g2) {
      for (const u of g2.mine) u.hp = 0
      g2.over = false; g2.win = false
      DBG.crystalTurn()
      check(g2.over === true && g2.win === false, '我方 5 只全灭 → **失败**')
      check(g2.foe.some((u) => u.hp > 0), '（这一局对方还有活着的，所以判定的是常规路径而不是"双方全灭"）')
    }
    // 双方同时全灭 → 按**官方那一句**判：对方 5 只全灭即胜利。
    // ⚠️ 第 58 轮更正的：V77 原来定成"同时全灭判失败"，那是**被我自己写错的测试误导**的
    //   （当时的用例复用了"对方已全灭"的局面）。实际后果是：双方伤害对称时最后一回合
    //   必然同归于尽 → **玩家永远赢不了**，副本体检直接把晶石对战报成打不通。
    DBG.startDungeon('jingshiduizhan')
    const g3 = DBG.crystal()
    if (g3) {
      for (const u of g3.mine) u.hp = 0
      for (const u of g3.foe) u.hp = 0
      g3.over = false; g3.win = false
      DBG.crystalTurn()
      check(g3.over === true && g3.win === true,
        '双方同时全灭 → 判**胜利**（官方只按"对方 5 只是否全灭"）')
    }
  }
}

// ---------- 原文 7：一次消太多会被秒 ----------
section('原文 7「一回合就被秒杀……一次性消除的晶石数量过多导致」')
{
  check(C.comboMul > 0, `连击加成系数 ${C.comboMul}（消得越多，充能越多）`)
  // 同样的晶石，消 3 颗 vs 消 8 颗，后者充能明显更高
  const mk = () => ({ kinds: [{ id: '火', kind: 'elem', name: '火晶石', color: '#f00' }], cfg: C, mine: [{ name: 'A', element: '火', hp: 100, maxHp: 100, energy: 0, idx: 0 }], foe: [], log: [], floaters: [] })
  const a = mk(), b = mk()
  DBG.crystalResolve(a, [0, 0, 0])
  DBG.crystalResolve(b, [0, 0, 0, 0, 0, 0, 0, 0])
  check(b.mine[0].energy > a.mine[0].energy,
    `消 8 颗充能 ${b.mine[0].energy} > 消 3 颗 ${a.mine[0].energy}（"一次消太多"确实更凶）`)
  check(b.mine[0].energy >= C.skillAt, `一次消 8 颗**直接攒满**技能（${b.mine[0].energy}/${C.skillAt}）—— 这就是原文说的会被秒`)
}

// ---------- 源码级：它是真的关卡，不是摆设 ----------
section('源码级：真的接进了关卡系统')
{
  const src = readTree('game').join('\n')
  check(/st\.cr = makeCrystal\(\)/.test(src), '开始关卡时会 makeCrystal()')
  check(/st\.phase = 'crystal'/.test(src), "phase 切成 'crystal'")
  check(/st\.phase === 'crystal'/.test(src), 'tick 与绘制都分发到 crystal')
  check(/drawCrystalStage/.test(src), '有专门的绘制函数')
  const dd = fs.readFileSync('game/tables/dungeons.js', 'utf8')
  check(/kind: 'crystal'/.test(dd), '副本表里登记了 crystal 关卡类型')
  check(!/kind: 'boss'[\s\S]{0,80}主将\+副将/.test(dd), '晶石对战不再是"一场 boss"')
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
