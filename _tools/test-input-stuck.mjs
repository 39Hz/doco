// 输入卡住回归 —— 第 55 轮
//
// 【为什么有这个测试】用户原话：「**不是卡死就是直接点什么都不动了**」。
// 根因：输入状态靠各分支自己在特定路径上清帧（`input.clearFrame()` + `M.endFrame()`，21 处），
//   而 `update()` 里有 **39 处 return** —— 任何一条提前 return 都会跳过清帧：
//     · `M.clicked` 永远为 true → 点一下之后**点什么都不动**
//     · `pressed` 里那个键永远挂着 → 键盘不停重复触发
// 修法：在帧末（`loop` 里 update 返回之后）**统一兜底清一次**，不可能漏。
// 本文件钉住：跑一帧后 `M.clicked` 必须回到 false；多帧连跑不能让点击状态粘住。
import { T } from './game-harness.mjs'
const t = T
t.load('game/game.js')
await T.settle()
const W = t.get('window')
const DBG = () => W.__DKDbb_DEBUG__
const S = DBG().state
const M = W.DKDbbMouse

let ok = 0, bad = 0
const check = (c, label, extra) => {
  if (c) { ok++; console.log(`  ✓ ${label}`) } else { bad++; console.log(`  ✗ ${label}${extra ? '  → ' + extra : ''}`) }
}
const section = (s) => console.log(`\n=== ${s} ===`)

section('鼠标点击状态会被清掉（"点什么都不动"的核心）')
check(!M.clicked, `初始 M.clicked = ${M.clicked}`)
M.clicked = true
T.step(1)
check(M.clicked === false, '注入一次点击后，跑 1 帧 → M.clicked 回到 false（不会粘住）')

// 连跑 5 帧，模拟"按住不放/快速连点"：每帧注入点击都必须被消费
let stuck = 0
for (let i = 0; i < 5; i++) {
  M.clicked = true
  T.step(1)
  if (M.clicked) stuck++
}
check(stuck === 0, '连续 5 帧注入点击，没有任何一帧粘住', `粘住 ${stuck} 帧`)

section('各种模式下都不会粘住')
const modes = ['explore', 'zukan', 'bag', 'skillpanel', 'worldmap', 'title']
for (const mode of modes) {
  const prev = S.mode
  try {
    S.mode = mode
    M.clicked = true
    T.step(1)
    check(M.clicked === false, `${mode}：点击被消费`)
  } catch (e) {
    check(false, `${mode}：跑帧抛异常`, String(e.message).slice(0, 80))
  } finally {
    S.mode = prev
  }
}

section('图鉴快速切页签不会让状态坏掉')
S.mode = 'zukan'
S.zukan = { tab: 0, sel: 0, page: 0, from: 'explore' }
const tabs = DBG().zukanTabs()
let err = null
try {
  for (let i = 0; i < 120; i++) {
    S.zukan.tab = i % tabs.length
    S.zukan.sel = i * 5
    S.zukan.page = Math.floor(i / 4)
    M.clicked = true
    T.step(1)
  }
} catch (e) { err = String(e.message).slice(0, 120) }
check(!err, '120 次快速切页签 + 点击不抛异常', err)
check(M.clicked === false, '切完之后点击状态仍是被消费的')
const L = DBG().zukanLayout()
check(L.page >= 0 && L.page < L.pages, `页号被夹在合法范围（page=${L.page}/${L.pages}）`)
check(L.rects.length > 0, `当前页仍有格子可选（${L.rects.length} 个）`)
S.mode = 'explore'

section('卡顿统计接口可用（出问题时能取证）')
const perf = DBG().perf()
check(perf && typeof perf.slowCount === 'number', `perf() 可用：卡帧 ${perf.slowCount} 次，最慢 ${perf.worst} ms`)
check(typeof S.showPerf === 'boolean', '有 F3 卡顿面板开关（S.showPerf）')

console.log(`\n通过 ${ok} 项，失败 ${bad} 项`)
process.exit(bad ? 1 : 0)
