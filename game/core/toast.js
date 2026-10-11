/* 多克多比 · 内核 · 共享提示（第 72 轮重构 · 批次 4）
   职责：一条自己会过期的行内提示：写运行时状态 S.toast，由渲染侧读出来画。

   为什么放在内核而不是界面层：应用层（app/*）与主体都要用它，
   而分层铁律是 ui → app，app 不许依赖 ui；放内核可由任一上层取用。

   来源：原 game/game.js 第 139 行，内容完全一致。 */
(() => {
  'use strict'

  const G = window.DKDbbGame
  const { S } = G.core

  function toast(msg, ms = 1900) { S.toast = { msg, until: performance.now() + ms } }

  G.core.toast = toast
})()