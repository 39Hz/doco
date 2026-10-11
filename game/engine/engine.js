/* 多克多比 · 游戏引擎
   零依赖：PNG 解码 / 精灵动画 / 音频 / 输入 / 存档 / 场景绘制 */
(() => {
  'use strict'

  const G = window.DKDbb = {}

  // ================= 存档 =================
  //
  // 用户反馈"存档重启了一下又从头开始了"。根因**不在存档代码**，而在打包方式：
  //   exe 里的迷你 HTTP 服务器每次启动都从 8765 往上找空闲端口，浏览器又是按端口
  //   开独立 profile（dkdbb_<port>）。localStorage 是按「源」(协议+主机+端口) 隔离的，
  //   端口一变就是新源、新 profile —— 存档自然读不到。
  //
  // 所以现在**双写**：
  //   · localStorage —— 同一次运行内的快速读写，浏览器直接打开 dist/web 时也靠它
  //   · exe 服务器上的 /__save —— 落到 exe 旁边的 save.json，端口/浏览器换了也不丢
  // 启动时以 save.json 为准（它才是"真正的存档文件"），读不到才退回 localStorage。
  //
  // 多存档槽：槽 1 → save.json（与旧版本完全兼容），槽 2/3 → save2.json / save3.json。
  // localStorage 同理：槽 1 用旧键 dkdbb.save.v1，其它槽加后缀。这样老存档不会失效。
  const SLOT_COUNT = 3

  // ---- 存档版本与迁移（M5-1）----
  // 背景：applyObject 原先是把存档对象**直接覆盖**到 data 上。这有两个隐患：
  //   1) 老存档缺新字段（比如后来才加的 visited/soya/questStage），运行时读到 undefined 就可能崩；
  //   2) 存档被改坏（数组变成字符串、hp 变负数）时没有任何防线。
  // 现在每个存档写 __v 版本号；读档先迁移到当前版本，缺什么补什么，类型不符就用默认值，
  // 并把每一处改动记进 lastMigration —— **不静默**（R3）。
  const SAVE_VERSION = 2

  // 「可空字段」：默认值是 null，但**合法取值不止 null**。
  // 这类字段必须显式登记 —— 否则类型检查会把玩家设置的合法值当成"类型不符"擦成 null。
  // 第 43 轮实测到的真实 bug：设好出战索亚 → 存档 → 读档 → **索亚直接掉线**
  //（迁移记了一笔 "soyaActive：类型 number→null"，因为默认值是 null，typeof 对不上）。
  // 索亚编号在归档里是数字（如 70001），所以这里登记为 number。
  const NULLABLE_FIELDS = { soyaActive: 'number', costumeWorn: 'string' }

  // 用默认值补齐 target 里缺失/类型不符的字段。就地改 target。
  function fillDefaults(target, def, changes, path) {
    for (const k of Object.keys(def)) {
      const dv = def[k]
      const tv = target[k]
      const dvIsArr = Array.isArray(dv)
      const dvType = dvIsArr ? 'array' : (dv === null ? 'null' : typeof dv)
      const clone = () => (dvIsArr ? [] : (dv && typeof dv === 'object' ? JSON.parse(JSON.stringify(dv)) : dv))
      // 注意：只有当"默认值不是 null"时，null 才算缺失。
      // soyaActive 这类字段默认值就是 null（合法取值），若把 null 当缺失，
      // 每次迁移都会记一笔"补默认值" → 迁移不幂等（被 test-savever 抓出来过）。
      if (tv === undefined || (tv === null && dv !== null)) {
        target[k] = clone(); changes.push(`${path}${k}：补默认值`); continue
      }
      const tvIsArr = Array.isArray(tv)
      // 必须和 dvType 一样对 null 特判：typeof null === 'object'，
      // 否则「两边都是 null」会被判成 object→null 的类型不符，迁移永远不幂等。
      const tvType = tvIsArr ? 'array' : (tv === null ? 'null' : typeof tv)
      // 可空字段：null 与登记的类型都算合法（其它类型仍然替换成默认值）
      const nullable = NULLABLE_FIELDS[k]
      const acceptType = nullable ? (tvType === 'null' || tvType === nullable) : (tvType === dvType)
      if (!acceptType) {
        target[k] = clone(); changes.push(`${path}${k}：类型 ${tvType}→${dvType}`); continue
      }
      if (dvType === 'object') fillDefaults(tv, dv, changes, `${path}${k}.`)
    }
  }

  // 数值字段的下限（越界就夹回来，并记账）
  const NUM_CLAMPS = {
    level: [1, 999], exp: [0, Infinity], hp: [0, Infinity], mp: [0, Infinity],
    maxHp: [0, Infinity], maxMp: [0, Infinity], gold: [0, Infinity],
    playSeconds: [0, Infinity], questStage: [0, 999],
  }

  G.save = {
    _k: 'dkdbb.save.v1',
    _fileUrl: '/__save',
    _hasFile: false,
    _pending: 0,
    SLOTS: SLOT_COUNT,
    _slot: 1,                 // 当前正在用的存档槽
    data: {
      playerName: '多比',
      // 第 57 轮加 —— 用户指出主角本体是"基础多克"，不是穿时装的 NPC。
      form: '龙多比',
      // ★ 第 64 轮补：`forms` 与 `questsDone` 原先**不在初始数据里**，只靠
      //   `applySaveToRuntime()` 里那句"如果为空就补一只"兜住。
      //   后果是**新档天生不完整**：`save.newGame()` 产出的存档没有 `forms`，
      //   而 `game.js` 里有 13 处直接对它调方法（`includes`×7 / `push`×4 / `length`×2）→
      //   任何**不经过 `applySaveToRuntime()` 的路径**读它都会抛
      //   `Cannot read properties of undefined (reading 'includes')`。
      //   补进初始数据后，`defaults`（newGame 拿它建新档）自动带上 →
      //   新档一步到位就是合法状态，不再依赖"菜单那条路一定会调 applySaveToRuntime"。
      forms: ['克罗 多比', '龙多比'],
      // 配招（第 55 轮）：{ 形态名: [技能名, ...] } —— 玩家在技能面板里自己搭配的技能。
      // 为什么要有这一层：形态的技能原本由 `game/tables/form-skills-official.js`（生成物）
      //   按属性自动配好并写进 `__DKDbb_FORMS__.forms[].skills`，**玩家改不了**。
      //   这里加一层覆盖：有存过配招就用玩家的，没存过就沿用自动配的。
      // 存在存档里而不是改 forms.js —— 生成物不许手改（R12 单一事实源）。
      loadouts: {},
      questsDone: [],
      level: 1,
      exp: 0,
      hp: 0, mp: 0,
      maxHp: 0, maxMp: 0,
      visited: [],
      defeated: [],
      items: {},
      soya: [],          // 已拥有的索亚编号
      soyaActive: null,  // 出战的索亚编号
      gold: 0,
      // 彩晶石（官方货币，原文：副本翻牌与小游戏都给）—— 与"白色彩晶石"是两种东西：
      //   彩晶石（crystal）   普通货币，副本/小游戏产出
      //   白色彩晶石（white） 高级货币，碎片合成，珍宝小屋消费
      // 之前只显示不落账（隐性降级），这里补成真字段，老档由 fillDefaults 补 0。
      crystal: 0,
      questStage: 0,
      // 战报任务（原版系统，见 docs/官方资料库.md 12.3）：
      //   warKills = { 场景id: 已击败数 }（每张练级地图一条任务）
      //   warDone  = [场景id]（首次完成过的，之后可重复完成拿较少奖励）
      // 这两个字段是后加的 —— 老存档读进来时由 migrate() 自动补上。
      warKills: {},
      warDone: [],
      // 角色属性（原版八大属性里非战斗的那几项）。
      // 官方硬规则（7k7k/115164 + 179182）：**「魅力」只能从副本获得**，
      // 且副本常规奖励包含 魅力值/勇气；小游戏给 智慧/勇气/魅力（7k7k/167013）；
      // 声望来自副本/小游戏/任务（7k7k/115209）。
      attrs: { wisdom: 0, brave: 0, love: 0, charm: 0, fame: 0 },
      // 副本通关次数 { 副本id: 次数 }
      dungeonClears: {},
      // 白色彩晶石经济（官方系统，见 docs/官方资料库.md 12.3）：
      //   shards        —— 白色彩晶石**碎片**（精英怪/副本BOSS/野外BOSS 概率掉落）
      //   white         —— 白色彩晶石（由碎片合成；**每人每天最多合成 5 块**）
      //   crystalDay    —— 记下"今天"的日期键，跨天重置当日合成数
      //   crystalToday  —— 今天已合成几块（上限 5）
      //   points        —— 积分（原文：每消费 1 白色彩晶石自动获得 1 积分）
      shards: 0,
      white: 0,
      crystalDay: '',
      crystalToday: 0,      points: 0,
      // 服饰与附魔（第 45 轮，官方系统：7k7k/178975 服饰大楼找麦基买；7k7k/530436 附魔五级）
      //   voidCrystal  —— 虚空水晶（附魔货币；官方来源见 game/tables/costumes.js 文件头）
      //   costumes     —— { 服饰名: { lv, attr, val } }，键存在即表示已购买
      //   costumeWorn  —— 当前穿戴的服饰名，没穿是 null
      // ⚠️ costumeWorn 的默认值是 null 且合法取值是字符串 → **必须登记进 NULLABLE_FIELDS**，
      //    否则读档时会被"类型不符"擦掉，玩家刚穿上的衣服一读档就没了（第 43 轮 soyaActive 同款 bug）。
      voidCrystal: 0,
      costumes: {},
      costumeWorn: null,
      savedAt: 0,        // 上次保存时间（主菜单显示用）
      // 难度（第 43 轮，按用户反馈加）：'easy' | 'normal'。
      // 默认 easy —— 本项目的战斗数值本来就是推算的（原版系数在服务端，见 B5），
      // 调难度不涉及篡改官方数据；具体倍率写在 game.js 的 DIFFS 里。
      difficulty: 'easy',
      playSeconds: 0,    // 累计游玩时长
      started: false,    // 是否已经开过局（用于区分"空槽"和"新档"）
    },
    slot() { return this._slot },
    slotKey(n) { return n === 1 ? this._k : `${this._k}.slot${n}` },
    // ---- 只读地取某个槽的存档，不影响当前 data ----
    peek(n) {
      try {
        const s = localStorage.getItem(this.slotKey(n))
        if (s) { const o = JSON.parse(s); if (o && typeof o === 'object') return o }
      } catch { }
      return null
    },
    async peekFile(n) {
      if (typeof fetch !== 'function') return null
      try {
        const r = await fetch(`${this._fileUrl}?slot=${n}&t=${Date.now()}`, { cache: 'no-store' })
        if (!r.ok) return null
        const txt = await r.text()
        if (!txt || txt.length < 4) return null
        const o = JSON.parse(txt)
        if (!o || typeof o !== 'object' || !Object.keys(o).length) return null
        return o
      } catch { return null }
    },
    // 槽位摘要（主菜单/读档面板显示）。空槽返回 null。
    // 判定"有存档"的依据是 started 或 level>1 或 有访问过场景 —— 光有默认字段不算。
    summarize(o) {
      if (!o) return null
      const played = !!(o.started || (o.level || 1) > 1 || (o.visited || []).length)
      if (!played) return null
      return {
        level: o.level || 1,
        form: o.form || '未知',
        gold: o.gold || 0,
        visited: (o.visited || []).length,
        quests: (o.questStage || 0),
        soya: (o.soya || []).length,
        savedAt: o.savedAt || 0,
        playSeconds: o.playSeconds || 0,
        name: o.playerName || '多比',
      }
    },
    // 依次查 3 个槽：优先 exe 旁边的文件，其次 localStorage
    async listSlots() {
      const out = []
      for (let n = 1; n <= SLOT_COUNT; n++) {
        const fromFile = this.summarize(await this.peekFile(n))
        const fromLs = this.summarize(this.peek(n))
        out.push({ slot: n, info: fromFile || fromLs, source: fromFile ? 'file' : (fromLs ? 'local' : null) })
      }
      return out
    },
    // ---- 载入某个槽到当前 data（就地改，保持引用有效）----
    // 先迁移（补字段/纠类型/夹数值），再落地；每一处改动记进 lastMigration。
    migrate(o) {
      const changes = []
      const src = (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}
      if (src !== o) changes.push('存档根不是对象：已按空档处理')
      const from = Number.isFinite(Number(src.__v)) ? Number(src.__v) : 1

      // 1) 用默认值补齐缺失字段 / 纠正类型
      const def = this.defaults || {}
      fillDefaults(src, def, changes, '')

      // 2) 数值夹取
      for (const [k, [lo, hi]] of Object.entries(NUM_CLAMPS)) {
        const v = Number(src[k])
        if (!Number.isFinite(v)) {
          if (src[k] !== undefined) { src[k] = lo; changes.push(`${k}：非数值→${lo}`) }
          continue
        }
        const c = Math.max(lo, Math.min(hi, v))
        if (c !== v) { src[k] = c; changes.push(`${k}：${v}→${c}（超出范围）`) }
      }

      // 3) 出战索亚必须真的拥有，否则清空（否则战斗里会引用到不存在的索亚）
      if (src.soyaActive != null && Array.isArray(src.soya) && !src.soya.includes(src.soyaActive)) {
        changes.push(`soyaActive：${src.soyaActive} 不在已拥有列表，已清空`)
        src.soyaActive = null
      }

      // 4) 血量不能超过上限（老档换了形态后常见）
      if (Number.isFinite(src.hp) && Number.isFinite(src.maxHp) && src.maxHp > 0 && src.hp > src.maxHp) {
        changes.push(`hp：${src.hp}→${src.maxHp}（超过上限）`)
        src.hp = src.maxHp
      }

      // 5) 打版本号
      src.__v = SAVE_VERSION
      return { data: src, from, to: SAVE_VERSION, changes }
    },
    applyObject(o) {
      const r = this.migrate(o)
      this.lastMigration = { from: r.from, to: r.to, changes: r.changes }
      // 不静默降级（R3）：有改动就留痕，方便排查"存档怎么变样了"
      if (r.changes.length) {
        console.warn(`[存档] 槽 ${this._slot} 迁移 v${r.from}→v${r.to}，改动 ${r.changes.length} 处：`, r.changes)
      }
      for (const k of Object.keys(this.data)) delete this.data[k]
      Object.assign(this.data, r.data)
      try { localStorage.setItem(this.slotKey(this._slot), JSON.stringify(this.data)) } catch { }
      return this.data
    },
    version() { return Number(this.data.__v) || SAVE_VERSION },
    SAVE_VERSION,
    async useSlot(n, { fromFile = true } = {}) {
      this._slot = Math.max(1, Math.min(SLOT_COUNT, n | 0 || 1))
      let o = fromFile ? await this.peekFile(this._slot) : null
      if (!o) o = this.peek(this._slot)
      if (o) this.applyObject(o)
      return !!o
    },
    // 把当前 data 写到指定槽（用于"存档到槽 N"）
    async saveToSlot(n) {
      const keep = this._slot
      this._slot = Math.max(1, Math.min(SLOT_COUNT, n | 0 || 1))
      this.data.savedAt = Date.now()
      this.data.started = true
      const json = JSON.stringify(this.data)
      try { localStorage.setItem(this.slotKey(this._slot), json) } catch { }
      if (typeof fetch === 'function') {
        try {
          await fetch(`${this._fileUrl}?slot=${this._slot}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json,
          })
        } catch { }
      }
      this._slot = keep
      return true
    },
    async deleteSlot(n) {
      const s = Math.max(1, Math.min(SLOT_COUNT, n | 0 || 1))
      try { localStorage.removeItem(this.slotKey(s)) } catch { }
      if (typeof fetch === 'function') {
        try { await fetch(`${this._fileUrl}?slot=${s}`, { method: 'POST', body: '{}' }) } catch { }
      }
      return true
    },
    load() {
      try {
        const s = localStorage.getItem(this.slotKey(this._slot))
        if (s) Object.assign(this.data, JSON.parse(s))
      } catch { }
      return this.data
    },
    // 再尝试从 exe 服务器读当前槽的存档；有就覆盖（它比 localStorage 更权威）
    async loadFile() {
      // 浏览器直接打开 dist/web（没有后端）或测试台里没有 fetch 时，安静跳过
      if (typeof fetch !== 'function') return false
      try {
        const r = await fetch(`${this._fileUrl}?slot=${this._slot}&t=${Date.now()}`, { cache: 'no-store' })
        if (!r.ok) return false
        const txt = await r.text()
        if (!txt || txt.length < 4) return false
        const obj = JSON.parse(txt)
        if (!obj || typeof obj !== 'object') return false
        Object.assign(this.data, obj)
        this._hasFile = true
        // 顺手同步回 localStorage，保证同一次运行内两条路一致
        try { localStorage.setItem(this.slotKey(this._slot), JSON.stringify(this.data)) } catch { }
        return true
      } catch { return false }
    },
    persist() {
      this.data.savedAt = Date.now()
      const json = JSON.stringify(this.data)
      try { localStorage.setItem(this.slotKey(this._slot), json) } catch { }
      // 写文件做 400ms 防抖：战斗里血量会频繁变化，不能每次都发请求
      clearTimeout(this._t)
      if (typeof fetch !== 'function') return
      const slot = this._slot
      this._t = setTimeout(() => {
        try {
          fetch(`${this._fileUrl}?slot=${slot}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json,
          }).catch(() => { })
        } catch { }
      }, 400)
    },
    // 开新档：把槽置为全新状态（主菜单「新的冒险」用，不刷新页面）
    newGame(n) {
      this._slot = Math.max(1, Math.min(SLOT_COUNT, n | 0 || this._slot))
      const d = JSON.parse(JSON.stringify(this.defaults || {}))
      d.started = true
      d.level = 1
      d.savedAt = Date.now()
      d.playSeconds = 0
      this.applyObject(d)
      this.persist()
      return this.data
    },
    // 清空指定槽（默认当前槽）并重开
    reset(n) {      const s = Math.max(1, Math.min(SLOT_COUNT, n | 0 || this._slot))
      try { localStorage.removeItem(this.slotKey(s)) } catch { }
      try {
        if (typeof fetch === 'function') fetch(`${this._fileUrl}?slot=${s}`, { method: 'POST', body: '{}' }).catch(() => { })
      } catch { }
      location.reload()
    },
  }
  // 记下"全新存档"的默认值，供主菜单「新的冒险」就地重置（不必刷新页面）
  G.save.defaults = JSON.parse(JSON.stringify(G.save.data))
  // 新档也带上版本号，这样"从第一版就存在"的存档和"新开的档"能被区分开
  G.save.data.__v = SAVE_VERSION
  G.save.defaults.__v = SAVE_VERSION
  G.save.lastMigration = null

  // ================= 音频 =================
  const audio = { bgm: null, sfxCache: {}, volume: 0.55, sfxOn: true, muted: false }

  G.audio = {
    setVolume(v) { audio.volume = v; if (audio.bgm) audio.bgm.volume = audio.muted ? 0 : v },
    toggleMute() {
      audio.muted = !audio.muted
      if (audio.bgm) audio.bgm.volume = audio.muted ? 0 : audio.volume
      return audio.muted
    },
    playBgm(file, { loop = true } = {}) {
      if (!file) return
      if (audio.bgm && audio.bgm._src === file && !audio.bgm.paused) return
      if (audio.bgm) { try { audio.bgm.pause() } catch { } }
      const a = new Audio(file)
      a._src = file
      a.loop = loop
      a.volume = audio.muted ? 0 : audio.volume
      a.play().catch(() => { })
      audio.bgm = a
    },
    stopBgm() { if (audio.bgm) { try { audio.bgm.pause() } catch { } audio.bgm = null } },
    // 当前正在放的 BGM 路径（给测试和无头工具读，游戏逻辑不用）
    __current() { return audio.bgm ? audio.bgm._src : null },
    sfx(file, vol = 0.45) {
      if (!audio.sfxOn || audio.muted || !file) return
      let a = audio.sfxCache[file]
      if (!a) { a = new Audio(file); a.preload = 'auto'; audio.sfxCache[file] = a }
      try { a.currentTime = 0; a.volume = Math.min(1, audio.volume + vol * 0.3); a.play().catch(() => { }) } catch { }
    },
    setSfx(on) { audio.sfxOn = on },
    get sfxOn() { return audio.sfxOn },
  }

  // ================= 输入 =================
  const keys = new Set()
  const pressed = new Set()
  G.input = {
    down(k) { return keys.has(k) },
    // 只在按下的那一帧为真
    once(k) { return pressed.has(k) },
    clearFrame() { pressed.clear() },
    init() {
      window.addEventListener('keydown', (e) => {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
        if (!keys.has(k)) pressed.add(k)
        keys.add(k)
        // 方向键与空格阻止页面滚动
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault()
      })
      window.addEventListener('keyup', (e) => {
        keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key)
      })
      window.addEventListener('blur', () => keys.clear())
    },
    axis() {
      let x = 0, y = 0
      if (keys.has('ArrowLeft') || keys.has('a')) x -= 1
      if (keys.has('ArrowRight') || keys.has('d')) x += 1
      if (keys.has('ArrowUp') || keys.has('w')) y -= 1
      if (keys.has('ArrowDown') || keys.has('s')) y += 1
      if (x && y) { const s = Math.SQRT1_2; x *= s; y *= s }
      return { x, y }
    },
  }

  // ================= 精灵动画 =================
  // framePath(dir, action) -> 第 n 帧的相对路径
  const animCache = new Map()
  G.anim = {
    data: null,
    load(indexData) { this.data = indexData },
    // 取某形态的某动作
    get(form, action) {
      if (!this.data) return null
      for (const [k, a] of Object.entries(this.data.actions)) {
        if (a.dir.startsWith(form) && a.action === action) return { key: k, ...a }
      }
      // 退一步：只要动作名匹配
      for (const [k, a] of Object.entries(this.data.actions)) {
        if (a.action === action) return { key: k, ...a }
      }
      return null
    },
    list(form) {
      if (!this.data) return []
      return Object.entries(this.data.actions)
        .filter(([, a]) => a.dir.startsWith(form))
        .map(([k, a]) => ({ key: k, ...a }))
    },
    frameUrl(entry, i) {
      const f = String(i % entry.frames).padStart(4, '0') + '.png'
      return `assets/anim/${entry.dir}/${f}`
    },
    // 预取一个动作的全部帧
    prefetch(entry) {
      if (!entry) return
      const key = entry.key
      if (animCache.has(key)) return
      const imgs = []
      for (let i = 0; i < entry.frames; i++) {
        const im = new Image()
        im.src = this.frameUrl(entry, i)
        imgs.push(im)
      }
      animCache.set(key, imgs)
    },
    getFrame(entry, i) {
      this.prefetch(entry)
      const imgs = animCache.get(entry.key)
      return imgs ? imgs[i % imgs.length] : null
    },
  }

  // ================= 官方立绘 =================
  // 每个多比形态的「形象」取自官方立绘（assets/forms/art/，由 _tools/build-form-art.mjs 从归档里抽取）。
  // 立绘是静态图，所以待机/行走/发招的动感靠程序化变换补足（见 game.js 的 drawFigure*）。
  const artCache = new Map()
  G.art = {
    get(form) {
      const src = form && form.art
      if (!src) return null
      let im = artCache.get(src)
      if (!im) {
        im = new Image()
        im.src = src
        artCache.set(src, im)
      }
      return im
    },
    // 走路帧（第 53 轮）：由官方立绘合成的 4 帧步态，见 _tools/gen-form-walk.mjs。
    // 归档里**没有多比的走路循环**（`多比形态序列` 只有光多比/凤凰多比，且全是战斗动作），
    // 所以这套帧是**合成的**（脚底钉住的挤压 + 侧倾）。取不到就返回 null，调用方回退到站立立绘。
    walk(form, i) {
      if (!form) return null
      const map = (typeof window !== 'undefined' && window.__DKDbb_FORM_WALK__) || null
      // 索引按**立绘文件名**建键（`克罗.png` → `克罗`），不是按形态名 ——
      // 形态名是「克罗 多比」而图叫「克罗.png」，两者并不一样（第一版按形态名取，27 只只命中 0 只）。
      const key = form.art ? String(form.art).split('/').pop().replace(/\.png$/i, '') : form.name
      const files = map && map.forms ? (map.forms[key] || map.forms[form.name]) : null
      if (!files || !files.length) return null
      const src = files[((i % files.length) + files.length) % files.length]
      let im = artCache.get(src)
      if (!im) {
        im = new Image()
        im.src = src
        artCache.set(src, im)
      }
      return im
    },
    hasWalk(form) {
      const map = (typeof window !== 'undefined' && window.__DKDbb_FORM_WALK__) || null
      if (!map || !map.forms || !form) return false
      const key = form.art ? String(form.art).split('/').pop().replace(/\.png$/i, '') : form.name
      return !!(map.forms[key] || map.forms[form.name])
    },
    // 这只形态有几帧走路图。调用方**必须问它**，不能写死 ——
    // 第 53 轮踩过：帧数从 4 改成 6 之后，`Math.floor(phase * 4) % 4` 还写死在绘制里，
    // 于是永远只播前 4 帧（后两帧白生成了）。
    walkFrames(form) {
      const map = (typeof window !== 'undefined' && window.__DKDbb_FORM_WALK__) || null
      if (!map || !map.forms || !form) return 0
      const key = form.art ? String(form.art).split('/').pop().replace(/\.png$/i, '') : form.name
      const files = map.forms[key] || map.forms[form.name]
      return files ? files.length : 0
    },
    // 头像方图（背包格子/徽章条用，全身图缩到 40px 会糊）
    icon(form) {
      const src = form && (form.artIcon || form.art)
      if (!src) return null
      let im = artCache.get(src)
      if (!im) {
        im = new Image()
        im.src = src
        artCache.set(src, im)
      }
      return im
    },
    ready(img) { return !!(img && img.complete && img.naturalWidth) },
    prefetch(form) { this.get(form); this.icon(form) },
    // 有可用立绘就画，返回 true；否则调用方退回动画帧
    draw(ctx, form, cx, bottomY, targetH, opts) {
      const img = this.get(form)
      if (!this.ready(img)) return false
      G.util.drawSprite(ctx, img, cx, bottomY, targetH, opts)
      return true
    },
  }

  // ================= 通用工具 =================
  G.util = {
    // 把图片画到 Canvas，保持比例，可选底部对齐
    drawSprite(ctx, img, cx, bottomY, targetH, { flip = false } = {}) {
      if (!img || !img.complete || !img.naturalWidth) return
      // 【第 53 轮修 · 免费的高清】浏览器的 `imageSmoothingQuality` **默认是 'low'**，
      // 而我们的立绘是**大幅缩小**绘制的（原图 640px 高 → 画面里 132px，缩到 0.2 倍）。
      // 'low' 在这种缩小倍数下会明显发糊；'high' 会用更好的重采样。
      // 全项目**从来没设置过**它 —— 这是"看着不清"的一个直接原因，而且零成本。
      // 放在 drawImage 之前逐次设置：上下文被 save/restore 或 setTransform 动过之后它可能回到默认。
      if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = true
      if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high'
      const scale = targetH / img.naturalHeight
      const w = img.naturalWidth * scale, h = targetH
      const x = Math.round(cx - w / 2), y = Math.round(bottomY - h)
      if (flip) {
        ctx.save()
        ctx.translate(x + w, y)
        ctx.scale(-1, 1)
        ctx.drawImage(img, 0, 0, w, h)
        ctx.restore()
      } else {
        ctx.drawImage(img, x, y, w, h)
      }
    },
    clamp(v, a, b) { return v < a ? a : v > b ? b : v },
    rand(a, b) { return a + Math.random() * (b - a) },
    randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)) },
    // 简单的 AABB
    hit(ax, ay, aw, ah, bx, by, bw, bh) {
      return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah
    },
    formatTime(sec) {
      const m = Math.floor(sec / 60), s = Math.floor(sec % 60)
      return `${m}:${String(s).padStart(2, '0')}`
    },
  }

  // ================= 文字排版 =================
  G.text = {
    // 带描边的文字（页游风格）
    stroked(ctx, s, x, y, { size = 16, color = '#fff', stroke = '#1a1206', lw = 4, align = 'left', baseline = 'alphabetic', weight = 'bold' } = {}) {
      ctx.save()
      ctx.font = `${weight} ${size}px "Microsoft YaHei", "PingFang SC", sans-serif`
      ctx.textAlign = align
      ctx.textBaseline = baseline
      ctx.lineWidth = lw
      ctx.strokeStyle = stroke
      ctx.lineJoin = 'round'
      ctx.strokeText(s, x, y)
      ctx.fillStyle = color
      ctx.fillText(s, x, y)
      ctx.restore()
    },
    // 自动换行（按像素宽度）。s 允许为空/非字符串 —— 台词数据里偶有缺字段的条目，
    // 不兜底的话 `for (const ch of undefined)` 会直接抛错、把整个渲染循环打断。
    wrap(ctx, s, maxW, size) {
      const str = (s === undefined || s === null) ? '' : String(s)
      // ⚠️ 必须用**调用方实际要画的字号**来量宽。原先这里写死 `16px`，
      //    而调用方往往用 13~14px 画 —— 量出来的行宽比实际宽，断行位置就会偏，
      //    表现为"按 16px 排的行，用 14px 画出来右边空一截 / 或仍差几个像素溢出"。
      const px = Number(size) > 0 ? Number(size) : 16
      ctx.save()
      ctx.font = `${px}px "Microsoft YaHei", sans-serif`
      const out = []
      let line = ''
      for (const ch of str) {
        if (ch === '\n') { out.push(line); line = ''; continue }
        const t = line + ch
        if (ctx.measureText(t).width > maxW && line) { out.push(line); line = ch }
        else line = t
      }
      if (line) out.push(line)
      ctx.restore()
      return out
    },
  }
})()
