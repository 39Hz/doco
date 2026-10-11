/* 多克多比 · 界面层：场景探索（第 72 轮重构 · 批次 7）
   —— 场景里的一切"画"：小怪 / NPC / 主角 / 点击目标标记 / 左右出口 / 顶栏信息与经验条。
   读内核共享状态 S（current / player / nearby / warp 等）与内容表 D，写 canvas；
   不碰存档、不做业务判定（金币与等级经 G.app.saveData 取，角色绘法经 G.app.* 取）。
   依赖：内核 `G.core`（S / ctx / W / H / drawMonster）+ 引擎 `window.DKDbb`（util / text / anim）
        + `window.DKDbbMouse`（M）+ 内容表 `window.DKDbbData`（D）
        + 同层 `G.ui`（districtOfScene，来自 worldmap.js）
        + 应用层 G.app（scene / spawn / warreport / player 与绘法桥）。
   只经 G.ui 出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const { S, ctx, W, H, drawMonster } = G.core
  const { util, text, anim } = window.DKDbb
  const D = window.DKDbbData
  const M = window.DKDbbMouse
  const { districtOfScene } = G.ui

  // 应用层桥（惰性箭头：调用时才解析，故加载顺序无关）。
  const sceneExits = (...a) => G.app.scene.sceneExits(...a)
  const sceneExitRects = (...a) => G.app.scene.sceneExitRects(...a)
  const sceneLabel = (...a) => G.app.scene.sceneLabel(...a)
  const sceneSpawns = (...a) => G.app.spawn.sceneSpawns(...a)
  const warTasks = (...a) => G.app.warreport.warTasks(...a)
  const wornCostume = (...a) => G.app.player.wornCostume(...a)
  // 角色绘法经 G.ui 惰性取用；「战报」按钮 drawWarButton 已随界面绘制迁到 game/ui/warreport-view.js，
  // 故改走最终路径 G.ui.drawWarButton。
  const drawBackground = (...a) => G.ui.drawBackground(...a)
  const drawFigure = (...a) => G.ui.drawFigure(...a)
  const drawGroundShadow = (...a) => G.ui.drawGroundShadow(...a)
  const drawCostumeFigure = (...a) => G.ui.drawCostumeFigure(...a)
  const drawFigureWalking = (...a) => G.ui.drawFigureWalking(...a)
  const drawWarButton = (...a) => G.ui.drawWarButton(...a)
  // 存档读取经桥（ui 层不许直接读存档）：行为与原来 `save.data` 等价。
  const saveData = () => G.app.saveData()

  // 左右边缘的场景出口指示。几何来自 sceneExitRects()，与命中测试同一份。
  function drawSceneExits() {
    const rects = sceneExitRects()
    const ex = S.current ? sceneExits(S.current.id) : null
    for (const r of rects) {
      const left = r.side === 'left'
      const hovered = M.inside && M.x >= r.x && M.x <= r.x + r.w && M.y >= r.y && M.y <= r.y + r.h
      ctx.save()
      const x0 = left ? 0 : W - r.w - 20
      const g = ctx.createLinearGradient(left ? 0 : W, 0, left ? r.w + 20 : W - r.w - 20, 0)
      g.addColorStop(0, hovered ? 'rgba(255,210,63,.34)' : 'rgba(8,14,26,.72)')
      g.addColorStop(1, 'rgba(8,14,26,0)')
      ctx.fillStyle = g
      ctx.fillRect(x0, r.y, r.w + 20, r.h)
      ctx.restore()
      // 箭头
      const ax = left ? 24 : W - 24
      const cy = r.y + r.h / 2
      ctx.save()
      ctx.fillStyle = hovered ? '#ffd23f' : '#43d9c8'
      ctx.beginPath()
      const sz = 15
      if (left) { ctx.moveTo(ax - sz * 0.5, cy); ctx.lineTo(ax + sz * 0.5, cy - sz); ctx.lineTo(ax + sz * 0.5, cy + sz) }
      else { ctx.moveTo(ax + sz * 0.5, cy); ctx.lineTo(ax - sz * 0.5, cy - sz); ctx.lineTo(ax - sz * 0.5, cy + sz) }
      ctx.closePath(); ctx.fill()
      ctx.restore()
      const tx = left ? ax + 18 : ax - 18
      const align = left ? 'left' : 'right'
      text.stroked(ctx, sceneLabel(r.to), tx, cy - 6,
        { size: 13, align, color: hovered ? '#ffe45e' : '#d8fff8', lw: 4 })
      text.stroked(ctx, '点击或走到边缘', tx, cy + 12,
        { size: 11, align, color: '#9fb0cc', weight: 'normal', lw: 3 })
    }
    // 本岛内的位置（让"岛屿里场景是连着的"这件事看得见）
    if (ex && ex.total > 1) {
      text.stroked(ctx, `${ex.island.name}　本岛场景 ${ex.index + 1}/${ex.total}`, W / 2, H - 14,
        { size: 12, align: 'center', color: '#8fa0c0', weight: 'normal', lw: 3 })
    } else if (ex) {
      text.stroked(ctx, `${ex.island.name}　（此岛只有这一个场景）`, W / 2, H - 14,
        { size: 12, align: 'center', color: '#8fa0c0', weight: 'normal', lw: 3 })
    }
    // 换场景的淡入过场
    if (S.warp) {
      const k = 1 - util.clamp(S.warp.t / S.warp.dur, 0, 1)
      ctx.save()
      ctx.globalAlpha = k * 0.85
      ctx.fillStyle = '#04070e'
      ctx.fillRect(0, 0, W, H)
      ctx.restore()
    }
  }

  function drawExplore() {
    const sc = S.current
    drawBackground(sc, 0)
    // 顶栏「战报」按钮：原版就是点界面上方的战报按钮进试炼的。
    // 顺手把"有几条任务可以领"算出来，好在按钮上显示红点提示。
    S.warReadyCount = warTasks().filter((t) => t.unlocked && t.kills >= G.app.warreport.WAR_TARGET).length
    let g = ctx.createLinearGradient(0, 0, 0, 92)
    g.addColorStop(0, 'rgba(4,8,16,.78)'); g.addColorStop(1, 'rgba(4,8,16,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 92)
    g = ctx.createLinearGradient(0, H - 120, 0, H)
    g.addColorStop(0, 'rgba(4,8,16,0)'); g.addColorStop(1, 'rgba(4,8,16,.72)')
    ctx.fillStyle = g; ctx.fillRect(0, H - 120, W, 120)

    const sp = sceneSpawns(sc)
    const now = performance.now() / 1000
    for (const m of sp.monsters) {
      if (!m.alive) continue
      const hl = (S.hover && S.hover.obj === m) || (S.nearby && S.nearby.obj === m)
      // 悬停高亮：脚下画一圈金环
      if (hl) {
        ctx.save()
        ctx.strokeStyle = 'rgba(255,210,63,.95)'; ctx.lineWidth = 3
        ctx.beginPath(); ctx.ellipse(m.x, m.y + 6, 34, 13, 0, 0, Math.PI * 2); ctx.stroke()
        ctx.strokeStyle = 'rgba(255,210,63,.4)'; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.ellipse(m.x, m.y + 6, 46, 18, 0, 0, Math.PI * 2); ctx.stroke()
        ctx.restore()
      } else {
        ctx.save()
        ctx.beginPath(); ctx.ellipse(m.x, m.y + 5, 26, 9, 0, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill()
        ctx.restore()
      }
      // 立绘：按怪物尺寸换算显示高度；走动时上下起伏，并按朝向翻转
      const dispH = util.clamp(58 + m.mon.size * 0.55, 72, 132)
      const walkBob = m.moving ? Math.abs(Math.sin((m.walkT || 0) * 9)) * 5 : 0
      // 刷新出场：从小放到正常大小 + 一圈扩散光环，让"小怪刷新了"看得见
      let pop = 1
      if (m.spawnPop > 0) {
        pop = 1 - m.spawnPop * 0.6               // 0.5 → 0.7 倍起，逐渐长到 1
        ctx.save()
        ctx.globalAlpha = m.spawnPop * 1.2
        ctx.beginPath()
        ctx.ellipse(m.x, m.y + 4, 30 + (0.5 - m.spawnPop) * 90, 12 + (0.5 - m.spawnPop) * 34, 0, 0, Math.PI * 2)
        ctx.strokeStyle = '#8ef0c0'; ctx.lineWidth = 3
        ctx.stroke()
        ctx.restore()
      }
      ctx.save()
      if (m.facing === -1) {
        // 镜像绘制：以怪物所在位置为轴翻转
        ctx.translate(m.x, 0); ctx.scale(-1, 1); ctx.translate(-m.x, 0)
      }
      if (pop !== 1) {
        ctx.translate(m.x, m.y + 4); ctx.scale(pop, pop); ctx.translate(-m.x, -(m.y + 4))
      }
      drawMonster(m.mon, m.x, m.y + 4 - walkBob, dispH, { t: now, phase: m.bob })
      ctx.restore()
      text.stroked(ctx, `${m.mon.name} Lv.${m.level}`, m.x, m.y - dispH * 0.62 - 14, { size: 13, align: 'center' })
      if (hl) text.stroked(ctx, '⚔ 点击战斗', m.x, m.y - dispH * 0.62 - 32, { size: 12, align: 'center', color: '#ffb3b3', lw: 3 })
    }
    for (const n of sp.npcs) {
      const bob = Math.sin(performance.now() / 700 + n.bob) * 3
      const hl = (S.hover && S.hover.obj === n) || (S.nearby && S.nearby.obj === n)
      // 用真实时装立绘（见 D.npcCostumes）。取不到素材时才退回原来的圆形占位。
      const costume = n.costume
      const entry = costume ? anim.get(costume.dir, costume.action) : null
      const drew = entry ? (() => {
        const img = anim.getFrame(entry, Math.floor(performance.now() / 90) % entry.frames)
        if (!img) return false
        // 任务 NPC 画大一点，方便一眼看到
        const H2 = n.quest ? 132 : 112
        // 接地影（第 53 轮）：一屏几个人如果脚下都是空的，看着就像都浮着
        drawGroundShadow(n.x, n.y + bob + 28, H2 * 0.40, 0.26)
        ctx.save()
        if (hl) { ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 18 }
        util.drawSprite(ctx, img, n.x, n.y + bob + 28, H2)
        ctx.restore()
        return true
      })() : false
      if (!drew) {
        ctx.save()
        if (hl) { ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 20 }
        ctx.beginPath()
        ctx.ellipse(n.x, n.y + bob, n.quest ? 20 : 18, n.quest ? 26 : 24, 0, 0, Math.PI * 2)
        ctx.fillStyle = n.quest ? '#ffe9b0' : '#e8dfc8'; ctx.fill()
        ctx.lineWidth = hl ? 4 : 3
        ctx.strokeStyle = hl ? '#ffd23f' : 'rgba(20,14,8,.8)'; ctx.stroke()
        ctx.restore()
      }
      if (n.quest) text.stroked(ctx, '!', n.x, n.y + bob - 54, { size: 26, align: 'center', color: '#ffd23f', lw: 4 })
      text.stroked(ctx, n.name, n.x, n.y + bob - (n.quest ? 74 : 52), { size: 13, align: 'center' })
      if (hl) text.stroked(ctx, '◆ 点击交谈', n.x, n.y + bob - (n.quest ? 92 : 70), { size: 12, align: 'center', color: '#d8fff8', lw: 3 })
    }

    const p = S.player
    // 点击寻路的目标标记（页游那种脚下光圈）
    if (p.target && !p.target.then) {
      const tt = performance.now() / 300
      const rr = 14 + Math.sin(tt) * 3
      ctx.save()
      ctx.strokeStyle = 'rgba(255,210,63,.9)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.ellipse(p.target.x, p.target.y + 6, rr, rr * 0.4, 0, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = 'rgba(255,210,63,.45)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.ellipse(p.target.x, p.target.y + 6, rr * 1.7, rr * 0.68, 0, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }
    // 接地影改由 drawCostumeFigure 统一画（第 54 轮），这里不再重复画一个椭圆。
    // 走动时用踏步立绘（摆动/起伏），站着时用待机立绘。
    // 【第 45 轮】穿了服饰就用**服饰的官方时装帧**（正面一/二 踏步、背面一/二 背向），
    // 没穿才用形态立绘 —— 官方："购买服饰…穿在身上"（7k7k/178975），服饰就是给多克穿的外观。
    // 【第 54 轮】场景里**一律画多克**（真走路帧），不再画多比立绘 + 合成步态。
    // `drawCostumeFigure` 需要的是**朝向字符串**（'up' / 'left' / ...），
    // 而 `p.facing` 是数字 1/-1 —— 早先直接把它传进去，于是 `facing === 'left'` 永远不成立，
    // **主角朝左走时不会翻转**（一直是朝右的样子）。这里统一换算一次。
    const stepPhase = p.walkPhase || 0
    // 朝向：数字 1/-1（`drawCostumeFigure` 要的是字符串 'up'/'left'，换算一次）
    const facingDir = p.facing < 0 ? 'left' : (p.dirUp ? 'up' : 'right')
    const cw = wornCostume()
    // 记录"主角这一帧画的是什么形象"（`costume` / `walk` / `idle`）。
    // 测试要判断"没穿服饰时主角用的是战斗角色"时，靠**位置窗口**去猜是不可靠的
    //（旁边的 NPC 也用时装帧画，第一版就误报了 236 张）。这里留一个明确的信号。
    S.playerSprite = cw ? 'costume' : (p.moving ? 'walk' : 'idle')
    if (cw && drawCostumeFigure(cw, p.x, p.y + 4, 132, p.t, facingDir, stepPhase, p.moving)) {
      // ① **穿了服饰** → 用服饰的官方时装帧（正面一/二 踏步、背面一/二 背向）
    } else if (p.moving) {
      // ② 没穿服饰 → **直接用战斗角色**（当前变身的多比立绘 + 走路帧）
      //    用户第 57 轮明确："你别画图了，直接用战斗角色吧"——
      //    所以主角在场景里就是战斗里那只多比，不再用程序化画的基础多克。
      drawFigureWalking(p.x, p.y + 4, 132, p.t, p.facing, stepPhase)
    } else {
      drawGroundShadow(p.x, p.y + 4, 132 * 0.40)
      drawFigure(p.x, p.y + 4, 132, S.form.actionIdle, p.t, p.facing)
    }

    if (S.nearby) text.stroked(ctx, S.nearby.label, p.x, p.y - 100, { size: 15, color: '#ffe45e', align: 'center' })

    // 左右边缘的场景出口（同一座岛内互通）
    drawSceneExits()

    // 顶栏「战报」按钮（原版入口）
    drawWarButton()

    // 顶部信息
    const sv0 = saveData()
    text.stroked(ctx, sc.name || `场景 ${sc.id}`, 26, 42, { size: 21, color: '#ffd23f' })
    // 所属地形（官方七大地形）+ 本岛场景位置。
    // 这里**不再**列"可前往的岛屿"：那是大地图上的关联，放在场景里会和
    // 左右边缘的场景出口混淆。场景内只讲场景级的事。
    {
      const dist = districtOfScene(sc.id)
      const ex = sceneExits(sc.id)
      const head = dist ? `【${dist.name}】` : (sc.islandName ? `【${sc.islandName}】` : '')
      const tail = ex && ex.total > 1
        ? `　本岛场景 ${ex.index + 1}/${ex.total}　${ex.left != null ? '← 左可通行' : '（岛的一端）'}`
        : ''
      text.stroked(ctx, head + tail, 26, 66,
        { size: 12, color: '#5ee06a', weight: 'normal', lw: 3 })
    }
    // 快捷键提示行：右端**留出「战报」按钮的位置**（按钮从 W-100 起），否则两者会叠在一起
    text.stroked(ctx, `左键点击 移动/交互　B 背包变身　G 杂货铺（金币 ${sv0.gold}）　L 图鉴　Tab 大地图　Q 任务`,
      W - 110, 40, { size: 12.5, align: 'right', color: '#cfd6e4', weight: 'normal', lw: 3 })

    // 等级经验条
    const sv = saveData()
    const need = D.expToNext(sv.level)
    const bx = 26, by = 80, bw = 190, bh = 12
    ctx.fillStyle = 'rgba(8,12,22,.8)'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4)
    ctx.fillStyle = '#1b2334'; ctx.fillRect(bx, by, bw, bh)
    ctx.fillStyle = '#43d9c8'; ctx.fillRect(bx, by, bw * util.clamp(sv.exp / need, 0, 1), bh)
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.strokeRect(bx + .5, by + .5, bw - 1, bh - 1)
    text.stroked(ctx, `Lv.${sv.level}　EXP ${sv.exp}/${need}`, bx, by + 27, { size: 12, weight: 'normal', lw: 3, color: '#9fb0cc' })
  }

  // 向约定的出口注册（批次 7：界面层只画 + 布局）
  G.ui = G.ui || {}
  Object.assign(G.ui, { drawSceneExits, drawExplore })
})()