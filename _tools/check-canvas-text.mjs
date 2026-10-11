// 切片断言（R14 的"下一层"）：按**真实文本绘制**核对每一个界面
//
// 【为什么还要有这一层】`check-canvas-bounds.mjs` 核的是游戏**自己交出来的矩形**
// （`uiBBoxes()`）。只要某段文字是直接 `text.stroked(...)` 画上去的、没登记成矩形，
// 它就看不见 —— 而本项目三次视觉事故**全是这一类**：
//   · 第 43 轮 操作说明最后 4 行画到屏幕外
//   · 第 44 轮 小游戏规则行左右溢出
//   · 第 45 轮 服饰货架上的名字被页脚文字压住
// 这一层换一种做法：**在测试台的假 canvas 上记录每一次 fillText 的真实坐标与字号**
// （连变换矩阵一起算，见 game-harness 的 FakeCtx），然后对每个界面断言：
//   ① 每一个文本框都在画布内（允许 1px 抹平误差）
//   ② 同一帧里没有两个文本框大面积相压（压住的字谁也读不清）
//   ③ 自证：确实记到了文本（否则"零问题"可能只是**什么都没画**）
//
// 用法: MG_DUMP=1 node _tools/check-canvas-text.mjs
//   MG_DUMP=1  只打印每个界面记录到的文本量与可疑项，不判红（用来定阈值/排查）
//   ⚠️ 不能用 argv 传选项：`game-harness.mjs` 把 argv[2] 当**项目根目录**
//      （传 "--dump" 进去它会去找 `--dump/game.html`）。这是本项目记过的坑，统一用环境变量。
import { T } from './game-harness.mjs'

const t = T
t.load('game/game.js')
await T.settle()

const W = t.get('window')
const DBG = W.__DKDbb_DEBUG__
const D = W.DKDbbData
const world = t.get('__world')
const ctx = t.canvas._ctx
const CW = t.canvas.width, CH = t.canvas.height
const DUMP = !!process.env.MG_DUMP

let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

// 抓一帧的文本记录：开记录 → 走一帧 → 关记录
// `clearTransient` 会把**浮动提示**清掉：toast 是"有意压在内容之上"的覆盖层
//（它自带 92% 不透明的底板 + 边框），留在画面里会让"文字互相压住"这类断言全是误报。
// toast 本身另有专门的断言（见最后一节），不是不查，是换个查法。
function grabTexts(clearTransient = true) {
  if (clearTransient) { S().toast = null; S().notice = null }
  ctx.texts.length = 0; ctx.rects.length = 0
  ctx.recordText = true
  t.step(1)
  ctx.recordText = false
  return { texts: ctx.texts.slice(), rects: ctx.rects.slice() }
}

const inView = (b, tol = 1) => b.x >= -tol && b.y >= -tol && b.x + b.w <= CW + tol && b.y + b.h <= CH + tol
const fmt = (b) => `「${b.s.slice(0, 16)}」[${b.x.toFixed(0)},${b.y.toFixed(0)} ${b.w.toFixed(0)}×${b.h.toFixed(0)}]`

// 两个框的相交面积占**较小那个**的比例
function overlapRatio(a, b) {
  const x0 = Math.max(a.x, b.x), x1 = Math.min(a.x + a.w, b.x + b.w)
  const y0 = Math.max(a.y, b.y), y1 = Math.min(a.y + a.h, b.y + b.h)
  if (x1 <= x0 || y1 <= y0) return 0
  const inter = (x1 - x0) * (y1 - y0)
  const small = Math.min(a.w * a.h, b.w * b.h)
  return small > 0 ? inter / small : 0
}

// 同一帧里找到的"大面积相压"对（同一串字画了两次不算：比如阴影/描边同坐标，已按 fillText 去重）
function heavyOverlaps(texts, thr) {
  const out = []
  // 完全相同位置+内容的，先合并（同一元素的多遍绘制）
  const uniq = []
  const seen = new Set()
  for (const b of texts) {
    const k = `${b.s}|${b.x.toFixed(1)}|${b.y.toFixed(1)}`
    if (seen.has(k)) continue
    seen.add(k); uniq.push(b)
  }
  for (let i = 0; i < uniq.length; i++) {
    // 只比较"都不算长"的：长文本（剧情/说明）本来就成段排布，跨行相交是正常排版
    for (let j = i + 1; j < uniq.length; j++) {
      const r = overlapRatio(uniq[i], uniq[j])
      if (r >= thr) out.push({ a: uniq[i], b: uniq[j], r })
    }
  }
  return out
}

// ---------- 走一遍所有能到的主界面 ----------
// 每个界面：{ 名字, 进入方式 }。进入后抓一帧文本。
const screens = []
const addScreen = (name, enter) => screens.push({ name, enter })

// 主菜单
addScreen('主菜单', () => { S().mode = 'title'; W.DKDbb.save.data.started = true; t.step(2) })
addScreen('主菜单·读档面板', () => { S().mode = 'title'; DBG.titleAction('load'); t.step(3) })
addScreen('主菜单·操作说明', () => { S().mode = 'title'; DBG.titleAction('help'); t.step(2) })
addScreen('主菜单·关于', () => { S().mode = 'title'; DBG.titleAction('about'); t.step(2) })
// 世界与场景
addScreen('世界地图', () => { S().mode = 'worldmap'; t.step(2) })
addScreen('地点列表', () => { S().mode = 'worldmap'; T.key(' '); t.step(3) })
addScreen('场景', () => {
  S().mode = 'worldmap'; S().mapSel = 0; S().placeSel = 0; t.step(1)
  T.key(' '); t.step(3)
  if (S().mode === 'places') { S().placeSel = 0; t.step(1); T.key(' '); t.step(4) }
})
// 面板类
addScreen('背包', () => { S().mode = 'explore'; T.key('b'); t.step(3) })
addScreen('属性面板', () => { S().mode = 'explore'; T.key('c'); t.step(3) })
addScreen('技能面板', () => { S().mode = 'explore'; T.key('k'); t.step(3) })
addScreen('索亚面板', () => { S().mode = 'explore'; T.key('p'); t.step(3) })
addScreen('图鉴·多比', () => { S().mode = 'explore'; T.key('l'); t.step(3) })
addScreen('任务列表', () => { S().mode = 'explore'; T.key('q'); t.step(3) })
addScreen('战报', () => { S().mode = 'explore'; T.key('z'); t.step(3) })
addScreen('小游戏列表', () => { S().mode = 'explore'; T.key('y'); t.step(3) })
addScreen('唤醒多比', () => { S().mode = 'explore'; T.key('h'); t.step(3) })
addScreen('珍宝小屋·兑换', () => { S().mode = 'explore'; T.key('j'); t.step(3); DBG.setTreasureTab && DBG.setTreasureTab(1); t.step(2) })
addScreen('杂货铺', () => { S().mode = 'explore'; T.key('g'); t.step(3) })
addScreen('服饰大楼', () => { S().mode = 'explore'; DBG.openCostumeShop(); t.step(2) })
addScreen('副本列表', () => { S().mode = 'explore'; T.key('i'); t.step(3) })

function S() { return DBG.state }

// 副本内部的关卡：**从数据里自动发现**，不手写名单（R6）
{
  const dAll = DBG.dungeons()
  const kindsOf = (id) => {
    const d = D.dungeonById(id)
    return d && d.stages ? d.stages.map((s) => s.kind) : []
  }
  // 全部副本里出现过的关卡类型
  const dKinds = [...new Set(dAll.flatMap((d) => kindsOf(d.id)))].sort()
  for (const kind of dKinds) {
    // `battle` / `boss` 关会切到**战斗界面**（mode=battle），不是副本自己画的 —— 单独按战斗覆盖
    if (kind === 'battle' || kind === 'boss') continue
    addScreen(`副本关卡·${kind}`, () => {
      let found = null
      for (const d of dAll) {
        const ks = kindsOf(d.id)
        if (ks.includes(kind)) { found = { id: d.id, idx: ks.indexOf(kind) }; break }
      }
      if (!found) throw new Error(`没有任何副本含 ${kind} 关`)
      W.DKDbb.save.data.level = 60
      DBG.enterDungeon(found.id)
      const s = DBG.dungeonState()
      s.idx = found.idx; s.phase = 'stage'
      S().mode = 'dungeon'
      DBG.startStage()
      t.step(3)
      if (S().mode !== 'dungeon') throw new Error(`没进到关卡（mode=${S().mode}）`)
    })
  }
  // 副本里的战斗关（battle / boss）→ 战斗界面
  for (const kind of dKinds.filter((k) => k === 'battle' || k === 'boss')) {
    addScreen(`副本战斗·${kind}`, () => {
      let found = null
      for (const d of dAll) {
        const ks = kindsOf(d.id)
        if (ks.includes(kind)) { found = { id: d.id, idx: ks.indexOf(kind) }; break }
      }
      if (!found) throw new Error(`没有任何副本含 ${kind} 关`)
      W.DKDbb.save.data.level = 60
      DBG.enterDungeon(found.id)
      const s = DBG.dungeonState()
      s.idx = found.idx; s.phase = 'stage'
      S().mode = 'dungeon'
      DBG.startStage()
      for (let i = 0; i < 400 && S().mode === 'battle' && S().battle && (S().battle.phase !== 'command' || S().battle.intro > 0); i++) t.step(1)
      if (S().mode !== 'battle') throw new Error(`没进到战斗（mode=${S().mode}）`)
    })
  }
  // 小游戏：它们是**独立关卡**（临时单关卡副本），不在上面那批里 —— 必须单独覆盖，
  // 否则 blocks / runner / flycatch… 这些界面一条都检查不到。
  // ⚠️ `playableMinigames()` 返回的是 **id 数组**，不是对象（要自己查回对象）——
  //    第一版按对象用（m.id / m.name），于是 12 个小游戏全部报 "开不起来（undefined）"。
  for (const id of DBG.playableMinigames()) {
    const m = D.minigameById(id)
    if (!m) continue
    addScreen(`小游戏关·${m.name}`, () => {
      S().mode = 'explore'
      W.DKDbb.save.data.level = 60
      if (DBG.startMinigame(id) !== true) throw new Error(`开不起来（${id}）`)
      t.step(3)
      if (S().mode !== 'dungeon') throw new Error(`没进到关卡（mode=${S().mode}）`)
    })
  }
}

// ---------- 逐屏检查 ----------
section('逐屏：文本必须在画面内、且不互相压住')
const OVERLAP_THR = 0.55      // 较小那个框被压掉 55% 以上才算问题（保守，先看数据）
const report = []
for (const sc of screens) {
  let texts = []
  try {
    sc.enter()
    texts = grabTexts().texts
  } catch (e) {
    report.push({ name: sc.name, err: e.message, n: 0 })
    console.log(`  · ${sc.name}：进入失败（${e.message.slice(0, 60)}）`)
    continue
  }
  const off = texts.filter((b) => !inView(b))
  const ov = heavyOverlaps(texts, OVERLAP_THR)
  const where = `${S().mode}${S().mode === 'dungeon' ? '/' + DBG.dungeonState().phase : ''}`
  report.push({ name: sc.name, n: texts.length, off, ov, where })
  const tag = off.length || ov.length ? '  ← 有问题' : ''
  console.log(`  ${sc.name.padEnd(16)} 文本 ${String(texts.length).padStart(3)} 条　越界 ${off.length}　压字 ${ov.length}　[${where}]${tag}`)
  if (DUMP) {
    // 样本文本：用来核对"这个界面真的进到了吗" —— 不然"零问题"可能只是**什么都没画**
    console.log(`      样本: ${texts.slice(0, 6).map((b) => b.s.slice(0, 14)).join(' | ')}`)
    for (const b of off.slice(0, 4)) console.log(`      ⚠ 越界 ${fmt(b)}`)
    for (const o of ov.slice(0, 4)) console.log(`      ⚠ 压字 ${(o.r * 100).toFixed(0)}% ${fmt(o.a)} × ${fmt(o.b)}`)
  }
}

// ---------- 浮动提示（toast）：允许压内容，但**必须自带底板**且在画面内 ----------
section('浮动提示：压在内容之上是有意的，但必须有底板')
{
  // 进一个场景会触发 toast（"进入 XX"）—— 这里就借它，不额外造接口
  S().mode = 'worldmap'; S().mapSel = 0; S().placeSel = 0; t.step(1)
  T.key(' '); t.step(3)
  if (S().mode === 'places') { S().placeSel = 0; t.step(1); T.key(' '); t.step(4) }
  const g = grabTexts(false)          // 这次**不清**浮动提示
  const toast = g.texts.find((b) => /^进入 /.test(b.s))
  check(!!S().toast, `进场景后确实弹了浮动提示（msg=${S().toast ? S().toast.msg : '无'}）`)
  check(!!toast, '浮动提示的文字被记录到了', g.texts.map((b) => b.s).join('/').slice(0, 80))
  if (toast) {
    check(inView(toast), `浮动提示在画面内（${fmt(toast)}）`)
    // 底板：有一块不透明矩形把提示文字**盖住**（画在它后面，视觉上就是它的底）
    const under = g.rects.filter((r) => r.x <= toast.x + 2 && r.y <= toast.y + 2
      && r.x + r.w >= toast.x + toast.w - 2 && r.y + r.h >= toast.y + toast.h - 2)
    check(under.length > 0, '浮动提示自带不透明底板（不然就是糊在内容上读不清）',
      `记到 ${g.rects.length} 块底板，没有一块盖住它`)
  }
}

if (!DUMP) {
  section('判定')
  const withText = report.filter((r) => r.n > 0)
  check(withText.length >= screens.length - 2,
    `绝大多数界面都记录到了文本（${withText.length}/${screens.length}，其余是没有文字的纯图形界面）`,
    report.filter((r) => !r.n).map((r) => r.name).join('/'))
  const bad = report.filter((r) => (r.off && r.off.length) || (r.ov && r.ov.length))
  check(bad.length === 0, `没有界面出现"文字越界"或"文字互相压住"（检查了 ${screens.length} 个界面）`,
    bad.map((r) => `${r.name}(越界${r.off.length}/压字${r.ov.length})`).join(' '))
  // 自证（R5）：这套检查必须真的抓得住问题 —— 拿一个已知越界的框试一次
  {
    const fake = [{ s: '越界测试', x: CW - 10, y: 10, w: 200, h: 16 }]
    check(fake.filter((b) => !inView(b)).length === 1, '自证：故意造一个越界框，检查能抓到')
    const a = { s: 'A', x: 100, y: 100, w: 80, h: 16 }
    const b2 = { s: 'B', x: 110, y: 100, w: 80, h: 16 }
    check(heavyOverlaps([a, b2], OVERLAP_THR).length === 1, '自证：故意造一对重叠框，检查能抓到')
    const c = { s: 'C', x: 400, y: 100, w: 80, h: 16 }
    check(heavyOverlaps([a, c], OVERLAP_THR).length === 0, '自证：分开的两个框不会被误判')
    // 自证：记录的界面数不能是 0（否则"零问题"毫无意义）
    check(report.length >= 40, `自证：确实检查了足够多的界面（${report.length} 个）`)
    const noText = report.filter((r) => r.n === 0)
    check(noText.length === 0, '自证：没有界面是"零文本"（零文本说明没进到界面，检查是空的）',
      noText.map((r) => r.name).join('/'))
  }
  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
  process.exit(fail ? 1 : 0)
}
