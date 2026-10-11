/* 多克多比 · 界面层：小游戏列表绘制（第 72 轮重构 · 批次 8 · 界面绘制）
   来源：原 game/game.js 的小游戏列表版式与绘制（MINI_PANEL / miniLayout / miniRects / drawMinigames）。
   —— **只画不裁决**：不直接读存档（玩过次数经 G.app.saveData() 桥读）、不进入游戏。
   依赖：内核 G.core（ctx / W / H）+ 引擎 window.DKDbb（util / text）+ 内容表 window.DKDbbData（D）
        + 应用层 G.app.minigame（MINI 列表面板状态）。
   挂载在 app 之后：加载期要解构 app 层的值型导出（MINI）。
   只经 G.ui 出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const D = window.DKDbbData
  const { util, text } = window.DKDbb
  const { ctx, W, H } = G.core
  const saveData = () => G.app.saveData()
  const { MINI } = G.app.minigame

  // 小游戏列表版式：13 项、两列 → 7 行。
  // 每项**只放一行**（名字 + 状态），规则文字只在底部显示选中项那一条 ——
  // 早先是"每项两行"，13 项时最后一行底边会跑到 y=602（画面只有 560），出界。
  // 小游戏列表面板的版式（**唯一实现**：绘制与输入都读它）。
  //
  // 【第 47 轮为什么要改成分页】原来只有 2 列、从 y=130 一行行往下排：
  //   15 个游戏时第 15 行落在 y=880 —— **远远在 560 之外，玩家看不见也点不到**，
  //   而 check-canvas-bounds 是第 46 轮才有的（它一上来就把这条抓红了）。
  //   游戏只会越加越多（本轮就 +2 个可玩），所以不能靠"排得下"，
  //   必须**按可用高度算每页几条 + 分页**，页脚还要显示页码。
  const MINI_PANEL = { cols: 2, cw: 430, ch: 44, gap: 6, x: 40, top: 130, bottom: 150 }
  function miniLayout() {
    const rows = Math.max(1, Math.floor((H - MINI_PANEL.top - MINI_PANEL.bottom) / (MINI_PANEL.ch + MINI_PANEL.gap)))
    const perPage = rows * MINI_PANEL.cols
    const list = D.MINIGAMES
    const pages = Math.max(1, Math.ceil(list.length / perPage))
    const page = util.clamp(MINI.page || 0, 0, pages - 1)
    const slice = list.slice(page * perPage, page * perPage + perPage)
    const rects = slice.map((_, i) => {
      const c = i % MINI_PANEL.cols, r = Math.floor(i / MINI_PANEL.cols)
      return {
        x: MINI_PANEL.x + c * (MINI_PANEL.cw + MINI_PANEL.gap),
        y: MINI_PANEL.top + r * (MINI_PANEL.ch + MINI_PANEL.gap),
        w: MINI_PANEL.cw, h: MINI_PANEL.ch,
      }
    })
    return { list, slice, rects, perPage, page, pages, rows, start: page * perPage }
  }
  function miniRects(list) {
    // 兼容旧调用（图鉴面板等）：只按"当前这一页的切片"排版
    const rows = Math.max(1, Math.floor((H - MINI_PANEL.top - MINI_PANEL.bottom) / (MINI_PANEL.ch + MINI_PANEL.gap)))
    const perPage = rows * MINI_PANEL.cols
    return list.slice(0, perPage).map((_, i) => {
      const c = i % MINI_PANEL.cols, r = Math.floor(i / MINI_PANEL.cols)
      return {
        x: MINI_PANEL.x + c * (MINI_PANEL.cw + MINI_PANEL.gap),
        y: MINI_PANEL.top + r * (MINI_PANEL.ch + MINI_PANEL.gap),
        w: MINI_PANEL.cw, h: MINI_PANEL.ch,
      }
    })
  }

  function drawMinigames() {
    ctx.fillStyle = '#070d1a'; ctx.fillRect(0, 0, W, H)
    const g = ctx.createRadialGradient(W / 2, 140, 40, W / 2, 300, 620)
    g.addColorStop(0, 'rgba(255,210,120,.12)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)

    text.stroked(ctx, '小游戏', W / 2, 40, { size: 26, align: 'center', color: '#ffd23f', lw: 8 })
    text.stroked(ctx, '↑↓←→ 选择　空格 开始　Y/Esc 离开　名字与规则都取自归档里的原版截图',
      W / 2, 64, { size: 12.5, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
    text.stroked(ctx, `共 ${D.MINIGAMES.length} 个 · 可玩 ${D.playableMinigames().length} 个　（原版小游戏是 1~4 人多人玩法，离线版只做单人）`,
      W / 2, 86, { size: 12, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })

    const L = miniLayout()
    MINI.sel = util.clamp(MINI.sel || 0, 0, L.list.length - 1)
    MINI.page = Math.floor(MINI.sel / L.perPage)
    for (let i = 0; i < L.slice.length; i++) {
      const m = L.slice[i], r = L.rects[i]
      const sel = (L.list[MINI.sel] || {}).id === m.id
      const plays = (saveData().miniPlays || {})[m.id] || 0
      ctx.fillStyle = sel ? 'rgba(255,210,63,.16)' : (m.impl ? 'rgba(18,24,40,.82)' : 'rgba(26,22,30,.7)')
      ctx.fillRect(r.x, r.y, r.w, r.h)
      ctx.strokeStyle = sel ? '#ffd23f' : (m.impl ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.08)')
      ctx.lineWidth = sel ? 2 : 1
      ctx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1)
      text.stroked(ctx, m.name, r.x + 12, r.y + 29, { size: 15.5, lw: 3, color: sel ? '#ffe45e' : (m.impl ? '#e8eefc' : '#8b93a6') })
      text.stroked(ctx, m.impl ? '可玩' : (m.rule ? '规则已知·机制待实现' : '规则未解读'),
        r.x + r.w - 12, r.y + 27, { size: 11.5, align: 'right', lw: 3, color: m.impl ? '#5ee06a' : '#c9a86a' })
      if (plays) text.stroked(ctx, `玩过 ${plays} 次`, r.x + r.w - 96, r.y + 27,
        { size: 11, align: 'right', color: '#8ef0c0', weight: 'normal', lw: 3 })
    }
    const sel = L.list[MINI.sel]
    if (sel) {
      // 选中项的规则（长句换行，最多两行）+ 出处
      const rule = sel.rule ? `官方规则：${sel.rule}` : '官方规则：归档里只有名字/截图，规则未解读 —— 按 R1 不做'
      const lines = text.wrap(ctx, rule, W - 140, 12.5).slice(0, 2)
      for (let i = 0; i < lines.length; i++) {
        text.stroked(ctx, lines[i], W / 2, H - 74 + i * 17,
          { size: 12.5, align: 'center', color: sel.rule ? '#cfe0ff' : '#8b93a6', weight: 'normal', lw: 3 })
      }
      text.stroked(ctx, sel.evidence, W / 2, H - 34,
        { size: 11.5, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
    }
    // 页码（列表会越来越长，必须让玩家知道还有下一页）
    if (L.pages > 1) {
      text.stroked(ctx, `第 ${L.page + 1}/${L.pages} 页　Q/E 翻页`, W / 2, H - 96,
        { size: 12, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
    }
    text.stroked(ctx, '官方原文：完成这些小游戏会得到 金币 / 彩晶石 / 声望，以及 智慧 · 勇气 · 魅力',
      W / 2, H - 12, { size: 11.5, align: 'center', color: '#8ef0c0', weight: 'normal', lw: 3 })
  }

  G.ui = G.ui || {}
  Object.assign(G.ui, { MINI_PANEL, miniLayout, miniRects, drawMinigames })
})()
