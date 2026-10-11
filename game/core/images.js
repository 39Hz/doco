/* 多克多比 · 内核（core/images.js）
   职责：图片缓存与怪物立绘的共享画法（bgImage / itemImage / monImage / drawMonster）。
   依赖：core（ctx/S）；图片原语取自 window.DKDbb（util/text）、元素色取自 window.DKDbbData。
   来源：原 game/game.js 第 111–197 行，内容完全一致。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const { ctx, S } = G.core
  const { util, text } = window.DKDbb
  const D = window.DKDbbData

  // ==================== 图片缓存 ====================
  function bgImage(file) {
    if (!S.images.has(file)) { const im = new Image(); im.src = file; S.images.set(file, im) }
    return S.images.get(file)
  }

  // 道具图标缓存（官方图集切出来的 64×64 PNG）
  const itemCache = new Map()
  function itemImage(it) {
    const f = it && it.icon
    if (!f) return null
    if (!itemCache.has(f)) { const im = new Image(); im.src = f; itemCache.set(f, im) }
    const im = itemCache.get(f)
    return (im.complete && im.naturalWidth) ? im : null
  }

  // 怪物立绘缓存（图鉴切图）
  const monCache = new Map()
  function monImage(mon) {
    const f = mon.sprite
    if (!f) return null
    if (!monCache.has(f)) { const im = new Image(); im.src = f; monCache.set(f, im) }
    const im = monCache.get(f)
    return (im.complete && im.naturalWidth) ? im : null
  }

  // 怪物没有逐帧动画素材（原版只有 .fla 源工程），
  // 所以用程序化动作补足：呼吸缩放 / 出手前冲 / 受击抖动闪白 / 倒下淡出。
  // 返回 true = 用了官方立绘；false = 退化成了属性色圆形占位。
  // （调用方需要据此决定要不要再叠自己的占位图形 —— 不做区分会两样都画出来。）
  function drawMonster(mon, cx, bottomY, targetH, opt = {}) {
    const img = monImage(mon)
    const t = opt.t || 0
    const flash = opt.flash || 0
    const dead = !!opt.dead
    const lunge = opt.lunge || 0        // 0..1 前冲强度
    const shake = flash > 0 ? (Math.random() - 0.5) * 12 : 0
    const dx = -lunge * 56 + shake

    ctx.save()
    if (dead) ctx.globalAlpha = 0.3

    if (img) {
      // 呼吸：轻微纵向缩放
      const breath = Math.sin(t * 3 + (opt.phase || 0)) * 0.025
      const h = targetH * (1 + breath)
      // 朝向：只用 `opt.flip` 一个开关 —— **true = 水平镜像这张图**。
      //
      // ⚠️⚠️ **这个参数前后坑过两次，改动前务必读完**（第 55 轮 + 第 56 轮）⚠️⚠️
      //   第 55 轮：参数叫 `faceLeft`，实现是 `faceLeft ? { flip: true } : undefined`
      //     —— 名字说的是"朝左"，干的却是"镜像"：素材本来就朝左的怪，一翻就朝右了。
      //     于是改名叫 `faceRight`（"画成朝右"）。
      //   第 56 轮（用户报「怪物还是反的」）：**叫 faceRight 一样会被读反**，调用处写的是
      //     `faceRight: !artFacesRight`，即"素材朝左的就翻" → 绿毒粘液兽（素材朝左、眼睛在左、
      //     鳍在右，见 `assets/monsters/labeled/mon_10003.png`）被翻成朝右，**背对玩家**。
      //   现在彻底不玩语义了：参数就叫 **`flip`**，只回答"这张图要不要镜像"。
      //   至于"谁该朝哪边"，由调用方按 `MONSTER_ART_FACES_RIGHT` 自己算 —— 见战斗里的调用。
      util.drawSprite(ctx, img, cx + dx, bottomY, h, opt.flip ? { flip: true } : undefined)

      // 受击闪白：在立绘实际范围内叠一层白色
      if (flash > 0) {
        const sc = h / img.naturalHeight
        const w = img.naturalWidth * sc
        ctx.save()
        ctx.globalAlpha = Math.min(0.7, flash * 1.8)
        ctx.fillStyle = '#ffffff'
        // 用椭圆近似立绘轮廓（比矩形自然，且不需要逐像素处理）
        ctx.beginPath()
        ctx.ellipse(cx + dx, bottomY - h * 0.45, w * 0.40, h * 0.42, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    } else {
      // 没有立绘时退化为按属性上色的圆（保底不空白）
      const col = D.ELEMENT_COLOR[mon.element] || '#ccc'
      const r = targetH * 0.30
      ctx.beginPath()
      ctx.ellipse(cx + dx, bottomY - r, r * 1.05, r * 1.2, 0, 0, Math.PI * 2)
      ctx.fillStyle = flash > 0 ? '#fff' : col
      ctx.fill()
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,14,8,.85)'; ctx.stroke()
      text.stroked(ctx, mon.element, cx + dx, bottomY - r + 8,
        { size: Math.round(r * 0.9), color: '#2a1d0a', align: 'center', stroke: 'rgba(255,255,255,.75)', lw: 3 })
    }
    ctx.restore()
    return !!img
  }

  G.core.bgImage = bgImage
  G.core.itemImage = itemImage
  G.core.monImage = monImage
  G.core.drawMonster = drawMonster
})()