// 精确模拟「点击 NPC」的完整流程，逐步打印状态，定位断点
import { T } from './game-harness.mjs'

const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）
const DBG = () => t.get('window').__DKDbb_DEBUG__
const M = t.get('DKDbbMouse')

// 进入探索
t.key(' '); t.step(2)
t.click(480, 250); t.step(2)
const world = t.get('__world')
// 地图版式**向游戏查询**，不要在这里复刻公式（改了 game.js 的版式就会点空）
const _G = DBG().mapGeom(), r = _G.r, ox = _G.ox, oy = _G.oy
const isl = world.islands[0]
t.move(ox + isl.x * r, oy + isl.y * r); t.step(1)
t.click(ox + isl.x * r, oy + isl.y * r); t.step(3)

const S = DBG().state
const npc = DBG().spawns.npcs[0]
console.log(`NPC「${npc.name}」在 (${Math.round(npc.x)},${Math.round(npc.y)})`)
console.log(`玩家在 (${Math.round(S.player.x)},${Math.round(S.player.y)})`)
const M2 = t.get('DKDbbMouse')
console.log(`M.inside = ${M2.inside}`)

console.log('\n--- 步骤 A：鼠标移到 NPC 上，但不点 ---')
t.move(npc.x, npc.y - 30)
t.step(1)
console.log(`  hover = ${S.hover ? S.hover.type + ' ' + (S.hover.obj.name || '') : 'null'}`)
console.log(`  okCursor = ${S.okCursor}`)

console.log('\n--- 步骤 B：按下鼠标 ---')
t.down(npc.x, npc.y - 30)
console.log(`  按下后 M.clicked = ${M2.clicked}   M.hover = ${M2.hover ? M2.hover.type : 'null'}`)
console.log(`  S.player.target = ${S.player.target ? JSON.stringify({ x: Math.round(S.player.target.x), y: Math.round(S.player.target.y), then: S.player.target.then ? S.player.target.then.type : null }) : 'null'}`)

console.log('\n--- 步骤 C：推进帧，让角色走过去 ---')
let arrived = -1
for (let i = 0; i < 200; i++) {
  t.step(1)
  if (S.player.target === null && arrived < 0) arrived = i
  if (M.menuOpen()) { console.log(`  第 ${i} 帧：菜单打开了！标题=${M.menu.title}`); break }
  if (i % 20 === 0) console.log(`  第 ${i} 帧：pos=(${Math.round(S.player.x)},${Math.round(S.player.y)}) target=${S.player.target ? '有' : '无'} mode=${S.mode} menu=${M.menuOpen()}`)
}
if (!M.menuOpen()) {
  console.log(`  ✗ 200 帧后仍未弹菜单`)
  console.log(`     玩家最终位置: (${Math.round(S.player.x)},${Math.round(S.player.y)})`)
  console.log(`     目标: ${S.player.target ? JSON.stringify(S.player.target) : 'null'}`)
  console.log(`     模式: ${S.mode}`)
  const sp = DBG().spawns
  console.log(`     此时距离最近 NPC: ${Math.round(Math.min(...sp.npcs.map(n => Math.hypot(n.x - S.player.x, n.y - S.player.y))))}`)
}

console.log('\n--- 步骤 D：检查 click 被谁消费 ---')
console.log(`  M.clicked 现在 = ${M2.clicked}`)
