/* 多克多比 · 界面层：地点列表（第 72 轮重构 · 批次 3）
   —— 点岛之后列出该岛所有地点（原版流程）。只负责"布局 + 画"：
   读内核共享状态 S（placePage / placeSel / world / scenes / current），写 canvas；
   不碰存档、不做业务判定。
   依赖：内核 `G.core`（S / ctx / W / H / bgImage）+ 引擎 `window.DKDbb`（util / text）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const { S, ctx, W, H, bgImage } = G.core
  const { util, text } = window.DKDbb

  // ==================== 地点列表（点岛之后）====================
  // 原版流程：点岛屿 → 列出该岛所有地点 → 选一个进去
  const PLACES = { top: 96, cardW: 200, cardH: 152, gapX: 14, gapY: 14, perRow: 4, rows: 2 }
  function placesLayout(ids) {
    const perPage = PLACES.perRow * PLACES.rows
    const pages = Math.max(1, Math.ceil(ids.length / perPage))
    const page = util.clamp(S.placePage || 0, 0, pages - 1)
    const start = page * perPage
    const slice = ids.slice(start, start + perPage)
    const cols = Math.min(slice.length, PLACES.perRow)
    const rowW = cols * PLACES.cardW + Math.max(0, cols - 1) * PLACES.gapX
    const x0 = W / 2 - rowW / 2
    const rects = slice.map((id, i) => ({
      id, idx: start + i,
      x: x0 + (i % PLACES.perRow) * (PLACES.cardW + PLACES.gapX),
      y: PLACES.top + Math.floor(i / PLACES.perRow) * (PLACES.cardH + PLACES.gapY),
      w: PLACES.cardW, h: PLACES.cardH,
    }))
    return { ids, slice, rects, pages, page, perRow: PLACES.perRow, perPage }
  }

  function drawPlaces() {
    ctx.fillStyle = '#070d1a'; ctx.fillRect(0, 0, W, H)
    const g = ctx.createRadialGradient(W / 2, 160, 40, W / 2, 300, 620)
    g.addColorStop(0, 'rgba(255,210,63,.13)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)

    const isl = S.world.islands[S.mapSel]
    if (!isl) { text.stroked(ctx, '岛屿数据缺失', W / 2, H / 2, { size: 20, align: 'center' }); return }
    const L = placesLayout(isl.scenes)

    text.stroked(ctx, isl.name, W / 2, 46, { size: 26, align: 'center', color: '#ffd23f', lw: 8 })
    text.stroked(ctx, `[${isl.tag}]　${isl.scenes.length} 个地点　←→↑↓ 或鼠标选择　空格 进入　Q/E 翻页　Esc 返回大地图`,
      W / 2, 74, { size: 12.5, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
    if (L.pages > 1) {
      text.stroked(ctx, `第 ${L.page + 1} / ${L.pages} 页`, W - 24, 46,
        { size: 13, align: 'right', color: '#43d9c8', lw: 3 })
    }
    // 岛描述
    text.stroked(ctx, isl.desc.slice(0, 46), W / 2, H - 26,
      { size: 11.5, align: 'center', color: '#63718f', weight: 'normal', lw: 3 })

    for (const r of L.rects) {
      const sc = S.scenes[r.id]
      const sel = r.idx === S.placeSel
      const here = S.current && S.current.id === r.id
      ctx.fillStyle = sel ? 'rgba(255,210,63,.18)' : 'rgba(18,24,40,.9)'
      ctx.fillRect(r.x, r.y, r.w, r.h)
      ctx.strokeStyle = here ? '#5ee06a' : sel ? '#ffd23f' : 'rgba(255,255,255,.16)'
      ctx.lineWidth = here || sel ? 3 : 1
      ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3)

      // 场景缩略图
      const img = bgImage(sc ? sc.file : '')
      if (img && img.complete && img.naturalWidth) {
        const tw = r.w - 8, th = Math.round(tw * 560 / 960)
        ctx.save()
        ctx.beginPath(); ctx.rect(r.x + 4, r.y + 4, tw, th); ctx.clip()
        ctx.drawImage(img, r.x + 4, r.y + 4, tw, th)
        ctx.restore()
        ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1
        ctx.strokeRect(r.x + 4.5, r.y + 4.5, tw - 1, th - 1)
      } else {
        ctx.fillStyle = '#0a0e18'
        ctx.fillRect(r.x + 4, r.y + 4, r.w - 8, 84)
      }
      text.stroked(ctx, sc ? (sc.name || `场景 ${sc.id}`).slice(0, 12) : '未知地点',
        r.x + r.w / 2, r.y + 124, { size: 13, align: 'center', color: sel ? '#ffe45e' : '#e8eefc', lw: 3 })
      text.stroked(ctx, `编号 ${r.id}`, r.x + r.w / 2, r.y + 141,
        { size: 11, align: 'center', color: '#7b8aa8', weight: 'normal', lw: 3 })
      if (here) text.stroked(ctx, '◉ 当前所在', r.x + r.w / 2, r.y + r.h - 4,
        { size: 11, align: 'center', color: '#5ee06a', lw: 3 })
      else if (sel) text.stroked(ctx, '空格 进入', r.x + r.w / 2, r.y + r.h - 4,
        { size: 11, align: 'center', color: '#43d9c8', lw: 3 })
    }
  }

  // 向约定的出口注册（批次 3：界面层只画 + 布局）
  G.ui = G.ui || {}
  Object.assign(G.ui, { placesLayout, drawPlaces })
})()