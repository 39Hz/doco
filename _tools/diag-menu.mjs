// 专项诊断：NPC 菜单选中后为什么有时不进对话。
// 打印菜单项（含 enabled 标记）与选择前后的状态。
import { T } from './game-harness.mjs'
const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）
const W = t.get('window')
const M = W.DKDbbMouse
const S = () => W.__DKDbb_DEBUG__.state
const world = t.get('__world')

// 进王城第 3 个场景
// 地图版式**向游戏查询**，不要在这里复刻公式（改了 game.js 的版式就会点空）
// 这里不能用 DBG()：它在本文件里声明得更晚，用了会先撞上 TDZ。
const _G = t.get('window').__DKDbb_DEBUG__.mapGeom(), r2 = _G.r, ox = _G.ox, oy = _G.oy
t.key(' '); t.step(3)
const ci = world.islands.findIndex((x) => x.id === 'castle')
t.move(ox + world.islands[ci].x * r2, oy + world.islands[ci].y * r2)
t.click(ox + world.islands[ci].x * r2, oy + world.islands[ci].y * r2)
t.step(3)
S().placeSel = 2
t.move(480, 520)
t.step(1)
t.key(' '); t.step(4)
console.log('场景: ' + S().current.name + '  mode=' + S().mode)

// 找 NPC
let opened = false
for (let x = 140; x <= 840 && !opened; x += 30) {
  for (let y = 300; y <= 480; y += 30) {
    t.move(x, y); t.step(1); t.click(x, y)
    for (let i = 0; i < 80; i++) t.step(1)
    if (M.menuOpen()) { opened = true; break }
  }
}
if (!opened) { console.log('点不到 NPC'); process.exit(0) }

console.log('\n=== 菜单内容 ===')
console.log('  标题: ' + M.menu.title)
M.menu.items.forEach((it, i) => {
  console.log('  [' + i + '] ' + JSON.stringify(it.label) + '  keys=' + Object.keys(it).join(',') +
    (it.disabled ? '  ★disabled' : '') + (it.enabled === false ? '  ★enabled=false' : ''))
})
console.log('  菜单状态: sel=' + M.menu.sel + ' title=' + M.menu.title)

// 逐项试：选中后按空格，看 mode
for (let i = 0; i < M.menu.items.length; i++) {
  // 重新打开菜单
  if (!M.menuOpen()) {
    for (let x = 140; x <= 840 && !M.menuOpen(); x += 30) {
      for (let y = 300; y <= 480; y += 30) {
        t.move(x, y); t.step(1); t.click(x, y)
        for (let k = 0; k < 80; k++) t.step(1)
        if (M.menuOpen()) break
      }
    }
  }
  if (!M.menuOpen()) { console.log('  第 ' + i + ' 项：菜单打不开了'); break }
  // 移到第 i 项
  M.menu.sel = i
  t.step(1)
  const before = S().mode
  t.key('Enter')
  t.step(3)
  console.log('  第 ' + i + ' 项「' + M.menu.items[i].label + '」: ' + before + ' → ' + S().mode +
    (S().mode === 'dialog' ? '（台词 ' + S().dialog.lines.length + ' 条）' : ''))
  // 退出对话 / 关菜单
  let g = 0
  while (S().mode === 'dialog' && g++ < 80) { t.key(' '); t.step(2) }
  if (M.menuOpen()) { t.key('Escape'); t.step(2) }
  S().mode = 'explore'
  t.step(1)
}
process.exit(0)
