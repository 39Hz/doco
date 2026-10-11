/* 多克多比 · 界面层：技能面板（第 72 轮重构 · 批次 7 · ui 收尾）
   —— 照官方 技能面板.jpg：左栏返回钮 / 头像 / 装备技能 3×2；右栏类别 + 技能库 4×4 + 翻页。
      布局坐标（SKP / equipRectList / skillPanelLayout）与绘制共用同一份，命中测试也取自这里。
   读内核共享状态 S（skpSel / skpPage / skpEquipSel 等）与内容表 D，写 canvas；
   不碰存档、不做业务判定（昵称经 G.app.player 的窄只读取值取）。
   依赖：内核 `G.core`（S / ctx / W / H）+ 引擎 `window.DKDbb`（util / text / art）
        + 内容表 `window.DKDbbData`（D）+ 同层 `G.ui`（bagPanel / BAG，来自 bag.js）
        + 应用层 `G.app.player`（slotCount / loadoutOf / playerName）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const { S, ctx, W, H } = G.core
  const { util, text, art } = window.DKDbb
  const D = window.DKDbbData
  const { bagPanel, BAG } = G.ui

  // 应用层惰性桥（ui 先于 app 加载，故调用时才解析）。
  const slotCount = (...a) => G.app.player.slotCount(...a)
  const loadoutOf = (...a) => G.app.player.loadoutOf(...a)
  const playerName = (...a) => G.app.player.playerName(...a)

  // 打开技能面板 —— **键盘（V/K）与顶栏「技能」按钮共用这一个入口**。
  // 抽出来是因为两处各写一遍必然分叉（一边改了另一边忘），配招的初始选中格就会不一致。
  function openSkillPanel() {
    S.skpSel = 0; S.skpPage = 0; S.skpHover = -1
    // 选中格重置到第一个空槽（都满就第 0 格），避免上次的选中格越界
    const list = loadoutOf(S.form)
    const empty = list.findIndex((x, i) => i < slotCount(S.form) && !x)
    S.skpEquipSel = empty >= 0 ? empty : 0
    S.mode = 'skillpanel'
  }

  // ==================== 技能面板（照官方 技能面板.jpg）====================
  //
  // 官方结构：
  //   左边：返回圆钮 + 昵称 / 多比头像 + 形态名 / 「装备技能：」+ 3×2 技能格（末格是禁止符）
  //   右边：「类别 ▼」+ 4×4 技能库（格角写数量）+ ◀ 1/N ▶ 翻页 + 右上角 ✕
  //
  // 技能图标来自官方图鉴（assets/skills/skill_icon_<id>.png，
  // 由 _tools/build-skill-icons.mjs + build-skill-icons3.mjs 抽出，17/17 已肉眼核对）。
  const SKP = {
    left: { x: 60, y: 74, w: 420, h: 420 },
    right: { x: 500, y: 74, w: 400, h: 420 },
    equip: { cols: 3, rows: 2, size: 96, gap: 12 },
    // 格子从 80 缩到 72：原来 4 排排到 y=496，把底部的翻页按钮压住了
    lib: { cols: 4, rows: 4, size: 72, gap: 10 },
  }
  const skillIconCache = new Map()
  function skillIcon(name) {
    // 图标编号在 assets/forms.js 里，不在 D.SKILLS 里 —— 走 data.js 的惰性查询
    const file = D.skillIconFile ? D.skillIconFile(name) : null
    if (!file) return null
    if (!skillIconCache.has(file)) { const im = new Image(); im.src = file; skillIconCache.set(file, im) }
    const im = skillIconCache.get(file)
    return (im.complete && im.naturalWidth) ? im : null
  }
  // 装备格的坐标表 —— **绘制与鼠标命中测试共用同一份**（单一事实源 R12）。
  // 分开算过一次的教训：改布局时两处必然对不上。
  function equipRectList(form) {
    const E = SKP.equip, PL = SKP.left
    const egw = E.cols * E.size + (E.cols - 1) * E.gap
    const ex0 = PL.x + (PL.w - egw) / 2
    const ey0 = PL.y + 206
    const max = slotCount(form || S.form)
    const out = []
    for (let i = 0; i < E.cols * E.rows; i++) {
      const r = Math.floor(i / E.cols), c = i % E.cols
      out.push({
        i, usable: i < max,
        x: ex0 + c * (E.size + E.gap), y: ey0 + r * (E.size + E.gap),
        w: E.size, h: E.size,
      })
    }
    return out
  }
  function equipHitTest(mx, my) {
    for (const rc of equipRectList(S.form)) {
      if (mx >= rc.x && mx < rc.x + rc.w && my >= rc.y && my < rc.y + rc.h) return rc.i
    }
    return -1
  }
  function skillPanelLayout() {
    const all = Object.keys(D.SKILLS || {})
    const L = SKP.lib
    const perPage = L.cols * L.rows
    const pages = Math.max(1, Math.ceil(all.length / perPage))
    const page = util.clamp(S.skpPage || 0, 0, pages - 1)
    const gw = L.cols * L.size + (L.cols - 1) * L.gap
    const gx0 = SKP.right.x + (SKP.right.w - gw) / 2
    const gy0 = SKP.right.y + 62
    const rects = []
    for (let i = 0; i < perPage; i++) {
      const k = page * perPage + i
      const r = Math.floor(i / L.cols), c = i % L.cols
      rects.push({
        name: all[k] || null, idx: k, empty: !all[k],
        x: gx0 + c * (L.size + L.gap), y: gy0 + r * (L.size + L.gap),
        w: L.size, h: L.size,
      })
    }
    return { all, rects, pages, page, perPage, gw }
  }

  function drawSkillPanel() {
    ctx.fillStyle = '#0a1020'; ctx.fillRect(0, 0, W, H)
    const bgGrad = ctx.createRadialGradient(W / 2, 260, 60, W / 2, 320, 660)
    bgGrad.addColorStop(0, 'rgba(90,170,255,.12)'); bgGrad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H)

    const f = S.form
    const PL = SKP.left, PR = SKP.right
    bagPanel(PL.x, PL.y, PL.w, PL.h)
    bagPanel(PR.x, PR.y, PR.w, PR.h)

    // 左侧竖排标题条（与背包一致）
    {
      const t = BAG.tab
      bagPanel(t.x, t.y, t.w, t.h, 10)
      ctx.fillStyle = '#2b7ec9'; ctx.fillRect(t.x + 4, t.y + 4, t.w - 8, t.h - 8)
      const word = '多克多比'
      for (let i = 0; i < word.length; i++) {
        text.stroked(ctx, word[i], t.x + t.w / 2, t.y + 34 + i * 32,
          { size: 19, align: 'center', color: '#ffffff', lw: 2 })
      }
    }

    // ---- 左：返回圆钮 + 昵称 ----
    const bx = PL.x + 22, by = PL.y + 22
    ctx.fillStyle = '#2b7ec9'
    ctx.beginPath(); ctx.arc(bx + 16, by + 16, 16, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.arc(bx + 16, by + 16, 10, Math.PI * 0.15, Math.PI * 1.5); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(bx + 6, by + 10); ctx.lineTo(bx + 6, by + 20); ctx.lineTo(bx + 14, by + 15)
    ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill()
    text.stroked(ctx, playerName() || '多比', bx + 44, by + 22,
      { size: 14, color: '#1c4b7a', lw: 0 })

    // ---- 左：多比头像 + 形态名 ----
    const ax = PL.x + 22, ay = PL.y + 56, asz = 92
    ctx.fillStyle = '#ffffff'; ctx.fillRect(ax, ay, asz, asz)
    ctx.strokeStyle = '#c8a24a'; ctx.lineWidth = 3
    ctx.strokeRect(ax + 1.5, ay + 1.5, asz - 3, asz - 3)
    const icon = art.icon(f)
    if (art.ready(icon)) {
      const iw = Math.round(asz * 0.94 * (icon.naturalWidth / icon.naturalHeight))
      ctx.drawImage(icon, ax + (asz - iw) / 2, ay + 3, iw, asz - 6)
    }
    text.stroked(ctx, f.name, ax + asz + 14, ay + 34, { size: 15, color: '#1c4b7a', lw: 0 })
    text.stroked(ctx, `${f.element}属性`, ax + asz + 14, ay + 60,
      { size: 12.5, color: D.ELEMENT_COLOR[f.element] || '#3b6ea5', lw: 0 })

    // ---- 左：「装备技能：」+ 3×2 格子 ----
    text.stroked(ctx, '装备技能：', PL.x + 24, PL.y + 186, { size: 17, color: '#1c4b7a', lw: 0 })
    const E = SKP.equip
    const equipped = (f.skills || []).slice(0, E.cols * E.rows)
    const eqRects = equipRectList(f)
    for (let i = 0; i < E.cols * E.rows; i++) {
      const rc = eqRects[i]
      const x = rc.x, y = rc.y
      const nm = equipped[i]
      const selected = S.skpEquipSel === i
      const usable = i < slotCount(f)          // 超出槽位数的格子不可用
      ctx.fillStyle = nm ? '#ffffff' : usable ? '#dfeaf5' : '#e8eef4'
      ctx.fillRect(x, y, E.size, E.size)
      // 选中格高亮（第 55 轮：玩家要先选一格，再点技能库里想装的技能）
      ctx.strokeStyle = selected ? '#ffd23f' : nm ? '#7fb6e0' : '#b9d3e8'
      ctx.lineWidth = selected ? 4 : 2.5
      ctx.strokeRect(x + 1.5, y + 1.5, E.size - 3, E.size - 3)
      if (nm) {
        const im = skillIcon(nm)
        if (im) ctx.drawImage(im, x + 8, y + 8, E.size - 16, E.size - 16)
        else {
          ctx.fillStyle = D.ELEMENT_COLOR[(D.SKILLS[nm] || {}).element] || '#7fb6e0'
          ctx.fillRect(x + 20, y + 20, E.size - 40, E.size - 40)
        }
        // 右上角挂技能名（原版这一格是「替换」标签）
        text.stroked(ctx, nm, x + E.size / 2, y + E.size - 6,
          { size: 11, align: 'center', color: '#1c4b7a', lw: 2 })
      } else {
        // 空格：原版画一个禁止符
        ctx.strokeStyle = '#9fb6c9'; ctx.lineWidth = 4
        ctx.beginPath(); ctx.arc(x + E.size / 2, y + E.size / 2, E.size * 0.26, 0, Math.PI * 2); ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x + E.size / 2 - 18, y + E.size / 2 + 18)
        ctx.lineTo(x + E.size / 2 + 18, y + E.size / 2 - 18)
        ctx.stroke()
      }
    }

    // ---- 右：「类别 ▼」 ----
    ctx.fillStyle = '#2b7ec9'; ctx.fillRect(PR.x + 12, PR.y + 12, PR.w - 24, 34)
    text.stroked(ctx, '类别', PR.x + PR.w / 2 - 14, PR.y + 36,
      { size: 16, align: 'center', color: '#ffffff', lw: 2 })
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(PR.x + PR.w - 44, PR.y + 26)
    ctx.lineTo(PR.x + PR.w - 28, PR.y + 26)
    ctx.lineTo(PR.x + PR.w - 36, PR.y + 36)
    ctx.closePath(); ctx.fill()

    // ---- 右：技能库 4×4 ----
    const L = skillPanelLayout()
    const mine = new Set(f.skills || [])
    for (const r of L.rects) {
      if (r.empty) continue
      const sk = D.SKILLS[r.name] || {}
      const have = mine.has(r.name)
      const sel = r.idx === util.clamp(S.skpSel || 0, 0, L.all.length - 1)
      ctx.fillStyle = have ? '#ffffff' : '#eef4fa'
      ctx.fillRect(r.x, r.y, r.w, r.h)
      ctx.strokeStyle = sel ? '#ffd23f' : have ? '#ff9c2a' : '#7fb6e0'
      ctx.lineWidth = sel || have ? 3 : 2
      ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3)
      const im = skillIcon(r.name)
      if (im) ctx.drawImage(im, r.x + 6, r.y + 6, r.w - 12, r.h - 12)
      // 右下角写冷却（原版那里写的是技能数量）
      text.stroked(ctx, String(sk.cd || 1), r.x + r.w - 6, r.y + r.h - 6,
        { size: 11.5, align: 'right', color: have ? '#c0392b' : '#5b7c9c', lw: 0 })
    }

    // 翻页 ◀ n/N ▶
    {
      const y = PR.y + PR.h - 26
      const cx = PR.x + PR.w / 2
      const arrow = (x, dir) => {
        ctx.fillStyle = L.pages > 1 ? '#2b7ec9' : '#a9cbe8'
        ctx.fillRect(x, y - 14, 34, 28)
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        const mx = x + 17, my = y
        ctx.moveTo(mx + dir * 6, my - 7); ctx.lineTo(mx + dir * 6, my + 7); ctx.lineTo(mx - dir * 5, my)
        ctx.closePath(); ctx.fill()
      }
      arrow(cx - 92, 1)   // dir=+1 画出来是朝左
      arrow(cx + 58, -1)
      text.stroked(ctx, `${L.page + 1}/${L.pages}`, cx - 5, y + 6,
        { size: 14, align: 'center', color: '#1c4b7a', lw: 0 })
    }
    // 右上角 ✕（关闭）
    {
      const cx = PR.x + PR.w - 22, cy = PR.y + 2
      ctx.fillStyle = '#9fd8ff'
      ctx.beginPath(); ctx.arc(cx, cy, 17, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#2b7ec9'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(cx, cy, 17, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = '#2b7ec9'; ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(cx - 7, cy - 7); ctx.lineTo(cx + 7, cy + 7)
      ctx.moveTo(cx + 7, cy - 7); ctx.lineTo(cx - 7, cy + 7)
      ctx.stroke()
    }

    // 底部说明：选中技能的详情
    const cur = L.all[util.clamp(S.skpSel || 0, 0, L.all.length - 1)]
    const sk = D.SKILLS[cur] || {}
    ctx.fillStyle = 'rgba(8,12,22,.9)'; ctx.fillRect(60, 502, W - 120, 44)
    ctx.strokeStyle = 'rgba(120,170,220,.35)'; ctx.lineWidth = 1
    ctx.strokeRect(60.5, 502.5, W - 121, 43)
    if (cur) {
      text.stroked(ctx, cur, 76, 522, { size: 14, color: '#ffe45e', lw: 3 })
      const tail = `CD ${sk.cd || 1}　耗能 ${sk.energy || 0}　${['单体', '范围', '群体'][sk.range || 0] || '单体'}`
      text.stroked(ctx, tail, 76 + 96, 522, { size: 12, weight: 'normal', lw: 3, color: '#9fb0cc' })
      text.stroked(ctx, (sk.desc || '').slice(0, 40), 76, 538,
        { size: 11, weight: 'normal', lw: 3, color: '#cfd6e4' })
      text.stroked(ctx, mine.has(cur) ? '本形态已装备' : '本形态未装备',
        W - 76, 522, { size: 12, align: 'right', lw: 3, color: mine.has(cur) ? '#5ee06a' : '#7b8aa8' })
    }
    // 技能面板的操作提示（第 55 轮补配招说明）
    text.stroked(ctx, '技能　↑↓←→ 或鼠标选择　空格/点击 装备到选中格　点已装格 卸下　1~6 选格　Del 卸下　V/K/Esc 返回', W / 2, 44,
      { size: 12.5, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
  }

  // 向约定的出口注册（批次 7 · ui 收尾：界面层只画 + 布局）
  G.ui = G.ui || {}
  Object.assign(G.ui, { SKP, openSkillPanel, skillIcon, equipRectList, equipHitTest,
    skillPanelLayout, drawSkillPanel })
})()