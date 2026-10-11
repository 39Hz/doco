// M5-1 存档版本化与迁移。
//
// 为什么需要这个测试：
//   原来 applyObject 是把存档对象**直接覆盖**到 data 上。老存档缺新字段（visited/soya/
//   questStage 都是后来才加的），运行时读到 undefined 就可能崩；存档被改坏（数组变字符串、
//   hp 变负数）也没有任何防线。现在每个存档写 __v，读档先迁移。
//
// 本测试要证明三件事：
//   1) 老档（无 __v、缺字段）能被救回来，而不是崩掉或当成空档；
//   2) 坏数据被纠正，且**每一处改动都有记账**（R3 不静默降级）；
//   3) 迁移是**幂等**的 —— 已经是最新版本的存档再迁一次必须是 0 改动。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { T } from './game-harness.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const save = W.DKDbb.save
let pass = 0, fail = 0
const check = (c, s) => { console.log((c ? '  ✓ ' : '  ✗ ') + s); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

section('1) 当前存档带版本号')
check(save.SAVE_VERSION >= 2, `SAVE_VERSION = ${save.SAVE_VERSION}`)
check(save.data.__v === save.SAVE_VERSION, `新档 data.__v = ${save.data.__v}`)
check(save.defaults.__v === save.SAVE_VERSION, 'defaults 也带版本号（新的冒险不会写出无版本存档）')

section('2) 老存档（第一版格式：无 __v、缺 visited/soya/questStage）能救回来')
{
  // 这是"第 1 版存档"的真实形态：只有最初那几个字段
  const legacy = { playerName: '老多比', form: '龙多比', level: 7, exp: 120, hp: 80, mp: 20, maxHp: 100, maxMp: 40, gold: 350, started: true }
  const r = save.migrate(legacy)
  check(r.from === 1, `识别出源版本 = v${r.from}`)
  check(r.to === save.SAVE_VERSION, `迁移到 v${r.to}`)
  check(r.data.__v === save.SAVE_VERSION, '迁移后打上版本号')
  check(Array.isArray(r.data.visited), '补齐了 visited 数组')
  check(Array.isArray(r.data.soya), '补齐了 soya 数组')
  check(Array.isArray(r.data.defeated), '补齐了 defeated 数组')
  check(typeof r.data.items === 'object' && r.data.items !== null && !Array.isArray(r.data.items), '补齐了 items 对象')
  check(r.data.questStage === 0, `补齐了 questStage = ${r.data.questStage}`)
  check(r.data.playerName === '老多比' && r.data.gold === 350 && r.data.level === 7,
    '**原有数据没有被覆盖**（名字/金币/等级都保留）')
  check(r.changes.length > 0, `改动有记账：${r.changes.length} 处`)
}

section('3) 被改坏的存档：纠类型 + 夹数值 + 清无效引用')
{
  const broken = {
    __v: 2, playerName: '坏档', form: '龙多比', level: 0, exp: -50,
    hp: 999, maxHp: 100, mp: -3, maxMp: 40, gold: -7,
    visited: '不是数组', defeated: null, items: [], soya: [3, 5], soyaActive: 99,
    questStage: -2, playSeconds: -1, started: true,
  }
  const r = save.migrate(broken)
  check(Array.isArray(r.data.visited), `visited 由字符串纠正为数组（记：${r.changes.find((c) => c.startsWith('visited')) || '无'}）`)
  check(Array.isArray(r.data.defeated) && r.data.defeated.length === 0, 'defeated 由 null 纠正为数组')
  check(!Array.isArray(r.data.items), 'items 由数组纠正为对象')
  check(r.data.level === 1, `level 0 → ${r.data.level}（下限 1）`)
  check(r.data.exp === 0, `exp -50 → ${r.data.exp}`)
  check(r.data.gold === 0, `gold -7 → ${r.data.gold}`)
  check(r.data.mp === 0, `mp -3 → ${r.data.mp}`)
  check(r.data.hp === 100, `hp 999 被夹到上限 ${r.data.hp}`)
  check(r.data.soyaActive === null, `soyaActive 99 不在已拥有 [3,5] 中 → ${r.data.soyaActive}`)
  check(r.data.questStage === 0, `questStage -2 → ${r.data.questStage}`)
  check(r.changes.length >= 8, `共 ${r.changes.length} 处改动全部记账`)
}

section('4) 迁移是幂等的（已经是最新版 → 再迁一次 0 改动）')
{
  const fresh = JSON.parse(JSON.stringify(save.defaults))
  const r1 = save.migrate(JSON.parse(JSON.stringify(fresh)))
  const r2 = save.migrate(JSON.parse(JSON.stringify(r1.data)))
  check(r2.changes.length === 0, `第二次迁移改动 ${r2.changes.length} 处（应为 0）`)
  check(JSON.stringify(r1.data) === JSON.stringify(r2.data), '两次迁移结果完全一致')
}

// ---------- 4b) 可空字段不能被"类型检查"擦掉（第 43 轮的真实 bug） ----------
// 起因：出战索亚 soyaActive 的默认值是 null，而 fillDefaults 的规则是"类型必须和默认值一致"。
// 索亚编号是数字（70001），于是每次读档都被判成"类型不符"、擦成 null ——
// 玩家设好出战索亚、存档、读档，**索亚直接掉线**。
// 更糟的是它长得像正常迁移（记了一笔改动），只看日志不会觉得有问题。
section('4b) 可空字段（出战索亚）必须能在读档后活下来')
{
  // 合法：拥有的索亚编号（数字），不能被擦掉
  const good = Object.assign(JSON.parse(JSON.stringify(save.defaults)), {
    soya: [70001], soyaActive: 70001, started: true,
  })
  const r = save.migrate(JSON.parse(JSON.stringify(good)))
  check(r.data.soyaActive === 70001,
    `已拥有且设为出战的索亚编号被保留（${JSON.stringify(r.data.soyaActive)}）`)
  check(!r.changes.some((c) => c.startsWith('soyaActive')),
    `迁移没把合法值当改动记账（${r.changes.filter((c) => c.startsWith('soyaActive')).join('；') || '无'}）`)
  // 仍然合法：null（没带索亚）
  const none = Object.assign(JSON.parse(JSON.stringify(save.defaults)), { soya: [], soyaActive: null, started: true })
  check(save.migrate(JSON.parse(JSON.stringify(none))).data.soyaActive === null, 'null 仍然合法（不带索亚）')
  // 仍然要拦：类型真的不对（字符串）→ 回落到默认值
  const bad = Object.assign(JSON.parse(JSON.stringify(save.defaults)), { soya: [70001], soyaActive: '70001', started: true })
  const rb = save.migrate(JSON.parse(JSON.stringify(bad)))
  check(rb.data.soyaActive === null, `字符串编号仍被纠正（${JSON.stringify(rb.data.soyaActive)}）`)
  // 仍然要拦：编号不在已拥有列表里
  const notOwned = Object.assign(JSON.parse(JSON.stringify(save.defaults)), { soya: [3, 5], soyaActive: 70001, started: true })
  const rn = save.migrate(JSON.parse(JSON.stringify(notOwned)))
  check(rn.data.soyaActive === null, `没拥有的编号仍被清空（${JSON.stringify(rn.data.soyaActive)}）`)
  // 幂等性不能被破坏：保留合法值之后，再迁一次仍然是 0 改动
  const again = save.migrate(JSON.parse(JSON.stringify(r.data)))
  check(again.changes.length === 0, `保留合法值后迁移仍幂等（第二次 ${again.changes.length} 处改动）`)
}

section('5) 存档根不是对象时不崩')
{
  const r1 = save.migrate(null)
  check(Array.isArray(r1.data.visited), 'null → 当作空档并补齐字段')
  const r2 = save.migrate('随便一个字符串')
  check(Array.isArray(r2.data.visited) && r2.changes.some((c) => c.includes('根不是对象')), '字符串 → 当作空档且有记账')
  const r3 = save.migrate([1, 2, 3])
  check(Array.isArray(r3.data.visited) && r3.changes.some((c) => c.includes('根不是对象')), '数组 → 当作空档且有记账')
}

section('6) 端到端：写盘 → 读盘 → 数据一致且版本正确')
{
  const slot = 3
  save.newGame(slot)
  save.data.playerName = '迁移测试'
  save.data.level = 12
  save.data.visited.push(18, 19)
  await save.saveToSlot(slot)
  // 注意：无头测试台里没有 exe 的迷你服务器，peekFile 一定返回 null；
  // 所以这里查 localStorage 那条路径（两条路径写的是同一份 json）。
  const peeked = save.peek(slot)
  check(!!peeked && peeked.__v === save.SAVE_VERSION, `写出的存档带 __v=${peeked ? peeked.__v : '-'}`)
  // 换到别的槽再读回来
  save.newGame(1)
  const ok = await save.useSlot(slot)
  check(ok, '读档成功')
  check(save.data.playerName === '迁移测试' && save.data.level === 12, '读回来的数据与写出去的一致')
  check(save.data.visited.includes(18) && save.data.visited.includes(19), 'visited 内容完整')
  check(save.lastMigration && save.lastMigration.from === save.SAVE_VERSION,
    `最新版存档读入时源版本 = v${save.lastMigration ? save.lastMigration.from : '-'}（不应报成 v1）`)
  check(save.lastMigration && save.lastMigration.changes.length === 0,
    `最新版存档读入时 0 改动（不该被误报成"迁移过"）：${save.lastMigration ? save.lastMigration.changes.join('；') || '无' : '-'}`)
  await save.deleteSlot(slot)
}

section('7) 老存档文件真的能载入游戏（不是只过 migrate）')
{
  // 直接往 localStorage 塞一份"第一版格式"的存档，然后走 useSlot 读它
  const slot = 2
  const legacy = { playerName: '远古多比', form: '龙多比', level: 5, exp: 30, hp: 60, mp: 10, maxHp: 90, maxMp: 30, gold: 200, started: true }
  W.localStorage.setItem(save.slotKey(slot), JSON.stringify(legacy))
  const ok = await save.useSlot(slot, { fromFile: false })
  check(ok, '老存档被读入')
  check(save.data.playerName === '远古多比', '老存档的名字保留')
  check(Array.isArray(save.data.visited) && Array.isArray(save.data.soya), '缺的字段被补齐，游戏后续代码不会读到 undefined')
  check(save.data.__v === save.SAVE_VERSION, '读入后已升级到当前版本')
  check(save.lastMigration.from === 1 && save.lastMigration.changes.length > 0,
    `记账：v${save.lastMigration.from} → v${save.lastMigration.to}，${save.lastMigration.changes.length} 处`)
  await save.deleteSlot(slot)
}

section('8) engine.js 里不应再有"直接覆盖"的老写法')
{
  const src = fs.readFileSync(path.join(ROOT, 'game', 'engine', 'engine.js'), 'utf8')
  check(/migrate\s*\(o\)\s*\{/.test(src), 'migrate() 已实现')
  check(/applyObject\(o\)\s*\{[\s\S]{0,400}?this\.migrate\(o\)/.test(src), 'applyObject 走 migrate')
  check(!/Object\.assign\(this\.data,\s*o\)/.test(src), '不再直接 Object.assign(this.data, o)')
}

console.log(`\n结果: 通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
