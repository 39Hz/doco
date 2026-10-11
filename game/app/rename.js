/* 多克多比 · 应用层：起名字（第 72 轮重构 · 批次 4）
   来源：原 `game/game.js` 第 6518–6592 行（第 54 轮做的），内容一致。
   依赖：引擎存档 `window.DKDbb.save` + 内核提示 `G.core.toast`；
   只经 `G.app.rename` 出口对外，`game.js` 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'

  const G = window.DKDbbGame
  const { save } = window.DKDbb
  const { toast } = G.core

  // ==================== 起名字（第 54 轮）====================
  // 用户要的：「可以出一个起名字的功能让玩家起 id」。
  // 两个地方都能改：① **玩家（多克）自己的名字**（显示在顶栏，也是场景里那身造型的稳定种子）；
  //                ② **出战多比的昵称**（显示在战斗/面板里）。
  //
  // 实现要点：用**隐藏的 DOM input** 收字，而不是在 canvas 上抓 keydown ——
  // 中文要经过输入法，自己抓 keydown 只能拿到 ASCII。input 天然支持输入法、粘贴、退格。
  const NAME_INPUT_ID = 'nameInput'
  let renaming = null      // { kind: 'player' | 'form', formName }
  function nameInputEl() {
    return (typeof document !== 'undefined' && document.getElementById)
      ? document.getElementById(NAME_INPUT_ID) : null
  }
  function currentNameOf(kind, formName) {
    if (kind === 'player') return save.data.playerName || '多比'
    const m = save.data.formNames || (save.data.formNames = {})
    return m[formName] || ''
  }
  // 显示出来的名字：多比没起昵称就用形态名
  function displayNameOf(formName) {
    const m = save.data.formNames || {}
    return m[formName] || formName
  }
  function beginRename(kind, formName) {
    const el = nameInputEl()
    renaming = { kind, formName }
    if (!el) {
      // 没有 DOM（测试台/无头环境）时退回一个默认名字，不让流程卡住
      applyRename(kind === 'player' ? '多克' : '', formName)
      return false
    }
    el.value = currentNameOf(kind, formName)
    el.style.display = 'block'
    // ⚠️ focus / select 都要**防御性调用**：无头环境（测试台）里的假元素没有这些方法，
    //    直接调会抛 `el.focus is not a function` 把整局游戏带崩 —— 这是真该修的健壮性问题。
    if (typeof el.focus === 'function') el.focus()
    if (typeof el.select === 'function') el.select()
    return true
  }
  function endRenameInput() {
    const el = nameInputEl()
    if (el) {
      if (el.style) el.style.display = 'none'
      if (typeof el.blur === 'function') el.blur()
    }
    renaming = null
  }
  function applyRename(value, formName) {
    const v = String(value === undefined || value === null ? '' : value).trim().slice(0, 12)
    const info = renaming || { kind: formName ? 'form' : 'player', formName }
    if (info.kind === 'player') {
      save.data.playerName = v || '多克'
      toast(`名字已改为「${save.data.playerName}」`)
    } else {
      const m = save.data.formNames || (save.data.formNames = {})
      if (v) { m[info.formName] = v; toast(`「${info.formName}」的昵称：${v}`) }
      else { delete m[info.formName]; toast(`「${info.formName}」恢复用形态名`) }
    }
    save.persist()
    renaming = null
  }
  // 把输入框的事件接上（只接一次）
  let nameInputWired = false
  function wireNameInput() {
    if (nameInputWired) return
    const el = nameInputEl()
    if (!el || !el.addEventListener) return
    nameInputWired = true
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); applyRename(el.value); endRenameInput() }
      else if (e.key === 'Escape') { e.preventDefault(); renaming = null; endRenameInput(); toast('已取消改名') }
      e.stopPropagation()          // 别让 WASD 传到游戏里把角色走起来
    })
    el.addEventListener('blur', () => { if (renaming) { applyRename(el.value); endRenameInput() } })
  }

  G.app = G.app || {}
  G.app.rename = { NAME_INPUT_ID, beginRename, endRenameInput, applyRename, wireNameInput, displayNameOf, currentNameOf }
})()