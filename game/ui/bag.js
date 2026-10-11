/* 多克多比 · 界面层：背包（多比面板）/ 多比属性面板 / 索亚（第 72 轮重构 · 批次 7 · ui 收尾）
   —— 三个面板的布局与绘制：背包变身、角色属性十维、索亚图鉴与出战，外加战斗里画索亚。
   读内核共享状态 S（bagSel / statSel / soyaSel 等）与内容表 D，写 canvas；
   不碰存档、不做业务判定（已拥有形态 / 昵称 / 等级与生命魔法 / 索亚经 G.app.player 的窄只读取值取）。
   依赖：内核 `G.core`（S / ctx / W / H）+ 引擎 `window.DKDbb`（util / text / anim / art）
        + 内容表 `window.DKDbbData`（D）+ 同层 `G.ui`（drawBar，来自 panels.js）
        + 应用层 G.app（player 窄接口 / rename.displayNameOf 与绘法桥 drawArtPortrait）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const { S, ctx, W, H } = G.core
  const { util, text, anim, art } = window.DKDbb
  const D = window.DKDbbData
  const { drawBar } = G.ui

  // 应用层惰性桥（ui 先于 app 加载，故调用时才解析）。
  const activeSoya = (...a) => G.app.player.activeSoya(...a)
  const ownedFormNames = (...a) => G.app.player.ownedFormNames(...a)
  const playerName = (...a) => G.app.player.playerName(...a)
  const playerVitals = (...a) => G.app.player.playerVitals(...a)
  const soyaOwned = (...a) => G.app.player.soyaOwned(...a)
  const soyaActiveId = (...a) => G.app.player.soyaActiveId(...a)
  const displayNameOf = (...a) => G.app.rename.displayNameOf(...a)
  // 仍在 game.js 的绘法与常量（本批未迁）：经 G.app 惰性取用。
  const drawArtPortrait = (...a) => G.ui.drawArtPortrait(...a)
  const getSoYaHop = () => G.app.getSoYaHop()

  // ==================== 索亚（陪伴宠物）====================
  //
  // 原版的第二个核心系统：索亚站在主人身边，一起打。
  // 数据来自图鉴4.3 + 索亚介绍.xlsx（见 _tools/gen-soya.mjs），
  // 战斗机制按官方设定文案写（钢爪/静电/守护/尖刺/粘人/全力），数值是 derived。
  const SOYA = {
    panel: { x: 60, y: 74, w: 424, h: 420 },
    grid: { x: 500, y: 74, w: 400, h: 420, cols: 3, rows: 2, cw: 116, chh: 150, gx: 12, gy: 14 },
  }
  const soyaCache = new Map()
  function soyaImage(sy) {
    if (!sy || !sy.art) return null
    if (!soyaCache.has(sy.art)) { const im = new Image(); im.src = sy.art; soyaCache.set(sy.art, im) }
    const im = soyaCache.get(sy.art)
    return (im.complete && im.naturalWidth) ? im : null
  }
  function soyaLayout() {
    const all = D.SOYA || []
    const g = SOYA.grid
    const gw = g.cols * g.cw + (g.cols - 1) * g.gx
    const gx0 = g.x + (g.w - gw) / 2
    const gy0 = g.y + 66
    const rects = all.map((sy, i) => ({
      sy, idx: i,
      x: gx0 + (i % g.cols) * (g.cw + g.gx),
      y: gy0 + Math.floor(i / g.cols) * (g.chh + g.gy),
      w: g.cw, h: g.chh,
    }))
    return { all, rects }
  }

  function drawSoyaPanel() {
    ctx.fillStyle = '#0a1020'; ctx.fillRect(0, 0, W, H)
    const g0 = ctx.createRadialGradient(W / 2, 260, 60, W / 2, 320, 660)
    g0.addColorStop(0, 'rgba(255,200,120,.12)'); g0.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g0; ctx.fillRect(0, 0, W, H)

    const L = soyaLayout()
    const sel = L.all[util.clamp(S.soyaSel || 0, 0, Math.max(0, L.all.length - 1))]
    const owned = soyaOwned() || []

    // 左侧竖排标题条
    {
      const t = BAG.tab
      bagPanel(t.x, t.y, t.w, t.h, 10)
      ctx.fillStyle = '#c98a2a'; ctx.fillRect(t.x + 4, t.y + 4, t.w - 8, t.h - 8)
      const word = '索　亚'
      for (let i = 0; i < word.length; i++) {
        text.stroked(ctx, word[i], t.x + t.w / 2, t.y + 42 + i * 36,
          { size: 19, align: 'center', color: '#ffffff', lw: 2 })
      }
    }

    // 左：立绘 + 官方设定
    const P = SOYA.panel
    bagPanel(P.x, P.y, P.w, P.h)
    if (sel) {
      const img = soyaImage(sel)
      if (img) {
        const ih = 180, iw = Math.round(ih * (img.naturalWidth / img.naturalHeight))
        ctx.drawImage(img, P.x + (P.w - iw) / 2, P.y + 18, iw, ih)
      }
      text.stroked(ctx, sel.name, P.x + P.w / 2, P.y + 222, { size: 18, align: 'center', color: '#1c4b7a', lw: 0 })
      const own = owned.includes(sel.id)
      const act = soyaActiveId() === sel.id
      // 机制说明
      text.stroked(ctx, `战斗机制：${sel.effectLabel}`, P.x + 24, P.y + 252,
        { size: 13, color: '#c0392b', lw: 0 })
      const lines = text.wrap(ctx, sel.effectText || '', P.w - 48, 11.5)
      lines.slice(0, 2).forEach((ln, i) => {
        text.stroked(ctx, ln, P.x + 24, P.y + 272 + i * 17,
          { size: 11.5, weight: 'normal', color: '#3b6ea5', lw: 0 })
      })
      // 官方设定文案
      text.stroked(ctx, '官方设定', P.x + 24, P.y + 318, { size: 13, color: '#1c4b7a', lw: 0 })
      const dl = text.wrap(ctx, sel.desc || '', P.w - 48, 11)
      dl.slice(0, 4).forEach((ln, i) => {
        text.stroked(ctx, ln, P.x + 24, P.y + 338 + i * 16,
          { size: 11, weight: 'normal', color: '#4d5a75', lw: 0 })
      })
      const tag = act ? '出战中' : own ? '已拥有（空格设为出战）' : '尚未获得'
      text.stroked(ctx, tag, P.x + P.w / 2, P.y + P.h - 14,
        { size: 12.5, align: 'center', lw: 2, color: act ? '#1f9d43' : own ? '#c98a2a' : '#7b8aa8' })
    }

    // 右：可选的索亚格子
    const G2 = SOYA.grid
    bagPanel(G2.x, G2.y, G2.w, G2.h)
    ctx.fillStyle = '#c98a2a'; ctx.fillRect(G2.x + 12, G2.y + 12, G2.w - 24, 34)
    text.stroked(ctx, '索亚图鉴', G2.x + G2.w / 2, G2.y + 36, { size: 16, align: 'center', color: '#ffffff', lw: 2 })
    for (const r of L.rects) {
      const sy = r.sy
      const own = owned.includes(sy.id)
      const act = soyaActiveId() === sy.id
      const cur = r.idx === util.clamp(S.soyaSel || 0, 0, L.all.length - 1)
      ctx.fillStyle = own ? '#ffffff' : '#e8eef5'
      ctx.fillRect(r.x, r.y, r.w, r.h)
      ctx.strokeStyle = act ? '#ff9c2a' : cur ? '#ffd23f' : '#7fb6e0'
      ctx.lineWidth = act || cur ? 3 : 2
      ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3)
      const img = soyaImage(sy)
      if (img) {
        const ih = 96, iw = Math.round(ih * (img.naturalWidth / img.naturalHeight))
        ctx.save()
        if (!own) ctx.globalAlpha = 0.35
        ctx.drawImage(img, r.x + (r.w - iw) / 2, r.y + 10, iw, ih)
        ctx.restore()
      }
      text.stroked(ctx, own ? sy.name.replace(/[（(].*?[)）]/g, '') : '？？？',
        r.x + r.w / 2, r.y + r.h - 20, { size: 12, align: 'center', color: own ? '#1c4b7a' : '#8fa0b5', lw: 0 })
      text.stroked(ctx, own ? sy.effectLabel : '未获得', r.x + r.w / 2, r.y + r.h - 6,
        { size: 10.5, align: 'center', color: own ? '#c0392b' : '#a8b6c6', lw: 0 })
      if (act) {
        ctx.fillStyle = '#ff7a2a'
        ctx.fillRect(r.x + r.w - 50, r.y + 2, 48, 17)
        text.stroked(ctx, '出战中', r.x + r.w - 26, r.y + 15,
          { size: 10, align: 'center', color: '#ffffff', lw: 2 })
      }
    }

    text.stroked(ctx, '索亚 · 陪伴宠物', W / 2, 44, { size: 24, align: 'center', color: '#ffd23f', lw: 8 })
    text.stroked(ctx, `已拥有 ${owned.length} / ${L.all.length}　↑↓←→ 或鼠标选择　空格 设为出战　P/Esc 返回`,
      W / 2, 66, { size: 12.5, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
    text.stroked(ctx, '索亚会站在你身边一起战斗，每只的战斗机制不同（数据来自官方图鉴与索亚介绍表）',
      W / 2, H - 12, { size: 11.5, align: 'center', color: '#63718f', weight: 'normal', lw: 3 })
  }

  // 战斗中：索亚的站位（主人右侧）
  // ⚠️ 第 55 轮修：旧值 `P_POS.y + 26` 会把索亚踩到**操作栏里面**去（见 P_POS 处注释）。
  //    现在改成"比主人略靠前一点"（+14）—— 既有前后层次，又完整落在场地内。
  function soyaPos() {
    return { x: G.app.battleGeom.P_POS.x + 96, y: G.app.battleGeom.P_POS.y + 14 }
  }
  // 战斗中画索亚
  function drawSoyaInBattle(t) {
    const sy = activeSoya()
    if (!sy) return
    const img = soyaImage(sy)
    if (!img) return
    const p = soyaPos()
    const breathe = Math.sin(t * 3.1) * 0.03
    const hopV = getSoYaHop()
    const hop = hopV > 0 ? Math.abs(Math.sin(hopV * Math.PI)) * 18 : 0
    const ih = 96 * (1 + breathe)
    const iw = Math.round(ih * (img.naturalWidth / img.naturalHeight))
    ctx.save()
    ctx.globalAlpha = 0.3
    ctx.fillStyle = '#0d1c30'
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, iw * 0.34, iw * 0.12, 0, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
    // 朝向（第 55 轮）：索亚必须**和主人同向**（主人朝右打怪，宠物不能朝左）。
    // 原来这里是裸的 `ctx.drawImage` —— 连翻转开关都没有，所以宠物永远按素材原始方向站，
    // 和主人的朝向各走各的。现在与主人共用 `PET_FACE_RIGHT` 一个开关。
    if (G.app.battleGeom.PET_FACE_RIGHT) {
      ctx.save()
      ctx.translate(p.x + iw / 2, p.y - ih - hop)
      ctx.scale(-1, 1)
      ctx.drawImage(img, 0, 0, iw, ih)
      ctx.restore()
    } else {
      ctx.drawImage(img, p.x - iw / 2, p.y - ih - hop, iw, ih)
    }
    text.stroked(ctx, sy.name.replace(/[（(].*?[)）]/g, ''), p.x, p.y + 20,
      { size: 11, align: 'center', color: '#ffd9a0', lw: 3 })
  }

  // ==================== 背包（多比面板）====================
  //
  // 版式照**官方原版截图**（素材里一直躺着 `图片资源/游戏截图/多比面板.jpg`，
  // 之前几轮我都是凭记忆猜，这次直接对着它做）：
  //
  //   ┌「多克多比」竖排标题条 ┬────────────────────┬──────────────────┐
  //   │                      │ ◆ 昵称             │  类别 ▼          │
  //   │                      │ ┌────┐ 形态名        ├──────────────────┤
  //   │                      │ │头像│ 昵称          │ [头][头][头]      │
  //   │                      │ └────┘ 等级          │ [头][头][头]      │
  //   │                      │ 经验 ▓▓▓▓░░ 3460/…  │ [头][头][头]      │
  //   │                      │ 生命 ▓▓▓▓▓▓ 2133/…  │ [头][头][头]      │
  //   │                      │ 魔法 ▓▓▓▓░░ 339/347 │  ◀ 1/2 ▶         │
  //   │                      │ 攻击 357  防御 130  │                  │
  //   │                      │ 魔攻 275  魔防 32   │                  │
  //   │                      │ 命中 357  暴击 39   │                  │
  //   │                      │ 回避 352  速度 137  │                  │
  //   └──────────────────────┴────────────────────┴──────────────────┘
  //
  // 关键点：栏目标题是「类别」而不是「形态」，右侧是**头像格子**（原版就是头像不是全身图），
  // 当前使用的那只角上挂一个「使用中」标签。
  const BAG = {
    tab: { x: 14, y: 156, w: 34, h: 190 },                 // 左侧竖排标题条
    panel: { x: 60, y: 74, w: 424, h: 420 },               // 左：信息面板
    gridPanel: { x: 500, y: 74, w: 400, h: 420 },          // 右：类别面板
    grid: { cols: 3, rows: 4, cw: 112, chh: 84, gx: 12, gy: 12 },
  }
  function bagLayout() {
    const owned = D.FORMS.filter((f) => ownedFormNames().includes(f.name))
    const g = BAG.grid
    const perPage = g.cols * g.rows
    const pages = Math.max(1, Math.ceil(Math.max(1, owned.length) / perPage))
    const page = util.clamp(S.bagPage || 0, 0, pages - 1)
    const start = page * perPage
    const slice = owned.slice(start, start + perPage)
    // 网格在右面板里居中
    const gw = g.cols * g.cw + (g.cols - 1) * g.gx
    const gh = g.rows * g.chh + (g.rows - 1) * g.gy
    const gx0 = BAG.gridPanel.x + (BAG.gridPanel.w - gw) / 2
    const gy0 = BAG.gridPanel.y + 66
    const rects = []
    for (let i = 0; i < perPage; i++) {
      const r = Math.floor(i / g.cols), c = i % g.cols
      rects.push({
        f: slice[i] || null, idx: start + i, empty: !slice[i],
        x: gx0 + c * (g.cw + g.gx), y: gy0 + r * (g.chh + g.gy),
        w: g.cw, h: g.chh,
      })
    }
    return { owned, slice, rects, pages, page, perPage, perRow: g.cols, panel: BAG.panel, grid: g, gw, gh }
  }
  // 命中测试：只认"有形态"的格子
  function bagHitTest(mx, my) {
    const L = bagLayout()
    for (const r of L.rects) {
      if (r.empty) continue
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) return r.idx
    }
    return -1
  }
  // 分页箭头（左右各一个），绘制与命中都用这一份坐标
  function bagPagerRects(L) {
    const y = BAG.gridPanel.y + BAG.gridPanel.h - 34
    const cx = BAG.gridPanel.x + BAG.gridPanel.w / 2
    return {
      prev: { x: cx - 90, y: y - 14, w: 34, h: 28 },
      next: { x: cx + 56, y: y - 14, w: 34, h: 28 },
      labelX: cx + 14, labelY: y + 6,
    }
  }

  // 原版那种"奶白面板 + 蓝色描边 + 圆角"
  function bagPanel(x, y, w, h, r = 14) {
    const round = (px, py, pw, ph, pr) => {
      ctx.beginPath()
      ctx.moveTo(px + pr, py)
      ctx.lineTo(px + pw - pr, py); ctx.lineTo(px + pw, py + pr)
      ctx.lineTo(px + pw, py + ph - pr); ctx.lineTo(px + pw - pr, py + ph)
      ctx.lineTo(px + pr, py + ph); ctx.lineTo(px, py + ph - pr)
      ctx.lineTo(px, py + pr); ctx.closePath()
    }
    ctx.save()
    ctx.fillStyle = '#f2f8ff'
    round(x, y, w, h, r); ctx.fill()
    ctx.strokeStyle = '#3aa0e8'; ctx.lineWidth = 4
    round(x + 2, y + 2, w - 4, h - 4, r - 1); ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5
    round(x + 5.5, y + 5.5, w - 11, h - 11, r - 3); ctx.stroke()
    ctx.restore()
  }
  // 官方那种"带描边的进度条"：外框深色 + 内部填充 + 右侧数值
  function bagBar(x, y, w, h, cur, max, color, label, valText) {
    text.stroked(ctx, label, x, y + h - 1, { size: 12.5, color: '#1c4b7a', lw: 0 })
    const bx = x + 46, bw = w - 46
    ctx.fillStyle = '#1b3a5c'; ctx.fillRect(bx, y, bw, h)
    ctx.fillStyle = '#0d2440'; ctx.fillRect(bx + 2, y + 2, bw - 4, h - 4)
    ctx.fillStyle = color
    ctx.fillRect(bx + 2, y + 2, (bw - 4) * util.clamp(cur / Math.max(1, max), 0, 1), h - 4)
    ctx.strokeStyle = '#3aa0e8'; ctx.lineWidth = 1.5; ctx.strokeRect(bx + .75, y + .75, bw - 1.5, h - 1.5)
    if (valText) text.stroked(ctx, valText, bx + bw / 2, y + h - 4, { size: 11, align: 'center', color: '#ffffff', lw: 2 })
  }

  function drawBag() {
    ctx.fillStyle = '#0a1020'; ctx.fillRect(0, 0, W, H)
    const bgGrad = ctx.createRadialGradient(W / 2, 260, 60, W / 2, 320, 660)
    bgGrad.addColorStop(0, 'rgba(90,170,255,.12)'); bgGrad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H)

    const L = bagLayout()
    const sel = L.owned[util.clamp(S.bagSel || 0, 0, Math.max(0, L.owned.length - 1))] || L.owned[0]

    // ---------- 左侧竖排标题条「多克多比」----------（原版就是竖着写在左边）
    {
      const t = BAG.tab
      bagPanel(t.x, t.y, t.w, t.h, 10)
      ctx.fillStyle = '#2b7ec9'
      ctx.fillRect(t.x + 4, t.y + 4, t.w - 8, t.h - 8)
      const word = '多克多比'
      for (let i = 0; i < word.length; i++) {
        text.stroked(ctx, word[i], t.x + t.w / 2, t.y + 34 + i * 32,
          { size: 19, align: 'center', color: '#ffffff', lw: 2 })
      }
    }

    // ---------- 左：信息面板 ----------
    const P = L.panel
    bagPanel(P.x, P.y, P.w, P.h)

    if (sel) {
      const fx = P.x + 20, fy = P.y + 24
      // 顶部：元素菱形 + 昵称
      ctx.fillStyle = D.ELEMENT_COLOR[sel.element] || '#888'
      ctx.beginPath()
      ctx.moveTo(fx + 9, fy - 9); ctx.lineTo(fx + 18, fy); ctx.lineTo(fx + 9, fy + 9); ctx.lineTo(fx, fy)
      ctx.closePath(); ctx.fill()
      ctx.strokeStyle = '#2b7ec9'; ctx.lineWidth = 1.5; ctx.stroke()
      text.stroked(ctx, playerName() || '多比', fx + 28, fy + 5,
        { size: 15, color: '#1c4b7a', lw: 0 })

      // 头像框（官方这里是**头像**，不是全身立绘）
      const px = fx, py = fy + 22, psz = 92
      ctx.fillStyle = '#ffffff'; ctx.fillRect(px, py, psz, psz)
      ctx.strokeStyle = '#c8a24a'; ctx.lineWidth = 3; ctx.strokeRect(px + 1.5, py + 1.5, psz - 3, psz - 3)
      const icon = art.icon(sel)
      if (art.ready(icon)) {
        const iw = Math.round(psz * 0.94 * (icon.naturalWidth / icon.naturalHeight))
        ctx.drawImage(icon, px + (psz - iw) / 2, py + 3, iw, psz - 6)
      }
      // 头像右侧三行
      const tx = px + psz + 14
      text.stroked(ctx, sel.name, tx, py + 20, { size: 15, color: '#1c4b7a', lw: 0 })
      text.stroked(ctx, '昵称：' + (playerName() || '多比'), tx, py + 46,
        { size: 13, color: '#3b6ea5', lw: 0 })
      text.stroked(ctx, '等级：' + playerVitals().level, tx, py + 72, { size: 13, color: '#3b6ea5', lw: 0 })

      // 三条进度条：经验 / 生命 / 魔法
      const st = D.statsAtLevel(sel.stats, playerVitals().level)
      const sv = playerVitals()
      const cur = sel.name === S.form.name
      const needExp = D.expToNext(sv.level)
      const bx = fx, bw = P.w - 40
      let by = py + psz + 16
      const shownHp = cur ? sv.hp : st.life
      const shownMp = cur ? sv.mp : st.mp
      bagBar(bx, by, bw, 16, sv.exp, needExp, '#ffd24a', '经验', `${sv.exp}/${needExp}`); by += 26
      bagBar(bx, by, bw, 16, shownHp, st.life, '#ff6b4a', '生命', `${Math.round(shownHp)}/${st.life}`); by += 26
      bagBar(bx, by, bw, 16, shownMp, st.mp, '#4aa8ff', '魔法', `${Math.round(shownMp)}/${st.mp}`); by += 30

      // 八项数值，两列四行
      const rows = [
        ['攻击', st.atk, '防御', st.def],
        ['魔攻', st.matk, '魔防', st.mdef],
        ['命中', st.hit, '暴击', st.crit + '%'],
        ['回避', st.eva, '速度', st.spd],
      ]
      const colW = (P.w - 40) / 2
      rows.forEach((r, i) => {
        const y = by + i * 26
        text.stroked(ctx, r[0] + '：', bx, y, { size: 13, color: '#3b6ea5', lw: 0 })
        text.stroked(ctx, String(r[1]), bx + 46, y, { size: 13.5, color: '#12283f', lw: 0 })
        text.stroked(ctx, r[2] + '：', bx + colW, y, { size: 13, color: '#3b6ea5', lw: 0 })
        text.stroked(ctx, String(r[3]), bx + colW + 50, y, { size: 13.5, color: '#12283f', lw: 0 })
      })
    }

    // ---------- 右：类别面板 ----------
    const GP = BAG.gridPanel
    bagPanel(GP.x, GP.y, GP.w, GP.h)
    // 标题「类别 ▼」
    ctx.fillStyle = '#2b7ec9'
    ctx.fillRect(GP.x + 12, GP.y + 12, GP.w - 24, 34)
    text.stroked(ctx, '类别', GP.x + GP.w / 2 - 14, GP.y + 36, { size: 16, align: 'center', color: '#ffffff', lw: 2 })
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(GP.x + GP.w - 44, GP.y + 26)
    ctx.lineTo(GP.x + GP.w - 28, GP.y + 26)
    ctx.lineTo(GP.x + GP.w - 36, GP.y + 36)
    ctx.closePath(); ctx.fill()

    // 头像格子
    for (const r of L.rects) {
      if (r.empty) {
        ctx.fillStyle = 'rgba(200,220,240,.5)'
        ctx.fillRect(r.x, r.y, r.w, r.h)
        ctx.strokeStyle = '#a9cbe8'; ctx.lineWidth = 2
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)
        continue
      }
      const active = r.f.name === S.form.name
      const hovered = S.bagHover === r.idx
      ctx.fillStyle = hovered ? '#e2f1ff' : '#ffffff'
      ctx.fillRect(r.x, r.y, r.w, r.h)
      ctx.strokeStyle = active ? '#ff9c2a' : hovered ? '#43d9c8' : '#7fb6e0'
      ctx.lineWidth = active || hovered ? 3 : 2
      ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3)
      const ic = art.icon(r.f)
      if (art.ready(ic)) {
        const ih = r.h - 20, iw = Math.round(ih * (ic.naturalWidth / ic.naturalHeight))
        ctx.drawImage(ic, r.x + (r.w - iw) / 2, r.y + 8, iw, ih)
      } else {
        ctx.fillStyle = D.ELEMENT_COLOR[r.f.element] || '#888'
        ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + r.h / 2, 16, 0, Math.PI * 2); ctx.fill()
      }
      if (active) {
        // 原版右上角挂一个「使用中」小标签
        const bw2 = 46, bh2 = 17
        ctx.fillStyle = '#ff7a2a'
        ctx.fillRect(r.x + r.w - bw2 - 2, r.y + 2, bw2, bh2)
        text.stroked(ctx, '使用中', r.x + r.w - bw2 / 2 - 2, r.y + 15,
          { size: 10, align: 'center', color: '#ffffff', lw: 2 })
      }
      if (r.idx === util.clamp(S.bagSel || 0, 0, Math.max(0, L.owned.length - 1)) && !active) {
        // 光标所在的格子加一圈虚线感（用亮色细框表示）
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2
        ctx.strokeRect(r.x + 3.5, r.y + 3.5, r.w - 7, r.h - 7)
      }
    }

    // 分页：◀ 1/N ▶
    const pg = bagPagerRects(L)
    const drawArrow = (rect2, dir) => {
      const can = L.pages > 1
      ctx.fillStyle = can ? '#2b7ec9' : '#a9cbe8'
      ctx.fillRect(rect2.x, rect2.y, rect2.w, rect2.h)
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      const cx2 = rect2.x + rect2.w / 2, cy2 = rect2.y + rect2.h / 2
      ctx.moveTo(cx2 + dir * 6, cy2 - 7)
      ctx.lineTo(cx2 + dir * 6, cy2 + 7)
      ctx.lineTo(cx2 - dir * 5, cy2)
      ctx.closePath(); ctx.fill()
    }
    // 注意方向：drawArrow 里 dir=+1 才是朝左的三角（早先传反了，左键画成右键）
    drawArrow(pg.prev, 1)
    drawArrow(pg.next, -1)
    text.stroked(ctx, `${L.page + 1}/${L.pages}`, pg.labelX, pg.labelY,
      { size: 14, align: 'center', color: '#1c4b7a', lw: 0 })

    // ---------- 顶部标题与操作提示 ----------
    text.stroked(ctx, '多比面板 · 变身', W / 2, 44, { size: 24, align: 'center', color: '#ffd23f', lw: 8 })
    // ★ 第 66 轮（用户要求）：分母只算**有模型立绘**的形态。
    //   原来写的是 D.FORMS.length（52）—— 而其中 24 只按新规则根本不可获得，
    //   玩家集齐所有能拿的会看到"28 / 52 种"，以为还有 24 只没拿到，其实永远拿不到。
    const artAll = D.FORMS.filter((f) => (typeof D.formHasArt === 'function' ? D.formHasArt(f) : !!f.art))
    text.stroked(ctx, `已拥有 ${L.owned.length} / ${artAll.length} 种（另有 ${D.FORMS.length - artAll.length} 只暂无立绘、不开放）　↑↓←→ 或鼠标选择　空格/点击 变身　B/Esc 返回`,
      W / 2, 66, { size: 12.5, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
    const locked = artAll.filter((f) => !ownedFormNames().includes(f.name))
    if (locked.length) {
      text.stroked(ctx, `还有 ${locked.length} 种没拿到：击败各岛怪物有几率掉落（同元素更容易掉）`,
        W / 2, H - 12, { size: 11.5, align: 'center', color: '#63718f', weight: 'normal', lw: 3 })
    }
  }

  // 属性面板的十维属性顺序（左列 6 项、右列 5 项）。
  // 注意：这一行在替换背包代码块时被误删过一次，导致 drawStats 直接抛
  // "STAT_ROWS is not defined" —— 界面全挂。拼装代码块后一定要跑一遍测试。
  const STAT_ROWS = [
    ['生命', 'life'], ['魔力', 'mp'], ['攻击', 'atk'], ['防御', 'def'], ['魔攻', 'matk'], ['魔防', 'mdef'],
    ['命中', 'hit'], ['回避', 'eva'], ['暴击', 'crit'], ['免爆', 'acrit'], ['速度', 'spd'],
  ]

  // 属性面板的按钮坐标 —— **绘制与点击共用**（第 55 轮：用户要求"局内所有东西都能左键点击"）。
  // 原来这个面板只有键盘（←→ 切形态、C/Esc 返回），鼠标点了没反应。
  function statsButtons() {
    return {
      prev: { x: 24, y: 96, w: 30, h: 420 },          // 左缘竖条：上一只
      next: { x: W - 54, y: 96, w: 30, h: 420 },      // 右缘竖条：下一只
      close: { x: W - 44, y: 20, w: 28, h: 28 },      // 右上角 ✕
    }
  }
  function statsButtonHit(mx, my) {
    const B = statsButtons()
    for (const k of ['close', 'prev', 'next']) {
      const r = B[k]
      if (mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h) return k
    }
    return null
  }

  function drawStats() {    ctx.fillStyle = '#070d1a'; ctx.fillRect(0, 0, W, H)
    const g = ctx.createRadialGradient(W / 2, 180, 40, W / 2, 300, 620)
    g.addColorStop(0, 'rgba(67,217,200,.13)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)

    const list = D.FORMS.filter((f) => ownedFormNames().includes(f.name))
    const sel = util.clamp(S.statSel || 0, 0, Math.max(0, list.length - 1))
    const f = list[sel]
    if (!f) { text.stroked(ctx, '还没有可获得形态', W / 2, H / 2, { size: 20, align: 'center' }); return }
    text.stroked(ctx, '角色属性', W / 2, 46, { size: 28, align: 'center', color: '#ffd23f', lw: 8 })
    text.stroked(ctx, `←→ 切换形态（${sel + 1}/${list.length}）　R 起名字　C/Esc 返回`, W / 2, 72,
      { size: 12.5, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })

    // 可点击的箭头与关闭钮（第 55 轮）—— 这个面板原来只有键盘，鼠标点了没反应
    {
      const B = statsButtons()
      const HOV = S.statBtnHover
      const drawArrow = (r, dir, hot) => {
        ctx.fillStyle = hot ? 'rgba(255,210,63,.22)' : 'rgba(18,24,40,.80)'
        ctx.fillRect(r.x, r.y, r.w, r.h)
        ctx.strokeStyle = hot ? '#ffd23f' : 'rgba(255,255,255,.18)'; ctx.lineWidth = hot ? 2 : 1
        ctx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1)
        const cx2 = r.x + r.w / 2, cy2 = r.y + r.h / 2
        ctx.strokeStyle = hot ? '#ffe45e' : '#cfd6e4'; ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(cx2 + dir * 5, cy2 - 12); ctx.lineTo(cx2 - dir * 5, cy2); ctx.lineTo(cx2 + dir * 5, cy2 + 12)
        ctx.stroke()
        text.stroked(ctx, dir < 0 ? '上一只' : '下一只', cx2, r.y + 20,
          { size: 11, align: 'center', color: hot ? '#ffe45e' : '#8fa0c0', lw: 3, weight: 'normal' })
      }
      drawArrow(B.prev, -1, HOV === 'prev')
      drawArrow(B.next, 1, HOV === 'next')
      ctx.fillStyle = HOV === 'close' ? 'rgba(255,90,90,.28)' : 'rgba(18,24,40,.85)'
      ctx.fillRect(B.close.x, B.close.y, B.close.w, B.close.h)
      ctx.strokeStyle = HOV === 'close' ? '#ff8a8a' : 'rgba(255,255,255,.25)'; ctx.lineWidth = 2
      ctx.strokeRect(B.close.x + .5, B.close.y + .5, B.close.w - 1, B.close.h - 1)
      text.stroked(ctx, '✕', B.close.x + B.close.w / 2, B.close.y + B.close.h / 2 + 6,
        { size: 16, align: 'center', color: HOV === 'close' ? '#ffd0d0' : '#cfd6e4', lw: 2 })
    }

    // ---- 左侧：立绘 + 基本信息 ----
    // 版式（自上而下，行高固定，互不重叠）：
    //   96..124  名字
    //   124..152 属性/等级
    //   152..384 立绘（底部 384）
    //   384..404 「当前使用中」
    //   408..440 描述（两行）
    //   444..492 生命/能量/经验三条
    const LX = 60, LW = 300
    const LP = { y: 96, h: 420 }
    ctx.fillStyle = 'rgba(18,24,40,.88)'
    ctx.fillRect(LX, LP.y, LW, LP.h)
    ctx.strokeStyle = D.ELEMENT_COLOR[f.element] || '#888'; ctx.lineWidth = 2
    ctx.strokeRect(LX + 1, LP.y + 1, LW - 2, LP.h - 2)

    if (!drawArtPortrait(LX + LW / 2, 384, 232, f, true)) {
      const e = anim.get(f.spriteDir, f.actionIdle)
      if (e) util.drawSprite(ctx, anim.getFrame(e, 0), LX + LW / 2, 384, 220)
    }
    text.stroked(ctx, displayNameOf(f.name), LX + LW / 2, 122, { size: 20, align: 'center', color: '#ffe45e' })
    // 起了昵称就再标一行形态本名，免得忘了换的是哪只
    if (displayNameOf(f.name) !== f.name) {
      text.stroked(ctx, `形态：${f.name}`, LX + LW / 2, 137,
        { size: 11, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
    }
    text.stroked(ctx, `${f.element}属性　Lv.${playerVitals().level}`, LX + LW / 2, 146,
      { size: 13, align: 'center', color: D.ELEMENT_COLOR[f.element] || '#ccc', lw: 3 })

    const sv = playerVitals()
    const cur = f.name === S.form.name
    text.stroked(ctx, cur ? '当前使用中' : '背包中（未装备）', LX + LW / 2, 400,
      { size: 12.5, align: 'center', color: cur ? '#5ee06a' : '#7b8aa8', lw: 3 })
    // 描述：放在立绘下面，不再压在人物身上
    const descLines = text.wrap(ctx, f.desc || '（无描述）', LW - 32, 12)
    descLines.slice(0, 2).forEach((ln, i) => {
      text.stroked(ctx, ln, LX + LW / 2, 420 + i * 17,
        { size: 11.5, align: 'center', weight: 'normal', lw: 3, color: '#9fb0cc' })
    })
    if (cur) {
      drawBar(LX + 20, 456, LW - 40, 12, sv.hp, sv.maxHp, '#5ee06a', `生命 ${sv.hp}/${sv.maxHp}`)
      drawBar(LX + 20, 484, LW - 40, 11, sv.mp, sv.maxMp, '#5aa8ff', `能量 ${sv.mp}/${sv.maxMp}`)
      const need = D.expToNext(sv.level)
      // 放在面板底边之上留 10px，早先贴到 512 会被边框切掉字底
      text.stroked(ctx, `EXP ${sv.exp} / ${need}`, LX + LW / 2, 508,
        { size: 11, align: 'center', weight: 'normal', lw: 3, color: '#43d9c8' })
    }

    // ---- 右侧：十维属性 ----
    const RX = 390, RW = W - RX - 60
    ctx.fillStyle = 'rgba(18,24,40,.88)'
    ctx.fillRect(RX, 96, RW, 300)
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1
    ctx.strokeRect(RX + .5, 96.5, RW - 1, 299)
    text.stroked(ctx, '十维战斗属性', RX + 16, 122, { size: 15, color: '#43d9c8' })

    const st = D.statsAtLevel(f.stats, sv.level)
    // 找同等级下的最大值，用于画相对条
    const all = list.map((x) => D.statsAtLevel(x.stats, sv.level))
    const colW = (RW - 40) / 2
    STAT_ROWS.forEach((row, i) => {
      const [label, key] = row
      const col = Math.floor(i / 6), r = i % 6
      const x = RX + 20 + col * colW
      const y = 148 + r * 40
      const v = st[key]
      const maxV = Math.max(...all.map((a) => a[key])) || 1
      const isCur = f.name === S.form.name
      text.stroked(ctx, label, x, y, { size: 12, weight: 'normal', lw: 3, color: '#cfd6e4' })
      text.stroked(ctx, String(v), x + colW - 30, y, { size: 14, align: 'right', color: '#ffe45e', lw: 3 })
      // 相对条
      const bw = colW - 40
      ctx.fillStyle = '#1b2334'; ctx.fillRect(x, y + 8, bw, 7)
      ctx.fillStyle = D.ELEMENT_COLOR[f.element] || '#43d9c8'
      ctx.fillRect(x, y + 8, bw * util.clamp(v / maxV, 0, 1), 7)
      ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.strokeRect(x + .5, y + 8.5, bw - 1, 6)
    })

    // ---- 技能与专属技能 ----
    // 一列 3 个、两列共 6 个；专属技能单独一行放在最下面，两者不再叠在一起
    ctx.fillStyle = 'rgba(18,24,40,.88)'
    ctx.fillRect(RX, 408, RW, 130)
    ctx.strokeStyle = 'rgba(255,255,255,.18)'
    ctx.strokeRect(RX + .5, 408.5, RW - 1, 129)
    text.stroked(ctx, `技能（${f.skillSlots || 5} 槽）`, RX + 16, 430, { size: 14, color: '#43d9c8' })
    const skills = (f.skills || []).slice(0, f.skillSlots || 5)
    const colW2 = (RW - 40) / 2
    skills.forEach((s, i) => {
      const sk = D.SKILLS[s] || {}
      const col = Math.floor(i / 3), r = i % 3
      const x = RX + 18 + col * colW2
      const y = 454 + r * 20
      text.stroked(ctx, s, x, y, { size: 12, weight: 'normal', lw: 3, color: '#e8eefc' })
      text.stroked(ctx, `CD${sk.cd || 1} 耗能${sk.energy || 0} ${['单体', '范围', '群体'][sk.range || 0] || ''}`,
        x + colW2 - 22, y, { size: 10.5, weight: 'normal', lw: 3, align: 'right', color: '#7b8aa8' })
    })
    // 专属技能：名字在左，说明右对齐在同一行内。
    // 这里不调测量接口（引擎里没有），按 11px 字号的可用宽度折算成字数上限。
    if (f.skill && f.skill.name) {
      const y = 522
      text.stroked(ctx, `专属技能　${f.skill.name}`, RX + 18, y, { size: 12, color: '#ffd23f', lw: 3 })
      const room = Math.floor((RW - 156) / 11)
      const d = (f.skill.desc || '').slice(0, Math.max(6, room))
      text.stroked(ctx, d, RX + RW - 18, y, { size: 11, align: 'right', weight: 'normal', lw: 3, color: '#9fb0cc' })
    }

    // 底部说明：不再把内部术语（derived / 七维换算）摊给玩家看，
    // 换成一句人话；七维仍然保留在括号里，方便对着策划表核对。
    const srcNote = /原表/.test(f.statSource || '')
      ? '数值取自原版策划表'
      : '数值由原版七维属性换算'
    text.stroked(ctx, `${srcNote}　七维：力${f.attrs ? f.attrs.pow : '?'} 敏${f.attrs ? f.attrs.agi : '?'} 体${f.attrs ? f.attrs.vit : '?'} 技${f.attrs ? f.attrs.dex : '?'} 魔${f.attrs ? f.attrs.mag : '?'} 幸${f.attrs ? f.attrs.luk : '?'} 精${f.attrs ? f.attrs.spi : '?'}`,
      W / 2, H - 16, { size: 11, align: 'center', weight: 'normal', lw: 3, color: '#4d5a75' })
  }

  // 向约定的出口注册（批次 7 · ui 收尾：界面层只画 + 布局）
  G.ui = G.ui || {}
  Object.assign(G.ui, { SOYA, soyaImage, soyaLayout, soyaPos, drawSoyaPanel, drawSoyaInBattle,
    BAG, bagLayout, bagHitTest, bagPagerRects, bagPanel, bagBar, drawBag,
    STAT_ROWS, statsButtons, statsButtonHit, drawStats })
})()