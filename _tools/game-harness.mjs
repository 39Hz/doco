// 无头游戏测试台：在 Node 里模拟 DOM + Canvas，加载 game/*.js，
// 注入鼠标/键盘事件并推进游戏循环，用来验证交互逻辑（不需要浏览器）。
//
// 用法: node _tools/game-harness.mjs <项目根>
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const ROOT = path.resolve(process.argv[2] || '.')

// ---------------- 事件系统 ----------------
class Emitter {
  constructor(name) { this.name = name; this.h = new Map() }
  addEventListener(t, fn) {
    if (!this.h.has(t)) this.h.set(t, [])
    this.h.get(t).push(fn)
  }
  removeEventListener(t, fn) {
    const a = this.h.get(t); if (!a) return
    const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1)
  }
  fire(t, ev) {
    const a = this.h.get(t)
    // 复制一份，避免处理函数里增删导致遍历异常
    if (a) for (const fn of a.slice()) { try { fn(ev || {}) } catch (e) { throw e } }
  }
}

// ---------------- Canvas / 2D 上下文 ----------------
class FakeCtx {
  constructor(cvs) {
    this.canvas = cvs
    this._stack = []
    this.calls = Object.create(null)
    this.font = '16px sans-serif'
    this.textAlign = 'left'; this.textBaseline = 'alphabetic'
    this.lineWidth = 1; this.lineJoin = 'miter'; this.lineCap = 'butt'
    this.strokeStyle = '#000'; this.fillStyle = '#000'
    this.globalAlpha = 1
    // 假 canvas 也要把标准 2D API 补齐（哪怕是空实现）：
    // 少一个方法就会让整局游戏在绘制时抛异常，而且报的是 "xxx is not a function"，
    // 看起来像游戏 bug —— 第 44 轮小游戏体检整轮崩在 setLineDash 上，就是这么来的。
    this._dash = []
    // 图像平滑设置：**真 canvas 上本来就有这两个属性**，假 canvas 也必须补齐。
    // 否则 `if ('imageSmoothingQuality' in ctx)` 这类特性检测会走"不支持"分支 ——
    // 游戏里的设置静默失效，测试也永远观察不到（第 53 轮想验"有没有开高质量重采样"时就是这么发现的）。
    this.imageSmoothingEnabled = true
    this.imageSmoothingQuality = 'low'   // 浏览器默认值就是 'low'（我们要把它改成 'high'）
    // ---- 变换矩阵：给"切片断言"用（见 _tools/check-canvas-text.mjs）----
    // 必须真的跟踪 translate/scale：游戏在带变换的上下文里画过字
    //（例如画立绘前后的 save/translate/scale）。不跟踪的话，
    // 记下来的坐标是**局部坐标**，会造出一堆"文字跑到画面外"的假警报。
    this._m = [1, 0, 0, 1, 0, 0]
    // 本帧记录下来的每一次**实心文本**绘制（描边那一遍不记：它和实心是同一处同一串字）
    this.texts = []
    // 本帧记录下来的**不透明底板**矩形（给切片断言判断"文字有没有底板"）
    this.rects = []
    this.recordText = false      // 只在开启时记录，避免测试台常驻开销
  }
  setLineDash(a) { this._dash = Array.isArray(a) ? a.slice() : [] }
  getLineDash() { return this._dash.slice() }
  _c(n) { this.calls[n] = (this.calls[n] || 0) + 1 }
  setTransform(a, b, c, d, e, f) { this._c('setTransform'); this._m = [a, b, c, d, e, f] }
  resetTransform() { this._c('resetTransform'); this._m = [1, 0, 0, 1, 0, 0] }
  transform(a, b, c, d, e, f) {
    this._c('transform')
    const m = this._m
    this._m = [
      m[0] * a + m[2] * b, m[1] * a + m[3] * b,
      m[0] * c + m[2] * d, m[1] * c + m[3] * d,
      m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5],
    ]
  }
  save() {
    this._c('save')
    this._stack.push({ m: this._m.slice(), font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline, globalAlpha: this.globalAlpha, lineWidth: this.lineWidth })
  }
  restore() {
    this._c('restore')
    const st = this._stack.pop()
    if (st) {
      this._m = st.m; this.font = st.font; this.textAlign = st.textAlign
      this.textBaseline = st.textBaseline; this.globalAlpha = st.globalAlpha; this.lineWidth = st.lineWidth
    }
  }
  beginPath() { this._c('beginPath') } closePath() { this._c('closePath') }
  moveTo() { this._c('moveTo') } lineTo() { this._c('lineTo') }
  arc() { this._c('arc') } ellipse() { this._c('ellipse') } rect() { this._c('rect') }
  fill() { this._c('fill') } stroke() { this._c('stroke') } clip() { this._c('clip') }
  fillRect(x, y, w, h) {
    this._c('fillRect')
    if (!this.recordText) return
    // 顺带记下**不透明**的底板矩形：切片断言用它判断"这段文字是不是画在一块底板上"。
    // 浮动提示（toast）就是这一类 —— 它**故意**压在别的文字之上，所以不能算"文字互相压住"，
    // 但必须验"它真的有一块够不透明的底板"（否则就是糊在内容上读不清）。
    const a = this._alpha()
    if (a >= 0.8 && w > 0 && h > 0) this.rects.push({ x, y, w, h, a })
  }
  _alpha() {
    const s = String(this.fillStyle || '')
    const m = /rgba?\(([^)]+)\)/.exec(s)
    const base = m ? (m[1].split(',').length > 3 ? Number(m[1].split(',')[3]) : 1) : 1
    return base * (typeof this.globalAlpha === 'number' ? this.globalAlpha : 1)
  } strokeRect() { this._c('strokeRect') }
  clearRect() { this._c('clearRect') }
  _dev(x, y) {
    const m = this._m
    return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }
  }
  // 文本的"设备空间包围盒"估算。中文按 1em、ASCII 按 0.55em —— 只为**粗判越界/压字**，
  // 不追求像素级精确（要精确就得真渲染，代价不成比例）。
  _textBox(s, x, y) {
    const size = Number((/([\d.]+)px/.exec(this.font) || [])[1]) || 16
    const scale = Math.hypot(this._m[0], this._m[1]) || 1
    const w = [...String(s)].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? size : size * 0.55), 0) * scale
    const h = size * scale
    const p = this._dev(x, y)
    let x0 = p.x
    if (this.textAlign === 'center') x0 = p.x - w / 2
    else if (this.textAlign === 'right' || this.textAlign === 'end') x0 = p.x - w
    let y0 = p.y - h * 0.82                       // alphabetic：基线在底部偏上
    if (this.textBaseline === 'middle') y0 = p.y - h / 2
    else if (this.textBaseline === 'top') y0 = p.y
    else if (this.textBaseline === 'bottom') y0 = p.y - h
    return { s: String(s), x: x0, y: y0, w, h }
  }
  fillText(s, x, y) {
    this._c('fillText')
    if (this.recordText && String(s).trim()) this.texts.push(this._textBox(s, x, y))
  }
  strokeText() { this._c('strokeText') }
  drawImage() { this._c('drawImage') }
  translate(x, y) {
    this._c('translate')
    const m = this._m
    this._m = [m[0], m[1], m[2], m[3], m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
  }
  scale(x, y) {
    this._c('scale')
    const m = this._m
    this._m = [m[0] * x, m[1] * x, m[2] * y, m[3] * y, m[4], m[5]]
  }
  rotate(r) {
    this._c('rotate')
    const c = Math.cos(r), s = Math.sin(r), m = this._m
    this._m = [
      m[0] * c + m[2] * s, m[1] * c + m[3] * s,
      m[0] * -s + m[2] * c, m[1] * -s + m[3] * c, m[4], m[5],
    ]
  }
  // measureText 必须**像浏览器那样按字体与字形估宽**，不能一律"每字符 8px"。
  // 【为什么这条很要紧】游戏的自动换行是**照着 measureText 的结果**断行的：
  // 假 ctx 把中文按 8px/字 估（实际是 1em/字，14px 字号就是 14px/字，差近一倍），
  // 于是"该换行的地方没换" —— 切片断言（check-canvas-text）当场报出
  // 「官方规则…」一行 1232px 溢出画面。**那是测试台的假象，不是游戏的 bug**；
  // 但如果放着不管，这个假象会一直污染"文字越界"这一类断言。
  measureText(s) {
    const size = Number((/([\d.]+)px/.exec(this.font) || [])[1]) || 16
    const str = String(s)
    let w = 0
    for (const ch of str) w += ch.charCodeAt(0) > 0x2e80 ? size : size * 0.55
    return { width: w }
  }
  createLinearGradient() { return { addColorStop() { } } }
  createRadialGradient() { return { addColorStop() { } } }
  getImageData() { return { data: new Uint8Array(4) } }
}

class FakeCanvas extends Emitter {
  constructor(w, h) {
    super('canvas')
    this.width = w; this.height = h
    this.style = {}
    this._ctx = new FakeCtx(this)
    this._rect = { left: 0, top: 0, width: w, height: h }
  }
  getContext() { return this._ctx }
  getBoundingClientRect() { return this._rect }
  // 把 1:1 映射（缩放比 1）算出的画布坐标换算成 client 坐标
  clientFromCanvas(x, y) {
    const r = this._rect
    return { clientX: r.left + x * (r.width / this.width), clientY: r.top + y * (r.height / this.height) }
  }
}

// ---------------- document / window ----------------
function makeEnv() {
  const canvas = new FakeCanvas(960, 560)
  const elements = new Map()
  const mkEl = (id) => {
    const el = new Emitter(`el:${id}`)
    el.id = id
    el.style = {}
    el.textContent = ''
    el.classList = { add() { }, remove() { }, toggle() { }, contains() { return false } }
    el.addEventListener = Emitter.prototype.addEventListener.bind(el)
    return el
  }
  const doc = new Emitter('document')
  doc.createElement = () => mkEl('created')
  // 画布必须从 getElementById('game') 取到，否则游戏初始化就挂
  elements.set('game', canvas)
  doc.getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, mkEl(id))
    return elements.get(id)
  }
  doc.documentElement = mkEl('html')
  doc.body = mkEl('body')
  doc.fullscreenElement = null
  doc.exitFullscreen = () => Promise.resolve()

  const win = new Emitter('window')
  win.innerWidth = 1400; win.innerHeight = 900
  win.devicePixelRatio = 1
  win.localStorage = (() => {
    const m = new Map()
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
      clear: () => m.clear(),
      _dump: () => Object.fromEntries(m),
    }
  })()

  const rafQueue = []
  win.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length }
  win.cancelAnimationFrame = () => { }

  // 图片：complete 立即为 true，尺寸 320x320，这样 drawImage 分支能跑通
  class FakeImage extends Emitter {
    constructor() {
      super('img')
      this.complete = true
      this.naturalWidth = 320
      this.naturalHeight = 320
      this.width = 320; this.height = 320
      this._src = ''
    }
    set src(v) { this._src = v; this.fire('load') }
    get src() { return this._src }
  }
  win.Image = FakeImage

  class FakeAudio extends Emitter {
    constructor(src) {
      super('audio')
      this.src = src || ''
      this.loop = false; this.volume = 1
      this.paused = true; this.currentTime = 0
      this._plays = 0
    }
    play() { this.paused = false; this._plays++; return Promise.resolve() }
    pause() { this.paused = true }
  }
  win.Audio = FakeAudio

  // 假时钟：每 step() 推进一帧（约 16.7ms）。
  // 必须自增，否则游戏里的 dt 会是 0，角色一步都走不动。
  let fakeNow = 1000000
  win.performance = { now: () => fakeNow }

  const sandbox = {
    window: win, document: doc, console,
    Math, Object, Array, JSON, Number, String, Boolean, RegExp, Error, Date,
    Map, Set, Promise, parseInt, parseFloat, isNaN, Infinity, NaN, undefined,
    setTimeout: (fn, ms) => { setTimeout(fn, 0); return 0 },
    setInterval: () => 0, clearInterval: () => { }, clearTimeout: () => { },
    requestAnimationFrame: win.requestAnimationFrame,
    cancelAnimationFrame: win.cancelAnimationFrame,
    Image: FakeImage, Audio: FakeAudio,
    localStorage: win.localStorage,
    performance: win.performance,
    confirm: () => false, alert: () => { },
    location: { reload() { } },
    Uint8Array, Uint8ClampedArray, Float32Array, Int32Array,
  }
  sandbox.globalThis = sandbox
  sandbox.self = sandbox
  return { sandbox, win, doc, canvas, rafQueue, elements, advance: (ms) => { fakeNow += ms } }
}

// ---------------- 加载游戏 ----------------
const env = makeEnv()
vm.createContext(env.sandbox)

// 幂等：game.html 里已经含 game/game.js，而各测试文件习惯再 t.load 一次；
// 重复执行会让 game.js 重复注册事件与初始化，所以这里跳过已加载过的文件。
const _loaded = new Set()
const load = (rel) => {
  if (_loaded.has(rel)) return
  const p = path.join(ROOT, rel)
  if (!fs.existsSync(p)) throw new Error('缺少 ' + rel)
  vm.runInContext(fs.readFileSync(p, 'utf8'), env.sandbox, { filename: rel })
  _loaded.add(rel)
}

// 脚本清单**直接来自 game.html**，不再手写。
//
// 这个坑真实发生过：harness 里硬编码的清单漏掉了 assets/soya.js 和后来加的官方技能表，
// 于是「全套测试通过」但索亚系统与技能表其实一行都没被加载——测试全绿却毫无覆盖。
const HTML_PATH = path.join(ROOT, 'game.html')
const SCRIPT_LIST = [...fs.readFileSync(HTML_PATH, 'utf8')
  .matchAll(/<script\s+src=["']([^"']+)["']/g)].map((m) => m[1])
if (SCRIPT_LIST.length < 10) throw new Error('game.html 里解析出的脚本过少: ' + SCRIPT_LIST.length)

// 顺序断言：官方技能表要往 D.SKILLS 合并、配招表要改写 __DKDbb_FORMS__，
// 两者都必须排在 assets/forms.js 之后，否则会静默拿到 undefined。
const iForms = SCRIPT_LIST.indexOf('assets/forms.js')
for (const later of ['game/tables/skills-official.js', 'game/tables/form-skills-official.js']) {
  const i = SCRIPT_LIST.indexOf(later)
  if (iForms >= 0 && i >= 0 && i < iForms) {
    throw new Error(`脚本顺序错误：${later} 必须排在 assets/forms.js 之后`)
  }
}

for (const rel of SCRIPT_LIST) load(rel)

// 暴露给测试
vm.runInContext(`
  globalThis.DKDbb = window.DKDbb
  globalThis.DKDbbData = window.DKDbbData
  globalThis.DKDbbQuest = window.DKDbbQuest
  globalThis.DKDbbMouse = window.DKDbbMouse
  globalThis.__man = window.__DKDbb_MANIFEST__
  globalThis.__world = window.__DKDbb_WORLD__
  globalThis.__anim = window.__DKDbb_ANIM__
  globalThis.__quests = window.__DKDbb_QUESTS__
  globalThis.__forms = window.__DKDbb_FORMS__
  globalThis.__soya = window.__DKDbb_SOYA__
  globalThis.__data = window.__DKDbb_DATA__
`, env.sandbox)

const T = {
  env,
  load: (rel) => load(rel),
  run: (code) => vm.runInContext(code, env.sandbox),
  eval: (expr) => vm.runInContext('(' + expr + ')', env.sandbox),
  // 等游戏自己走完载入页。
  //
  // 【为什么需要它】每个测试文件的写法都是 `await new Promise(r => setTimeout(r, 150)); T.step(3)`
  // —— 用**固定 150 毫秒**赌 `boot()` 里那个 `await save.loadFile()` 已经回来。
  // 机器一忙（比如回归里 30 个测试连着跑）这 150 毫秒就不够，测试会看到 mode 还是 'loading'，
  // 于是开头几条断言一起红。实测：`test-battle-mouse` 单跑 19/19，混在回归里偶发 14/4；
  // 而"偶发"最坏的地方在于它看起来像游戏有 bug。
  //
  // 必须是 async：`save.loadFile()` 是 Promise，同步 step 循环不让出事件循环，它永远不 resolve。
  async settle({ tries = 40, waitMs = 20, quiet = 30 } = {}) {
    for (let i = 0; i < tries; i++) {
      // 先把事件循环让出去，boot 里的 await 才有机会继续
      await new Promise((r) => setTimeout(r, waitMs))
      const st = vm.runInContext('window.__DKDbb_DEBUG__ && window.__DKDbb_DEBUG__.state', env.sandbox)
      if (st && st.mode && st.mode !== 'loading') {
        // 再空转几帧，让 loading 之后的收尾（工具栏同步等）也跑完
        for (let k = 0; k < quiet; k++) T.step(1)
        return true
      }
      T.step(2)
    }
    return false
  },
  get: (name) => vm.runInContext(name, env.sandbox),
  canvas: env.canvas,
  doc: env.doc,
  win: env.win,
  raf: env.rafQueue,
  // 推进一帧（假时钟前进 16.7ms，游戏里的 dt 才会是正常值）
  step(n = 1) {
    for (let i = 0; i < n; i++) {
      env.advance(16.7)
      const q = env.rafQueue.splice(0, env.rafQueue.length)
      for (const fn of q) fn(env.win.performance.now())
    }
  },
  // 鼠标事件（用画布坐标，自动换算成 client 坐标）
  move(x, y) {
    const c = env.canvas.clientFromCanvas(x, y)
    env.canvas.fire('mousemove', { clientX: c.clientX, clientY: c.clientY, button: 0, preventDefault() { } })
  },
  down(x, y) {
    const c = env.canvas.clientFromCanvas(x, y)
    env.canvas.fire('mousemove', { clientX: c.clientX, clientY: c.clientY, button: 0, preventDefault() { } })
    env.canvas.fire('mousedown', { clientX: c.clientX, clientY: c.clientY, button: 0, preventDefault() { } })
  },
  up() { env.win.fire('mouseup', { button: 0 }) },
  click(x, y) { T.down(x, y); T.step(1); T.up() },
  key(k) {
    env.win.fire('keydown', { key: k, preventDefault() { } })
    env.win.fire('keyup', { key: k })
  },
  keyDown(k) { env.win.fire('keydown', { key: k, preventDefault() { } }) },
}

export default T
export { T, makeEnv, FakeCanvas, Emitter }
