// 鼠标点击专项测试：把用户报过的"点不动"问题全钉住。
//
// 覆盖：
//   1. 点 NPC → 走过去 → 弹菜单
//   2. 菜单选项**鼠标点击**能生效（曾经的 bug：openMenu 没给宽高，
//      menuHitTest 里 mx <= m.x + m.w 是 NaN 比较恒假，点选项被当成点外面直接关菜单）
//   3. 对话中的选项**鼠标点击**能选中
//   4. 点对话其它位置能推进对话
//   5. 点怪 → 进战斗
//   6. 菜单点空白处能关闭
import { T } from './game-harness.mjs'

const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const M = W.DKDbbMouse
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
const world = t.get('__world')

let pass = 0, fail = 0
const check = (c, s) => { console.log((c ? '  ✓ ' : '  ✗ ') + s); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

// 进王城第 3 个场景（有 NPC）
section('准备：进入有 NPC 的场景')
const MW = world.mapW, MH = world.mapH
// 地图版式**向游戏查询**，不要在这里复刻公式（改了 game.js 的版式就会点空）
const _G = DBG().mapGeom(), r2 = _G.r, ox = _G.ox, oy = _G.oy
t.key(' '); t.step(3)
const ci = world.islands.findIndex((x) => x.id === 'castle')
t.move(ox + world.islands[ci].x * r2, oy + world.islands[ci].y * r2)
t.click(ox + world.islands[ci].x * r2, oy + world.islands[ci].y * r2); t.step(3)
S().placeSel = 2
t.move(480, 520); t.step(1)
t.key(' '); t.step(4)
check(S().mode === 'explore', '进入场景「' + (S().current && S().current.name) + '」')

// 找 NPC
section('1) 点 NPC 走过去并弹菜单')
const npc = DBG().spawns.npcs[0]
check(!!npc, npc ? '场景里有 NPC「' + npc.name + '」' : '场景里没有 NPC')
if (npc) {
  const p = S().player
  // 站远一点，确保是真的"走过去"而不是本来就在旁边
  p.x = Math.max(60, npc.x - 220); p.y = Math.min(500, npc.y + 60)
  t.step(1)
  const x0 = p.x, y0 = p.y
  t.move(npc.x, npc.y - 20); t.step(1)
  check(S().hover && S().hover.type === 'npc', '鼠标悬停到 NPC 上被识别')
  t.click(npc.x, npc.y - 20)
  let moved = false
  for (let i = 0; i < 300; i++) {
    t.step(1)
    if (Math.hypot(p.x - x0, p.y - y0) > 30) moved = true
    if (M.menuOpen()) break
  }
  check(moved, '点击后角色确实移动了')
  check(M.menuOpen(), M.menuOpen() ? '走到 NPC 身边后弹出菜单「' + M.menu.title + '」' : '没弹出菜单')
}

if (M.menuOpen()) {
  section('2) 菜单：鼠标点击选项')
  const m = M.menu
  check(m.w > 0 && m.h > 0, '菜单在打开时就带了尺寸（w=' + m.w + ' h=' + m.h + '）')
  // 找到"离开"以外的第一个可用项
  const idx = Math.max(0, m.items.findIndex((it) => !/离开/.test(it.label)))
  const IH = 40, HEAD = 34
  const cx = m.x + m.w / 2
  const cy = m.y + HEAD + idx * IH + (IH - 6) / 2
  // 先把鼠标移到选项上，确认命中测试认得
  t.move(cx, cy); t.step(1)
  check(M.menuHitTest(cx, cy) === idx, 'menuHitTest 命中第 ' + idx + ' 项（' + m.items[idx].label + '）')
  check(m.sel === idx, '鼠标悬停把高亮移到了该项')
  // 点击 → 应该触发该项而不是关掉菜单
  const before = S().mode
  t.click(cx, cy); t.step(4)
  const ok = S().mode === 'dialog' || !M.menuOpen()
  check(ok, '点击选项生效（' + before + ' → ' + S().mode + '）')
  check(S().mode === 'dialog' || S().mode === 'explore', '点击后不是卡在菜单里')

  // 再开一次菜单，测"点空白处关闭"
  if (S().mode === 'dialog') { for (let i = 0; i < 90 && S().mode === 'dialog'; i++) { t.key(' '); t.step(2) } }
  S().mode = 'explore'
  M.closeMenu()
  t.step(2)
  t.move(npc.x, npc.y - 20); t.step(1); t.click(npc.x, npc.y - 20)
  for (let i = 0; i < 300 && !M.menuOpen(); i++) t.step(1)
  if (M.menuOpen()) {
    const m2 = M.menu
    // 点菜单外的空白（左上角）
    t.move(20, 540); t.step(1)
    check(M.menuHitTest(20, 540) === -1, '菜单外的点命中测试返回 -1')
    t.click(20, 540); t.step(2)
    check(!M.menuOpen(), '点击菜单外能关闭菜单')
  }
}

// 对话点击
section('3) 对话：鼠标点击推进 / 点击选项')
S().mode = 'explore'
M.closeMenu()
t.step(1)
// 直接构造一个带选项的对话
t.run(`(function(){
  const D = window.__DKDbb_DEBUG__;
  const d = D.state;
  d.dialog = { lines: [
    { who: '测试', text: '第一句' },
    { who: '测试', text: '第二句' },
    { type: 'choice', text: '请选择：' },
    { type: 'choice', text: '选项甲' },
    { type: 'choice', text: '选项乙' },
    { who: '测试', text: '结束了' },
  ], i: 0, onEnd: null, t: 0, choice: null };
  d.mode = 'dialog';
})()`)
t.step(2)
check(S().mode === 'dialog', '构造了一个对话用于测试')
// 点画面空白推进
t.move(480, 120); t.step(1)
t.click(480, 120); t.step(2)
check(S().dialog && S().dialog.i === 1, '点击画面推进到第 2 句（i=' + (S().dialog ? S().dialog.i : -1) + '）')
t.click(480, 120); t.step(2)
check(S().dialog && S().dialog.i === 2, '再点一次到选项步骤（i=' + (S().dialog ? S().dialog.i : -1) + '）')
// 点第二个选项
const rects = t.run('(function(){ const D=window.__DKDbb_DEBUG__; const d=D.state.dialog; const boxH=150, y=560-boxH-22; return [{x:64,y:y+62,w:960-200,h:30},{x:64,y:y+62+34,w:960-200,h:30}]; })()')
const opt2 = rects[1]
t.move(opt2.x + opt2.w / 2, opt2.y + opt2.h / 2); t.step(1)
t.click(opt2.x + opt2.w / 2, opt2.y + opt2.h / 2); t.step(3)
check(S().mode !== 'dialog' || (S().dialog && S().dialog.i >= 5), '点击选项后对话越过选项组（i=' + (S().dialog ? S().dialog.i : '已结束') + '）')
for (let i = 0; i < 60 && S().mode === 'dialog'; i++) { t.key(' '); t.step(2) }
check(S().mode === 'explore', '对话能正常结束')

// 点怪进战斗
section('4) 点怪进战斗')
let found = null
for (const isl of world.islands) {
  for (let k = 0; k < isl.scenes.length; k++) {
    S().mode = 'worldmap'; t.step(1)
    S().mapSel = world.islands.indexOf(isl)
    t.move(ox + isl.x * r2, oy + isl.y * r2)
    t.click(ox + isl.x * r2, oy + isl.y * r2); t.step(3)
    if (S().mode !== 'places') continue
    S().placeSel = k; S().placePage = Math.floor(k / 8)
    t.move(480, 520); t.step(1)
    t.key(' '); t.step(4)
    if (S().mode !== 'explore') continue
    const sp = DBG().spawns
    if (sp && sp.monsters.length) { found = sp.monsters[0]; break }
  }
  if (found) break
}
check(!!found, found ? '找到野怪 ' + (found.mon ? found.mon.name : '?') : '找不到野怪')
if (found) {
  const p = S().player
  p.x = Math.max(60, found.x - 200); p.y = Math.min(500, found.y + 40)
  t.step(1)
  t.move(found.x, found.y - 10); t.step(1)
  t.click(found.x, found.y - 10)
  for (let i = 0; i < 400 && S().mode !== 'battle'; i++) t.step(1)
  check(S().mode === 'battle', '点击野怪进入战斗（mode=' + S().mode + '）')
  if (S().mode === 'battle') {
    // 战斗里点"攻击"按钮。
    // 坐标改成**从游戏里问**，不再把布局常数抄进测试 ——
    // 操作栏从"右侧四连按钮"改成原版那种"底部六方格 + 大圆钮"之后，
    // 写死的 108/10/62 就指到别的地方去了（这次就是这么红的）。
    const b = S().battle
    for (let i = 0; i < 300 && (b.phase !== 'command' || b.intro > 0); i++) t.step(1)
    const rects = t.get('window.__DKDbb_DEBUG__.cmdRects()')
    check(Array.isArray(rects) && rects.length >= 3, '能拿到指令栏布局（' + (rects ? rects.length : 0) + ' 格）')
    const atk = rects.find((r) => r.label === '攻击')
    check(!!atk, '指令栏里有「攻击」格')
    t.move(atk.x + atk.w / 2, atk.y + atk.h / 2); t.step(1)
    check(S().hoverCmd === atk.i, '悬停「攻击」被识别')
    const hp0 = b.enemies[0].hp
    t.click(atk.x + atk.w / 2, atk.y + atk.h / 2); t.step(3)
    check(b.phase !== 'command' || b.enemies[0].hp < hp0, '点击「攻击」触发了攻击')
  }
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' 通过 ' + pass + ' 项，失败 ' + fail + ' 项')
process.exit(fail === 0 ? 0 : 1)
