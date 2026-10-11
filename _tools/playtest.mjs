// 用测试台「自己玩一遍」：模拟点击 NPC、点地面、开战、选菜单，检查每一步状态
// 用法: node _tools/playtest.mjs <项目根>
import { T } from './game-harness.mjs'

const ROOT = process.argv[2] || '.'
const t = T
t.load('game/game.js')

// 等 boot 完成（boot 里的 setTimeout 用真实定时器排队，这里让出事件循环）
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

let pass = 0, fail = 0
const ok = (s) => { console.log('  ✓ ' + s); pass++ }
const bad = (s) => { console.log('  ✗ ' + s); fail++ }
const check = (cond, s) => (cond ? ok(s) : bad(s))

// 读取内部状态（game.js 是 IIFE，没有暴露状态）
// 通过几个可观测的副作用判断：模式变化会改变绘制调用特征。
// 更可靠的办法：给 canvas 打点，看每帧画了什么。
function callCount() { return t.canvas._ctx.calls }

console.log('=== 1) 初始状态 ===')
const M = t.get('DKDbbMouse')
check(!!M, 'mouse 模块已加载')
// 标题页：按空格进入
t.key(' ')
t.step(2)
// 存档里 _picked 默认 false → 应该进选人页
let picked = t.get('DKDbb').save.data._picked
check(picked !== true, '首次进入未选形态（_picked 非 true）')

console.log('\n=== 2) 初始进入大地图（不再强行选形态）+ 背包变身 ===')
const sv = t.get('DKDbb').save.data
const DBG0 = t.get('window').__DKDbb_DEBUG__
check(DBG0.state.mode === 'worldmap', `标题空格后进入 ${DBG0.state.mode}（应为 worldmap）`)
check(!!sv.form, '已有默认形态：' + sv.form)
check((sv.forms || []).length >= 1, '背包里至少有 1 个形态：' + (sv.forms || []).join('、'))
check(!sv._picked, '不再要求开局选形态（_picked 未设置）')
// 背包可以打开与关闭（只在场景探索里生效，先随便进一个场景）
t.key(' '); t.step(2)          // 从标题进大地图
const world0 = t.get('__world')
// 地图版式**向游戏查询**，不要在这里复刻公式（改了 game.js 的版式就会点空）。
// 注意这里不能用 DBG()：它在本文件里声明得更晚，用了会先撞上 TDZ。
const _G0 = t.get('window').__DKDbb_DEBUG__.mapGeom()
const rW = _G0.r, oxW = _G0.ox, oyW = _G0.oy
const islW = world0.islands[0]
t.move(oxW + islW.x * rW, oyW + islW.y * rW); t.step(1)
t.click(oxW + islW.x * rW, oyW + islW.y * rW); t.step(3)
// 点岛进的是**地点列表**，还要再选一个地点才进场景（原版流程：点岛屿 → 列地点 → 进场景）。
// 这一步以前漏了，于是下面的 B/Esc 全在错误的状态里做，失败信息也指向奇怪的地方。
if (DBG0.state.mode === 'places') { DBG0.state.placeSel = 0; DBG0.state.placePage = 0; t.step(1); t.key(' '); t.step(4) }
check(DBG0.state.mode === 'explore', `已进入场景（当前 ${DBG0.state.mode}）`)
t.key('b'); t.step(2)
check(DBG0.state.mode === 'bag', `按 B 打开背包（当前 ${DBG0.state.mode}）`)
t.key('Escape'); t.step(2)
check(DBG0.state.mode === 'explore', 'Esc 关闭背包回到场景')
// 回大地图继续后面的测试
t.key('Tab'); t.step(2)

console.log('\n=== 2b) 技能特效配置 ===')
const FX = t.get('window').DKDbbFx
const D2 = t.get('window').DKDbbData
let fxBad = 0
for (const n of Object.keys(D2.SKILLS)) {
  const cfg = FX.configFor(n, (D2.SKILLS[n] || {}).element)
  if (!cfg || !cfg.shape || !cfg.kind) { fxBad++; console.log(`    ✗ ${n} 没有特效配置`) }
}
check(fxBad === 0, `全部 ${Object.keys(D2.SKILLS).length} 个技能都有独立特效配置`)
const ballFx = FX.configFor('火球', '火'), frostFx = FX.configFor('冰枪', '水')
check(ballFx.shape === 'ball' && ballFx.kind === 'flame', '火球 = 火焰弹丸（不再是通用光效）')
check(frostFx.shape === 'spear', '冰枪 = 冰锥（与火球不同）')

console.log('\n=== 3) 大地图：鼠标点岛 → 地点列表 ===')
// 选完形态应进入大地图。找一个岛的热区中心点
const world = t.get('__world')
const MW = world.mapW, MH = world.mapH
// 地图版式**向游戏查询**，不要在这里复刻公式（改了 game.js 的版式就会点空）
const _G = t.get('window').__DKDbb_DEBUG__.mapGeom(), r = _G.r, ox = _G.ox, oy = _G.oy
const isl = world.islands[0]
const ix = ox + isl.x * r, iy = oy + isl.y * r
t.move(ix, iy)
t.step(1)
t.click(ix, iy)
t.step(3)
const DBG3 = () => t.get('window').__DKDbb_DEBUG__
check(DBG3().state.mode === 'places',
  '点击岛屿后进入地点列表（原版流程：先列地点再进去）mode=' + DBG3().state.mode)

console.log('\n=== 3b) 地点列表：鼠标点卡片进场景（回归测试）===')
// 曾经的 bug：rectHit() 只读矩形上的 r.i，而地点卡片存的是 r.idx，
// 于是鼠标点击恒返回 undefined，卡片只能用键盘进 —— 这是「点不中」类缺陷。
{
  const S3 = DBG3().state
  const scenes = isl.scenes
  const cols = Math.min(scenes.length, 4)
  const rowW = cols * 200 + (cols - 1) * 14
  const x0 = 480 - rowW / 2
  let ok = false
  for (let k = 0; k < Math.min(scenes.length, 8); k++) {
    const cx = x0 + (k % 4) * 214 + 100
    const cy = 96 + Math.floor(k / 4) * 166 + 76
    t.move(cx, cy)
    t.step(1)
    t.click(cx, cy)
    t.step(3)
    if (S3.mode === 'explore' && S3.current && S3.current.id === scenes[k]) { ok = true; break }
  }
  check(ok, ok ? '鼠标点击地点卡片成功进入场景 ' + S3.current.id : '鼠标点击地点卡片没有进入场景（回归！）')
}
const last = sv._lastScene
check(!!last, '进入场景后已记录 _lastScene = ' + last)

console.log('\n=== 4) 场景内：点击地面移动 ===')
const before = { x: 0, y: 0 }
t.step(1)
// 点画面左下角的地面
t.click(150, 460)
// 推进若干帧让角色走过去
for (let i = 0; i < 120; i++) t.step(1)
const ctxCalls = callCount()
check(ctxCalls.drawImage > 0, '渲染循环在跑（drawImage ' + ctxCalls.drawImage + ' 次）')

console.log('\n=== 5) 点击 NPC 弹菜单 ===')
// NPC 位置在 sceneSpawns 里随机生成，这里遍历一片区域找到能触发菜单的点
let menuOpened = false
let hitPos = null
const spots = []
for (let x = 120; x <= 840; x += 30) for (let y = 300; y <= 480; y += 30) spots.push([x, y])
for (const [x, y] of spots) {
  t.move(x, y)
  t.step(1)
  t.click(x, y)
  // 走过去需要时间
  for (let i = 0; i < 90; i++) t.step(1)
  if (M.menuOpen()) { menuOpened = true; hitPos = [x, y]; break }
  // 关掉可能被打开的东西，继续找
  if (t.get('DKDbb').save.data) { /* noop */ }
}
check(menuOpened, menuOpened ? `点到 NPC 后弹出了菜单（位置 ${hitPos}）` : '点击 NPC 没有弹出菜单 ← 这就是用户报的 bug')

if (menuOpened) {
  console.log('\n=== 6) 菜单选择 ===')
  const m = M.menu
  console.log('  菜单标题: ' + m.title)
  console.log('  选项: ' + m.items.map((i, k) => `${k}:${i.label}`).join(' | '))
  // 用键盘选第一项并确定
  t.key('Enter')
  t.step(3)
  check(!M.menuOpen(), '回车确定后菜单已关闭')
}

console.log('\n=== 7) 点击怪物开战 ===')
const DBG = () => t.get('window').__DKDbb_DEBUG__
let battleStarted = false

// 直接逐个点击画面找怪物：站在每个场景里扫一遍鼠标位置
function tryScene(islandIndex) {
  // 回到大地图 → 点该岛 → 在地点列表里选一个野外场景进去
  t.key('Tab')
  t.step(1)
  t.key('Tab')
  t.step(1)
  // 确保在大地图
  if (DBG().state.mode !== 'worldmap') { DBG().state.mode = 'worldmap'; t.step(1) }
  const isl3 = world.islands[islandIndex]
  if (!isl3) return false
  const ix2 = ox + isl3.x * r, iy2 = oy + isl3.y * r
  t.move(ix2, iy2); t.step(1)
  t.click(ix2, iy2); t.step(3)
  // 原版流程：点岛之后是地点列表，要用鼠标点某一张地点卡片才进场景
  if (DBG().state.mode === 'places') {
    const S3 = DBG().state
    for (let k = 0; k < isl3.scenes.length; k++) {
      S3.placeSel = k
      S3.placePage = Math.floor(k / 8)
      t.step(1)
      t.key('Enter')
      t.step(3)
      if (DBG().state.mode === 'explore') break
    }
  }
  if (DBG().state.mode !== 'explore') return false
  const sp2 = DBG().spawns
  if (!sp2 || !sp2.monsters.length) return false
  const mon = sp2.monsters[0]
  t.move(mon.x, mon.y - 20)
  t.step(1)
  t.click(mon.x, mon.y - 20)
  for (let i = 0; i < 140; i++) {
    t.step(1)
    if (DBG().state.mode === 'battle') return true
  }
  return false
}

for (let i = 0; i < world.islands.length && !battleStarted; i++) {
  battleStarted = tryScene(i)
  if (battleStarted) {
    const b = DBG().state.battle
    console.log(`  在「${world.islands[i].name}」遇到 ${b.enemies.map((e) => e.name).join('、')}`)
  }
}
check(battleStarted, battleStarted ? '点击怪物后进入了战斗' : '未检测到战斗（所有岛都没有怪？）')

if (battleStarted) {
  console.log('\n=== 8) 战斗内：连打若干轮，验证伤害/动画/敌方回手 ===')
  const b = DBG().state.battle
  // 开打前先回满血 —— 玩家本来就能找恢复 NPC 回血，这里只是把"上一段随机走到哪"这个变量去掉。
  // 【为什么必须这么做】本测试实跑 8 次挂 1 次：怪是随机遇到的，等级随岛变化，
  // 玩家残血时可能在 2 次行动内被打死，`acted >= 3` 就偶发失败。
  // 这条断言要考的是"战斗机制能不能打满几个回合"，不是"残血能不能扛住"。
  const sv0 = t.get('DKDbb').save
  sv0.data.hp = sv0.data.maxHp
  b.player.hp = b.player.maxHp
  // 同时给敌人留够血量：本测试要观察"连续 3 个回合"的战斗机制与**敌人回手**，
  // 而随机遇到的怪可能两下就死（那时 acted 只有 2、敌人也没机会出手 → 断言假失败）。
  // 【阈值是量出来的，不是拍的】实测玩家一次普攻约 200~500（速度克制会 ×1.5、还有暴击），
  // 我先把血量设成 400 —— 结果暴击一下就打死、敌人一次都没出手，
  // 于是"敌人未回手"这条偶发失败。现在按"至少撑得住 6 回合"取 3000。
  // 这只改敌人血量，**不动玩家侧任何数值**。
  for (const e of b.enemies) e.hp = Math.max(e.hp, 3000)
  const hp0 = b.enemies.map((e) => e.hp)
  let acted = 0, sawAnim = false, enemyHitBack = false
  const p0 = b.player.hp
  for (let round = 0; round < 6; round++) {
    // 等到轮到玩家（含开场演出结束：intro>0 时不吃指令）
    for (let i = 0; i < 400 && (b.phase !== 'command' || b.intro > 0); i++) t.step(1)
    if (b.phase !== 'command') break
    // 战斗中玩家血量应随敌人攻击下降
    if (b.player.hp < p0) enemyHitBack = true
    t.key('Enter')            // 攻击
    t.step(1)
    // 演出期间检查是否播了招式动画
    for (let i = 0; i < 60; i++) {
      t.step(1)
      if (b.phase === 'acting' && b.action && b.action.anim) sawAnim = true
      if (b.phase === 'command') break
    }
    acted++
    if (b.enemies.every((e) => e.dead)) break
  }
  const hp1 = b.enemies.map((e) => e.hp)
  const dealt = hp0.reduce((a, v, i) => a + Math.max(0, v - hp1[i]), 0)
  check(acted >= 3, `完成了 ${acted} 次行动`)
  check(dealt > 0, `对敌人造成了伤害（合计 ${dealt}）`)
  check(sawAnim, sawAnim ? '出招时播放了招式动画' : '未观察到招式动画')
  check(enemyHitBack, enemyHitBack ? '敌人有回手（玩家掉血）' : '敌人未回手（可能一直闪避）')
  console.log(`  敌人: ${b.enemies.map((e) => `${e.name} ${e.hp}/${e.maxHp}`).join('、')}`)
  console.log(`  玩家: ${b.player.hp}/${b.player.maxHp}　阶段: ${b.phase}`)
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail === 0 ? 0 : 1)
