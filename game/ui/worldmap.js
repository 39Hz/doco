/* 多克多比 · 界面层：大地图（第 72 轮重构 · 批次 7）
   —— 七大地形与通道图：这地方属于哪个地形、从这里能直达哪里、去某地要怎么走，
      地图界面与场景 HUD 都靠它们，所有回答都来自同一份数据；
      再加上大地图的几何、岛名标签摆放、命中测试与整块绘制。
   只负责"布局 + 画"：读内核共享状态 S（world / mapSel / current 等），写 canvas；
   不碰存档、不做业务判定。
   依赖：内核 `G.core`（S / ctx / W / H / bgImage）+ 引擎 `window.DKDbb`（text）
        + 同层 `G.ui`（roundBox，来自 panels.js）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const { S, ctx, W, H, bgImage } = G.core
  const { text } = window.DKDbb
  const { roundBox } = G.ui

  // ==================== 七大地形与通道图 ====================
  // 数据在 world.js 的 districts / links（来源见那里的注释，官方《七大地形》原文）。
  // 这三个函数把"这地方属于哪个地形""从这里能直达哪里""去某地要怎么走"算出来，
  // 地图界面与场景 HUD 都靠它们，所有回答都来自同一份数据。
  function islandById(id) {
    const isles = (S.world && S.world.islands) || []
    return isles.find((i) => i.id === id) || null
  }
  function districtOfIsland(id) {
    const ds = (S.world && S.world.districts) || []
    return ds.find((d) => (d.islands || []).includes(id)) || null
  }
  // 场景级归属（M2-2，第 51 轮）。
  // 默认继承所属岛的地形；但 world.js 的 `districtOverrides` 可以按**官方场景名**改写。
  // 为什么需要改写：那 11 座岛是按**美术资源相似度**分的组（world.js 自己写了这一点），
  // 不是原版结构。于是会出现「城堡走道」被分进"草原野外"这种自相矛盾的情况 ——
  // 一有官方名字，就以官方名字为准（见 docs/场景地形归属.md）。
  function districtOfScene(sceneId) {
    const ov = (S.world && S.world.districtOverrides) || {}
    const forced = ov[String(sceneId)] || ov[sceneId]
    if (forced) {
      const d = ((S.world && S.world.districts) || []).find((x) => x.id === forced)
      if (d) return d
    }
    const sc = S.scenes && S.scenes[sceneId]
    return sc ? districtOfIsland(sc.island) : null
  }
  // 从 id 能直接前往的岛（不含自己）
  function linksOf(id) {
    const L = (S.world && S.world.links) || {}
    return (L[id] || []).filter((x) => x !== id && islandById(x))
  }
  // BFS 求一条通道路径（含起点与终点）。走不通返回 null。
  function routeTo(fromId, toId) {
    if (!fromId || !toId) return null
    if (fromId === toId) return [fromId]
    const prev = { [fromId]: null }
    const q = [fromId]
    while (q.length) {
      const cur = q.shift()
      for (const nx of linksOf(cur)) {
        if (nx in prev) continue
        prev[nx] = cur
        if (nx === toId) {
          const path = [nx]
          let p = cur
          while (p) { path.unshift(p); p = prev[p] }
          return path
        }
        q.push(nx)
      }
    }
    return null
  }
  function islandName(id) { const i = islandById(id); return i ? i.name : id }
  // 把路径写成"经 A → B"的人话（起点终点不重复列）
  function routeText(path) {
    if (!path || path.length < 2) return ''
    if (path.length === 2) return '有一条直通道'
    return '需经 ' + path.slice(1, -1).map(islandName).join(' → ')
  }

  // 大地图的几何：**只有这一处**算，命中测试、绘制、截图工具都从这里取。
  // 之前命中测试与绘制各算一套，改布局时两边就会不一致（点不中岛）。
  // 版式：顶部放标题 + 通道信息条（当前所在 / 可直达）+ 选中岛详情，地图整体下移，
  // 这样信息条**不会盖住地图下沿的岛**（11 号云海孤丘当初就是被盖住的）。
  const MAP_TOP = 182        // 地图区顶部
  const MAP_BOTTOM_PAD = 8   // 地图区底部留白
  function mapGeom() {
    const MW = S.world ? S.world.mapW : 710
    const MH = S.world ? S.world.mapH : 474
    const avail = H - MAP_TOP - MAP_BOTTOM_PAD
    const r = Math.min(W / MW, avail / MH)
    return { r, ox: (W - MW * r) / 2, oy: MAP_TOP + (avail - MH * r) / 2 }
  }

  // 岛名标签的摆放（第 52 轮）：四个方向里挑第一个**不撞别的岛节点**的。
  // 为什么需要：岛名原来固定画在节点上方，而地图上岛是挤在一起的 ——
  // 小岛的岛名会落进上面那个岛的节点里（实测「8 地精工坊岛」的编号圆压住「9 浮空碎石台」的岛名）。
  // 顺序 上→下→右→左；四个方向都撞就退回"上"（保持确定行为，不随机）。
  function placeIslandLabel(isl, cx, cy, rx, ry, isles, G) {
    const size = 13, lineH = 13 * 1.1
    const textW = (s) => [...String(s)].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? size : size * 0.55), 0)
    const w = Math.max(textW(isl.name), textW((districtOfIsland(isl.id) || {}).name || ''))
    // 别的岛的**外接矩形**（保守：椭圆按外接矩形算，宁可多让一点）
    const boxes = isles.filter((o) => o !== isl).map((o) => {
      const ox = G.ox + o.x * G.r, oy = G.oy + o.y * G.r
      const orx = o.rx * G.r * 1.08, ory = o.ry * G.r * 1.08
      return { x0: ox - orx - 6, x1: ox + orx + 6, y0: oy - ory - 6, y1: oy + ory + 6 }
    })
    const free = (x, y, align) => {
      const half = align === 'center' ? w / 2 : 0
      const x0 = align === 'center' ? x - half : (align === 'right' ? x - w : x)
      const x1 = align === 'center' ? x + half : (align === 'right' ? x : x + w)
      const y0 = y - lineH * 0.85, y1 = y + lineH * 1.25      // 两行（岛名 + 地形）
      if (x0 < 4 || x1 > W - 4 || y0 < MAP_TOP - 20 || y1 > H - 6) return false
      return !boxes.some((b) => !(x1 < b.x0 || x0 > b.x1 || y1 < b.y0 || y0 > b.y1))
    }
    const cands = [
      { x: cx, y: cy - ry - 20, align: 'center' },   // 上（原来的位置）
      { x: cx, y: cy + ry + 34, align: 'center' },   // 下（避开"可直达"那一行）
      { x: cx + rx + 12, y: cy + 4, align: 'left' }, // 右
      { x: cx - rx - 12, y: cy + 4, align: 'right' },// 左
    ]
    for (const c of cands) if (free(c.x, c.y, c.align)) return c
    return cands[0]
  }

  function worldmapIslandAt(mx, my) {    if (!S.world) return -1
    const { r, ox, oy } = mapGeom()
    for (let i = 0; i < S.world.islands.length; i++) {
      const isl = S.world.islands[i]
      const cx = ox + isl.x * r, cy = oy + isl.y * r
      // 判定区比绘图椭圆放宽一点，方便点中
      const dx = (mx - cx) / (isl.rx * r * 1.15)
      const dy = (my - cy) / (isl.ry * r * 1.15)
      if (dx * dx + dy * dy <= 1) return i
    }
    return -1
  }

  function drawWorldMap() {
    ctx.fillStyle = '#070d1a'; ctx.fillRect(0, 0, W, H)
    // 世界地图底图
    const wm = bgImage(S.world.map)
    const G = mapGeom()
    if (wm.complete && wm.naturalWidth) {
      const rr = Math.min(W / wm.naturalWidth, (H - MAP_TOP - MAP_BOTTOM_PAD) / wm.naturalHeight)
      const dw = wm.naturalWidth * rr, dh = wm.naturalHeight * rr
      ctx.drawImage(wm, (W - dw) / 2, MAP_TOP + (H - MAP_TOP - MAP_BOTTOM_PAD - dh) / 2, dw, dh)
    }
    ctx.fillStyle = 'rgba(6,10,18,.35)'; ctx.fillRect(0, 0, W, H)
    text.stroked(ctx, '浮空群岛 · 大地图', W / 2, 34, { size: 26, align: 'center', color: '#ffd23f', lw: 8 })
    text.stroked(ctx, '← → ↑ ↓ 选岛　空格 前往　Tab 返回标题　Q 任务列表', W / 2, 58, { size: 12.5, align: 'center', color: '#cfd6e4', weight: 'normal', lw: 3 })

    const list = S.world.islands
    const { r, ox, oy } = mapGeom()
    const here = (S.current && S.current.island) || null
    const direct = here ? linksOf(here) : []

    // ---------- 先画通道连线，再画岛，免得线压在岛上面 ----------
    // 目的地能直达就画亮青色实线，要绕路就画暗一些的虚线 —— 一眼看出"能直接去哪"。
    // 虚线是**手动画**的，不用 ctx.setLineDash：无头测试的假 canvas 与截图用的
    // 软件光栅化器都没有这个方法，用了会直接崩在绘制里。
    {
      const seg = (x1, y1, x2, y2, dash) => {
        if (!dash) {
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
          return
        }
        const dx = x2 - x1, dy = y2 - y1
        const len = Math.hypot(dx, dy)
        if (len < 0.5) return
        const ux = dx / len, uy = dy / len
        const on = 6, off = 6
        let d = 0
        ctx.beginPath()
        while (d < len) {
          const e = Math.min(len, d + on)
          ctx.moveTo(x1 + ux * d, y1 + uy * d)
          ctx.lineTo(x1 + ux * e, y1 + uy * e)
          d = e + off
        }
        ctx.stroke()
      }
      const drawn = new Set()
      for (const isl of list) {
        for (const toId of linksOf(isl.id)) {
          const key = isl.id < toId ? isl.id + '|' + toId : toId + '|' + isl.id
          if (drawn.has(key)) continue
          drawn.add(key)
          const other = islandById(toId)
          if (!other) continue
          const onRoute = here && (isl.id === here || toId === here)
          ctx.save()
          ctx.strokeStyle = onRoute ? 'rgba(255,210,63,.75)' : 'rgba(120,150,190,.30)'
          ctx.lineWidth = onRoute ? 2.5 : 1.5
          seg(ox + isl.x * r, oy + isl.y * r, ox + other.x * r, oy + other.y * r, !onRoute)
          ctx.restore()
        }
      }
    }

    list.forEach((isl, i) => {
      const cx = ox + isl.x * r, cy = oy + isl.y * r
      const sel = i === S.mapSel
      const rx = isl.rx * r, ry = isl.ry * r
      const reach = direct.includes(isl.id)
      const isHere = here === isl.id
      ctx.save()
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.fillStyle = sel ? 'rgba(255,210,63,.30)' : reach ? 'rgba(67,217,200,.22)' : 'rgba(67,217,200,.10)'
      ctx.fill()
      ctx.lineWidth = sel ? 3 : reach ? 2.5 : 1.5
      ctx.strokeStyle = sel ? '#ffd23f' : reach ? '#5ee06a' : 'rgba(67,217,200,.45)'
      ctx.stroke()
      ctx.restore()
      // 编号
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, 15, 0, Math.PI * 2)
      ctx.fillStyle = sel ? '#ffd23f' : 'rgba(8,14,26,.85)'
      ctx.fill()
      ctx.lineWidth = 2; ctx.strokeStyle = sel ? '#fff' : reach ? '#5ee06a' : '#43d9c8'; ctx.stroke()
      ctx.restore()
      text.stroked(ctx, String(isl.n), cx, cy + 6, { size: 16, align: 'center', color: sel ? '#1a1405' : reach ? '#5ee06a' : '#43d9c8', lw: sel ? 3 : 2.5 })
      // 名字 + 所属地形（官方七大地形）
      // 【第 52 轮修】原来岛名**固定画在节点上方**（cy - ry - 20）。地图上岛是挤在一起的，
      // 于是小岛的岛名会落进**上面那个岛**的节点里 —— 实测「8 地精工坊岛」的编号圆
      // 正好压在「9 浮空碎石台」的岛名上（切片断言 check-canvas-text 量出 62% 相压）。
      // 改成**四个方向里挑一个不撞的**：上 → 下 → 右 → 左，全撞就退回"上"（至少有个确定行为）。
      const dist = districtOfIsland(isl.id)
      const lp = placeIslandLabel(isl, cx, cy, rx, ry, list, G)
      text.stroked(ctx, isl.name, lp.x, lp.y, { size: sel ? 15 : 13, align: lp.align, color: sel ? '#ffe45e' : '#e8eefc', lw: 4 })
      if (dist) text.stroked(ctx, dist.name, lp.x, lp.y + 14, { size: 11, align: lp.align, color: '#43d9c8', weight: 'normal', lw: 3 })
      if (isHere) text.stroked(ctx, '◉ 当前所在', cx, cy + ry + 18, { size: 11.5, align: 'center', color: '#5ee06a', lw: 3 })
      else if (reach) text.stroked(ctx, '可直达', cx, cy + ry + 18, { size: 11, align: 'center', color: '#5ee06a', weight: 'normal', lw: 3 })
    })

    // ---------- 当前位置与"从这里能去哪"（放在**地图上方**，不遮地图）----------
    {
      const dist = here ? districtOfIsland(here) : null
      const lines = direct.map((id) => {
        const p = routeTo(here, id)
        return `${islandName(id)}（${p ? Math.max(1, p.length - 1) : '?'} 步）`
      })
      const bx = 20, by = 70, bw = W - 40, bh = 62
      ctx.save()
      ctx.fillStyle = 'rgba(6,11,22,.90)'
      roundBox(bx, by, bw, bh, 10); ctx.fill()
      ctx.strokeStyle = 'rgba(67,217,200,.5)'; ctx.lineWidth = 1.5
      roundBox(bx, by, bw, bh, 10); ctx.stroke()
      ctx.restore()
      if (here) {
        text.stroked(ctx, `当前所在：${dist ? dist.name + ' · ' : ''}${islandName(here)}`,
          bx + 16, by + 22, { size: 13.5, color: '#5ee06a', lw: 4 })
        if (dist) text.stroked(ctx, `（${dist.role}）`, bx + 16 + 260, by + 22,
          { size: 11.5, color: '#8fa0c0', weight: 'normal', lw: 3 })
        text.stroked(ctx, '从此处可直达：' + (lines.length ? lines.join('　') : '（此处是尽头，需原路返回）'),
          bx + 16, by + 46, { size: 12.5, color: '#d8fff8', weight: 'normal', lw: 3 })
      } else {
        text.stroked(ctx, '还没有进入任何一个区域 —— 先在地图上选一个地方前往',
          bx + 16, by + 36, { size: 13.5, color: '#cfd6e4', lw: 4 })
      }
    }

    // 选中岛屿的详情条（紧贴信息条下方）
    const isl = list[S.mapSel]
    if (isl) {
      const isHere2 = here === isl.id
      const reach = direct.includes(isl.id)
      const path = here && !isHere2 ? routeTo(here, isl.id) : null
      const relation = isHere2 ? '你就在这里'
        : reach ? '有直通道'
          : path ? routeText(path) : '没有通路'
      ctx.fillStyle = 'rgba(8,12,22,.92)'
      ctx.fillRect(40, 138, W - 80, 30)
      ctx.strokeStyle = relation === '有直通道' ? '#5ee06a' : '#43d9c8'; ctx.lineWidth = 1
      ctx.strokeRect(40.5, 138.5, W - 81, 29)
      const dist = districtOfIsland(isl.id)
      text.stroked(ctx, `${isl.n}. ${isl.name}　[${dist ? dist.name : isl.tag}]　${isl.scenes.length} 个场景　${relation}`,
        56, 158, { size: 13, weight: 'normal', lw: 3, color: reach || isHere2 ? '#d8fff8' : '#9fb0cc' })
    }
  }

  // 向约定的出口注册（批次 7：界面层只画 + 布局）
  G.ui = G.ui || {}
  Object.assign(G.ui, { islandById, districtOfIsland, districtOfScene, linksOf, routeTo,
    islandName, routeText, mapGeom, placeIslandLabel, worldmapIslandAt, drawWorldMap })
})()