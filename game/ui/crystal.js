/* 多克多比 · 界面层：晶石对战界面（第 72 轮重构 · 批次 7 · ui 收尾）
   来源：原 `game/game.js` 的「晶石对战（第 57 轮）」里的版式与绘制（含原注释）。
   —— 只负责"算坐标 + 画"：读内核（ctx / W / H）与内容表 D，写 canvas；
      不碰存档、不做战斗判定（对战局面经 `G.app.crystal.current()` 取，只读不写）。
   依赖：内核 `G.core`（ctx / W / H）+ 引擎 `window.DKDbb`（text）
        + 内容表 `window.DKDbbData`（D）+ 应用层 `G.app.crystal`（只读桥 current）。
   只经 `G.ui` 出口对外，`game.js` 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const { ctx, W, H } = G.core
  const { text } = window.DKDbb
  const D = window.DKDbbData

  // 应用层桥（惰性箭头：调用时才解析，故加载顺序无关）。
  const crystalState = () => G.app.crystal.current()

  // 棋盘在屏幕上的位置（输入与绘制共用一套坐标，避免"看到的和点到的不一致"）
  // 版式（960×560）：顶部 0..52 是副本标题栏（**不能占**，否则文字会压在一起）
  //   对手卡 58..110 · 棋盘 120..332 · 回合条/提示 350..376 · 我方卡 428..480 · 播报 520
  function crystalBoardRect() {
    const cfg = D.CRYSTAL
    const w = cfg.cols * cfg.cell + (cfg.cols - 1) * cfg.gap
    const h = cfg.rows * cfg.cell + (cfg.rows - 1) * cfg.gap
    return { x: Math.round(W / 2 - w / 2), y: 120, w, h, cell: cfg.cell, gap: cfg.gap }
  }

  // ---- 绘制 ----
  function drawCrystalStage() {
    const g = crystalState()
    if (!g) return
    const cfg = g.cfg
    // 背景
    ctx.fillStyle = '#0d1424'; ctx.fillRect(0, 0, W, H)

    // 顶部：对手 5 只（1 主将 + 4 副将）
    drawCrystalTeam(g, 'foe', 84)
    // 底部：我方 5 只
    drawCrystalTeam(g, 'mine', H - 106)

    // 棋盘
    const cr = crystalBoardRect()
    ctx.save()
    ctx.fillStyle = 'rgba(20,28,48,.92)'
    ctx.fillRect(cr.x - 8, cr.y - 8, cr.w + 16, cr.h + 16)
    ctx.strokeStyle = 'rgba(120,150,210,.45)'; ctx.lineWidth = 2
    ctx.strokeRect(cr.x - 8.5, cr.y - 8.5, cr.w + 17, cr.h + 17)
    ctx.restore()
    const step = cr.cell + cr.gap
    for (let y = 0; y < cfg.rows; y++) {
      for (let x = 0; x < cfg.cols; x++) {
        const k = g.kinds[g.grid[y][x]]
        if (!k) continue
        const px = cr.x + x * step, py = cr.y + y * step
        const sel = g.sel && g.sel.x === x && g.sel.y === y
        const cur = g.cur && g.cur.x === x && g.cur.y === y
        ctx.save()
        // 晶石：菱形 + 高光（比圆形更像"晶石"）
        ctx.beginPath()
        ctx.moveTo(px + cr.cell / 2, py + 3)
        ctx.lineTo(px + cr.cell - 3, py + cr.cell / 2)
        ctx.lineTo(px + cr.cell / 2, py + cr.cell - 3)
        ctx.lineTo(px + 3, py + cr.cell / 2)
        ctx.closePath()
        ctx.fillStyle = k.color
        ctx.fill()
        ctx.lineWidth = sel ? 3.5 : (cur ? 2.5 : 1.4)
        ctx.strokeStyle = sel ? '#fff6c2' : (cur ? '#ffd23f' : 'rgba(10,14,24,.75)')
        ctx.stroke()
        ctx.beginPath()
        ctx.ellipse(px + cr.cell * 0.36, py + cr.cell * 0.34, cr.cell * 0.11, cr.cell * 0.075, 0, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,.62)'; ctx.fill()
        ctx.restore()
      }
    }

    // 回合 / 进度条 —— 放在**棋盘下方**那片空当里。
    // （第一版画在棋盘上方，正好压住对手的卡片，截图核对时一眼就看出来了。）
    const pct = Math.min(1, g.t / cfg.turnSec)
    const barY = cr.y + cr.h + 18
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(cr.x, barY, cr.w, 8)
    ctx.fillStyle = '#43d9c8'; ctx.fillRect(cr.x, barY, cr.w * pct, 8)
    ctx.restore()
    text.stroked(ctx, `回合 ${g.turn}　下一回合 ${(cfg.turnSec - g.t).toFixed(1)}s　点两块相邻的晶石交换：属性晶石给同属性多比充能，红心回血`,
      W / 2, barY + 26, { size: 12, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })

    // 飘字
    for (const f of g.floaters) {
      const list = f.side === 'mine' ? g.mine : g.foe
      const u = list[f.idx]
      if (!u) continue
      const base = crystalUnitPos(g, f.side, f.idx)
      text.stroked(ctx, f.text, base.x, base.y - 26 - (0.9 - f.life) * 18,
        { size: 15, align: 'center', color: f.color, lw: 4 })
    }

    // 播报（最近 3 条）—— 放在**最下面**，别压住我方卡片
    const logs = g.log.slice(-3)
    logs.forEach((ln, i) => {
      text.stroked(ctx, ln, 12, H - 40 + i * 14, { size: 11, color: '#8fa0c0', weight: 'normal', lw: 3 })
    })

    if (g.over) {
      ctx.save()
      ctx.fillStyle = 'rgba(4,9,20,.78)'; ctx.fillRect(0, 0, W, H)
      ctx.restore()
      text.stroked(ctx, g.win ? '胜利！' : '失败…', W / 2, H / 2 - 20,
        { size: 42, align: 'center', color: g.win ? '#ffd23f' : '#ff8a8a', lw: 10 })
      text.stroked(ctx, g.win
        ? `击败了对方全部 ${g.foe.length} 只多比（官方：击败对方全部多比即胜利）`
        : `我方 ${g.mine.length} 只多比全部被击败`,
        W / 2, H / 2 + 16, { size: 14, align: 'center', color: '#cfd6e4', weight: 'normal', lw: 4 })
      text.stroked(ctx, '空格 / 回车 继续', W / 2, H / 2 + 46,
        { size: 13, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
    }
  }

  // 一只多比的卡片位置（我方在底部一排、对手在顶部一排）
  function crystalUnitPos(g, side, idx) {
    const n = (side === 'mine' ? g.mine : g.foe).length
    const cardW = 150, gap = 12
    const total = n * cardW + (n - 1) * gap
    const x0 = W / 2 - total / 2
    return { x: x0 + idx * (cardW + gap) + cardW / 2, y: side === 'mine' ? H - 106 : 52, w: cardW }
  }

  function drawCrystalTeam(g, side, cy) {
    const list = side === 'mine' ? g.mine : g.foe
    for (let i = 0; i < list.length; i++) {
      const u = list[i]
      const p = crystalUnitPos(g, side, i)
      const dead = u.hp <= 0
      ctx.save()
      ctx.globalAlpha = dead ? 0.35 : 1
      ctx.fillStyle = 'rgba(18,24,40,.88)'
      ctx.fillRect(p.x - p.w / 2, cy - 26, p.w, 52)
      ctx.strokeStyle = u.flash > 0 ? '#ffffff' : (u.role === 'lead' ? '#ffd23f' : 'rgba(120,150,210,.45)')
      ctx.lineWidth = u.flash > 0 ? 3 : (u.role === 'lead' ? 2.2 : 1.4)
      ctx.strokeRect(p.x - p.w / 2 + .5, cy - 25.5, p.w - 1, 51)
      ctx.restore()
      // 名字 + 主将/副将（official 的两种角色）
      text.stroked(ctx, `${u.role === 'lead' ? '主将 ' : ''}${u.name}`,
        p.x - p.w / 2 + 6, cy - 12,
        { size: 11, color: u.role === 'lead' ? '#ffe45e' : '#e8eefc', lw: 3 })
      text.stroked(ctx, `${u.element || '无'}属性`, p.x + p.w / 2 - 6, cy - 12,
        { size: 10, align: 'right', color: D.ELEMENT_COLOR[u.element] || '#cfd6e4', weight: 'normal', lw: 3 })
      // 血条
      const bw = p.w - 12
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(p.x - bw / 2, cy - 4, bw, 7)
      ctx.fillStyle = dead ? '#555' : (side === 'mine' ? '#5ee66a' : '#ff7a7a')
      ctx.fillRect(p.x - bw / 2, cy - 4, bw * Math.max(0, u.hp / u.maxHp), 7)
      ctx.restore()
      text.stroked(ctx, `${u.hp}/${u.maxHp}`, p.x, cy + 16,
        { size: 10, align: 'center', color: '#cfd6e4', weight: 'normal', lw: 3 })
      // 能量条（official：能量攒够就放技能）
      const ep = Math.min(1, u.energy / g.cfg.skillAt)
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(p.x - bw / 2, cy + 21, bw, 4)
      ctx.fillStyle = ep >= 1 ? '#ffd23f' : '#43d9c8'
      ctx.fillRect(p.x - bw / 2, cy + 21, bw * ep, 4)
      ctx.restore()
      if (ep >= 1) text.stroked(ctx, '技能就绪', p.x, cy + 38,
        { size: 9, align: 'center', color: '#ffd23f', weight: 'normal', lw: 3 })
    }
  }

  G.ui = G.ui || {}
  Object.assign(G.ui, { crystalBoardRect, drawCrystalStage })
})()