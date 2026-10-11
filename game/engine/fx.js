/* 多克多比 · 技能特效系统
   原版没有可用的特效帧素材（只有 .fla 矢量源），所以用程序化绘制：
   每个技能按其性质播放不同的视觉表现 —— 火球就是一颗火球飞过去、
   冰枪是冰锥、闪电是折线、治愈是光环。

   坐标系：游戏画布 960×560，玩家在左下、敌人在右上。
*/
(() => {
  'use strict'
  const FX = window.DKDbbFx = {}

  // 技能 -> 特效配置
  //   kind: flame 火焰 / frost 冰霜 / bolt 雷电 / wind 风 / earth 土石 /
  //         dark 暗影 / light 圣光 / physical 物理 / poison 毒
  //   shape: ball 弹丸 / spear 尖锥 / bolt 折线 / wave 冲击波 / fall 天降 / aura 光环 / slash 斩击
  FX.SKILL_FX = {
    重击: { kind: 'physical', shape: 'slash', color: '#ffd9a0', color2: '#ff8a3c' },
    多重重击: { kind: 'physical', shape: 'slash', color: '#ffe6b8', color2: '#ff7a2c', multi: 3 },
    破甲: { kind: 'physical', shape: 'slash', color: '#cfd6e4', color2: '#8fa0c0', debuff: true },
    雷霆冲击: { kind: 'earth', shape: 'wave', color: '#ffd23f', color2: '#c98b2a', radius: 150 },
    火球: { kind: 'flame', shape: 'ball', color: '#ffdd66', color2: '#ff4d1a' },
    火雨: { kind: 'flame', shape: 'fall', color: '#ffb347', color2: '#ff3b1a', count: 9 },
    嗜血: { kind: 'flame', shape: 'aura', color: '#ff5f5f', color2: '#8a1a1a', onSelf: true },
    多重火球: { kind: 'flame', shape: 'ball', color: '#ffe98a', color2: '#ff2d00', multi: 4 },
    冰枪: { kind: 'frost', shape: 'spear', color: '#c9f2ff', color2: '#3fa9ff' },
    恢复: { kind: 'light', shape: 'aura', color: '#d8ffe0', color2: '#4dd97a', onSelf: true, heal: true },
    群体恢复: { kind: 'light', shape: 'aura', color: '#d8ffe0', color2: '#4dd97a', onSelf: true, heal: true, wide: true },
    清洁: { kind: 'light', shape: 'aura', color: '#fff6c8', color2: '#ffd23f', onSelf: true },
    地之咆哮: { kind: 'earth', shape: 'wave', color: '#e0b877', color2: '#8a5a20', radius: 170 },
    坚韧: { kind: 'earth', shape: 'aura', color: '#f0d9a8', color2: '#a8792f', onSelf: true },
    大地之怒: { kind: 'earth', shape: 'fall', color: '#e0b877', color2: '#7a4a10', count: 7 },
    闪电: { kind: 'bolt', shape: 'bolt', color: '#eaffff', color2: '#5ac8ff' },
    旋风: { kind: 'wind', shape: 'wave', color: '#c8ffd8', color2: '#3fd47a', radius: 160 },
  }

  // 兜底：按元素给一个默认特效
  FX.BY_ELEMENT = {
    火: { kind: 'flame', shape: 'ball', color: '#ffdd66', color2: '#ff4d1a' },
    水: { kind: 'frost', shape: 'spear', color: '#c9f2ff', color2: '#3fa9ff' },
    风: { kind: 'wind', shape: 'wave', color: '#c8ffd8', color2: '#3fd47a' },
    土: { kind: 'earth', shape: 'wave', color: '#e0b877', color2: '#8a5a20' },
    光: { kind: 'light', shape: 'aura', color: '#fff6c8', color2: '#ffd23f' },
    暗: { kind: 'dark', shape: 'ball', color: '#c98bff', color2: '#4a1a7a' },
    毒: { kind: 'poison', shape: 'ball', color: '#d4ff7a', color2: '#4a7a1a' },
    无: { kind: 'physical', shape: 'slash', color: '#ffd9a0', color2: '#ff8a3c' },
  }

  FX.configFor = function (skillName, element) {
    return FX.SKILL_FX[skillName] || FX.BY_ELEMENT[element] || FX.BY_ELEMENT['无']
  }

  // ---------- 特效实例 ----------
  // 一个实例 { cfg, t, dur, from, to, ents[] }
  FX.create = function (cfg, from, to, seed = 1) {
    const dur = cfg.shape === 'aura' ? 0.9
      : cfg.shape === 'fall' ? 1.1
        : cfg.shape === 'wave' ? 0.85
          : 0.8
    const fx = { cfg, t: 0, dur, from, to, seed, ents: [] }
    const n = cfg.multi || 1
    if (cfg.shape === 'ball' || cfg.shape === 'spear') {
      for (let i = 0; i < n; i++) {
        fx.ents.push({ delay: i * 0.12, x: from.x, y: from.y, prog: 0 })
      }
    } else if (cfg.shape === 'fall') {
      const cnt = cfg.count || 8
      for (let i = 0; i < cnt; i++) {
        const r = ((seed * 9301 + i * 49297) % 233280) / 233280
        const r2 = ((seed * 4523 + i * 7919) % 233280) / 233280
        fx.ents.push({
          delay: r * 0.5,
          x: to.x - 150 + r2 * 300,
          y: to.y - 190,
          tx: to.x - 150 + r2 * 300,
          ty: to.y - 30,
          prog: 0,
        })
      }
    } else if (cfg.shape === 'bolt') {
      fx.ents.push({ delay: 0, prog: 0, pts: null })
    }
    return fx
  }

  FX.update = function (fx, dt) {
    fx.t += dt
    if (fx.cfg.shape === 'ball' || fx.cfg.shape === 'spear') {
      for (const e of fx.ents) {
        if (fx.t < e.delay) continue
        e.prog = Math.min(1, (fx.t - e.delay) / (fx.dur - 0.2))
      }
    } else if (fx.cfg.shape === 'fall') {
      for (const e of fx.ents) {
        if (fx.t < e.delay) continue
        e.prog = Math.min(1, (fx.t - e.delay) / 0.5)
      }
    } else if (fx.cfg.shape === 'bolt') {
      fx.ents[0].prog = Math.min(1, fx.t / (fx.dur * 0.6))
    }
    return fx.t < fx.dur
  }

  // ---------- 绘制 ----------
  function lerp(a, b, k) { return a + (b - a) * k }

  // 特效辉光。【第 54 轮：为"看得清"加两层 —— 冷色外圈 + 白炽核心】
  //
  // 【为什么改】用户反馈「攻击画面的色彩有点不适合，就是战斗放技能的那个」。
  //   实测原因（`image_palette` 采样战斗截图）：**场景本身 62.9% 橙 + 12.8% 红 + 12.2% 黄**
  //   （暖褐色调），而技能辉光也是暖色（火黄→橙红）—— **特效与背景撞色**，
  //   于是技能看着"糊在一起、不够亮眼"。这不是配色不好看，是**对比度不够**。
  // 【怎么改】不换属性色（火还是火、冰还是冰），只加两层让它在暖背景里"跳出来"：
  //   ① **冷色外圈**：在辉光最外缘加一圈淡青白 —— 冷色与暖褐背景是互补关系，
  //      轮廓一下就清楚了（这也是 UI 里红蓝条能看清的同一个道理）；
  //   ② **白炽核心**：大一点的辉光中心补一层纯白，读起来像"高温发光"，
  //      而不是一坨均匀的橙色。半径小于 30 的粒子不加，否则小火星会变成白点。
  // 用户已明确「不需要完全像原版了，以玩家体验为主」，所以这一条按可读性优先处理。
  function glow(ctx, x, y, r, c1, c2, alpha = 1) {
    ctx.save()
    ctx.globalAlpha = alpha
    // ① 冷色外圈（略大于本体，做成"描边光"）
    const halo = ctx.createRadialGradient(x, y, r * 0.55, x, y, r * 1.25)
    halo.addColorStop(0, 'rgba(160,225,255,0)')
    halo.addColorStop(0.62, 'rgba(175,232,255,0.34)')
    halo.addColorStop(1, 'rgba(120,200,255,0)')
    ctx.fillStyle = halo
    ctx.beginPath(); ctx.arc(x, y, r * 1.25, 0, Math.PI * 2); ctx.fill()
    // ② 本体（属性色，不变）
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, c1)
    g.addColorStop(0.55, c2)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    // ③ 白炽核心（只有够大的辉光才加）
    if (r >= 30) {
      const core = ctx.createRadialGradient(x, y, 0, x, y, r * 0.42)
      core.addColorStop(0, 'rgba(255,255,255,0.85)')
      core.addColorStop(0.5, 'rgba(255,255,255,0.28)')
      core.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = core
      ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }

  // 火的拖尾粒子
  function flameTrail(ctx, x, y, r, cfg, k) {
    for (let i = 0; i < 10; i++) {
      const t = i / 10
      const px = x - t * r * 2.6, py = y + Math.sin(t * 9 + k * 10) * r * 0.35
      const rr = r * (1 - t * 0.75)
      ctx.globalAlpha = (1 - t) * 0.75
      ctx.fillStyle = t < 0.4 ? cfg.color : cfg.color2
      ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  FX.draw = function (ctx, fx) {
    const { cfg } = fx
    const k = Math.min(1, fx.t / fx.dur)

    if (cfg.shape === 'aura') {
      // 自身光环：从脚下升起的同心圆
      const { x, y } = fx.from
      const maxR = cfg.wide ? 130 : 90
      for (let i = 0; i < 3; i++) {
        const kk = Math.max(0, Math.min(1, k * 1.4 - i * 0.2))
        if (kk <= 0) continue
        const r = maxR * kk
        ctx.save()
        ctx.globalAlpha = (1 - kk) * 0.85
        ctx.strokeStyle = i === 0 ? cfg.color : cfg.color2
        ctx.lineWidth = 4 - i
        ctx.beginPath()
        ctx.ellipse(x, y, r, r * 0.38, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
      // 上升的光羽
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + k * 2
        const rr = maxR * 0.6 * k
        const px = x + Math.cos(a) * rr
        const py = y - k * 90 + Math.sin(a) * rr * 0.3 - 20
        ctx.save()
        ctx.globalAlpha = (1 - k) * 0.9
        ctx.fillStyle = i % 2 ? cfg.color : cfg.color2
        ctx.beginPath(); ctx.arc(px, py, 5 * (1 - k) + 2, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }
      return
    }

    if (cfg.shape === 'wave') {
      // 以目标为中心的冲击波（雷霆冲击、地之咆哮、旋风）
      const { x, y } = fx.to
      const R = cfg.radius || 150
      for (let i = 0; i < 3; i++) {
        const kk = Math.max(0, Math.min(1, k * 1.5 - i * 0.22))
        if (kk <= 0) continue
        const r = R * kk
        ctx.save()
        ctx.globalAlpha = (1 - kk) * 0.9
        ctx.strokeStyle = i === 0 ? cfg.color : cfg.color2
        ctx.lineWidth = 7 - i * 2
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2); ctx.stroke()
        ctx.restore()
      }
      // 碎块飞溅
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        const rr = R * 0.9 * k
        ctx.save()
        ctx.globalAlpha = (1 - k) * 0.9
        ctx.fillStyle = i % 2 ? cfg.color : cfg.color2
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.42 - k * 30
        ctx.beginPath(); ctx.arc(px, py, 4 * (1 - k) + 2, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }
      return
    }

    if (cfg.shape === 'bolt') {
      // 折线闪电，从玩家指向敌人
      const p = fx.ents[0].prog
      const x0 = fx.from.x, y0 = fx.from.y - 60
      const x1 = fx.to.x, y1 = fx.to.y - 40
      const segs = 7
      ctx.save()
      ctx.globalAlpha = p < 1 ? 0.95 : 0.5
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass === 0 ? cfg.color2 : cfg.color
        ctx.lineWidth = pass === 0 ? 9 : 4
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        for (let i = 1; i <= segs; i++) {
          const t = i / segs
          const jx = Math.sin(i * 12.9898 + fx.seed) * 22 * (1 - Math.abs(t - 0.5) * 1.4)
          const jy = Math.cos(i * 78.233 + fx.seed) * 16
          ctx.lineTo(lerp(x0, x1, Math.min(1, p * 1.2)) * t + x1 * (1 - t) * 0 + lerp(x0, x1, t), lerp(y0, y1, t) + jy)
        }
        ctx.stroke()
      }
      ctx.restore()
      glow(ctx, x1, y1, 60, cfg.color, cfg.color2, (1 - p) * 0.9)
      return
    }

    if (cfg.shape === 'fall') {
      for (const e of fx.ents) {
        if (e.prog <= 0) continue
        const x = e.x, y = lerp(e.y, e.ty, e.prog)
        glow(ctx, x, y, 26, cfg.color, cfg.color2, 0.95)
        ctx.save()
        ctx.globalAlpha = 0.9
        ctx.fillStyle = cfg.color
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
        // 落地环
        if (e.prog >= 1) {
          ctx.save()
          ctx.globalAlpha = 0.6
          ctx.strokeStyle = cfg.color2; ctx.lineWidth = 3
          ctx.beginPath(); ctx.ellipse(e.tx, e.ty, 30, 12, 0, 0, Math.PI * 2); ctx.stroke()
          ctx.restore()
        }
      }
      return
    }

    if (cfg.shape === 'slash') {
      // 物理斩击：几道弧形刀光
      const { x, y } = fx.to
      const n = cfg.multi || 2
      for (let i = 0; i < n; i++) {
        const kk = Math.max(0, Math.min(1, k * 1.6 - i * 0.25))
        if (kk <= 0) continue
        ctx.save()
        ctx.globalAlpha = (1 - kk) * 0.95
        ctx.strokeStyle = cfg.color2; ctx.lineWidth = 12
        ctx.beginPath(); ctx.arc(x, y - 30, 62, -1.1 + kk * 0.4, 0.5 + kk * 0.5); ctx.stroke()
        ctx.strokeStyle = cfg.color; ctx.lineWidth = 5
        ctx.beginPath(); ctx.arc(x, y - 30, 62, -1.1 + kk * 0.4, 0.5 + kk * 0.5); ctx.stroke()
        ctx.restore()
      }
      return
    }

    // ball / spear：从玩家飞向目标
    for (const e of fx.ents) {
      if (e.prog <= 0) continue
      const x = lerp(fx.from.x, fx.to.x, e.prog)
      const y = lerp(fx.from.y - 70, fx.to.y - 40, e.prog) - Math.sin(e.prog * Math.PI) * 40
      if (cfg.shape === 'spear') {
        // 冰锥：细长菱形 + 拖尾
        const ang = Math.atan2(fx.to.y - 40 - (fx.from.y - 70), fx.to.x - fx.from.x)
        ctx.save()
        ctx.translate(x, y); ctx.rotate(ang)
        ctx.fillStyle = cfg.color2
        ctx.beginPath()
        ctx.moveTo(34, 0); ctx.lineTo(-10, -9); ctx.lineTo(-24, 0); ctx.lineTo(-10, 9)
        ctx.closePath(); ctx.fill()
        ctx.fillStyle = cfg.color
        ctx.beginPath()
        ctx.moveTo(30, 0); ctx.lineTo(-8, -5); ctx.lineTo(-18, 0); ctx.lineTo(-8, 5)
        ctx.closePath(); ctx.fill()
        ctx.restore()
        glow(ctx, x, y, 34, cfg.color, cfg.color2, 0.7)
      } else {
        // 弹丸：按 kind 走不同画法
        if (cfg.kind === 'flame') {
          glow(ctx, x, y, 46, cfg.color, cfg.color2, 1)
          flameTrail(ctx, x, y, 14, cfg, k)
        } else if (cfg.kind === 'frost') {
          glow(ctx, x, y, 40, cfg.color, cfg.color2, 0.95)
          ctx.save(); ctx.fillStyle = cfg.color
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + k * 3
            ctx.beginPath()
            ctx.arc(x + Math.cos(a) * 14, y + Math.sin(a) * 14, 4, 0, Math.PI * 2); ctx.fill()
          }
          ctx.restore()
        } else if (cfg.kind === 'dark') {
          glow(ctx, x, y, 52, cfg.color2, '#1a0a2a', 1)
          ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = cfg.color
          ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill()
          ctx.globalAlpha = 0.6; ctx.fillStyle = '#1a0a2a'
          ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill()
          ctx.restore()
        } else if (cfg.kind === 'poison') {
          glow(ctx, x, y, 44, cfg.color, cfg.color2, 0.95)
          ctx.save(); ctx.fillStyle = cfg.color2
          for (let i = 0; i < 5; i++) {
            const a = k * 6 + i
            ctx.beginPath(); ctx.arc(x + Math.cos(a) * 12, y + Math.sin(a) * 12, 5, 0, Math.PI * 2); ctx.fill()
          }
          ctx.restore()
        } else {
          glow(ctx, x, y, 40, cfg.color, cfg.color2, 0.95)
        }
      }
      // 命中爆开
      if (e.prog >= 1) {
        const p = Math.min(1, (fx.t - (e.delay + fx.dur - 0.2)) / 0.25)
        if (p > 0) {
          glow(ctx, fx.to.x, fx.to.y - 40, 90 * p, cfg.color, cfg.color2, (1 - p) * 0.95)
          ctx.save()
          ctx.globalAlpha = (1 - p) * 0.9
          ctx.strokeStyle = cfg.color; ctx.lineWidth = 5
          ctx.beginPath()
          ctx.arc(fx.to.x, fx.to.y - 40, 26 + p * 46, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }
      }
    }
  }
})()
