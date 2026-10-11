/* 多克多比 · 界面层：珍宝小屋绘制（第 72 轮重构 · 批次 8 · 界面绘制）
   来源：原 game/game.js 的 drawTreasure 整段（碎片合成页 + 珍宝兑换页）。
   —— **只画不裁决**：不直接读存档（碎片 / 白彩 / 积分经 G.app.saveData() 桥读）、不合成不购买。
   依赖：内核 G.core（ctx / W / H）+ 引擎 window.DKDbb（text）+ 内容表 window.DKDbbData（D）
        + 应用层 G.app.economy（TREASURE / TREASURE_DAILY / SHARDS_PER / crystalsToday /
          treasureList / treasureRects / treasurePageInfo）。
   挂载在 app 之后：加载期要解构 app 层的值型导出（TREASURE 等），而 ui 默认排在 app 之前。
   只经 G.ui 出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const D = window.DKDbbData
  const { text } = window.DKDbb
  const { ctx, W, H } = G.core
  const saveData = () => G.app.saveData()
  const { TREASURE, TREASURE_DAILY, SHARDS_PER, crystalsToday, treasureList,
    treasureRects, treasurePageInfo } = G.app.economy

  function drawTreasure() {
    ctx.fillStyle = '#070d1a'; ctx.fillRect(0, 0, W, H)
    const g = ctx.createRadialGradient(W / 2, 150, 40, W / 2, 300, 620)
    g.addColorStop(0, 'rgba(200,170,255,.12)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)

    text.stroked(ctx, '珍宝小屋', W / 2, 44, { size: 26, align: 'center', color: '#ffd23f', lw: 8 })
    text.stroked(ctx, 'Q/E 换页签　空格 操作　J/Esc 离开　（原版：圣多克骑士厅找肖恩普进入）',
      W / 2, 70, { size: 12.5, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })

    // 页签
    const tw = 150, th = 28, tx0 = W / 2 - tw - 6
    TREASURE.tabs.forEach((label, i) => {
      const on = TREASURE.tab === i
      const x = tx0 + i * (tw + 12)
      ctx.fillStyle = on ? 'rgba(255,210,63,.2)' : 'rgba(18,24,40,.8)'
      ctx.fillRect(x, 86, tw, th)
      ctx.strokeStyle = on ? '#ffd23f' : 'rgba(255,255,255,.18)'; ctx.lineWidth = on ? 2 : 1
      ctx.strokeRect(x + .5, 86.5, tw - 1, th - 1)
      text.stroked(ctx, label, x + tw / 2, 105, { size: 13.5, align: 'center', color: on ? '#ffe45e' : '#cfd6e4', lw: 3 })
    })

    // 资源条
    const s = saveData()
    text.stroked(ctx, `白色彩晶石碎片 ${s.shards || 0}`, 40, 132, { size: 13, color: '#cfd6e4', weight: 'normal', lw: 3 })
    text.stroked(ctx, `白色彩晶石 ${s.white || 0}`, 250, 132, { size: 13, color: '#ffffff', weight: 'normal', lw: 3 })
    text.stroked(ctx, `积分 ${s.points || 0}`, 430, 132, { size: 13, color: '#8ef0c0', weight: 'normal', lw: 3 })
    text.stroked(ctx, `今日已合成 ${crystalsToday()} / ${TREASURE_DAILY()}`, W - 40, 132,
      { size: 13, align: 'right', color: '#ffd23f', weight: 'normal', lw: 3 })

    if (TREASURE.tab === 0) {
      // ---- 碎片合成 ----
      const need = SHARDS_PER(), left = TREASURE_DAILY() - crystalsToday(), can = left > 0 && (s.shards || 0) >= need
      const bx = W / 2 - 230, by = 210, bw = 460, bh = 120
      ctx.fillStyle = 'rgba(18,24,40,.85)'; ctx.fillRect(bx, by, bw, bh)
      ctx.strokeStyle = can ? '#5ee06a' : 'rgba(255,255,255,.18)'; ctx.lineWidth = can ? 2 : 1
      ctx.strokeRect(bx + .5, by + .5, bw - 1, bh - 1)
      text.stroked(ctx, `${need} 块碎片 → 1 块白色彩晶石`, W / 2, by + 34,
        { size: 19, align: 'center', color: can ? '#8ef0c0' : '#7c8aa5', lw: 4 })
      text.stroked(ctx, `现在有 ${s.shards || 0} 块碎片`, W / 2, by + 62,
        { size: 14, align: 'center', color: '#cfd6e4', weight: 'normal', lw: 3 })
      text.stroked(ctx, left > 0 ? `今天还能合成 ${left} 块（空格 合成）` : '今天已经合成满了，明天再来',
        W / 2, by + 92, { size: 14, align: 'center', color: left > 0 ? '#ffd23f' : '#ff8a8a', lw: 3 })

      text.stroked(ctx, '碎片来源（官方原文）：维西岛的精英怪 · 副本的BOSS · 野外BOSS',
        W / 2, 372, { size: 12.5, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
      text.stroked(ctx, '「每个玩家每天最多只能合成 5 块白色彩晶石」—— 原文 7k7k/177905',
        W / 2, 396, { size: 12, align: 'center', color: '#8ef0c0', weight: 'normal', lw: 3 })
      // 自定部分必须写明
      text.stroked(ctx, '几块碎片合一块原文未给 → 本实现取 3 块（推算 derived）',
        W / 2, 424, { size: 11.5, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
    } else {
      // ---- 珍宝兑换（第 52 轮起**分页**：加了 30 多种多比形态后一共 40+ 件，一屏放不下）----
      const list = treasureList()
      const rects = treasureRects(list)
      const pi = treasurePageInfo()
      for (let i = 0; i < list.length; i++) {
        const it = list[i], r = rects[i]
        const sel = TREASURE.sel === i
        const afford = (s.white || 0) >= it.white
        ctx.fillStyle = sel ? 'rgba(255,210,63,.16)' : (it.kind === 'form' ? 'rgba(30,22,48,.82)' : 'rgba(18,24,40,.8)')
        ctx.fillRect(r.x, r.y, r.w, r.h)
        ctx.strokeStyle = sel ? '#ffd23f' : (it.kind === 'form' ? 'rgba(200,107,216,.35)' : 'rgba(255,255,255,.14)')
        ctx.lineWidth = sel ? 2 : 1
        ctx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1)
        text.stroked(ctx, it.name, r.x + 12, r.y + 25, { size: 14.5, lw: 3, color: sel ? '#ffe45e' : '#e8eefc' })
        text.stroked(ctx, it.cat, r.x + 250, r.y + 25, { size: 12, color: '#9fb0cc', weight: 'normal', lw: 3 })
        text.stroked(ctx, `${it.white} 白彩`, r.x + r.w - 12, r.y + 25,
          { size: 13, align: 'right', color: afford ? '#8ef0c0' : '#ff8a8a', lw: 3 })
      }
      if (!list.length) {
        text.stroked(ctx, '货架空了（索亚都买齐了、道具也买完了）', W / 2, 240,
          { size: 16, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
      }
      // 页码（多页时才显示；只有一页不占地方）
      if (pi.pages > 1) {
        text.stroked(ctx, `第 ${pi.page + 1} / ${pi.pages} 页　共 ${pi.total} 件　Q/E 翻页`,
          W / 2, 428, { size: 13, align: 'center', color: '#ffd23f', lw: 3 })
      }
      let y = H - 88
      text.stroked(ctx, '官方原文点名可买：稀有多比技能 · 珍稀索亚；大类含 道具 / 战斗道具 / 技能 / 服饰',
        W / 2, y, { size: 12, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
      y += 20
      for (const u of D.TREASURE_UNAVAILABLE) {
        text.stroked(ctx, `${u.cat}：${u.reason}`, W / 2, y,
          { size: 11.5, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
        y += 18
      }
      text.stroked(ctx, '每消费 1 白色彩晶石自动获得 1 积分（原文 7k7k/528376）',
        W / 2, H - 22, { size: 12, align: 'center', color: '#8ef0c0', weight: 'normal', lw: 3 })
    }
  }

  G.ui = G.ui || {}
  Object.assign(G.ui, { drawTreasure })
})()
