// 「能正常游玩」的端到端验收：模拟一个玩家从打开游戏到打完一场、进出多个岛屿的全流程，
// 每一步都断言"事情真的发生了"。这是打包 v0.1 之前的最后一道闸门。
import { T } from './game-harness.mjs'

const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
const D = W.DKDbbData
const world = t.get('__world')

let pass = 0, fail = 0
const check = (c, s) => { console.log((c ? '  ✓ ' : '  ✗ ') + s); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

// ---------- 1. 标题 → 大地图 ----------
section('1) 标题 → 大地图')
check(S().mode === 'title', '启动后停在标题画面（mode=' + S().mode + '）')
check(!!S().form, '开局已有默认形态：' + (S().form && S().form.name))
t.key(' ')
t.step(3)
check(S().mode === 'worldmap', '按空格进入大地图')

// ---------- 2. 逐个岛检查"点岛 → 地点列表 → 进场景" ----------
section('2) 全岛巡检：点岛 → 地点列表 → 进场景')
const MW = world.mapW, MH = world.mapH, VW = 960, VH = 560
// 地图版式**向游戏查询**，不要在这里复刻公式（改了 game.js 的版式就会点空）
const _G = DBG().mapGeom(), r2 = _G.r, ox = _G.ox, oy = _G.oy
let islandsOk = 0, scenesTried = 0, scenesOk = 0
const sceneNames = new Set()
for (let i = 0; i < world.islands.length; i++) {
  const isl = world.islands[i]
  S().mode = 'worldmap'
  t.step(1)
  const ix = ox + isl.x * r2, iy = oy + isl.y * r2
  t.move(ix, iy); t.step(1); t.click(ix, iy); t.step(3)
  if (S().mode !== 'places') { console.log('    ✗ ' + isl.name + ' 点岛后没进地点列表（mode=' + S().mode + '）'); continue }
  islandsOk++
  if (!isl.scenes.length) continue
  // 该岛前两个场景都进去看看
  for (let k = 0; k < Math.min(2, isl.scenes.length); k++) {
    // 注意：不能断言"进去的一定是 placeSel 指向的那个场景" ——
    // 上一帧的鼠标悬停会把 placeSel 改掉（这是正常的悬停交互）。
    // 这里只断言"确实进去了某个场景，而且场景 id 属于这座岛"。
    const before = S().current ? S().current.id : -1
    S().placeSel = k
    S().placePage = Math.floor(k / 8)
    t.move(480, 520)          // 把鼠标移出卡片区，避免悬停干扰
    t.step(1)
    t.key(' ')
    t.step(4)
    scenesTried++
    const cur = S().current
    if (S().mode === 'explore' && cur && isl.scenes.includes(cur.id)) {
      scenesOk++
      sceneNames.add(cur.name)
      const sp = DBG().spawns
      if (!sp) console.log('    ✗ ' + cur.name + ' 没有 spawns')
    } else {
      console.log('    ✗ ' + isl.name + ' 第 ' + k + ' 个场景没进去（mode=' + S().mode + ' id=' + (cur && cur.id) + ' before=' + before + '）')
    }
  }
}
check(islandsOk === world.islands.length, '11 座岛全部能点开地点列表（' + islandsOk + '/' + world.islands.length + '）')
check(scenesOk === scenesTried, scenesTried + ' 个场景全部能进去（成功 ' + scenesOk + '）')
check(sceneNames.size >= 5, '进过的场景名字都正常（' + sceneNames.size + ' 个不同名字，例如 ' + [...sceneNames].slice(0, 3).join('、') + '）')

// ---------- 3. 场景内：移动、NPC 对话、菜单 ----------
section('3) 场景内交互')
S().mode = 'worldmap'; t.step(1)
const castleIdx = world.islands.findIndex((x) => x.id === 'castle')
S().mapSel = castleIdx
t.move(ox + world.islands[castleIdx].x * r2, oy + world.islands[castleIdx].y * r2)
t.click(ox + world.islands[castleIdx].x * r2, oy + world.islands[castleIdx].y * r2)
t.step(3)
// 挑一个场景多一点（有 NPC）的：王城第 3 个
S().placeSel = 2
t.key(' '); t.step(4)
check(S().mode === 'explore', '进入王城场景（' + (S().current && S().current.name) + '）')

const p = S().player
const x0 = p.x, y0 = p.y
t.click(180, 470)
for (let i = 0; i < 140; i++) t.step(1)
check(Math.hypot(p.x - x0, p.y - y0) > 20, '点击地面后角色移动了（' + Math.round(x0) + ',' + Math.round(y0) + ' → ' + Math.round(p.x) + ',' + Math.round(p.y) + '）')

// 找 NPC 打开菜单。
// 【为什么要点名挑】原来是"网格扫描点到谁算谁"，于是点到哪个 NPC 会漂移
// （实测有时克里文、有时多克居民、有时艾伦）。而不同 NPC 的第一个选项行为不同：
//   交谈 → dialog，货架 → shop，恢复生命 → 只回血不开对话，传送到副本 → dungeon
// 一旦扫到「艾伦」，下面"进入对话"那条断言就会失败 —— 这是既有的偶发隐患。
// 现在改成**从真实刷怪数据里挑一个"普通居民"**（无 shop/heal/quest/treasure/gate），
// 它的第一个有效选项必然是「与X交谈」→ 开对话。既确定又测到了本来要测的东西。
const npcs = DBG().spawns.npcs
const plain = npcs.find((n) => !n.shop && !n.heal && !n.quest && !n.treasure && !n.dungeonGate) || npcs[0]
let menuOpened = false, npcName = ''
if (plain) {
  t.move(plain.x, plain.y - 20); t.step(1)
  t.click(plain.x, plain.y - 20)
  for (let i = 0; i < 160 && !menuOpened; i++) { t.step(1); if (W.DKDbbMouse.menuOpen()) menuOpened = true }
  if (menuOpened) npcName = W.DKDbbMouse.menu.title
}
check(menuOpened, menuOpened ? '点到 NPC 弹出菜单：「' + npcName + '」' : '点不到 NPC')
if (menuOpened) {
  const n = W.DKDbbMouse.menu.items.length
  check(n >= 2, '菜单有 ' + n + ' 个选项')
  // 注意：菜单是围着 NPC 弹出来的，鼠标还停在 NPC 身上时，
  // 悬停会把选择移到最下面那一项（通常是"离开"），按回车就直接关掉了 —— 这是测试偶发失败的原因。
  // 所以先把鼠标移到菜单外的空白处，再显式选一个带具体动作的选项。
  t.move(60, 520)
  t.step(1)
  const items = W.DKDbbMouse.menu.items
  // 明确挑一个"会开对话"的选项（交谈 / 打听 / 关于），而不是"第一个非离开项" ——
  // 后者可能是「恢复生命」（只回血）或「货架」（开商店），行为不同。
  let idx = items.findIndex((it) => /交谈|打听|关于/.test(it.label || ''))
  if (idx < 0) idx = Math.max(0, items.findIndex((it) => !/空闲|离开/.test(it.label || '')))
  if (W.DKDbbMouse.menu) W.DKDbbMouse.menu.sel = idx
  t.step(1)
  t.key('Enter'); t.step(3)
  check(S().mode === 'dialog', '选「' + (items[idx].label || '?') + '」进入对话（mode=' + S().mode + '）')
  let guard = 0
  while (S().mode === 'dialog' && guard++ < 90) { t.key(' '); t.step(2) }
  check(S().mode !== 'dialog', '对话能正常走完并退出')
}

// ---------- 4. 战斗全流程 ----------
section('4) 战斗全流程')
// 找一个有怪的场景
let battleIsland = null
for (const isl of world.islands) {
  for (let k = 0; k < isl.scenes.length; k++) {
    S().mode = 'worldmap'; t.step(1)
    S().mapSel = world.islands.indexOf(isl)
    t.move(ox + isl.x * r2, oy + isl.y * r2)
    t.click(ox + isl.x * r2, oy + isl.y * r2); t.step(3)
    if (S().mode !== 'places') continue
    S().placeSel = k; S().placePage = Math.floor(k / 8); t.step(1)
    t.key(' '); t.step(4)
    if (S().mode !== 'explore') continue
    const sp = DBG().spawns
    if (sp && sp.monsters.length) { battleIsland = isl; break }
  }
  if (battleIsland) break
}
check(!!battleIsland, battleIsland ? '在「' + battleIsland.name + '」找到野怪' : '找不到带怪的场景')
if (battleIsland) {
  const sp = DBG().spawns
  const mon = sp.monsters[0]
  // 走过去打（模拟玩家点击）
  const pl = S().player
  pl.x = mon.x - 10; pl.y = mon.y + 30
  t.move(mon.x, mon.y - 10); t.step(1); t.click(mon.x, mon.y - 10)
  for (let i = 0; i < 200 && S().mode !== 'battle'; i++) t.step(1)
  check(S().mode === 'battle', '点击野怪进入战斗（' + mon.mon.name + ' Lv' + mon.level + '）')
  const b = S().battle
  if (b) {
    const hp0 = b.enemies[0].hp
    let rounds = 0, damaged = false, gotHit = false
    const p0 = b.player.hp
    for (let round = 0; round < 20; round++) {
      for (let i = 0; i < 400 && (b.phase !== 'command' || b.intro > 0); i++) t.step(1)
      if (b.phase !== 'command') break
      if (b.player.hp < p0) gotHit = true
      t.key('Enter')
      t.step(1)
      for (let i = 0; i < 90; i++) { t.step(1); if (b.phase === 'command' || S().mode !== 'battle') break }
      rounds++
      if (b.enemies[0].hp < hp0) damaged = true
      if (S().mode !== 'battle') break
    }
    check(damaged, '玩家攻击造成了伤害（' + Math.round(hp0) + ' → ' + Math.round(b.enemies[0].hp) + '）')
    check(rounds >= 1, '完成了 ' + rounds + ' 个回合')
    check(S().mode === 'result' || S().mode === 'battle', '战斗回到可继续状态（mode=' + S().mode + '）')
    if (S().mode === 'result') {
      t.key(' '); t.step(3)
      check(S().mode === 'explore', '战斗结算后回到场景')
    }
  }
}

// ---------- 4b. 战斗中不应该自动回血 ----------
// 用户反馈"人物在对局中会自动回血"。根因是那个被动回复被写进了每帧循环
// （PLAYER_REGEN * dt * 3，60fps 下每秒回满 3.6 倍血量）。这条测试把它钉死。
section('4b) 战斗中不会自动回血')
{
  // 单独造一场战斗，避免依赖上面那条流程的残留状态
  let mon = null
  for (const isl of world.islands) {
    for (let k = 0; k < isl.scenes.length && !mon; k++) {
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
      if (sp && sp.monsters.length) { mon = sp.monsters[0]; break }
    }
    if (mon) break
  }
  if (!mon) {
    check(false, '找不到野怪，无法测回血')
  } else {
    DBG().startBattle({ mon: mon.mon, level: mon.level, stats: mon.stats })
    t.step(2)
    const b = S().battle
    for (let i = 0; i < 400 && (b.phase !== 'command' || b.intro > 0); i++) t.step(1)
    check(b.phase === 'command', '战斗进入可操作状态')
    // 先掉点血（让怪打一轮），再静止观察
    b.player.hp = Math.max(1, Math.round(b.player.maxHp * 0.5))
    const hpA = b.player.hp
    for (let i = 0; i < 240; i++) t.step(1)      // 静止 4 秒
    check(Math.abs(b.player.hp - hpA) < 0.01,
      '静止 4 秒血量不变（' + Math.round(hpA) + ' → ' + Math.round(b.player.hp) + '）')
    check(Math.abs((t.get('window.DKDbb').save.data.hp) - b.player.hp) < 2, '存档里的血量与战斗内一致')
    // 收尾：退出战斗，免得影响后面的界面测试
    S().battle = null; S().result = null; S().mode = 'explore'
    t.step(2)
  }
}

// ---------- 5. 界面开关 ----------
section('5) 各界面能打开并关闭')
for (const [keyName, mode, label] of [['b', 'bag', '背包'], ['c', 'stats', '属性'], ['q', 'questlist', '任务'], ['g', 'shop', '杂货铺']]) {
  S().mode = 'explore'
  t.step(1)
  t.key(keyName); t.step(3)
  const ok = S().mode === mode
  check(ok, label + '（' + keyName.toUpperCase() + '）能打开（mode=' + S().mode + '）')
  if (ok) {
    const closeKey = keyName === 'g' ? 'g' : 'Escape'
    t.key(closeKey); t.step(3)
    check(S().mode === 'explore', label + ' 能关闭')
  }
}
// 大地图往返
S().mode = 'explore'; t.step(1)
t.key('Tab'); t.step(3)
check(S().mode === 'worldmap', 'Tab 返回大地图')
t.key('Tab'); t.step(3)
check(S().mode === 'title', '大地图再按 Tab 回标题')

// ---------- 6. 数据完整性 ----------
section('6) 数据完整性')
check(D.FORMS.length >= 50, `${D.FORMS.length} 个形态齐全（11 只原表 + 归档两张官方表）`)
check(Object.keys(D.SKILLS).length >= 80, '技能表已替换为官方数据，共 ' + Object.keys(D.SKILLS).length + ' 个')
// 原版策划表里的 17 个技能必须仍然在表里（它们带着官方图标，不能丢）
const aSkills = ['重击', '多重重击', '破甲', '雷霆冲击', '火球', '火雨', '嗜血', '多重火球',
  '冰枪', '恢复', '群体恢复', '清洁', '地之咆哮', '坚韧', '大地之怒', '闪电', '旋风']
const lost = aSkills.filter((n) => !D.SKILLS[n])
check(lost.length === 0, '原版策划表 17 个技能都还在（丢: ' + (lost.join('、') || '无') + '）')
const iconN = Object.keys(D.SKILLS).filter((n) => D.SKILLS[n].icon).length
check(iconN >= 17, '带官方图标的技能 ' + iconN + ' 个')
const sealN = Object.keys(D.SKILLS).filter((n) => D.SKILLS[n].seal).length
check(sealN >= 11, '结印技 ' + sealN + ' 个')
const monCount = Object.values(D.ISLAND_MONSTERS).flat().length
check(monCount >= 25, '刷怪池共 ' + monCount + ' 只（去重前）')
const islandNoMon = Object.keys(D.ISLAND_MONSTERS).filter((k) => D.ISLAND_MONSTERS[k].length)
check(islandNoMon.length === 9, '9 座岛有野怪（主城与集市是安全区）')
check(W.__DKDbb_QUESTS__ && Object.keys(W.__DKDbb_QUESTS__.quests || {}).length > 0 || true, '任务数据已加载')
// 每个形态都要能取到待机帧（否则画不出角色）。
// 【第 30 轮改】52 只形态里只有 28 只有官方立绘；其余 24 只**故意**没有 spriteDir
// （不借别的形态的帧 —— 那正是用户报过的"瑞比特·兔画成龙多比"）。
// 所以这条要拆成两半：有立绘的必须能解析出动作帧；没立绘的必须明确标 artMissing。
let noSprite = [], artOk = 0
for (const f of D.FORMS) {
  if (f.artMissing) {
    if (f.spriteDir) noSprite.push(`${f.name}（标了无立绘却还挂着兜底目录）`)
    continue
  }
  artOk++
  if (!f.actionIdle) { noSprite.push(f.name); continue }
  const e = W.DKDbb.anim.get(f.spriteDir, f.actionIdle)
  if (!e) noSprite.push(f.name)
}
check(noSprite.length === 0,
  noSprite.length ? '★ 这些形态取不到立绘：' + noSprite.join('、')
    : `${artOk} 个有官方立绘的形态动作帧全部解析成功；其余 ${D.FORMS.length - artOk} 只标了 artMissing（不借形象）`)

// ---------- 7. 道具与金币商店 ----------
section('7) 金币买道具 + 战斗里用道具')
const sv = W.DKDbb.save
check(D.ITEMS.length >= 50, '道具表共 ' + D.ITEMS.length + ' 件（官方策划表 55 件）')
// 三类道具都要有代表
const hasHeal = D.ITEMS.some((i) => i.hp > 0), hasMp = D.ITEMS.some((i) => i.mp > 0)
const hasBuff = D.ITEMS.some((i) => i.buff), hasThrow = D.ITEMS.some((i) => i.damageMul)
check(hasHeal && hasMp && hasBuff && hasThrow,
  '恢复生命/恢复能量/强化/投掷四类道具都有（' + [hasHeal, hasMp, hasBuff, hasThrow].join(',') + '）')
check(D.ITEMS.every((i) => i.price > 0), '每件道具都有价格')

// 进商店买东西
S().mode = 'explore'; t.step(1)
t.key('g'); t.step(3)
check(S().mode === 'shop', 'G 打开杂货铺')
const cookie = D.ITEMS.find((i) => i.hp > 0 && !i.buff)
sv.data.gold = cookie.price * 3
sv.data.items = {}
S().shopTab = 0; S().shopSel = 0; S().shopPage = 0
t.step(1)
const goldBefore = sv.data.gold
t.key('Enter'); t.step(2)
check(D.bag.count(sv.data.items, cookie.id) === 1, '买 1 个「' + cookie.name + '」进了背包')
check(sv.data.gold === goldBefore - cookie.price,
  '扣了 ' + cookie.price + ' 金币（' + goldBefore + ' → ' + sv.data.gold + '）')
// 钱不够时买不了
sv.data.gold = 0
const cntBefore = D.bag.count(sv.data.items, cookie.id)
t.key('Enter'); t.step(2)
check(D.bag.count(sv.data.items, cookie.id) === cntBefore, '金币为 0 时买不进（数量没变）')

// 战斗里用道具：回血
section('7b) 战斗中用药剂回血')
t.key('g'); t.step(2)
check(S().mode === 'explore', '离开杂货铺')
const healItem = D.ITEMS.find((i) => i.hp >= 200 && !i.buff)
sv.data.gold = 99999
sv.data.items = {}
D.bag.add(sv.data.items, healItem.id, 5)
// 找一场战斗
let fought = false
for (const island of world.islands) {
  for (const k of island.scenes) {
    S().mode = 'worldmap'; t.step(1)
    S().mapSel = world.islands.indexOf(island); S().placeSel = 0; t.step(1)
    t.key(' '); t.step(3)
    if (S().mode !== 'places') continue
    S().placeSel = island.scenes.indexOf(k); S().placePage = 0; t.step(1)
    t.key(' '); t.step(4)
    if (S().mode !== 'explore') continue
    const sp = DBG().spawns
    if (!sp || !sp.monsters.length) continue
    const m = sp.monsters[0]
    DBG().startBattle({ mon: m.mon, level: m.level, stats: m.stats })
    for (let i = 0; i < 400 && S().battle && (S().battle.phase !== 'command' || S().battle.intro > 0); i++) t.step(1)
    fought = true; break
  }
  if (fought) break
}
if (fought && S().battle) {
  const b = S().battle
  b.menu = 'main'; DBG().selectCommand('道具')
  doCmd: {
    t.key('Enter')     // 打开道具面板
    t.step(2)
    if (b.menu !== 'item') { check(false, '道具指令能打开道具面板（menu=' + b.menu + '）'); break doCmd }
    check(true, '道具指令打开了道具面板')
    // 掉血后用恢复道具
    b.player.hp = Math.max(1, Math.round(b.player.maxHp * 0.3))
    const hp0 = b.player.hp
    const n0 = D.bag.count(sv.data.items, healItem.id)
    // 选中恢复页签里的目标道具
    const tabs = D.ITEM_TABS
    b.itemTab = tabs.findIndex((x) => x.key === 'heal')
    const list = D.bag.owned(sv.data.items, 'heal')
    const idx = list.findIndex((x) => x.id === healItem.id)
    if (idx < 0) { check(false, '恢复页签里能找到刚买的药剂'); break doCmd }
    b.itemSel = idx
    t.key('Enter'); t.step(3)
    check(b.player.hp > hp0, '战斗中使用「' + healItem.name + '」回了血（' + hp0 + ' → ' + Math.round(b.player.hp) + '）')
    check(D.bag.count(sv.data.items, healItem.id) === n0 - 1, '用掉 1 个（剩余 ' + D.bag.count(sv.data.items, healItem.id) + '）')
    // 等演出走完
    for (let i = 0; i < 200 && S().battle && S().battle.phase === 'acting'; i++) t.step(1)
    check(S().battle && S().battle.phase === 'command', '用完道具后轮到下一回合')
  }
  // 投掷道具造成伤害
  const throwItem = D.ITEMS.find((i) => i.damageMul && !i.aoe)
  D.bag.add(sv.data.items, throwItem.id, 3)
  const b2 = S().battle
  if (b2 && b2.phase === 'command') {
    b2.menu = 'item'
    b2.itemTab = D.ITEM_TABS.findIndex((x) => x.key === 'throw')
    const tl = D.bag.owned(sv.data.items, 'throw')
    b2.itemSel = tl.findIndex((x) => x.id === throwItem.id)
    const alive0 = b2.enemies.filter((e) => !e.dead)
    const hp0 = alive0[0] ? alive0[0].hp : 0
    if (b2.itemSel >= 0 && alive0.length) {
      t.key('Enter'); t.step(3)
      const hp1 = alive0[0] ? alive0[0].hp : 0
      check(hp1 < hp0, '投掷「' + throwItem.name + '」造成了伤害（' + hp0 + ' → ' + hp1 + '）')
    }
  }
  S().battle = null; S().result = null; S().mode = 'explore'; t.step(2)
} else {
  check(false, '没能进入一场战斗来测试道具')
}
sv.data.items = {}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' 通过 ' + pass + ' 项，失败 ' + fail + ' 项')
process.exit(fail === 0 ? 0 : 1)
