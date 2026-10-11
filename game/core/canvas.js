/* 多克多比 · 内核（core/canvas.js）
   职责：画布缩放 fit() 与窗口 resize（把 960×560 的画布按窗口等比缩放）。
   来源：原 game/game.js 第 199–206 行，内容完全一致。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const { cvs, W, H } = G.core

  function fit() {
    const maxW = window.innerWidth - 40
    const maxH = window.innerHeight - 150
    const k = Math.min(maxW / W, maxH / H, 1.6)
    cvs.style.width = Math.round(W * k) + 'px'
    cvs.style.height = Math.round(H * k) + 'px'
  }
  window.addEventListener('resize', fit)

  G.core.fit = fit
})()