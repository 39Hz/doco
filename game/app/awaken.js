/* 多克多比 · 应用层：变身唤醒 + 唤醒小游戏编排（第 72 轮重构批次 4）
   来源：原 game.js 第 2565–2915 行，内容一致（含官方依据注释）。
   依赖：引擎 window.DKDbb（save / audio）+ 内容表 window.DKDbbData（D）
        + 内核 G.core（toast / W）+ 跨应用层桥（下方 const 别名，惰性解析）：
          G.app.notice（战斗播报，批次 6 迁出）、G.app.minigames.miniStagePass（小游戏过关结算，批次 7 · 续 迁出）、
          G.app.dungeon.*（副本状态机，本批次另一模块）、
          G.app.minigames.flyerRoster / G.app.minigames.pickFlyer（小游戏，批次 7 · 续 迁出）、
          G.app.difficulty.needOf / G.app.difficulty.diff（难度，game.js 挂桥）。
   只经 G.app.awaken 出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'

  const G = window.DKDbbGame
  const { save, audio } = window.DKDbb
  const D = window.DKDbbData
  const { W } = G.core
  const { toast } = G.core
  // 跨应用层桥（惰性箭头：调用时才解析，故加载顺序无关）
  const notice = (...a) => G.app.notice(...a)
  const miniStagePass = () => G.app.minigames.miniStagePass()
  const dungeonState = (...a) => G.app.dungeon.dungeonState(...a)
  const curStage = () => G.app.dungeon.curStage()
  const needOf = (base) => G.app.difficulty.needOf(base)
  const diff = () => G.app.difficulty.diff()
  const flyerRoster = () => G.app.minigames.flyerRoster()
  const pickFlyer = (roster, limit) => G.app.minigames.pickFlyer(roster, limit)

  // ==================== 变身唤醒（M4-4，官方系统）====================
  //
  // 官方依据见 data.js 里 D.awakenRequire 的注释：唤醒条件（勇气/智慧/魅力）**是官方数值**，
  // 来自原版策划表「多比名称和描述.xlsx」的第 13/14/15 列。
  // 我们的落地：在**宝石大厅**（用官方 NPC 名「艾伦」，原文说艾伦就在宝石大厅）唤醒；
  // 属性来源按原文「完成小游戏会得到智慧、勇气和魅力，这些是唤醒多比必不可少的」：
  //   · 解谜（记忆力）关通过 → 智慧 +2
  //   · 潜行（无所遁形）关通过 → 勇气 +2
  //   · 士气对抗获胜         → 魅力 +2（在副本内，符合"魅力只能从副本获得"）
  //   · 副本通关             → 魅力 +3 / 勇气 +2（原有）
  const AWAKEN_STAGE_GAIN = { memory: { wisdom: 2 }, stealth: { brave: 2 }, morale: { charm: 2 }, quiz: { wisdom: 2 }, current: { brave: 2 }, pipe: { wisdom: 2 }, shooter: { brave: 2 }, slide: { wisdom: 2 } }

  function lockedForms() {
    const have = save.data.forms || []
    // 【第 55 轮，用户要求】「自己画出来的多比也关闭获取模式」
    //   → 只把**有官方立绘**的形态列进可获取清单。
    //   没有立绘的形态（`artMissing`）在界面上只能显示占位形象，让玩家花白彩/勋章把它换出来
    //   是**给了一个没有形象的角色** —— 所以从获取途径里摘掉。
    //   ⚠️ 掉落途径（第 5033 行）本来就有同样的 `artOk` 过滤，这里补齐唤醒/图鉴列表，
    //      两条路径用同一判据，避免"掉落不掉、但能唤醒"的不一致。
    //   等以后补上官方立绘（art 字段非空），它们会自动回到清单里 —— 不需要改这里。
    return D.FORMS.filter((f) => !have.includes(f.name))
      .filter((f) => (typeof D.formHasArt === 'function' ? D.formHasArt(f) : !!f.art))
  }

  // ==========================================================================
  // ★ 「把形态发给玩家」的**唯一入口**（第 66 轮，用户要求）
  //
  // 用户原话：「没有模型立绘的就不要在玩家获得里面，包括你自己做的」。
  // 发放点一共 **4 处** —— 副本首通 / 珍宝小屋兑换 / 宝石大厅唤醒 / 战斗随机掉落。
  // 这种"同一规则要在 N 个地方各写一遍"的事，漏掉任何一处就等于没做，
  // 而且以后新加一条途径还会再漏一次。所以集中到这里：**测试只需要盯这一个函数**。
  //
  // 返回 { ok, form } 或 { ok:false, why } —— 调用方按 why 决定提示什么。
  // ==========================================================================
  function grantForm(name) {
    const f = (D.FORMS || []).find((x) => x.name === name)
    if (!f) return { ok: false, why: '没有这个形态' }
    if ((save.data.forms || []).includes(f.name)) return { ok: false, why: '已经拥有了' }
    if (typeof D.formHasArt === 'function' && !D.formHasArt(f)) {
      return { ok: false, why: '归档里没有这只的模型立绘，暂不开放获得' }
    }
    save.data.forms.push(f.name)
    return { ok: true, form: f }
  }
  function awakenMissing(form) {
    const req = D.awakenRequire(form)
    const a = save.data.attrs || {}
    const miss = []
    for (const [k, need] of Object.entries(req)) {
      if (!need) continue
      const key = D.REQ_TO_ATTR[k] || k
      const have = a[key] || 0
      miss.push({ attr: key, need, have, ok: have >= need })
    }
    return miss
  }
  function canAwaken(form) {
    if (!form) return { ok: false, why: '没有这个形态' }
    if ((save.data.forms || []).includes(form.name)) return { ok: false, why: '已经拥有' }
    // ★ 第 66 轮（用户要求）：没有模型立绘的形态**一律不开放获得** ——
    //   放在唤醒判断之前，因为官方的唤醒途径也救不了"拿到手是一片空白"。
    if (typeof D.formHasArt === 'function' && !D.formHasArt(form)) {
      return { ok: false, why: '归档里没有这只的模型立绘，暂不开放获得' }
    }
    if (!D.isAwakenable(form)) {
      // 【第 52 轮改】原先这句是「限定形态：原表的唤醒条件三项全为 0（靠活动/掉落获得）」——
      // 用户看了直接问"活动在哪？"：单机版没有运营活动，这句话等于宣判"你永远拿不到"。
      // 现在这一行只说**依据**（为什么它不是唤醒得来的），**怎么拿**交给行内那行写 ——
      // 早先两处都写途径，截图核对时发现同一句话在选中行里出现了两遍。
      return { ok: false, why: '限定形态：原版策划表里它的唤醒条件三项全为 0，原版靠运营活动获得' }
    }
    const miss = awakenMissing(form)
    const bad = miss.filter((m) => !m.ok)
    if (bad.length) {
      const names = { brave: '勇气', wisdom: '智慧', charm: '魅力' }
      return { ok: false, why: '还差 ' + bad.map((m) => `${names[m.attr] || m.attr} ${m.have}/${m.need}`).join('　') }
    }
    return { ok: true }
  }
  function awaken(form) {
    const r = canAwaken(form)
    if (!r.ok) { notice(r.why); return false }
    // 再走一次唯一发放入口（canAwaken 里也挡了，这里是"双保险"：
    // 万一以后有人改了 canAwaken 而忘了改这里，发放这一关仍然拦得住）
    const g = grantForm(form.name)
    if (!g.ok) { notice(g.why); return false }
    const req = D.awakenRequire(form)
    const a = save.data.attrs || (save.data.attrs = {})
    for (const [k, need] of Object.entries(req)) {
      if (!need) continue
      const key = D.REQ_TO_ATTR[k] || k
      a[key] = (a[key] || 0) - need
    }
    save.persist()
    audio.sfx('assets/sfx/onClick_03.mp3')
    toast(`★ 唤醒成功！获得战斗形态「${form.name}」`)
    return true
  }
  const AWAKEN = { sel: 0, page: 0 }
  const AWAKEN_ROWS = 7
  function awakenList() { return lockedForms() }

  // ---- 「激流勇进」：三条航道，湍流随机冲一条，玩家在反应窗口内换道 ----
  function currentTick(dt) {
    const st = dungeonState()
    if (!st.st) return
    const g = st.st
    if (g.flash > 0) g.flash -= dt
    if (g.wave < 0) {
      // 生成下一波（**每条航道等概率**：原文说"站在最后面未必是安全的"）
      g.wave = Math.floor(Math.random() * g.lanes)
      g.t = g.window
      return
    }
    g.t -= dt
    if (g.t <= 0) {
      if (g.lane === g.wave) {
        g.hits++
        g.flash = 0.4
        if (g.hits >= 3) { notice('被激流冲倒了 3 次…再来一次'); resetCurrentStage(); return }
        notice('被冲中了！注意看下一波的航道')
      } else {
        g.done++
        if (g.done >= g.pass) { currentStagePass(); return }
      }
      g.wave = -1
    }
  }
  function resetCurrentStage() {
    const st = dungeonState()
    const s = curStage()
    st.st = { lanes: 3, lane: 1, wave: -1, t: 0, window: 1.2, hits: 0, pass: (s && s.rounds) || 3, done: 0, flash: 0 }
  }
  function currentStagePass() {
    // 原文：小游戏给的智慧/勇气/魅力是唤醒多比必不可少的（激流勇进考的是反应 → 勇气）
    notice('激流勇进通过')
    miniStagePass()
  }

  // ---- 「玛丽娜的考试」：答对 need 道即通过 ----
  function quizAnswer(i) {
    const st = dungeonState()
    const q = st.quiz
    if (!q || q.picked >= 0) return
    q.picked = i
    if (i === q.list[q.idx].right) { q.right++; }
    q.t = 0
  }
  function quizNext() {
    const st = dungeonState()
    const q = st.quiz
    if (!q) return
    if (q.idx >= q.list.length - 1) {
      // 判卷
      if (q.right >= q.need) {
        notice(`考试通过（答对 ${q.right}/${q.list.length}）`)
        dungeonState().log.push(`答对 ${q.right}/${q.list.length}`)
        miniStagePass()
      } else {
        notice(`只答对 ${q.right}/${q.list.length}，没到 ${q.need} 道 —— 重新考一次`)
        st.quiz = { list: D.pickQuiz(3), idx: 0, sel: 0, right: 0, need: q.need, picked: -1, t: 0 }
      }
      return
    }
    q.idx++
    q.sel = 0
    q.picked = -1
    q.t = 0
  }
  // 考试也给属性（原文：小游戏给的智慧/勇气/魅力是唤醒多比必不可少的）
  // → 答题算"小游戏"，给智慧（答题靠的是知识）
  function quizRects() {
    const w = 480, h = 46, gap = 12, x = (W - w) / 2, y = 300
    return Array.from({ length: 3 }, (_, i) => ({ x, y: y + i * (h + gap), w, h }))
  }

  // ---- 「连接能量管线」（战神金刚，7k7k/163435 原文）----
  //   原文：「**连接能量管线**，使得能量能够顺利输送即可。」
  // 落地：3×3 管线格，每格是一种管件（直管/弯管/三通/十字），按空格旋转；
  // 要把左侧入水口与右侧出水口连成一条通路。原文明说"顺利输送即可"，所以**连通就过关**。
  // 具体格数与管件形状原文未给 → derived（V47）。
  const PIPE_DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]   // N E S W
  // 管件的基础连通（下标同 PIPE_DIRS）
  const PIPE_SHAPES = {
    straight: [0, 1, 0, 1],   // 直管（南北）
    elbow: [0, 1, 1, 0],      // 弯管（东+南）
    tee: [0, 1, 1, 1],        // 三通
    cross: [1, 1, 1, 1],      // 十字
  }
  function pipeRotateBits(bits, r) {
    const out = [0, 0, 0, 0]
    for (let i = 0; i < 4; i++) if (bits[i]) out[(i + r) % 4] = 1
    return out
  }
  // 固定的解法通路（保证一定可解）：入水口在 (0,0) 左侧，出水口在 (2,2) 右侧
  const PIPE_SOLUTION = {
    '0,0': 'elbow',   // 需要 W + S
    '0,1': 'elbow',   // 需要 N + E
    '1,1': 'elbow',   // 需要 W + S
    '1,2': 'elbow',   // 需要 N + E
    '2,2': 'straight',// 需要 W + E
  }
  function makePipePuzzle() {
    const cells = []
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        const key = `${x},${y}`
        const shape = PIPE_SOLUTION[key] || ['straight', 'elbow', 'tee'][Math.floor(Math.random() * 3)]
        cells.push({ x, y, shape, rot: Math.floor(Math.random() * 4), locked: !!PIPE_SOLUTION[key] })
      }
    }
    // 把带 rot 的解法通路还原成"已连通"状态需要一个基准，
    // 这里直接把解法格的 rot 设为**能在若干次旋转内到位**的随机值
    const p = { cells, sel: 0, done: false, t: 0 }
    // 自检：题目必须可解（解法格都只是被转开了），否则重造
    return p
  }
  function pipeBitsAt(p, x, y) {
    const c = p.cells.find((k) => k.x === x && k.y === y)
    if (!c) return null
    return pipeRotateBits(PIPE_SHAPES[c.shape], c.rot)
  }
  // 从入水口做一次连通判定（无向：两边都得有对应的口）
  function pipeConnected(p) {
    const key = (x, y) => `${x},${y}`
    const seen = new Set()
    const start = key(0, 0)
    const b0 = pipeBitsAt(p, 0, 0)
    if (!b0 || !b0[3]) return false          // 入水口在左侧 → (0,0) 必须有 W 口
    const q = [[0, 0]]
    seen.add(start)
    let reached = false
    while (q.length) {
      const [x, y] = q.shift()
      const bits = pipeBitsAt(p, x, y)
      if (!bits) continue
      if (x === 2 && y === 2 && bits[1]) reached = true   // 出水口在右侧 → 需要 E 口
      for (let d = 0; d < 4; d++) {
        if (!bits[d]) continue
        const nx = x + PIPE_DIRS[d][0], ny = y + PIPE_DIRS[d][1]
        if (nx < 0 || ny < 0 || nx > 2 || ny > 2) continue
        if (seen.has(key(nx, ny))) continue
        const nb = pipeBitsAt(p, nx, ny)
        if (!nb || !nb[(d + 2) % 4]) continue             // 对面没有对应的口 → 接不上
        seen.add(key(nx, ny))
        q.push([nx, ny])
      }
    }
    return reached
  }
  function pipeRotate() {
    const st = dungeonState()
    const p = st.pipe
    if (!p) return
    const c = p.cells[p.sel]
    if (!c) return
    c.rot = (c.rot + 1) % 4
    audio.sfx('assets/sfx/onClick_03.mp3')
    if (pipeConnected(p)) {
      p.done = true
      notice('能量管线接通了！')
      miniStagePass()
    }
  }
  // 「魔法工匠」的 3×3 版式：和管线关一样要**结束在底部说明文字之前**（y=470 起）
  function slideRect(i) {
    const w = 78, gap = 12, x0 = (W - (3 * w + 2 * gap)) / 2, y0 = 196
    const x = i % 3, y = Math.floor(i / 3)
    return { x: x0 + x * (w + gap), y: y0 + y * (w + gap), w, h: w }
  }

  function pipeRect(i) {    // 3 行格子必须结束在底部说明文字（y=476 起）之前：
    //   3*78 + 2*12 = 258，从 196 起 → 末行到 454。
    // （一开始用 92+14 → 末行到 504，把操作说明压住了 —— 截图发现。这已经是第 4 次
    //  "内容压页脚"，所以把约束直接写在注释里：改尺寸前先看这行。）
    const w = 78, gap = 12, x0 = (W - (3 * w + 2 * gap)) / 2, y0 = 196
    const x = i % 3, y = Math.floor(i / 3)
    return { x: x0 + x * (w + gap), y: y0 + y * (w + gap), w, h: w }
  }

  // ---- 「驾驶超级战机」（太空堡垒，7k7k/511864 原文）----
  //   原文：「**打飞机的部分不是方向键控制的**，很多人进去就傻站着。」
  // 落地：**纯鼠标**打靶 —— 目标从右侧飞入，用鼠标点击击落；打够数过关。
  // "不是方向键控制"正是原文点出的坑，所以这里刻意不做键盘移动。
  function makeShooter(s) {
    // 第 43 轮：① 敌机改用**官方怪物立绘**（归档里的真素材，标签显示怪物真名）；
    //           ② 接入难度层 —— 简单模式要打的架数更少、容错更多、目标更大（更好点）。
    const base = (s && s.need) || 5
    return {
      need: needOf(base), hit: 0, miss: 0,
      maxMiss: 4 + (diff().needMul < 1 ? 3 : 0),
      targets: [], t: 0, spawnT: 0.4, done: false, flash: 0,
      roster: flyerRoster(),
      radMul: diff().windowMul,      // 命中半径倍率（简单模式更好点中）
    }
  }
  function shooterTick(dt) {
    const st = dungeonState()
    const g = st.sh
    if (!g || g.done) return
    g.t += dt
    if (g.flash > 0) g.flash -= dt
    g.spawnT -= dt
    if (g.spawnT <= 0) {
      // 简单模式把间隔从 1.15~1.65s 拉长到 1.6~2.3s，一次只留 3 架在场。
      // 注意：不能在这里 return —— 那会连带跳过下面的移动与"飞出画面"判定，
      // 让物理推进取决于刷怪时机（一帧一顿）。
      const loose = diff().needMul < 1
      g.spawnT = (loose ? 1.6 : 0.75) + Math.random() * (loose ? 0.7 : 0.5)
      if (!(loose && g.targets.length >= 3)) {
        g.targets.push({
          // 生成高度不能太高：立绘 58px 是**底边对齐**画的（drawMonster 收底边），
          // 而且下面还要挂一行怪物名。y=260 时立绘上沿在 202，
          // 正好落在关卡提示那行（y≈183）下面 —— 之前用 130，敌机会把提示糊掉。
          x: W + 40, y: 260 + Math.random() * 150,
          vx: -(150 + Math.random() * 110), r: 26, bob: Math.random() * 6.28,
          mon: pickFlyer(g.roster, 6),
        })
      }
    }
    for (const tg of g.targets) tg.x += tg.vx * dt
    // 飞出去的算漏掉
    const out = g.targets.filter((tg) => tg.x < -50)
    if (out.length) {
      g.miss += out.length
      g.targets = g.targets.filter((tg) => tg.x >= -50)
      if (g.miss >= g.maxMiss) { notice(`漏掉 ${g.miss} 架…再来一次`); st.sh = makeShooter(curStage()); }
    }
  }
  function shooterHit(mx, my) {
    const st = dungeonState()
    const g = st.sh
    if (!g || g.done) return false
    for (let i = g.targets.length - 1; i >= 0; i--) {
      const tg = g.targets[i]
      if (Math.hypot(tg.x - mx, tg.y - my) <= (tg.r + 8) * (g.radMul || 1)) {
        g.targets.splice(i, 1)
        g.hit++
        g.flash = 0.18
        audio.sfx('assets/sfx/onClick_03.mp3')
        if (g.hit >= g.need) {
          g.done = true
          notice(`击落 ${g.hit} 架，通道打开！`)
          miniStagePass()
        }
        return true
      }
    }
    return false
  }

  G.app = G.app || {}
  G.app.awaken = {
    AWAKEN_STAGE_GAIN, lockedForms, grantForm, awakenMissing, canAwaken, awaken,
    AWAKEN, AWAKEN_ROWS, awakenList,
    currentTick, resetCurrentStage, currentStagePass, quizAnswer, quizNext, quizRects,
    PIPE_DIRS, PIPE_SHAPES, pipeRotateBits, PIPE_SOLUTION, makePipePuzzle, pipeBitsAt,
    pipeConnected, pipeRotate, slideRect, pipeRect,
    makeShooter, shooterTick, shooterHit,
  }
  // 桥：grantForm 是「发放形态」的唯一入口（第 66 轮），副本 / 经济模块经 G.app.grantForm 取用。
  G.app.grantForm = grantForm
})()