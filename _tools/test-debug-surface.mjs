// 守卫：`window.__DKDbb_DEBUG__` 的**形状冻结**（方案 §6.3.1 / §7）。
//
// 【为什么需要】_tools 下 2200+ 条断言**全部**挂在调试出口的字段上（`state` / `spawns` /
// `cmdRects` / `minigames` …）。模块化重构会把 game.js 里的实现搬到 `ui/*`、`app/*`，
// 出口本身必须**一字不改**地保持这些键 —— 否则搬一个模块就会连带打红一片无关的测试，
// 让人分不清"真回归"与"出口被改坏"。
//
// 因此把重构前的键集合快照进 `_tools/debug-surface.snapshot.json`（283 个键，字典序），
// 逐字比对：**丢键**会让依赖它的测试假红 → 报红；**多键**说明有改动绕过了冻结流程 → 也报红。
// 想正当增加出口，应先改快照文件（有意的动作），而不是让测试静默放行。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { T } from './game-harness.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }

console.log('== 调试出口形状冻结 ==')

// ---- 0) 快照文件必须存在且可解析 ----
const snapPath = path.join(ROOT, '_tools', 'debug-surface.snapshot.json')
check(fs.existsSync(snapPath), '快照文件存在（_tools/debug-surface.snapshot.json）')
if (!fs.existsSync(snapPath)) { console.log(`\n通过 ${pass} 项，失败 ${fail} 项`); process.exit(1) }
const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'))
const golden = Array.isArray(snap.keys) ? snap.keys.slice().sort() : []
check(golden.length >= 200, `快照里登记了 ${golden.length} 个键（与 count 字段一致）`)

// ---- 1) 真的跑起来，取出口 ----
const t = T
t.load('game/game.js')
await T.settle()
const W = t.get('window')
const DBG = W.__DKDbb_DEBUG__
check(!!DBG && typeof DBG === 'object', 'window.__DKDbb_DEBUG__ 存在且是对象')
if (!DBG) { console.log(`\n通过 ${pass} 项，失败 ${fail} 项`); process.exit(1) }

const keys = Object.keys(DBG).sort()
check(keys.length === golden.length, `键数量不变（实测 ${keys.length}，快照 ${golden.length}）`)

// ---- 2) 逐键比对：丢键 / 多键都要报出来（报出具体名字，方便定位）----
const gset = new Set(golden), kset = new Set(keys)
const missing = golden.filter((k) => !kset.has(k))   // 快照有、运行时没有 = 丢键
const added = keys.filter((k) => !gset.has(k))        // 运行时新增 = 多键
check(missing.length === 0,
  '没有丢键（丢了 → 依赖它的测试会集体假红）',
  missing.length ? `丢了 ${missing.length} 个：${missing.join(', ')}` : '')
check(added.length === 0,
  '没有多键（多了 → 说明有改动绕过了形状冻结流程）',
  added.length ? `多了 ${added.length} 个：${added.join(', ')}` : '')

// ---- 3) 核心键必须能求值且不是 undefined（getter 不许抛）----
// 这几类是测试的地基：状态树、菜单、刷怪、行走范围、界面矩形登记表。
const CORE = ['state', 'menu', 'spawns', 'walkBounds', 'uiBBoxes', 'cmdRects', 'bagRects', 'listSlots']
for (const k of CORE) {
  let val, threw = null
  try { val = DBG[k] } catch (e) { threw = e && (e.message || e) }
  check(!threw && val !== undefined, `核心键 \`${k}\` 求值不抛且非 undefined`, threw ? String(threw) : '')
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)