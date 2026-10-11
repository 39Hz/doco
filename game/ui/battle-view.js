/* 多克多比 · 界面层：战斗视图（第 72 轮重构 · 批次 6）
   —— 只负责"布局 + 画"：指令布局、消息框与橙钮、结印界面、出手顺序条、整块战斗画面。
   读内核共享状态 S（battle / form / hover*）与内容表 D，写 canvas；不碰存档、不做业务判定
   （玩家背包数量经 G.app.bagOwned / bagCount 取，战斗逻辑经 G.app.battle 取）。
   依赖：内核 G.core（S / ctx / W / H / 立绘取图与画法）+ 引擎 window.DKDbb（util / text / art）
        + window.DKDbbFx（FX）+ 内容表 window.DKDbbData（D）
        + 同层 G.ui（roundBox / drawOrigPanel / drawOrigBtn / drawBattleNameplate）
        + 应用层 G.app（battle / player / 常量与视图桥）。
   只经 G.ui 出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const { S, ctx, W, H } = G.core
  const { util, text, art } = window.DKDbb
  const FX = window.DKDbbFx
  const D = window.DKDbbData
  const { roundBox, drawOrigPanel, drawOrigBtn, drawBattleNameplate } = G.ui
  // 立绘取图与怪物立绘画法（内核 images.js，批次 1）。
  const { monImage, drawMonster, itemImage } = G.core

  // 应用层桥（惰性箭头：调用时才解析，故加载顺序无关）。
  const battleSkills = (...a) => G.app.player.battleSkills(...a)
  const doCommand = (...a) => G.app.battle.doCommand(...a)
  const skillBlockReason = (...a) => G.app.battle.skillBlockReason(...a)
  const useSkill = (...a) => G.app.battle.useSkill(...a)
  const nextUsableSkill = (...a) => G.app.battle.nextUsableSkill(...a)
  const notice = (...a) => G.app.battle.notice(...a)
  const itemRects = (...a) => G.app.battle.itemRects(...a)
  const playerAct = (...a) => G.app.battle.playerAct(...a)
  const bagOwned = (key) => G.app.bagOwned(key)
  const bagCount = (id) => G.app.bagCount(id)
  // 仍在 game.js 的战斗视图 / 绘法（阶段 2 未迁）：经 G.app 惰性取用。
  const drawSpPips = (...a) => G.ui.drawSpPips(...a)
  const drawSoyaInBattle = (...a) => G.ui.drawSoyaInBattle(...a)
  const attackPose = (...a) => G.ui.attackPose(...a)
  const playerActionIsSelfCast = (...a) => G.ui.playerActionIsSelfCast(...a)
  const drawFigure = (...a) => G.ui.drawFigure(...a)
  const drawBackground = (...a) => G.ui.drawBackground(...a)
  const E_POS = (...a) => G.app.battleGeom.E_POS(...a)
  const POWER = (...a) => G.app.battleGeom.POWER(...a)
  // 索亚跳跃计时：变量声明在 game.js，用取值/设值桥共用同一份。
  const getHop = () => G.app.getSoYaHop()
  const setHop = (v) => G.app.setSoYaHop(v)

  function battleLayout(b) {
    const B = G.app.battleGeom.BATTLE_BAR
    // 只保留真正能用的五格（原来的「自动」是未开放占位，已去掉）
    const items = ['攻击', '技能', '道具', '防御', '逃跑']
    const totalW = B.slotN * B.slotW + (B.slotN - 1) * B.slotGap
    const rowX = B.leftX + B.leftW + 18
    const rowY = B.y + 30
    const cmdRects = items.map((label, i) => ({
      label, i,
      x: rowX + i * (B.slotW + B.slotGap), y: rowY, w: B.slotW, h: B.slotH,
    }))
    // 技能网格：浮在操作栏上方的中央
    // 用 battleSkills()：配招是固定槽位（空格是 null），战斗里要去掉空槽，
    // 否则网格里出现空白格、"下一个可用技能"也会跳格。
    const list = battleSkills(S.form)
    const sw = 236, sh = 30, sgx = 10, sgy = 6, perRow = 3
    const rows = Math.ceil(list.length / perRow)
    const gridW = perRow * sw + (perRow - 1) * sgx
    const gridH = rows * sh + (rows - 1) * sgy
    const gx = (W - gridW) / 2
    const gy = B.y - 12 - gridH
    const skillRects = list.map((name, i) => ({
      name, i,
      x: gx + (i % perRow) * (sw + sgx),
      y: gy + Math.floor(i / perRow) * (sh + sgy),
      w: sw, h: sh,
    }))
    // 大红圆钮（原版那个"确定"钮）。周围原来还有四颗小圆钮，纯装饰已删。
    const bigC = { x: rowX + totalW + 76, y: B.y + G.app.battleGeom.BATTLE_BAR_H / 2, r: B.bigR }
    return { cmdRects, skillRects, gridW, gridH, gx, gy, cmdY: rowY, barY: B.y, bigC }
  }
  // 点「确定」大圆钮 = 执行当前选中的指令
  function battleConfirm() {
    const b = S.battle
    if (!b || b.phase !== 'command') return
    if (b.menu === 'main') doCommand(b.menuSel)
    else if (b.menu === 'skill') {
      const list = battleSkills(S.form)
      const name = list[util.clamp(b.skillSel || 0, 0, Math.max(0, list.length - 1))]
      const why = name ? skillBlockReason(b, name) : '技能数据缺失'
      if (!why) useSkill(b, name)
      else {
        const nx = nextUsableSkill(b, util.clamp(b.skillSel || 0, 0, list.length - 1))
        if (nx >= 0) { b.skillSel = nx; notice(why + `　→ 已切到「${list[nx]}」`) }
        else notice(why + '　本回合没有可用技能')
      }
    } else if (b.menu === 'item') {
      const ir = itemRects(b)
      if (ir.list[b.itemSel]) playerAct('item', ir.list[b.itemSel].id)
    }
  }
  // 点敌人 = 换目标：判定区是立绘外接椭圆
  function battleEnemyHitTest(b, mx, my) {
    const alive = b.enemies.filter((e) => !e.dead)
    for (let i = 0; i < b.enemies.length; i++) {
      const e = b.enemies[i]
      if (e.dead) continue
      const p = E_POS(i)
      const dispH = util.clamp(150 + (e.size || 90) * 1.0, 170, 280)
      const cx = p.x, cy = p.y - dispH * 0.5
      const rx = Math.max(70, dispH * 0.55), ry = dispH * 0.6
      const dx = (mx - cx) / rx, dy = (my - cy) / ry
      if (dx * dx + dy * dy <= 1) return alive.indexOf(e)
    }
    return -1
  }

  // ==================== 战斗左下角：消息框 + 三个橙色按钮（第 51 轮）====================
  // 【为什么要做】原版（归档 `战斗截图.jpg` 左下角实测）就长这样：
  //   一条**白底消息框** `#cdd3e1` 滚动战斗播报，右边三个**橙色方钮** `#f07a1b`。
  //   【关键决定：给真功能，不做装饰】早先那版这里有"两个小方块"，因为**没有任何功能**
  //   被我自己删掉了。所以这次三个钮都必须真的有用：
  //     返 返回：退出战斗（点两次确认，防误触） 速 速度：1×→2×→3×  聊 说话：快捷发言进消息框
  //   ⚠️ 图标**不能用 emoji/箭头符号**：本作文字走自制字形图集，图集里没有的字符会画成空方框
  //      （第 48 轮在 🔑 上栽过一次）。所以按钮上写**汉字**（返/速/聊），一定能画出来。
  function drawBattleMsgAndButtons(B, L) {
    const b = S.battle
    if (!b) return
    const mx = B.leftX, mw = B.leftW, mh = 28
    const my = B.y + G.app.battleGeom.BATTLE_BAR_H - mh - 12            // 贴底对齐（原版消息框在最下面）
    // 状态行：原来那块"敌人 N/M + 回合 N"面板（第 51 轮移到这里，避免和三个钮重叠）
    const aliveCnt = b.enemies.filter((e) => !e.dead).length
    text.stroked(ctx, `敌人 ${aliveCnt}/${b.enemies.length} · 回合 ${b.round || 1}`,
      mx + 2, my - 34, { size: 11.5, align: 'left', color: '#cfe2f5', lw: 3, weight: 'normal' })
    // 白底消息框（原版底色 #cdd3e1，文字深蓝）
    drawOrigPanel(mx, my, mw, mh, { top: '#eef2f8', bot: '#cdd3e1', edge: '#afbfcf', r: 7 })
    const last = (b.log && b.log.length) ? b.log[b.log.length - 1] : null
    // ⚠️ 必须兜底：没有播报时原来会画出字面量 "undefined"（截图里抓到的）
    const line = last && last.text ? String(last.text) : '战斗开始'
    // 框窄，超长就截断加省略号（画不下就截，不许溢出框外）
    const maxChars = Math.max(4, Math.floor((mw - 16) / 12))
    const shown = line.length > maxChars ? line.slice(0, maxChars - 1) + '…' : line
    text.stroked(ctx, shown, mx + 8, my + mh * 0.7,
      { size: 12, align: 'left', color: '#1b2b52', lw: 0, weight: 'normal' })
    // 更早的几条用小字叠在框上方（原版是滚动，这里用叠字近似，信息量一样）
    const older = (b.log || []).slice(0, -1).slice(-2)
    older.forEach((l, i) => {
      if (!l || !l.text) return
      ctx.save()
      ctx.globalAlpha = 0.5 - i * 0.15
      text.stroked(ctx, l.text, mx + 8, my - 6 - i * 13,
        { size: 10.5, align: 'left', color: '#dfe8f5', lw: 3, weight: 'normal' })
      ctx.restore()
    })

    // 三个橙色方钮（原版约 22×22，摆在消息框上方那一排）
    const s = 22, gap = 6
    const bx0 = mx + mw - (s * 3 + gap * 2)
    const by = my - s - 5
    L.battleBtns = [
      { id: 'back', x: bx0, y: by, w: s, h: s, glyph: '返', tip: '退出战斗' },
      { id: 'menu', x: bx0 + s + gap, y: by, w: s, h: s, glyph: '速', tip: `战斗速度 ${S.battleSpeed || 1}×` },
      { id: 'talk', x: bx0 + (s + gap) * 2, y: by, w: s, h: s, glyph: '聊', tip: '快捷发言' },
    ]
    for (const btn of L.battleBtns) {
      const hot = S.hoverBattleBtn === btn.id
      drawOrigBtn(btn.x, btn.y, s, btn.glyph)
      if (hot) {
        ctx.save()
        ctx.strokeStyle = 'rgba(255,240,180,.9)'; ctx.lineWidth = 2
        roundBox(btn.x - 2, btn.y - 2, s + 4, s + 4, 6); ctx.stroke()
        ctx.restore()
        // 悬停时把功能名写出来（原版没有提示，但"按钮不写用途"正是我早先删按钮的原因）
        const tw = btn.tip.length * 12 + 14
        ctx.save()
        ctx.fillStyle = 'rgba(8,14,26,.92)'
        roundBox(btn.x + s / 2 - tw / 2, btn.y - 24, tw, 18, 6); ctx.fill()
        text.stroked(ctx, btn.tip, btn.x + s / 2, btn.y - 11, { size: 11, align: 'center', color: '#ffe45e', lw: 3 })
        ctx.restore()
      }
    }
  }

  // 结印操作界面：限时按方向键，成功越多威力越大
  function drawSealUI(b) {
    const s = b.seal
    const cx = W / 2, cy = H / 2 - 10
    ctx.save()
    ctx.fillStyle = 'rgba(4,8,16,.74)'
    ctx.fillRect(0, 0, W, H)
    text.stroked(ctx, `结印　${s.name}`, cx, cy - 116, { size: 27, align: 'center', color: '#ffe45e', lw: 7 })
    text.stroked(ctx, '按方向键结印　成功越多威力越大', cx, cy - 86,
      { size: 13, align: 'center', color: '#9fb0cc', lw: 4 })

    const n = s.seq.length
    const gap = 64
    const x0 = cx - (n - 1) * gap / 2
    for (let i = 0; i < n; i++) {
      const x = x0 + i * gap
      const done = i < s.idx
      const cur = i === s.idx
      const ok = done && s.log ? s.log[i] : null
      // 底框【第 54 轮：统一风格】改用与指令格同一套 `drawOrigPanel`
      //（浅底 + 浅蓝描边 + 圆角 + 顶部高光）—— 原来这里是"深色半透明 + 白描边"，
      //  和底部操作栏、名牌、消息框三块放在一起就是两套画风。
      //  对错/当前仍然用颜色区分（绿=对、红=错、金=当前），只是底与描边统一。
      drawOrigPanel(x - 24, cy - 30, 48, 60, cur
        ? { top: '#ffe9a3', bot: '#f0b53c', edge: '#fff3c8', r: 10 }
        : done
          ? (ok ? { top: '#d9f7dd', bot: '#a9e6b4', edge: '#5ee06a', r: 10 }
            : { top: '#ffdcdc', bot: '#f2b3b3', edge: '#ff6b6b', r: 10 })
          : { top: '#ced5e8', bot: '#bcbac7', edge: '#afbfcf', r: 10 })
      // 内容：当前步显示要按的箭头，已过的显示对错
      if (done) {
        text.stroked(ctx, G.app.battleGeom.SEAL_LABEL[s.seq[i]], x, cy + 2,
          { size: 22, align: 'center', color: ok ? '#5ee06a' : '#ff6b6b', lw: 4 })
        text.stroked(ctx, ok ? '✓' : '✗', x + 15, cy - 16,
          { size: 13, align: 'center', color: ok ? '#5ee06a' : '#ff6b6b', lw: 3 })
      } else if (cur) {
        const k = util.clamp(s.stepT / s.stepDur, 0, 1)
        // 限时快到时变红，给玩家压迫感
        const col = k < 0.3 ? '#ff6b6b' : '#ffe45e'
        const pulse = 1 + Math.sin(performance.now() / 90) * 0.06
        text.stroked(ctx, G.app.battleGeom.SEAL_LABEL[s.seq[i]], x, cy + 2,
          { size: 30 * pulse, align: 'center', color: col, lw: 6 })
        // 剩余时间条
        ctx.save()
        ctx.fillStyle = 'rgba(255,255,255,.12)'
        ctx.fillRect(x - 22, cy + 34, 44, 4)
        ctx.fillStyle = col
        ctx.fillRect(x - 22, cy + 34, 44 * k, 4)
        ctx.restore()
      } else {
        text.stroked(ctx, '?', x, cy + 2, { size: 24, align: 'center', color: 'rgba(255,255,255,.22)', lw: 4 })
      }
    }
    // 命中反馈：整步闪一下
    if (s.flash > 0) {
      ctx.save()
      ctx.globalAlpha = util.clamp(s.flash / 0.22, 0, 1) * 0.5
      ctx.fillStyle = s.flashOk ? '#5ee06a' : '#ff6b6b'
      ctx.fillRect(0, 0, W, H)
      ctx.restore()
    }
    text.stroked(ctx, `成功 ${s.hits} / ${n}`, cx, cy + 92,
      { size: 17, align: 'center', color: '#e8eefc', lw: 4 })
    if (s.flash > 0 && s.flashOk) text.stroked(ctx, '结印成功！', cx, cy + 118, { size: 18, align: 'center', color: '#5ee06a', lw: 4 })
    else if (s.flash > 0) text.stroked(ctx, '结印失败', cx, cy + 118, { size: 16, align: 'center', color: '#ff6b6b', lw: 4 })
    ctx.restore()
  }

  // 出手顺序条：把本回合按速度排出的行动序列画在顶部（官方战斗界面顶部就有这一条）。
  // 当前行动者高亮，下面标速度值 —— 让"谁快谁先动"一眼可见。
  function drawTurnOrder(b) {
    const order = b.turnOrder || []
    if (order.length < 2) return
    // 显示**整轮**的顺序，而不只是"接下来的"：
    // 已行动的变暗、当前的高亮 —— 玩家一眼能看出这轮走到哪了。
    // 注意等待玩家输入时 turnIdx 已经越过玩家那一格（见 advanceTurn），所以当前格要减 1。
    const curIdx = b.phase === 'command' ? Math.max(0, b.turnIdx - 1) : (b.turnIdx || 0)
    const list = order.slice(0, 6)
    if (!list.length) return
    const cw = 32, gap = 5
    const total = list.length * cw + (list.length - 1) * gap
    const x0 = W / 2 - total / 2, y = 10
    text.stroked(ctx, '出手顺序', x0 - 8, y + 20,
      { size: 11, align: 'right', color: '#8fa0c0', weight: 'normal', lw: 3 })
    list.forEach((slot, k) => {
      const x = x0 + k * (cw + gap)
      const isP = slot.side === 'player'
      const cur = k === curIdx
      const done = k < curIdx
      ctx.save()
      ctx.globalAlpha = done ? 0.42 : 1          // 已行动的变暗
      ctx.fillStyle = cur ? 'rgba(255,210,63,.22)' : 'rgba(8,14,26,.82)'
      roundBox(x, y, cw, cw, 7); ctx.fill()
      ctx.strokeStyle = cur ? '#ffd23f' : isP ? '#5ee06a' : '#ff8a8a'
      ctx.lineWidth = cur ? 2.5 : 1.5
      roundBox(x, y, cw, cw, 7); ctx.stroke()
      ctx.restore()
      if (isP) {
        // 玩家：形态头像；取不到就画一个绿点
        const me = art.icon(S.form)
        if (art.ready(me)) { ctx.save(); ctx.globalAlpha = done ? 0.42 : 1; ctx.drawImage(me, x + 3, y + 3, cw - 6, cw - 6); ctx.restore() }
        else { ctx.fillStyle = '#5ee06a'; ctx.beginPath(); ctx.arc(x + cw / 2, y + cw / 2, 8, 0, Math.PI * 2); ctx.fill() }
      } else {
        // 敌人：属性色圆点 + 名字首字（比塞一张立绘安全，尺寸可控）
        ctx.save()
        ctx.globalAlpha = done ? 0.42 : 1
        const col = D.ELEMENT_COLOR[slot.element] || '#ff8a8a'
        ctx.fillStyle = col
        ctx.beginPath(); ctx.arc(x + cw / 2, y + cw / 2, 10, 0, Math.PI * 2); ctx.fill()
        text.stroked(ctx, String(slot.name || '?').slice(0, 1), x + cw / 2, y + cw / 2 + 5,
          { size: 13, align: 'center', color: '#101826', lw: 2 })
        ctx.restore()
      }
      text.stroked(ctx, String(slot.spd), x + cw / 2, y + cw + 11,
        { size: 9.5, align: 'center', color: cur ? '#ffd23f' : '#8fa0c0', weight: 'normal', lw: 2.5 })
    })
    if (curIdx === 0 || b.phase === 'command') {
      text.stroked(ctx, b.phase === 'command' ? '轮到我方' : '行动中',
        x0 + total + 8, y + 20, { size: 10.5, weight: 'normal', color: '#ffe45e', lw: 3 })
    }
  }

  function drawBattle() {
    const b = S.battle
    if (!b) return
    // 布局算一次，整个函数共用（状态栏、指令按钮、技能网格都靠它对齐；
    // 早先只在 command 分支里算，结果状态栏引用 L.barY 时是 undefined 直接崩了）
    const L = battleLayout(b)
    drawBackground(S.current, 0.5)

    // ---------- 对战画面框架 ----------
    // 顶部压暗，让对手信息看得清
    let bg = ctx.createLinearGradient(0, 0, 0, 96)
    bg.addColorStop(0, 'rgba(4,8,16,.85)'); bg.addColorStop(1, 'rgba(4,8,16,0)')
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, 96)

    // 两块战斗台座（椭圆地面），把双方"放在"场上
    const pad = (cx, cy, rx, ry, col) => {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx)
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.save()
      ctx.fillStyle = g
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }
    pad(G.app.battleGeom.P_POS.x, G.app.battleGeom.P_POS.y + 6, 118, 34, 'rgba(90,200,255,.28)')
    b.enemies.forEach((e, i) => {
      const p = E_POS(i)
      pad(p.x, p.y + 6, 128, 36, 'rgba(255,120,90,.26)')
    })

    // 顶部标题条：显示当前场景与「对战中」
    // 注意起点要避开左上角的队伍卡（46x46 @ 16,16）—— 早先写在 x=16，
    // 文字正好压在卡片上（_tools/ui-overlap.mjs 的"按钮压字"检查抓出来的）。
    ctx.fillStyle = 'rgba(8,12,22,.72)'
    ctx.fillRect(0, 0, W, 34)
    text.stroked(ctx, `⚔ 对战中　${S.current ? S.current.name : ''}`, 78, 24,
      { size: 13, color: '#ffd23f' })

    // ---------- 对手 ----------
    const alive = b.enemies.filter((e) => !e.dead)
    const now = performance.now() / 1000
    // 敌方名牌（照原版：画面**右上角**同高的一块，多人时往下排）
    // 原版敌方名牌与玩家名牌同高（y 16~71 / 962×546），所以这里 y 也取同一个值。
    b.enemies.forEach((e, i) => {
      drawBattleNameplate({
        align: 'right', x: W - 16, y: 14 + i * 56,
        name: e.name, level: e.level, dead: e.dead,
        img: monImage(e.mon),                       // 怪物立绘当头像
        fallback: D.ELEMENT_COLOR[e.element] || '#888',
        hp: e.hp, maxHp: e.maxHp, mp: e.mp, maxMp: e.maxMp,
        big: b.enemies.length === 1,
      })
    })
    b.enemies.forEach((e, i) => {
      const base = E_POS(i)
      // 出手前冲
      let lunge = 0
      if (b.phase === 'acting' && b.actionSide === 'enemy' && b.action && b.action.actor === e) {
        lunge = Math.sin(Math.min(1, b.action.t / 0.3) * Math.PI)
      }
      const dispH = util.clamp(150 + (e.size || 90) * 1.0, 170, 280)
      // 怪物在右侧 → 要**朝左**面对玩家。`flip` 只回答"要不要镜像这张图"：
      //   素材**朝右**的（在 MONSTER_ART_FACES_RIGHT 表里）→ 镜像 → 朝左 ✓
      //   素材**朝左**的（不在表里，例：绿毒粘液兽）→ 不镜像 → 朝左 ✓
      // ⚠️ 第 56 轮修：这里原来写的是 `!artFacesRight`，正好**反了** ——
      //    素材朝左的怪被镜像成朝右、背对玩家（用户报「怪物还是反的」）。
      //    判据是素材本身：`assets/monsters/labeled/mon_10003.png` 眼睛在左、鳍在右 = 朝左。
      const artFacesRight = G.app.battleGeom.MONSTER_ART_FACES_RIGHT.has(e.mon.id)
      drawMonster(e.mon, base.x, base.y, dispH, {
        t: now, phase: i * 1.3, flash: e.flash, dead: e.dead, lunge,
        flip: artFacesRight,
      })
      // 目标指示
      if (alive[util.clamp(b.target, 0, alive.length - 1)] === e && b.phase === 'command') {
        const bob = Math.sin(now * 5) * 5
        text.stroked(ctx, '▼', base.x, base.y - dispH - 46 + bob, { size: 30, color: '#ffe45e', align: 'center', lw: 5 })
        // 选中环
        ctx.save()
        ctx.strokeStyle = 'rgba(255,210,63,.9)'; ctx.lineWidth = 3
        ctx.beginPath(); ctx.ellipse(base.x, base.y + 6, 96, 26, 0, 0, Math.PI * 2); ctx.stroke()
        ctx.restore()
      }
      // 对手信息面板：改成原版风格的名牌（已在上面统一画好），这里不再画旧的暗色块
      void 0
    })

    // ---------- 玩家 ----------
    const p = b.player
    // 【第 51 轮：**删掉**原来给玩家加的金色战斗名牌】
    // 用户口径：「删除金色的那个，冲突了多比」—— 左上角队伍卡本来就画了
    // **头像 + 等级牌 + 红血条 + 蓝魔条 + 形态名**，再挂一块金色板就是**同一份信息画两遍**，
    // 而且金色跟队伍卡上的「多比」名牌在视觉上打架。
    // 所以战斗里玩家状态**只保留队伍卡那一处**（单一事实源，界面也一样）。
    let pAction = S.form.actionBattle || S.form.actionIdle
    let pT = b.animT
    let pPose = null
    if (b.phase === 'acting' && b.actionSide === 'player' && b.action) {
      if (b.action.anim) { pAction = b.action.anim; pT = b.action.t }
      // ★ 这里刻意不用 `else`：立绘是静态图，无论有没有招式动画帧都必须做一次可见的动作，
      //   否则就会退回"站着不动把技能放了"（用户报的「人物没有攻击动作」）。
      //   只作用于自己的技能（治疗/增益/防御）用原地蓄气，不往敌人身上冲。
      pPose = attackPose(b.action.t, b.actionDur || 0.8, playerActionIsSelfCast(b))
    }
    S._playerPose = pPose        // 供测试读取实际应用的姿态（见 _tools/test-attack-anim.mjs）
    drawSoyaInBattle(now)          // 索亚站在主人身边
    if (p.flash > 0) ctx.save()
    // 冲刺残影：让"冲出去"这件事一眼可见
    if (pPose && pPose.dx > 8) {
      for (let i = 2; i >= 1; i--) {
        ctx.save()
        ctx.globalAlpha = 0.18 / i
        drawFigure(G.app.battleGeom.P_POS.x + pPose.dx * (1 - i * 0.12), G.app.battleGeom.P_POS.y, 170, pAction, pT,
          G.app.battleGeom.PLAYER_FACE_RIGHT ? 1 : -1,
          { dx: 0, lean: pPose.lean * 0.5, squash: 0 })
        ctx.restore()
      }
      ctx.globalAlpha = 1
    }
    drawFigure(G.app.battleGeom.P_POS.x, G.app.battleGeom.P_POS.y, 170, pAction, pT, G.app.battleGeom.PLAYER_FACE_RIGHT ? 1 : -1, pPose)
    if (p.flash > 0) ctx.restore()
    // 角色头顶不再挂名牌：左上角队伍卡已经写了名字/等级/形态，重复一份只是挡画面
    if (getHop() > 0) setHop(Math.max(0, getHop() - 0.05))

    // 技能特效：画在角色之上、UI 之下
    if (b.fx && b.fx.length) {
      ctx.save()
      for (const f of b.fx) FX.draw(ctx, f)
      ctx.restore()
    }

    // ---------- 伤害飘字 ----------
    // 从被打对象头顶冒出，向上浮 46px 并淡出
    if (b.floats && b.floats.length) {
      for (const f of b.floats) {
        const k = f.t / f.dur
        let bx, by
        if (f.on && f.on.isPlayer) {
          bx = G.app.battleGeom.P_POS.x; by = G.app.battleGeom.P_POS.y - 210
        } else {
          const i = b.enemies.indexOf(f.on)
          const p = E_POS(i < 0 ? 0 : i)
          const dispH = util.clamp(150 + ((f.on && f.on.size) || 90) * 1.0, 170, 280)
          bx = p.x; by = p.y - dispH - 20
        }
        const rise = 46 * Math.min(1, k * 1.4)
        const alpha = k < 0.15 ? k / 0.15 : Math.max(0, 1 - (k - 0.15) / 0.85)
        // 出现瞬间放大一下，更有冲击力
        const pop = k < 0.18 ? 1 + (0.18 - k) * 2.2 : 1
        ctx.save()
        ctx.globalAlpha = alpha
        text.stroked(ctx, f.text, bx, by - rise, {
          size: f.size * pop, align: 'center', color: f.color, lw: 5,
        })
        if (f.tag) {
          text.stroked(ctx, f.tag, bx, by - rise - f.size * 0.85, {
            size: 13, align: 'center', color: f.color, lw: 4,
          })
        }
        ctx.restore()
      }
    }

    // ---------- 底部操作栏（第 51 轮：照原版重画）----------
    // 原版实测（`_tools/probe-battle-bar.mjs`，962 宽画布）：
    //   · 一整条**深蓝圆角面板**横贯画面底部，边框是**浅蓝**亮线；
    //   · 6 个技能格：每格 **64×64**、格间 **11px**、从画面右侧往左排（最右一格贴右边缘）；
    //   · 技能格底色是**浅银灰渐变** `#ced5e8`→`#bcbac7` + 浅蓝描边（与深蓝面板对比很强）；
    //   · 左下角一条**白底消息框** `#cdd3e1` + 三个**橙色方钮**。
    // 我们画布 960×540 与原版 962×546 几乎 1:1，所以尺寸直接按原版像素用。
    const B = G.app.battleGeom.BATTLE_BAR
    const barRound = roundBox          // 圆角路径已提到模块级（drawSealUI 也要用）
    // 面板底：深蓝→墨绿渐变（原版底色实测范围 #1d2f6e ~ #0c3635）
    const panelG = ctx.createLinearGradient(0, B.y, 0, B.y + G.app.battleGeom.BATTLE_BAR_H)
    panelG.addColorStop(0, '#1d2f6e'); panelG.addColorStop(1, '#0c3635')
    ctx.fillStyle = panelG
    barRound(6, B.y, W - 12, G.app.battleGeom.BATTLE_BAR_H, 16); ctx.fill()
    // 外框：浅蓝亮线（原版最外那条）
    ctx.strokeStyle = '#8fc4e8'; ctx.lineWidth = 3
    barRound(8, B.y + 2, W - 16, G.app.battleGeom.BATTLE_BAR_H - 4, 14); ctx.stroke()
    // 内框：一圈偏暗的描边，做出"双层镶边"的厚度感
    ctx.strokeStyle = 'rgba(20,40,80,.85)'; ctx.lineWidth = 2
    barRound(12, B.y + 6, W - 24, G.app.battleGeom.BATTLE_BAR_H - 12, 11); ctx.stroke()

    // 左侧区：原来写"敌人 N/M + 回合 N"。第 51 轮把这两条信息移进**消息框**，
    // 因为原版这块地方只有"消息框 + 三个橙钮"；再挤一块信息面板就会和按钮叠在一起
    // （截图里实测到三个钮正好压在"敌人 2/2 / 回合 1"上）。

    // 红色行动条：表示**本回合出手序列的进度**（按速度排出的序列走到第几位）。
    {
      const first = L.cmdRects[0], lastR = L.cmdRects[L.cmdRects.length - 1]
      const ax = first.x, aw = lastR.x + lastR.w - ax
      const total = Math.max(1, (b.turnOrder || []).length)
      const done = util.clamp(b.turnIdx || 0, 0, total)
      ctx.fillStyle = '#2a0f12'
      ctx.fillRect(ax, B.y + 14, aw, 10)
      ctx.fillStyle = '#c0392b'
      ctx.fillRect(ax + 2, B.y + 16, (aw - 4) * util.clamp(done / total, 0, 1), 6)
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1
      ctx.strokeRect(ax + .5, B.y + 14.5, aw - 1, 9)
      for (let i = 1; i < total; i++) {
        ctx.fillStyle = 'rgba(255,255,255,.25)'
        ctx.fillRect(ax + (aw / total) * i, B.y + 14, 1, 10)
      }
      text.stroked(ctx, b.enemyPhase ? `敌人行动中 ${done}/${total}` : `本回合 ${done}/${total}`,
        ax + aw + 8, B.y + 24, { size: 10.5, weight: 'normal', lw: 3, color: '#9fb0cc' })
    }
    // 六个方形指令格：画图标 + 名字
    // 指令图标。【第 54 轮修：浅底要配深色图标】
    // ⚠️ 这里的颜色原先是**为暗色格子选的**（亮金 #ffd23f / 亮蓝 #9fd8ff / 亮灰 #cfd6e4）——
    //    第 51 轮把格子改成**浅银灰底**（照原版）之后，就变成"亮底压亮色"，
    //    图标基本上看不见了（截图里「攻击」格只剩一个空金框）。
    //    所以每个图标给出**两套色**：`ik(on)` = 选中态（暖金底 → 深褐）、
    //    `ik2` = 普通态（浅银灰底 → 深蓝）。契约是"和底色有足够对比"，而不是固定色值。
    const IK_SEL = '#7a4a10'      // 选中（暖金底）上的深褐
    const IK_NORM = '#1b2b52'     // 普通（浅银灰底）上的深蓝
    const ik = (on) => (on ? IK_SEL : IK_NORM)
    const CMD_ICON = {
      攻击: (cx, cy, on) => { ctx.strokeStyle = ik(on); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 11, cy + 11); ctx.lineTo(cx + 11, cy - 11); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx + 4, cy - 14); ctx.lineTo(cx + 14, cy - 4); ctx.stroke() },
      技能: (cx, cy, on) => { ctx.fillStyle = on ? IK_SEL : '#2b6cb0'; ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 5; const r = i % 2 ? 5 : 13; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) } ctx.closePath(); ctx.fill() },
      道具: (cx, cy, on) => { ctx.fillStyle = on ? '#c98b2a' : '#d98a2b'; ctx.fillRect(cx - 11, cy - 4, 22, 16); ctx.fillStyle = on ? IK_SEL : '#7a4a10'; ctx.fillRect(cx - 4, cy - 12, 8, 8); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(cx - 8, cy, 5, 8) },
      防御: (cx, cy, on) => { ctx.fillStyle = on ? IK_SEL : '#2b6cb0'; ctx.beginPath(); ctx.moveTo(cx, cy - 13); ctx.lineTo(cx + 12, cy - 7); ctx.lineTo(cx + 9, cy + 10); ctx.lineTo(cx, cy + 14); ctx.lineTo(cx - 9, cy + 10); ctx.lineTo(cx - 12, cy - 7); ctx.closePath(); ctx.fill() },
      逃跑: (cx, cy, on) => { ctx.strokeStyle = ik(on); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx + 11, cy); ctx.lineTo(cx - 9, cy); ctx.moveTo(cx - 9, cy); ctx.lineTo(cx - 2, cy - 7); ctx.moveTo(cx - 9, cy); ctx.lineTo(cx - 2, cy + 7); ctx.stroke() },
      自动: (cx, cy, on) => { ctx.strokeStyle = ik(on); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, 11, 0.6, 5.4); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx + 8, cy - 10); ctx.lineTo(cx + 14, cy - 6); ctx.lineTo(cx + 6, cy - 3); ctx.closePath(); ctx.fillStyle = ik(on); ctx.fill() },
    }
    L.cmdRects.forEach((r) => {
      const isMain = b.menu === 'main'
      const sel = isMain && r.i === b.menuSel
      const hovered = isMain && S.hoverCmd === r.i
      const open = (r.i === 1 && b.menu === 'skill') || (r.i === 2 && false) || (r.i === 1 ? b.menu === 'skill' : false)
      // 格子外观照原版：**浅银灰渐变底 + 浅蓝描边**（选中=暖金、悬停=浅蓝）
      // 【为什么文字颜色也要改】原来是"暗格子 + 白字"；换成浅底后白字会看不清，
      //   所以未选中用**深蓝字**、选中/悬停用**亮金字**，对比度才够（画面对比度是硬要求）。
      drawOrigPanel(r.x, r.y, r.w, r.h, sel
        ? { top: '#ffe9a3', bot: '#f0b53c', edge: '#fff3c8', r: 12 }
        : hovered
          ? { top: '#e8f4ff', bot: '#cfe2f5', edge: '#7fc0e8', r: 12 }
          : { top: '#ced5e8', bot: '#bcbac7', edge: '#afbfcf', r: 12 })
      if (sel || hovered) {
        // 选中/悬停再加一圈描边，保证"当前选的是哪个"一眼可见
        ctx.save()
        ctx.strokeStyle = sel ? 'rgba(255,210,63,.85)' : 'rgba(67,217,200,.7)'
        ctx.lineWidth = sel ? 3 : 2
        barRound(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 10); ctx.stroke()
        ctx.restore()
      }
      const cx = r.x + r.w / 2, cy = r.y + 26
      const on = sel || hovered
      if (CMD_ICON[r.label]) CMD_ICON[r.label](cx, cy, on)
      text.stroked(ctx, r.label, cx, r.y + r.h - 8,
        { size: 13, align: 'center', lw: 3, color: on ? '#fff8e0' : '#1b2b52' })
    })

    // 左下角：战斗消息框 + 三个橙色按钮（原版的固定件，第 51 轮补）
    drawBattleMsgAndButtons(B, L)

    // 大红圆钮（原版那个镶水晶的"确定"钮）+ 四颗小圆钮
    {
      const g2 = L.bigC
      ctx.save()
      ctx.fillStyle = '#1b4a86'
      ctx.beginPath(); ctx.arc(g2.x, g2.y, g2.r, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#5aa8ff'; ctx.lineWidth = 5
      ctx.beginPath(); ctx.arc(g2.x, g2.y, g2.r - 3, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(g2.x, g2.y, g2.r - 9, 0, Math.PI * 2); ctx.stroke()
      // 中间的粉色水晶
      ctx.fillStyle = '#ff5fd0'
      ctx.beginPath()
      ctx.moveTo(g2.x, g2.y - 18); ctx.lineTo(g2.x + 13, g2.y)
      ctx.lineTo(g2.x, g2.y + 18); ctx.lineTo(g2.x - 13, g2.y)
      ctx.closePath(); ctx.fill()
      ctx.strokeStyle = '#ffd6f4'; ctx.lineWidth = 2; ctx.stroke()
      // 可点时呼吸发光
      if (b.phase === 'command') {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 320)
        ctx.globalAlpha = 0.25 + pulse * 0.35
        ctx.strokeStyle = '#ffe45e'; ctx.lineWidth = 3
        ctx.beginPath(); ctx.arc(g2.x, g2.y, g2.r + 3, 0, Math.PI * 2); ctx.stroke()
        ctx.globalAlpha = 1
      }
      text.stroked(ctx, '确定', g2.x, g2.y + g2.r - 6, { size: 11.5, align: 'center', color: '#ffffff', lw: 3 })
      ctx.restore()
      // （原来这里还有四颗小圆钮，纯装饰、点了没反应，已删）
    }

    // ---------- 左上角队伍状态卡（原版：头像 + 等级牌 + 红血条 + 蓝魔条）----------
    {
      const cx0 = 8, cy0 = 8, cw = 236, ch = 62
      ctx.fillStyle = 'rgba(10,18,34,.92)'
      barRound(cx0, cy0, cw, ch, 10); ctx.fill()
      ctx.strokeStyle = '#3aa0e8'; ctx.lineWidth = 2.5
      barRound(cx0 + 1, cy0 + 1, cw - 2, ch - 2, 9); ctx.stroke()
      // 头像
      const av = 46, ax = cx0 + 8, ay = cy0 + 8
      ctx.fillStyle = '#0d1c34'; ctx.fillRect(ax, ay, av, av)
      const me = art.icon(S.form)
      if (art.ready(me)) {
        const iw = Math.round(av * (me.naturalWidth / me.naturalHeight))
        ctx.drawImage(me, ax + (av - iw) / 2, ay, iw, av)
      }
      ctx.strokeStyle = '#7fb6e0'; ctx.lineWidth = 1.5; ctx.strokeRect(ax + .75, ay + .75, av - 1.5, av - 1.5)
      // 等级牌
      ctx.fillStyle = '#ffd23f'
      ctx.fillRect(ax - 2, ay - 2, 26, 15)
      text.stroked(ctx, String(p.level), ax + 11, ay + 11, { size: 11, align: 'center', color: '#3a2a00', lw: 0 })
      // 红血条 + 蓝魔条
      const bx2 = ax + av + 8, bw2 = cx0 + cw - 10 - bx2
      ctx.fillStyle = '#3a0d10'; ctx.fillRect(bx2, ay + 4, bw2, 15)
      ctx.fillStyle = '#e8453c'; ctx.fillRect(bx2 + 1, ay + 5, (bw2 - 2) * util.clamp(p.hp / p.maxHp, 0, 1), 13)
      text.stroked(ctx, `${Math.round(p.hp)}/${p.maxHp}`, bx2 + bw2 / 2, ay + 16, { size: 11, align: 'center', color: '#fff', lw: 2 })
      ctx.fillStyle = '#0e2438'; ctx.fillRect(bx2, ay + 24, bw2, 14)
      ctx.fillStyle = '#3a9bff'; ctx.fillRect(bx2 + 1, ay + 25, (bw2 - 2) * util.clamp(p.mp / p.maxMp, 0, 1), 12)
      text.stroked(ctx, `${Math.round(p.mp)}/${p.maxMp}`, bx2 + bw2 / 2, ay + 35, { size: 11, align: 'center', color: '#fff', lw: 2 })
      text.stroked(ctx, S.form.name, bx2, ay + 52, { size: 11, weight: 'normal', lw: 3, color: '#9fb0cc' })
    }

    // ---------- 战斗提示：只留最近一行 ----------
    // 原来是一个 330×116 的日志框挂在左上角，官方没有这东西，而且挡掉一块战场。
    // 现在只把**最后一条**消息显示在顶部中间，历史信息靠伤害飘字表达。
    if (b.log.length) {
      const last = b.log[b.log.length - 1]
      ctx.save()
      ctx.font = 'bold 13px "Microsoft YaHei", sans-serif'
      const tw = ctx.measureText(last).width
      ctx.fillStyle = 'rgba(8,12,22,.72)'
      ctx.fillRect(W / 2 - tw / 2 - 12, 88, tw + 24, 24)
      ctx.restore()
      text.stroked(ctx, last, W / 2, 105, { size: 13, align: 'center', color: '#ffe45e', lw: 3 })
    }

    // ---------- 开场演出 ----------
    // 进场时双方从画面两侧滑入 + 显示「VS」，比直接跳进指令菜单更有仪式感
    if (b.intro > 0) {
      const k = 1 - b.intro / 1.5           // 0→1
      const ease = 1 - Math.pow(1 - Math.min(1, k * 1.6), 3)
      // 两侧拉开的速度线
      ctx.save()
      ctx.globalAlpha = Math.max(0, 1 - k * 1.4)
      for (let i = 0; i < 8; i++) {
        const y = 120 + i * 40
        ctx.strokeStyle = i % 2 ? 'rgba(255,210,63,.5)' : 'rgba(67,217,200,.5)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(0, y); ctx.lineTo(200 * ease, y)
        ctx.moveTo(W, y); ctx.lineTo(W - 200 * ease, y)
        ctx.stroke()
      }
      ctx.restore()
      // VS 字样
      const vsA = Math.min(1, k * 2) * Math.max(0, 1 - (k - 0.6) / 0.4)
      if (vsA > 0) {
        ctx.save()
        ctx.globalAlpha = vsA
        const sc = 1 + Math.max(0, 0.6 - k) * 1.2
        text.stroked(ctx, 'VS', W / 2, H / 2 - 40, {
          size: 64 * sc, align: 'center', color: '#ffd23f', lw: 10,
        })
        text.stroked(ctx, `${p.name}　${S.form.name}`, W / 2 - 180, H / 2 + 10, {
          size: 18, align: 'center', color: '#43d9c8', lw: 5,
        })
        text.stroked(ctx, `${b.enemies[0].name}　Lv.${b.enemies[0].level}`, W / 2 + 180, H / 2 + 10, {
          size: 18, align: 'center', color: '#ff8a8a', lw: 5,
        })
        ctx.restore()
      }
      // 提示
      text.stroked(ctx, `${b.enemies.map((e) => e.name).join('、')} 出现了！`, W / 2, H - 120,
        { size: 22, align: 'center', color: '#ffe45e', lw: 7 })
      return
    }

    // ---------- 指令区 ----------
    if (b.phase === 'command') {
      if (b.menu === 'main') {
        // 页游风格：底部横排按钮（坐标来自 battleLayout，与点击判定共用）
        L.cmdRects.forEach((r) => {
          const sel = r.i === b.menuSel
          const hovered = S.hoverCmd === r.i
          ctx.fillStyle = sel ? 'rgba(255,210,63,.28)' : hovered ? 'rgba(43,217,200,.2)' : 'rgba(16,22,36,.92)'
          ctx.fillRect(r.x, r.y, r.w, r.h)
          ctx.strokeStyle = sel ? '#ffd23f' : hovered ? '#43d9c8' : 'rgba(255,255,255,.25)'
          ctx.lineWidth = sel || hovered ? 2.5 : 1
          ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)
          text.stroked(ctx, r.label, r.x + r.w / 2, r.y + 21,
            { size: 14, align: 'center', color: sel ? '#ffe45e' : hovered ? '#d8fff8' : '#e8eefc', lw: 3 })
        })
        // 提示与目标：放到操作栏**上方**。
        // 操作栏改成原版那种底部通栏之后，原来写在 cmdY±20 的文字正好压在指令格上。
        const tg = alive[util.clamp(b.target, 0, alive.length - 1)]
        if (tg) text.stroked(ctx, `目标：${tg.name}`, 18, B.y - 26,
          { size: 13, color: '#ffb3b3', lw: 3 })
        text.stroked(ctx, '鼠标点击 或 ↑↓ 选择　空格 确定　点敌人可换目标　右侧圆钮 = 确定', 18, B.y - 8,
          { size: 11, weight: 'normal', lw: 3, color: '#9fb0cc' })
      } else if (b.menu === 'skill') {
        // 技能列表：按钮网格（同样共用布局）
        ctx.fillStyle = 'rgba(6,10,18,.92)'
        ctx.fillRect(L.gx - 12, L.gy - 34, L.gridW + 24, L.gridH + 46)
        ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1
        ctx.strokeRect(L.gx - 11.5, L.gy - 33.5, L.gridW + 23, L.gridH + 45)
        text.stroked(ctx, `技能　Esc 返回　（鼠标可直接点）`, L.gx, L.gy - 14, { size: 13, color: '#ffd23f' })
        L.skillRects.forEach((r) => {
          const sk = D.SKILLS[r.name] || {}
          const sel = r.i === b.skillSel
          const hovered = S.hoverSkill === r.i
          const cdLeft = (b.cooldowns && b.cooldowns[r.name]) || 0
          const enough = p.mp >= (sk.energy || 0)
          const usable = cdLeft <= 0 && enough
          ctx.fillStyle = sel ? 'rgba(255,210,63,.26)' : hovered ? 'rgba(43,217,200,.2)' : 'rgba(18,24,40,.95)'
          ctx.fillRect(r.x, r.y, r.w, r.h)
          ctx.strokeStyle = !usable ? 'rgba(255,255,255,.12)' : sel ? '#ffd23f' : hovered ? '#43d9c8' : 'rgba(255,255,255,.2)'
          ctx.lineWidth = sel || hovered ? 2 : 1
          ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)
          text.stroked(ctx, r.name, r.x + 10, r.y + 20,
            { size: 13, lw: 3, color: !usable ? '#6b7891' : sel ? '#ffe45e' : '#e8eefc' })
          const tail = cdLeft > 0
            ? `冷却中 ${cdLeft} 回合`
            : sk.seal
              ? `结印 SP${sk.sp || 1}　${['单体', '范围', '群体'][sk.range || 0] || '单体'}`
              : `CD${sk.cd || 1}　耗${sk.energy || 0}　${['单体', '范围', '群体'][sk.range || 0] || '单体'}`
          text.stroked(ctx, tail, r.x + r.w - 10, r.y + 20,
            { size: 10.5, weight: 'normal', lw: 3, align: 'right', color: cdLeft > 0 ? '#ffb3b3' : sk.seal ? '#ffd23f' : '#9fb0cc' })
          // 冷却中的斜纹遮罩
          if (cdLeft > 0) {
            ctx.save()
            ctx.globalAlpha = 0.35
            ctx.fillStyle = '#0a0f1a'
            ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4)
            ctx.restore()
          }
        })
      } else if (b.menu === 'item') {
        // 道具面板：三个页签 + 道具网格（图标 + 数量 + 简介）
        const IR = itemRects(b)
        const tabs = D.ITEM_TABS
        const headH = 34
        ctx.fillStyle = 'rgba(6,10,18,.94)'
        ctx.fillRect(IR.gx - 12, IR.gy - headH - 6, IR.gridW + 24, IR.gridH + headH + 18)
        ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1
        ctx.strokeRect(IR.gx - 11.5, IR.gy - headH - 5.5, IR.gridW + 23, IR.gridH + headH + 17)
        // 页签
        const tabW = 86, tabH = 22
        tabs.forEach((t, i) => {
          const tx = IR.gx, ty = IR.gy - headH + 2 + i * (tabH + 3)
          const on = i === (b.itemTab || 0)
          const n = bagOwned(t.key).length
          ctx.fillStyle = on ? 'rgba(255,210,63,.26)' : 'rgba(18,24,40,.95)'
          ctx.fillRect(tx, ty, tabW, tabH)
          ctx.strokeStyle = on ? '#ffd23f' : 'rgba(255,255,255,.2)'
          ctx.strokeRect(tx + .5, ty + .5, tabW - 1, tabH - 1)
          text.stroked(ctx, `${t.label} ${n}`, tx + tabW / 2, ty + 16,
            { size: 12, align: 'center', lw: 3, color: on ? '#ffe45e' : n ? '#e8eefc' : '#6b7891' })
        })
        text.stroked(ctx, '道具　Q/E 换页签　Esc 返回　（鼠标可直接点）', IR.gx + tabW + 14, IR.gy - headH + 18,
          { size: 13, color: '#ffd23f' })
        if (IR.pages > 1) {
          text.stroked(ctx, `第 ${IR.page + 1}/${IR.pages} 页`, IR.gx + IR.gridW, IR.gy - headH + 18,
            { size: 12, align: 'right', color: '#9fb0cc' })
        }
        if (!IR.list.length) {
          text.stroked(ctx, '这一页没有道具　到主城的杂货铺买一些吧', IR.gx + IR.gridW / 2, IR.gy + IR.gridH / 2,
            { size: 14, align: 'center', color: '#9fb0cc', lw: 3 })
        }
        IR.rects.forEach((r) => {
          const it = r.it
          if (!it) return
          const sel = r.i === b.itemSel
          const hovered = S.hoverItem === r.i
          ctx.fillStyle = sel ? 'rgba(255,210,63,.26)' : hovered ? 'rgba(43,217,200,.2)' : 'rgba(18,24,40,.95)'
          ctx.fillRect(r.x, r.y, r.w, r.h)
          ctx.strokeStyle = sel ? '#ffd23f' : hovered ? '#43d9c8' : 'rgba(255,255,255,.2)'
          ctx.lineWidth = sel || hovered ? 2 : 1
          ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)
          const img = itemImage(it)
          if (img) ctx.drawImage(img, r.x + 6, r.y + 8, 30, 30)
          else {
            ctx.fillStyle = D.ELEMENT_COLOR[S.form.element] || '#888'
            ctx.fillRect(r.x + 12, r.y + 14, 18, 18)
          }
          // 上行：名字 + 数量
          text.stroked(ctx, it.name, r.x + 42, r.y + 19,
            { size: 12.5, lw: 3, color: sel ? '#ffe45e' : '#e8eefc' })
          text.stroked(ctx, '×' + bagCount(it.id), r.x + r.w - 8, r.y + 19,
            { size: 12.5, lw: 3, align: 'right', color: '#ffd23f' })
          // 下行：效果
          const eff = it.damageMul ? `造成约 ${Math.round(POWER(p) * it.damageMul)} 伤害${it.aoe ? '（群体）' : ''}`
            : it.buff ? `${({ atk: '攻击', def: '防御', matk: '魔攻', mdef: '魔抗' })[it.buff.stat]} +${Math.round(it.buff.pct * 100)}%　${it.buff.turns} 回合`
              : `${it.hp ? '生命 +' + it.hp : ''}${it.hp && it.mp ? '　' : ''}${it.mp ? '能量 +' + it.mp : ''}`
          text.stroked(ctx, eff, r.x + 42, r.y + 37,
            { size: 10.5, weight: 'normal', lw: 3, color: sel ? '#d8fff8' : '#9fb0cc' })
        })
      }
    }
    // 出手顺序条（顶部）
    drawTurnOrder(b)
    // SP 指示：官方「攒到 SP 以后结印技能的图标才会变亮」，所以这里要让玩家随时看得见攒了几格
    drawSpPips(b)
    // 结印操作界面（画在最上层，盖住面板）
    if (b.phase === 'sealing' && b.seal) drawSealUI(b)
    // 演出中的招式名
    if (b.phase === 'acting' && b.action && b.action.skillName)
      text.stroked(ctx, b.action.skillName, W / 2, 120, { size: 30, align: 'center', color: '#ffe45e', lw: 7 })
    // 醒目提示条（技能冷却 / 能量不足 / 道具不够），画在画面正中偏上，
    // 比右下角一闪而过的 toast 明显得多 —— 用户反馈"按空格没反应"就是缺这个反馈
    if (b.notice && performance.now() < b.notice.until) {
      const a = util.clamp((b.notice.until - performance.now()) / 400, 0, 1)
      ctx.save()
      ctx.globalAlpha = a
      ctx.font = 'bold 15px "Microsoft YaHei", sans-serif'
      const tw = ctx.measureText(b.notice.text).width
      const bx = W / 2 - tw / 2 - 20, by = 150
      ctx.fillStyle = 'rgba(90,20,24,.94)'
      ctx.fillRect(bx, by, tw + 40, 40)
      ctx.strokeStyle = '#ff8a8a'; ctx.lineWidth = 2
      ctx.strokeRect(bx + 1, by + 1, tw + 38, 38)
      text.stroked(ctx, b.notice.text, W / 2, by + 27, { size: 15, align: 'center', color: '#ffe0e0', lw: 3 })
      ctx.restore()
    } else if (b.notice && performance.now() >= b.notice.until) b.notice = null
    if (b.phase === 'over')
      text.stroked(ctx, b.victory ? '战斗胜利！' : '战斗失败…', W / 2, 250,
        { size: 46, align: 'center', color: b.victory ? '#ffe45e' : '#ff8a8a', lw: 9 })
  }

  // 向约定的出口注册（批次 6：界面层只画 + 布局）
  G.ui = G.ui || {}
  Object.assign(G.ui, { battleLayout, battleConfirm, battleEnemyHitTest, drawBattleMsgAndButtons,
    drawSealUI, drawTurnOrder, drawBattle })
})()