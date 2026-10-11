// 定位「点 NPC 不弹菜单」的根因：检查 NPC 是否生成、位置在哪、命中检测是否通过
import { T } from './game-harness.mjs'

const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const DBG = () => t.get('window').__DKDbb_DEBUG__

// 走到探索模式
t.key(' ')
t.step(2)
t.click(480, 250)   // 选人页随便点一个
t.step(2)
// 大地图点第一个岛
const world = t.get('__world')
// 地图版式**向游戏查询**，不要在这里复刻公式（改了 game.js 的版式就会点空）
const _G = DBG().mapGeom(), r = _G.r, ox = _G.ox, oy = _G.oy
const isl = world.islands[0]
t.move(ox + isl.x * r, oy + isl.y * r)
t.step(1)
t.click(ox + isl.x * r, oy + isl.y * r)
t.step(3)

const S = DBG().state
console.log('模式:', S.mode)
console.log('场景:', S.current && S.current.id, S.current && S.current.name, '岛:', S.current && S.current.island)
console.log('可行走区:', JSON.stringify(DBG().walkBounds))
console.log('玩家位置:', Math.round(S.player.x), Math.round(S.player.y))

const sp = DBG().spawns
console.log('\n怪物数:', sp.monsters.length)
sp.monsters.forEach((m, i) => console.log(`  #${i} ${m.mon.name} @(${Math.round(m.x)},${Math.round(m.y)})`))
console.log('NPC 数:', sp.npcs.length)
sp.npcs.forEach((n, i) => {
  console.log(`  #${i} ${n.name} @(${Math.round(n.x)},${Math.round(n.y)})  有任务=${!!n.quest}`)
  if (n.lines) console.log(`      台词 ${n.lines.length} 句`)
})

// 直接测试命中检测
if (sp.npcs.length) {
  const n = sp.npcs[0]
  const M = t.get('DKDbbMouse')
  console.log('\n命中检测（NPC 中心）:', M.hitActor(n, n.x, n.y - 30, 42, 60))
  console.log('命中检测（NPC 脚下）:', M.hitActor(n, n.x, n.y, 42, 60))
  console.log('命中检测（偏 80px）:', M.hitActor(n, n.x + 80, n.y, 42, 60))

  // 直接调 openActorMenu 看是否能开
  DBG().openActorMenu(n)
  console.log('直接调 openActorMenu 后 menuOpen =', M.menuOpen())
  if (M.menu) console.log('菜单:', M.menu.title, '|', M.menu.items.map(x => x.label).join(' / '))
}

// 模拟：把鼠标移到 NPC 上，看 hover 是否命中
const M = t.get('DKDbbMouse')
if (sp.npcs.length) {
  const n = sp.npcs[0]
  M.menu && M.closeMenu()
  for (const [dx, dy] of [[0, -30], [0, 0], [0, 20], [0, -50]]) {
    t.move(n.x + dx, n.y + dy)
    t.step(1)
    console.log(`  鼠标(${Math.round(n.x + dx)},${Math.round(n.y + dy)}) -> hover=${S.hover ? S.hover.type : 'null'}`)
  }
}
