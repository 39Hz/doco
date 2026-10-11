/* 多克多比 · 界面层：副本绘制（第 72 轮重构 · 批次 8 · 界面绘制）
   来源：原 game/game.js 的副本绘制整段（2171–3459，含 drawDungeon / drawDungeonList /
   drawDungeonStage / flipRects / dungeonListRects / moraleRects / evidenceLabel）。
   —— **只画不裁决**：不直接读存档（3 处 save.data 改经 G.app.saveData() 桥）、不算伤害。
   依赖：引擎 window.DKDbb（util / anim / text）+ window.DKDbbMouse（M）+ 内容表 window.DKDbbData（D）
        + 内核 G.core（ctx / W / H / drawMonster）+ 领域 G.domain.dungeonRules（MORALE_MOVES）
        + 应用层（ui → app，合规）：G.app.dungeon.* / G.app.minigames.* / G.app.awaken.*
        + 同层 G.ui（drawCrystalStage / drawFigure / drawBar）。
   ⚠ **挂载位置在 app 之后**（见 game.html）：本模块在**加载期**解构 app 层的值型导出
     （SKI / NOTE / FC / PL_W / BLOCK_COLORS / RUN_* / PIPE_SHAPES / PIPE_DIRS …），
     而 ui 默认排在 app 之前；app 模块对 ui 只有运行时惰性引用，故换序安全。
   只经 G.ui 出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const M = window.DKDbbMouse
  const D = window.DKDbbData
  const { util, anim, text } = window.DKDbb
  const { S, ctx, W, H, drawMonster } = G.core
  const { MORALE_MOVES } = G.domain.dungeonRules
  const saveData = () => G.app.saveData()

  const { dungeonState, curStage, dungeonClears, stealthSpotted, DUNGEON_STAGE_NAMES } = G.app.dungeon
  const {
    SKI, skiPass, NOTE, FC, ccParams, mrParams, srParams, bpParams, miniArena, bpGoalY,
    PL_W, PL_H, BLOCK_COLORS, RUN_BASE, RUN_MAX, blocksShape, blockCellRect, slideSolved,
    sumoView, sumoNextUnit, sumoAlive, fcArena,
  } = G.app.minigames
  const { slideRect, pipeConnected, pipeRect, pipeRotateBits, PIPE_SHAPES, PIPE_DIRS, quizRects } = G.app.awaken
  const { drawCrystalStage, drawFigure, drawBar } = G.ui

  function flipRects() {
    const w = 150, h = 190, gap = 26, n = 4
    const total = n * w + (n - 1) * gap
    const x0 = (W - total) / 2, y = 210
    return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), y, w, h }))
  }

  // 副本列表版式（14 项，两列）
  function dungeonListRects(list) {
    // 行高与间距要**给页脚留出空间**：14 项 = 7 行，7*(42+8) = 350，从 104 起 → 末行到 446，
    // 页脚从 470 往下排。早先用 ch=46/gap=10（末行到 486），页脚第一行压在了卡片下沿上（截图发现）。
    const cols = 2, cw = 430, ch = 42, gap = 8, x = 40, y = 104
    return list.map((_, i) => {
      const c = i % cols, r = Math.floor(i / cols)
      return { x: x + c * (cw + gap), y: y + r * (ch + gap), w: cw, h: ch }
    })
  }

  function drawDungeon() {
    ctx.fillStyle = '#070d1a'; ctx.fillRect(0, 0, W, H)
    const st = dungeonState()
    const d = D.dungeonById(st.id)
    if (!d || st.phase === 'list') { drawDungeonList(); return }

    // 小游戏跑在临时单关卡副本上 —— 标题别写成"副本"，那会让玩家以为是副本
    text.stroked(ctx, `${d.miniReward ? '小游戏' : '副本'} · ${d.name}`, W / 2, 46, { size: 26, align: 'center', color: '#ffd23f', lw: 8 })
    const stageList = d.stages.map((s, i) => `${i < st.idx ? '✓' : i === st.idx ? '▶' : '·'} ${DUNGEON_STAGE_NAMES[s.kind] || s.kind}`).join('　')
    text.stroked(ctx, d.miniReward ? `单关卡小游戏　出处：${evidenceLabel(d)}` : (stageList || '（无关卡）'), W / 2, 76,
      { size: 13, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })

    if (st.phase === 'stealth' || st.phase === 'morale' || st.phase === 'current' || st.phase === 'quiz'
      || st.phase === 'pipe' || st.phase === 'shooter' || st.phase === 'slide'
      || st.phase === 'blocks' || st.phase === 'runner'
      || st.phase === 'platformer' || st.phase === 'chargeshooter'
      || st.phase === 'ski' || st.phase === 'notes' || st.phase === 'flycatch'
      || st.phase === 'catch' || st.phase === 'mirror'
      || st.phase === 'soar' || st.phase === 'ballpush' || st.phase === 'sumo'
      || st.phase === 'crystal') { drawDungeonStage(); return }

    if (st.phase === 'memory') {
      const q = st.seq
      const s = curStage()
      text.stroked(ctx, s.label, W / 2, 140, { size: 22, align: 'center', color: '#ffe45e', lw: 6 })
      text.stroked(ctx, s.hint || '', W / 2, 168, { size: 13, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
      const arrow = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }
      if (q.showing) {
        const n = q.show.length
        const bw = 64, gap = 18, total = n * bw + (n - 1) * gap
        let x = (W - total) / 2
        const lit = Math.floor(q.t / 0.75) - 1
        for (let i = 0; i < n; i++) {
          const on = i === lit
          ctx.fillStyle = on ? 'rgba(255,210,63,.85)' : 'rgba(18,24,40,.85)'
          ctx.fillRect(x, 250, bw, bw)
          ctx.strokeStyle = on ? '#ffe45e' : 'rgba(255,255,255,.2)'; ctx.lineWidth = 2
          ctx.strokeRect(x + .5, 250.5, bw - 1, bw - 1)
          text.stroked(ctx, arrow[q.show[i]], x + bw / 2, 250 + bw / 2 + 12,
            { size: 30, align: 'center', color: on ? '#3a2a00' : '#cfe0ff', lw: 4 })
          x += bw + gap
        }
        text.stroked(ctx, '记住顺序…', W / 2, 460, { size: 15, align: 'center', color: '#ffd23f', lw: 4 })
      } else {
        const n = q.show.length
        const bw = 64, gap = 18, total = n * bw + (n - 1) * gap
        let x = (W - total) / 2
        for (let i = 0; i < n; i++) {
          const done = i < q.input.length
          ctx.fillStyle = done ? 'rgba(94,224,106,.28)' : 'rgba(18,24,40,.85)'
          ctx.fillRect(x, 250, bw, bw)
          ctx.strokeStyle = done ? '#5ee06a' : 'rgba(255,255,255,.2)'; ctx.lineWidth = 2
          ctx.strokeRect(x + .5, 250.5, bw - 1, bw - 1)
          if (done) text.stroked(ctx, arrow[q.input[i]], x + bw / 2, 250 + bw / 2 + 12,
            { size: 30, align: 'center', color: '#8ef0c0', lw: 4 })
          x += bw + gap
        }
        text.stroked(ctx, `请依次按出这 ${n} 个方向（方向键 / WASD）`, W / 2, 460,
          { size: 15, align: 'center', color: '#ffe45e', lw: 4 })
      }
      text.stroked(ctx, 'Backspace 放弃副本', W / 2, H - 24, { size: 12, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
      return
    }

    if (st.phase === 'battle') {
      text.stroked(ctx, '战斗中…', W / 2, H / 2, { size: 20, align: 'center', color: '#ff8a8a' })
      return
    }

    if (st.phase === 'flip') {
      const f = st.flip
      text.stroked(ctx, '通关！翻一张牌决定额外奖励', W / 2, 150, { size: 20, align: 'center', color: '#ffe45e', lw: 6 })
      const rects = flipRects()
      for (let i = 0; i < 4; i++) {
        const r = rects[i]
        const open = f.picked >= 0
        const isPicked = f.picked === i
        ctx.fillStyle = open ? (isPicked ? 'rgba(255,210,63,.22)' : 'rgba(18,24,40,.6)') : 'rgba(30,40,66,.95)'
        ctx.fillRect(r.x, r.y, r.w, r.h)
        ctx.strokeStyle = isPicked ? '#ffd23f' : ((S.flipSel || 0) === i && !open ? '#43d9c8' : 'rgba(255,255,255,.18)')
        ctx.lineWidth = isPicked || (S.flipSel || 0) === i ? 3 : 1
        ctx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1)
        if (open) {
          text.stroked(ctx, f.faces[i], r.x + r.w / 2, r.y + r.h / 2,
            { size: 20, align: 'center', color: isPicked ? '#ffe45e' : '#7c8aa5', lw: 5 })
        } else {
          text.stroked(ctx, '?', r.x + r.w / 2, r.y + r.h / 2,
            { size: 44, align: 'center', color: '#43d9c8', lw: 5 })
        }
      }
      if (f.picked >= 0 && f.reward) {
        text.stroked(ctx, `获得 金币 +${f.reward.gold}　彩晶石 +${f.reward.crystal}`,
          W / 2, 440, { size: 16, align: 'center', color: '#8ef0c0', lw: 4 })
        text.stroked(ctx, `★ 魅力 +${D.DUNGEON_COMMON_REWARD.charm}　勇气 +${D.DUNGEON_COMMON_REWARD.brave}（魅力只能从副本获得）`,
          W / 2, 466, { size: 14, align: 'center', color: '#ffd23f', lw: 4 })
        text.stroked(ctx, '空格 结算', W / 2, H - 24, { size: 13, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
      } else {
        text.stroked(ctx, '←→ 选择　空格 翻牌（也可以直接点）', W / 2, 440,
          { size: 14, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
      }
      return
    }

    if (st.phase === 'miniDone') {
      const r = st.miniResult || { name: '', got: [] }
      text.stroked(ctx, `${r.name}　完成！`, W / 2, 210,
        { size: 32, align: 'center', color: '#ffe45e', lw: 9 })
      let my = 262
      text.stroked(ctx, '本次获得', W / 2, my, { size: 16, align: 'center', color: '#9fb0cc', lw: 4 }); my += 30
      if (r.got && r.got.length) {
        for (const gt of r.got) { text.stroked(ctx, gt, W / 2, my, { size: 18, align: 'center', color: '#8ef0c0', lw: 4 }); my += 28 }
      } else {
        text.stroked(ctx, '（此游戏无奖励数据，按 R1 不发）', W / 2, my, { size: 14, align: 'center', color: '#c9a86a', lw: 3 }); my += 28
      }
      const a = saveData().attrs || {}
      text.stroked(ctx, `智慧 ${a.wisdom || 0}　勇气 ${a.brave || 0}　爱心 ${a.love || 0}　魅力 ${a.charm || 0}　声望 ${a.fame || 0}`,
        W / 2, H - 78, { size: 14, align: 'center', color: '#ffd23f', lw: 4 })
      text.stroked(ctx, `金币 ${saveData().gold || 0}　彩晶石 ${saveData().crystal || 0}`, W / 2, H - 52,
        { size: 13, align: 'center', color: '#cfe0ff', weight: 'normal', lw: 3 })
      text.stroked(ctx, '空格 返回小游戏列表', W / 2, H - 26, { size: 14, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
      return
    }

    if (st.phase === 'done' || st.phase === 'fail') {
      const win = st.phase === 'done'
      text.stroked(ctx, win ? '副本通关！' : '副本失败…', W / 2, 200,
        { size: 34, align: 'center', color: win ? '#ffe45e' : '#ff8a8a', lw: 9 })
      let y = 260
      for (const l of st.log) { text.stroked(ctx, l, W / 2, y, { size: 14, align: 'center', color: '#cfe0ff', lw: 3 }); y += 24 }
      if (win && st.result) {
        text.stroked(ctx, `第 ${st.result.clears} 次通关${st.result.first ? '（首次）' : ''}`, W / 2, y + 10,
          { size: 15, align: 'center', color: '#8ef0c0', lw: 4 })
      }
      const a = saveData().attrs || {}
      text.stroked(ctx, `智慧 ${a.wisdom || 0}　勇气 ${a.brave || 0}　爱心 ${a.love || 0}　魅力 ${a.charm || 0}　声望 ${a.fame || 0}`,
        W / 2, H - 70, { size: 14, align: 'center', color: '#ffd23f', lw: 4 })
      text.stroked(ctx, '空格 返回', W / 2, H - 30, { size: 14, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
    }
  }

  const CONF_LABEL_D = { official: '官方', derived: '推算', missing: '缺失' }
  const CONF_COLOR_D = { official: '#5ee06a', derived: '#ffd23f', missing: '#ff8a8a' }
  function drawDungeonList() {
    text.stroked(ctx, '副本 · 官方 14 个', W / 2, 46, { size: 26, align: 'center', color: '#ffd23f', lw: 8 })
    text.stroked(ctx, '↑↓ 选择　空格 进入　I/Esc 返回　每条都标了来源等级与出处',
      W / 2, 74, { size: 12.5, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
    const list = D.DUNGEONS
    const rects = dungeonListRects(list)
    for (let i = 0; i < list.length; i++) {
      const d = list[i], r = rects[i]
      const sel = (S.dunSel || 0) === i
      const clears = dungeonClears(d.id)
      const playable = d.stages.length > 0
      ctx.fillStyle = sel ? 'rgba(255,210,63,.16)' : (playable ? 'rgba(18,24,40,.8)' : 'rgba(30,18,24,.7)')
      ctx.fillRect(r.x, r.y, r.w, r.h)
      ctx.strokeStyle = sel ? '#ffd23f' : (playable ? 'rgba(255,255,255,.14)' : 'rgba(255,120,120,.35)')
      ctx.lineWidth = sel ? 2 : 1
      ctx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1)
      text.stroked(ctx, d.name, r.x + 12, r.y + 29, { size: 16, lw: 3, color: sel ? '#ffe45e' : '#e8eefc' })
      const lv = d.minLevel ? `建议 ${d.minLevel} 级` : '等级不限'
      text.stroked(ctx, `${lv}　${d.players}`, r.x + 130, r.y + 29, { size: 12, color: '#9fb0cc', weight: 'normal', lw: 3 })
      // 来源等级徽标
      text.stroked(ctx, CONF_LABEL_D[d.conf] || d.conf, r.x + r.w - 12, r.y + 18,
        { size: 12, align: 'right', color: CONF_COLOR_D[d.conf] || '#9fb0cc', lw: 3 })
      text.stroked(ctx, playable ? `关卡 ${d.stages.length}${clears ? `　通关 ${clears} 次` : ''}` : '玩法资料缺失',
        r.x + r.w - 12, r.y + 36, { size: 11, align: 'right', color: playable ? '#8ef0c0' : '#ff8a8a', weight: 'normal', lw: 3 })
    }
    const selD = list[util.clamp(S.dunSel || 0, 0, list.length - 1)]
    if (selD) {
      // 归档录像：文件名给出了原版小游戏的名字，但**画面没解读**（本机没有视频解码器）。
      // 必须显示出来 —— 否则玩家会把"通用记忆力关"当成原版玩法（R3：不许静默降级）。
      const vid = selD.videoEvidence
      const vidLine = vid
        ? `归档有本关录像 ${vid.files.length} 段${vid.names.length ? `：${vid.names.join(' / ')}` : ''}　画面未解读 → 玩法标 missing`
        : ''
      text.stroked(ctx, `出处：${selD.evidence || '—'}`, W / 2, vidLine ? H - 104 : H - 86,
        { size: 12, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
      if (vidLine) {
        text.stroked(ctx, vidLine, W / 2, H - 86,
          { size: 11.5, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
      }
      const note = selD.missingNote || selD.pvpNote || (selD.stages.find((x) => x.monNote) || {}).monNote || ''
      // 换行而不是硬 slice：说明句里带书名号与括注，截断会把括号截一半。
      // （早先直接画一行，结果跑出画面右边界 —— 见 _tools/ui-overlap.mjs 的越界检查）
      if (note) {
        const lines = text.wrap(ctx, note, W - 140, 11.5).slice(0, 2)
        lines.forEach((ln, i) => text.stroked(ctx, ln, W / 2, H - 64 + i * 16,
          { size: 11.5, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 }))
      }
      text.stroked(ctx, `掉落：${(selD.drop || []).join('　') || '—'}`, W / 2, H - 20,
        { size: 12, align: 'center', color: '#8ef0c0', weight: 'normal', lw: 3 })
    }
  }

  // 士气对抗的三个招式按钮位置（键盘与鼠标共用）
  function moraleRects() {
    const w = 180, h = 52, gap = 20, n = 3
    const total = n * w + (n - 1) * gap
    const x0 = (W - total) / 2, y = 330
    return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), y, w, h }))
  }

  // 出处标签：按**证据本身**写，不许写死。
  // 以前小游戏那一行固定写"归档原版截图（规则印在画面上）"，但第 44 轮的「飞翔的衣服」
  // 规则其实来自 7k7k 的官方攻略页 —— 写死就把出处说错了（R2 要求来源如实标）。
  function evidenceLabel(d) {
    const e = (d && d.evidence) || ''
    if (/归档/.test(e)) return '归档原版截图'
    if (/7k7k|5068/.test(e)) return '官方攻略/公告原文（7k7k·5068）'
    return '官方资料'
  }

  function drawDungeonStage() {
    const st = dungeonState()
    const s = curStage()
    if (!s) return    // 小游戏（临时单关卡副本）里，顶栏已经写了名字与出处 —— 这里不再重复大标题，
    // 只留规则原文，画面才不会"同一个名字出现三遍"。
    const dcur = D.dungeonById(st.id)
    const isMini = !!(dcur && dcur.miniReward)
    if (!isMini) {
      text.stroked(ctx, s.label, W / 2, 140, { size: 22, align: 'center', color: '#ffe45e', lw: 6 })
      text.stroked(ctx, s.hint || '', W / 2, 168, { size: 13, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
      // ★ 「这一关是替代品」必须当面告诉玩家（R3 不许静默降级）。
      // 有些关卡的玩法**原文根本没写**（机关密道 / 时空裂隙 / 凤凰的四道考验），
      // 我们用通用关顶上 —— 那就得说清楚，不能让玩家以为这就是原版玩法。
      if (s.standIn) {
        text.stroked(ctx, `⚠ ${s.standIn}`, W / 2, 190,
          { size: 11.5, align: 'center', color: '#ff9f6a', weight: 'normal', lw: 3 })
      }
    } else {
      // 官方规则那一行**必须自动换行**：第 44 轮的「飞翔的衣服」规则有 100 多字，
      // 单行居中画会直接溢出画面左右两边（截图核对时一眼就看出来了）。
      // 出处也改成按证据来源写 —— 以前写死"归档原版截图"，但这条规则其实来自 7k7k 攻略页，
      // 写死就等于把出处写错了（R2：来源等级要如实标）。
      if (s.hint) {
        const lines = text.wrap(ctx, `官方规则：${s.hint}`, W - 120, 14).slice(0, 2)
        lines.forEach((ln, i) => {
          text.stroked(ctx, ln, W / 2, 140 + i * 20,
            { size: 14, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
        })
      }
    }

    if (st.phase === 'ski') {
      const s = st.ski
      if (s.phase === 'balance') {
        // 平衡条：中间是安全区，风会把你吹偏（原文「看 ←→ 箭头位置用 ←→ 控制平衡」）
        const bw = 560, bx = W / 2 - bw / 2, by = 250
        ctx.fillStyle = 'rgba(18,24,40,.85)'; ctx.fillRect(bx, by, bw, 22)
        ctx.fillStyle = 'rgba(94,224,106,.16)'
        ctx.fillRect(bx + bw * 0.18, by, bw * 0.64, 22)
        ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1
        ctx.strokeRect(bx + .5, by + .5, bw - 1, 21)
        const mx = bx + bw * util.clamp(s.balance, 0, 1)
        ctx.fillStyle = Math.abs(s.balance - 0.5) > 0.32 ? '#ff8a8a' : '#ffd23f'
        ctx.fillRect(mx - 6, by - 8, 12, 38)
        text.stroked(ctx, '←→ 控制平衡', W / 2, by - 26, { size: 15, align: 'center', color: '#ffe45e', lw: 4 })
        text.stroked(ctx, `稳住 ${SKI.balanceSec.toFixed(0)} 秒就起跳（已经摔倒 ${s.stumbles} 次）`,
          W / 2, by + 44, { size: 12.5, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
      } else if (s.phase === 'takeoff') {
        // 起跳位置：黄色区、红色区（红色跳的最远）
        const gw = 600, gx = W / 2 - gw / 2, gy = 280
        ctx.fillStyle = 'rgba(18,24,40,.85)'; ctx.fillRect(gx, gy, gw, 26)
        ctx.fillStyle = 'rgba(255,210,63,.55)'; ctx.fillRect(gx + gw * 0.54, gy, gw * 0.20, 26)
        ctx.fillStyle = 'rgba(255,90,90,.65)'; ctx.fillRect(gx + gw * 0.74, gy, gw * 0.14, 26)
        const px = gx + gw * s.pointer
        ctx.fillStyle = '#ffffff'; ctx.fillRect(px - 2, gy - 10, 4, 46)
        text.stroked(ctx, '↑ 在黄色/红色位置起跳（红色跳的最远）', W / 2, gy - 30,
          { size: 15, align: 'center', color: '#ffe45e', lw: 4 })
      } else if (s.phase === 'trick') {
        // 图标进圈时按对应方向键（原文「当图标进入 ○ 的时候按相应的方向键做出动作」）
        const cx = W / 2, cy = 300
        const arrow = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' }
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3
        ctx.beginPath(); ctx.arc(cx, cy, 92, 0, 6.2832); ctx.stroke()
        ctx.strokeStyle = s.ring <= 0.32 ? '#5ee0ff' : '#ffd23f'; ctx.lineWidth = 3
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(10, 92 * s.ring), 0, 6.2832); ctx.stroke()
        text.stroked(ctx, arrow[s.want] || '?', cx, cy + 12,
          { size: 40, align: 'center', color: '#ffe45e', lw: 8 })
        text.stroked(ctx, '圈缩到图标大小时按下对应的方向键', W / 2, cy + 130,
          { size: 13, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
      } else {
        text.stroked(ctx, `滑行距离 ${s.total} 米`, W / 2, 260,
          { size: 26, align: 'center', color: s.total >= skiPass() ? '#5ee06a' : '#ff8a8a', lw: 8 })
        text.stroked(ctx, `起跳品质 ${s.quality === 'red' ? '红色（最远）' : s.quality === 'yellow' ? '黄色' : '没踩中'}`
          + `　空中动作 +${s.trick}　摔倒 ${s.stumbles} 次`,
          W / 2, 300, { size: 13.5, align: 'center', color: '#cfe0ff', lw: 3 })
      }
      const sMsg = s.msgT > 0 ? s.msg : (s.over && s.total < skiPass() ? '没到过关线 —— 按空格再来一次' : '')
      if (sMsg) text.stroked(ctx, sMsg, W / 2, H - 48, { size: 14, align: 'center', color: '#8ef0c0', lw: 4 })
      text.stroked(ctx, `过关线 ${SKI.pass} 米 —— 三段玩法都来自官方规则，每段时长/速度/距离为推算（不编评级）`,
        W / 2, H - 22, { size: 11, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
      return
    }

    if (st.phase === 'notes') {
      const n = st.nt
      const laneW = 110, gap = 12
      const totalW = n.lanes * laneW + (n.lanes - 1) * gap
      const x0 = (W - totalW) / 2
      // 五条琴键
      for (let i = 0; i < n.lanes; i++) {
        const x = x0 + i * (laneW + gap)
        const on = n.finger === i
        ctx.fillStyle = on ? 'rgba(255,210,63,.20)' : 'rgba(255,255,255,.06)'
        ctx.fillRect(x, 190, laneW, 300)
        ctx.strokeStyle = on ? '#ffd23f' : 'rgba(255,255,255,.14)'
        ctx.lineWidth = on ? 2 : 1
        ctx.strokeRect(x + .5, 190.5, laneW - 1, 299)
      }
      // 判定线
      ctx.strokeStyle = 'rgba(94,224,255,.7)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(x0 - 10, NOTE.hitY); ctx.lineTo(x0 + totalW + 10, NOTE.hitY); ctx.stroke()
      // 音符：从上方滑下来
      for (const b of n.list) {
        if (b.hit) continue
        const dt2 = b.at - n.t
        if (dt2 < -0.25 || dt2 > NOTE.span) continue
        const y = NOTE.hitY - (dt2 / NOTE.span) * 260
        const x = x0 + b.lane * (laneW + gap) + laneW / 2
        ctx.fillStyle = b.missed ? 'rgba(255,120,120,.35)' : '#7ee0ff'
        ctx.beginPath(); ctx.arc(x, y, 15, 0, 6.2832); ctx.fill()
        ctx.fillStyle = 'rgba(20,30,48,.85)'
        ctx.fillRect(x - 2, y - 10, 4, 20)
      }
      // 手指（左右键控制）
      const fx = x0 + n.finger * (laneW + gap) + laneW / 2
      ctx.fillStyle = '#ffd23f'
      ctx.beginPath(); ctx.arc(fx, 168, 12, 0, 6.2832); ctx.fill()
      text.stroked(ctx, `命中 ${n.hits}/${n.need}　连击 ${n.combo}（最高 ${n.bestCombo}）`,
        W / 2, H - 72, { size: 14, align: 'center', color: '#ffe45e', lw: 4 })
      const nMsg = n.msgT > 0 ? n.msg : '←→ 移动手指　↓ 弹奏'
      text.stroked(ctx, nMsg, W / 2, H - 48,
        { size: 14, align: 'center', color: n.msgT > 0 ? '#8ef0c0' : '#9fb0cc', lw: 4 })
      text.stroked(ctx, `弹对 ${n.need} 个通关 —— 操作来自官方截图；判定窗口为推算；评分规则官方没给，故不做评级`,
        W / 2, H - 22, { size: 11, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
      return
    }

    if (st.phase === 'crystal') { drawCrystalStage(); return }

    if (st.phase === 'sumo') {
      const g = st.su
      const V = sumoView()
      const m = V.m
      const P = D.SUMO.phys
      const S = (x) => V.ox + x * V.k
      const T = (y) => V.oy + y * V.k
      const R = (r) => r * V.k
      // 河（先把整屏画成水，再把能站的陆地盖上去 —— 这样"长方形＝四周是河"天然画对）
      ctx.fillStyle = '#123a5c'
      ctx.fillRect(0, 176, W, H - 176 - 84)
      ctx.strokeStyle = 'rgba(126,224,255,.18)'; ctx.lineWidth = 1
      for (let i = 0; i < 26; i++) {
        const wy = 186 + (i * 17) % (H - 270)
        ctx.beginPath(); ctx.moveTo(0, wy); ctx.lineTo(W, wy + 4); ctx.stroke()
      }
      // 陆地
      const land = (x, y, w, h) => {
        ctx.fillStyle = '#3d6b3a'
        ctx.fillRect(S(x), T(y), w * V.k, h * V.k)
        ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2
        ctx.strokeRect(S(x) + .5, T(y) + .5, w * V.k - 1, h * V.k - 1)
      }
      if (m.river === 'middle' && m.bridge) {
        land(0, 0, m.w, m.bridge.y)
        land(0, m.bridge.y + m.bridge.h, m.w, m.h - (m.bridge.y + m.bridge.h))
        land(m.bridge.x, m.bridge.y, m.bridge.w, m.bridge.h)   // 桥
        text.stroked(ctx, '桥', S(m.bridge.x + m.bridge.w / 2), T(m.bridge.y + m.bridge.h / 2) + 5,
          { size: 12, align: 'center', color: '#ffe45e', lw: 3 })
      } else {
        land(0, 0, m.w, m.h)
      }
      // 障碍（官方：石头 / 树木 / 墓碑，可以抵挡攻击、也能被打碎）
      for (const o of g.obstacles) {
        if (o.broken) continue
        const x = S(o.x), y = T(o.y), r = R(o.r)
        ctx.fillStyle = o.kind === '树木' ? '#2f7d3a' : o.kind === '墓碑' ? '#8b8b95' : '#7a6a55'
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 2; ctx.stroke()
        if (o.hp < o.maxHp) {
          ctx.fillStyle = 'rgba(0,0,0,.45)'
          ctx.fillRect(x - r, y - r - 7, r * 2, 4)
          ctx.fillStyle = '#ffd23f'
          ctx.fillRect(x - r, y - r - 7, r * 2 * (o.hp / o.maxHp), 4)
        }
      }
      // 光波
      for (const w of g.waves) {
        ctx.fillStyle = w.kind === 'heal' ? 'rgba(94,224,106,.85)' : 'rgba(126,224,255,.9)'
        ctx.beginPath(); ctx.arc(S(w.x), T(w.y), Math.max(3, R(P.waveR) * (w.kind === 'heal' ? w.life / 0.6 : 1)), 0, Math.PI * 2); ctx.fill()
      }
      // 多比
      for (const u of g.units) {
        if (!u.alive) continue
        const x = S(u.x), y = T(u.y)
        const col = D.SUMO_TYPE_COLOR[u.typeId] || '#ccc'
        ctx.save()
        if (u.hitFlash > 0) ctx.globalAlpha = 0.75
        ctx.beginPath(); ctx.ellipse(x, y + R(4), R(20), R(7), 0, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.fill()
        // 有官方立绘就画立绘（玩家的多比都有），没有就画类型色块（官方代表多比在归档里没立绘）
        let drew = false
        if (u.form && u.form.art) {
          const img = anim.getFrame({ dir: u.form.spriteDir, action: u.form.actionIdle, frames: 1 }, 0)
          if (img) { util.drawSprite(ctx, img, x, y + R(26), R(58)); drew = true }
        }
        if (!drew) {
          ctx.beginPath(); ctx.arc(x, y, R(20), 0, Math.PI * 2)
          ctx.fillStyle = u.hitFlash > 0 ? '#fff' : col; ctx.fill()
          ctx.strokeStyle = 'rgba(20,14,8,.8)'; ctx.lineWidth = 2; ctx.stroke()
        }
        ctx.restore()
        // 血条
        const bw = R(40)
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x - bw / 2, y - R(32), bw, 5)
        ctx.fillStyle = u.side === 'mine' ? '#5ee06a' : '#ff7a7a'
        ctx.fillRect(x - bw / 2, y - R(32), bw * Math.max(0, u.hp / u.maxHp), 5)
        text.stroked(ctx, u.name.replace(/\s*多比$/, ''), x, y - R(38),
          { size: 11, align: 'center', color: u.side === 'mine' ? '#cfe0ff' : '#ffc9c9', lw: 3 })
        if (g.aiming && g.aiming.uid === u.uid) {
          ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2
          ctx.beginPath(); ctx.arc(x, y, R(26), 0, Math.PI * 2); ctx.stroke()
        }
      }
      // 拉弓箭头（官方：箭头方向与大小就是发射方向与力度）
      if (g.aiming) {
        const u = g.units.find((x) => x.uid === g.aiming.uid)
        if (u) {
          const a = g.aiming
          const len = 60 + a.power * 190
          const x0 = S(u.x), y0 = T(u.y)
          const x1 = x0 + a.dx * len * V.k, y1 = y0 + a.dy * len * V.k
          ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
          const ang = Math.atan2(y1 - y0, x1 - x0)
          ctx.fillStyle = '#ffd23f'
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x1 - Math.cos(ang - 0.4) * 14, y1 - Math.sin(ang - 0.4) * 14)
          ctx.lineTo(x1 - Math.cos(ang + 0.4) * 14, y1 - Math.sin(ang + 0.4) * 14)
          ctx.closePath(); ctx.fill()
          // 力度条
          text.stroked(ctx, `力度 ${Math.round(a.power * 100)}%`, W / 2, H - 74,
            { size: 13, align: 'center', color: '#ffd23f', lw: 4 })
        }
      }
      // 飘字
      for (const f of g.fx) {
        if (f.ring) {
          ctx.strokeStyle = f.color; ctx.lineWidth = 3
          ctx.beginPath(); ctx.arc(S(f.x), T(f.y), R(f.r) * (1.2 - f.t), 0, Math.PI * 2); ctx.stroke()
        } else if (f.text) {
          text.stroked(ctx, f.text, S(f.x), T(f.y) - 24 + (0.8 - f.t) * 40,
            { size: 14, align: 'center', color: f.color, lw: 4 })
        }
      }
      // HUD
      const next = sumoNextUnit()
      const mineLeft = sumoAlive('mine').length, foeLeft = sumoAlive('foe').length
      text.stroked(ctx, `${m.name}地图　我方 ${mineLeft} : ${foeLeft} 对方`, W / 2, H - 74,
        { size: 15, align: 'center', color: '#ffe45e', lw: 4 })
      const hint = g.msgT > 0 ? g.msg
        : (next && next.side === 'mine'
          ? `轮到「${next.name.replace(/\s*多比$/, '')}」（${next.typeName}）—— 点它拉弓，松手发射`
          : '对手思考中…')
      text.stroked(ctx, hint, W / 2, H - 50, { size: 13.5, align: 'center', color: g.msgT > 0 ? '#8ef0c0' : '#9fb0cc', lw: 3 })
      text.stroked(ctx, '玩法来自官方攻略（弹弓拉弓 · 撞进河里淘汰 · 四类多比 · 两种地图 · 障碍可挡可碎）；每边 4 只与各项数值为推算',
        W / 2, H - 24, { size: 11, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
      return
    }

    if (st.phase === 'flycatch') {
      const g = st.fc
      const a = fcArena()
      const C = FC()
      // 房间地板／墙面：让人看出衣服是在一个屋子里飞（官方："服装店…各归各位"）
      ctx.fillStyle = 'rgba(255,255,255,.04)'
      ctx.fillRect(a.x0, a.y0, a.x1 - a.x0, a.y1 - a.y0)
      ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 2
      ctx.strokeRect(a.x0 + .5, a.y0 + .5, a.x1 - a.x0 - 1, a.y1 - a.y0 - 1)
      // 衣服（飞）：三套配色轮换，画出衣架轮廓
      const FC_COL = ['#7ee0ff', '#ffd23f', '#ff9ecb']
      for (const c of g.clothes) {
        if (c.got) continue
        const col = FC_COL[c.kind % FC_COL.length]
        ctx.save()
        ctx.translate(c.x, c.y)
        ctx.rotate(Math.sin(c.spin) * 0.5)
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.moveTo(-c.r * 0.7, -c.r * 0.5)
        ctx.lineTo(c.r * 0.7, -c.r * 0.5)
        ctx.lineTo(c.r * 0.45, c.r * 0.7)
        ctx.lineTo(-c.r * 0.45, c.r * 0.7)
        ctx.closePath(); ctx.fill()
        ctx.strokeStyle = 'rgba(20,26,40,.75)'; ctx.lineWidth = 2; ctx.stroke()
        // 衣架钩
        ctx.beginPath(); ctx.arc(0, -c.r * 0.62, 4, Math.PI, Math.PI * 2); ctx.stroke()
        ctx.restore()
      }
      // 网子：正在落下的（网口从小张到大）与刚合拢的（网口实线 + 打钩）
      // 注意：这里**不用 setLineDash** —— 无头测试台与像素截图用的假 canvas 都没有这个方法，
      // 用了会直接抛异常（第 44 轮实测：小游戏体检整轮崩在 setLineDash is not a function）。
      // 改成"圆环 + 放射网线"，任何渲染器下长得一样。
      const R = (C.netR || 34) * (g.radMul || 1)
      for (const n of g.nets) {
        const prog = Math.min(1, n.t / (C.netDelay || 0.4))
        const rr = n.closed ? R : R * (0.5 + prog * 0.5)
        ctx.strokeStyle = n.closed ? (n.got ? '#5ee06a' : 'rgba(255,255,255,.35)') : '#cfe0ff'
        ctx.lineWidth = n.closed ? 3 : 2
        ctx.beginPath(); ctx.arc(n.x, n.y, rr, 0, Math.PI * 2); ctx.stroke()
        if (!n.closed) {
          ctx.lineWidth = 1
          for (let k = 0; k < 8; k++) {
            const an = (Math.PI * 2 * k) / 8 + prog * 1.2
            ctx.beginPath()
            ctx.moveTo(n.x + Math.cos(an) * rr * 0.35, n.y + Math.sin(an) * rr * 0.35)
            ctx.lineTo(n.x + Math.cos(an) * rr, n.y + Math.sin(an) * rr)
            ctx.stroke()
          }
        }
      }
      // 光标处的网（待下）
      if (M.inside) {
        ctx.strokeStyle = 'rgba(255,226,94,.85)'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(M.x, M.y, R, 0, Math.PI * 2); ctx.stroke()
        ctx.lineWidth = 1
        for (let k = 0; k < 8; k++) {
          const an = (Math.PI * 2 * k) / 8
          ctx.beginPath()
          ctx.moveTo(M.x + Math.cos(an) * R * 0.4, M.y + Math.sin(an) * R * 0.4)
          ctx.lineTo(M.x + Math.cos(an) * R, M.y + Math.sin(an) * R)
          ctx.stroke()
        }
        ctx.beginPath()
        ctx.moveTo(M.x - 9, M.y); ctx.lineTo(M.x + 9, M.y)
        ctx.moveTo(M.x, M.y - 9); ctx.lineTo(M.x, M.y + 9)
        ctx.stroke()
      }
      const left = g.clothes.filter((c) => !c.got).length
      text.stroked(ctx, `第 ${g.level} 关　还剩 ${left}/${g.count} 件　已过 ${g.cleared}/${g.passLevels} 关　时间 ${Math.max(0, g.timeLeft).toFixed(1)}s`,
        W / 2, H - 72, { size: 14, align: 'center', color: g.timeLeft < 5 ? '#ff9e9e' : '#ffe45e', lw: 4 })
      const fcMsg = g.msgT > 0 ? g.msg
        : `鼠标移动网子　点击下网（网要 ${(C.netDelay || 0.4).toFixed(2)} 秒才合拢 —— 按衣服飞的方向提前下）`
      text.stroked(ctx, fcMsg, W / 2, H - 48,
        { size: 13.5, align: 'center', color: g.msgT > 0 ? '#8ef0c0' : '#9fb0cc', lw: 4 })
      text.stroked(ctx, '玩法来自官方攻略（衣服满天飞·用网子抓·要提前下网·越后面越多越快·限时抓完）；件数/速度/限时为推算',
        W / 2, H - 22, { size: 11, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
      return
    }

    if (st.phase === 'catch') {
      // 「哈里的金币」：金币下落 → 二维移动箱子去接
      const g = st.cc, C = ccParams(), a = miniArena()
      // 场地
      ctx.save()
      ctx.fillStyle = 'rgba(10,16,30,.55)'
      ctx.fillRect(a.x0, a.y0, a.x1 - a.x0, a.y1 - a.y0)
      ctx.restore()
      // 金币
      for (const c of g.coins) {
        if (c.got || c.miss) continue
        ctx.save()
        ctx.fillStyle = '#ffd23f'
        ctx.beginPath(); ctx.ellipse(c.x, c.y, c.r, c.r * 0.86, 0, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2; ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,.45)'
        ctx.beginPath(); ctx.ellipse(c.x - 3, c.y - 3, 3, 2, 0, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }
      // 箱子（二维移动：画成一个开口朝上的筐）
      const hw = (C.boxW || 76) / 2, hh = (C.boxH || 34) / 2
      ctx.save()
      ctx.fillStyle = '#8a5a2b'
      ctx.fillRect(g.x - hw, g.y - hh, hw * 2, hh * 2)
      ctx.fillStyle = '#b8793a'
      ctx.fillRect(g.x - hw, g.y - hh, hw * 2, 6)
      ctx.strokeStyle = '#5c3a18'; ctx.lineWidth = 2
      ctx.strokeRect(g.x - hw, g.y - hh, hw * 2, hh * 2)
      ctx.restore()
      // 进度与提示
      text.stroked(ctx, `第 ${g.level} 关　接住 ${g.got}/${C.target || 8}　已掉 ${g.dropped}/${C.needPerLevel || 15}`,
        W / 2, H - 72, { size: 15, align: 'center', color: '#ffe45e', lw: 4 })
      const ccMsg = g.msgT > 0 ? g.msg : '方向键 / WASD 移动箱子（上下左右都能动 —— 官方技巧就是"按住四个方向键不松"）'
      text.stroked(ctx, ccMsg, W / 2, H - 48,
        { size: 13, align: 'center', color: g.msgT > 0 ? '#8ef0c0' : '#9fb0cc', lw: 4 })
      text.stroked(ctx, '玩法来自官方攻略（金币掉进箱子·后面速度越来越快·地点多比大街·NPC 华多）；接住几个算过/速度曲线为推算',
        W / 2, H - 22, { size: 11, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
      return
    }

    if (st.phase === 'mirror') {
      // 「魔镜世界」：躲怪物 + 开箱子 + 找钥匙；方向被镜像
      const g = st.mr, C = mrParams(), a = miniArena()
      ctx.save()
      ctx.fillStyle = 'rgba(10,16,30,.55)'
      ctx.fillRect(a.x0, a.y0, a.x1 - a.x0, a.y1 - a.y0)
      // 镜子格纹，让"魔镜"这件事看得见
      ctx.strokeStyle = 'rgba(120,180,255,.10)'; ctx.lineWidth = 1
      for (let x = a.x0; x < a.x1; x += 40) { ctx.beginPath(); ctx.moveTo(x, a.y0); ctx.lineTo(x, a.y1); ctx.stroke() }
      for (let y = a.y0; y < a.y1; y += 40) { ctx.beginPath(); ctx.moveTo(a.x0, y); ctx.lineTo(a.x1, y); ctx.stroke() }
      ctx.restore()
      // 箱子（开过的画成敞开）
      for (const c of g.crates) {
        ctx.save()
        ctx.fillStyle = c.opened ? '#4a4a55' : '#8a5a2b'
        ctx.fillRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h)
        ctx.strokeStyle = c.opened ? '#2a2a33' : '#5c3a18'; ctx.lineWidth = 2
        ctx.strokeRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h)
        ctx.fillStyle = c.opened ? '#6a6a78' : '#d8b26a'
        ctx.fillRect(c.x - c.w / 2, c.y - c.h / 2, c.w, 5)
        ctx.restore()
      }
      // 出口（开箱 + 拿钥匙后才打开）
      {
        const e = g.exit
        ctx.save()
        ctx.fillStyle = e.open ? 'rgba(94,224,106,.22)' : 'rgba(120,120,140,.16)'
        ctx.fillRect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h)
        ctx.strokeStyle = e.open ? '#5ee06a' : 'rgba(200,200,220,.35)'
        ctx.lineWidth = e.open ? 3 : 2
        ctx.strokeRect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h)
        ctx.restore()
        text.stroked(ctx, e.open ? '出口' : '锁着', e.x, e.y + 5,
          { size: 13, align: 'center', color: e.open ? '#8ef0c0' : '#8b93a6', lw: 4 })
      }
      // 钥匙（拿到后在左上角用**文字**标出 —— 不能用 emoji：字形图集是按源码字符集生成的，
      // 而 emoji 不在图集里，画出来是空白；test-glyphs 会把它报成"缺 1 个字"）
      if (g.hasKey) {
        text.stroked(ctx, '钥匙已到手', a.x0 + 62, a.y0 + 26, { size: 14, align: 'center', color: '#ffe45e', lw: 4 })
      }
      // 怪物（固定路线往返）
      for (const m of g.mons) {
        ctx.save()
        ctx.fillStyle = g.hurtT > 0 ? 'rgba(255,120,120,.95)' : 'rgba(160,90,220,.92)'
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#1a1024'
        ctx.beginPath(); ctx.arc(m.x - 6, m.y - 4, 3.4, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(m.x + 6, m.y - 4, 3.4, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }
      // 玩家
      ctx.save()
      ctx.fillStyle = '#43d9c8'
      ctx.beginPath(); ctx.arc(g.px, g.py, g.r, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#1a6b62'; ctx.lineWidth = 2.5; ctx.stroke()
      ctx.restore()
      text.stroked(ctx, `箱子 ${g.opened}/${g.crates.length}　钥匙 ${g.hasKey ? '已拿到' : '还没找到'}　时间 ${Math.max(0, g.timeLeft).toFixed(0)}s`,
        W / 2, H - 72, { size: 15, align: 'center', color: '#ffe45e', lw: 4 })
      const mrMsg = g.msgT > 0 ? g.msg : (g.exit.open ? '走到右上角的出口' : '方向键会被镜像（↑=↓　←=→）—— 攻略页的原话是"把键盘颠倒180度"')
      text.stroked(ctx, mrMsg, W / 2, H - 48,
        { size: 13, align: 'center', color: g.msgT > 0 ? '#8ef0c0' : '#9fb0cc', lw: 4 })
      text.stroked(ctx, '目的"躲怪物+开箱子+找钥匙"与地点/NPC 来自官方攻略页；"方向镜像"是从攻略建议反推的解读（V68）；箱数/速度为推算',
        W / 2, H - 22, { size: 11, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
      return
    }

    if (st.phase === 'soar') {
      // 「冲上云霄」：世界往上滚，泡泡是落脚点，大雁是会动的陷阱
      const g = st.sr, C = srParams()
      // 镜头：让玩家保持在偏下的位置，越往上爬看到的越高
      const cam = Math.max(0, (H - 300) - g.y)
      const sy = (y) => y + cam
      // 泡泡
      for (const b of g.bubbles) {
        const y = sy(b.y)
        if (y < 80 || y > H + 40) continue
        ctx.save()
        ctx.fillStyle = b.used ? 'rgba(120,200,255,.22)' : 'rgba(150,220,255,.55)'
        ctx.beginPath(); ctx.arc(b.x, y, b.r, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = 'rgba(220,245,255,.75)'; ctx.lineWidth = 2; ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,.5)'
        ctx.beginPath(); ctx.arc(b.x - b.r * 0.3, y - b.r * 0.35, b.r * 0.22, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }
      // 大雁（会动 —— 官方"大雁什么的最好不要跳…它会动"）
      for (const go of g.geese) {
        const y = sy(go.y)
        if (y < 80 || y > H + 40) continue
        ctx.save()
        ctx.fillStyle = '#c9a86a'
        ctx.beginPath(); ctx.ellipse(go.x, y, 30, 12, 0, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.ellipse(go.x + go.dir * 26, y - 10, 9, 7, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#6b4f1d'
        ctx.beginPath(); ctx.moveTo(go.x + go.dir * 33, y - 12); ctx.lineTo(go.x + go.dir * 42, y - 9); ctx.lineTo(go.x + go.dir * 33, y - 6); ctx.fill()
        ctx.restore()
      }
      // 玩家
      ctx.save()
      ctx.fillStyle = '#43d9c8'
      ctx.beginPath(); ctx.ellipse(g.x, sy(g.y) - 16, 16, 18, 0, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#1a6b62'; ctx.lineWidth = 2.5; ctx.stroke()
      ctx.restore()
      text.stroked(ctx, `${g.score.toLocaleString()} / ${(C.target || 50000).toLocaleString()} 分　踩了 ${g.jumped} 个泡泡　时间 ${Math.max(0, g.timeLeft).toFixed(0)}s`,
        W / 2, H - 72, { size: 15, align: 'center', color: '#ffe45e', lw: 4 })
      const srMsg = g.msgT > 0 ? g.msg : '← → 移动　空格/↑ 跳上泡泡（大雁会动，踩不住）'
      text.stroked(ctx, srMsg, W / 2, H - 48, { size: 13, align: 'center', color: g.msgT > 0 ? '#8ef0c0' : '#9fb0cc', lw: 4 })
      text.stroked(ctx, '玩法来自官方攻略页（踩泡泡往上跳·大雁会动·掉下来重来）；50000 分目标是官方原话，每跳 1200 分为推算',
        W / 2, H - 22, { size: 11, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
      return
    }

    if (st.phase === 'ballpush') {
      // 「极限顶顶球」：两侧瓶子 + 球 + 玩家/AI，把球顶进对方瓶子
      const g = st.bp, C = bpParams()
      const x0 = C.fieldX0 || 150, x1 = C.fieldX1 || 810, gy = C.groundY || 470
      const pw = C.playerW || 44, ph = C.playerH || 56, gw = C.goalW || 26, gh = C.goalH || 120
      // 场地
      ctx.save()
      ctx.fillStyle = 'rgba(10,16,30,.6)'
      ctx.fillRect(x0 - gw, bpGoalY(), (x1 - x0) + gw * 2, gy - bpGoalY() + 10)
      // 两侧瓶子（球门口）
      ctx.fillStyle = 'rgba(255,120,120,.30)'      // 我方瓶子（左）
      ctx.fillRect(x0, bpGoalY(), gw, gh)
      ctx.fillStyle = 'rgba(120,200,255,.30)'      // 对方瓶子（右）
      ctx.fillRect(x1 - gw, bpGoalY(), gw, gh)
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2
      ctx.strokeRect(x0, bpGoalY(), gw, gh)
      ctx.strokeRect(x1 - gw, bpGoalY(), gw, gh)
      // 地面
      ctx.fillStyle = '#2a3550'
      ctx.fillRect(x0 - gw, gy, (x1 - x0) + gw * 2, 10)
      ctx.restore()
      // 玩家（青）与 AI（紫 —— 数值更高，官方原话）
      const drawP = (p, color, label) => {
        ctx.save()
        ctx.fillStyle = color
        ctx.fillRect(p.x - pw / 2, p.y - ph, pw, ph)
        ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2
        ctx.strokeRect(p.x - pw / 2, p.y - ph, pw, ph)
        ctx.restore()
        text.stroked(ctx, label, p.x, p.y - ph + 20, { size: 12, align: 'center', color: '#0b1020', lw: 2 })
      }
      drawP(g.me, '#43d9c8', '我')
      drawP(g.ai, '#a05adc', '电脑')
      // 球
      ctx.save()
      ctx.fillStyle = '#ffd23f'
      ctx.beginPath(); ctx.arc(g.ball.x, g.ball.y, g.ball.r, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2; ctx.stroke()
      ctx.restore()
      // 比分
      text.stroked(ctx, `我 ${g.scoreMe} : ${g.scoreAi} 电脑　（先进 ${C.winGoals || 3} 球者胜）　时间 ${Math.max(0, g.timeLeft).toFixed(0)}s`,
        W / 2, H - 72, { size: 15, align: 'center', color: '#ffe45e', lw: 4 })
      const bpMsg = g.msgT > 0 ? g.msg : '← → 移动　↑ 跳跃　用身体把球顶进对方瓶子（球进哪边就算谁得分）'
      text.stroked(ctx, bpMsg, W / 2, H - 48, { size: 13, align: 'center', color: g.msgT > 0 ? '#8ef0c0' : '#9fb0cc', lw: 4 })
      text.stroked(ctx, '操作来自归档原版截图上的规则；"电脑比我们更快更高"与"得分看球进哪边"是官方攻略页原话；几球定胜负为推算',
        W / 2, H - 22, { size: 11, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
      return
    }

    if (st.phase === 'platformer') {
      const p = st.pf
      // 平台
      for (const g of p.plats) {
        ctx.fillStyle = g.y > 440 ? '#3c4a63' : '#4a5a76'
        ctx.fillRect(g.x, g.y, g.w, g.h)
        ctx.fillStyle = 'rgba(255,255,255,.10)'
        ctx.fillRect(g.x, g.y, g.w, 3)
      }
      // 书（要救的古书）
      for (const b of p.books) {
        if (b.got) continue
        ctx.fillStyle = '#d8b26a'
        ctx.fillRect(b.x - 13, b.y - 10, 26, 20)
        ctx.fillStyle = '#8a6a30'
        ctx.fillRect(b.x - 13, b.y - 1, 26, 2)
        ctx.fillRect(b.x - 1, b.y - 10, 2, 20)
      }
      // 火精灵
      for (const s of p.spirits) {
        const fl = 1 + Math.sin(p.t * 9 + s.base) * 0.16
        ctx.fillStyle = 'rgba(255,120,60,.92)'
        ctx.beginPath()
        ctx.moveTo(s.x, s.y - s.r * fl)
        ctx.lineTo(s.x + s.r, s.y)
        ctx.lineTo(s.x, s.y + s.r * fl)
        ctx.lineTo(s.x - s.r, s.y)
        ctx.closePath(); ctx.fill()
        ctx.fillStyle = 'rgba(255,220,120,.9)'
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.38, 0, 6.2832); ctx.fill()
      }
      // 多比
      const blink = p.invuln > 0 && Math.floor(p.t * 12) % 2 === 0
      if (!blink) {
        ctx.fillStyle = '#ffd23f'
        ctx.fillRect(p.x, p.y, PL_W, PL_H)
        ctx.fillStyle = '#1b2436'
        ctx.fillRect(p.x + (p.face > 0 ? 12 : 5), p.y + 7, 4, 4)
      }
      text.stroked(ctx, `已救古书 ${p.got}/${p.need}　被火精灵撞到 ${p.hits} 次`,
        W / 2, H - 72, { size: 14, align: 'center', color: '#ffe45e', lw: 4 })
      const msg = p.msgT > 0 ? p.msg : '←→ 移动　空格/↑ 跳跃'
      text.stroked(ctx, msg, W / 2, H - 48,
        { size: 14, align: 'center', color: p.msgT > 0 ? '#8ef0c0' : '#9fb0cc', lw: 4 })
      text.stroked(ctx, `救满 ${p.need} 本通关 —— 官方规则只有「方向键控制人物移动、跳跃」，其余为推算`,
        W / 2, H - 22, { size: 11, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
      return
    }

    if (st.phase === 'chargeshooter') {
      const g = st.cs
      // 星空底
      for (let i = 0; i < 40; i++) {
        const sx = (i * 137) % W, sy = ((i * 89) % (H - 160)) + 110
        ctx.fillStyle = 'rgba(255,255,255,.18)'
        ctx.fillRect(sx, sy, 2, 2)
      }
      // 敌机：用**官方怪物立绘**（第 43 轮）；取不到立绘时才退回原来的三角占位。
      // 立绘以 (f.x, f.y) 为**中心**画（drawMonster 收的是底边，所以要 +h/2），
      // 这样 f.y 就是判定圆心，和命中判定的 Math.hypot(f.x-s.x, f.y-s.y) 是同一套坐标。
      const nowT = performance.now()
      for (const f of g.foes) {
        const bob = Math.sin(nowT / 320 + (f.bob || 0)) * 4
        const h = f.big ? 78 : 56
        let drew = false
        if (f.mon) {
          try {
            drew = drawMonster(f.mon, f.x, f.y + h / 2 + bob, h, { t: nowT / 1000, phase: f.bob || 0 })
          } catch (e) { drew = false }
        }
        if (!drew) {
          ctx.fillStyle = f.big ? '#c86bd8' : '#ff7a7a'
          ctx.beginPath()
          ctx.moveTo(f.x, f.y + f.r)
          ctx.lineTo(f.x + f.r, f.y - f.r * 0.6)
          ctx.lineTo(f.x, f.y - f.r * 0.1)
          ctx.lineTo(f.x - f.r, f.y - f.r * 0.6)
          ctx.closePath(); ctx.fill()
        }
        // 大敌机显示剩余血量（立绘以 f.y 为中心，所以血条挂在立绘上沿）
        if (f.big && f.hp > 1) {
          text.stroked(ctx, `${f.hp}`, f.x, f.y - h / 2 - 8,
            { size: 12, align: 'center', color: '#ffd23f', lw: 3 })
        }
      }
      // 子弹
      for (const s of g.shots) {
        ctx.fillStyle = s.powered ? '#5ee0ff' : '#ffffff'
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill()
      }
      // 自机：用**玩家当前形态的官方立绘**（第 43 轮）；取不到才退回三角占位。
      // 同样以 (g.x, g.y) 为中心：drawFigure 收底边，+32 = 立绘高 64 的一半。
      let pDrew = false
      try {
        pDrew = drawFigure(g.x, g.y + 32, 64, S.form.actionBattle || S.form.actionIdle,
          performance.now() / 1000, 1)
      } catch (e) { pDrew = false }
      if (!pDrew) {
        ctx.fillStyle = '#ffd23f'
        ctx.beginPath()
        ctx.moveTo(g.x, g.y - 20)
        ctx.lineTo(g.x + 18, g.y + 14)
        ctx.lineTo(g.x, g.y + 6)
        ctx.lineTo(g.x - 18, g.y + 14)
        ctx.closePath(); ctx.fill()
      }
      // 蓄力条（只有按住 Z 时才显示，官方「按住Z秒松开为蓄力射击」）
      if (g.charging) {
        const w = 200, x = W / 2 - w / 2, y = H - 74
        ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(x, y, w, 10)
        const ratio = Math.min(1, g.charge / g.holdSec)
        ctx.fillStyle = ratio >= 1 ? '#5ee0ff' : '#ffd23f'
        ctx.fillRect(x, y, w * ratio, 10)
        text.stroked(ctx, ratio >= 1 ? '蓄力完成！松开 Z 打出' : '按住 Z 蓄力…',
          W / 2, y - 10, { size: 12, align: 'center', color: ratio >= 1 ? '#5ee0ff' : '#9fb0cc', lw: 3 })
      }
      text.stroked(ctx, `击落 ${g.killed}/${g.need}　漏掉 ${g.miss}/${g.maxMiss}`,
        W / 2, H - 48, { size: 14, align: 'center', color: '#ffe45e', lw: 4 })
      const msg = g.msgT > 0 ? g.msg
        : '方向键 四向移动　Z 普通射击　按住 Z 蓄力后松开'
      text.stroked(ctx, msg, W / 2, H - 22,
        { size: 13, align: 'center', color: g.msgT > 0 ? '#8ef0c0' : '#9fb0cc', lw: 4 })
      return
    }

    if (st.phase === 'blocks') {
      const b = st.bl
      const s = curStage()
      // 盘面
      for (let r = 0; r < b.rows; r++) {
        for (let c = 0; c < b.cols; c++) {
          const rect = blockCellRect(r, c)
          const v = b.grid[r][c]
          ctx.fillStyle = v >= 0 ? BLOCK_COLORS[v % BLOCK_COLORS.length] : 'rgba(18,24,40,.72)'
          ctx.fillRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2)
          ctx.strokeStyle = 'rgba(255,255,255,.10)'
          ctx.lineWidth = 1
          ctx.strokeRect(rect.x + .5, rect.y + .5, rect.w - 1, rect.h - 1)
        }
      }
      // 提示框（下落中的三格）
      for (const [x, y] of blocksShape(b.piece)) {
        if (y < 0 || y >= b.rows || x < 0 || x >= b.cols) continue
        const rect = blockCellRect(y, x)
        ctx.fillStyle = BLOCK_COLORS[b.piece.kind % BLOCK_COLORS.length]
        ctx.fillRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2)
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2)
      }
      const bx = blockCellRect(0, 0)
      const by = blockCellRect(b.rows - 1, 0)
      text.stroked(ctx, `已消除 ${b.lines}/${b.target} 条　（官方：四个以上相同的方块就可以消除）`,
        W / 2, by.y + by.h + 20, { size: 13, align: 'center', color: '#ffe45e', lw: 4 })
      text.stroked(ctx, b.over ? '堆到顶了 —— 按空格重开这一局' : '方向键 移动提示框　空格 转动方向',
        W / 2, by.y + by.h + 44, { size: 12.5, align: 'center', color: b.over ? '#ff8a8a' : '#9fb0cc', weight: 'normal', lw: 3 })
      text.stroked(ctx, `盘面 ${b.cols}×${b.rows} / ${b.kinds} 色 / 下落速度 ${b.fall}s —— 官方只给了"四连即消"，其余为推算`,
        W / 2, H - 14, { size: 11, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
      return
    }

    if (st.phase === 'runner') {
      const r = st.rn
      const groundY = 372
      // 跑道
      ctx.fillStyle = 'rgba(20,30,48,.85)'
      ctx.fillRect(80, groundY, W - 160, 6)
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = 'rgba(255,255,255,.10)'
        ctx.fillRect(80, groundY + 24 + i * 22, W - 160, 2)
      }
      // 沿跑道把"距离"换算成屏幕 x：玩家固定在 x=200
      const X0 = 200, SCALE = 9
      for (const it of r.items) {
        const dx = (it.at - r.dist) * SCALE
        if (dx < -60 || dx > W - 80) continue
        const x = X0 + dx
        if (it.kind === 'gem') {
          if (it.got) continue
          ctx.fillStyle = '#5ee0ff'
          ctx.beginPath()
          ctx.moveTo(x, groundY - (it.hi ? 96 : 30) - 16)
          ctx.lineTo(x + 12, groundY - (it.hi ? 96 : 30))
          ctx.lineTo(x, groundY - (it.hi ? 96 : 30) + 16)
          ctx.lineTo(x - 12, groundY - (it.hi ? 96 : 30))
          ctx.closePath(); ctx.fill()
        } else if (it.kind === 'rock') {
          if (it.got) continue
          ctx.fillStyle = '#7a8296'
          ctx.beginPath()
          ctx.moveTo(x - 15, groundY); ctx.lineTo(x - 6, groundY - 24)
          ctx.lineTo(x + 8, groundY - 20); ctx.lineTo(x + 16, groundY)
          ctx.closePath(); ctx.fill()
        } else {
          if (it.got) continue
          ctx.fillStyle = 'rgba(70,150,235,.75)'
          ctx.beginPath()
          ctx.ellipse(x, groundY + 2, 26, 8, 0, 0, 6.2832)
          ctx.fill()
        }
      }
      // 多比（跳起来时抬高）
      const py = groundY - 34 - r.y * 26
      ctx.fillStyle = '#ffd23f'
      ctx.beginPath(); ctx.arc(X0, py, 17, 0, 6.2832); ctx.fill()
      ctx.fillStyle = '#1b2436'
      ctx.beginPath(); ctx.arc(X0 - 6, py - 4, 3, 0, 6.2832); ctx.fill()
      ctx.beginPath(); ctx.arc(X0 + 6, py - 4, 3, 0, 6.2832); ctx.fill()
      text.stroked(ctx, `宝石 ${r.gems}/${r.need}　速度 ${r.speed.toFixed(1)}　撞到 ${r.hits} 次`,
        W / 2, groundY + 106, { size: 14, align: 'center', color: '#ffe45e', lw: 4 })
      // 速度条
      drawBar(W / 2 - 150, groundY + 120, 300, 12, r.speed - RUN_BASE, RUN_MAX - RUN_BASE, '#43d9c8', null)
      // 提示行只有一行：有消息就显示消息，否则显示操作（两行会叠在一起）
      const msg = r.msgT > 0 ? r.msg
        : (r.over ? '按方向键重跑一次' : '连按方向键 加速　空格 跳跃')
      text.stroked(ctx, msg, W / 2, H - 30,
        { size: 14, align: 'center', color: r.msgT > 0 ? '#8ef0c0' : '#9fb0cc', weight: r.msgT > 0 ? 'bold' : 'normal', lw: 4 })
      text.stroked(ctx, `跑道 3 条线 / 捡满 ${r.need} 颗宝石通关 —— 官方只给了玩法，数值为推算`,
        W / 2, H - 10, { size: 11, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
      return
    }

    if (st.phase === 'slide') {
      const p = st.slide
      const solved = slideSolved(p)
      const b = p.cells.indexOf(0)
      for (let i = 0; i < 9; i++) {
        const r = slideRect(i)
        const v = p.cells[i]
        const isBlank = v === 0
        ctx.fillStyle = isBlank ? 'rgba(10,14,24,.9)' : 'rgba(18,24,40,.85)'
        ctx.fillRect(r.x, r.y, r.w, r.h)
        // 目标图案的提示：小圆点标在格子角落，方便对照
        const tx = p.target[i]
        ctx.strokeStyle = (i === b && !solved) ? '#ffd23f' : 'rgba(255,255,255,.16)'
        ctx.lineWidth = (i === b && !solved) ? 2 : 1
        ctx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1)
        if (!isBlank) {
          const col = v === 1 ? '#e05a6b' : v === 2 ? '#5aa9e0' : '#e0c05a'
          ctx.fillStyle = col
          const m = 10
          ctx.beginPath()
          ctx.moveTo(r.x + r.w / 2, r.y + m)
          ctx.lineTo(r.x + r.w - m, r.y + r.h / 2)
          ctx.lineTo(r.x + r.w / 2, r.y + r.h - m)
          ctx.lineTo(r.x + m, r.y + r.h / 2)
          ctx.closePath(); ctx.fill()
          if (v !== tx) text.stroked(ctx, '×', r.x + r.w - 14, r.y + 18,
            { size: 13, align: 'center', color: '#ff8a8a', lw: 3 })
        }
      }
      text.stroked(ctx, `目标合成公式：三色宝石各归各位（左上角「×」＝这一格还没到位，空格是空位）`, W / 2, 470,
        { size: 12.5, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
      text.stroked(ctx, solved ? '合成成功！' : `已移动 ${p.moves} 步　↑↓←→ 或点击 移动宝石`,
        W / 2, 496, { size: 14, align: 'center', color: solved ? '#5ee06a' : '#ffe45e', lw: 4 })
      text.stroked(ctx, isMini ? '点击格子 / 方向键 都能移动　Esc 放弃' : '官方规则原文：用鼠标向四个方向移动宝石，完成合成公式',
        W / 2, 522, { size: 11.5, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
      return
    }

    if (st.phase === 'pipe') {
      const p = st.pipe
      const connected = pipeConnected(p)
      for (let i = 0; i < 9; i++) {
        const r = pipeRect(i)
        const c = p.cells[i]
        const bits = pipeRotateBits(PIPE_SHAPES[c.shape], c.rot)
        const sel = p.sel === i
        ctx.fillStyle = sel ? 'rgba(255,210,63,.14)' : 'rgba(18,24,40,.82)'
        ctx.fillRect(r.x, r.y, r.w, r.h)
        ctx.strokeStyle = sel ? '#ffd23f' : 'rgba(255,255,255,.14)'
        ctx.lineWidth = sel ? 2 : 1
        ctx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1)
        // 管件：从中心画到每个有口的方向
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2
        const len = r.w * 0.42
        for (let d = 0; d < 4; d++) {
          if (!bits[d]) continue
          const [dx, dy] = PIPE_DIRS[d]
          ctx.strokeStyle = '#43d9c8'; ctx.lineWidth = 7
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dx * len, cy + dy * len); ctx.stroke()
        }
        ctx.fillStyle = '#2a6f66'
        ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill()
      }
      // 入水口 / 出水口标记
      const r0 = pipeRect(0), r8 = pipeRect(8)
      ctx.fillStyle = '#8ef0c0'; ctx.fillRect(r0.x - 26, r0.y + r0.h / 2 - 6, 22, 12)
      ctx.fillStyle = connected ? '#8ef0c0' : '#7c8aa5'; ctx.fillRect(r8.x + r8.w + 4, r8.y + r8.h / 2 - 6, 22, 12)
      text.stroked(ctx, '入水口', r0.x - 40, r0.y - 8, { size: 12, color: '#8ef0c0', weight: 'normal', lw: 3 })
      text.stroked(ctx, '出水口', r8.x + r8.w + 46, r8.y - 8, { size: 12, align: 'right', color: connected ? '#8ef0c0' : '#9fb0cc', weight: 'normal', lw: 3 })
      text.stroked(ctx, '↑↓←→ 选格　空格/点击 旋转管件', W / 2, 476,
        { size: 14, align: 'center', color: '#ffe45e', lw: 4 })
      text.stroked(ctx, connected ? '已接通！' : '把左侧入水口和右侧出水口连成一条通路',
        W / 2, 502, { size: 13.5, align: 'center', color: connected ? '#5ee06a' : '#cfe0ff', lw: 4 })
      text.stroked(ctx, '原文：连接能量管线，使得能量能够顺利输送即可 —— 所以连通就算过关',
        W / 2, 526, { size: 11.5, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
      return
    }

    if (st.phase === 'shooter') {
      const g = st.sh
      // 只画星星，**不要再铺一层全屏底色** —— drawDungeon 已经把底铺好了，
      // 在这里再 fillRect 一次会把上面刚画好的标题/关卡名压暗（截图里看得很明显）。
      for (let i = 0; i < 60; i++) {
        const sx = (i * 137) % W, sy = (i * 71) % H
        ctx.fillStyle = 'rgba(255,255,255,.25)'
        ctx.fillRect(sx, sy, 2, 2)
      }
      // 目标：圆可以从屏幕外飞入（保留进场感），但**文字只在完全进屏后画** ——
      // 否则标签会画到画面外（ui-overlap 的越界检查抓到了「敌机」在 x=984）。
      for (const tg of g.targets) {
        if (tg.x < -40 || tg.x > W + 40) continue
        const bob = Math.sin(performance.now() / 300 + tg.bob) * 4
        const hitR = (tg.r + 8) * (g.radMul || 1)
        // 敌机 = 官方怪物立绘（第 43 轮）；取不到立绘才退回原来的橙圆占位
        let drew = false
        if (tg.mon) {
          // 立绘在判定圈里**居中**（drawMonster 收底边，所以 +29 = 58/2）
          try { drew = drawMonster(tg.mon, tg.x, tg.y + bob + 29, 58, { t: performance.now() / 1000, phase: tg.bob }) } catch (e) { drew = false }
        }
        if (!drew) {
          ctx.fillStyle = '#ff8a5c'
          ctx.beginPath(); ctx.arc(tg.x, tg.y + bob, tg.r, 0, Math.PI * 2); ctx.fill()
        }
        ctx.strokeStyle = '#ffe45e'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(tg.x, tg.y + bob, hitR, 0, Math.PI * 2); ctx.stroke()
        if (tg.x >= 24 && tg.x <= W - 24) {
          // 标签写**怪物真名**（如"翼纹喵"），比笼统的"敌机"更贴近原版素材
          const label = (tg.mon && tg.mon.name) || '敌机'
          const ly = tg.y + bob + 30
          if (ly < H - 96) {
            text.stroked(ctx, label, tg.x, ly, { size: 12, align: 'center', color: '#ffe45e', lw: 3 })
          }
        }
      }
      // 准星
      if (M.inside) {
        ctx.strokeStyle = g.flash > 0 ? '#5ee06a' : '#cfe0ff'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(M.x, M.y, 14, 0, Math.PI * 2); ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(M.x - 20, M.y); ctx.lineTo(M.x - 6, M.y)
        ctx.moveTo(M.x + 6, M.y); ctx.lineTo(M.x + 20, M.y)
        ctx.moveTo(M.x, M.y - 20); ctx.lineTo(M.x, M.y - 6)
        ctx.moveTo(M.x, M.y + 6); ctx.lineTo(M.x, M.y + 20)
        ctx.stroke()
      }
      text.stroked(ctx, `击落 ${g.hit} / ${g.need}　漏掉 ${g.miss} / ${g.maxMiss}`, W / 2, H - 74,
        { size: 16, align: 'center', color: g.flash > 0 ? '#8ef0c0' : '#ffe45e', lw: 4 })
      text.stroked(ctx, '用鼠标点击击落来袭目标（原文特意点明：不是方向键控制的）',
        W / 2, H - 46, { size: 12.5, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
      text.stroked(ctx, 'Backspace 放弃副本', W / 2, H - 20, { size: 12, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
      return
    }

    if (st.phase === 'current') {
      const g = st.st
      // 三条航道
      const laneW = 180, gap = 18
      const total = g.lanes * laneW + (g.lanes - 1) * gap
      const x0 = (W - total) / 2, laneY = 240, laneH = 130
      for (let i = 0; i < g.lanes; i++) {
        const x = x0 + i * (laneW + gap)
        const isWave = g.wave === i
        const isPlayer = g.lane === i
        ctx.fillStyle = isWave ? 'rgba(90,170,255,.35)' : 'rgba(18,24,40,.8)'
        ctx.fillRect(x, laneY, laneW, laneH)
        ctx.strokeStyle = isPlayer ? '#43d9c8' : 'rgba(255,255,255,.18)'
        ctx.lineWidth = isPlayer ? 3 : 1
        ctx.strokeRect(x + .5, laneY + .5, laneW - 1, laneH - 1)
        text.stroked(ctx, ['左航道', '中航道', '右航道'][i], x + laneW / 2, laneY - 8,
          { size: 12.5, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
        if (isWave) {
          text.stroked(ctx, '湍流', x + laneW / 2, laneY + laneH / 2,
            { size: 26, align: 'center', color: '#cfe0ff', lw: 5 })
        }
        if (isPlayer) {
          text.stroked(ctx, '多克', x + laneW / 2, laneY + laneH - 18,
            { size: 15, align: 'center', color: '#8ef0c0', lw: 3 })
        }
      }
      // 反应窗口进度条
      if (g.wave >= 0) {
        const bw = 360, bx = (W - bw) / 2, by = 400
        ctx.fillStyle = 'rgba(20,26,42,.9)'; ctx.fillRect(bx, by, bw, 12)
        const ratio = util.clamp(g.t / g.window, 0, 1)
        ctx.fillStyle = ratio > 0.4 ? '#43d9c8' : '#ff8a5c'
        ctx.fillRect(bx, by, bw * ratio, 12)
        text.stroked(ctx, '←→ 换航道（躲开蓝色航道）', W / 2, by + 34,
          { size: 14, align: 'center', color: '#ffe45e', lw: 4 })
      }
      text.stroked(ctx, `躲开 ${g.done} / ${g.pass}　被冲中 ${g.hits} / 3`, W / 2, 460,
        { size: 14, align: 'center', color: g.flash > 0 ? '#ff8a8a' : '#cfe0ff', lw: 4 })
      text.stroked(ctx, '原文：站在最后面未必是安全的 —— 所以三条航道被冲中的概率一样',
        W / 2, 492, { size: 11.5, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
      text.stroked(ctx, 'Backspace 放弃副本', W / 2, H - 24, { size: 12, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
      return
    }

    if (st.phase === 'quiz') {
      const q = st.quiz
      const cur = q.list[q.idx]
      text.stroked(ctx, `第 ${q.idx + 1} / ${q.list.length} 题　已答对 ${q.right}（需要 ${q.need}）`,
        W / 2, 206, { size: 13.5, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
      text.stroked(ctx, cur.q, W / 2, 248, { size: 18, align: 'center', color: '#ffe45e', lw: 5 })
      const rects = quizRects()
      for (let i = 0; i < 3; i++) {
        const r = rects[i]
        const sel = q.sel === i
        const answered = q.picked >= 0
        const right = i === cur.right
        let fill = sel ? 'rgba(255,210,63,.16)' : 'rgba(18,24,40,.82)'
        let line = sel ? '#ffd23f' : 'rgba(255,255,255,.16)'
        if (answered && right) { fill = 'rgba(60,180,110,.22)'; line = '#5ee06a' }
        else if (answered && sel) { fill = 'rgba(200,60,60,.22)'; line = '#ff8a8a' }
        ctx.fillStyle = fill; ctx.fillRect(r.x, r.y, r.w, r.h)
        ctx.strokeStyle = line; ctx.lineWidth = sel || (answered && right) ? 2 : 1
        ctx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1)
        text.stroked(ctx, `${'ABC'[i]}. ${cur.a[i]}`, r.x + 18, r.y + 30,
          { size: 16, lw: 3, color: answered && right ? '#8ef0c0' : (sel ? '#ffe45e' : '#e8eefc') })
      }
      if (q.picked >= 0) {
        const ok = q.picked === cur.right
        text.stroked(ctx, ok ? '答对了' : `答错了，正确答案是 ${'ABC'[cur.right]}`, W / 2, 500,
          { size: 15, align: 'center', color: ok ? '#5ee06a' : '#ff8a8a', lw: 4 })
        text.stroked(ctx, `出处：${cur.evidence}　（空格 继续）`, W / 2, 524,
          { size: 11.5, align: 'center', color: '#8ef0c0', weight: 'normal', lw: 3 })
      } else {
        text.stroked(ctx, '↑↓ 选择　空格/点击 作答', W / 2, 500,
          { size: 13.5, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
      }
      return
    }

    if (st.phase === 'stealth') {
      const g0 = st.st
      // 甲板走道
      const laneX = 80, laneW = W - 160, laneY = 300, laneH = 76
      ctx.fillStyle = 'rgba(24,32,50,.9)'; ctx.fillRect(laneX, laneY, laneW, laneH)
      ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1
      ctx.strokeRect(laneX + .5, laneY + .5, laneW - 1, laneH - 1)
      // 刻度
      for (let i = 1; i < g0.steps; i++) {
        const x = laneX + (0.08 + (i / g0.steps) * 0.84) * laneW
        ctx.strokeStyle = 'rgba(255,255,255,.1)'
        ctx.beginPath(); ctx.moveTo(x, laneY); ctx.lineTo(x, laneY + laneH); ctx.stroke()
      }
      // 守卫：位置 + 朝向 + 视野锥
      for (const g of g0.guards) {
        const gx = laneX + g.x * laneW, gy = laneY + laneH / 2
        ctx.save()
        ctx.fillStyle = 'rgba(255,120,90,.22)'
        ctx.beginPath()
        const sight = 0.20 * laneW
        ctx.moveTo(gx, gy - 16)
        ctx.lineTo(gx + g.facing * sight, gy - 34)
        ctx.lineTo(gx + g.facing * sight, gy + 34)
        ctx.lineTo(gx, gy + 16)
        ctx.closePath(); ctx.fill()
        ctx.restore()
        ctx.fillStyle = '#ff8a5c'
        ctx.beginPath(); ctx.arc(gx, gy, 14, 0, Math.PI * 2); ctx.fill()
        text.stroked(ctx, g.facing > 0 ? '▶' : '◀', gx, gy + 6,
          { size: 15, align: 'center', color: '#3a1200', lw: 2 })
      }
      // 玩家
      const px = laneX + (0.08 + (g0.pos / g0.steps) * 0.84) * laneW
      const spotted = stealthSpotted()
      ctx.fillStyle = spotted ? '#ff6b6b' : '#43d9c8'
      ctx.beginPath(); ctx.arc(px, laneY + laneH / 2, 16, 0, Math.PI * 2); ctx.fill()
      text.stroked(ctx, '多克', px, laneY + laneH / 2 + 5, { size: 11, align: 'center', color: '#062a26', lw: 2 })
      text.stroked(ctx, `前进 ${g0.pos} / ${g0.steps}　　被发现 ${g0.caught} 次`, W / 2, 410,
        { size: 15, align: 'center', color: spotted ? '#ff8a8a' : '#cfe0ff', lw: 4 })
      text.stroked(ctx, spotted ? '⚠ 现在正被盯着！等他转身' : '空格 前进（趁守卫背对时）',
        W / 2, 440, { size: 14, align: 'center', color: spotted ? '#ff6b6b' : '#8ef0c0', lw: 4 })
      text.stroked(ctx, 'Backspace 放弃副本', W / 2, H - 24, { size: 12, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
      return
    }

    if (st.phase === 'morale') {
      const m = st.mo
      // 两条士气条
      const bw = 360, bh = 22
      const mx = 90, fx = W - 90 - bw, by = 230
      const bar = (x, y, cur, color, label) => {
        ctx.fillStyle = 'rgba(20,26,42,.9)'; ctx.fillRect(x, y, bw, bh)
        ctx.fillStyle = color; ctx.fillRect(x, y, bw * util.clamp(cur / m.target, 0, 1), bh)
        ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1
        ctx.strokeRect(x + .5, y + .5, bw - 1, bh - 1)
        text.stroked(ctx, label, x, y - 8, { size: 13, color: '#cfe0ff', lw: 3 })
        text.stroked(ctx, `${Math.round(cur)} / ${m.target}`, x + bw / 2, y + 16,
          { size: 13, align: 'center', color: '#ffffff', lw: 3 })
      }
      bar(mx, by, m.mine, '#43d9c8', '我方士气')
      bar(fx, by, m.foe, '#ff8a5c', '噜噜王')
      const rects = moraleRects()
      for (let i = 0; i < 3; i++) {
        const r = rects[i]
        const sel = m.sel === i
        ctx.fillStyle = sel ? 'rgba(255,210,63,.2)' : 'rgba(18,24,40,.85)'
        ctx.fillRect(r.x, r.y, r.w, r.h)
        ctx.strokeStyle = sel ? '#ffd23f' : 'rgba(255,255,255,.18)'; ctx.lineWidth = sel ? 2 : 1
        ctx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1)
        text.stroked(ctx, MORALE_MOVES[i], r.x + r.w / 2, r.y + 33,
          { size: 18, align: 'center', color: sel ? '#ffe45e' : '#e8eefc', lw: 4 })
      }
      if (m.last) text.stroked(ctx, m.last, W / 2, 416, { size: 13, align: 'center', color: '#cfe0ff', lw: 3 })
      text.stroked(ctx, `第 ${m.turn} 回合　↑↓ 选招式　空格/点击 出手（先到 ${m.target} 者胜）`,
        W / 2, 444, { size: 13, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
      // 规则来源必须写在界面上（原文只说了"有两个数值"，规则是本项目推算的）
      text.stroked(ctx, '原文只写了「会出现两个数值」，具体增减规则未留存 → 本实现为推算（derived）',
        W / 2, 470, { size: 11.5, align: 'center', color: '#c9a86a', weight: 'normal', lw: 3 })
      text.stroked(ctx, 'Backspace 放弃副本', W / 2, H - 24, { size: 12, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })
      return
    }
  }

  // （第 72 轮重构批次 7 · ui 收尾：服饰大楼的买 / 穿 / 附魔已迁到 game/app/shop.js、布局与绘制已迁到 game/ui/shop.js，由顶部"解构 shim"取用）


  G.ui = G.ui || {}
  Object.assign(G.ui, { flipRects, dungeonListRects, drawDungeon, moraleRects })
})()
