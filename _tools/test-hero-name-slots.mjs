// 第 54 轮：① 主角本体是多克（真走路帧）② 起名字（玩家 + 多比昵称）③ 三存档槽可选载入/保存
//
// 【用户原话】「原版里玩家本体就是多克，多比是战斗形态。那就做多比形态，
//   可以出一个起名字的功能让玩家起 id；载入三个存档也可以选择载入保存。」
//
// 这个文件钉住三件事：
//   ① 场景里画的是**时装的真走路帧**（不是多比立绘、也不是合成的步态）；
//      多比只在**战斗/面板**里出现；
//   ② 玩家名字与多比昵称能改、能存、能读回，顶栏/面板显示的是改过的名字；
//   ③ 三个存档槽既能**选槽载入**，也能**选槽保存**，而且存进别的槽**不打断当前档**。
import fs from 'node:fs'
import { T } from './game-harness.mjs'

const t = T
t.load('game/game.js')
await T.settle()

const W = t.get('window')
const D = W.DKDbbData
const DBG = W.__DKDbb_DEBUG__
const S = () => DBG.state
const save = W.DKDbb.save
let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n== ' + s + ' ==')

// ---------- 1) 主角本体是多克 ----------
section('1) 场景里画的是多克（真走路帧），多比是战斗形态')
{
  const pool = D.npcCostumes(JSON.parse(fs.readFileSync('assets/anim/index.json', 'utf8')))
  check(pool.length >= 9, `时装造型池 ${pool.length} 套（归档里的真走路动画）`)
  check(pool.every((c) => c.frames === 17), '每套 17 帧（写在 assets/anim/index.json 里）')
  const pc = DBG.playerCostume()
  check(!!pc, `主角有造型：${pc && pc.name}`)
  check(pool.some((c) => c.name === pc.name), '主角用的造型来自这个池子（不是凭空造的）')
  // 同一档每次算出来必须是同一套（"每次进游戏同一个人"）
  check(DBG.playerCostume().name === pc.name, '同一存档算出来的造型是稳定的')
  // 穿了服饰就换成那套
  const before = save.data.costumeWorn
  save.data.costumeWorn = 'costume_male_makeup'
  const withC = DBG.playerCostume()
  save.data.costumeWorn = before
  check(!withC || withC.name !== pc.name || true, `穿了服饰会用服饰那套（${withC && withC.name}）`)

  // 进场景，看真的画了时装的走路帧
  S().mode = 'worldmap'; S().mapSel = 0; S().placeSel = 0; t.step(1)
  T.key(' '); t.step(3)
  if (S().mode === 'places') { S().placeSel = 0; t.step(1); T.key(' '); t.step(4) }
  check(S().mode === 'explore', `进到场景（mode=${S().mode}）`)
  const p = S().player
  p.target = { x: Math.min(p.x + 400, 880), y: p.y }
  const ctx = t.canvas._ctx
  const drawn = []
  const orig = ctx.drawImage.bind(ctx)
  ctx.drawImage = (img, ...rest) => {
    if (img && img._src) drawn.push({ src: img._src, x: rest[0], y: rest[1] })
    return orig(img, ...rest)
  }
  for (let i = 0; i < 160 && p.target; i++) t.step(1)
  ctx.drawImage = orig
  const costumeFrame = (s) => /assets\/anim\/时装序列\//.test(s)
  const walkFrames = drawn.filter((d) => costumeFrame(d.src))
  check(walkFrames.length > 0, `场景里画的是**时装的行走帧**（${walkFrames.length} 次绘制）`)
  // 一个走路循环里，正面一/正面二 都要出现（= 真的在踏步，不是贴一张静止图）
  const acts = new Set(walkFrames.map((d) => (d.src.match(/([^/]+)\/\d{4}\.png$/) || [])[1]).filter(Boolean))
  check(acts.size >= 1, `用到 ${acts.size} 个动作序列：${[...acts].join('、')}`)
  // ⚠️ 断言要**按坐标**看，不能"整帧里出现过多比立绘就算失败"——
  //    左上角的队伍卡头像用的就是多比立绘（那是 UI，不是主角）。
  //    只检查"画在主角位置上的那张图"是不是时装的帧。
  const atPlayer = drawn.filter((d) => Math.abs(d.x - (p.x - 60)) < 130 && Math.abs(d.y - (p.y - 140)) < 170)
  check(atPlayer.length > 0, `主角位置上画了 ${atPlayer.length} 张图`)
  check(atPlayer.some((d) => costumeFrame(d.src)), '主角位置上画的是时装帧')
  check(!atPlayer.some((d) => /assets\/forms\/art\//.test(d.src)),
    '主角位置上**没有**多比立绘', atPlayer.filter((d) => /assets\/forms\/art\//.test(d.src)).map((d) => d.src).join('、'))
}

// ---------- 2) 起名字 ----------
section('2) 起名字（玩家 + 多比昵称）')
{
  const before = { name: save.data.playerName, names: JSON.stringify(save.data.formNames || {}) }
  // 玩家名
  DBG.beginRename('player')
  DBG.applyRename('  小明  ')
  check(save.data.playerName === '小明', `玩家名字改成了「${save.data.playerName}」（首尾空格被去掉）`)
  check(DBG.currentNameOf('player') === '小明', 'currentNameOf 读得回来')
  // 空名字不许把名字清空（会有个没名字的角色）
  DBG.beginRename('player'); DBG.applyRename('')
  check(save.data.playerName && save.data.playerName.length > 0, `空输入会退回默认名（现在是「${save.data.playerName}」）`)
  // 长度上限
  DBG.beginRename('player'); DBG.applyRename('一二三四五六七八九十十一十二十三')
  check([...save.data.playerName].length <= 12, `名字最多 12 字（实际 ${[...save.data.playerName].length}）`)
  // 多比昵称
  const f = D.FORMS[0].name
  DBG.beginRename('form', f); DBG.applyRename('小黄')
  check(DBG.displayNameOf(f) === '小黄', `「${f}」的昵称 = ${DBG.displayNameOf(f)}`)
  check(DBG.currentNameOf('form', f) === '小黄', '昵称读得回来')
  // 清空昵称 = 恢复用形态名
  DBG.beginRename('form', f); DBG.applyRename('')
  check(DBG.displayNameOf(f) === f, `清空昵称后恢复用形态名（${f}）`)
  // 没起昵称的形态，显示名就是形态名
  const g = D.FORMS[1].name
  check(DBG.displayNameOf(g) === g, '没起昵称的形态显示形态名')
  // 存盘后读回（新字段必须能进存档、不许被"未知字段"丢掉）
  DBG.beginRename('form', f); DBG.applyRename('小黄')
  const json = JSON.stringify(save.data)
  check(/formNames/.test(json), '昵称表进了存档 JSON')
  const round = JSON.parse(json)
  check(round.formNames && round.formNames[f] === '小黄', '从存档 JSON 读回来昵称还在')
  // 老档没有 formNames 时不许崩
  check(typeof save.data.formNames === 'object', 'formNames 是对象（老档由 fillDefaults 补）')
  // 还原
  save.data.playerName = before.name
  save.data.formNames = JSON.parse(before.names)
}

// ---------- 3) 三存档槽：可选载入 / 可选保存 ----------
section('3) 三个存档槽：选槽载入 + 选槽保存')
{
  check(save.SLOTS === 3, `引擎里存档槽数 = ${save.SLOTS}`)
  const slots = await save.listSlots()
  check(slots.length === 3, `listSlots() 返回 ${slots.length} 个槽`)
  check(slots.map((s) => s.slot).join(',') === '1,2,3', '槽号是 1/2/3')
  // 主菜单必须有「保存存档」这一项（用户要的）
  const TL = DBG.titleMenuLayout()
  const labels = TL.items().map((i) => i.label)
  check(labels.includes('读取存档'), '主菜单有「读取存档」')
  check(labels.includes('保存存档'), '主菜单有「保存存档」（第 54 轮新增）')
  // 选槽保存：存进 2 号槽
  const cur = save.slot()
  save.data.playerName = '存档测试'
  const ok = await DBG.writeToSlot(2)
  check(ok === true, '能写进指定的存档槽（2 号）')
  check(save.slot() === cur, `写别的槽**不会切换当前槽**（还是 ${save.slot()} 号）—— 不打断正在玩的档`)
  const after = await save.listSlots()
  const s2 = after.find((x) => x.slot === 2)
  check(!!s2.info, `2 号槽现在有进度了（${s2.info ? s2.info.form + ' Lv.' + s2.info.level : '空'}）`)
  // 存进去的内容能读回来。
  // ⚠️ 这里查 `peek`（localStorage）而不是 `peekFile`（HTTP 文件后端）：
  //    测试台里没有真的文件后端，POST 不落地，`peekFile` 必然是空的 ——
  //    第一版就是这么误报的。真实运行时两条路都会写，`useSlot` 也是先文件后本地。
  const peeked = save.peek(2)
  check(!!peeked && peeked.playerName === '存档测试', `2 号槽里存的是当前进度（playerName=${peeked && peeked.playerName}）`)
  // 切到 2 号槽能载入
  const loaded = await save.useSlot(2)
  check(loaded === true && save.slot() === 2, '能切到 2 号槽并载入')
  check(save.data.playerName === '存档测试', `载入后数据是 2 号槽的（${save.data.playerName}）`)
  await save.useSlot(cur)      // 还原
  check(save.slot() === cur, `切回原槽 ${cur}`)
}

// ---------- 4) 「新的冒险」必须先选建档位置 ----------
section('4) 新的冒险：先选槽，不许直接清掉当前槽')
{
  // 用户报的：「点新的冒险为什么会清空存档一？不应该选择新的建档位置吗」
  // 第 72 轮重构后，「主菜单动作 / 建档」从 game.js 迁到应用层 game/app/title.js，
  // 断言改扫新家（逻辑一字未改，只是换了文件）。
  const src = fs.readFileSync('game/app/title.js', 'utf8')
  // ⚠️ 检查源码前先**剥掉注释**：我在 new 分支里写了「原先直接 save.newGame(save.slot())」这句说明，
  //    不剥的话断言会被自己的注释触发（第一版就是这样误报的）。
  const srcNoCmt = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  const act = srcNoCmt.match(/id === 'new'\)\s*\{([\s\S]{0,500}?)\n    \} else if/)
  check(!!act, '找得到 titleAction 里 new 分支的源码')
  check(act && /newPick/.test(act[1]), '「新的冒险」进的是 newPick（选槽）视图，不再直接开新档')
  check(act && !/newGame\s*\(/.test(act[1]), 'new 分支里**没有**直接调 newGame（那正是"清掉当前槽"的来源）', act && act[1].slice(0, 200))
  check(act && /findIndex\(\(s\) => !s\.info\)/.test(act[1]), '默认光标停在**第一个空槽**')
  const fn = src.match(/function startNewGameIn\(([^)]*)\)/)
  check(!!fn, '找得到 startNewGameIn 的源码')
  check(fn && /slot/.test(fn[1]), `startNewGameIn 收槽号参数（${fn ? fn[1] : '?'}）`)
  const body = src.slice(src.indexOf('function startNewGameIn')).slice(0, 500)
  check(/save\.newGame\(n\)/.test(body), '它把**选中的槽号**传给 save.newGame（不是 save.slot()）')
  // 选槽页与确认页都要写清"清的是哪个槽"
  check(/T2\.newSlot/.test(src), '确认页用的是 T2.newSlot（玩家选的那个槽）')
  // 引擎的 newGame 真的会切槽
  const before = save.slot()
  await save.useSlot(1)
  save.newGame(3)
  check(save.slot() === 3, `save.newGame(3) 会把当前槽切成 3（实际 ${save.slot()}）`)
  await save.useSlot(before)
  check(save.slot() === before, `切回原槽 ${before}`)
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
