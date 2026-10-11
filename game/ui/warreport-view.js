/* 多克多比 · 界面层：战报界面（第 72 轮重构 · 批次 8 · 界面绘制）
   来源：原 game/game.js 的战报面板版式（WAR / warLayout / WAR_PER_PAGE / warPages）与
   顶栏「战报」按钮 / 战报整页绘制（warButtonRect / warButtonHit / drawWarButton / drawWarReport）。
   —— **只画不裁决**：不直接读存档；任务模型来自应用层（G.app.warreport）。
   依赖：内核 G.core（S / ctx / W / H）+ 引擎 window.DKDbb（text）
        + 应用层 G.app.warreport（WAR_TARGET / warTasks / warTaskText / warIslandProgress）
        + 同层 G.ui（drawExplore）。
   只经 G.ui 出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const { text } = window.DKDbb
  const { S, ctx, W, H } = G.core
  const { WAR_TARGET, warTasks, warTaskText, warIslandProgress } = G.app.warreport
  const drawExplore = (...a) => G.ui.drawExplore(...a)

  // 战报面板的版式（键盘与鼠标共用同一份几何，避免两套算法打架）
  const WAR = { cols: 2, rows: 6, x: 40, y: 96, cw: 430, ch: 52, gap: 10 }
  function warLayout(tasks) {
    const rects = []
    for (let i = 0; i < tasks.length; i++) {
      const c = i % WAR.cols, r = Math.floor(i / WAR.cols)
      rects.push({ x: WAR.x + c * (WAR.cw + WAR.gap), y: WAR.y + r * (WAR.ch + WAR.gap), w: WAR.cw, h: WAR.ch })
    }
    return rects
  }
  const WAR_PER_PAGE = WAR.cols * WAR.rows
  function warPages(tasks) { return Math.max(1, Math.ceil(tasks.length / WAR_PER_PAGE)) }

  // 顶栏「战报」按钮的矩形（原版就是点界面上方这个按钮进的战报）
  // 位置要和顶部那行快捷键提示错开：提示行右对齐到 W-110（即止于 850），
  // 本按钮从 W-100（860）起，横向不重叠 —— 早先放 W-168 时被提示行压住（截图发现）。
  function warButtonRect() { return { x: W - 100, y: 12, w: 76, h: 28 } }
  function warButtonHit(mx, my) {
    const r = warButtonRect()
    return mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h
  }

  function drawWarButton() {
    const r = warButtonRect()
    const ready = S.warReadyCount == null ? 0 : S.warReadyCount
    ctx.save()
    ctx.fillStyle = ready > 0 ? 'rgba(255,210,63,.22)' : 'rgba(10,16,28,.72)'
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.strokeStyle = ready > 0 ? '#ffd23f' : 'rgba(255,255,255,.28)'
    ctx.lineWidth = ready > 0 ? 2 : 1
    ctx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1)
    ctx.restore()
    text.stroked(ctx, '战报 Z', r.x + r.w / 2, r.y + 21, { size: 14, align: 'center', color: ready > 0 ? '#ffe45e' : '#cfe0ff', lw: 3 })
    if (ready > 0) text.stroked(ctx, String(ready), r.x + r.w - 8, r.y + 12, { size: 11, align: 'right', color: '#ff8a8a', lw: 3 })
  }

  function drawWarReport() {
    drawExplore()
    ctx.fillStyle = 'rgba(6,10,18,.9)'; ctx.fillRect(0, 0, W, H)
    text.stroked(ctx, '战报 · 冒险者试炼', W / 2, 44, { size: 26, align: 'center', color: '#ffd23f' })

    const tasks = warTasks()
    const pages = warPages(tasks)
    const pageTasks = tasks.slice(S.warPage * WAR_PER_PAGE, (S.warPage + 1) * WAR_PER_PAGE)
    const rects = warLayout(pageTasks)
    const readyAll = tasks.filter((t) => t.unlocked && t.kills >= WAR_TARGET).length
    S.warReadyCount = readyAll

    text.stroked(ctx,
      `每张练级地图一条任务　可重复完成　↓↑←→ 选择　空格 领取　[/] 翻页　Z/Esc 返回`,
      W / 2, 72, { size: 12, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })

    if (!tasks.length) {
      text.stroked(ctx, '还没有解锁任何战斗任务——先去大地图进入一张有怪的地图', W / 2, 240,
        { size: 16, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
    }

    for (let i = 0; i < pageTasks.length; i++) {
      const t = pageTasks[i]
      const r = rects[i]
      const idx = S.warPage * WAR_PER_PAGE + i
      const sel = idx === S.warSel
      const ready = t.unlocked && t.kills >= WAR_TARGET
      ctx.fillStyle = sel ? 'rgba(255,210,63,.18)' : (ready ? 'rgba(60,180,110,.14)' : 'rgba(18,24,40,.75)')
      ctx.fillRect(r.x, r.y, r.w, r.h)
      ctx.strokeStyle = sel ? '#ffd23f' : (ready ? '#5ee06a' : 'rgba(255,255,255,.14)')
      ctx.lineWidth = sel || ready ? 2 : 1
      ctx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1)

      // 左：区域 + 地图名
      text.stroked(ctx, t.islandName, r.x + 12, r.y + 20, { size: 12, color: '#9fb0cc', weight: 'normal', lw: 3 })
      text.stroked(ctx, t.sceneName, r.x + 12, r.y + 40, { size: 15, lw: 3, color: sel ? '#ffe45e' : '#e8eefc' })

      // 中：条件
      text.stroked(ctx, warTaskText(t), r.x + 168, r.y + 30, {
        size: 13, lw: 3, color: !t.unlocked ? '#7c8aa5' : (ready ? '#8ef0c0' : '#cfe0ff'),
      })

      // 右：状态
      if (!t.unlocked) text.stroked(ctx, '未解锁', r.x + r.w - 12, r.y + 30, { size: 12, align: 'right', color: '#7c8aa5', lw: 3 })
      else if (ready) text.stroked(ctx, t.firstDone ? '可再领' : '★ 可领取', r.x + r.w - 12, r.y + 30, { size: 13, align: 'right', color: '#5ee06a', lw: 3 })
      else text.stroked(ctx, t.firstDone ? '已首通' : `${t.kills}/${WAR_TARGET}`, r.x + r.w - 12, r.y + 30, { size: 12, align: 'right', color: '#9fb0cc', weight: 'normal', lw: 3 })
    }

    // 右下：各岛线路完成度（对应原文的"多条战斗线路"）
    const prog = warIslandProgress()
    const px = W - 300, py = H - 96
    text.stroked(ctx, '战斗线路', px, py, { size: 13, color: '#ffd23f', lw: 3 })
    let line = 1
    for (const e of prog) {
      if (line > 3) { text.stroked(ctx, `…共 ${prog.length} 条线路`, px, py + line * 17, { size: 11, color: '#9fb0cc', weight: 'normal', lw: 3 }); break }
      text.stroked(ctx, `${e.name}　首通 ${e.first}/${e.total}`, px, py + line * 17, { size: 11, color: '#9fb0cc', weight: 'normal', lw: 3 })
      line++
    }

    text.stroked(ctx, `第 ${S.warPage + 1} / ${pages} 页　共 ${tasks.length} 条　可领取 ${readyAll} 条`,
      W / 2, H - 22, { size: 12, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
  }

  G.ui = G.ui || {}
  Object.assign(G.ui, { WAR, warLayout, WAR_PER_PAGE, warPages,
    warButtonRect, warButtonHit, drawWarButton, drawWarReport })
})()
