/* 多克多比 · 界面层：主菜单（标题页）的**布局与绘制**（第 72 轮重构 · 批次 7 · ui 收尾）
   来源：原 `game/game.js` 的「主菜单（标题页）」里的版式与绘制（含原注释）。
   —— 只负责"布局 + 画"：读内核共享状态 S（title）与内容表 D，写 canvas；
      不碰存档、不做业务判定（要不要显示进度 / 当前槽号等经 `G.app.title` 取）。
   依赖：内核 `G.core`（S / ctx / W / H / bgImage）+ 引擎 `window.DKDbb`（util / text）
        + 内容表 `window.DKDbbData`（D）+ 同层 `G.ui`（roundBox，来自 panels.js）
        + 应用层 `G.app.title`（只读桥）与 `G.app.dungeon`（SCENE_TOTAL）/ `G.app`（diff / drawArtPortrait）。
   只经 `G.ui` 出口对外，`game.js` 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const { S, ctx, W, H, bgImage } = G.core
  const { util, text } = window.DKDbb
  const D = window.DKDbbData
  const { roundBox } = G.ui

  // 应用层桥（惰性箭头：调用时才解析，故加载顺序无关）。
  const saveData = () => G.app.title.saveData()
  const saveSummarize = (sv) => G.app.title.summarize(sv)
  const saveSlot = () => G.app.title.currentSlot()
  const hasProgress = () => G.app.title.hasProgress()
  const SCENE_TOTAL = (...a) => G.app.dungeon.SCENE_TOTAL(...a)
  const diff = () => G.app.difficulty.diff()
  const drawArtPortrait = (...a) => G.ui.drawArtPortrait(...a)

  // ==================== 主菜单（标题页）====================
  // 原来的标题页只有一张背景图 + 一行"按空格开始新的冒险"，按下去就直接开新局，
  // 既没有主菜单也读不了档。这里改成正经的主菜单：
  //   继续冒险 / 读取存档 / 新的冒险 / 操作说明 / 关于本作
  const TITLE_ITEMS = [
    { id: 'continue', label: '继续冒险', hint: '接着上次的进度玩' },
    { id: 'load', label: '读取存档', hint: '从三个存档槽里选一个载入' },
    // 【第 54 轮】用户要的：「载入三个存档也可以选择载入保存」——
    // 载入早就能选槽了，**保存**只能自动存进当前槽，没法挑。这里补上对称的一项。
    { id: 'save', label: '保存存档', hint: '把当前进度存进指定的存档槽' },
    { id: 'new', label: '新的冒险', hint: '清空当前槽，从头开始' },
    { id: 'help', label: '操作说明', hint: '看看怎么玩' },
    { id: 'about', label: '关于本作', hint: '这是什么、素材哪来的' },
  ]
  // 没有存档时第一项就是「开始冒险」，而不是灰着的「继续冒险」——
  // 这样第一次进游戏的玩家按空格就能直接开始，不会先撞一句"存档是空的"。
  function titleItemLabel(it) {
    if (it.id === 'continue' && !hasProgress()) return '开始冒险'
    return it.label
  }

  function titleState() {
    if (!S.title) {
      S.title = { view: 'main', sel: 0, slots: null, slotsBusy: false, msg: '', confirm: false }
    }
    return S.title
  }

  // 主菜单版式（唯一实现：drawTitleMain 与测试都读它）
  function titleMenuLayout() {
    const px = 46, py = 168, pw = 330
    const itemH = 42, itemW = 250, step = 54, firstDy = 14
    const ph = 60 + TITLE_ITEMS.length * step
    return {
      px, py, pw, ph, itemW, itemH, step, count: TITLE_ITEMS.length,
      itemY: (i) => py + firstDy + i * step,
      items: () => TITLE_ITEMS.map((it, i) => ({ id: it.id, label: titleItemLabel(it), x: px, y: py + firstDy + i * step, w: itemW, h: itemH })),
    }
  }

  function drawTitle() {
    const T2 = titleState()
    // 用原版的标题背景图（素材 #21「标题画面 · 多克多比」960×760，本身带标题 LOGO）。
    const bg = bgImage('assets/scenes/scene_21.jpg')
    if (bg && bg.complete && bg.naturalWidth) {
      const r = Math.max(W / bg.naturalWidth, H / bg.naturalHeight)
      const dw = bg.naturalWidth * r, dh = bg.naturalHeight * r
      ctx.drawImage(bg, (W - dw) / 2, (H - dh) / 2, dw, dh)
    } else {
      ctx.fillStyle = '#070b14'; ctx.fillRect(0, 0, W, H)
      const g = ctx.createRadialGradient(W / 2, 200, 40, W / 2, 260, 560)
      g.addColorStop(0, 'rgba(67,217,200,.16)'); g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
      text.stroked(ctx, '多克多比', W / 2, 190, { size: 68, align: 'center', color: '#ffd23f', lw: 10 })
      text.stroked(ctx, '浮空群岛', W / 2, 240, { size: 22, align: 'center', color: '#43d9c8', lw: 6 })
    }

    if (T2.view === 'help') { drawTitleHelp(); return }
    if (T2.view === 'about') { drawTitleAbout(); return }
    if (T2.view === 'load' || T2.view === 'save' || T2.view === 'newPick') { drawTitleLoad(T2); return }
    if (T2.view === 'confirmNew') { drawTitleConfirmNew(T2); return }

    drawTitleMain(T2)
  }

  // ---- 主菜单 ----
  function drawTitleMain(T2) {
    const sv = saveData()
    const info = saveSummarize(sv)
    // 版式集中在一处（第 46 轮抽出来）：主菜单项的位置原先写死在绘制里，
    // 于是"最后一项有没有掉出画面"这种问题没有任何断言能看见。
    const TL = titleMenuLayout()
    const px = TL.px, py = TL.py, pw = TL.pw, ph = TL.ph
    ctx.save()
    const g = ctx.createLinearGradient(px, 0, px + pw, 0)
    g.addColorStop(0, 'rgba(4,9,20,.92)')
    g.addColorStop(0.82, 'rgba(4,9,20,.72)')
    g.addColorStop(1, 'rgba(4,9,20,0)')
    ctx.fillStyle = g
    ctx.fillRect(px - 12, py - 34, pw + 60, ph + 20)
    ctx.restore()
    // 顶部装饰线
    ctx.save()
    ctx.strokeStyle = 'rgba(67,217,200,.55)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(px - 12, py - 34); ctx.lineTo(px + pw + 36, py - 34); ctx.stroke()
    ctx.restore()
    text.stroked(ctx, '主菜单', px, py - 8, { size: 15, color: '#43d9c8', lw: 4 })
    const MW = 250, MH = 42
    const rects = []
    for (let i = 0; i < TITLE_ITEMS.length; i++) {
      const it = TITLE_ITEMS[i]
      const y = TL.itemY(i)
      const sel = i === T2.sel
      const disabled = it.id === 'continue' && !info
      rects.push({ i, id: it.id, x: px, y, w: MW, h: MH })
      ctx.save()
      ctx.fillStyle = sel ? 'rgba(255,210,63,.20)' : 'rgba(255,255,255,.05)'
      roundBox(px, y, MW, MH, 9); ctx.fill()
      ctx.strokeStyle = sel ? '#ffd23f' : 'rgba(255,255,255,.16)'
      ctx.lineWidth = sel ? 3 : 1.5
      roundBox(px, y, MW, MH, 9); ctx.stroke()
      ctx.restore()
      const col = disabled ? '#6b7891' : sel ? '#ffe45e' : '#e8eefc'
      text.stroked(ctx, titleItemLabel(it), px + 20, y + 27, { size: 17, color: col, lw: 4 })
      if (sel) text.stroked(ctx, it.hint, px + MW + 16, y + 27,
        { size: 12, weight: 'normal', color: '#9fb0cc', lw: 4 })
      if (it.id === 'continue' && info) {
        text.stroked(ctx, 'Lv.' + info.level, px + MW - 16, y + 27,
          { size: 13, align: 'right', color: '#5ee06a', lw: 4 })
      }
    }
    S.title.rects = rects
    S.title.mainRects = rects

    // 右下角：当前存档摘要（有进度才显示）
    if (info) {
      // 【第 52 轮修】面板原来是 276×130、`游戏时间 X 分钟　YYYY-MM-DD HH:MM` 挤在**一行**画：
      // 实测那一行宽 201px，而从 tx(=bx+112) 到画布右边只剩 188px —— 于是**右边被切掉**，
      // 连画布都出界了（切片断言 check-canvas-text 报 [772,489 201×12]，右边界 973 > 960）。
      // 这条一直是坏的，只是以前没人量过"画出去的字到底有多宽"。
      // 改成**两行**，并把面板加高到 150 容下第 6 行。
      const bx = W - 300, by = H - 196
      ctx.save()
      ctx.fillStyle = 'rgba(4,9,20,.78)'
      roundBox(bx, by, 276, 150, 12); ctx.fill()
      ctx.strokeStyle = 'rgba(67,217,200,.45)'; ctx.lineWidth = 2
      roundBox(bx, by, 276, 150, 12); ctx.stroke()
      ctx.restore()
      const x0 = bx + 16
      text.stroked(ctx, '当前存档', x0, by + 24, { size: 13, color: '#43d9c8', lw: 4 })
      text.stroked(ctx, `存档槽 ${saveSlot()}`, bx + 260, by + 24, { size: 12, align: 'right', color: '#9fb0cc', weight: 'normal', lw: 3 })
      // 形态立绘（有就画）
      if (S.form) drawArtPortrait(bx + 52, by + 118, 84, S.form)
      const tx = x0 + 96
      text.stroked(ctx, `${info.form}　Lv.${info.level}`, tx, by + 52, { size: 14, color: '#ffe45e', lw: 4 })
      text.stroked(ctx, `金币 ${info.gold}`, tx, by + 74, { size: 12.5, color: '#cfd6e4', weight: 'normal', lw: 3 })
      text.stroked(ctx, `已探索 ${info.visited}/${SCENE_TOTAL()}　索亚 ${info.soya}/6`, tx, by + 94, { size: 12.5, color: '#cfd6e4', weight: 'normal', lw: 3 })
      text.stroked(ctx, `游戏时间 ${fmtPlayTime(info.playSeconds)}`,
        tx, by + 116, { size: 11.5, color: '#8fa0c0', weight: 'normal', lw: 3 })
      text.stroked(ctx, `保存于 ${fmtSavedAt(info.savedAt)}`,
        tx, by + 134, { size: 11.5, color: '#8fa0c0', weight: 'normal', lw: 3 })
    }

    if (T2.msg) text.stroked(ctx, T2.msg, W / 2, H - 52, { size: 15, align: 'center', color: '#ffb3b3', lw: 4 })
    text.stroked(ctx, '↑↓ 选择　空格/回车 确定　鼠标可直接点击',
      W / 2, H - 22, { size: 12.5, align: 'center', color: '#cfd6e4', weight: 'normal', lw: 4 })
  }

  function fmtPlayTime(sec) {
    const s = Math.max(0, Math.floor(sec || 0))
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
    if (h > 0) return `${h} 小时 ${m} 分`
    return `${m} 分钟`
  }
  function fmtSavedAt(t) {
    if (!t) return '未保存'
    const d = new Date(t)
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }

  // ---- 读档面板 ----
  function drawTitleLoad(T2) {
    ctx.save()
    ctx.fillStyle = 'rgba(4,9,20,.86)'; ctx.fillRect(0, 0, W, H)
    ctx.restore()
    text.stroked(ctx, T2.view === 'save' ? '保存存档' : (T2.view === 'newPick' ? '新的冒险 · 选择建档位置' : '读取存档'),
      W / 2, 96, { size: 30, align: 'center', color: '#ffe45e', lw: 8 })
    text.stroked(ctx, T2.view === 'save'
      ? '选一个存档槽保存当前进度（存进别的槽不会动你正在玩的这一档）'
      : (T2.view === 'newPick'
        ? '选一个存档槽新建角色；槽里已有进度的话会再问你一次才清空'
        : '选一个存档槽载入（会覆盖当前进度，请先确认想读的那一档）'),
      W / 2, 128, { size: 12.5, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 4 })

    if (T2.slotsBusy || !T2.slots) {
      text.stroked(ctx, '正在读取存档…', W / 2, H / 2, { size: 16, align: 'center', color: '#cfd6e4', lw: 4 })
      return
    }
    const CW = 250, CH = 240, GAP = 22
    const total = T2.slots.length * CW + (T2.slots.length - 1) * GAP
    const x0 = W / 2 - total / 2
    const y0 = 168
    const rects = []
    for (let i = 0; i < T2.slots.length; i++) {
      const s = T2.slots[i]
      const x = x0 + i * (CW + GAP)
      const sel = i === T2.sel
      rects.push({ i, slot: s.slot, x, y: y0, w: CW, h: CH })
      ctx.save()
      ctx.fillStyle = s.info ? 'rgba(20,40,70,.80)' : 'rgba(255,255,255,.04)'
      roundBox(x, y0, CW, CH, 14); ctx.fill()
      ctx.strokeStyle = sel ? '#ffd23f' : s.info ? 'rgba(67,217,200,.45)' : 'rgba(255,255,255,.16)'
      ctx.lineWidth = sel ? 3 : 2
      roundBox(x, y0, CW, CH, 14); ctx.stroke()
      ctx.restore()
      text.stroked(ctx, `存档槽 ${s.slot}`, x + CW / 2, y0 + 28, { size: 16, align: 'center', color: sel ? '#ffe45e' : '#e8eefc', lw: 4 })
      if (!s.info) {
        text.stroked(ctx, '— 空 —', x + CW / 2, y0 + CH / 2 + 8, { size: 20, align: 'center', color: '#6b7891', lw: 4 })
        // 选槽新建时，空槽就是"能直接建档"的位置，明确写出来
        if (T2.view === 'newPick') text.stroked(ctx, '可以在这里新建角色', x + CW / 2, y0 + CH / 2 + 40,
          { size: 12, align: 'center', color: '#8ef0c0', weight: 'normal', lw: 3 })
        else if (s.slot === saveSlot()) text.stroked(ctx, '（当前槽）', x + CW / 2, y0 + CH - 22,
          { size: 12, align: 'center', color: '#43d9c8', weight: 'normal', lw: 3 })
        continue
      }
      const f = D.FORMS.find((ff) => ff.name === s.info.form)
      if (f) drawArtPortrait(x + CW / 2, y0 + 132, 74, f)
      text.stroked(ctx, `${s.info.form}`, x + CW / 2, y0 + 156, { size: 14, align: 'center', color: '#ffe45e', lw: 4 })
      text.stroked(ctx, `Lv.${s.info.level}　金币 ${s.info.gold}`, x + CW / 2, y0 + 178,
        { size: 12, align: 'center', color: '#cfd6e4', weight: 'normal', lw: 3 })
      text.stroked(ctx, `已探索 ${s.info.visited}/${SCENE_TOTAL()}　索亚 ${s.info.soya}/6`, x + CW / 2, y0 + 196,
        { size: 12, align: 'center', color: '#cfd6e4', weight: 'normal', lw: 3 })
      text.stroked(ctx, `${fmtSavedAt(s.info.savedAt)}`, x + CW / 2, y0 + 214,
        { size: 11, align: 'center', color: '#8fa0c0', weight: 'normal', lw: 3 })
      if (s.slot === saveSlot()) text.stroked(ctx, '当前槽', x + CW / 2, y0 + 230,
        { size: 11, align: 'center', color: '#43d9c8', weight: 'normal', lw: 3 })
      // 选槽新建时，已有进度的槽要**先说清会被清空**（不做静默覆盖）
      if (T2.view === 'newPick') text.stroked(ctx, '选它会清空这一档', x + CW / 2, s.slot === saveSlot() ? y0 + 212 : y0 + 230,
        { size: 11, align: 'center', color: '#ff9e9e', weight: 'normal', lw: 3 })
    }
    S.title.loadRects = rects
    text.stroked(ctx, '空格/回车 载入　D 删除该槽　Esc 返回',
      W / 2, H - 40, { size: 13, align: 'center', color: '#cfd6e4', weight: 'normal', lw: 4 })
  }

  // ---- 新档确认 ----
  function drawTitleConfirmNew(T2) {
    ctx.save()
    ctx.fillStyle = 'rgba(4,9,20,.88)'; ctx.fillRect(0, 0, W, H)
    ctx.restore()
    text.stroked(ctx, '开始新的冒险？', W / 2, 190, { size: 30, align: 'center', color: '#ffe45e', lw: 8 })
    // 【第 56 轮】要清的是**玩家刚选的那个槽**（T2.newSlot），不是"当前槽"——
    // 原先写的是 `save.slot()`，于是选了半天位置，提示里说的还是 1 号槽。
    const nSlot = T2.newSlot || saveSlot()
    const slotInfo = ((T2.slots || []).find((s) => s.slot === nSlot) || {}).info || null
    text.stroked(ctx, slotInfo
      ? `存档槽 ${nSlot} 里的进度会被清空（${slotInfo.form} Lv.${slotInfo.level}　已探索 ${slotInfo.visited}/${SCENE_TOTAL()}）`
      : `存档槽 ${nSlot} 是空的，可以直接开始`,
      W / 2, 232, { size: 14, align: 'center', color: slotInfo ? '#ffb3b3' : '#9fb0cc', weight: 'normal', lw: 4 })
    const items = [{ id: 'doNew', label: '确定，清空并重开' }, { id: 'cancel', label: '取消，返回主菜单' }]
    const CW = 260, CH = 46
    const x0 = W / 2 - CW / 2
    const y0 = 280
    const rects = []
    for (let i = 0; i < items.length; i++) {
      const y = y0 + i * (CH + 14)
      const sel = i === T2.sel
      rects.push({ i, id: items[i].id, x: x0, y, w: CW, h: CH })
      ctx.save()
      ctx.fillStyle = sel ? 'rgba(255,210,63,.20)' : 'rgba(255,255,255,.05)'
      roundBox(x0, y, CW, CH, 10); ctx.fill()
      ctx.strokeStyle = sel ? '#ffd23f' : 'rgba(255,255,255,.16)'
      ctx.lineWidth = sel ? 3 : 1.5
      roundBox(x0, y, CW, CH, 10); ctx.stroke()
      ctx.restore()
      const danger = items[i].id === 'doNew'
      text.stroked(ctx, items[i].label, x0 + CW / 2, y + 29,
        { size: 16, align: 'center', color: sel ? (danger ? '#ff8a8a' : '#ffe45e') : '#e8eefc', lw: 4 })
    }
    S.title.confirmRects = rects
    text.stroked(ctx, '↑↓ 选择　空格/回车 确定　Esc 返回', W / 2, H - 40,
      { size: 13, align: 'center', color: '#cfd6e4', weight: 'normal', lw: 4 })
  }

  // ---- 操作说明 ----
  // 【第 43 轮重做版式】原来是一列、行高写死 28，从 y=132 往下排。
  // 功能一路加，行数涨到 18 行时**最后 4 行已经画到屏幕外了**
  //（132 + 17×28 = 608 > 画面高 560）—— 也就是说"杂货铺 / 结印 / 全屏 / 返回"这几条
  // 玩家根本看不见。加"难度"那行时才注意到。
  // 现在改成**两列 + 行高按可用高度算**，行数再涨也不会溢出；
  // 版式同时暴露给测试（`helpLayout()`），溢出会被断言拦住。
  // 值一律写短（长解释放页脚/资料库），因为一行只有 ~230px。
  const HELP_ROWS = [
    ['移动', 'WASD / 方向键'],
    ['互动 / 确认', '空格 或 回车'],
    ['背包（变身）', 'B'],
    ['属性面板', 'C'],
    ['技能面板', 'K'],
    ['索亚（伙伴）面板', 'P'],
    ['图鉴', 'L'],
    ['任务列表', 'Q'],
    ['战报（冒险者试炼）', 'Z / 右上角按钮'],
    ['副本（官方 14 个）', 'I / NPC「拉鲁」'],
    ['珍宝小屋', 'J / NPC「肖恩普」'],
    ['服饰大楼（服饰/附魔）', 'O / 多比大街最右端的麦基'],
    ['小游戏（13 个）', 'Y / NPC「小游戏向导」'],
    ['唤醒多比（变身）', 'H / 宝石大厅「艾伦」'],
    ['恢复生命', '安宁场景的恢复 NPC'],
    ['岛屿旅行 / 大地图', 'Tab'],
    ['杂货铺', 'G'],
    ['战斗中结印', 'SP 满后 ↑↓←→'],
    ['全屏 / 静音', 'F / M'],
    // 难度那行的**当前值**在 drawTitleHelp 里实时生成（DIFFS 要等 game.js 装配后才可用，
    // 模块加载时还不能问 diff()）—— 手写数字会在调参后变成假话，所以这里只放按键名。
    ['难度（简单 / 普通）', 'N'],
    ['返回', 'Esc'],
  ]
  // 版式：两列，行高按可用高度算。测试靠它断言"不会画到屏幕外"。
  function helpLayout() {
    const rows = HELP_ROWS.length
    const perCol = Math.ceil(rows / 2)
    const top = 126, bottom = H - 84          // 底部要给页脚（难度说明 + 返回）留位置
    const lineH = Math.min(28, (bottom - top) / perCol)
    const colW = 400, gap = 40
    const x0 = W / 2 - (colW * 2 + gap) / 2
    return { rows, perCol, top, bottom, lineH, colW, gap, x0, labelW: 160, size: lineH < 22 ? 12 : 14 }
  }
  function drawTitleHelp() {
    ctx.save()
    ctx.fillStyle = 'rgba(4,9,20,.88)'; ctx.fillRect(0, 0, W, H)
    ctx.restore()
    text.stroked(ctx, '操作说明', W / 2, 84, { size: 28, align: 'center', color: '#ffe45e', lw: 8 })
    const L = helpLayout()
    HELP_ROWS.forEach(([k, v], i) => {
      const col = Math.floor(i / L.perCol)
      const row = i % L.perCol
      const cx = L.x0 + col * (L.colW + L.gap)
      const y = L.top + row * L.lineH
      text.stroked(ctx, k, cx, y, { size: L.size, color: '#43d9c8', lw: 4 })
      text.stroked(ctx, v, cx + L.labelW, y, { size: L.size, color: '#e8eefc', weight: 'normal', lw: 4 })
    })
    // 页脚：难度说明完整写在这里（那行太长，塞不进表格）
    const d = diff()
    text.stroked(ctx, `难度「${d.name}」：${d.note}`, W / 2, H - 52,
      { size: 12, align: 'center', color: '#c9a86a', weight: 'normal', lw: 4 })
    text.stroked(ctx, '空格 / Esc 返回主菜单', W / 2, H - 28,
      { size: 13, align: 'center', color: '#cfd6e4', weight: 'normal', lw: 4 })
  }

  // ---- 关于 ----
  function drawTitleAbout() {
    ctx.save()
    ctx.fillStyle = 'rgba(4,9,20,.90)'; ctx.fillRect(0, 0, W, H)
    ctx.restore()
    text.stroked(ctx, '关于本作', W / 2, 80, { size: 28, align: 'center', color: '#ffe45e', lw: 8 })
    const lines = [
      ['这是什么', '《多克多比》的离线可玩复刻版（浮空群岛），用当年客户端的素材重制。'],
      ['玩法', '变身多比、跑图打怪、做任务、集索亚伙伴；战斗是回合制，可用技能与道具。'],
      ['素材来源', '客户端归档的官方美术与策划表；技能/属性等数据取自当年 7k7k、5068 的多克多比专区。'],
      ['存档', '三个存档槽，保存在 exe 旁边的存档文件里（第 1 / 2 / 3 号槽）。'],
      ['致谢', '感谢当年做这款游戏的人，也感谢整理与分享资料的玩家。'],
    ]
    let y = 140
    for (const [k, v] of lines) {
      text.stroked(ctx, k, W / 2 - 400, y, { size: 14, color: '#43d9c8', lw: 4 })
      // 长句折行，避免超出画面
      const maxChars = 46
      let rest = v
      let first = true
      while (rest.length) {
        const piece = rest.slice(0, maxChars)
        rest = rest.slice(maxChars)
        text.stroked(ctx, piece, W / 2 - 250, y, { size: 13.5, color: '#e8eefc', weight: 'normal', lw: 4 })
        y += 24
        first = false
      }
      if (first) y += 24
      y += 6
    }
    text.stroked(ctx, '空格 / Esc 返回主菜单', W / 2, H - 34, { size: 13, align: 'center', color: '#cfd6e4', weight: 'normal', lw: 4 })
  }

  G.ui = G.ui || {}
  Object.assign(G.ui, { TITLE_ITEMS, titleItemLabel, titleState, titleMenuLayout,
    drawTitle, drawTitleMain, fmtPlayTime, fmtSavedAt, drawTitleLoad, drawTitleConfirmNew,
    HELP_ROWS, helpLayout, drawTitleHelp, drawTitleAbout })
})()