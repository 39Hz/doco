/* 多克多比 · 鼠标操作与点击寻路
   还原页游手感：左键点地面走过去，点 NPC / 怪物弹出功能菜单再选择 */
(() => {
  'use strict'
  const M = window.DKDbbMouse = {}

  M.x = 0; M.y = 0          // 画布坐标
  M.clicked = false         // 本帧是否按下（消费一次）
  M.down = false
  M.inside = false
  M.hover = null            // 当前悬停目标 {type, obj}

  // 把屏幕坐标换算成画布坐标（画布被 CSS 缩放）
  function toCanvas(cvs, e) {
    const r = cvs.getBoundingClientRect()
    return {
      x: (e.clientX - r.left) * (cvs.width / r.width),
      y: (e.clientY - r.top) * (cvs.height / r.height),
    }
  }

  M.init = function (cvs) {
    cvs.addEventListener('mousemove', (e) => {
      const p = toCanvas(cvs, e)
      M.x = p.x; M.y = p.y
      M.inside = true
    })
    cvs.addEventListener('mouseleave', () => { M.inside = false; M.hover = null })
    cvs.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return
      const p = toCanvas(cvs, e)
      M.x = p.x; M.y = p.y
      M.down = true
      M.clicked = true
      e.preventDefault()
    })
    window.addEventListener('mouseup', (e) => { if (e.button === 0) M.down = false })
    cvs.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  // 每帧结束调用，消费点击
  M.endFrame = function () { M.clicked = false }

  // ---------- 点击寻路 ----------
  // 场景里没有真实障碍物（背景是整张截图），所以「寻路」=
  // 直线走向目标点，遇不到障碍就自然停下。但为了页游手感，
  // 加一点「先横向再纵向」的分段，走起来更像绕路而不是斜线穿屏。
  M.newPath = function (from, to) {
    return { tx: to.x, ty: to.y, started: performance.now() }
  }

  // 目标点是否可达（限制在可行走矩形内）
  M.clampToWalkable = function (p, bounds) {
    return {
      x: Math.max(bounds.x0, Math.min(bounds.x1, p.x)),
      y: Math.max(bounds.y0, Math.min(bounds.y1, p.y)),
    }
  }

  // ---------- 命中检测 ----------
  // 角色/NPC 的可点区域是一个椭圆（比图形略大，方便点中）
  M.hitActor = function (a, mx, my, rx = 40, ry = 56) {
    const dx = (mx - a.x) / rx
    const dy = (my - (a.y - ry * 0.55)) / ry
    return dx * dx + dy * dy <= 1
  }

  // ---------- 菜单 ----------
  // 原版交互：点击 NPC 弹出功能菜单（如「沙拉塔的收获」），再点选具体项
  M.menu = null   // { items:[{label, action, disabled, hint}], sel, x, y, title }

  M.openMenu = function (title, items, x, y, w, h) {
    M.menu = { title, items, sel: 0, x, y, t: 0, w, h }
  }
  M.closeMenu = function () { M.menu = null }
  M.menuOpen = function () { return !!M.menu }

  // 菜单尺寸：drawMenu 与 menuHitTest 都要用，且必须在 openMenu 时就定下来。
  // 早先只在 drawMenu 里赋值，导致"打开菜单的当帧"点击判定拿不到 w/h，点选项永远失效。
  M.measureMenu = function (items, title) {
    const IH = 40, PAD = 14, HEAD = 34
    let maxw = String(title || '').length * 15
    for (const it of items) {
      // 中文按 15px 估宽（无 ctx 可量时的兜底），足够近似
      const a = String(it.label || '').length * 15
      const b = it.hint ? String(it.hint).length * 11 : 0
      maxw = Math.max(maxw, a + b + 46)
    }
    const w = Math.min(360, Math.max(180, maxw + PAD * 2))
    const h = HEAD + items.length * IH + PAD - 6
    return { w, h }
  }

  M.menuMove = function (d) {
    const m = M.menu
    if (!m) return
    const n = m.items.length
    m.sel = ((m.sel + d) % n + n) % n
  }
  M.menuPick = function (i) {
    const m = M.menu
    if (!m) return null
    const idx = i === undefined ? m.sel : i
    const it = m.items[idx]
    if (!it || it.disabled) return null
    return it
  }
  // 鼠标在菜单上时的命中测试，返回索引
  M.menuHitTest = function (mx, my) {
    const m = M.menu
    if (!m) return -1
    const IH = 40, PAD = 12, HEAD = 34
    for (let i = 0; i < m.items.length; i++) {
      const y0 = m.y + HEAD + i * IH
      if (mx >= m.x && mx <= m.x + m.w && my >= y0 && my <= y0 + IH - 6) return i
    }
    return -1
  }

  // ---------- 绘制 ----------
  M.drawMenu = function (ctx, W, H) {
    const m = M.menu
    if (!m) return
    const PAD = 14, IH = 40, HEAD = 34
    ctx.font = 'bold 15px "Microsoft YaHei", sans-serif'
    let maxw = ctx.measureText(m.title || '').width
    for (const it of m.items) {
      ctx.font = 'bold 15px "Microsoft YaHei", sans-serif'
      const a = ctx.measureText(it.label).width
      ctx.font = '11px "Microsoft YaHei", sans-serif'
      const b = it.hint ? ctx.measureText(it.hint).width : 0
      maxw = Math.max(maxw, a + b + 46)
    }
    const w = Math.min(360, Math.max(180, maxw + PAD * 2))
    const h = HEAD + m.items.length * IH + PAD - 6
    // 避免菜单超出画面
    let x = Math.min(Math.max(8, m.x), W - w - 8)
    let y = Math.min(Math.max(8, m.y), H - h - 8)
    m.x = x; m.y = y; m.w = w; m.h = h

    // 背景
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6
    ctx.fillStyle = 'rgba(10,15,26,.96)'
    ctx.fillRect(x, y, w, h)
    ctx.restore()
    // 边框：金色，页游味道
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2)
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1
    ctx.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9)

    // 标题条
    ctx.fillStyle = 'rgba(255,210,63,.16)'
    ctx.fillRect(x + 3, y + 3, w - 6, HEAD - 4)
    ctx.font = 'bold 15px "Microsoft YaHei", sans-serif'
    ctx.fillStyle = '#ffe45e'
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(m.title || '', x + PAD, y + HEAD / 2 + 2)

    // 选项
    for (let i = 0; i < m.items.length; i++) {
      const it = m.items[i]
      const iy = y + HEAD + i * IH
      const sel = i === m.sel
      if (sel) {
        ctx.fillStyle = 'rgba(67,217,200,.22)'
        ctx.fillRect(x + 6, iy, w - 12, IH - 6)
        ctx.strokeStyle = '#43d9c8'; ctx.lineWidth = 1.5
        ctx.strokeRect(x + 6.5, iy + .5, w - 13, IH - 7)
      }
      ctx.font = 'bold 15px "Microsoft YaHei", sans-serif'
      ctx.fillStyle = it.disabled ? '#6b7891' : (sel ? '#d8fff8' : '#e8eefc')
      ctx.fillText(it.label, x + 20, iy + (IH - 6) / 2 + 1)
      if (it.hint) {
        ctx.font = '11px "Microsoft YaHei", sans-serif'
        ctx.fillStyle = it.disabled ? '#5a657a' : '#9fb0cc'
        ctx.textAlign = 'right'
        ctx.fillText(it.hint, x + w - 20, iy + (IH - 6) / 2 + 1)
        ctx.textAlign = 'left'
      }
    }
    // 提示
    ctx.font = '11px "Microsoft YaHei", sans-serif'
    ctx.fillStyle = '#7b8aa8'
    ctx.fillText('↑↓ 或鼠标选择　空格/点击 确定　Esc 关闭', x + PAD, y + h - 12)
  }

  // 鼠标指针样式：悬停到可交互目标时变手型
  M.applyCursor = function (cvs, hovering) {
    const want = hovering ? 'pointer' : 'default'
    if (cvs.style.cursor !== want) cvs.style.cursor = want
  }
})()
