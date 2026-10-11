/* 多克多比 · 界面层：战斗结算绘制（第 72 轮重构 · 批次 8 · 界面绘制）
   来源：原 game/game.js 的 drawResult 整段（胜/败 / 经验 / 掉落形态 / 经验条）。
   —— **只画不裁决**：不直接读存档（等级 / 经验经 G.app.saveData() 桥读）、不发奖。
   依赖：内核 G.core（S / ctx / W / H）+ 引擎 window.DKDbb（text）+ 内容表 window.DKDbbData（D）
        + 同层 G.ui（drawBattle 底图 / drawBar 经验条）。
   只经 G.ui 出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const D = window.DKDbbData
  const { text } = window.DKDbb
  const { S, ctx, W, H } = G.core
  const saveData = () => G.app.saveData()
  const { drawBattle, drawBar } = G.ui

  function drawResult() {
    drawBattle()
    ctx.fillStyle = 'rgba(6,10,18,.85)'; ctx.fillRect(0, 0, W, H)
    const r = S.result
    text.stroked(ctx, r.win ? '胜　利' : '败　北', W / 2, 210, { size: 56, align: 'center', color: r.win ? '#ffe45e' : '#ff8a8a', lw: 10 })
    if (r.win) {
      text.stroked(ctx, `击败了 ${r.name}`, W / 2, 262, { size: 18, align: 'center', color: '#cfd6e4', lw: 4 })
      text.stroked(ctx, `+${r.exp} 经验　+${r.gold} 金币`, W / 2, 294, { size: 19, align: 'center', color: '#5ee06a', lw: 4 })
      if (r.dropForm) {
        ctx.fillStyle = 'rgba(255,210,63,.16)'
        ctx.fillRect(W / 2 - 220, 314, 440, 40)
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2
        ctx.strokeRect(W / 2 - 219, 315, 438, 38)
        text.stroked(ctx, `★ 获得新形态「${r.dropForm}」　按 B 打开背包变身`, W / 2, 340,
          { size: 16, align: 'center', color: '#ffe45e', lw: 4 })
      }
      const need = D.expToNext(saveData().level)
      drawBar(W / 2 - 160, r.dropForm ? 372 : 336, 320, 14, saveData().exp, need, '#43d9c8', null)
      text.stroked(ctx, `Lv.${saveData().level}　EXP ${saveData().exp}/${need}`, W / 2, r.dropForm ? 408 : 372,
        { size: 13, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
    } else {
      text.stroked(ctx, '体力已恢复，回去再战吧', W / 2, 290, { size: 18, align: 'center', color: '#cfd6e4', lw: 4 })
    }
    text.stroked(ctx, '按 空格 继续', W / 2, 440, { size: 18, align: 'center', color: '#ffe45e', lw: 5 })
  }

  G.ui = G.ui || {}
  Object.assign(G.ui, { drawResult })
})()
