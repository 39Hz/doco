/* 多克多比 · 界面层：对话界面（第 72 轮重构 · 批次 8 · 界面绘制）
   来源：原 game/game.js 的对话界面整段（dialogOptionRects / drawDialog）。
   —— **只画不裁决**：不直接读存档（玩家名经 G.app.saveData() 桥读）、不推进对话。
   依赖：内核 G.core（S / ctx / W / H）+ 引擎 window.DKDbb（text）+ 内容表 window.DKDbbQuest（Q）
        + 同层 G.ui（drawExplore）。
   只经 G.ui 出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const Q = window.DKDbbQuest
  const { text } = window.DKDbb
  const { S, ctx, W, H } = G.core
  const saveData = () => G.app.saveData()
  const drawExplore = (...a) => G.ui.drawExplore(...a)

  // 对话选项的点击区域。必须与 drawDialog 里画的位置一致 ——
  // 所以两边都调这个函数，而不是各写一份坐标（"画在这里、点在那里"踩过好几次了）。
  function dialogOptionRects() {
    const d = S.dialog
    if (!d) return []
    const item = d.lines[Math.min(d.i, d.lines.length - 1)]
    if (!item || item.type !== 'choice') return []
    const boxH = 150, y = H - boxH - 22
    const opts = []
    for (let k = d.i + 1; k < d.lines.length; k++) {
      if (d.lines[k].type === 'choice') opts.push(d.lines[k])
      else break
    }
    const list = opts.length ? opts : [item]
    return list.map((o, i) => ({ x: 64, y: y + 62 + i * 34, w: W - 200, h: 30, i, label: o.text || '' }))
  }

  function drawDialog() {
    drawExplore()
    const d = S.dialog
    if (!d) return
    const boxH = 150, y = H - boxH - 22
    ctx.fillStyle = 'rgba(8,12,22,.94)'; ctx.fillRect(36, y, W - 72, boxH)
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2; ctx.strokeRect(37, y + 1, W - 74, boxH - 2)

    const item = d.lines[Math.min(d.i, d.lines.length - 1)]
    if (!item) return

    if (item.type === 'stage') {
      text.stroked(ctx, item.text, W / 2, y + boxH / 2 + 6, { size: 20, align: 'center', color: '#43d9c8', lw: 5 })
      text.stroked(ctx, '点击画面 / 空格 继续 ▸', W - 66, y + boxH - 16, { size: 13, align: 'right', color: '#9fb0cc', lw: 3 })
      return
    }

    if (item.type === 'choice') {
      text.stroked(ctx, item.text || '请选择：', 66, y + 44, { size: 17, weight: 'normal', lw: 4 })
      // 选项矩形来自 dialogOptionRects（与点击判定共用同一份坐标）
      const rects = dialogOptionRects()
      const list = rects.map((r) => ({ text: r.label }))
      list.forEach((o, i) => {
        const by = rects[i].y
        const sel = d.choice === i
        ctx.fillStyle = sel ? 'rgba(255,210,63,.22)' : 'rgba(20,28,44,.9)'
        ctx.fillRect(rects[i].x, by, rects[i].w, rects[i].h)
        ctx.strokeStyle = sel ? '#ffd23f' : 'rgba(255,255,255,.2)'; ctx.lineWidth = sel ? 2 : 1
        ctx.strokeRect(rects[i].x + .5, by + .5, rects[i].w - 1, rects[i].h - 1)
        text.stroked(ctx, `${i + 1}. ${o.text || '（继续）'}`, rects[i].x + 16, by + 21,
          { size: 14, lw: 3, color: sel ? '#ffe45e' : '#e8eefc' })
      })
      text.stroked(ctx, '鼠标点击 / 按 1 / 2 选择', W - 66, y + boxH - 14, { size: 12, align: 'right', color: '#9fb0cc', lw: 3 })
      return
    }

    // 普通台词（台词文本可能缺失，兜底成"（继续）"，否则 util.wrap 里 for...of undefined 会崩）
    const who = Q.displayName(item.who, saveData().playerName)
    const isPlayer = item.who === '@player'
    text.stroked(ctx, who, 66, y + 34, { size: 17, color: isPlayer ? '#43d9c8' : '#ffd23f' })
    const lines = text.wrap(ctx, item.text || item.label || '（继续）', W - 140, 17)
    lines.slice(0, 3).forEach((ln, i) => {
      text.stroked(ctx, ln, 66, y + 66 + i * 27, { size: 17, weight: 'normal', lw: 4 })
    })
    text.stroked(ctx, d.i < d.lines.length - 1 ? '点击画面 / 空格 继续 ▸' : '点击画面 / 空格 结束 ▸', W - 66, y + boxH - 16,
      { size: 13, align: 'right', color: '#9fb0cc', lw: 3 })
    if (d.quest) text.stroked(ctx, `任务：${d.quest.title}　${d.i + 1}/${d.lines.length}`, 66, y + boxH - 16, { size: 12, color: '#7b8aa8', weight: 'normal', lw: 3 })
  }

  G.ui = G.ui || {}
  Object.assign(G.ui, { dialogOptionRects, drawDialog })
})()
