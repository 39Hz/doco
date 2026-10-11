/* 多克多比 · 应用层：小游戏实现（第 72 轮重构 · 批次 7 · 续）
   来源：原 game/game.js「小游戏系统（M4-4）」整段（make 工厂 + 每帧 tick + 重置 + miniStagePass）。
   官方依据与名字见 game/tables/minigames.js；入口 / 奖励 / 结算见 game/app/minigame.js。
   放在应用层的原因：这些实现读存档（难度 / 等级 / 多比形态）、写副本运行时状态、放音效，
   属「用例编排」；domain/ 只放零 I/O 的纯算术。
   依赖：引擎 window.DKDbb（save / audio / util / input）+ 内容表 window.DKDbbData（D）
        + 内核 G.core（W / H）+ 同层惰性别名（G.app.dungeon.* / G.app.battle.notice /
        G.app.minigame.finishMinigame / G.app.awaken.AWAKEN_STAGE_GAIN / G.app.awaken.PIPE_DIRS）
        + game.js 的难度桥（G.app.difficulty.diff / needOf / winOf）。
   只经 G.app.minigames 出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const { save, audio, util, input } = window.DKDbb
  const D = window.DKDbbData
  const { W, H } = G.core

  // 同层 / 跨模块惰性别名（调用时才解析 → 加载顺序无关）。
  const notice = (...a) => G.app.battle.notice(...a)
  const dungeonState = (...a) => G.app.dungeon.dungeonState(...a)
  const curStage = (...a) => G.app.dungeon.curStage(...a)
  const startDungeonStage = (...a) => G.app.dungeon.startDungeonStage(...a)
  const makeFlip = (...a) => G.app.dungeon.makeFlip(...a)
  const grantAttr = (...a) => G.app.dungeon.grantAttr(...a)
  const finishMinigame = (...a) => G.app.minigame.finishMinigame(...a)
  const needOf = (...a) => G.app.difficulty.needOf(...a)
  const winOf = (...a) => G.app.difficulty.winOf(...a)
  const diff = (...a) => G.app.difficulty.diff(...a)

  // 「魔法工匠」：3×3 滑动宝石，完成合成公式（目标图案见 D.MAGIC_RECIPE）
  function makeSlidePuzzle() {
    const target = (D.MAGIC_RECIPE || []).flat().map(Number)
    if (target.length !== 9) throw new Error('D.MAGIC_RECIPE 必须是 3×3')
    const cells = target.slice()
    // 从**目标图案倒着走 N 步**打乱 → 保证一定可解（正向走回去就行）
    let lastBlank = -1
    for (let i = 0; i < 60; i++) {
      const b = cells.indexOf(0)
      const bx = b % 3, by = Math.floor(b / 3)
      const cand = []
      for (let d = 0; d < 4; d++) {
        const nx = bx + G.app.awaken.PIPE_DIRS[d][0], ny = by + G.app.awaken.PIPE_DIRS[d][1]
        if (nx < 0 || ny < 0 || nx > 2 || ny > 2) continue
        const ni = ny * 3 + nx
        if (ni === lastBlank) continue          // 别原地来回
        cand.push(ni)
      }
      if (!cand.length) continue
      const pick = cand[Math.floor(Math.random() * cand.length)]
      cells[b] = cells[pick]; cells[pick] = 0
      lastBlank = b
    }
    // 极小概率打乱后仍是目标图案 → 再走一步
    if (cells.join('') === target.join('')) {
      const b = cells.indexOf(0), nx = (b % 3 === 0) ? b + 1 : b - 1
      cells[b] = cells[nx]; cells[nx] = 0
    }
    return { cells, target, sel: 0, moves: 0 }
  }
  function slideSolved(p) { return !!p && p.cells.join('') === p.target.join('') }
  // 把第 i 格的宝石滑进空位（只允许与空位相邻）
  function slideMove(i) {
    const st = dungeonState()
    const p = st.slide
    if (!p || slideSolved(p)) return false
    const b = p.cells.indexOf(0)
    const bx = b % 3, by = Math.floor(b / 3)
    const x = i % 3, y = Math.floor(i / 3)
    if (Math.abs(bx - x) + Math.abs(by - y) !== 1) return false   // 不相邻
    p.cells[b] = p.cells[i]; p.cells[i] = 0
    p.moves++
    p.sel = b
    audio.sfx('assets/sfx/onClick_03.mp3')
    if (slideSolved(p)) {
      notice('合成公式完成！')
      miniStagePass()
    }
    return true
  }
  function slideMoveDir(dx, dy) {
    const st = dungeonState()
    const p = st.slide
    if (!p) return false
    const b = p.cells.indexOf(0)
    const bx = b % 3, by = Math.floor(b / 3)
    const sx = bx + dx, sy = by + dy
    if (sx < 0 || sy < 0 || sx > 2 || sy > 2) return false
    return slideMove(sy * 3 + sx)
  }

  // ---- 「思维方块」：四个以上相同的方块，就可以消除哦~~（方向键控制提示框，空格键转动方向）----
  // 官方原话给了**消除判定**（四个以上相同）与**操作**（方向键移动提示框、空格转动方向）。
  // 官方**没给**盘面大小、颜色数、下落速度、过关条件 → 全是 derived（见 deviations V54）。
  function blocksShape(p) {
    return [0, 1, 2].map((i) => (p.dir === 'h' ? [p.cx + i, p.cy] : [p.cx, p.cy + i]))
  }
  function blocksFits(b, dir, cx, cy) {
    const probe = { dir, cx, cy }
    for (const [x, y] of blocksShape(probe)) {
      if (x < 0 || y < 0 || x >= b.cols || y >= b.rows) return false
      if (b.grid[y][x] >= 0) return false
    }
    return true
  }
  function makeBlocks() {
    const C = D.BLOCKS || { cols: 6, rows: 10, kinds: 4, need: 4, target: 4 }
    const grid = []
    for (let r = 0; r < C.rows; r++) grid.push(new Array(C.cols).fill(-1))
    const b = {
      grid, cols: C.cols, rows: C.rows, kinds: C.kinds, need: C.need,
      target: needOf(C.target || 4), lines: 0, t: 0, fall: 0.5, over: 0, flash: 0, lastClear: 0,
    }
    blocksSpawn(b)     // 提示框必须由 blocksSpawn 摆到顶部中间（早先手写了个 cx=0 的残桩，一开局就贴左边）
    return b
  }
  function blocksSpawn(b) {
    // 提示框从顶部中间出现；横着放不下就竖着放
    for (const dir of ['h', 'v']) {
      const cx = dir === 'h' ? Math.floor(b.cols / 2) - 1 : Math.floor(b.cols / 2)
      if (blocksFits(b, dir, cx, 0)) { b.piece = { cx, cy: 0, dir, kind: Math.floor(Math.random() * b.kinds) }; return true }
    }
    return false
  }
  function blocksLock(b) {
    for (const [x, y] of blocksShape(b.piece)) b.grid[y][x] = b.piece.kind
    const n = blocksClear(b)
    if (n) { b.lines += n; b.lastClear = n; b.flash = 0.3 }
    if (b.lines >= b.target) return 'win'
    if (!blocksSpawn(b)) return 'over'
    return null
  }
  // 找出所有"四个以上相同"的横/竖连续段（官方判定就是这个）
  // 写成两个直白的循环，不要用"行列共用扫描器"那种技巧 —— 上一个版本的键序就写反了。
  // 返回**每一段**（而不是"格的集合"），因为过关条件要按"消了几段"算：
  // 【第 41 轮修的 bug】早先按"消掉的格占了几个行号"计数 —— 竖着消一列 4 格会算成 **4 条**，
  // 于是「思维方块」有一局 **0.8 秒就通关**（自动试玩体检里冒出来的数字一眼就不对）。
  function blocksRunList(b) {
    const runs = []
    const need = b.need
    for (let r = 0; r < b.rows; r++) {
      let run = 1
      for (let c = 1; c <= b.cols; c++) {
        const cur = c < b.cols ? b.grid[r][c] : -2
        const prev = b.grid[r][c - 1]
        if (cur === prev && cur >= 0) { run++; continue }
        if (run >= need && prev >= 0) {
          const cells = []
          for (let k = c - run; k < c; k++) cells.push(`${r},${k}`)
          runs.push(cells)
        }
        run = 1
      }
    }
    for (let c = 0; c < b.cols; c++) {
      let run = 1
      for (let r = 1; r <= b.rows; r++) {
        const cur = r < b.rows ? b.grid[r][c] : -2
        const prev = b.grid[r - 1][c]
        if (cur === prev && cur >= 0) { run++; continue }
        if (run >= need && prev >= 0) {
          const cells = []
          for (let k = r - run; k < r; k++) cells.push(`${k},${c}`)
          runs.push(cells)
        }
        run = 1
      }
    }
    return runs
  }
  function blocksRuns(b) {
    return new Set(blocksRunList(b).flat())
  }
  function blocksClear(b) {
    const runs = blocksRunList(b)
    if (!runs.length) return 0
    for (const cells of runs) {
      for (const k of cells) { const [r, c] = k.split(',').map(Number); b.grid[r][c] = -1 }
    }
    // 消掉之后上面的方块落下来（同列重力）
    for (let c = 0; c < b.cols; c++) {
      const col = []
      for (let r = b.rows - 1; r >= 0; r--) if (b.grid[r][c] >= 0) col.push(b.grid[r][c])
      for (let r = b.rows - 1, i = 0; r >= 0; r--, i++) b.grid[r][c] = i < col.length ? col[i] : -1
    }
    // 过关条件按"消了几段"算（一段 = 一条四个以上的同色连线，横竖都算一段）
    return runs.length
  }
  function blocksMove(dx, dy) {
    const st = dungeonState()
    const b = st.bl
    if (!b || b.over) return false
    if (dx) {
      if (!blocksFits(b, b.piece.dir, b.piece.cx + dx, b.piece.cy)) return false
      b.piece.cx += dx
    }
    if (dy > 0) {
      if (blocksFits(b, b.piece.dir, b.piece.cx, b.piece.cy + 1)) { b.piece.cy += 1; b.t = 0 }
      else blocksLand(b)
    }
    audio.sfx('assets/sfx/onMouseOver_03.mp3')
    return true
  }
  function blocksRotate() {
    const st = dungeonState()
    const b = st.bl
    if (!b || b.over) return false
    const dir = b.piece.dir === 'h' ? 'v' : 'h'
    for (const off of [0, -1, 1, -2]) {
      if (blocksFits(b, dir, b.piece.cx + off, b.piece.cy)) {
        b.piece.dir = dir; b.piece.cx += off
        audio.sfx('assets/sfx/onClick_03.mp3')
        return true
      }
    }
    return false
  }
  function blocksLand(b) {
    const r = blocksLock(b)
    if (r === 'win') { notice('四个以上连成一线，消除！'); miniStagePass() }
    else if (r === 'over') {
      b.over = 1
      notice('方块堆到顶了，盘面重来（按空格继续）')
    }
  }
  function blocksTick(dt) {
    const st = dungeonState()
    const b = st.bl
    if (!b || b.over || st.phase !== 'blocks') return
    if (b.flash > 0) b.flash -= dt
    b.t += dt
    if (b.t >= b.fall) {
      b.t = 0
      if (blocksFits(b, b.piece.dir, b.piece.cx, b.piece.cy + 1)) b.piece.cy += 1
      else blocksLand(b)
    }
  }
  function blocksReset() {
    const st = dungeonState()
    st.bl = makeBlocks()
  }
  // 版式：10 行 × 30px = 300，从 y=150 起 → 到 450；
  // 下面还有三行说明（状态 / 操作 / 出处），所以格子总高度必须 ≤ H-260。
  function blockCellRect(r, c) {
    const b = dungeonState().bl
    const cols = b ? b.cols : 6, rows = b ? b.rows : 10
    const s = Math.min(30, Math.floor((H - 260) / rows))
    const x0 = (W - cols * s) / 2, y0 = 150
    return { x: x0 + c * s, y: y0 + r * s, w: s, h: s }
  }
  const BLOCK_COLORS = ['#ff6b8a', '#ffd23f', '#5ec8ff', '#8ef0a0', '#c79bff']

  // ---- 「多比快跑」：连续按方向键控制人物奔跑和加速，按空格跳跃。注意躲开石头和水塘，别忘了捡宝石哦~ ----
  // 官方给了**操作**（连按方向键加速、空格跳）与**内容**（石头 / 水塘 / 宝石）。
  // 官方**没给**赛道长度、速度、障碍密度、过关条件 → derived（V54）。
  function makeRunner() {
    const R = D.RUNNER || { need: 12 }
    const NEED = needOf(R.need || 12)
    const items = []
    let at = 30
    for (let i = 0; i < 46; i++) {
      const m = i % 3
      const kind = m === 2 ? 'gem' : (m === 0 ? 'rock' : 'pond')
      // 一部分宝石挂在天上（必须跳起来才吃得到），照原文"别忘了捡宝石"
      items.push({ kind, at, hi: kind === 'gem' && i % 6 === 5, got: false })
      at += 20 + (i % 4) * 3
    }
    return {
      items, dist: 0, speed: 0, boost: 0, y: 0, vy: 0, air: false,
      gems: 0, need: NEED, hits: 0, over: 0, t: 0, msg: null, msgT: 0, presses: 0,
    }
  }
  const RUN_BASE = 7.5        // 基础速度（derived）
  const RUN_BOOST = 1.35      // 每次按方向键加的速度（derived）
  const RUN_MAX = 22          // 速度上限（derived）
  const RUN_JUMP = 6.2        // 起跳初速（derived）
  const RUN_GRAV = 17         // 重力（derived）
  function runnerPress() {
    const st = dungeonState()
    const r = st.rn
    if (!r || r.over) return false
    r.presses++
    r.boost = Math.min(RUN_MAX - RUN_BASE, r.boost + RUN_BOOST)
    return true
  }
  function runnerJump() {
    const st = dungeonState()
    const r = st.rn
    if (!r || r.over || r.air) return false
    r.air = true; r.vy = RUN_JUMP
    audio.sfx('assets/sfx/onClick_03.mp3')
    return true
  }
  function runnerTick(dt) {
    const st = dungeonState()
    const r = st.rn
    if (!r || r.over || st.phase !== 'runner') return
    r.t += dt
    r.boost = Math.max(0, r.boost - dt * 6.5)         // 不按就慢下来（原文："连续按…加速"）
    r.speed = RUN_BASE + r.boost
    r.dist += r.speed * dt
    if (r.air) {
      r.vy -= RUN_GRAV * dt
      r.y += r.vy * dt
      if (r.y <= 0) { r.y = 0; r.vy = 0; r.air = false }
    }
    if (r.msgT > 0) r.msgT -= dt
    for (const it of r.items) {
      if (it.got || Math.abs(it.at - r.dist) > 0.9) continue
      const airborne = r.y > 1.0
      if (it.kind === 'gem') {
        // 地上的宝石跑过去就能捡；挂在天上的必须跳起来（原文："别忘了捡宝石哦~"）
        if (!it.hi || airborne) { it.got = true; r.gems++; r.msg = '捡到宝石！'; r.msgT = 0.7 }
        continue
      }
      // 石头 / 水塘：跳过去就算躲开了
      it.got = true
      if (!airborne) {
        // 原文没说撞上会怎样 → derived：撞了就掉速，不判负（免得儿童页游卡死）
        r.hits++; r.boost = 0
        r.msg = it.kind === 'rock' ? '撞到石头了，掉速！' : '掉进水塘了，掉速！'
        r.msgT = 0.9
      }
    }
    if (r.gems >= r.need) {
      r.over = 1
      notice(`捡满 ${r.need} 颗宝石，跑完全程！`)
      miniStagePass()
    } else if (r.items.every((x) => x.got) && r.dist > r.items[r.items.length - 1].at + 12) {
      // 赛道跑完但宝石不够 → 重跑一次（不判负）
      notice(`只捡到 ${r.gems}/${r.need} 颗，再跑一次`)
      st.rn = makeRunner()
    }
  }
  function runnerReset() {
    const st = dungeonState()
    st.rn = makeRunner()
  }

  // ---- 「拯救多比古书」（官方截图规则：方向键控制人物移动、跳跃）----
  // 官方只给了这一句：**关卡布局、要救几本书、火精灵怎么动** 全是 derived（V57）。
  // 目标取自游戏名（拯救古书）+ 官方 NPC「图书管理员」的台词（火精灵把书当食物）。
  function makePlatformer() {
    const P = D.PLATFORMER || { need: 5 }
    const NEED = needOf(P.need || 5)
    // 关卡布局（derived）：**每一跳都必须够得着**。
    // 【第 41 轮重做】原来的布局地面到 2 号平台要爬 140px、3 号到 4 号要爬 98px，
    // 而跳跃最高只有 90px（jump 520 / gravity 1500）—— **两本书在物理上就够不到**，
    // 机器人 0/4 通关就是这么来的（自动试玩体检抓出来的）。
    // 现在：跳跃 560 / 重力 1400 → 最高 112px；相邻平台竖直差 ≤70、水平缺口 ≤80。
    // 并且测试与体检脚本会**按物理参数算一遍可达性**，再把"够不到"的关卡拦下来。
    const G = 446                 // 地面
    const plats = [
      { x: 0, y: G, w: W, h: 18 },
      { x: 150, y: 376, w: 150, h: 14 },
      { x: 360, y: 306, w: 150, h: 14 },
      { x: 570, y: 306, w: 150, h: 14 },
      { x: 780, y: 236, w: 150, h: 14 },
    ]
    // 书放在**每块平台上方**（站在平台上时人物中心正好够得着）—— 保证"够得到"是算出来的，不是随手摆的
    const books = plats.slice(1).map((g) => ({ x: g.x + g.w / 2, y: g.y - PL_H + 14, got: false }))
    books.push({ x: 180, y: G - PL_H + 14, got: false })   // 地面上一本
    const spirits = [
      { x: 300, y: G - 32, base: 300, range: 200, speed: 90, dir: 1, r: 15 },
      { x: 645, y: 306 - 32, base: 645, range: 100, speed: 70, dir: 1, r: 15 },
    ]
    return {
      x: 60, y: 380, vy: 0, onGround: false, face: 1,
      plats, books, spirits, need: NEED, got: 0,
      hits: 0, t: 0, over: 0, msg: null, msgT: 0, invuln: 0,
    }
  }
  const PL_W = 22, PL_H = 28
  function plRect(p) { return { x: p.x, y: p.y, w: PL_W, h: PL_H } }
  function plGroundAt(p, x, y) {
    // 返回站在 (x,y) 时脚下的平台顶面 y；没有则 null
    for (const g of p.plats) {
      if (x + PL_W <= g.x || x >= g.x + g.w) continue
      const top = g.y - PL_H
      if (y >= top - 6 && y <= g.y + 4) return top
    }
    return null
  }
  function platformerTick(dt) {
    const st = dungeonState()
    const p = st.pf
    if (!p || p.over || st.phase !== 'platformer') return
    p.t += dt
    if (p.msgT > 0) p.msgT -= dt
    if (p.invuln > 0) p.invuln -= dt
    // 水平：方向键（官方原话「方向键控制人物移动」）
    let dx = 0
    if (input.down('ArrowLeft') || input.down('a')) dx -= 1
    if (input.down('ArrowRight') || input.down('d')) dx += 1
    if (dx) p.face = dx
    p.x = util.clamp(p.x + dx * (D.PLATFORMER ? D.PLATFORMER.speed : 220) * dt, 0, W - PL_W)
    // 垂直：重力 + 落地
    const G = (D.PLATFORMER ? D.PLATFORMER.gravity : 1500)
    p.vy += G * dt
    let ny = p.y + p.vy * dt
    if (p.vy >= 0) {
      const top = plGroundAt(p, p.x, ny)
      if (top !== null) { ny = top; p.vy = 0; p.onGround = true }
      else p.onGround = false
    } else {
      p.onGround = false
      // 顶到平台底面就不穿了（简单处理：只夹在上边界）
      if (ny < 120) { ny = 120; p.vy = 0 }
    }
    p.y = ny
    // 书：碰到就救到
    for (const b of p.books) {
      if (b.got) continue
      if (Math.abs((p.x + PL_W / 2) - b.x) < 26 && Math.abs((p.y + PL_H / 2) - b.y) < 28) {
        b.got = true; p.got++
        p.msg = `救起一本古书（${p.got}/${p.need}）`; p.msgT = 0.9
      }
    }
    // 火精灵：来回巡逻，碰到就把你弹开（**不判负** —— 官方只说了"移动、跳跃"，
    // 没说被撞会怎样；判负容易把儿童页游卡死，与多比快跑同一处理）
    for (const s of p.spirits) {
      s.x += s.dir * s.speed * dt
      if (s.x > s.base + s.range) { s.x = s.base + s.range; s.dir = -1 }
      if (s.x < s.base - s.range) { s.x = s.base - s.range; s.dir = 1 }
      if (p.invuln > 0) continue
      const hit = p.x + PL_W > s.x - s.r && p.x < s.x + s.r && p.y + PL_H > s.y - s.r && p.y < s.y + s.r
      if (hit) {
        p.hits++; p.invuln = 1.0
        p.vy = -300
        p.x = util.clamp(p.x + (p.x < s.x ? -60 : 60), 0, W - PL_W)
        p.msg = '被火精灵撞到了！'; p.msgT = 0.9
      }
    }
    if (p.got >= p.need) {
      p.over = 1
      notice(`救起 ${p.got} 本古书！`)
      miniStagePass()
    }
  }
  function platformerJump() {
    const st = dungeonState()
    const p = st.pf
    if (!p || p.over) return false
    if (!p.onGround) return false
    p.vy = -(D.PLATFORMER ? D.PLATFORMER.jump : 520)
    p.onGround = false
    audio.sfx('assets/sfx/onClick_03.mp3')
    return true
  }
  function platformerReset() {
    const st = dungeonState()
    st.pf = makePlatformer()
  }

  // ---- 空战素材：敌机用**官方怪物立绘**（第 43 轮，按用户"找点素材美术作品"的要求）----
  // 「王牌大空战」和太空堡垒的「驾驶超级战机」两关共用这两个函数。
  // 以前敌机自己画三角块/橙圆、自机也是三角块。归档里有 36 只官方怪物的立绘，
  // 名字里带"蝠/翼/龙/凤"的正适合当空中敌人 —— 用真素材，而且太空堡垒那关
  // **标签显示怪物真名**，比笼统写一个"敌机"更贴近原版素材。
  function flyerRoster() {
    const mons = D.MONSTERS || []
    const fly = mons.filter((m) => /蝠|鸟|翼|蜂|蝶|龙|凤|鸾|羽|鹰/.test(m.name || ''))
    const rest = mons.filter((m) => fly.indexOf(m) < 0)
    return fly.concat(rest)
  }
  function pickFlyer(roster, limit) {
    if (!roster || !roster.length) return null
    const n = Math.min(roster.length, limit || 6)
    return roster[Math.floor(Math.random() * n)]
  }

  // ---- 「王牌大空战」（官方截图规则：方向键上下左右移动、Z 普通射击、按住 Z 蓄力松开）----
  // 官方给了操作；**蓄力门槛（原文写「按住Z秒」——数字在截图上就缺）、打几架、敌人怎么来** 是 derived（V57）。
  // 战场上沿：这一关的标题/出处/官方规则三行文字画到 y≈142，
  // 敌机立绘最高 78px、自机 64px —— 战场从 190 起，否则立绘会盖住那行规则
  // （第 43 轮加怪物立绘时踩过：敌机从 y=90 生成，直接把"控制人物上下左右移动"糊掉了）。
  const CS_ARENA_TOP = 190
  function makeChargeShooter() {
    const C = D.CHARGE_SHOOTER || { need: 8, holdSec: 1.2, maxMiss: 5 }
    const NEED = needOf(C.need || 8)
    return {
      x: W / 2, y: H - 150, vy: 0,
      charging: false, wasHeld: false, charge: 0,
      shots: [], foes: [], holdSec: C.holdSec,
      killed: 0, miss: 0, t: 0, spawnT: 0.6, over: 0, msg: null, msgT: 0, held: 0,
      roster: flyerRoster(),
      // 简单模式：要打的架数更少、容错更多、命中半径更大
      need: NEED, maxMiss: C.maxMiss + (diff().needMul < 1 ? 3 : 0), aim: winOf(1),
    }
  }
  function chargeShooterTick(dt) {
    const st = dungeonState()
    const g = st.cs
    if (!g || g.over || st.phase !== 'chargeshooter') return
    g.t += dt
    if (g.msgT > 0) g.msgT -= dt
    // 移动：**四个方向**（官方原话「控制人物上下左右移动」）
    const sp = 270
    if (input.down('ArrowLeft') || input.down('a')) g.x -= sp * dt
    if (input.down('ArrowRight') || input.down('d')) g.x += sp * dt
    if (input.down('ArrowUp') || input.down('w')) g.y -= sp * dt
    if (input.down('ArrowDown') || input.down('s')) g.y += sp * dt
    g.x = util.clamp(g.x, 24, W - 24)
    g.y = util.clamp(g.y, CS_ARENA_TOP, H - 110)
    // Z：按住蓄力，松开射击（普通 / 蓄力两种）
    const held = !!(input.down('z') || input.down('Z'))
    if (held && !g.wasHeld) { g.charging = true; g.charge = 0; g.held = 0 }
    if (held) { g.charge += dt; g.held += dt }
    if (!held && g.wasHeld && g.charging) {
      const powered = g.charge >= g.holdSec
      g.shots.push({ x: g.x, y: g.y - 18, r: powered ? 16 : 6, powered, vy: powered ? -520 : -720, pierce: powered ? 3 : 1 })
      g.charging = false; g.charge = 0; g.held = 0
      audio.sfx('assets/sfx/onClick_03.mp3')
    }
    g.wasHeld = held
    // 子弹
    for (const s of g.shots) s.y += s.vy * dt
    g.shots = g.shots.filter((s) => s.y > 60 && s.pierce > 0)
      // 敌机：**一次最多 3 架在场**，间隔拉长到 1.4~2.2 秒。
    // 【第 40 轮修】原先 0.75~1.35 秒就出一架、且不限在场数量 ——
    // 玩家按一次 Z 只打一发，屏幕上一堆敌机根本清不完，漏满 5 架就重来，
    // 用户反馈的"出怪量不正常、不能正常游玩"就是这个。
    g.spawnT -= dt
    if (g.spawnT <= 0 && g.foes.length < 3) {
      g.spawnT = 1.4 + Math.random() * 0.8
      const big = Math.random() < 0.25
      // 大敌机更慢、更好打（给蓄力弹一个用武之地）
      g.foes.push({
        x: 70 + Math.random() * (W - 140), y: CS_ARENA_TOP + Math.random() * 26, big,
        hp: big ? 3 : 1, vy: big ? 34 : 52 + Math.random() * 28, r: big ? 24 : 16,
        mon: pickFlyer(g.roster, 4),           // 官方怪物立绘（第 43 轮）
        bob: Math.random() * 6.28,
      })
    }
    for (const f of g.foes) f.y += f.vy * dt
    // 命中判定
    for (const s of g.shots) {
      if (s.pierce <= 0) continue
      for (const f of g.foes) {
        if (f.hp <= 0) continue
        if (Math.hypot(f.x - s.x, f.y - s.y) < (f.r + s.r) * (g.aim || 1)) {
          f.hp -= s.powered ? 3 : 1
          s.pierce--
          if (f.hp <= 0) { g.killed++; g.msg = `击落一架！（${g.killed}/${g.need}）`; g.msgT = 0.7 }
          if (!s.powered) break
        }
      }
    }
    g.foes = g.foes.filter((f) => f.hp > 0)
    // 飞出画面的算漏掉。
    // 判定线不能压到计分行（"击落 x/y 漏掉 m/n"画在 y=512）：
    // 立绘以 f.y 为中心、高 56 → f.y 到 456 时底边已经 484，再往下就糊住计分了。
    const out = g.foes.filter((f) => f.y > H - 104)
    if (out.length) {
      g.miss += out.length
      g.foes = g.foes.filter((f) => f.y <= H - 104)
      if (g.miss >= g.maxMiss) { notice(`漏掉 ${g.miss} 架…再来一次`); st.cs = makeChargeShooter(); return }
    }
    if (g.killed >= g.need) {
      g.over = 1
      notice(`击落 ${g.killed} 架，通关！`)
      miniStagePass()
    }
  }
  function chargeShooterReset() {
    const st = dungeonState()
    st.cs = makeChargeShooter()
  }

  // ---- 「滑雪跳台」（官方截图规则：←→ 控平衡；黄色位置按 ↑ 起跳、红色跳最远；图标进圈按对应方向键）----
  // 三个阶段**都是官方原话里点名的**；每个阶段的**时长/速度/距离/判定窗口**是 derived（V58）。
  // 另外：任务表里出现过「玩滑雪跳台评价达到C级」，但**评级标准官方没给** →
  // 所以这里只做"完成/没完成"，**不做评级**（不编 C/B/A 的分数线）。
  function makeSki() {
    return {
      phase: 'balance', t: 0,
      balance: 0.5, drift: 0, stumbles: 0,
      pointer: 0, pdir: 1,
      ring: 1, want: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'][Math.floor(Math.random() * 4)],
      jump: 0, quality: null, trick: 0, total: 0, over: 0, msg: null, msgT: 0,
    }
  }
  const SKI = { balanceSec: 3.0, pointerSpeed: 0.85, ringSpeed: 0.8, base: 20, pass: 70 }
  // 简单模式：过关线降低、起跳判定窗口放宽
  function skiPass() { return Math.round(SKI.pass * diff().needMul + (diff().needMul < 1 ? 12 : 0)) }
  function skiTick(dt) {
    const st = dungeonState()
    const s = st.ski
    if (!s || s.over || st.phase !== 'ski') return
    s.t += dt
    if (s.msgT > 0) s.msgT -= dt
    if (s.phase === 'balance') {
      // 台风吹：平衡自己会漂，得用 ←→ 找回来（原文「看 ←→ 箭头位置用 ←→ 控制平衡」）
      s.drift += (Math.random() - 0.5) * 0.9 * dt
      s.drift = util.clamp(s.drift, -0.6, 0.6)
      s.balance += s.drift * dt
      if (input.down('ArrowLeft')) s.balance -= 0.55 * dt
      if (input.down('ArrowRight')) s.balance += 0.55 * dt
      if (Math.abs(s.balance - 0.5) > 0.45) {
        s.stumbles++
        s.balance = 0.5; s.drift = 0
        s.msg = '没稳住平衡！重新来'; s.msgT = 1.0
      }
      s.balance = util.clamp(s.balance, 0, 1)
      if (s.t >= SKI.balanceSec) { s.phase = 'takeoff'; s.t = 0; s.pointer = 0; s.pdir = 1 }
    } else if (s.phase === 'takeoff') {
      // 指针来回走，落在黄色/红色区域按 ↑ 起跳（原文「黄色位置按 ↑ 起跳，红色跳的最远」）
      s.pointer += s.pdir * SKI.pointerSpeed * dt
      if (s.pointer > 1) { s.pointer = 1; s.pdir = -1 }
      if (s.pointer < 0) { s.pointer = 0; s.pdir = 1 }
      if (input.once('ArrowUp') || input.once('w') || input.once(' ')) {
        const loose = diff().windowMul > 1
        const inRed = s.pointer >= (loose ? 0.70 : 0.74) && s.pointer <= (loose ? 0.92 : 0.88)
        const inYellow = s.pointer >= (loose ? 0.48 : 0.54) && s.pointer < (loose ? 0.70 : 0.74)
        s.quality = inRed ? 'red' : inYellow ? 'yellow' : 'none'
        s.jump = inRed ? 60 : inYellow ? 40 : 20
        s.msg = inRed ? '红色区！跳得最远' : inYellow ? '黄色区，起跳' : '位置不对，跳得很近'
        s.msgT = 1.2
        s.phase = 'trick'; s.t = 0; s.ring = 1
      }
    } else if (s.phase === 'trick') {
      // 图标进圈时按对应的方向键（原文「当图标进入 ○ 的时候按相应的方向键做出动作」）
      s.ring -= SKI.ringSpeed * dt
      const keys = { ArrowLeft: ['ArrowLeft', 'a'], ArrowRight: ['ArrowRight', 'd'], ArrowUp: ['ArrowUp', 'w'], ArrowDown: ['ArrowDown', 's'] }
      const opts = keys[s.want] || [s.want]
      if (opts.some((k) => input.once(k))) {
        if (s.ring <= winOf(0.32)) {
          s.trick = s.ring <= 0.12 ? 30 : 20
          s.msg = s.ring <= 0.12 ? '完美动作！' : '动作完成'
        } else { s.trick = 0; s.msg = '按早了' }
        s.msgT = 1.2
        s.phase = 'done'; s.t = 0
      } else if (s.ring <= 0) {
        s.trick = 0; s.msg = '错过时机'; s.msgT = 1.2
        s.phase = 'done'; s.t = 0
      }
    } else if (s.phase === 'done') {
      s.total = SKI.base + s.jump + s.trick + Math.max(0, 10 - s.stumbles * 2)
      s.over = 1
      if (s.total >= skiPass()) {
        notice(`滑出 ${s.total} 米！`)
        miniStagePass()
      } else {
        notice(`只滑了 ${s.total} 米，再来一次（按空格）`)
      }
    }
  }
  function skiReset() {
    const st = dungeonState()
    st.ski = makeSki()
  }

  // ---- 「魔幻音符」（官方截图规则：左右键控制手指移动、下键确认选择弹奏）----
  // 过程图上有「10连击 / 20连击 / 40连击」，说明原版有**连击**；
  // 但**连击怎么算、评级怎么给，官方没给** → 这里只数"连续命中"，评分规则标 derived（V58）。
  function makeNotes() {
    const f = diff()
    const lanes = 5, need = needOf(8), total = 12
    const list = []
    let t = 1.2
    for (let i = 0; i < total; i++) {
      list.push({ lane: Math.floor(Math.random() * lanes), at: t, hit: false, missed: false })
      t += 0.85 + Math.random() * 0.35
    }
    return {
      lanes, list, need, total, t: 0, finger: 2, hits: 0, miss: 0,
      combo: 0, bestCombo: 0, over: 0, msg: null, msgT: 0, lastLane: -1,
    }
  }
  const NOTE = { hitY: 420, span: 2.2 }
  function notesTick(dt) {
    const st = dungeonState()
    const n = st.nt
    if (!n || n.over || st.phase !== 'notes') return
    n.t += dt
    if (n.msgT > 0) n.msgT -= dt
    // 手指：左右键移动（原文「左右键控制手指移动」）
    if (input.once('ArrowLeft') || input.once('a')) { n.finger = util.clamp(n.finger - 1, 0, n.lanes - 1); audio.sfx('assets/sfx/onMouseOver_03.mp3') }
    if (input.once('ArrowRight') || input.once('d')) { n.finger = util.clamp(n.finger + 1, 0, n.lanes - 1); audio.sfx('assets/sfx/onMouseOver_03.mp3') }
    // 下键确认弹奏（原文「下键确认选择弹奏」）；判定窗口 = 音符离判定线的距离
    if (input.once('ArrowDown') || input.once('s')) {
      let best = null, bestD = 1e9
      for (const x of n.list) {
        if (x.hit || x.missed || x.lane !== n.finger) continue
        const d = Math.abs(x.at - n.t)
        if (d < bestD) { bestD = d; best = x }
      }
      if (best && bestD <= winOf(0.22)) {
        best.hit = true; n.hits++; n.combo++
        n.bestCombo = Math.max(n.bestCombo, n.combo)
        n.msg = `命中！${n.combo > 1 ? n.combo + ' 连击' : ''}`; n.msgT = 0.6
        audio.sfx('assets/sfx/onClick_03.mp3')
      } else {
        n.miss++; n.combo = 0
        n.msg = '弹错了…'; n.msgT = 0.6
      }
    }
    // 音符滑过判定线还没弹 → 算漏掉（连击断）
    for (const x of n.list) {
      if (!x.hit && !x.missed && n.t > x.at + winOf(0.22)) { x.missed = true; n.miss++; n.combo = 0 }
    }
    if (n.hits >= n.need) {
      n.over = 1
      notice(`弹对 ${n.hits} 个音符（最高 ${n.bestCombo} 连击）`)
      miniStagePass()
    } else if (n.t > n.list[n.list.length - 1].at + 0.6) {
      notice(`只弹对 ${n.hits}/${n.need} 个，再来一次`)
      st.nt = makeNotes()
    }
  }
  function notesReset() {
    const st = dungeonState()
    st.nt = makeNotes()
  }

  // ---- 「飞翔的衣服」（官方攻略 7k7k/534823，2012-10-18 独家原创）----
  // 官方原文给了完整玩法：「各种衣服裤子满天飞，我们要做的就是**用网子抓住它们**」
  //   「不能把网下在衣服正好在的地方，而要**判断一下衣服运动的方向，提前下网**」
  //   「越到后面的关卡衣服的数量会越来越多，运动速度也会越来越快」
  //   「**注意时间**，不然时间到了还没把所有的衣服抓住，这一关也算挑战失败哦」
  // 同页还给出两个事实：**有评级**（"最后也得到A了呢"）与**有分关**（"只打到了第六关"）。
  // 数值（每关几件/多快/限时多久/打满几关）原文没给 → derived（V62）。
  //
  // 机制上的关键一条：**网子有落点延迟**。官方那句"要提前下网"只有在
  // "下网 → 合拢"之间有时间差时才成立 —— 所以这不是装饰参数，是照原文立的机制：
  // 点下去只是"落网"，0.28 秒后网才合拢，合拢那一刻衣服在哪才算抓到。
  const FC = () => (D.FLYCATCH || {})
  function fcArena() {
    // 战场避开标题/说明与页脚（和空战关同一套边界思路）
    return { x0: 26, y0: 186, x1: W - 26, y1: H - 118 }
  }
  function fcLevelSpec(level) {
    const C = FC()
    const a = fcArena()
    // 简单档只减"关数"（passLevels 走 needOf）与放宽限时（winOf），
    // **不再同时减每关件数** —— 那是双减，会让简单档短到没意思。
    const count = Math.max(2, (C.baseCount || 3) + ((C.addPerLevel || 1) * (level - 1)))
    const speed = (C.baseSpeed || 62) + (C.speedPerLevel || 20) * (level - 1)
    const sec = (C.levelSec || 20) * winOf(1)
    const clothes = []
    for (let i = 0; i < count; i++) {
      // 四面八方飞（官方"满天飞"）：角度均匀铺开 + 一点抖动，避免同向叠在一起
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.7
      clothes.push({
        x: a.x0 + 60 + Math.random() * (a.x1 - a.x0 - 120),
        y: a.y0 + 50 + Math.random() * (a.y1 - a.y0 - 100),
        vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed * 0.72,
        r: 22, got: false, spin: Math.random() * 6.28, kind: i % 3,
      })
    }
    return { clothes, speed, sec, count }
  }
  function makeFlyCatch() {
    const C = FC()
    const L = fcLevelSpec(1)
    return {
      level: 1, clothes: L.clothes, count: L.count,
      nets: [], caught: 0, total: L.count,
      timeLeft: L.sec, t: 0, over: 0, msg: null, msgT: 0,
      cleared: 0, fails: 0,
      // 打满几关算通关：简单档少一关（难度层）
      passLevels: Math.max(2, needOf(C.passLevels || 3)),
      radMul: winOf(1),
    }
  }
  // 下网：点下去只记一个"正在落下的网"，合拢时才算抓到（这就是"提前下网"）
  function flyCatchCast(x, y) {
    const st = dungeonState()
    const g = st.fc
    if (!g || g.over) return false
    // 同时只能有一张网在飞（原文没写；不限制的话狂点鼠标就能通关，"提前下网"也失去意义）
    const flying = g.nets.filter((n) => !n.closed).length
    if (flying >= (FC().maxNets || 1)) return false
    g.nets.push({ x, y, t: 0, closed: false, got: 0 })
    audio.sfx('assets/sfx/onClick_03.mp3')
    return true
  }
  function flyCatchTick(dt) {
    const st = dungeonState()
    const g = st.fc
    if (!g || g.over || st.phase !== 'flycatch') return
    const C = FC()
    const a = fcArena()
    g.t += dt
    if (g.msgT > 0) g.msgT -= dt
    // 衣服飞（撞墙反弹）
    for (const c of g.clothes) {
      if (c.got) continue
      c.x += c.vx * dt; c.y += c.vy * dt
      c.spin += dt * 1.8
      if (c.x < a.x0 + c.r) { c.x = a.x0 + c.r; c.vx = Math.abs(c.vx) }
      if (c.x > a.x1 - c.r) { c.x = a.x1 - c.r; c.vx = -Math.abs(c.vx) }
      if (c.y < a.y0 + c.r) { c.y = a.y0 + c.r; c.vy = Math.abs(c.vy) }
      if (c.y > a.y1 - c.r) { c.y = a.y1 - c.r; c.vy = -Math.abs(c.vy) }
    }
    // 网子合拢 → 判定（网口内的衣服才算抓到）
    const R = (C.netR || 52) * (g.radMul || 1)
    for (const n of g.nets) {
      n.t += dt
      if (n.closed || n.t < (C.netDelay || 0.28)) continue
      n.closed = true
      for (const c of g.clothes) {
        if (c.got) continue
        // 网口半径就是判定半径（网圈画在 R 上，衣服半宽 22，视觉上正好装得下）
        if (Math.hypot(c.x - n.x, c.y - n.y) <= R) { c.got = true; n.got++; g.caught++ }
      }
      if (n.got === 0) { g.msg = '这张网空了 —— 要按衣服飞的方向提前下网'; g.msgT = 0.9 }
    }
    g.nets = g.nets.filter((n) => !n.closed || n.t < (C.netDelay || 0.28) + 0.25)
    // 全部抓到 → 本关过
    if (g.clothes.every((c) => c.got)) {
      g.cleared++
      if (g.cleared >= g.passLevels) {
        g.over = 1
        notice(`抓完第 ${g.level} 关的衣服！（共过 ${g.cleared} 关）`)
        miniStagePass()
        return
      }
      g.level++
      const L = fcLevelSpec(g.level)
      g.clothes = L.clothes; g.count = L.count; g.total = L.count
      g.timeLeft = L.sec; g.caught = 0; g.nets = []
      g.msg = `第 ${g.level} 关：${g.count} 件，更快了`; g.msgT = 1.2
      return
    }
    // 限时到还没抓完 → 本关失败（官方："这一关也算挑战失败"）→ 重打这一关
    g.timeLeft -= dt
    if (g.timeLeft <= 0) {
      const L = fcLevelSpec(g.level)
      g.clothes = L.clothes; g.count = L.count; g.total = L.count
      g.timeLeft = L.sec; g.caught = 0; g.nets = []; g.fails++
      notice(`时间到，还剩衣服没抓到 —— 第 ${g.level} 关重来（已过 ${g.cleared} 关）`)
    }
  }
  function flyCatchReset() {
    const st = dungeonState()
    st.fc = makeFlyCatch()
  }

  // ══════════════════ 大陆棋（第 51 轮，按官方原文重做） ══════════════════
  // 官方逐字见 game/tables/sumo.js 文件头。要点：**这不是回合制战斗，是弹弓物理对战**。
  //   ① 按住己方多比拉出箭头（方向 + 大小），松手发射；
  //   ② 多比滑行，撞到敌人造成伤害并击退（重量越大越难被推开、冷却越小越先出手）；
  //   ③ **掉出地图＝掉进河里＝淘汰**（也能把敌人撞下去，官方叫"以小博大"）；
  //   ④ 四类多比各有打法：近身只靠撞、中距离发 1-3 道光波、远距离落点范围伤、治疗弹射回血。
  function sumoMap() { return D.SUMO.maps.find((m) => m.id === (dungeonState().su && dungeonState().su.mapId)) || D.SUMO.maps[0] }
  // 棋盘坐标系 → 画布坐标（整张棋盘缩放进一屏，所以不需要小地图）
  function sumoView() {
    const m = sumoMap()
    const top = 196, bottom = H - 96
    const k = Math.min((W - 80) / m.w, (bottom - top) / m.h)
    const ox = (W - m.w * k) / 2, oy = top + ((bottom - top) - m.h * k) / 2
    return { k, ox, oy, m }
  }
  const sumoX = (x) => sumoView().ox + x * sumoView().k
  const sumoY = (y) => sumoView().oy + y * sumoView().k
  const sumoBX = (sx) => (sx - sumoView().ox) / sumoView().k
  const sumoBY = (sy) => (sy - sumoView().oy) / sumoView().k

  // 掉进河里？官方两种地图：长方形＝四周是河；I 形＝中间一条河道，只有桥那一段能站。
  // ⚠️ **两种地图都要判"走出边界"**：I 形地图的左右两端也是河（不然从侧面走出去就凭空站着）。
  //    第一版只对长方形判了边界，测试当场抓到 `sumoInRiver(-5,100)` 返回 false。
  function sumoInRiver(x, y) {
    const m = sumoMap()
    if (x < 0 || y < 0 || x > m.w || y > m.h) return true
    if (m.river === 'border') return false      // 长方形：河就是"地图外"，已经判过了
    // I 形：中间河道，桥以外都是河
    const b = m.bridge
    const inBand = y > b.y && y < b.y + b.h
    if (!inBand) return false
    const onBridge = x > b.x && x < b.x + b.w
    return !onBridge
  }

  function makeSumo(forceMapId) {
    // 官方：地图**随机且不可更换**。`forceMapId` 只给测试/调试用（要能分别验两种地图）——
    // 正常进入副本时不传，走随机。
    const m = D.SUMO.maps.find((x) => x.id === forceMapId)
      || D.SUMO.maps[Math.floor(Math.random() * D.SUMO.maps.length)]
    const lv = save.data.level || 1
    // 玩家一侧：从**自己拥有的形态**里按可解释规则分四类（见 D.sumoRoster 注释）
    const owned = (save.data.forms && save.data.forms.length ? save.data.forms : [save.data.form])
      .map((n) => D.FORMS.find((f) => f.name === n)).filter(Boolean)
    const mine = D.sumoRoster(owned.length ? owned : D.FORMS.slice(0, 4), lv)
    // 对手：从全部形态里挑四只（离线版没有真人匹配，用同等级 AI 代替 —— derived）
    const shuffled = D.FORMS.slice().sort(() => Math.random() - 0.5)
    const foe = D.sumoRoster(shuffled.slice(0, 12), lv)
    const mk = (r, side, i) => Object.assign({}, r, {
      side, uid: side + i, hp: r.life, maxHp: r.life,
      x: 0, y: 0, vx: 0, vy: 0, alive: true, actAt: 0, hitFlash: 0,
    })
    const units = []
    mine.forEach((r, i) => {
      const u = mk(r, 'mine', i)
      // 站位：左半边竖排（长方形）/ 左岸（I 形）
      u.x = 120 + (i % 2) * 70
      u.y = m.river === 'middle' ? (i < 2 ? 74 + i * 62 : 268 + (i - 2) * 62) : 70 + i * 94
      units.push(u)
    })
    foe.forEach((r, i) => {
      const u = mk(r, 'foe', i)
      u.x = m.w - 120 - (i % 2) * 70
      u.y = m.river === 'middle' ? (i < 2 ? 74 + i * 62 : 268 + (i - 2) * 62) : 70 + i * 94
      units.push(u)
    })
    // 障碍（官方：石头、树木、墓碑可以抵挡攻击，也能被打碎）
    const obstacles = []
    for (let i = 0; i < m.obstacleCount; i++) {
      const kind = m.obstacles[i % m.obstacles.length]
      let x = 0, y = 0, tries = 0
      do {
        x = 220 + Math.random() * (m.w - 440)
        y = 40 + Math.random() * (m.h - 80)
        tries++
      } while (tries < 40 && (sumoInRiver(x, y) || units.some((u) => Math.hypot(u.x - x, u.y - y) < 90)
        || obstacles.some((o) => Math.hypot(o.x - x, o.y - y) < 86)))
      obstacles.push({ x, y, r: 17, kind, hp: D.SUMO.phys.obstacleHp, maxHp: D.SUMO.phys.obstacleHp, broken: false })
    }
    return {
      mapId: m.id, mapName: m.name, units, obstacles, waves: [], fx: [],
      turn: 0, aiming: null, over: 0, win: false, msg: m.rule, msgT: 3.2,
      t: 0, moves: 0,
    }
  }
  function sumoAlive(side) {
    const g = dungeonState().su
    return g ? g.units.filter((u) => u.alive && (!side || u.side === side)) : []
  }
  // 出手顺序：官方「开局谁先动根据速度决定」+「冷却越小的出手越快」。
  // 落地：每个单位有个 actAt（下次可行动的时间），初始按**冷却**排；
  // 每回合挑 actAt 最小且还活着的那个出手，出手后 actAt += 冷却。
  function sumoNextUnit() {
    const g = dungeonState().su
    if (!g) return null
    const ready = g.units.filter((u) => u.alive && u.actAt <= g.turn + 1e-9)
    const pool = ready.length ? ready : g.units.filter((u) => u.alive)
    if (!pool.length) return null
    pool.sort((a, b) => (a.actAt - b.actAt) || (a.cooldown - b.cooldown) || (a.side === 'mine' ? -1 : 1))
    return pool[0]
  }
  function sumoFinishTurn(u) {
    const g = dungeonState().su
    u.actAt = g.turn + u.cooldown
    g.turn = Math.max(g.turn, u.actAt)
    g.moves++
  }
  // 拉弓：官方「将鼠标指向出招的多比会出现一个箭头，移动鼠标调整箭头的方向和大小」
  function sumoStartAim(uid) {
    const g = dungeonState().su
    if (!g || g.over) return false
    const u = g.units.find((x) => x.uid === uid && x.alive)
    if (!u || u.side !== 'mine') return false
    if (u !== sumoNextUnit()) return false       // 还没轮到它
    g.aiming = { uid, dx: 1, dy: 0, power: 0.5 }
    return true
  }
  function sumoSetAim(dx, dy, power) {
    const g = dungeonState().su
    if (!g || !g.aiming) return false
    const L = Math.hypot(dx, dy) || 1
    g.aiming.dx = dx / L; g.aiming.dy = dy / L
    g.aiming.power = util.clamp(power, 0, 1)
    return true
  }
  // 键盘调角度 / 调力度（与鼠标同一条发射路径，机器人也走这里）
  function sumoRotateAim(d) {
    const g = dungeonState().su
    if (!g || !g.aiming) return false
    const a = Math.atan2(g.aiming.dy, g.aiming.dx) + d
    g.aiming.dx = Math.cos(a); g.aiming.dy = Math.sin(a)
    return true
  }
  function sumoPowerAim(d) {
    const g = dungeonState().su
    if (!g || !g.aiming) return false
    g.aiming.power = util.clamp(g.aiming.power + d, 0, 1)
    return true
  }
  // 发射：官方「瞄准敌人后松开鼠标就可以进行发射」
  function sumoFire() {
    const g = dungeonState().su
    if (!g || g.over || !g.aiming) return false
    const u = g.units.find((x) => x.uid === g.aiming.uid)
    if (!u || !u.alive) { g.aiming = null; return false }
    const P = D.SUMO.phys
    const v = P.minPower + (P.maxPower - P.minPower) * g.aiming.power
    u.vx = g.aiming.dx * v * u.move
    u.vy = g.aiming.dy * v * u.move
    u.launched = true
    // 中距离：官方「可以同时发射 1-3 个光波」→ 沿发射方向散射
    if (u.typeId === 'mid' && u.waves) {
      const n = u.waves[0] + Math.floor(Math.random() * (u.waves[1] - u.waves[0] + 1))
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 0.16
        const a = Math.atan2(g.aiming.dy, g.aiming.dx) + off
        g.waves.push({
          x: u.x, y: u.y, vx: Math.cos(a) * P.waveSpeed, vy: Math.sin(a) * P.waveSpeed,
          life: P.waveLife, side: u.side, kind: 'damage', owner: u.uid,
        })
      }
    }
    // 治疗：官方「治疗光波是在多比间弹射的，角度好可以一次治疗多只多比」→ 朝己方弹射一串
    if (u.typeId === 'heal') {
      const allies = g.units.filter((x) => x.alive && x.side === u.side)
        .sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))
      allies.forEach((a2, i) => {
        g.waves.push({
          x: u.x, y: u.y, vx: 0, vy: 0, life: 0.35 + i * 0.12, side: u.side,
          kind: 'heal', target: a2.uid, amount: u.heal, owner: u.uid, bounce: true,
        })
      })
    }
    g.aiming = null
    sumoFinishTurn(u)
    return true
  }
  function sumoTick(dt) {
    const st = dungeonState()
    const g = st.su
    if (!g || g.over || st.phase !== 'sumo') return
    const P = D.SUMO.phys
    const m = sumoMap()
    g.t += dt
    if (g.msgT > 0) g.msgT -= dt
    const anyMoving = g.units.some((u) => u.alive && (Math.abs(u.vx) > P.stopSpeed || Math.abs(u.vy) > P.stopSpeed))
    // 只有全场静止时才计时间推进（否则"出手顺序"会在飞行途中被推着走）
    if (!anyMoving) {
      const nx = sumoNextUnit()
      if (nx && nx.side === 'foe') sumoAiAct(nx)
    }
    for (const u of g.units) {
      if (!u.alive) continue
      if (u.hitFlash > 0) u.hitFlash -= dt
      u.x += u.vx * dt; u.y += u.vy * dt
      const damp = Math.max(0, 1 - P.friction * dt)
      u.vx *= damp; u.vy *= damp
      if (Math.hypot(u.vx, u.vy) < P.stopSpeed) { u.vx = 0; u.vy = 0 }
      // 障碍：挡路 + 受伤（官方：石头树木可以抵挡攻击，能被打碎）
      for (const o of g.obstacles) {
        if (o.broken) continue
        const d = Math.hypot(u.x - o.x, u.y - o.y)
        if (d < o.r + P.collideR) {
          const nx2 = (u.x - o.x) / (d || 1), ny2 = (u.y - o.y) / (d || 1)
          u.x = o.x + nx2 * (o.r + P.collideR); u.y = o.y + ny2 * (o.r + P.collideR)
          const sp = Math.hypot(u.vx, u.vy)
          if (sp > 60) { o.hp -= Math.round(sp * u.power * 0.004); if (o.hp <= 0) o.broken = true }
          // 反弹一小部分（官方："不要把自己弹进河里了"—— 障碍物确实会把多比弹开）
          u.vx = -u.vx * 0.35; u.vy = -u.vy * 0.35
        }
      }
      // 掉进河里＝淘汰（官方最重要的一条）
      if (sumoInRiver(u.x, u.y)) { u.alive = false; sumoFx(g, u.x, u.y, '#5ee0ff', '落水'); continue }
      // 多比互撞（官方：近身"只有撞到对方多比时才造成伤害"；远距离/中距离靠光波）
      for (const o of g.units) {
        if (o === u || !o.alive || o.side === u.side) continue
        const d = Math.hypot(u.x - o.x, u.y - o.y)
        if (d > P.collideR * 2) continue
        const rel = Math.hypot(u.vx - o.vx, u.vy - o.vy)
        if (rel < 40) continue
        // 伤害：相对速度 × 威力 ÷ (对方防御 + 40)
        const dmg = Math.max(1, Math.round(rel * u.power * P.dmgK / (o.defense + 40)))
        o.hp -= dmg; o.hitFlash = 0.25
        // 击退：重量越大越难被推开（官方原文）
        const push = rel * P.pushK * 34 / (o.weight + 20)
        const ax = (o.x - u.x) / (d || 1), ay = (o.y - u.y) / (d || 1)
        o.vx += ax * push; o.vy += ay * push
        u.vx -= ax * push * 0.4; u.vy -= ay * push * 0.4
        sumoFx(g, o.x, o.y, '#ff9e5c', `-${dmg}`)
        if (o.hp <= 0) { o.alive = false; o.hp = 0; sumoFx(g, o.x, o.y, '#ff5c5c', '倒下') }
      }
    }
    // 光波
    for (const w of g.waves) {
      w.life -= dt
      if (w.kind === 'heal') {
        if (w.life <= 0.32) {
          const tgt = g.units.find((x) => x.uid === w.target)
          if (tgt && tgt.alive && !w.done) {
            w.done = true
            tgt.hp = Math.min(tgt.maxHp, tgt.hp + w.amount)
            sumoFx(g, tgt.x, tgt.y, '#5ee06a', `+${w.amount}`)
          }
        }
        continue
      }
      w.x += w.vx * dt; w.y += w.vy * dt
      for (const o of g.units) {
        if (o.side === w.side || !o.alive) continue
        if (Math.hypot(o.x - w.x, o.y - w.y) > P.collideR + P.waveR) continue
        const owner = g.units.find((x) => x.uid === w.owner)
        const dmg = Math.max(1, Math.round(owner ? owner.power * 1.6 : 4))
        o.hp -= dmg; o.hitFlash = 0.2; w.life = 0
        sumoFx(g, o.x, o.y, '#7ee0ff', `-${dmg}`)
        if (o.hp <= 0) { o.alive = false; o.hp = 0 }
        break
      }
    }
    g.waves = g.waves.filter((w) => w.life > 0)
    // 远距离：官方「一次可以攻击一片区域内的所有敌人」+「算好发射距离」→ 落点范围伤
    for (const u of g.units) {
      if (!u.alive || !u.launched) continue
      if (u.vx !== 0 || u.vy !== 0) continue
      u.launched = false
      if (u.typeId === 'long' && u.areaR) {
        for (const o of g.units) {
          if (o.side === u.side || !o.alive) continue
          if (Math.hypot(o.x - u.x, o.y - u.y) > u.areaR) continue
          const dmg = Math.max(1, Math.round(u.power * 1.9))
          o.hp -= dmg; o.hitFlash = 0.25
          sumoFx(g, o.x, o.y, '#c86bd8', `-${dmg}`)
          if (o.hp <= 0) { o.alive = false; o.hp = 0 }
        }
        g.fx.push({ x: u.x, y: u.y, r: u.areaR, t: 0.4, color: '#c86bd8', ring: true })
      }
    }
    for (const f of g.fx) f.t -= dt
    g.fx = g.fx.filter((f) => f.t > 0)
    // 胜负：官方「消灭对方的所有多比」或把对方撞进河里
    if (!sumoAlive('foe').length) { g.over = 1; g.win = true; notice('对手的多比全部出局 —— 大陆棋获胜！'); miniStagePass() }
    else if (!sumoAlive('mine').length) {
      g.over = 1; g.win = false
      notice('你的多比全掉下去了…再来一局')
      st.su = makeSumo()
    }
  }
  function sumoFx(g, x, y, color, text) { g.fx.push({ x, y, color, text, t: 0.8 }) }

  // AI：官方说的是"等真人匹配"，离线版用同等级 AI（derived）。
  // 策略照官方实战原则：① 优先打站在河边的敌人 ② 没人可打就往中间挪。
  function sumoAiAct(u) {
    const g = dungeonState().su
    const m = sumoMap()
    const foes = g.units.filter((x) => x.alive && x.side === 'mine')
    if (!foes.length) { sumoFinishTurn(u); return }
    // 挑"离河边最近"的目标（官方实战原则 1：不要放过站在河边的敌人）
    const edgeDist = (p) => Math.min(p.x, p.y, m.w - p.x, m.h - p.y)
    foes.sort((a, b) => edgeDist(a) - edgeDist(b))
    const tgt = foes[0]
    const dx = tgt.x - u.x, dy = tgt.y - u.y
    const dist = Math.hypot(dx, dy) || 1
    u.vx = (dx / dist) * 520 * u.move
    u.vy = (dy / dist) * 520 * u.move
    // 中距离/治疗也照发（中距离朝目标、治疗朝队友）
    if (u.typeId === 'mid' && u.waves) {
      const a = Math.atan2(dy, dx)
      for (let i = 0; i < u.waves[1]; i++) {
        const off = (i - (u.waves[1] - 1) / 2) * 0.16
        g.waves.push({
          x: u.x, y: u.y, vx: Math.cos(a + off) * D.SUMO.phys.waveSpeed, vy: Math.sin(a + off) * D.SUMO.phys.waveSpeed,
          life: D.SUMO.phys.waveLife, side: u.side, kind: 'damage', owner: u.uid,
        })
      }
    }
    if (u.typeId === 'heal') {
      const hurt = g.units.filter((x) => x.alive && x.side === u.side).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0]
      if (hurt) g.waves.push({ x: u.x, y: u.y, vx: 0, vy: 0, life: 0.35, side: u.side, kind: 'heal', target: hurt.uid, amount: u.heal, owner: u.uid })
    }
    u.launched = true
    sumoFinishTurn(u)
  }
  function sumoReset(forceMapId) {
    const st = dungeonState()
    st.su = makeSumo(forceMapId)
    // 重开一局＝回到这一关本身。**必须把阶段也拨回来**：
    // 上一局若是打赢了，`miniStagePass()` 已经把 phase 推到 'flip'，
    // 而 `sumoTick` 开头就是 `st.phase !== 'sumo' → return` ——
    // 不拨回来的话"重开"出来的棋盘**一帧都不走**（测试里表现为"多比被障碍挡住"这条
    // 断言空过：什么都没动，当然还在障碍左边）。
    st.phase = 'sumo'
    return true
  }

  // ══════════════════ 第 47 轮新增的小游戏实现 ══════════════════
  // 「哈里的金币」（7k7k/660617，逐字见 docs/官方资料库.md 16.1）
  //   官方：「游戏地点：商业街—多比大街」「NPC名称：华多」
  //        「到后面速度越来越快，想让金币都掉入箱子里就不是一件很容易的事情了」
  //        「可以按住键盘上的四个方向键不松」→ **四个方向都能动**，所以箱子是二维移动的
  //   数值（接几枚过关 / 几关 / 速度曲线）官方没给 → D.COINCATCH，登记 V65
  function ccParams() { return D.COINCATCH || {} }
  // 玩法区：与「飞翔的衣服」同一套边界思路（避开顶部标题与底部提示行）
  function miniArena() { return { x0: 26, y0: 186, x1: W - 26, y1: H - 118 } }
  function makeCoinCatch() {
    const C = ccParams()
    const a = miniArena()
    return {
      x: (a.x0 + a.x1) / 2, y: a.y1,           // 箱子（二维移动）
      coins: [], got: 0, dropped: 0, level: 1,
      delay: C.firstDelay || 1.4, next: 0.6,
      msg: '', msgT: 0, over: 0, t: 0,
    }
  }
  function coinCatchTick(dt) {
    const st = dungeonState()
    const g = st.cc
    if (!g || g.over || st.phase !== 'catch') return
    const C = ccParams()
    const a = miniArena()
    g.t += dt
    if (g.msgT > 0) g.msgT -= dt
    // 箱子二维移动：官方那条技巧是「按住键盘上的四个方向键不松」→ 四个方向都得能动
    const sp = (C.moveSpeed || 420) * dt
    const ax = (input.down('ArrowRight') || input.down('d') ? 1 : 0) - (input.down('ArrowLeft') || input.down('a') ? 1 : 0)
    const ay = (input.down('ArrowDown') || input.down('s') ? 1 : 0) - (input.down('ArrowUp') || input.down('w') ? 1 : 0)
    const halfW = (C.boxW || 76) / 2, halfH = (C.boxH || 34) / 2
    g.x = util.clamp(g.x + ax * sp, a.x0 + halfW, a.x1 - halfW)
    g.y = util.clamp(g.y + ay * sp, a.y0 + 90, a.y1)
    // 掉金币：间隔随关卡变短（官方"后面速度越来越快"）
    g.next -= dt
    if (g.next <= 0 && g.dropped < (C.needPerLevel || 15)) {
      const speed = (C.fallSpeed || 130) + (C.speedPerLevel || 26) * (g.level - 1)
      g.coins.push({ x: a.x0 + 40 + Math.random() * (a.x1 - a.x0 - 80), y: a.y0, vy: speed, r: 13, got: false, miss: false })
      g.dropped++
      g.next = Math.max(C.minDelay || 0.42, (C.firstDelay || 1.4) - (C.delayPerLevel || 0.22) * (g.level - 1))
    }
    // 金币下落 + 接住判定（箱子是个矩形口）
    for (const c of g.coins) {
      if (c.got || c.miss) continue
      c.y += c.vy * dt
      const inBox = Math.abs(c.x - g.x) <= halfW && Math.abs(c.y - (g.y - halfH)) <= halfH + c.r
      if (inBox) { c.got = true; g.got++; audio.sfx('assets/sfx/onClick_03.mp3') }
      else if (c.y > a.y1 + 30) {
        c.miss = true
        // 漏掉超过"掉落的减去目标"就本关失败（15 枚里要接住 8 枚）
        const missed = g.coins.filter((x) => x.miss).length
        if (missed > (C.needPerLevel || 15) - (C.target || 8)) {
          const L = g.level
          Object.assign(g, makeCoinCatch())
          g.level = L
          g.msg = `漏得太多了 —— 第 ${L} 关重来`; g.msgT = 1.4
          notice(g.msg)
          return
        }
      }
    }
    g.coins = g.coins.filter((c) => !c.got || c.y < a.y1 + 60)
    // 过关
    if (g.got >= (C.target || 8)) {
      g.over = 1
      notice(`接住 ${g.got} 枚金币！（第 ${g.level} 关）`)
      miniStagePass()
    }
  }
  function coinCatchReset() {
    const st = dungeonState()
    const L = st.cc ? st.cc.level : 1
    st.cc = makeCoinCatch(); st.cc.level = L
  }

  // 「魔镜世界」（7k7k/660928 + 660934，逐字见 docs/官方资料库.md 16.4）
  //   官方：「游戏地点：多比城堡—智慧学堂」「NPC名称：安迪」
  //        「游戏的最终目的就是躲避怪物的同时打开箱子，并且找到钥匙就行了」
  //        「怪物的行动轨迹是有规律的」「左右相反或上下相反…如果都相反的话，可以试试把键盘颠倒180度」
  //   ★ 镜像这条是从攻略的**建议**反推的解释（原文没直接写"操作被镜像"）→ 界面如实标注，登记 V68
  function mrParams() { return D.MIRROR || {} }
  function makeMirror() {
    const C = mrParams()
    const a = miniArena()
    const W = a.x1 - a.x0, H = a.y1 - a.y0
    const n = C.crates || 4
    const crates = []
    for (let i = 0; i < n; i++) {
      crates.push({
        // 箱子沿场地均匀铺开（不叠在一起）
        x: a.x0 + 80 + (i * (W - 160)) / Math.max(1, n - 1),
        y: a.y0 + 60 + ((i % 2) ? H - 190 : 20),
        w: 42, h: 38, opened: false, hasKey: false,
      })
    }
    crates[Math.floor(Math.random() * n)].hasKey = true
    const mons = []
    for (let i = 0; i < (C.monsters || 2); i++) {
      // 「怪物的行动轨迹是有规律的」→ 固定巡逻线段（往返），不是随机游走。
      // 【第 47 轮修】第一版 y = y0+120 + i*(H-200)/count → 两只怪只差 28px，
      // 几乎叠在同一条线上；现在把可用高度按条数分段，一只占一段。
      const seg = (a.y1 - a.y0 - 60) / Math.max(1, (C.monsters || 2))
      const y = a.y0 + 60 + seg * (i + 0.5)
      mons.push({ x0: a.x0 + 40, x1: a.x1 - 40, y, x: a.x0 + 40 + (i * 120) % Math.max(1, a.x1 - a.x0 - 80), dir: 1, r: 20 })
    }
    return {
      px: (a.x0 + a.x1) / 2, py: a.y1 - 30, r: 18,
      crates, mons, hasKey: false, opened: 0, timeLeft: C.timeSec || 90,
      // 出口：**开完全部箱子并且拿到钥匙之后**才打开（官方："打开箱子，并且找到钥匙就行了"）
      // 【第 47 轮修】第一版**没有出口** —— 一旦钥匙藏在靠前的箱子里，
      // 玩家（和体检机器人）开完剩下的箱子后就无事可做，这一关**永远打不完**。
      // 自动试玩体检直接报"0/6 通关"，把它抓了出来。现在必须"回出口"才算过。
      exit: { x: a.x1 - 60, y: a.y0 + 60, w: 64, h: 78, open: false },
      msg: '方向会被镜像（魔镜世界的玩法内核）', msgT: 3, over: 0, hurtT: 0, fails: 0,
    }
  }
  function mirrorTick(dt) {
    const st = dungeonState()
    const g = st.mr
    if (!g || g.over || st.phase !== 'mirror') return
    const C = mrParams()
    const a = miniArena()
    if (g.msgT > 0) g.msgT -= dt
    if (g.hurtT > 0) g.hurtT -= dt
    // ★ 镜像：按"把键盘颠倒180度"处理 —— 上就是下、左就是右
    let ax = (input.down('ArrowRight') || input.down('d') ? 1 : 0) - (input.down('ArrowLeft') || input.down('a') ? 1 : 0)
    let ay = (input.down('ArrowDown') || input.down('s') ? 1 : 0) - (input.down('ArrowUp') || input.down('w') ? 1 : 0)
    if (C.mirrorX) ax = -ax
    if (C.mirrorY) ay = -ay
    const sp = (C.playerSpeed || 190) * dt
    g.px = util.clamp(g.px + ax * sp, a.x0 + g.r, a.x1 - g.r)
    g.py = util.clamp(g.py + ay * sp, a.y0 + g.r, a.y1 - g.r)
    // 怪物按固定路线往返（有规律，可预测）
    for (const m of g.mons) {
      m.x += m.dir * (C.monsterSpeed || 105) * dt
      if (m.x < m.x0) { m.x = m.x0; m.dir = 1 }
      if (m.x > m.x1) { m.x = m.x1; m.dir = -1 }
      if (Math.hypot(m.x - g.px, m.y - g.py) < m.r + g.r && g.hurtT <= 0) {
        g.hurtT = 1.2
        // 被撞到 → 退回起点（不判失败，官方只说"躲避"）
        g.px = (a.x0 + a.x1) / 2; g.py = a.y1 - 30
        g.msg = '被怪物撞到了 —— 退回起点'; g.msgT = 1.2
      }
    }
    // 开箱子（走近即开）
    for (const c of g.crates) {
      if (c.opened) continue
      if (Math.abs(c.x - g.px) < 34 && Math.abs(c.y - g.py) < 34) {
        c.opened = true; g.opened++
        if (c.hasKey) { g.hasKey = true; g.msg = '箱子里有钥匙！'; g.msgT = 1.6 }
        else { g.msg = `空的箱子（${g.opened}/${g.crates.length}）`; g.msgT = 0.9 }
        audio.sfx('assets/sfx/onClick_03.mp3')
      }
    }
    // 钥匙到手 + 箱子全开 → 出口打开（此时才"找到钥匙"，与官方那句一致）
    if (g.hasKey && g.opened >= g.crates.length && !g.exit.open) {
      g.exit.open = true
      g.msg = '出口打开了 —— 走到右上角的门'; g.msgT = 2.2
    }
    // 走到出口 → 通关
    if (g.exit.open
      && Math.abs(g.px - g.exit.x) < g.exit.w / 2 + 6
      && Math.abs(g.py - g.exit.y) < g.exit.h / 2 + 6) {
      g.over = 1
      notice('带着钥匙从出口离开 —— 通过魔镜世界！')
      miniStagePass()
      return
    }
    g.timeLeft -= dt
    if (g.timeLeft <= 0) {
      const L = { ...g }
      st.mr = makeMirror()
      st.mr.fails = (L.fails || 0) + 1
      st.mr.msg = '时间到 —— 本关重来'; st.mr.msgT = 1.4
      notice(st.mr.msg)
    }
  }
  function mirrorReset() {
    const st = dungeonState()
    st.mr = makeMirror()
  }

  // ══════════════════ 第 48 轮：把两个"规则已查明"的小游戏做出来 ══════════════════

  // 「冲上云霄」（7k7k/551114，逐字见 docs/官方资料库.md 16.2）
  //   官方：「最好的方法就是**把光标放在想要跳的泡泡上面**」「有些**泡泡会叠在一起**，一定要小心！！
  //        **速度太快可能会一下子找不到就死啦**」「**大雁什么的最好不要跳**：1速度太快、2**它会动**」
  //        「其实也不用跳到最高**只要 50000+ 就行啦**」
  //   ★ **分数目标 50000 是官方原话**（不是我们定的难度），所以计分必须真的能爬到 5 万：
  //     每踩一个泡泡 +1200 分 → 42 个泡泡 = 50400（见 D.SOAR）
  //   ★ 「大雁会动」是官方点名的**移动危险**：踩上去就会被甩掉 → 实现成"来回移动的平台+碰到即坠落"
  // ── 「冲上云霄」（7k7k/551114，逐字见 docs/官方资料库.md 16.2）──
  //   官方：「把光标放在想要跳的泡泡上面」「有些泡泡会叠在一起」「大雁什么的最好不要跳：
  //        1速度太快、2它会动」「只要 50000+ 就行啦」「掉下来就重来」
  //   ★ **50000 分是官方原话**，不是我们定的难度 → 每踩一个泡泡 +1200 分，42 个刚好 50400。
  //   ★「大雁会动」是官方点名的危险 → 做成**空中往返的移动体**，碰到就被甩下去（不是平台）。
  //
  // 【第 48 轮重写说明】上一版纠缠在"泡泡随机撒 + 玩家自由落体"上，改了 8 处仍不能让机器人
  //   稳定通关（几何够不着、对准窗口跨不过去、状态暴露不足……）。这一版改成**固定阶梯**：
  //   泡泡按 4 列 × 58px 间距从地面往上铺，玩家从地面起跳、落到泡泡顶面就站住、按一下跳一次。
  //   可验证性放在第一位：一次跳跃 67.5px > 间距 58px，所以**每一级都够得着**（这条由测试断言）。
  function srParams() { return D.SOAR || {} }
  const SR_GROUND = () => H - 96
  // 爬升阶梯：**重叠阶梯**（第 50 轮重做）
  //
  // 【为什么整体重做】第 48/49 两轮在"随机撒泡泡 + 玩家自己找路"上改了 13 次，
  //   每次都只修掉一个症状：够不着、对准窗口跨不过去、爬两层就找不到可达目标……
  //   最后定位到根因**不是 bug 而是布局**：单点泡泡 + 大横向漂移，要求玩家做路径规划。
  //   官方原话只说「把光标放在想要跳的泡泡上面往上跳」，**没有要求玩家算路线**。
  //
  // 这一版照这个理解重做几何，三条硬约束（都由 test-minigame 断言）：
  //   ① 每一层有 `cols` 个泡泡横向连成一段（落脚面宽，不必像素级对准）
  //   ② 相邻两层**横向重叠** —— 站在下一层任何位置都能跳上上一层（重叠量 ≥ 40px）
  //   ③ 层间竖直间距 `gapY` < 一跳高度（58 < 67.5）
  // 于是"一直往上跳"就是唯一解，机器人（和玩家）都不需要规划。
  function soarLadder() {
    const C = srParams()
    const gap = C.gapY || 58, r = C.bubbleR || 34
    const jumpH = (C.jump || 450) * (C.jump || 450) / (2 * (C.gravity || 1500))
    const cols = 3                       // 每层 3 个泡泡连成一段
    const colStep = r * 1.6              // 段内间距（中心距 54px，泡泡直径 68 → 有明显重叠）
    const segW = (cols - 1) * colStep    // 一段的宽度
    const overlapNeed = 40               // 相邻两段至少重叠 40px
    const margin = 40 + segW / 2
    const span = W - margin * 2
    const out = []
    let cx = W / 2                       // 这一段的中心
    let y = SR_GROUND() - jumpH * 0.55 + r
    for (let i = 0; i < 80; i++) {
      for (let k = 0; k < cols; k++) {
        out.push({ x: cx + (k - (cols - 1) / 2) * colStep, y, r, used: false, layer: i })
      }
      y -= gap
      // 下一段中心相对本段的位移：**±10px**（基本上就是一条竖直的阶梯）。
      // 【第 50 轮：四代参数一路试下来的结论】
      //   ±168 → 层次间落差太大，爬到某层就找不到可达目标；±68 → 能到 20~34 层但会卡；
      //   ±30 → 仍会卡（层间横向错位让"每层实际要上升的高度"变成 66px，
      //         而一次跳跃只有 67.5px，余量 1.5px，机器人爬到第 3~6 层就再也上不去）。
      //   ±10 比落地判定窗（±74px）小得多 → 玩家站在任何位置都能踩到上一层，
      //   每层需要上升的高度就稳定等于 `gapY`（58 < 一跳 76.8px，余量近 19px）。
      //   **可玩性 > 视觉随机性**：官方那句「把光标放在想跳的泡泡上面往上跳」本来就是
      //   描述一条能一直往上爬的路，而不是要玩家做路径规划。
      const maxShift = 10
      cx = Math.max(margin, Math.min(W - margin, cx + (Math.random() * 2 - 1) * maxShift))
    }
    return out
  }
  function makeSoar() {
    const C = srParams()
    const B = soarLadder()
    // 大雁：**空中往返的移动体**（官方"它会动…最好不要跳"）→ 撞到就被甩下去，不是落脚点
    const geese = []
    for (let i = 3; i < 60; i += 7) {
      const y = SR_GROUND() - i * (C.gapY || 58)
      geese.push({ x: 200 + Math.random() * (W - 400), y, x0: 120, x1: W - 120, dir: Math.random() < 0.5 ? 1 : -1, r: 22 })
    }
    return {
      x: W / 2, y: SR_GROUND(), vy: 0, onBubble: null, landedAt: -1,
      bubbles: B, geese,
      score: 0, jumped: 0, timeLeft: C.timeSec || 75, fails: 0, over: 0, t: 0,
      msg: '踩泡泡往上跳　目标 ' + (C.target || 50000).toLocaleString() + ' 分（官方原话"只要50000+就行"）', msgT: 3.5,
    }
  }
  function soarTick(dt) {
    const st = dungeonState()
    const g = st.sr
    if (!g || g.over || st.phase !== 'soar') return
    const C = srParams()
    const ground = SR_GROUND()
    g.t += dt
    if (g.msgT > 0) g.msgT -= dt

    // ① 横向移动（**只在地面/泡泡上生效** —— 第 50 轮收紧）
    // 【为什么要收紧】原版是"把光标放在想跳的泡泡上面往上跳"：起跳前对准，跳出去就是一条固定弧线。
    //   之前空中也能左右修正，于是"跳上去能不能踩到"取决于玩家的实时反应，
    //   自动化验证与真人体验都变得不可预测（第 49 轮机器人在空中漂出落点、反复空跳）。
    //   收紧之后：跳起前对准 → 落点完全由几何决定（测试可断言）。
    const groundedNow = !!(g.onBubble || g.y >= ground)
    const sp = (C.moveSpeed || 200) * dt
    if (groundedNow) {
      if (input.down('ArrowLeft') || input.down('a')) g.x -= sp
      if (input.down('ArrowRight') || input.down('d')) g.x += sp
    }
    g.x = util.clamp(g.x, 30, W - 30)
    // ★ 走出泡泡边缘 → 掉下去（第 48 轮补）
    // 【为什么必须有】第一版只"踩上去时"记 onBubble，**从不清除** —— 横向走出泡泡之后
    // 人还挂在那个泡泡上（悬浮在半空），而且 onBubble 恒为真、玩家与机器人都会以为还站着。
    //
    // ⚠️⚠️ 第 58 轮修：这里的窗口**必须和落地判定窗一致**（都是 `r + 40`）。
    //   原来是 `r + 10 = 44`，而落地窗是 `r + 40 = 74` —— 两个窗口一宽一窄，
    //   于是出现一种死循环：玩家站在 x=480、脚下泡泡在 x=426（差 54）→
    //   本帧先判"走出边缘"把人**掉下去**（54 > 44），紧接着落地判定又把他**接回同一个泡泡**
    //   （54 ≤ 74），`landedAt` 每帧被刷新 → `t - landedAt` 恒为 0 →
    //   机器人"落地后停一拍再跳"的闸门（≥0.08s）永远过不去，**站着不动到超时**
    //   （实测：落在第一个泡泡上之后 90 秒一次没跳、分数停在 1200）。
    //   统一成一个窗口之后，"站在泡泡边缘"就只是站着，不会每帧假摔。
    if (g.onBubble && Math.abs(g.x - g.onBubble.x) > g.onBubble.r + 40) g.onBubble = null

    // ② 起跳：站在地面或泡泡上，按一下跳一次（边沿触发在引擎里由 input.once 保证）
    if ((input.once(' ') || input.once('Enter') || input.once('ArrowUp') || input.once('w')) && (g.onBubble || g.y >= ground)) {
      g.vy = -(C.jump || 450)
      g.onBubble = null
      audio.sfx('assets/sfx/onClick_03.mp3')
    }
    // ③ 重力 + 地面
    g.vy += (C.gravity || 1500) * dt
    const prevY = g.y
    g.y += g.vy * dt
    if (g.y >= ground) { g.y = ground; g.vy = 0; g.onBubble = null; g.standTop = ground }

    // ④ 落到泡泡上
    // 【第 49 轮改：不做"穿越检测"，直接判"脚底在泡泡顶面附近"】
    //   前两版都栽在判据上：
    //     ① 只看"这一帧是否刚好落在顶面 ±16px"→ 重力下落的单帧位移可达 15~25px，**整帧跳过**窗口；
    //     ② 改成"从上方跨过顶面"→ 可是**从地面起跳到第一层时，人本来就在顶面下方往上升**
    //        （地面 464、顶面 427），永远不满足"从上方跨下来" → 第一层永远踩不上（实测 90 秒 0 分）。
    //   实际手感就是"脚踩在泡泡上"：脚底在顶面附近 + 横向在泡泡上方 = 落地。
    //   上行下行都成立（现实中踩到泡泡也是这样），也不必再依赖单帧位移。
    //
    // ★★ 第 58 轮修掉的**真 bug**：这里原来第一行是 `if (b.used) continue` ——
    //   **踩过的泡泡直接变成空气**。后果是致命的：从地面起跳只够得着第 0 层，
    //   那 3 个泡泡一旦用掉，玩家（和机器人）**掉回地面就再也上不去**，
    //   分数永远停在 7200 卡到超时（实测：前 15 秒落地 6 次得 7200 分，之后 75 秒 0 分）。
    //   这解释了为什么第 48/49/50 轮一直在调物理参数却怎么都过不了关 —— **根因不在物理**。
    //   现在的规则：**踩过的泡泡仍然能踩**（梯子不会被拆掉），只是**不再重复计分**。
    //   官方那句是「掉下来就重来」，从来不是"把踩过的泡泡删掉"。
    for (const b of g.bubbles) {
      const top = b.y - b.r
      const atTop = g.y >= top - 4 && g.y <= top + 28
      if (atTop && Math.abs(g.x - b.x) <= b.r + 40) {
        // ★ 要区分"**刚踩上来**"和"**已经站在上面**"：
        //   脚底正好等于顶面时 `atTop` **每帧都成立**，如果每帧都当一次"落地"，
        //   `landedAt` 就被反复刷新 → `t - landedAt` 恒为 0 →
        //   机器人"落地后停一拍再跳"的闸门（≥0.08s）永远过不去，**站着不动到超时**
        //   （实测：落在第一个泡泡上之后 40 秒一次没跳）。
        const arriving = (g.onBubble !== b)
        const first = !b.used
        b.used = true
        g.onBubble = b
        g.y = top
        g.vy = 0
        if (arriving) g.landedAt = g.t
        g.standTop = top          // 当前站立的落脚面（脚底高度）—— 给机器人算"上一层够不够得着"
        if (first) {              // **只有第一次踩才计分**（重复踩不计分，避免原地刷分）
          g.jumped++
          g.score += (C.scorePerBubble || 1200)
        }
        audio.sfx('assets/sfx/onMouseOver_03.mp3')
        break
      }
    }
    // ⑤ 大雁在飞（官方"它会动"）；撞上就被甩下去
    for (const go of g.geese) {
      go.x += go.dir * (C.gooseSpeed || 90) * dt
      if (go.x < go.x0) { go.x = go.x0; go.dir = 1 }
      if (go.x > go.x1) { go.x = go.x1; go.dir = -1 }
      if (Math.hypot(go.x - g.x, go.y - (g.y - 16)) < go.r + 14) {
        g.onBubble = null
        g.vy = 200
        g.msg = '撞到大雁了 —— 它会动，别踩它！'; g.msgT = 1.2
      }
    }
    // ⑥ 分数够了就通关（官方"只要 50000+ 就行啦"）
    if (g.score >= (C.target || 50000)) {
      g.over = 1
      notice('爬到 ' + g.score.toLocaleString() + ' 分 —— 冲上云霄！')
      miniStagePass()
      return
    }
    // ⑦ 限时（分数保留，只重开计时）
    g.timeLeft -= dt
    if (g.timeLeft <= 0) {
      const keep = g.score
      st.sr = makeSoar()
      st.sr.score = keep
      st.sr.fails = g.fails + 1
      st.sr.msg = '时间到 —— 续一局（已得 ' + keep.toLocaleString() + ' 分）'; st.sr.msgT = 1.8
      notice(st.sr.msg)
    }
  }
  function soarReset() {
    const st = dungeonState()
    st.sr = makeSoar()
  }

  // 「极限顶顶球」（归档截图规则 + 7k7k/660779，逐字见 16.3）
  //   官方：「**用左右方向键控制多克的行动，上键控制多克的跳跃**，直到控制多比将球顶入对方的瓶子里」
  //        「**电脑的速度和跳跃高度都要比我们高**」
  //        ★「**不管是谁顶进去的球，只要是在对方一边进的，就算我们得分**」
  //   ★ 这条得分归属必须照做：判定只看**球进了哪一边**，不看最后是谁碰的。
  //   ★ AI 的两项数值**就是要比玩家高**（官方原话），所以 aiSpeed/aiJump > playerSpeed/playerJump。
  function bpParams() { return D.BALLPUSH || {} }
  function bpGoalY() {
    const C = bpParams()
    const gy = C.groundY || 470
    return gy - (C.goalH || 120)
  }
  function makeBallPush() {
    const C = bpParams()
    const x0 = C.fieldX0 || 150, x1 = C.fieldX1 || 810, gy = C.groundY || 470
    return {
      ball: { x: (x0 + x1) / 2, y: gy - 160, vx: 0, vy: 0, r: C.ballR || 15 },
      me: { x: x0 + 90, y: gy, vy: 0, onGround: true },
      ai: { x: x1 - 90, y: gy, vy: 0, onGround: true, think: 0 },
      scoreMe: 0, scoreAi: 0, timeLeft: C.timeSec || 120, over: 0, msg: '把球顶进对方的瓶子（球进哪边就算谁得分）', msgT: 3, t: 0, freeze: 0,
    }
  }
  function bpBounceOff(paddle, C, ball, who) {
    // 用"人物撞球"来顶球：球获得一个**远离人物**的水平冲量 + 一点上抛。
    // 【第 48 轮修，两个坑】
    //   ① 冲量方向必须由"球在人物的哪一侧"决定，不能按"球往哪飞"决定 ——
    //      否则人物追着球跑的时候会把球一路顶向**自己**的瓶子。
    //   ② 顶上之后必须把球**挪到人物碰撞盒之外**（paddle.y - ph - r），
    //      第一版只挪了 `paddle.y - ph/2`，球仍然落在盒子里 → 下一帧又判一次碰撞，
    //      球被永久粘在人物身上、比分再也不变（实测球卡在 (442,426) 几十秒不动）。
    //   ③ 再加一个**同一人物的击打冷却**，避免"贴着球连推"变成推土机。
    const g = dungeonState().bp
    const b = ball || g.ball
    const dir = b.x >= paddle.x ? 1 : -1
    b.vx = dir * 380
    b.vy = -300
    b.y = paddle.y - (C.playerH || 56) - b.r - 1
    b.x = paddle.x + dir * ((C.playerW || 44) / 2 + b.r + 2)
    if (who) { if (!g.hitCd) g.hitCd = {}; g.hitCd[who] = 0.22 }
  }
  function ballPushTick(dt) {
    const st = dungeonState()
    const g = st.bp
    if (!g || g.over || st.phase !== 'ballpush') return
    const C = bpParams()
    const x0 = C.fieldX0 || 150, x1 = C.fieldX1 || 810, gy = C.groundY || 470
    g.t += dt
    if (g.msgT > 0) g.msgT -= dt
    if (g.freeze > 0) g.freeze -= dt
    const pw = C.playerW || 44, ph = C.playerH || 56

    // ---- 玩家：左右移动 + 上键跳跃（官方原话）----
    const sp = (C.playerSpeed || 300) * dt
    if (input.down('ArrowLeft') || input.down('a')) g.me.x -= sp
    if (input.down('ArrowRight') || input.down('d')) g.me.x += sp
    g.me.x = util.clamp(g.me.x, x0 + pw / 2, x1 - pw / 2)
    if ((input.once('ArrowUp') || input.once('w') || input.once(' ') || input.once('Enter')) && g.me.onGround) {
      g.me.vy = -(C.playerJump || 470); g.me.onGround = false
    }

    // ---- AI：**站到球的右边**往左顶（目标是把我方的球推进左边那个瓶子）----
    // 只"追着球跑"是不够的：它会一路把球顶向自己那边（第一版实测 5 秒就 0:2 输掉）。
    // 所以 AI 要站到球的**右侧**，靠身体把球往左推。
    g.ai.think -= dt
    if (g.ai.think <= 0) {
      g.ai.think = C.aiThink || 0.12
      const target = g.ball.x + 30          // 站在球的右边
      const d = target - g.ai.x
      g.ai.want = Math.abs(d) < 10 ? 0 : (d > 0 ? 1 : -1)
      g.ai.wantJump = g.ai.onGround && g.ball.y < gy - 120 && Math.abs(g.ball.x - g.ai.x) < 90
    }
    g.ai.x += (g.ai.want || 0) * (C.aiSpeed || 360) * dt
    g.ai.x = util.clamp(g.ai.x, x0 + pw / 2, x1 - pw / 2)
    if (g.ai.wantJump) { g.ai.vy = -(C.aiJump || 540); g.ai.onGround = false; g.ai.wantJump = false }

    // ---- 重力（玩家 / AI）----
    for (const p of [g.me, g.ai]) {
      if (!p.onGround) {
        p.vy += 1500 * dt
        p.y += p.vy * dt
        if (p.y >= gy) { p.y = gy; p.vy = 0; p.onGround = true }
      }
    }

    // ---- 球：重力 + 边界反弹 ----
    // 【第 48 轮修】进球后要有短暂的"冻结"再重新开球，否则球会在原地反复触发进球判定
    // （第一版实测球卡在 (442,426) 几十秒、比分不再变化，比赛永远打不完）。
    const b = g.ball
    if (g.freeze > 0) {
      b.vx = 0; b.vy = 0
    } else {
      b.vy += (C.ballGravity || 1400) * dt
      b.x += b.vx * dt
      b.y += b.vy * dt
    }
    const bounce = C.ballBounce || 0.86
    if (b.y + b.r >= gy) { b.y = gy - b.r; b.vy = g.freeze > 0 ? 0 : -Math.abs(b.vy) * bounce; b.vx *= 0.995 }
    if (b.x - b.r <= x0) { b.x = x0 + b.r; b.vx = Math.abs(b.vx) * bounce }
    if (b.x + b.r >= x1) { b.x = x1 - b.r; b.vx = -Math.abs(b.vx) * bounce }
    if (b.y - b.r < 120) { b.y = 120 + b.r; b.vy = Math.abs(b.vy) * 0.6 }

    // ---- 人物撞球 → 顶出去（带击打冷却，见 bpBounceOff 的注释）----
    if (!g.hitCd) g.hitCd = {}
    for (const k of Object.keys(g.hitCd)) { g.hitCd[k] -= dt; if (g.hitCd[k] <= 0) delete g.hitCd[k] }
    for (const [who, p] of [['me', g.me], ['ai', g.ai]]) {
      if (g.hitCd[who] > 0) continue
      const top = p.y - ph, bot = p.y
      if (b.x + b.r > p.x - pw / 2 && b.x - b.r < p.x + pw / 2 && b.y + b.r > top && b.y - b.r < bot) {
        bpBounceOff(p, C, b, who)
      }
    }

    // ---- ★ 得分：只看球进了哪一边（官方："不管是谁顶进去的球，只要是在对方一边进的，就算我们得分"）----
    const goalTop = bpGoalY()
    if (b.x - b.r <= x0 + (C.goalW || 26) && b.y > goalTop) {
      g.scoreAi++                        // 球进了**我们**这边 → 对方得分
      resetBall(g, 'ai')
    } else if (b.x + b.r >= x1 - (C.goalW || 26) && b.y > goalTop) {
      g.scoreMe++                        // 球进了**对方**那边 → 我们得分
      resetBall(g, 'me')
    }

    // ---- 胜负（原文与截图都没写几球定胜负 → derived，见 V67）----
    if (g.scoreMe >= (C.winGoals || 3) || g.scoreAi >= (C.winGoals || 3)) {
      g.over = 1
      if (g.scoreMe > g.scoreAi) {
        notice(`顶进 ${g.scoreMe} 球 —— 赢了！`)
        miniStagePass()
      } else {
        notice(`输了 ${g.scoreMe}:${g.scoreAi} —— 再来一局`)
        g.over = 0
        st.bp = makeBallPush()
        st.bp.msg = '这局输了，重新开始'; st.bp.msgT = 1.6
      }
      return
    }
    g.timeLeft -= dt
    if (g.timeLeft <= 0) {
      const my = g.scoreMe, ai = g.scoreAi
      st.bp = makeBallPush()
      st.bp.msg = `时间到（${my}:${ai}）—— 重新开始`; st.bp.msgT = 1.8
      notice(st.bp.msg)
    }
  }
  function resetBall(g, who) {
    const C = bpParams()
    const x0 = C.fieldX0 || 150, x1 = C.fieldX1 || 810, gy = C.groundY || 470
    g.ball.x = (x0 + x1) / 2; g.ball.y = gy - 160
    g.ball.vx = who === 'me' ? 60 : -60; g.ball.vy = 0
    g.msg = who === 'me' ? '球进对方瓶子 —— 我们得分！' : '球进我们这边 —— 对方得分'
    g.msgT = 1.4
    g.freeze = 0.8
  }
  function ballPushReset() {
    const st = dungeonState()
    st.bp = makeBallPush()
  }

  // 小游戏/解谜关通过（面板直接开、或嵌在副本里，都走这里）

  function miniStagePass() {
    const st = dungeonState()
    const s = curStage()
    const d = D.dungeonById(st.id)
    // 小游戏（临时单关卡副本）的属性奖励**只由奖励表给一次** —— 官方原文就是
    // 「完成这些游戏…除了金币、彩晶石和声望的奖励外，还有增加多克属性的奖励」，
    // 是"完成游戏"给一次，不是"过一关"再叠一次（先前这里会发两遍，测试抓到了）。
    if (!(d && d.miniReward)) grantAttr(G.app.awaken.AWAKEN_STAGE_GAIN[s ? s.kind : 'memory'] || {})
    st.log.push(`通过　${s ? s.label : ''}`)
    st.idx++
    if (st.idx >= (d ? d.stages.length : 0)) {
      if (d && d.miniReward) { finishMinigame(true); return }
      st.phase = 'flip'; makeFlip(); return
    }
    st.phase = 'stage'
    startDungeonStage()
  }

  G.app = G.app || {}
  G.app.minigames = {
    makeSlidePuzzle,
    slideSolved,
    slideMove,
    slideMoveDir,
    blocksShape,
    makeBlocks,
    blocksRuns,
    blocksClear,
    blocksMove,
    blocksRotate,
    blocksTick,
    blocksReset,
    blockCellRect,
    BLOCK_COLORS,
    makeRunner,
    RUN_BASE,
    RUN_BOOST,
    RUN_MAX,
    RUN_JUMP,
    RUN_GRAV,
    runnerPress,
    runnerJump,
    runnerTick,
    runnerReset,
    makePlatformer,
    PL_W,
    platformerTick,
    platformerJump,
    platformerReset,
    flyerRoster,
    pickFlyer,
    makeChargeShooter,
    chargeShooterTick,
    chargeShooterReset,
    makeSki,
    SKI,
    PL_H,
    skiPass,
    skiTick,
    skiReset,
    makeNotes,
    NOTE,
    notesTick,
    notesReset,
    FC,
    fcArena,
    makeFlyCatch,
    flyCatchCast,
    flyCatchTick,
    flyCatchReset,
    sumoView,
    sumoX,
    sumoY,
    sumoBX,
    sumoBY,
    sumoInRiver,
    makeSumo,
    sumoAlive,
    sumoNextUnit,
    sumoStartAim,
    sumoSetAim,
    sumoRotateAim,
    sumoPowerAim,
    sumoFire,
    sumoTick,
    sumoReset,
    ccParams,
    miniArena,
    makeCoinCatch,
    coinCatchTick,
    coinCatchReset,
    mrParams,
    makeMirror,
    mirrorTick,
    mirrorReset,
    srParams,
    soarLadder,
    makeSoar,
    soarTick,
    soarReset,
    bpParams,
    bpGoalY,
    makeBallPush,
    ballPushTick,
    ballPushReset,
    miniStagePass,
  }
})()
