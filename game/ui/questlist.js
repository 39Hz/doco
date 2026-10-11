/* 多克多比 · 界面层：任务列表（第 72 轮重构 · 批次 8 · 界面绘制）
   来源：原 game/game.js 的任务列表整段（questRowRects / questRowHit / drawQuestList）。
   —— **只画不裁决**：不直接读存档（已完成清单经 G.app.saveData() 桥读）、不播放剧情。
   依赖：内核 G.core（S / ctx / W / H）+ 引擎 window.DKDbb（text）+ 内容表 window.DKDbbQuest（Q）
        + 同层 G.ui（drawExplore）。
   行坐标 questRowRects 与点击命中 questRowHit **共用同一份**（画在这里、点在那里踩过坑）。
   只经 G.ui 出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const Q = window.DKDbbQuest
  const { text } = window.DKDbb
  const { S, ctx, W, H } = G.core
  const saveData = () => G.app.saveData()
  const drawExplore = (...a) => G.ui.drawExplore(...a)

  // 任务列表的行坐标 —— **绘制与鼠标命中测试共用**（单一事实源 R12）。
  // 第 55 轮：用户要求「局内所有的东西都能左键点击」。任务列表原来只有键盘，
  // 抽出坐标表后绘制和点击都用它，避免两边算得不一样（改布局时必踩）。
  function questRowRects() {
    const list = Q.all.slice(0, 40)
    const PER = 12
    const start = Math.max(0, Math.min(S.questSel - Math.floor(PER / 2), Math.max(0, list.length - PER)))
    const out = []
    for (let i = start; i < Math.min(list.length, start + PER); i++) {
      out.push({ i, q: list[i], x: 70, y: 104 + (i - start) * 34, w: W - 140, h: 30 })
    }
    return out
  }
  function questRowHit(mx, my) {
    for (const r of questRowRects()) {
      if (mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h) return r
    }
    return null
  }

  function drawQuestList() {
    drawExplore()
    ctx.fillStyle = 'rgba(6,10,18,.9)'; ctx.fillRect(0, 0, W, H)
    text.stroked(ctx, '任务列表', W / 2, 52, { size: 28, align: 'center', color: '#ffd23f' })
    const done = saveData().questsDone || []
    const list = Q.all.slice(0, 40)
    text.stroked(ctx, `已完成 ${done.length} / ${Q.all.length}　↑↓ 选择　空格 播放剧情　Q/Esc 返回`, W / 2, 78,
      { size: 13, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
    const PER = 12
    const start = Math.max(0, Math.min(S.questSel - Math.floor(PER / 2), Math.max(0, list.length - PER)))
    // 行坐标走 questRowRects()，与点击命中测试共用同一份
    for (const row of questRowRects()) {
      const i = row.i, q = row.q, y = row.y
      const sel = i === S.questSel
      ctx.fillStyle = sel ? 'rgba(255,210,63,.18)' : 'rgba(18,24,40,.75)'
      ctx.fillRect(row.x, y, row.w, row.h)
      ctx.strokeStyle = sel ? '#ffd23f' : 'rgba(255,255,255,.14)'; ctx.lineWidth = sel ? 2 : 1
      ctx.strokeRect(row.x + .5, y + .5, row.w - 1, row.h - 1)
      const tag = { main: '主线', side: '支线', event: '活动' }[q.type] || '其他'
      const tagColor = { main: '#ffd23f', side: '#43d9c8', event: '#c98bff' }[q.type] || '#9fb0cc'
      text.stroked(ctx, tag, 86, y + 21, { size: 13, color: tagColor, lw: 3 })
      text.stroked(ctx, q.title, 140, y + 21, { size: 14, lw: 3, color: sel ? '#ffe45e' : '#e8eefc' })
      text.stroked(ctx, `${q.steps.length} 步`, W - 160, y + 21, { size: 12, align: 'right', color: '#9fb0cc', weight: 'normal', lw: 3 })
      if (done.includes(q.id)) text.stroked(ctx, '✓', W - 108, y + 21, { size: 14, color: '#5ee06a', lw: 3 })
    }
  }

  G.ui = G.ui || {}
  Object.assign(G.ui, { questRowRects, questRowHit, drawQuestList })
})()
