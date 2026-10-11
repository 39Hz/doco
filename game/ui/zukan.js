/* 多克多比 · 界面层：图鉴（第 72 轮重构 · 批次 3）
   —— 一页看全所有**有官方依据**的内容（多比 / 技能 / 索亚 / 怪物 / 骑士与魔王）。
   原版流程：探索中按 L 进入。只负责"布局 + 画"：
   读内核共享状态 S（zukan: tab/sel/page/from）与内容表 D，写 canvas；
   不碰存档、不做业务判定。
   依赖：内核 `G.core`（S / ctx / W / H）+ 引擎 `window.DKDbb`（util / text）
        + 内容表 `window.DKDbbData`（D）+ 同层 `G.ui`（roundBox，来自 panels.js）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const { S, ctx, W, H } = G.core
  const { util, text } = window.DKDbb
  const D = window.DKDbbData
  const { roundBox } = G.ui

  // ==================== 图鉴（多比 / 技能 / 索亚 / 怪物 / 骑士与魔王）====================
  // 一页看全所有**有官方依据**的内容。开着它是为了"可复核"：
  // 每一条都带 conf 来源等级，missing 的也照实显示，不做取舍。
  const ZUKAN = {
    panel: { x: 28, y: 66, w: 392, h: 436 },
    grid: { x: 440, y: 66, w: 492, h: 436, cols: 4, rows: 4, cw: 112, chh: 100, gx: 8, gy: 10 },
    tabs: ['多比', '技能', '索亚', '怪物', '骑士与魔王'],
  }
  function zukanState() {
    if (!S.zukan) S.zukan = { tab: 0, sel: 0, page: 0, from: 'explore' }
    return S.zukan
  }
  // 每个页签的条目。字段统一成 { name, sub, art, desc, tag }
  function zukanEntries(tab) {
    if (tab === 0) {
      const forms = (D.FORMS || []).map((f) => ({
        name: f.name,
        // 没有官方立绘的形态要在**界面上说清楚**：不是"图没加载出来"，而是归档里就没有，
        // 而且我们**不借别的形态的帧**（那正是"瑞比特·兔画成龙多比"那个 bug 的来源）。
        sub: (f.element || '无') + '系' + (f.artMissing ? ' · 无官方立绘' : ''),
        art: f.artIcon || f.art,
        artMissing: !!f.artMissing,
        desc: f.desc || '', tag: 'official', extra: `生命 ${f.stats ? f.stats['生命'] : '-'}　攻击 ${f.stats ? f.stats['攻击'] : '-'}　魔攻 ${f.stats ? f.stats['魔攻'] : '-'}`,
      }))
      // 「仅形象」：归档里有官方立绘、但**不在官方形态表里**（没有数值依据）。
      // 放在形态页签的最后，标签写明"仅形象"，避免被当成可玩形态。
      const extra = (D.FORM_ART_ONLY ? D.FORM_ART_ONLY() : []).map((a) => ({
        name: a.name,
        sub: '仅形象 · 无官方数值',
        art: a.artIcon || a.art,
        artMissing: false,
        desc: '归档里有这只的官方立绘，但**官方形态表里没有它** —— 数值没有任何依据。\n' +
          '所以它只在这里展示形象，**不进战斗、不可变身、也不会被掉落抽到**（R1/R9）。\n' +
          '依据：' + (a.evidence || '官方素材归档'),
        tag: 'artonly',
        extra: '仅形象 · 不进战斗',
      }))
      return forms.concat(extra)
    }
    if (tab === 1) return (D.SKILL_NAMES || Object.keys(D.SKILLS || {})).map((n) => {
      const sk = D.SKILLS[n] || {}
      const KIND = { physical: '力量型', magic: '精神力', hybrid: '魔武混合', support: '辅助', attack: '（官方未声明类型）' }
      return {
        name: n, sub: (sk.element || '无属性') + ' · ' + (KIND[sk.kind] || ''),
        art: D.skillIconFile(n), desc: sk.desc || '',
        tag: sk.conf || (sk.official ? 'official' : 'derived'),
        extra: `CD ${sk.cd || 0}　耗魔 ${sk.mp || 0}　${['单体', '范围', '全体'][sk.range || 0] || '单体'}${sk.seal ? '　结印技' : ''}`,
      }
    })
    if (tab === 2) return (D.SOYA || []).map((s) => ({
      name: s.name, sub: s.effectLabel || '', art: s.art, desc: s.desc || s.effectText || '',
      tag: 'official', extra: s.effectText || '',
    }))
    if (tab === 3) return (D.MONSTERS || []).map((m) => ({
      name: m.name, sub: (m.element || '无') + '系', art: m.sprite, desc: m.desc || '',
      tag: 'official', extra: `基准等级 ${m.baseLevel}　体型 ${m.size}`,
    }))
    // 骑士与魔王
    const ks = (D.KNIGHTS || []).map((k) => ({
      name: k.name, sub: k.kind === 'knight' ? '骑士' : k.kind === 'lord' ? '魔王 / BOSS' : '身份待考',
      art: k.art,
      // 有官方描述的优先用官方描述（逐字），没有才退回出处说明 ——
      // 第 35 轮之前这里只读 evidence，于是「巨岩骑士」的官方描述白拿了。
      desc: k.desc || k.evidence || '', tag: k.conf,
      extra: '本素材包不含战斗数值 —— 只作图鉴展示',
    }))
    for (const m of (D.knightsMissing ? D.knightsMissing() : [])) {
      ks.push({ name: m.name, sub: '骑士（缺立绘）', art: null, desc: m.why, tag: 'missing', extra: '' })
    }
    return ks
  }
  function zukanLayout() {
    const z = zukanState()
    const all = zukanEntries(z.tab)
    const g = ZUKAN.grid
    const perPage = g.cols * g.rows
    const pages = Math.max(1, Math.ceil(all.length / perPage))
    const page = util.clamp(z.page, 0, pages - 1)
    const slice = all.slice(page * perPage, page * perPage + perPage)
    const gw = g.cols * g.cw + (g.cols - 1) * g.gx
    const gx0 = g.x + (g.w - gw) / 2
    const gy0 = g.y + 52
    const rects = slice.map((e, i) => ({
      e, idx: page * perPage + i,
      x: gx0 + (i % g.cols) * (g.cw + g.gx),
      y: gy0 + Math.floor(i / g.cols) * (g.chh + g.gy),
      w: g.cw, h: g.chh,
    }))
    return { all, slice, rects, page, pages, perPage }
  }
  const zukanCache = new Map()
  function zukanImage(art) {
    if (!art) return null
    if (!zukanCache.has(art)) { const im = new Image(); im.src = art; zukanCache.set(art, im) }
    const im = zukanCache.get(art)
    return (im.complete && im.naturalWidth) ? im : null
  }
  const CONF_LABEL = { official: '官方', community: '社区', derived: '推算', missing: '缺失', artonly: '仅形象' }
  const CONF_COLOR = { official: '#5ee06a', community: '#43d9c8', derived: '#ffd23f', missing: '#ff8a8a', artonly: '#43d9c8' }

  function drawZukan() {
    const z = zukanState()
    const L = zukanLayout()
    ctx.fillStyle = '#080e1c'; ctx.fillRect(0, 0, W, H)
    const g0 = ctx.createRadialGradient(W / 2, 240, 60, W / 2, 300, 700)
    g0.addColorStop(0, 'rgba(90,160,255,.10)'); g0.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g0; ctx.fillRect(0, 0, W, H)
    text.stroked(ctx, '多克多比 · 图鉴', 24, 34, { size: 22, color: '#ffd23f' })
    text.stroked(ctx, 'Q/E 翻页　↑↓←→ 选择　Esc 返回　每条都标了来源等级（官方/社区/推算/缺失）',
      24, 54, { size: 11.5, color: '#8fa0c0', weight: 'normal', lw: 3 })

    // 页签
    let tx = 24
    ZUKAN.tabs.forEach((t, i) => {
      const n = zukanEntries(i).length
      const label = `${t} ${n}`
      ctx.font = 'bold 13px "Microsoft YaHei", sans-serif'
      const w = ctx.measureText(label).width + 22
      const on = i === z.tab
      ctx.save()
      ctx.fillStyle = on ? 'rgba(255,210,63,.20)' : 'rgba(255,255,255,.05)'
      roundBox(tx, 62, w, 26, 7); ctx.fill()
      ctx.strokeStyle = on ? '#ffd23f' : 'rgba(255,255,255,.16)'
      ctx.lineWidth = on ? 2 : 1
      roundBox(tx, 62, w, 26, 7); ctx.stroke()
      ctx.restore()
      text.stroked(ctx, label, tx + w / 2, 80, { size: 13, align: 'center', color: on ? '#ffe45e' : '#cfd6e4', lw: 3 })
      tx += w + 6
    })

    // 右侧网格
    const sel = L.all[util.clamp(z.sel, 0, Math.max(0, L.all.length - 1))]
    for (const r of L.rects) {
      const on = r.e === sel
      ctx.save()
      ctx.fillStyle = on ? 'rgba(255,210,63,.16)' : 'rgba(255,255,255,.04)'
      roundBox(r.x, r.y, r.w, r.h, 8); ctx.fill()
      ctx.strokeStyle = on ? '#ffd23f' : 'rgba(255,255,255,.14)'
      ctx.lineWidth = on ? 2.5 : 1
      roundBox(r.x, r.y, r.w, r.h, 8); ctx.stroke()
      ctx.restore()
      // 图标
      const im = zukanImage(r.e.art)
      if (im) {
        const ih = 54, iw = Math.max(10, Math.round(ih * im.naturalWidth / im.naturalHeight))
        ctx.drawImage(im, r.x + (r.w - iw) / 2, r.y + 6, iw, ih)
      } else {
        ctx.fillStyle = 'rgba(255,255,255,.07)'
        roundBox(r.x + r.w / 2 - 20, r.y + 10, 40, 40, 6); ctx.fill()
        // 区分两种"没有图"：归档里本来就没有（artMissing，如实标注）
        // vs 有图但没加载出来（「缺」）。前者不该让人以为是我们漏了。
        const mark = r.e.artMissing ? '无立绘' : '缺'
        text.stroked(ctx, mark, r.x + r.w / 2, r.y + 36,
          { size: r.e.artMissing ? 9.5 : 16, align: 'center', color: '#6b7891', lw: 3 })
      }
      const nm = r.e.name.length > 7 ? r.e.name.slice(0, 7) + '…' : r.e.name
      text.stroked(ctx, nm, r.x + r.w / 2, r.y + r.h - 20, { size: 12.5, align: 'center', color: on ? '#ffe45e' : '#e8eefc', lw: 3 })
      text.stroked(ctx, r.e.sub, r.x + r.w / 2, r.y + r.h - 6, { size: 10.5, align: 'center', color: '#8fa0c0', weight: 'normal', lw: 2.5 })
      if (r.e.tag) {
        ctx.fillStyle = CONF_COLOR[r.e.tag] || '#8fa0c0'
        ctx.beginPath(); ctx.arc(r.x + 10, r.y + 10, 4, 0, Math.PI * 2); ctx.fill()
      }
    }
    // 页码放在**左侧详情面板底部**，不放网格底部
    // （网格最后一行正好压到那里，实测截图里页码和格子文字叠在一起了）
    text.stroked(ctx, `第 ${L.page + 1} / ${L.pages} 页　共 ${L.all.length} 条`,
      ZUKAN.panel.x + ZUKAN.panel.w / 2, ZUKAN.panel.y + ZUKAN.panel.h - 8,
      { size: 12, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })

    // 左侧详情
    const P = ZUKAN.panel
    ctx.save()
    ctx.fillStyle = 'rgba(4,9,20,.86)'
    roundBox(P.x, P.y + 40, P.w, P.h - 40, 12); ctx.fill()
    ctx.strokeStyle = 'rgba(67,217,200,.45)'; ctx.lineWidth = 2
    roundBox(P.x, P.y + 40, P.w, P.h - 40, 12); ctx.stroke()
    ctx.restore()
    if (sel) {
      const im = zukanImage(sel.art)
      if (im) {
        const hh = 150, ww = Math.max(20, Math.round(hh * im.naturalWidth / im.naturalHeight))
        ctx.drawImage(im, P.x + (P.w - ww) / 2, P.y + 58, ww, hh)
      } else {
        text.stroked(ctx, '（没有立绘）', P.x + P.w / 2, P.y + 130, { size: 14, align: 'center', color: '#6b7891', lw: 3 })
      }
      text.stroked(ctx, sel.name, P.x + P.w / 2, P.y + 232, { size: 19, align: 'center', color: '#ffe45e', lw: 4 })
      text.stroked(ctx, sel.sub, P.x + P.w / 2, P.y + 252, { size: 12.5, align: 'center', color: '#43d9c8', weight: 'normal', lw: 3 })
      if (sel.tag) {
        const lb = CONF_LABEL[sel.tag] || sel.tag
        ctx.save()
        ctx.fillStyle = (CONF_COLOR[sel.tag] || '#8fa0c0') + '33'
        roundBox(P.x + P.w - 74, P.y + 50, 62, 22, 6); ctx.fill()
        ctx.restore()
        text.stroked(ctx, lb, P.x + P.w - 43, P.y + 65, { size: 12, align: 'center', color: CONF_COLOR[sel.tag] || '#8fa0c0', lw: 3 })
      }
      if (sel.extra) text.stroked(ctx, sel.extra, P.x + 16, P.y + 278, { size: 12, color: '#cfd6e4', weight: 'normal', lw: 3 })
      // 描述折行
      let y = P.y + 302
      const maxChars = 22
      let rest = String(sel.desc || '').replace(/\s+/g, ' ')
      while (rest.length && y < P.y + P.h - 10) {
        text.stroked(ctx, rest.slice(0, maxChars), P.x + 16, y, { size: 11.5, color: '#9fb0cc', weight: 'normal', lw: 3 })
        rest = rest.slice(maxChars)
        y += 18
      }
    }
  }

  // 向约定的出口注册（批次 3：界面层只画 + 布局）
  G.ui = G.ui || {}
  Object.assign(G.ui, { ZUKAN, zukanState, zukanEntries, zukanLayout, drawZukan })
})()