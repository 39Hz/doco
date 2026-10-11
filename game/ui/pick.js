/* 多克多比 · 界面层：选形态界面（第 72 轮重构 · 批次 8 · 界面绘制）
   来源：原 game/game.js 的 drawPick 整段（开局选多比形态）。
   —— **只画不裁决**：不读存档、不改状态（选中项读 S.pickSel）。
   依赖：内核 G.core（S / ctx / W / H）+ 引擎 window.DKDbb（util / anim / text）
        + 内容表 window.DKDbbData（D）+ 同层 G.ui（drawArtPortrait）。
   只经 G.ui 出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const D = window.DKDbbData
  const { util, anim, text } = window.DKDbb
  const { S, ctx, W, H } = G.core
  const { drawArtPortrait } = G.ui

  function drawPick() {
    ctx.fillStyle = '#070b14'; ctx.fillRect(0, 0, W, H)
    const g = ctx.createRadialGradient(W / 2, 180, 40, W / 2, 260, 560)
    g.addColorStop(0, 'rgba(67,217,200,.15)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    text.stroked(ctx, '选择你的多比', W / 2, 62, { size: 30, align: 'center', color: '#ffd23f', lw: 8 })
    text.stroked(ctx, '← → 切换　空格 确定', W / 2, 90, { size: 13, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })

    const CW = 196
    D.FORMS.forEach((f, i) => {
      const cx = W / 2 + (i - (D.FORMS.length - 1) / 2) * (CW + 18)
      const sel = i === S.pickSel
      const top = 130, hh = 300
      ctx.fillStyle = sel ? 'rgba(255,210,63,.16)' : 'rgba(18,24,40,.85)'
      ctx.fillRect(cx - CW / 2, top, CW, hh)
      ctx.strokeStyle = sel ? '#ffd23f' : 'rgba(255,255,255,.16)'; ctx.lineWidth = sel ? 3 : 1
      ctx.strokeRect(cx - CW / 2 + .5, top + .5, CW - 1, hh - 1)
      // 角色立绘（官方立绘，不是借来的帧）
      if (!drawArtPortrait(cx, top + 232, sel ? 210 : 190, f, true)) {
        const entry = anim.get(f.spriteDir, f.actionIdle)
        if (entry) util.drawSprite(ctx, anim.getFrame(entry, 0), cx, top + 220, sel ? 200 : 180)
      }
      const col = D.ELEMENT_COLOR[f.element] || '#ccc'
      text.stroked(ctx, f.name, cx, top + 22, { size: 18, align: 'center', color: sel ? '#ffe45e' : '#e8eefc' })
      text.stroked(ctx, f.element + '属性', cx, top + 42, { size: 12, align: 'center', color: col, lw: 3 })
      const st = D.statsAtLevel(f.stats, 1)
      const rows = [['生命', st.life], ['攻击', st.atk], ['魔攻', st.matk], ['防御', st.def], ['命中', st.hit], ['速度', st.spd]]
      rows.forEach((r, k) => {
        text.stroked(ctx, r[0], cx - CW / 2 + 12, top + 246 + k * 17, { size: 11.5, weight: 'normal', lw: 3, color: '#9fb0cc' })
        text.stroked(ctx, String(r[1]), cx + CW / 2 - 12, top + 246 + k * 17, { size: 11.5, weight: 'normal', lw: 3, align: 'right', color: '#d8fff8' })
      })
    })
    const f = D.FORMS[S.pickSel]
    if (f) {
      ctx.fillStyle = 'rgba(8,12,22,.88)'; ctx.fillRect(80, H - 78, W - 160, 54)
      ctx.strokeStyle = '#43d9c8'; ctx.lineWidth = 1; ctx.strokeRect(80.5, H - 77.5, W - 161, 53)
      text.stroked(ctx, f.desc, W / 2, H - 54, { size: 14, align: 'center', weight: 'normal', lw: 3, color: '#d8fff8' })
      text.stroked(ctx, '技能：' + f.skills.join('、'), W / 2, H - 32, { size: 12, align: 'center', weight: 'normal', lw: 3, color: '#9fb0cc' })
    }
  }

  G.ui = G.ui || {}
  Object.assign(G.ui, { drawPick })
})()
