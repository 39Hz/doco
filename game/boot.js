/* 多克多比 · 装配点（第 72 轮重构 · 批次 7 · 方案 2 / 3.4）
   —— 本期先落**适配器装配**这一段：读 `window.DKDbbConfig` 这个"唯一离线/在线开关"，
      选出 save-store / content / session 的具体实现，按 `G.ports.*` 校验契约完整，登记到 `G.runtime`。
      app / ui 只认 `G.runtime.*`（端口），不认底下是 localStorage 还是 HTTP。

   —— 主循环 / 事件绑定 / 调试出口注册（原 game.js 尾部）仍在 game.js —— 那是本文件**后半段**，
      待 game.js 变短后并入（方案 5 批次 1 登记过的"机制性延后"，不是遗漏）。

   本文件不做玩法、不读存档，只做"选实现 + 校验 + 登记"。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const cfg = window.DKDbbConfig || {}
  const A = G.adapters || {}
  const P = G.ports || {}

  const problems = []

  // 存档：offline → 本地（localStorage + /__save）；online → 将来的 http-save（未实现则回落并告警）
  let saveStore = A.localSave
  if (cfg.mode === 'online') {
    if (A.httpSave) saveStore = A.httpSave
    else problems.push('mode=online 但 adapters/http-*.js 尚未实现 —— 已回落到本地适配器')
  }
  // 内容：bundled（assets/*.js） / remote（将来 /api/content/*）
  let content = A.bundledContent
  if (cfg.contentSource === 'remote') {
    if (A.remoteContent) content = A.remoteContent
    else problems.push('contentSource=remote 但远程内容适配器尚未实现 —— 已回落到打包内容')
  }
  // 会话：offline → 匿名；online → 将来的 http-session
  let session = A.anonymousSession
  if (cfg.mode === 'online') {
    if (A.httpSession) session = A.httpSession
    else problems.push('mode=online 但未实现 HTTP 会话适配器 —— 已回落到匿名会话')
  }

  // 按端口契约校验（缺方法 = 不合格适配器，直接报出来 —— 不静默降级，R3）
  for (const [k, impl] of [['saveStore', saveStore], ['content', content], ['session', session]]) {
    const port = P[k]
    const missing = port ? port.verify(impl) : ['（端口未加载）']
    if (missing.length) problems.push(`适配器 ${k} 缺契约成员：${missing.join('、')}`)
  }
  if (problems.length) console.warn('[boot] 装配告警：\n  - ' + problems.join('\n  - '))

  G.config = cfg
  G.runtime = {
    mode: cfg.mode || 'offline',
    saveStore, content, session,
    problems: problems.slice(),
  }

  // ==========================================================================
  // 后半段：主循环 + 事件绑定（原 game.js 尾部）
  // 由 game.js 末尾调用 `G.boot.start(api)` —— api 只带 game.js 的内部符号
  // （update / draw / syncToolbar / toggleDifficulty / perfMark / openSkillPanel），
  // 其余一律从 `G.core` / `G.app.*` / `window.DKDbb*` 取。
  // ⚠ 调试出口 `window.__DKDbb_DEBUG__`（283 键，被 `_tools/test-debug-surface.mjs` 冻结）
  //   仍在 game.js：它的键直接引用 game.js 内部符号，迁过来要先把这些符号全暴露 ——
  //   那正是方案禁止的"半迁移"。故留待 game.js 继续变短后再并。
  // ==========================================================================

  const LOAD_TIPS = [
    '<b>七大地形</b>：多比城堡 · 多比大街 · 多比学院 · 索亚森林 · 勇气峡谷 · 智慧城 · 未知悬浮岛',
    '<b>结印技</b>不消耗魔法，威力远超普通技能；靠攻击或挨打积攒 SP（最多 3 点）',
    '<b>结印操作</b>：发动后要在限时内按 ↑↓←→，成功越多威力越大 —— 这是原版首创的玩法',
    '<b>索亚森林</b>是索亚精灵生活的地方，能在这里找到最喜爱的索亚伙伴',
    '<b>多比大街</b>是多克多比国最热闹的地方，可以买到想要的一切',
    '<b>速度</b>属性决定谁先进入回合；<b>攻击</b>影响力量型技能，<b>魔攻</b>影响精神力技能',
    '<b>未知悬浮岛</b>会不定期出现，上面藏着稀有的主题服饰、道具和多比形态',
    '每个多比最多积累 3 点 SP，普通战斗往往刚攒到 1 点就打完了 —— 结印技是 BOSS 战的杀招',
  ]
  function setProgress(p, msg) {
    const f = document.getElementById('ld-fill'), t = document.getElementById('ld-text')
    const pc = document.getElementById('ld-pct')
    if (f) f.style.width = Math.round(p * 100) + '%'
    if (pc) pc.textContent = Math.round(p * 100) + '%'
    if (t && msg) t.textContent = msg
    const tipEl = document.getElementById('ld-tip')
    if (tipEl && !tipEl._timer) {
      let i = 0
      const show = () => { tipEl.innerHTML = LOAD_TIPS[i % LOAD_TIPS.length]; i++ }
      show()
      tipEl._timer = setInterval(show, 2600)
    }
    if (p >= 1) {
      const tipEl2 = document.getElementById('ld-tip')
      if (tipEl2 && tipEl2._timer) { clearInterval(tipEl2._timer); tipEl2._timer = null }
    }
  }

  // 工具栏 + 所有按键 + 载入 + 主循环：start() 由 game.js 在末尾调用。
  async function start(api) {
    const { input, util, art, anim, save, audio } = window.DKDbb
    const M = window.DKDbbMouse
    const Q = window.DKDbbQuest
    const D = window.DKDbbData
    const { cvs, S } = G.core
    const fit = G.core.fit
    const { update, draw, syncToolbar, toggleDifficulty, perfMark, openSkillPanel } = api
    const enterScene = (...a) => G.app.scene.enterScene(...a)
    const applySaveToRuntime = (...a) => G.app.player.applySaveToRuntime(...a)
    const ensureVitals = (...a) => G.app.player.ensureVitals(...a)
    const advanceDialog = (...a) => G.app.dialog.advanceDialog(...a)
    const claimOnlineGift = (...a) => G.app.economy.claimOnlineGift(...a)
    const tickOnlineGift = (...a) => G.app.economy.tickOnlineGift(...a)
    const sceneBgmFor = (...a) => G.app.bgm.sceneBgmFor(...a)
    const BGM = G.app.bgm.BGM

    // 工具栏 + 按键：先注册 —— 素材缺失提前 return 时也照样可用（与原实现一致）。
  // 工具栏
  document.getElementById('btn-mute').addEventListener('click', () => {
    const m = audio.toggleMute()
    document.getElementById('btn-mute').textContent = m ? '🔇' : '🔊'
  })
  function setVol(v) {
    save.data._vol = util.clamp(v, 0, 1)
    audio.setVolume(save.data._vol); save.persist(); syncToolbar()
  }
  document.getElementById('btn-vol-up').addEventListener('click', () => setVol((save.data._vol || 0.55) + 0.1))
  document.getElementById('btn-vol-down').addEventListener('click', () => setVol((save.data._vol || 0.55) - 0.1))
  document.getElementById('btn-full').addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => { })
    else document.exitFullscreen().catch(() => { })
  })
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm(`清空存档槽 ${save.slot()} 并重新开始？`)) save.reset(save.slot())
  })
  // 在线礼包按钮（第 54 轮）：官方原文「点击游戏右上角的"在线奖励"按钮，即可领取奖励」
  const btnGift = document.getElementById('btn-gift')
  if (btnGift) btnGift.addEventListener('click', () => claimOnlineGift())
  // 技能面板按钮（第 55 轮，用户要求「技能选择也设定个按键放在上面」）：
  // 与键盘 V / K 等价。用同一个 openSkillPanel()，避免按钮和键盘走两套逻辑。
  const btnSkills = document.getElementById('btn-skills')
  if (btnSkills) btnSkills.addEventListener('click', () => openSkillPanel())
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase()
    if (k === 'm') document.getElementById('btn-mute').click()
    if (k === 'f') document.getElementById('btn-full').click()
    // 难度切换：任何界面都能按（第 43 轮）
    if (k === 'n' && S.mode !== 'loading') { toggleDifficulty(); syncToolbar() }
    // 在线礼包（第 54 轮）：T 键与右上角「礼包」按钮等价的入口。
    // 官方原文说"点击右上角的在线奖励按钮领取"，所以按钮是主入口、键是便利入口。
    if (k === 't' && S.mode !== 'loading' && S.mode !== 'title') claimOnlineGift()
    // F3：卡顿面板（第 55 轮）—— 用来定位"图鉴切快了卡住"这类问题。
    // 显示 FPS / 卡帧次数 / 最慢一帧发生在哪个界面；同时超时帧会打到 console.warn。
    if (e.key === 'F3') { e.preventDefault(); S.showPerf = !S.showPerf }
  })

    input.init(); M.init(cvs); fit(); save.load()
    // 先从 exe 服务器上的 save.json 读一次（比 localStorage 权威：换端口/换浏览器都不丢）。
    // 必须在下面所有 derive 之前 await，否则 S.form / 血量会按旧存档算。
    setProgress(0.04, '读取存档…')
    try { await save.loadFile() } catch { }
    setProgress(0.08, '读取素材清单…')
    const manifest = window.__DKDbb_MANIFEST__
    const world = window.__DKDbb_WORLD__
    const animIdx = window.__DKDbb_ANIM__
    const questData = window.__DKDbb_QUESTS__
    if (!manifest || !world) { setProgress(1, '素材清单缺失'); return }

    setProgress(0.3, '建立场景索引…')
    S.world = world
    S.scenes = D.buildScenes(manifest, world)

    setProgress(0.45, '载入角色动画…')
    anim.load(animIdx)
    // 形态数据来自策划表；这里把它们和实际存在的动画动作对上
    for (const f of D.FORMS) D.resolveFormActions(f, animIdx)
    // 形态/背包/索亚/血量统一由 applySaveToRuntime 推导（主菜单读档也走同一套逻辑）
    applySaveToRuntime()

    setProgress(0.6, '载入任务剧情…')
    S.questsLoaded = Q.load(questData)
    if (!save.data.questsDone) save.data.questsDone = []
    if (save.data.gold === undefined) save.data.gold = 0

    save.data._vol = save.data._vol === undefined ? 0.55 : save.data._vol
    audio.setVolume(save.data._vol)
    ensureVitals()

    // 预载全部形态的官方立绘与头像（选人界面 / 背包 / 收集条都要用）
    for (const f of D.FORMS) art.prefetch(f)

    // 预载各形态的战斗/胜利/技能动画（立绘加载失败时的兜底），避免战斗中切动作时卡顿
    for (const f of D.FORMS) {
      const e = anim.get(f.spriteDir, f.actionIdle)
      if (e) anim.prefetch(e)
    }

    setProgress(0.75, '预载技能动画…')
    for (const f of D.FORMS) {
      const acts = [f.actionBattle, f.actionWin, ...(f.actionSkills || [])]
      for (const a of acts) {
        if (!a) continue
        const e = anim.get(f.spriteDir, a)
        if (e) anim.prefetch(e)
      }
    }

    setProgress(0.85, '准备就绪…')
    enterScene(save.data._lastScene || 2, { keepMode: true })
    S.mode = 'title'
    // 标题画面用原版的轻快曲子（没有就用场景曲兜底）
    audio.playBgm(BGM.title || sceneBgmFor(S.current))
    S.mapSel = Math.max(0, world.islands.findIndex((i) => i.id === (S.current && S.current.island)))
    if (S.mapSel < 0) S.mapSel = 0

    setProgress(1, '')
    setTimeout(() => {
      const ld = document.getElementById('loading')
      if (ld) ld.classList.add('done')
    }, 300)

    // 选项按键（对话中用）
    window.addEventListener('keydown', (e) => {
      if (S.mode !== 'dialog' || !S.dialog) return
      const cur = S.dialog.lines[S.dialog.i]
      if (!cur || cur.type !== 'choice') return
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= 3) {
        S.dialog.choice = n - 1
        setTimeout(advanceDialog, 120)
      }
    })

    let last = performance.now()
    let playAcc = 0        // 距上次持久化累计的秒数（游玩时长）
    // 卡顿看门狗的 PERF / SLOW_MS / perfMark / perfText 定义在 **game.js 里**（不在本函数内），
    // 经 `api.perfMark` 传进来（调试接口 `__DKDbb_DEBUG__.perf()` 直接读它）。

    function loop(now) {
      perfMark(now)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (S.mode !== 'loading') {
        // 累计游玩时长：主菜单的存档摘要要显示它。
        // 主菜单停留时间不算进去，否则"游戏时间"会被挂机读档撑大。
        if (S.mode !== 'title') {
          save.data.playSeconds = (save.data.playSeconds || 0) + dt
          playAcc += dt
          if (playAcc > 20) { playAcc = 0; save.persist() }
          // 在线礼包到点提示（第 54 轮）：官方原文「达到 10/20/30 分钟得到在线大礼包」
          tickOnlineGift()
        }
        update(dt); draw(); syncToolbar()
        // ★ 帧末统一清输入（第 55 轮修"点什么都不动"）：
        //   必须在 `update()` **返回之后**清，这样 39 处提前 return 都不影响它。
        //   `loop` 无论如何都会走到这里（没有 return 分支），所以不可能漏。
        input.clearFrame()
        M.endFrame()
      }
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)

  }

  G.boot = { start }
})()