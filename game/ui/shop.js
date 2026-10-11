/* 多克多比 · 界面层：杂货铺 + 服饰大楼（第 72 轮重构 · 批次 7 · ui 收尾）
   —— 两个面板的布局与绘制；买卖 / 穿戴 / 附魔等**改存档**的逻辑在同批次 `game/app/shop.js`。
   读内核共享状态 S（shopTab / shopSel / shopPage）与内容表 D，写 canvas；
   不碰存档、不做业务判定（金币 / 虚空水晶 / 已穿戴 / 持有数经 G.app.shop.* 与 G.app.bagCount 取）。
   依赖：内核 `G.core`（S / ctx / W / H / itemImage）+ 引擎 `window.DKDbb`（util / text / anim）
        + 内容表 `window.DKDbbData`（D）+ 应用层 G.app（shop 窄只读桥 / player 只读数据）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const { S, ctx, W, H, itemImage } = G.core
  const { util, text, anim } = window.DKDbb
  const D = window.DKDbbData
  // 应用层只读数据（惰性箭头：ui 先于 app 加载，故调用时才解析）。
  const costumeStock = (...a) => G.app.player.costumeStock(...a)
  const ownedCostumes = (...a) => G.app.player.ownedCostumes(...a)
  const costumeValue = (...a) => G.app.player.costumeValue(...a)
  // 应用层窄只读桥（ui 层不许直接读存档）：按用途取用。
  const shopGold = () => G.app.shop.gold()
  const shopVoidCrystal = () => G.app.shop.voidCrystal()
  const costumeWornId = () => G.app.shop.wornId()
  const playerAtk = () => G.app.shop.playerAtk()
  const bagCount = (id) => G.app.bagCount(id)

  // ==================== 杂货铺 ====================
  const SHOP = { x: 60, y: 126, cols: 3, rows: 7, cw: 270, chh: 42, gx: 10, gy: 6 }
  function shopLayout() {
    const tabs = D.ITEM_TABS
    const tab = tabs[util.clamp(S.shopTab || 0, 0, tabs.length - 1)]
    const list = D.items().filter(tab.match)
    const perPage = SHOP.cols * SHOP.rows
    const pages = Math.max(1, Math.ceil(list.length / perPage))
    const page = util.clamp(S.shopPage || 0, 0, pages - 1)
    const rects = []
    for (let i = 0; i < perPage; i++) {
      const k = page * perPage + i
      const r = Math.floor(i / SHOP.cols), c = i % SHOP.cols
      rects.push({
        it: list[k] || null, idx: k, empty: !list[k],
        x: SHOP.x + c * (SHOP.cw + SHOP.gx), y: SHOP.y + r * (SHOP.chh + SHOP.gy),
        w: SHOP.cw, h: SHOP.chh,
      })
    }
    return { tabs, tab, list, rects, pages, page, perPage }
  }
  function shopSelected() {
    const L = shopLayout()
    return L.list[util.clamp(S.shopSel || 0, 0, Math.max(0, L.list.length - 1))] || null
  }

  function drawShop() {
    ctx.fillStyle = '#0a1020'; ctx.fillRect(0, 0, W, H)
    const g = ctx.createRadialGradient(W / 2, 200, 60, W / 2, 320, 660)
    g.addColorStop(0, 'rgba(255,200,90,.10)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)

    const L = shopLayout()
    text.stroked(ctx, '杂货铺', 60, 50, { size: 28, color: '#ffd23f', lw: 8 })
    // 金币
    ctx.fillStyle = 'rgba(20,28,46,.9)'; ctx.fillRect(W - 250, 26, 190, 32)
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2; ctx.strokeRect(W - 249, 27, 188, 30)
    text.stroked(ctx, `金币 ${shopGold()}`, W - 240, 48, { size: 16, color: '#ffe45e', lw: 3 })

    // 页签
    L.tabs.forEach((t, i) => {
      const on = i === (S.shopTab || 0)
      const tx = 60 + i * 112, ty = 66
      const n = D.items().filter(t.match).length
      ctx.fillStyle = on ? 'rgba(255,210,63,.28)' : 'rgba(18,24,40,.9)'
      ctx.fillRect(tx, ty, 104, 30)
      ctx.strokeStyle = on ? '#ffd23f' : 'rgba(255,255,255,.22)'
      ctx.lineWidth = on ? 2.5 : 1
      ctx.strokeRect(tx + 1, ty + 1, 102, 28)
      text.stroked(ctx, `${t.label}（${n}）`, tx + 52, ty + 21,
        { size: 13, align: 'center', lw: 3, color: on ? '#ffe45e' : '#cfd6e4' })
    })
    if (L.pages > 1) {
      text.stroked(ctx, `第 ${L.page + 1}/${L.pages} 页　↑↓ 翻页`, W - 60, 88,
        { size: 12, align: 'right', lw: 3, color: '#9fb0cc' })
    }

    // 货架
    const selIt = shopSelected()
    L.rects.forEach((r) => {
      if (r.empty) return
      const it = r.it
      const sel = it === selIt
      const afford = shopGold() >= it.price
      ctx.fillStyle = sel ? 'rgba(255,210,63,.24)' : 'rgba(18,24,40,.88)'
      ctx.fillRect(r.x, r.y, r.w, r.h)
      ctx.strokeStyle = sel ? '#ffd23f' : afford ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.1)'
      ctx.lineWidth = sel ? 2.5 : 1
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)
      const img = itemImage(it)
      if (img) ctx.drawImage(img, r.x + 6, r.y + 5, 32, 32)
      text.stroked(ctx, it.name, r.x + 44, r.y + 27,
        { size: 13, lw: 3, color: afford ? (sel ? '#ffe45e' : '#e8eefc') : '#7a869c' })
      const owned = bagCount(it.id)
      if (owned) text.stroked(ctx, `持有 ${owned}`, r.x + r.w - 66, r.y + 27,
        { size: 11, weight: 'normal', lw: 3, align: 'right', color: '#43d9c8' })
      text.stroked(ctx, `${it.price} 金`, r.x + r.w - 10, r.y + 27,
        { size: 12.5, weight: 'normal', lw: 3, align: 'right', color: afford ? '#ffd23f' : '#ff8a8a' })
    })

    // 选中道具的说明
    ctx.fillStyle = 'rgba(8,12,22,.9)'; ctx.fillRect(60, 470, W - 120, 56)
    ctx.strokeStyle = 'rgba(120,170,220,.35)'; ctx.lineWidth = 1
    ctx.strokeRect(60.5, 470.5, W - 121, 55)
    if (selIt) {
      text.stroked(ctx, selIt.name, 72, 492, { size: 15, color: '#ffe45e', lw: 3 })
      const lines = text.wrap(ctx, selIt.desc || '（无描述）', W - 260, 12)
      text.stroked(ctx, lines[0] || '', 72, 514, { size: 12, weight: 'normal', lw: 3, color: '#cfd6e4' })
      // 战斗里的实际效果（数值是本地换算出来的，写清楚免得和描述对不上）
      const eff = selIt.damageMul ? `战斗中约造成 ${Math.round((playerAtk() || 34) * selIt.damageMul)} 伤害${selIt.aoe ? '（群体）' : ''}`
        : selIt.buff ? `战斗中使用：${selIt.buff.turns} 回合内${({ atk: '攻击', def: '防御', matk: '魔攻', mdef: '魔抗' })[selIt.buff.stat]} +${Math.round(selIt.buff.pct * 100)}%`
          : `战斗中使用：${selIt.hp ? `生命 +${selIt.hp}` : ''}${selIt.hp && selIt.mp ? '，' : ''}${selIt.mp ? `能量 +${selIt.mp}` : ''}`
      text.stroked(ctx, eff, W - 72, 492, { size: 12, align: 'right', lw: 3, color: '#43d9c8' })
    }
    text.stroked(ctx, '↑↓←→ 选择　空格/点击 买 1 个　F 买 5 个　Q/E 换分类　G/Esc 离开',
      W / 2, 546, { size: 12.5, align: 'center', lw: 3, color: '#9fb0cc' })
  }

  // ---- 服饰大楼（官方：多比大街最右端，找麦基买服饰；7k7k/178975）----
  function costumeRowRect(i) {
    // 每页 8 行，两列（左列 0~3、右列 4~7）。
    // 【版式】页脚有 3 行提示（H-66 / H-42 / H-20），所以货架必须收在 ~486 之前：
    // 起始 112、行高 78 + 间距 10 → 4 行到 454 结束，正好让开。
    // 第一版是 150 起、h=86+12，第 4 行压到 530 —— 截图里操作提示直接糊在货架上。
    const perCol = 4, col = i >= perCol ? 1 : 0, row = i % perCol
    const w = 420, h = 78, gapX = 40, gapY = 10
    const x0 = W / 2 - (w * 2 + gapX) / 2
    return { x: x0 + col * (w + gapX), y: 112 + row * (h + gapY), w, h }
  }
  function costumePerPage() { return 8 }
  function costumePages() { return Math.max(1, Math.ceil(costumeStock().length / costumePerPage())) }

  function drawCostume() {
    const C = G.app.shop.COSTUME
    ctx.fillStyle = '#0d0a14'; ctx.fillRect(0, 0, W, H)
    // 店面暖光（服饰大楼是室内）
    const g = ctx.createRadialGradient(W / 2, 120, 40, W / 2, 320, 640)
    g.addColorStop(0, 'rgba(255,214,150,.14)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)

    const shop = D.COSTUME_SHOP
    text.stroked(ctx, `服饰大楼`, W / 2, 42, { size: 26, align: 'center', color: '#ffd23f', lw: 8 })
    // 官方台词逐字（7k7k/111998）
    text.stroked(ctx, `麦基：${shop.greeting}`, W / 2, 72,
      { size: 14, align: 'center', color: '#ffe9b0', weight: 'normal', lw: 3 })
    text.stroked(ctx, `官方：服饰店在${shop.where}，进入大楼后点击麦基购买服饰（7k7k/178975）`,
      W / 2, 94, { size: 11.5, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })

    const stock = costumeStock()
    const own = ownedCostumes()
    const E = D.ENCHANT
    const per = costumePerPage()
    const shown = stock.slice(C.page * per, C.page * per + per)
    shown.forEach((c, i) => {
      const r = costumeRowRect(i)
      const mine = own[c.id]
      const worn = costumeWornId() === c.id
      const hl = C.sel === C.page * per + i
      ctx.fillStyle = worn ? 'rgba(94,224,106,.14)' : mine ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.04)'
      ctx.fillRect(r.x, r.y, r.w, r.h)
      ctx.strokeStyle = hl ? '#ffd23f' : worn ? 'rgba(94,224,106,.7)' : 'rgba(255,255,255,.14)'
      ctx.lineWidth = hl ? 2.5 : 1
      ctx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1)

      // 立绘：用归档里的官方时装帧（正面一 的第 0 帧）
      const entry = c.anim && c.anim.front1 ? anim.get(c.anim.front1.dir, c.anim.front1.action) : null
      const img = entry ? anim.getFrame(entry, 0) : null
      if (img) util.drawSprite(ctx, img, r.x + 40, r.y + r.h - 8, 72)
      else { ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(r.x + 16, r.y + 14, 48, 58) }

      text.stroked(ctx, c.name, r.x + 84, r.y + 24, { size: 16, color: worn ? '#8ef0c0' : '#ffd23f', lw: 4 })
      text.stroked(ctx, c.look, r.x + 84, r.y + 44,
        { size: 11, color: '#9fb0cc', weight: 'normal', lw: 3 })
      if (!mine) {
        const afford = (shopGold() || 0) >= c.price
        text.stroked(ctx, `${c.price} 金币`, r.x + 84, r.y + 68,
          { size: 13, color: afford ? '#ffe45e' : '#ff9e9e', lw: 3 })
      } else {
        // 附魔状态：数值是**实时按当前基础值算的**（见 costumeValue 的注释），
        // 所以这里不能用存档里的 e.val（那是附魔当时的快照）。
        const v = costumeValue(mine)
        const lvTxt = mine.lv ? `附魔 ${mine.lv}/${E.maxLevel}　${E.attrNames[mine.attr] || mine.attr} +${v}` : '未附魔'
        text.stroked(ctx, lvTxt, r.x + 84, r.y + 62,
          { size: 12, color: mine.lv ? '#8ef0c0' : '#9fb0cc', weight: 'normal', lw: 3 })
        if (worn) text.stroked(ctx, '已穿戴', r.x + r.w - 20, r.y + 24,
          { size: 12, align: 'right', color: '#5ee06a', lw: 3 })
      }
    })

    // 操作提示
    const selId = shown[C.sel - C.page * per]
    const canEnchant = selId && own[selId.id]
    text.stroked(ctx, '↑↓←→ 选择　回车/空格 购买 · 已拥有则穿戴/脱下　R 附魔　E 重新附魔　Esc 离开',
      W / 2, H - 66, { size: 13, align: 'center', color: '#cfe0ff', weight: 'normal', lw: 3 })
    if (C.msgT > 0) {
      text.stroked(ctx, C.msg, W / 2, H - 42,
        { size: 13.5, align: 'center', color: '#8ef0c0', lw: 4 })
    } else {
      text.stroked(ctx, `虚空水晶 ${shopVoidCrystal() || 0} 个　（珍宝小屋可买 / 副本「噜噜王的终结」掉落 —— 官方来源）`,
        W / 2, H - 42, { size: 12.5, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
    }
    text.stroked(ctx, `第 ${C.page + 1}/${costumePages()} 页　共 ${stock.length} 套官方服饰　Q 翻页`,
      W / 2, H - 20, { size: 11.5, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
  }

  // 向约定的出口注册（批次 7 · ui 收尾：界面层只画 + 布局）
  G.ui = G.ui || {}
  Object.assign(G.ui, { SHOP, shopLayout, shopSelected, drawShop,
    costumeRowRect, costumePerPage, costumePages, drawCostume })
})()