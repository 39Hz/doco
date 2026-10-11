// 场景互通：同一座岛内，走到屏幕左右边缘就能进相邻场景。
//
// 用户要求：「不是在大地图上面做关联，而是在各个场景里面互通 ——
//            比如一个岛屿里面的场景是能互相走的」。
//
// 依据等级：derived。归档里 88 张场景图**只有编号、没有相邻关系数据**，
// 原版场景连接表也没留存，所以规则是 game.js 里 sceneExits() 定义的那一条：
// 同一座岛内按 world.js 的 scenes 数组顺序串成链。
// 本测试验证"这条规则确实生效、能走通、不会把人卡住"，而不是只画了箭头。
import { T } from './game-harness.mjs'

const t = T
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
const world = t.get('__world')
let pass = 0, fail = 0
const check = (c, s) => { console.log((c ? '  ✓ ' : '  ✗ ') + s); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

// ---------- 1) 链的结构 ----------
section('1) 同一座岛的场景串成一条链')
let multi = 0, single = 0
const bad = []
for (const isl of world.islands) {
  const arr = isl.scenes || []
  if (arr.length < 2) { single++; continue }
  multi++
  for (let i = 0; i < arr.length; i++) {
    const ex = DBG().sceneExits(arr[i])
    if (!ex) { bad.push(`${arr[i]} 无归属`); continue }
    if (ex.total !== arr.length) bad.push(`${arr[i]} 总数错`)
    if (i === 0 && ex.left != null) bad.push(`${arr[i]} 首场景不该有左出口`)
    if (i === arr.length - 1 && ex.right != null) bad.push(`${arr[i]} 末场景不该有右出口`)
    if (i > 0 && ex.left !== arr[i - 1]) bad.push(`${arr[i]} 左出口错`)
    if (i < arr.length - 1 && ex.right !== arr[i + 1]) bad.push(`${arr[i]} 右出口错`)
  }
}
check(bad.length === 0, `链结构正确（${multi} 座多场景岛 / ${single} 座单场景岛）${bad.length ? ' —— ' + bad.slice(0, 3).join('；') : ''}`)
check(multi >= 5, `有 ${multi} 座岛可以场景之间互走`)

// 一路向右能走到头，再一路向左能走回来
const islN = world.islands.find((x) => (x.scenes || []).length >= 5)
const chain = islN.scenes
{
  let cur = chain[0], steps = 0, guard = 0
  while (guard++ < 200) {
    const ex = DBG().sceneExits(cur)
    if (ex.right == null) break
    cur = ex.right; steps++
  }
  check(cur === chain[chain.length - 1] && steps === chain.length - 1,
    `${islN.name}：从第 1 个场景一路向右 ${steps} 步到最后一个（应 ${chain.length - 1} 步）`)
  let back = cur, bsteps = 0
  guard = 0
  while (guard++ < 200) {
    const ex = DBG().sceneExits(back)
    if (ex.left == null) break
    back = ex.left; bsteps++
  }
  check(back === chain[0] && bsteps === steps, `再一路向左走回来（${bsteps} 步，与去程一致）`)
}

// ---------- 2) 走正常流程进场景 ----------
section('2) 走正常流程进入场景')
function enterSceneById(id) {
  const isl = world.islands.find((x) => (x.scenes || []).includes(id))
  if (!isl) return false
  S().mode = 'worldmap'; t.step(1)
  S().mapSel = world.islands.indexOf(isl); S().placeSel = 0; t.step(1)
  t.key(' '); t.step(3)
  if (S().mode !== 'places') return false
  S().placeSel = isl.scenes.indexOf(id); S().placePage = 0; t.step(1)
  t.key(' '); t.step(4)
  return S().mode === 'explore' && S().current && S().current.id === id
}
check(enterSceneById(chain[1]), `进入 ${islN.name} 的第 2 个场景（id=${chain[1]}）`)

// ---------- 3) 一直按右 → 走过右边缘换场景 ----------
section('3) 一直按右走，走过边缘就进下一个场景')
// harness 只提供 keyDown（模拟长按），没提供 keyUp —— 需要松开时直接派发 keyup 事件。
// 不松开的话 input.axis() 会同时收到左右两个方向，x 互相抵消，看起来像"按键没反应"。
const keyUp = (k) => t.win.fire('keyup', { key: k })
if (S().mode === 'explore') {
  const before = S().current.id
  const wb = DBG().walkBounds
  t.keyDown('ArrowRight')
  let entryX = null
  for (let i = 0; i < 900; i++) {
    t.step(1)
    if (S().current.id !== before) { entryX = S().player.x; break }
  }
  keyUp('ArrowRight')
  check(S().current.id === chain[2], `换到了下一个场景（${before} → ${S().current.id}，期望 ${chain[2]}）`)
  check(entryX != null && entryX <= wb.x0 + 12,
    `从**左侧**进场（x=${entryX == null ? '-' : Math.round(entryX)}，左界 ${Math.round(wb.x0)}）`)
}

// ---------- 4) 一直按左 → 走回上一个场景 ----------
section('4) 再一直按左走回去')
if (S().mode === 'explore') {
  const cur = S().current.id
  const back2 = chain[chain.indexOf(cur) - 1]
  const wb = DBG().walkBounds
  t.keyDown('ArrowLeft')
  let entryX = null
  for (let i = 0; i < 900; i++) {
    t.step(1)
    if (S().current.id !== cur) { entryX = S().player.x; break }
  }
  keyUp('ArrowLeft')
  check(S().current.id === back2, `走回上一个场景（${cur} → ${S().current.id}，期望 ${back2}）`)
  check(entryX != null && entryX >= wb.x1 - 12,
    `从**右侧**进场（x=${entryX == null ? '-' : Math.round(entryX)}，右界 ${Math.round(wb.x1)}）`)
}

// ---------- 5) 边缘箭头可点击 ----------
section('5) 点左右两端的箭头也能走')
{
  const rects = DBG().sceneExitRects()
  check(rects.length >= 1, `当前场景有 ${rects.length} 个可点的出口`)
  const left = rects.find((r) => r.side === 'left')
  const before = S().current.id
  if (left) {
    t.click(left.x + left.w / 2, left.y + left.h / 2); t.step(3)
    check(S().current.id !== before, `点左箭头换到了 ${S().current.id}（原 ${before}）`)
  } else {
    check(false, '当前场景没有左出口（不该发生：它在链中间）')
  }
}

// ---------- 6) 不会卡死 ----------
section('6) 边界与健壮性')
{
  // 单场景岛：没有任何出口
  const one = world.islands.find((x) => (x.scenes || []).length === 1)
  if (one) {
    const ex = DBG().sceneExits(one.scenes[0])
    check(ex && ex.left == null && ex.right == null, `${one.name} 只有一个场景 → 没有出口（不会乱跳）`)
  } else {
    check(true, '没有单场景岛，跳过')
  }
  // 不存在的场景 id：返回 false，不抛异常
  let threw = false, ret = null
  try { ret = DBG().gotoScene(99999, 'left') } catch (e) { threw = true }
  check(!threw && ret === false, `gotoScene(不存在的场景) 安全返回 false（ret=${ret}, threw=${threw}）`)
  // 每一座多场景岛的两端都真的没有对应出口
  let deadEndBad = []
  for (const isl of world.islands) {
    const arr = isl.scenes || []
    if (arr.length < 2) continue
    const f = DBG().sceneExits(arr[0]), l = DBG().sceneExits(arr[arr.length - 1])
    if (f.left != null || l.right != null) deadEndBad.push(isl.name)
  }
  check(deadEndBad.length === 0, `没有"走到头却还能继续走"的岛（异常: ${deadEndBad.join('、') || '无'}）`)
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} 项，失败 ${fail} 项`)
if (fail) process.exit(1)
