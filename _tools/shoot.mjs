// 无头截图：把游戏真的"画"出来，存成 PNG，这样我能看到画面到底长什么样。
//
// 做法：
//   1) 用像素级 Canvas（_tools/pixel-canvas.mjs）替换测试台的假 canvas
//   2) 把 assets 里所有 PNG 预先解码进图片注册表，游戏的 drawImage 就能画出真实素材
//   3) 用字形图集（_tools/text-render.mjs）渲染中文
//   4) 走一遍交互流程，在每一步截图
//
// 用法: node _tools/shoot.mjs [输出目录]
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { decodePng, encodePng, makeFramebuffer, PixelCtx, parseColor } from './pixel-canvas.mjs'
import { loadGlyphAtlas, TextRenderer } from './text-render.mjs'

const ROOT = path.resolve('.')
const OUTDIR = path.resolve(process.argv[2] || path.join(ROOT, 'docs', 'shots'))
// --battle-only：跳过前面冗长的 NPC 对话搜索（约 7000 帧），只拍战斗相关画面
const BATTLE_ONLY = process.argv.includes('--battle-only')
// --ui-only：只拍界面（主菜单/大地图/地点/场景），拍完就退出 —— 排查界面问题用，几秒钟
const UI_ONLY = process.argv.includes('--ui-only')
fs.mkdirSync(OUTDIR, { recursive: true })

// ---------- 图片注册表 ----------
// 关键：测试台默认的 FakeImage 是 320×320 空壳，util.drawSprite 会因此算错缩放而静默失败，
// 截图里角色只剩占位圆圈。这里换成真实解码的像素（见 _tools/real-images.mjs 的说明）。
// JPEG 素材（68 个，主要是场景图）没有解码器，用 _tools/convert-jpg.mjs 预先转成 PNG 缓存。
const jpgCachePath = path.join(ROOT, '_tools', 'imgcache', 'index.json')
const jpgCache = fs.existsSync(jpgCachePath) ? JSON.parse(fs.readFileSync(jpgCachePath, 'utf8')) : {}
const imgCache = new Map()
let decodedCount = 0, missingCount = 0
function loadImagePixels(rel) {
  if (imgCache.has(rel)) return imgCache.get(rel)
  // jpg 走转好的 PNG 缓存
  const actual = jpgCache[rel] || rel
  const p = path.join(ROOT, actual)
  let v = null
  if (fs.existsSync(p)) {
    try {
      const png = decodePng(fs.readFileSync(p))
      if (png.w > 4 && png.h > 4) v = { w: png.w, h: png.h, data: png.data }
    } catch (e) { v = null }
  }
  if (v) decodedCount++
  else missingCount++
  imgCache.set(rel, v)
  return v
}
// 预解码：场景图 + 所有形态的待机/战斗/胜利帧 + 全部怪物立绘
const manifestPath = path.join(ROOT, 'assets', 'manifest.json')
if (fs.existsSync(manifestPath)) {
  const man = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  for (const s of man.scenes || []) if (s.file) loadImagePixels(s.file)
}
// 形态官方立绘与头像：现在角色形象以它们为准，不预解码截图里就没有人
{
  const idxPath = path.join(ROOT, 'assets', 'forms', 'art', 'index.json')
  if (fs.existsSync(idxPath)) {
    for (const f of JSON.parse(fs.readFileSync(idxPath, 'utf8')).forms) {
      loadImagePixels(f.file)
      loadImagePixels(f.icon)
    }
  }
}
// 技能图标（技能面板要用）
{
  const idxPath = path.join(ROOT, 'assets', 'skills', 'index.json')
  if (fs.existsSync(idxPath)) {
    for (const it of JSON.parse(fs.readFileSync(idxPath, 'utf8')).icons) loadImagePixels(it.file)
  }
}
// 道具图标
{
  const ip = path.join(ROOT, 'assets', 'items.js')
  if (fs.existsSync(ip)) {
    const txt = fs.readFileSync(ip, 'utf8')
    for (const m of txt.matchAll(/"icon":"([^"]+)"/g)) loadImagePixels(m[1])
  }
}
{
  // 形态动画 + 时装（NPC）动画：只预解码常用动作，避免把 4157 帧全读进来
  const animPath = path.join(ROOT, 'assets', 'anim', 'index.json')
  if (fs.existsSync(animPath)) {
    const idx = JSON.parse(fs.readFileSync(animPath, 'utf8'))
    // ⚠️ 必须包含**正面二 / 背面一 / 背面二**：走路用的是「正面一 ↔ 正面二」交替
    //（背面一/二 用于往上走）。早先只预解码了「正面一」，于是截图里主角
    // `drawCostumeFigure` 取不到踏步帧 → 返回 false → **回退成多比立绘**，
    // 看起来"改了没生效"，其实是**截图环境的素材没加载**（测试台里假 Image 永远能加载，所以测试是绿的）。
    const want = /普通姿态|战斗姿态|胜利|防御|正面一|正面二|背面一|背面二/
    for (const a of Object.values(idx.actions)) {
      if (!want.test(a.action)) continue
      for (let i = 0; i < a.frames; i++) {
        loadImagePixels('assets/anim/' + a.dir + '/' + String(i).padStart(4, '0') + '.png')
      }
    }
  }
}
// 怪物立绘（assets/monsters/map.json 的 map 与 detail 里都有路径）
{
  const mv = path.join(ROOT, 'assets', 'monsters', 'map.json')
  if (fs.existsSync(mv)) {
    const m = JSON.parse(fs.readFileSync(mv, 'utf8'))
    for (const v of Object.values(m.map || {})) if (typeof v === 'string') loadImagePixels(v)
    for (const d of (m.detail || [])) if (d.sprite) loadImagePixels(d.sprite)
  }
}
console.log('预解码图片 ' + decodedCount + ' 张（缺 ' + missingCount + '）')

// ---------- 环境 ----------
const canvas = {
  width: 960, height: 560,
  _fb: makeFramebuffer(960, 560),
  _textRenderer: null,
  _onCall: null,
  style: {},
  _handlers: new Map(),
  addEventListener(t, fn) { if (!this._handlers.has(t)) this._handlers.set(t, []); this._handlers.get(t).push(fn) },
  removeEventListener() { },
  fire(t, ev) { const a = this._handlers.get(t); if (a) for (const fn of a.slice()) fn(ev || {}) },
  getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 560 } },
  clientFromCanvas(x, y) { return { clientX: x, clientY: y } },
}
const glyphs = loadGlyphAtlas()
canvas._textRenderer = new TextRenderer(glyphs)
const ctx = new PixelCtx(canvas)
canvas.getContext = () => ctx
canvas._ctx = ctx

class FakeImage {
  constructor() {
    this.complete = true
    this._src = ''
    this.width = 0; this.height = 0
    this._pixels = null
    this._handlers = new Map()
  }
  addEventListener(t, fn) { if (!this._handlers.has(t)) this._handlers.set(t, []); this._handlers.get(t).push(fn) }
  removeEventListener() { }
  set src(v) {
    this._src = v
    const px = loadImagePixels(v)
    if (px) {
      this._pixels = px
      this.width = this.naturalWidth = px.w
      this.height = this.naturalHeight = px.h
    } else {
      // 素材缺失时给一个占位尺寸（游戏里会走"图未加载"分支）
      this._pixels = null
      this.width = this.naturalWidth = 1
      this.height = this.naturalHeight = 1
    }
    const a = this._handlers.get('load'); if (a) for (const fn of a) fn({})
  }
  get src() { return this._src }
}

class El {
  constructor(id) { this.id = id; this.style = {}; this.textContent = ''; this._h = new Map(); this.classList = { add() { }, remove() { }, toggle() { }, contains() { return false } } }
  addEventListener(t, fn) { if (!this._h.has(t)) this._h.set(t, []); this._h.get(t).push(fn) }
  removeEventListener() { }
  fire(t, ev) { const a = this._h.get(t); if (a) for (const fn of a) fn(ev || {}) }
  click() { this.fire('click', {}) }
}

const elements = new Map()
const doc = new El('document')
doc.getElementById = (id) => { if (id === 'game') return canvas; if (!elements.has(id)) elements.set(id, new El(id)); return elements.get(id) }
doc.createElement = () => new El('created')
doc.documentElement = new El('html')
doc.body = new El('body')
doc.fullscreenElement = null
doc.exitFullscreen = () => Promise.resolve()

const win = new El('window')
win.innerWidth = 1400; win.innerHeight = 900; win.devicePixelRatio = 1
win.localStorage = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() } })()
const rafQ = []
win.requestAnimationFrame = (fn) => { rafQ.push(fn); return rafQ.length }
win.cancelAnimationFrame = () => { }
win.Image = FakeImage
win.Audio = class { constructor(s) { this.src = s || ''; this.loop = false; this.volume = 1; this.paused = true } play() { this.paused = false; return Promise.resolve() } pause() { this.paused = true } }
let fakeNow = 1000000
win.performance = { now: () => fakeNow }

const sandbox = {
  window: win, document: doc, console,
  Math, Object, Array, JSON, Number, String, Boolean, RegExp, Error, Date,
  Map, Set, Promise, parseInt, parseFloat, isNaN, Infinity, NaN, undefined,
  setTimeout: (fn) => { setTimeout(fn, 0); return 0 }, setInterval: () => 0, clearInterval: () => { }, clearTimeout: () => { },
  requestAnimationFrame: win.requestAnimationFrame, cancelAnimationFrame: win.cancelAnimationFrame,
  Image: FakeImage, Audio: win.Audio, localStorage: win.localStorage, performance: win.performance,
  confirm: () => false, alert: () => { }, location: { reload() { } },
  Uint8Array, Uint8ClampedArray, Float32Array, Int32Array,
}
sandbox.globalThis = sandbox
sandbox.self = sandbox
vm.createContext(sandbox)

// 幂等加载：同一个文件只执行一次。
// 为什么必须这样：下面既按 game.html 加载全部脚本（含 game/game.js），
// 又有一句显式的 T.load('game/game.js')。以前没有这个守卫，game.js 就被执行了两次 ——
// 于是跑起来有**两个游戏实例、两个 RAF 循环**：按空格只改了先加载那个实例的状态，
// 而 window.__DKDbb_DEBUG__ 被后加载的实例覆盖，读出来永远是旧状态。
// 表现极具迷惑性："标题页按空格没反应"，但逐个函数打日志又都正常。
const _loaded = new Set()
const load = (rel) => {
  if (_loaded.has(rel)) return
  const p = path.join(ROOT, rel)
  if (!fs.existsSync(p)) throw new Error('缺少 ' + rel)
  vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: rel })
  _loaded.add(rel)
}
// 脚本清单**直接来自 game.html**，不再手写。
// 这个坑踩过两次：harness 与这里都各自维护一份清单，后来加的 assets/soya.js、
// game/tables/skills-official.js、game/tables/form-skills-official.js 都没进清单，
// 于是"截图正常"但截出来的其实是没有官方技能、没有索亚的旧画面。
{
  const html = fs.readFileSync(path.join(ROOT, 'game.html'), 'utf8')
  const list = [...html.matchAll(/<script\s+src=["']([^"']+)["']/g)].map((m) => m[1])
  if (list.length < 10) throw new Error('game.html 解析出的脚本过少: ' + list.length)
  for (const f of list) load(f)
  console.log('按 game.html 加载脚本 ' + list.length + ' 个')
}

// ---------- 交互 ----------
const T = {
  sandbox, canvas, ctx, win, doc,
  step(n = 1) {
    for (let i = 0; i < n; i++) {
      fakeNow += 16.7
      const q = rafQ.splice(0, rafQ.length)
      for (const fn of q) fn(fakeNow)
    }
  },
  move(x, y) { canvas.fire('mousemove', { clientX: x, clientY: y, button: 0, preventDefault() { } }) },
  click(x, y) {
    canvas.fire('mousemove', { clientX: x, clientY: y, button: 0, preventDefault() { } })
    canvas.fire('mousedown', { clientX: x, clientY: y, button: 0, preventDefault() { } })
    T.step(1)
    win.fire('mouseup', { button: 0 })
  },
  key(k) { win.fire('keydown', { key: k, preventDefault() { } }); win.fire('keyup', { key: k }); T.step(1) },
  // 等游戏真的离开载入页（与 game-harness 的 settle 同语义）。
  // 截图脚本用的是自己这份测试台，所以这个方法也要在这里有一份 ——
  // 否则脚本里 `await T.settle()` 会直接抛 "T.settle is not a function"。
  async settle({ tries = 40, waitMs = 20, quiet = 30 } = {}) {
    for (let i = 0; i < tries; i++) {
      await new Promise((r) => setTimeout(r, waitMs))
      const st = T.get('window.__DKDbb_DEBUG__ && window.__DKDbb_DEBUG__.state')
      if (st && st.mode && st.mode !== 'loading') {
        for (let k = 0; k < quiet; k++) T.step(1)
        return true
      }
      T.step(2)
    }
    return false
  },
  get(n) { return vm.runInContext(n, sandbox) },
  run(c) { return vm.runInContext(c, sandbox) },
  load: (rel) => load(rel),
}

T.load('game/game.js')
// 把 window 上的全局暴露到 sandbox 顶层（游戏脚本里是 window.xxx，测试脚本直接引用）
T.run('globalThis.__world = window.__DKDbb_WORLD__; globalThis.__man = window.__DKDbb_MANIFEST__;')
T.run('globalThis.__anim = window.__DKDbb_ANIM__; globalThis.DKDbbData = window.DKDbbData;')
T.run('globalThis.DKDbbMouse = window.DKDbbMouse; globalThis.DKDbb = window.DKDbb;')
// game.js 末尾会启动 boot()。boot 里现在有 `await save.loadFile()`，
// 也就是**第一个真正的挂起点**：不把微任务队列跑空，boot 会永远停在 loading，
// 截图全是空白的（踩过一次）。这里显式等一拍再推进帧。
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

function shot(name) {
  const png = encodePng(960, 560, canvas._fb)
  const p = path.join(OUTDIR, name + '.png')
  fs.writeFileSync(p, png)
  const st = T.get('window.__DKDbb_DEBUG__').state
  console.log('  截图 ' + name + '.png  (' + (png.length / 1024).toFixed(0) + ' KB)  mode=' + st.mode)
  return p
}

// ================= 走一遍流程并截图 =================
const DBG = () => T.get('window.__DKDbb_DEBUG__')
const S = () => DBG().state
const D = T.get('window.DKDbbData')
console.log('\n=== 逐个画面截图 ===')
shot('01-title')

// 主菜单各页：读档面板 / 操作说明 / 关于 / 新档确认
{
  const menu = DBG().titleMenu
  DBG().titleAction('load')
  T.step(30)
  shot('01a-title-load')
  DBG().titleAction('help')
  T.step(3)
  shot('01b-title-help')
  DBG().titleAction('about')
  T.step(3)
  shot('01c-title-about')
  DBG().titleAction('new')
  T.step(3)
  shot('01d-title-confirmnew')
  S().mode = 'title'
  menu.view = 'main'; menu.sel = 0; menu.msg = ''
  T.step(3)
}

// 标题 → 大地图
T.key(' ')
T.step(3)
console.log('  按空格后 mode=' + S().mode + (S().title && S().title.msg ? '  菜单提示=' + S().title.msg : ''))
shot('02-worldmap')

// 点岛 → 地点列表
// 坐标**向游戏查询**，不自己算一套：以前这里复刻了绘制里的版式公式，
// 地图版式一改（信息条移到顶部那次）就会点空，而且失败得很安静。
const world = T.get('__world')
const G = DBG().mapGeom()
const isl = world.islands[0]
T.move(G.ox + isl.x * G.r, G.oy + isl.y * G.r)
T.click(G.ox + isl.x * G.r, G.oy + isl.y * G.r)
T.step(3)
shot('03-places')

// 进第一个岛**中间**的一个场景：这样左右两侧都有出口，能演示场景互通。
// 取链首的话只有右出口，取链尾则一个出口都没有（那样截图就演示不出东西）。
{
  // 先把鼠标移开：地点列表是"悬停即选中"，鼠标留在原处会把下面设的 placeSel 顶掉
  T.move(4, 4); T.step(1)
  const isl0 = world.islands[0]
  S().placeSel = Math.min(1, isl0.scenes.length - 1)
  T.step(1)
  console.log(`  进入岛屿「${isl0.name}」的第 ${S().placeSel + 1} 个场景（id=${isl0.scenes[S().placeSel]}）`)
}
T.key(' ')
T.step(4)
shot('04-scene')

// 移动一下，再截图（看角色行走/朝向）
T.click(200, 460)
T.step(60)
shot('05-scene-walk')

// 【第 62 轮】B14 那 5 个官方场景（scene_89..93）逐个拍一张。
// 它们是本轮**新增**的：官方图 + 官方名直接来自归档原图，归属按"逐张看图、按画面物体归类"定案。
{
  const NEWS = [[89, '云中城堡'], [90, '城堡大厅'], [91, '燃烧瀑布'], [92, '幽水宫'], [93, '邪力宫殿']]
  let n = 0
  for (const [id, name] of NEWS) {
    if (DBG().enterScene(id) === true) {
      S().toast = null
      T.step(3)
      shot(`34-newscene-${id}-${name}`)
      n++
    } else console.log(`  （进不去 scene_${id} ${name}）`)
  }
  console.log(`  新增场景：已拍 ${n}/5 张`)
  // 拍完回到原来那个场景，别影响后面的截图。
  // ⚠️ `isl0` 只在**完整流程**那段作用域里有；`--ui-only` 模式跑到这里会 ReferenceError
  //    （第 66 轮实测踩到：整个 shoot 直接崩在中途，后面的截图全没了）。
  const back = typeof world !== 'undefined' && world.islands[0]
  if (back) {
    DBG().enterScene(back.scenes[Math.min(S().placeSel || 0, back.scenes.length - 1)])
    T.step(2)
  }
}

// 【第 53 轮】走路 4 帧特写。
// 起因：用户说主角走路"就像在空中飘动一样"，后来又报"没有走、眼睛和小脚会消失"。
// 判据是**游戏里显示的样子**，所以这里把步态的几个相位各拍一张。
//
// ⚠️ 不能只写 `S().player.moving = true` —— 更新逻辑每帧开头就是 `p.moving = false`
//（"朝目标移动"那段），没有目标/方向键时它立刻被重置，绘制走的是**站立分支**。
// 第一版就是这么写的，于是拍出来的 4 张全是站立姿势 —— 我因此**没看出**用户报的问题。
// 正确做法：给一个远处的目标，让它**真的走起来**，边走边按相位抓帧。
{
  const p = S().player
  p.target = { x: Math.min(p.x + 500, 900), y: p.y }
  const shots = new Set()
  const pins = []
  for (let i = 0; i < 300 && shots.size < 4; i++) {
    T.step(1)                       // 这一帧就是"真的在走"的一帧（moving 由目标驱动）
    const q = Math.floor((p.walkPhase || 0) * 4) % 4
    if (p.moving && !shots.has(q)) {
      shots.add(q)
      // ⚠️ **不能**为了"钉住位置"再 step 一次：`p.target = null` 会让 moving 立刻变 false，
      //    于是画的是**站立分支**，4 张图全一样（我前面就是这么被骗过去的）。
      //    这里只记下主角当时的坐标，由拼图脚本按坐标裁 —— 不动游戏状态。
      pins.push({ phase: q + 1, x: Math.round(p.x), y: Math.round(p.y), walkPhase: Number((p.walkPhase || 0).toFixed(3)) })
      shot(`05w-walk-${q + 1}`)
    }
  }
  p.target = null
  fs.writeFileSync(path.join(OUTDIR, '05w-walk.json'), JSON.stringify(pins, null, 1))
  if (shots.size < 4) console.log(`  （走路截图只拍到 ${shots.size} 个相位）`)
  else console.log(`  走路 4 个相位已拍，主角坐标: ${pins.map((q) => q.x).join(', ')}`)
}

// 场景互通：一直往右走，走过边缘就会进下一个场景（同一座岛内）
{
  const before = S().current ? S().current.id : null
  T.win.fire('keydown', { key: 'ArrowRight', preventDefault() { } })
  let entryX = null
  for (let i = 0; i < 900; i++) {
    T.step(1)
    if (S().current && S().current.id !== before) { entryX = S().player.x; break }
  }
  T.win.fire('keyup', { key: 'ArrowRight' })
  console.log(`  场景互通：${before} → ${S().current ? S().current.id : '-'}（从 x=${entryX == null ? '-' : Math.round(entryX)} 进场）`)
  T.step(30)
  shot('05b-scene-next')
}

// 图鉴（多比 / 技能 / 索亚 / 怪物 / 骑士与魔王）—— M4 的产物，按 L 打开
{
  const before = S().mode
  T.key('l'); T.step(3)
  if (S().mode === 'zukan') {
    shot('06b-zukan-form')
    // 翻到技能页与骑士页各拍一张（技能 136 条、骑士 15 条）
    S().zukan.tab = 1; S().zukan.sel = 0; S().zukan.page = 0; T.step(2)
    shot('06c-zukan-skill')
    S().zukan.tab = 4; S().zukan.sel = 0; S().zukan.page = 0; T.step(2)
    shot('06d-zukan-knight')
    T.key('Escape'); T.step(2)
    console.log('  图鉴：已拍 3 张（多比/技能/骑士与魔王），返回后 mode=' + S().mode)
  } else {
    console.log('  （图鉴没打开，mode=' + S().mode + '，进入前是 ' + before + '）')
  }
}

// 战报 · 冒险者试炼（M4 周边系统，按 Z 打开；原版入口是点界面上方的「战报」按钮）
{
  const before = S().mode
  const btn = DBG().warButtonRect()
  T.move(btn.x + btn.w / 2, btn.y + btn.h / 2); T.step(1)
  T.click(btn.x + btn.w / 2, btn.y + btn.h / 2); T.step(3)
  if (S().mode === 'warreport') {
    shot('07-warreport')
    // 造一条"可领取"的任务再拍一张，确认领取态（绿框 + ★可领取）能看出来
    const list = DBG().warTasks()
    const t0 = list.find((x) => x.unlocked)
    if (t0) {
      win.DKDbb.save.data.warKills[t0.sid] = DBG().warTarget()
      S().warSel = list.indexOf(t0); S().warPage = 0
      T.step(2)
      shot('07b-warreport-ready')
    }
    T.key('Escape'); T.step(2)
    console.log(`  战报：已拍 2 张（列表 / 可领取态），返回后 mode=${S().mode}`)
  } else {
    console.log(`  （战报没打开，mode=${S().mode}，进入前是 ${before}）`)
  }
}

// 副本（M4-1 官方 14 个）：列表 → 解谜关 → 翻牌
{
  const before = S().mode
  T.key('i'); T.step(3)
  if (S().mode === 'dungeon') {
    shot('08-dungeon-list')
    // 进金字塔，拍一张解谜关
    DBG().enterDungeon('jinzita')
    T.step(4)
    shot('08b-dungeon-memory')    // 直接把玩家推强并跳到翻牌，拍翻牌界面
    const sv2 = win.DKDbb.save
    sv2.data.level = 70
    sv2.data.maxHp = 9999; sv2.data.hp = 9999
    const st = DBG().dungeonState()
    st.idx = (win.DKDbbData.dungeonById('jinzita').stages || []).length
    st.phase = 'flip'
    st.flip = { faces: ['金币', '彩晶石', '晶石碎片', '技能书'], picked: -1, reward: null, dungeon: '金字塔' }
    T.step(3)
    shot('08c-dungeon-flip')
    // 「无所遁形」潜行关（火烧赤壁，原文：与甲板上的敌人捉迷藏）
    // 先清掉上一步遗留的提示条，否则它会盖住关卡名（截图会看错）
    S().toast = null
    DBG().enterDungeon('huoshaochibi')
    S().toast = null
    for (let i = 0; i < 20; i++) { DBG().stealthTick(1 / 60); T.step(1) }
    shot('08d-dungeon-stealth')
    // 「激流勇进」（大禹治水，原文：站在最后面未必是安全的）
    S().toast = null
    DBG().enterDungeon('dayuzhishui')
    for (let i = 0; i < 40; i++) { DBG().currentTick(1 / 60); T.step(1) }
    S().toast = null
    shot('08f-dungeon-current')
    // 「连接能量管线」（战神金刚，原文：连接能量管线，使得能量能够顺利输送即可）
    S().toast = null
    DBG().enterDungeon('zhanshenjingang')
    S().toast = null
    T.step(3)
    shot('08h-dungeon-pipe')
    // 「驾驶超级战机」（太空堡垒，原文：打飞机的部分不是方向键控制的）
    // 用**真的关卡工厂**开局（第 43 轮改）：以前这里手搓一个 st2.sh 字面量，
    // 于是"敌机改用官方怪物立绘"之后截图里还是旧的橙色圆圈 —— 截图是文档，不许摆拍。
    DBG().enterDungeon('taikongbaolei')
    {
      const st2 = DBG().dungeonState()
      st2.idx = 1
      // 注意：太空堡垒第一关是战斗，enterDungeon 会把 S.mode 切成 battle。
      // 要拍空战画面就必须显式切回 dungeon 并把战斗状态清掉。
      S().battle = null
      S().mode = 'dungeon'
      DBG().startStage()
      for (let i = 0; i < 90; i++) { DBG().shooterTick(1 / 60); T.step(1) }
      console.log(`  太空堡垒空战：要打 ${st2.sh.need} 架、在场 ${st2.sh.targets.length} 架（${st2.sh.targets.map((x) => (x.mon ? x.mon.name : '无立绘')).join('、')}）`)
    }
    S().toast = null
    shot('08i-dungeon-shooter')
    // 「玛丽娜的考试」（武当保卫战，原文：玛丽娜要考考各位小多克）
    DBG().enterDungeon('wudangbaoweizhan')
    S().toast = null
    T.step(3)
    shot('08g-dungeon-quiz')
    // 「士气对抗」（噜噜王的终结，原文：会出现两个数值）
    DBG().enterDungeon('luluwang')
    S().toast = null
    DBG().moralePlay(0); DBG().moralePlay(1)
    S().toast = null
    T.step(3)
    shot('08e-dungeon-morale')
    // 「晶石对战」（第 57 轮按原文重做：三消攒能量 + 多比自动出手 + 5v5）
    DBG().enterDungeon('jingshiduizhan')
    S().toast = null
    T.step(3)
    shot('08j-dungeon-crystal')
    // 再拍一张"打了一半"的：有人残血、有只技能就绪、飘字与播报都在
    {
      const g = DBG().crystal()
      if (g) {
        g.mine[1].hp = Math.floor(g.mine[1].maxHp * 0.35)
        g.mine[0].energy = g.cfg.skillAt
        g.foe[2].hp = Math.floor(g.foe[2].maxHp * 0.4)
        g.turn = 5
        g.sel = { x: 2, y: 2 }
        g.log.push('火晶石 ×4 → 火属性多比充能 +20')
        g.floaters.push({ side: 'foe', idx: 2, text: '-88', color: '#ffd23f', life: 0.6 })
        S().toast = null
        T.step(2)
        shot('08k-dungeon-crystal-mid')
      } else {
        console.log('  （晶石对战没开起来，跳过 08k）')
      }
    }
    st.id = null; st.phase = 'list'
    S().mode = 'explore'; T.step(2)
    console.log(`  副本：已拍 7 张（列表 / 解谜 / 翻牌 / 潜行 / 士气 / 晶石 ×2），返回后 mode=${S().mode}`)
  } else {
    console.log(`  （副本没打开，mode=${S().mode}，进入前是 ${before}）`)
  }
}

// 珍宝小屋（M4-4 官方系统）：碎片合成页 + 珍宝兑换页
{
  S().toast = null
  S().mode = 'explore'; T.step(1)
  T.key('j'); T.step(3)
  if (S().mode === 'treasure') {
    DBG().setTreasureTab(0); S().toast = null; T.step(2)
    shot('09-treasure-make')
    // 让合成页有内容可看：给点碎片与白彩
    win.DKDbb.save.data.shards = 7
    win.DKDbb.save.data.white = 6
    DBG().setTreasureTab(1); S().toast = null; T.step(2)
    shot('09b-treasure-buy')
    T.key('Escape'); T.step(2)
    console.log(`  珍宝小屋：已拍 2 张（合成 / 兑换），返回后 mode=${S().mode}`)
  } else {
    console.log(`  （珍宝小屋没打开，mode=${S().mode}）`)
  }
}

// 宝石大厅 · 唤醒多比（M4-4 官方系统；唤醒条件是官方数值）
{
  S().toast = null
  S().mode = 'explore'; T.step(1)
  T.key('h'); T.step(3)
  if (S().mode === 'awaken') {
    // 让界面有可比性：给一些属性，好看出"够/不够"两种状态
    const sv3 = win.DKDbb.save
    sv3.data.attrs = { wisdom: 120, brave: 90, love: 0, charm: 60, fame: 4 }
    T.step(2)
    shot('10-awaken')
    T.key('Escape'); T.step(2)
    console.log(`  唤醒多比：已拍 1 张，返回后 mode=${S().mode}`)
  } else {
    console.log(`  （唤醒界面没打开，mode=${S().mode}）`)
  }
}

// 小游戏（M4-4 官方系统；名字与规则来自归档原版截图）
{
  S().toast = null
  S().mode = 'explore'; T.step(1)
  T.key('y'); T.step(3)
  if (S().mode === 'minigames') {
    shot('21-minigames')
    // 选中「魔法工匠」（第 2 项）再拍一张，看得出选中态与规则
    DBG().setMiniSel(1); T.step(2)
    shot('21b-minigames-sel')
    // 「魔法工匠」棋盘
    S().mode = 'explore'; T.step(1)
    DBG().startMinigame('magicArtisan'); T.step(3)
    shot('22-minigame-slide')
    // 真的走一次结算（finishMinigame 会发奖励并把阶段切到 miniDone）——
    // 早先这里直接把 miniResult 摆上去，结果截图里"本次获得 +140"和下方"金币 0"自相矛盾。
    // 截图是文档，**不许摆拍**：要么真的结算，要么不拍。
    DBG().finishMinigame(); T.step(3)
    shot('22b-minigame-done')
    // 「记忆水晶」记忆力关
    S().mode = 'explore'; T.step(1)
    DBG().startMinigame('memoryCrystal'); T.step(3)
    shot('23-minigame-memory')
    // 「思维方块」四连消除
    S().mode = 'explore'; T.step(1)
    DBG().startMinigame('thinkBlocks')
    {
      const b = DBG().dungeonState().bl
      for (let r = b.rows - 3; r < b.rows; r++) for (let c = 0; c < b.cols; c++) b.grid[r][c] = (r + c) % b.kinds
      for (let i = 0; i < 24; i++) DBG().blocksTick(1 / 60)
    }
    T.step(3)
    shot('24-minigame-blocks')
    // 「多比快跑」
    S().mode = 'explore'; T.step(1)
    DBG().startMinigame('dobiRun')
    {
      for (let i = 0; i < 46; i++) { DBG().runnerPress(); DBG().runnerTick(1 / 60) }
    }
    T.step(3)
    shot('25-minigame-runner')
    // 「王牌大空战」（空战玩法；敌机用官方怪物立绘，第 43 轮）
    S().mode = 'explore'; T.step(1)
    DBG().startMinigame('aceDogfight')
    for (let i = 0; i < 150; i++) { DBG().chargeShooterTick(1 / 60); T.step(1) }
    {
      const cs = DBG().chargeShooterState()
      console.log(`  王牌大空战：要打 ${cs.need} 架、在场 ${cs.foes.length} 架（${cs.foes.map((f) => (f.mon ? f.mon.name : '无立绘')).join('、')}）`)
    }
    S().toast = null
    shot('26-minigame-aceshooter')
    // 「拯救多比古书」（跳跃救书）
    S().mode = 'explore'; T.step(1)
    DBG().startMinigame('saveBook')
    for (let i = 0; i < 40; i++) { DBG().platformerTick(1 / 60); T.step(1) }
    S().toast = null
    shot('27-minigame-platformer')
    // 「滑雪跳台」
    S().mode = 'explore'; T.step(1)
    DBG().startMinigame('skiJump')
    for (let i = 0; i < 90; i++) { DBG().skiTick(1 / 60); T.step(1) }
    S().toast = null
    shot('28-minigame-ski')
    // 「魔幻音符」
    S().mode = 'explore'; T.step(1)
    DBG().startMinigame('magicNote')
    for (let i = 0; i < 120; i++) { DBG().notesTick(1 / 60); T.step(1) }
    S().toast = null
    shot('29-minigame-notes')
    // 「飞翔的衣服」（第 44 轮新增：官方攻略读出的玩法 —— 衣服满天飞、用网子抓、要提前下网）
    S().mode = 'explore'; T.step(1)
    DBG().startMinigame('flyClothes')
    for (let i = 0; i < 40; i++) { DBG().flyCatchTick(1 / 60); T.step(1) }
    {
      const fc = DBG().flyCatchState()
      const P = DBG().flyCatchParams()
      // 让画面里有"正在飞的网"和"已合拢的网"两种状态，截图才说明得了机制
      const c = fc.clothes.filter((x) => !x.got)[0]
      if (c) DBG().flyCatchCast(c.x + c.vx * P.netDelay, c.y + c.vy * P.netDelay)
      for (let i = 0; i < 12; i++) { DBG().flyCatchTick(1 / 60); T.step(1) }
      const fc2 = DBG().flyCatchState()
      if (fc2.clothes.filter((x) => !x.got)[0]) {
        const d = fc2.clothes.filter((x) => !x.got)[0]
        DBG().flyCatchCast(d.x, d.y)
      }
      T.step(1)
      console.log(`  飞翔的衣服：第 ${fc2.level} 关 ${fc2.count} 件、还剩 ${fc2.left} 件、限时 ${fc2.timeLeft.toFixed(1)}s`)
    }
    S().toast = null
    shot('30-minigame-flycatch')
    // 「服饰大楼」（第 45 轮，官方：多比大街最右端找麦基买服饰 + 附魔）
    S().mode = 'explore'; T.step(1)
    S().mode = 'explore'
    T.run(`(() => {
      const sv = window.DKDbb.save
      sv.data.gold = 99999
      sv.data.voidCrystal = 60
    })()`)
    DBG().openCostumeShop()
    T.step(2)
    shot('31-costume-shop')
    // 买一件 + 附满级，再拍一张"已拥有 / 已穿戴 / 附魔中"的状态
    {
      const stock = DBG().costumeStock()
      DBG().buyCostume(stock[0].id)
      DBG().wearCostume(stock[0].id)
      for (let i = 0; i < 5; i++) DBG().enchantCostume(stock[0].id)
      DBG().buyCostume(stock[1].id)
      DBG().costumeSel(1)
      T.step(2)
      const st = DBG().costumeState()
      console.log(`  服饰大楼：货架 ${stock.length} 套，已买 ${st.owned.length} 套，穿着 ${st.worn}，虚空水晶 ${st.voidCrystal}`)
      console.log(`  附魔：${st.owned.map((o) => `${o.id} ${o.lv}级 ${o.attr}+${o.val}`).join('；')}`)
    }
    S().toast = null
    shot('31b-costume-owned')
    // 穿着服饰走进场景：这是"穿戴真的生效"的唯一硬证据（面板里好看不等于场景里换了人）
    {
      S().mode = 'explore'
      DBG().dungeonState().id = null; DBG().dungeonState().phase = 'list'
      const isl0 = world.islands[0]
      S().mode = 'worldmap'; T.step(1)
      S().mapSel = 0; S().placeSel = 0; T.step(1)
      T.key(' '); T.step(3)
      if (S().mode === 'places') { S().placeSel = 0; T.step(1); T.key(' '); T.step(4) }
      // 走两步，拍"踏步"帧（正面一/二 交替）
      S().player.moving = true; S().player.walkPhase = 0.3; S().player.facing = 'right'
      T.step(6)
      const worn = DBG().costumeState().worn
      console.log(`  场景里穿着：${worn}（mode=${S().mode}）（画得出来才说明服饰立绘接上了）`)
      shot('32-scene-costume')
      S().player.moving = false
    }
    S().mode = 'explore'; DBG().dungeonState().id = null; DBG().dungeonState().phase = 'list'; T.step(2)
    console.log('  小游戏：已拍 10 张；服饰大楼：已拍 2 张；穿着服饰的场景：1 张')
  } else {
    console.log(`  （小游戏面板没打开，mode=${S().mode}）`)
  }
}

// --ui-only：界面（主菜单 / 大地图 / 场景 / 场景互通 / 图鉴 / 战报 / 副本 / 珍宝小屋 / 唤醒 / 小游戏）拍完就收工
if (UI_ONLY) {
  console.log('\n--ui-only：界面拍完，输出目录: ' + OUTDIR)
  process.exit(0)
}

// 找 NPC 点开对话菜单（--battle-only 时跳过：这段要跑约 7000 帧）
if (!BATTLE_ONLY) {
  let opened = false
  for (let x = 150; x <= 820 && !opened; x += 34) {
    for (let y = 310; y <= 470; y += 34) {
      T.move(x, y)
      T.step(1)
      T.click(x, y)
      T.step(70)
      if (T.get('window.DKDbbMouse').menuOpen()) { opened = true; break }
    }
  }
  shot('06-menu')
  if (opened) {
    T.key('Enter')
    T.step(3)
    for (let i = 0; i < 4; i++) {
      if (S().mode === 'dialog') { shot('07-dialog'); T.key(' '); T.step(2) }
    }
    for (let i = 0; i < 40 && S().mode === 'dialog'; i++) { T.key(' '); T.step(1) }
  }
}

// ---- 找一个有怪的场景再进战斗 ----
function enterSceneWithMonsters() {
  for (const island of world.islands) {
    for (let k = 0; k < island.scenes.length; k++) {
      S().mode = 'worldmap'
      T.step(1)
      S().mapSel = world.islands.indexOf(island)
      S().placeSel = 0
      S().placePage = 0
      T.step(1)
      T.key(' ')          // 进地点列表
      T.step(3)
      if (S().mode === 'places') {
        S().placeSel = k
        S().placePage = Math.floor(k / 8)
        T.step(1)
        T.key(' ')        // 进场景
        T.step(4)
      }
      if (S().mode !== 'explore') continue
      const s = DBG().spawns
      if (s && s.monsters.length) return island
    }
  }
  return null
}
const islandWithMobs = enterSceneWithMonsters()
console.log('  找到有怪的场景: ' + (islandWithMobs ? islandWithMobs.name : '无'))
shot('08-scene-monsters')

const sp = DBG().spawns
if (sp && sp.monsters.length) {
  const m = sp.monsters[0]
  console.log('  战斗对象: ' + m.mon.name + ' Lv' + m.level)
  DBG().startBattle({ mon: m.mon, level: m.level, stats: m.stats })
  T.step(6)
  shot('09-battle-intro')
  for (let i = 0; i < 300 && S().battle && (S().battle.phase !== 'command' || S().battle.intro > 0); i++) T.step(1)
  shot('10-battle-command')
  T.run('window.__DKDbb_DEBUG__.state.battle.menu="skill"')
  T.step(2)
  shot('11-battle-skill')
  T.run('window.__DKDbb_DEBUG__.state.battle.menu="main"')
  T.step(1)
  // 明确选到「攻击」再按回车 —— 之前靠默认 menuSel，可能落在防御/逃跑上，
  // 结果截出来的"攻击瞬间"其实根本没有冲刺（冲刺峰值读出 -1e9 就是这个原因）
  T.run('window.__DKDbb_DEBUG__.selectCommand("攻击")')
  T.step(1)
  T.key('Enter')
  T.step(14)
  shot('12-battle-acting')
  // 攻击冲刺的最高点：等立绘前冲到 60px 以上再拍，
  // 这样截图里能直接看到"人物冲出去了"（用户报的"没有攻击动作"就是这个）
  {
    const b = S().battle
    if (b) {
      b.player.hp = b.player.maxHp = 99999
      let best = 0, guard = 0
      while (guard++ < 200 && S().battle && b.phase === 'acting') {
        const pp = DBG().playerPose
        if (pp) best = Math.max(best, pp.dx)
        if (pp && pp.dx > 60) break
        T.step(1)
      }
      console.log(`  冲刺位移峰值 ${best.toFixed(1)}px（phase=${b.phase}，共 ${guard} 帧）`)
      shot('12b-battle-dash')
    }
    for (let i = 0; i < 600 && S().battle && b.phase !== 'command'; i++) T.step(1)
  }
  // ---- 结印技：给满 SP 后发动，拍结印操作界面 ----
  {
    const b = S().battle
    const list = (S().form.skills || [])
    const si = list.findIndex((n) => D.SKILLS[n] && D.SKILLS[n].seal)
    if (b && si >= 0 && b.phase === 'command') {
      b.player.sp = 3
      b.player.hp = b.player.maxHp = 99999
      b.cooldowns = {}
      b.menu = 'skill'; b.menuSel = 1; b.skillSel = si
      T.step(2)
      shot('12c-battle-seal-ready')     // 技能面板里 SP 就绪的样子
      T.key(' ')
      T.step(3)
      if (b.phase === 'sealing') {
        shot('12d-battle-seal-ui')      // 结印操作界面
        // 按对两下，让界面出现"已成功"的绿色状态再拍一张
        for (let i = 0; i < 2 && b.seal; i++) { T.key(b.seal.seq[b.seal.idx]); T.step(2) }
        shot('12e-battle-seal-progress')
      } else {
        console.log('  （结印没有启动，phase=' + b.phase + '，技能=' + list[si] + '）')
      }
    } else {
      console.log('  （这只多比没有结印技，跳过结印截图）')
    }
  }
  // 打完这场（最多 600 帧；玩家不再出招时怪也会把它打死，不会卡住）
  for (let i = 0; i < 600 && S().mode === 'battle'; i++) T.step(1)
  if (S().mode === 'result') shot('13-result')
} else {
  console.log('  （没找到带怪的场景）')
}

// --battle-only：战斗拍完就收工（后面的背包/属性/技能面板要走很久，本次不需要）
if (BATTLE_ONLY) {
  console.log('\n--battle-only：已拍完战斗画面，输出目录: ' + OUTDIR)
  process.exit(0)
}

// 背包 / 属性 / 任务
S().mode = 'explore'
T.step(1)
T.key('b')
T.step(3)
shot('14-bag')
T.key('Escape')
T.step(2)

T.key('c')
T.step(3)
if (S().mode === 'stats') shot('15-stats')
T.key('Escape')
T.step(2)

// 技能面板（K）
S().mode = 'explore'
T.step(1)
T.key('k')
T.step(3)
if (S().mode === 'skillpanel') shot('15b-skillpanel')
T.key('Escape')
T.step(2)

T.key('q')
T.step(3)
if (S().mode === 'questlist') shot('16-questlist')
T.key('Escape')
T.step(2)

// 大地图（Tab）
S().mode = 'explore'
T.key('Tab')
T.step(3)
shot('16-worldmap-again')

// ---- 杂货铺 ----
console.log('\n=== 杂货铺与道具专拍 ===')
T.run(`(() => {
  const sv = window.DKDbb.save, D = window.DKDbbData
  sv.data.gold = 4200
  sv.data.items = {}
  // 每类各买几件，方便看图标与分页
  for (const it of D.ITEMS) {
    if (it.hp >= 400 || it.mp >= 240 || it.damageMul || (it.buff && it.buff.level === 3)) D.bag.add(sv.data.items, it.id, 3)
  }
})()`)
S().mode = 'explore'
T.step(1)
T.key('g')
T.step(4)
for (let i = 0; i < 3; i++) {
  S().shopTab = i; S().shopSel = 0; S().shopPage = 0
  T.step(2)
  shot('17-shop-' + ['heal', 'buff', 'throw'][i])
}

// ---- 战斗中的道具面板 ----
if (sp && sp.monsters.length) {
  DBG().startBattle({ mon: sp.monsters[0].mon, level: sp.monsters[0].level, stats: sp.monsters[0].stats })
  for (let i = 0; i < 400 && S().battle && (S().battle.phase !== 'command' || S().battle.intro > 0); i++) T.step(1)
  if (S().battle) {
    for (let i = 0; i < 3; i++) {
      S().battle.menu = 'item'
      S().battle.itemTab = i
      S().battle.itemSel = 0
      T.step(2)
      shot('18-battle-item-' + ['heal', 'buff', 'throw'][i])
    }
    // 真用一次，看演出
    S().battle.menu = 'item'; S().battle.itemTab = 0; S().battle.itemSel = 0
    T.step(1)
    T.key('Enter')
    T.step(6)
    shot('19-battle-item-use')
    for (let i = 0; i < 400 && S().mode === 'battle'; i++) T.step(1)
    if (S().mode === 'result') { shot('19b-result-after-item'); S().mode = 'explore'; S().battle = null; S().result = null }
  }
}
S().battle = null; S().result = null; S().mode = 'explore'
T.step(2)

// ---- 形态形象专拍：解锁全部形态，逐个看背包里的立绘是否都对得上 ----
// 用户报的 bug 就在这里（瑞比特·兔 画成了龙多比），所以每个形态都要有一张能核对的图。
console.log('\n=== 形态立绘专拍 ===')
T.run(`(() => {
  const D = window.DKDbbData, sv = window.DKDbb.save
  sv.data.forms = D.FORMS.map(f => f.name)
  sv.data.form = D.FORMS[0].name
})()`)
S().mode = 'explore'
T.step(1)
T.key('b')
T.step(4)
const forms = T.get('window.DKDbbData.FORMS')
for (let i = 0; i < forms.length; i++) {
  S().bagSel = i
  S().bagPage = Math.floor(i / 15)
  T.step(2)
  const nm = forms[i].name.replace(/\s*多比$/, '')
  shot('20-form-' + String(i).padStart(2, '0') + '-' + nm)
}
S().bagSel = 0
T.step(1)
T.key('Escape')
T.step(2)

console.log('\n截图输出目录: ' + OUTDIR)
console.log('共解码素材 ' + decodedCount + ' 张，图片缓存 ' + imgCache.size + ' 项')
