/* 多克多比 · 界面层：唤醒界面绘制（第 72 轮重构 · 批次 8 · 界面绘制）
   来源：原 game/game.js 的 awakenRects / ATTR_CN / drawAwaken 整段。
   —— **只画不裁决**：不直接读存档（属性经 G.app.saveData() 桥读）、不唤醒（唤在 app/awaken.js）。
   依赖：内核 G.core（ctx / W / H）+ 引擎 window.DKDbb（util / text）+ 内容表 window.DKDbbData（D）
        + 应用层 G.app.awaken（AWAKEN / AWAKEN_ROWS / awakenList / canAwaken / awakenMissing）
        + G.app.dungeon（LIST_FOOTER_TOP，列表页脚位置）。
   挂载在 app 之后：加载期要解构 app 层的值型导出（AWAKEN / LIST_FOOTER_TOP 等）。
   只经 G.ui 出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const D = window.DKDbbData
  const { util, text } = window.DKDbb
  const { ctx, W, H } = G.core
  const saveData = () => G.app.saveData()
  const { AWAKEN, AWAKEN_ROWS, awakenList, canAwaken, awakenMissing } = G.app.awaken
  const { LIST_FOOTER_TOP } = G.app.dungeon

  // 唤醒列表版式（未拥有的形态，一行一只，条件写在右侧）
  function awakenRects(list) {
    // 行高按 LIST_FOOTER_TOP 反推：y=132 起、7 行，必须留出页脚的位置
    const x = 60, w = W - 120, y = 132
    const gap = 4
    const h = Math.floor((LIST_FOOTER_TOP - y - AWAKEN_ROWS * gap) / AWAKEN_ROWS)
    return list.slice(0, AWAKEN_ROWS).map((_, i) => ({ x, y: y + i * (h + gap), w, h }))
  }
  const ATTR_CN = { brave: '勇气', wisdom: '智慧', charm: '魅力' }

  function drawAwaken() {
    ctx.fillStyle = '#070d1a'; ctx.fillRect(0, 0, W, H)
    const g = ctx.createRadialGradient(W / 2, 140, 40, W / 2, 300, 620)
    g.addColorStop(0, 'rgba(120,200,255,.13)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)

    text.stroked(ctx, '宝石大厅 · 唤醒多比', W / 2, 44, { size: 25, align: 'center', color: '#ffd23f', lw: 8 })
    text.stroked(ctx, '↑↓ 或鼠标选择　空格 唤醒　H/Esc 离开　（原版：去宝石大厅唤醒，那里写着多比的唤醒条件）',
      W / 2, 70, { size: 12.5, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })

    // 当前属性（先把列表取出来 —— 下面这一行要引用 list.length，不能在它声明前用）
    const list = awakenList()
    const a = saveData().attrs || {}
    text.stroked(ctx,
      `勇气 ${a.brave || 0}　智慧 ${a.wisdom || 0}　魅力 ${a.charm || 0}　爱心 ${a.love || 0}　声望 ${a.fame || 0}` +
      (list.length > AWAKEN_ROWS ? `　（另有 ${list.length - AWAKEN_ROWS} 只未列出）` : ''),
      W / 2, 100, { size: 14, align: 'center', color: '#8ef0c0', lw: 3 })

    if (!list.length) {
      text.stroked(ctx, '所有战斗形态都已拥有', W / 2, 280,
        { size: 18, align: 'center', color: '#ffe45e', lw: 4 })
      return
    }
    AWAKEN.sel = util.clamp(AWAKEN.sel || 0, 0, list.length - 1)
    const rects = awakenRects(list)
    for (let i = 0; i < rects.length; i++) {
      const f = list[i], r = rects[i]
      const sel = AWAKEN.sel === i
      const can = canAwaken(f)
      const awakeable = D.isAwakenable(f)
      ctx.fillStyle = sel ? 'rgba(255,210,63,.16)' : (can.ok ? 'rgba(60,180,110,.14)' : 'rgba(18,24,40,.82)')
      ctx.fillRect(r.x, r.y, r.w, r.h)
      ctx.strokeStyle = sel ? '#ffd23f' : (can.ok ? '#5ee06a' : 'rgba(255,255,255,.14)')
      ctx.lineWidth = sel || can.ok ? 2 : 1
      ctx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1)

      text.stroked(ctx, f.name.replace(/\s*多比$/, ''), r.x + 14, r.y + 21,
        { size: 16, lw: 3, color: sel ? '#ffe45e' : '#e8eefc' })
      text.stroked(ctx, `${f.element}属性`, r.x + 14, r.y + 44,
        { size: 12, color: '#43d9c8', weight: 'normal', lw: 3 })

      // 获取途径（第 52 轮）：**每一只都必须写清怎么拿到**。
      // 起因：用户看着这张面板问"这个唤醒条件在哪？这个咋唤醒？活动在哪？" ——
      // 当时 48 只只写"限定形态 · 靠活动/掉落获得"，而单机版既没有活动也没有对应掉落，
      // 等于告诉玩家"你永远拿不到"。现在按 D.formSource() 给出**真实可行**的途径。
      const src = D.formSource ? D.formSource(f) : null
      // ★ 第 66 轮（用户要求）：没有模型立绘的形态 → 明确写"暂无立绘，不开放获得"。
      //   不能藏起来不显示（玩家会以为漏了），也不能假装有途径（那是骗人）——
      //   这跟第 52 轮那句"限定形态靠活动获得"是同一类错误：**写一条玩家走不通的路**。
      if (src && src.kind === 'unavailable') {
        text.stroked(ctx, '暂无立绘 · 归档里没有这只的模型，暂不开放获得',
          r.x + 150, r.y + r.h / 2 + 5, { size: 12.5, color: '#8b93a7', weight: 'normal', lw: 3 })
      } else if (!awakeable) {
        text.stroked(ctx,
          src && src.kind === 'drop' ? `限定形态 · ${src.how}`
            : `限定形态 · 珍宝小屋用 ${src ? src.price : '?'} 块白色彩晶石兑换`,
          r.x + 150, r.y + r.h / 2 + 5, { size: 12.5, color: '#c9a86a', weight: 'normal', lw: 3 })
      } else {
        const miss = awakenMissing(f)
        let x = r.x + 150
        for (const m of miss) {
          text.stroked(ctx, `${ATTR_CN[m.attr] || m.attr} ${m.have}/${m.need}`, x, r.y + 34,
            { size: 13, color: m.ok ? '#5ee06a' : '#ff8a8a', lw: 3 })
          x += 130
        }
        text.stroked(ctx, can.ok ? '★ 可以唤醒' : '条件不足', r.x + r.w - 14, r.y + r.h / 2 + 5,
          { size: 13.5, align: 'right', color: can.ok ? '#5ee06a' : '#7c8aa5', lw: 3 })
      }
      if (sel) {
        text.stroked(ctx, can.ok ? '空格 唤醒' : can.why, r.x + r.w - 14, r.y + 13,
          { size: 11.5, align: 'right', color: can.ok ? '#ffe45e' : '#c9a86a', weight: 'normal', lw: 3 })
      }
    }
    // 条件数值来源必须写明（这是官方数值，不是我们编的）
    text.stroked(ctx, '唤醒条件（勇气/智慧/魅力）取自原版策划表「多比名称和描述」的对应列 —— 官方数值',
      W / 2, LIST_FOOTER_TOP + 18, { size: 11.5, align: 'center', color: '#8ef0c0', weight: 'normal', lw: 3 })
    // 【第 52 轮】把"怎么攒勇气/智慧/魅力"和"限定形态上哪拿"直接写在面板上。
    // 用户的原话是「这个唤醒条件在哪？这个咋唤醒？活动在哪？」—— 三问都要在这张面板上有答案。
    text.stroked(ctx, '勇气/智慧/魅力 从哪来：小游戏通关（解谜→智慧 · 潜行→勇气）与副本结算（通关给魅力/勇气）',
      W / 2, LIST_FOOTER_TOP + 34, { size: 11.5, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
    text.stroked(ctx, '限定形态怎么拿：原版靠运营活动 —— 单机版没有活动，改为①珍宝小屋白色彩晶石兑换 ②13 个副本首通必掉（按 J 进珍宝小屋）',
      W / 2, LIST_FOOTER_TOP + 50, { size: 11.5, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
  }

  G.ui = G.ui || {}
  Object.assign(G.ui, { awakenRects, ATTR_CN, drawAwaken })
})()
