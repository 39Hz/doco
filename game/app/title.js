/* 多克多比 · 应用层：标题页（主菜单）的**动作与存档**（第 72 轮重构 · 批次 7 · ui 收尾）
   来源：原 `game/game.js` 的「主菜单（标题页）」里会读写存档的那部分（含原注释）。
   —— 这里只放**会读写存档**的动作（继续 / 读档 / 存槽 / 新建 / 槽位刷新）；
      纯布局与绘制在同批次的 `game/ui/title.js`（只画不裁决，经 `G.app.title` 取要显示的数据）。
   依赖：引擎 `window.DKDbb`（save / audio）+ 内核 `G.core`（S / toast）
        + 同层 `G.app.player`（applySaveToRuntime）/ `G.app.rename`（wireNameInput / beginRename）
        + `G.app.bgm`（sceneBgmFor）+ 同层 `G.ui.title`（titleState）。
   只经 `G.app.title` 出口对外，`game.js` 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const { S, toast } = G.core
  const { save, audio } = window.DKDbb

  // 同层 / 界面层（惰性箭头：调用时才解析，故加载顺序无关）。
  const applySaveToRuntime = (...a) => G.app.player.applySaveToRuntime(...a)
  const wireNameInput = (...a) => G.app.rename.wireNameInput(...a)
  const beginRename = (...a) => G.app.rename.beginRename(...a)
  const sceneBgmFor = (...a) => G.app.bgm.sceneBgmFor(...a)
  const titleState = () => G.ui.titleState()

  // 只读桥：界面层不许直接碰 `save.`，经这里取要显示的存档数据。
  function saveData() { return save.data }
  function summarize(sv) { return save.summarize(sv) }
  function currentSlot() { return save.slot() }

  function hasProgress() { return !!save.summarize(save.data) }

  async function refreshSlots() {
    const T2 = titleState()
    T2.slotsBusy = true
    T2.slots = await save.listSlots()
    T2.slotsBusy = false
    return T2.slots
  }

  // 进入世界（读档/继续/新档都从这里出去）
  function enterWorldFromMenu() {
    const sv = save.data
    sv.started = true
    save.persist()
    applySaveToRuntime()
    S.mode = 'worldmap'
    titleState().view = 'main'
    audio.playBgm(S.current ? (S.current.bgm || sceneBgmFor(S.current)) : null)
    audio.sfx('assets/sfx/onClick_03.mp3')
  }

  // 在**指定槽**里新建角色（第 56 轮：用户报"新的冒险为什么清空存档一、不该能选建档位置吗"）
  function startNewGameIn(slot) {
    const T2 = titleState()
    const n = Math.max(1, Math.min(save.SLOTS, slot | 0 || 1))
    save.newGame(n)                 // newGame 会把当前槽切成 n 并重置数据
    T2.view = 'main'; T2.sel = 0; T2.msg = ''; T2.newSlot = null
    enterWorldFromMenu()
    // 新档开好之后**顺手让玩家起个名字**（第 54 轮：用户要的"起名字功能"）。
    // 不强制：直接 Esc 或点别处就保持默认名，绝不挡住进游戏。
    wireNameInput()
    beginRename('player')
    toast(`已在存档槽 ${n} 新建角色`)
  }

  // 把当前进度写进指定存档槽（用引擎里已有的 saveToSlot：它写完会把"当前槽"还原，
  // 所以**存进别的槽不会打断你正在玩的这一档**）。
  async function writeToSlot(n) {
    const ok = await save.saveToSlot(n)
    if (ok) audio.sfx('assets/sfx/onClick_03.mp3')
    return ok
  }

  // 主菜单的动作分发（键盘与鼠标共用）
  async function titleAction(id) {
    const T2 = titleState()
    if (id === 'continue') {
      // 空存档也允许直接开始（无损：不重置数据，只是标记开局并进世界）。
      // 这样"标题页按空格"就能进游戏，第一次玩的玩家不会先被挡一下。
      if (!hasProgress()) save.data.started = true
      enterWorldFromMenu()
    } else if (id === 'load') {
      T2.view = 'load'
      T2.sel = 0
      T2.msg = ''
      await refreshSlots()
    } else if (id === 'save') {
      // 保存视图与载入视图共用同一套卡片绘制，区别只在"确认时做什么"
      T2.view = 'save'
      T2.sel = Math.max(0, (T2.slots || []).findIndex((s) => s.slot === save.slot()))
      T2.msg = ''
      await refreshSlots()
      T2.sel = Math.max(0, (T2.slots || []).findIndex((s) => s.slot === save.slot()))
    } else if (id === 'new') {
      // 【第 56 轮修 · 用户报的】原先「新的冒险」直接 `save.newGame(save.slot())` ——
      // 也就是**清掉当前槽**（默认 1 号），玩家根本没机会选在哪建档。
      // 现在先让他挑位置：默认光标停在**第一个空槽**（没有空槽才停在当前槽）。
      T2.view = 'newPick'
      T2.sel = 0
      T2.msg = ''
      await refreshSlots()
      const empty = (T2.slots || []).findIndex((s) => !s.info)
      T2.sel = empty >= 0 ? empty : Math.max(0, (T2.slots || []).findIndex((s) => s.slot === save.slot()))
    } else if (id === 'help') {
      T2.view = 'help'
    } else if (id === 'about') {
      T2.view = 'about'
    }
  }

  G.app = G.app || {}
  G.app.title = {
    hasProgress, refreshSlots, enterWorldFromMenu, startNewGameIn, writeToSlot, titleAction,
    saveData, summarize, currentSlot,
  }
})()