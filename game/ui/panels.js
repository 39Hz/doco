/* 多克多比 · 界面层：原版风格面板 / 名牌 / 条形（第 72 轮重构 · 批次 3）
   —— 只负责"画"：读参数、写 canvas；不碰存档、不做业务判定。
   依赖：内核 `G.core.ctx`（画布）+ 引擎 `window.DKDbb`（util / text / art 绘制原语）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const { ctx } = G.core
  const { util, text, art } = window.DKDbb

  // 圆角矩形路径。原来它是 drawBattle 里的局部 const(barRound)，
  // 而 drawSealUI 定义在 drawBattle 外面，直接调用会 ReferenceError —— 所以提到模块级共用。
  function roundBox(x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y); ctx.lineTo(x + w, y + r)
    ctx.lineTo(x + w, y + h - r); ctx.lineTo(x + w - r, y + h)
    ctx.lineTo(x + r, y + h); ctx.lineTo(x, y + h - r)
    ctx.lineTo(x, y + r); ctx.closePath()
  }

  function drawBar(x, y, w, h, cur, max, color, label) {
    ctx.fillStyle = 'rgba(6,10,18,.85)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4)
    ctx.fillStyle = '#1b2334'; ctx.fillRect(x, y, w, h)
    ctx.fillStyle = color; ctx.fillRect(x, y, w * util.clamp(cur / max, 0, 1), h)
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1)
    if (label) text.stroked(ctx, label, x + 2, y - 5, { size: 12, weight: 'normal', lw: 3 })
  }

  // ==================== 原版风格面板（第 51 轮）====================
  //
  // 【为什么要抽出来】用户要求"界面尽量还原页游"，后面**人物面板 / 技能面板 / 背包**
  // 都要照原版画。原版那些面板是同一套画法：**浅色底 + 浅蓝描边 + 圆角 + 顶部高光**。
  // 写一次、各处复用，才不会出现"战斗界面学原版、背包界面还是旧暗色"这种分叉。
  //
  // 色值来自原版截图逐像素取样（`_tools/probe-battle-bar.mjs`）：
  //   技能格内部 `#bcbac7`→`#ced5e8`（浅银灰渐变）、描边 `#afbfcf`（浅蓝）、
  //   深蓝面板底 `#0c3635`~`#1d2f6e`、白底消息框 `#cdd3e1`、橙色方钮 `#f07a1b`。
  function drawOrigPanel(x, y, w, h, o) {
    o = o || {}
    const r = o.r === undefined ? 8 : o.r
    const top = o.top || '#ced5e8'
    const bot = o.bot || '#bcbac7'
    const edge = o.edge || '#afbfcf'
    ctx.save()
    // 底：竖向渐变（原版面板有从亮到暗的过渡，不是平涂）
    const g = ctx.createLinearGradient(0, y, 0, y + h)
    g.addColorStop(0, top); g.addColorStop(1, bot)
    ctx.fillStyle = g
    roundBox(x, y, w, h, r); ctx.fill()
    // 顶部高光（原版每块面板都有一条亮边）
    ctx.fillStyle = 'rgba(255,255,255,.5)'
    ctx.fillRect(x + r * 0.6, y + 1.5, w - r * 1.2, 2)
    // 浅蓝描边
    ctx.strokeStyle = edge; ctx.lineWidth = 2
    roundBox(x + 1, y + 1, w - 2, h - 2, r); ctx.stroke()
    ctx.restore()
  }

  // 原版橙色小方钮（底部左侧那三个：返回 / 菜单 / 说话）
  function drawOrigBtn(x, y, s, glyph) {
    ctx.save()
    const g = ctx.createLinearGradient(0, y, 0, y + s)
    g.addColorStop(0, '#ffb04a'); g.addColorStop(1, '#e8701c')
    ctx.fillStyle = g
    roundBox(x, y, s, s, 5); ctx.fill()
    ctx.strokeStyle = '#8a3e08'; ctx.lineWidth = 2
    roundBox(x + 1, y + 1, s - 2, s - 2, 4); ctx.stroke()
    text.stroked(ctx, glyph, x + s / 2, y + s * 0.68, { size: s * 0.5, align: 'center', color: '#fff6dc', lw: 3 })
    ctx.restore()
  }

  //
  // 【为什么要单独一个函数】用户要求「战斗画风尽量还原页游」。
  // 原版（归档 `战斗截图.jpg`，962×546，与本作画布 960×540 几乎 1:1）实测：
  //   · 左上角一块**亮黄板 `#fff18b`**，上面压着**红字**名字 `#e33300`；
  //   · 黄板右边接一个**深蓝信息框**，里面是 **HP 条 `#7598c0`（蓝灰，不是红！）**
  //     与 **MP 条 `#2c95fe`（亮蓝）**，每条都带 `当前/上限` 数字；
  //   · 名牌整体位于 y 16~71（即画面上沿 3%~13%），玩家在左、敌方在右。
  // 【为什么不能沿用旧写法】旧代码用暗色块 + 红血条，玩家在战斗里**根本没有名牌**
  //   （名字只出现在探索界面的队伍卡里）—— 那是"我们的设计"，不是原版。
  // 所有尺寸按原版比例（乘以 W/962）缩放，所以换画布也不会走形。
  function drawBattleNameplate(o) {
    const av = o.big ? 40 : 34                      // 头像边长
    const plateH = av + 14
    const boxW = o.big ? 188 : 170                  // 名字 + 两条的宽度
    const x = o.align === 'right' ? o.x - (av + 6 + boxW) : o.x
    const y = o.y
    ctx.save()

    // ---- 头像（深色底 + 细描边；有图就画图，没图用属性色方块兜底）----
    ctx.fillStyle = 'rgba(10,18,34,.92)'
    ctx.fillRect(x, y, av, plateH)
    ctx.fillStyle = '#0d1c34'
    ctx.fillRect(x + 4, y + 4, av - 8, av - 8)
    if (o.img && art.ready(o.img)) {
      const iw = Math.round((av - 8) * (o.img.naturalWidth / o.img.naturalHeight))
      ctx.drawImage(o.img, x + 4 + ((av - 8) - iw) / 2, y + 4, iw, av - 8)
    } else {
      // 取不到素材就退化成属性色方块 —— 绝不画一个空白框（这仓库栽过"素材没加载就画空框"）
      ctx.fillStyle = o.fallback || '#888'
      ctx.fillRect(x + 4, y + 4, av - 8, av - 8)
    }
    ctx.strokeStyle = o.dead ? '#6b7891' : '#7fb6e0'; ctx.lineWidth = 1.5
    ctx.strokeRect(x + .75, y + .75, av - 1.5, plateH - 1.5)

    // ---- 名字（浅色小字压在条上方；**不再是"红字压金板"**）----
    const bx = x + av + 6
    const maxNameW = boxW - 10
    let nameSize = o.big ? 13.5 : 12.5
    const label = (o.level ? 'Lv.' + o.level + ' ' : '') + String(o.name || '')
    const estW = label.length * nameSize
    if (estW > maxNameW) nameSize = Math.max(9, nameSize * (maxNameW / estW))
    text.stroked(ctx, label, bx + maxNameW, y + 12,
      { size: nameSize, align: 'right', color: o.dead ? '#6b7891' : '#e8eefc', lw: 3 })

    // ---- 两条：HP **红**、MP **蓝**（与左上角队伍卡同一套配色，全局一致）----
    const barX = bx, barW = boxW - 6
    const barH = 9
    const hpY = y + 16, mpY = hpY + barH + 4
    const bar = (by, cur, max, back, fill, edge) => {
      ctx.fillStyle = back; ctx.fillRect(barX, by, barW, barH)
      const frac = util.clamp((cur || 0) / Math.max(1, max || 1), 0, 1)
      if (frac > 0) { ctx.fillStyle = fill; ctx.fillRect(barX + 1, by + 1, (barW - 2) * frac, barH - 2) }
      ctx.strokeStyle = edge; ctx.lineWidth = 1
      ctx.strokeRect(barX + .5, by + .5, barW - 1, barH - 1)
      text.stroked(ctx, `${Math.max(0, Math.round(cur || 0))}/${Math.round(max || 0)}`,
        barX + barW - 3, by + barH - 1, { size: 9.5, align: 'right', color: '#fff', lw: 2.5 })
    }
    bar(hpY, o.hp, o.maxHp, '#3a0d10', '#e8453c', '#ff8a80')
    bar(mpY, o.mp, o.maxMp, '#0e2438', '#3a9bff', '#9fd0ff')
    if (o.dead) text.stroked(ctx, '已倒下', bx + barW / 2, hpY + 8, { size: 12, align: 'center', color: '#ff8a8a', lw: 3 })
    ctx.restore()
  }

  // 向约定的出口注册（批次 3 第一批：界面层只画 + 收输入）
  G.ui = G.ui || {}
  Object.assign(G.ui, { roundBox, drawBar, drawOrigPanel, drawOrigBtn, drawBattleNameplate })
})()