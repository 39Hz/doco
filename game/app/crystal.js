/* 多克多比 · 应用层：晶石对战的**战斗模拟**（第 72 轮重构 · 批次 7 · ui 收尾）
   来源：原 `game/game.js` 的「晶石对战（第 57 轮）」里会读写存档 / 推进战斗的那部分（含原注释）。
   —— 这里只放**会读写存档 + 推进战斗状态**的逻辑（编成 / 消除结算 / 回合 / 心跳 / 点击落子）；
      纯绘制与坐标在同批次的 `game/ui/crystal.js`（只画不裁决，经 `G.app.crystal` 取要显示的状态）。
   官方规则逐字在 `game/tables/crystal.js` 的文件头。这里只做"把规则跑起来"。
   依赖：引擎 `window.DKDbb`（save / audio）+ 内容表 `window.DKDbbData`（D）
        + 同层 `G.app.dungeon`（dungeonState：晶石对战挂在副本状态机里）。
   只经 `G.app.crystal` 出口对外，`game.js` 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const { save, audio } = window.DKDbb
  const D = window.DKDbbData

  // 同层应用模块（惰性箭头：调用时才解析，故加载顺序无关）。
  const dungeonState = (...a) => G.app.dungeon.dungeonState(...a)

  // 一句话玩法：**三消攒能量 + 多比每回合自动出手 + 1 主将 & 4 副将的 5v5**。
  // 你消掉的晶石给**对应属性的多比**充能，能量满就放技能（技能伤害远高于普攻，
  // 所以"一次消太多"真的会秒人 —— 官方第 7 条原话）。
  function makeCrystal() {
    const cfg = D.CRYSTAL
    const lv = save.data.level || 1
    // 我方编成（official：1 主将 + 4 副将）：主将 = 当前变身的那只，副将 = 背包里接下来 4 只
    const ownedNames = (save.data.forms && save.data.forms.length) ? save.data.forms : [save.data.form]
    const owned = ownedNames.map((n) => D.FORMS.find((f) => f.name === n)).filter(Boolean)
    const lead = D.FORMS.find((f) => f.name === save.data.form) || owned[0] || D.FORMS[0]
    // 副将：**优先挑属性互不相同的**。
    // 【为什么】诊断脚本发现：新手背包里前几只大多是「无属性」，照着顺序取 4 只当副将，
    // 结果**5 只里 4 只无属性** → 棋盘上只有 1 种晶石对我方有用 → 三消攒不出能量 →
    // 官方那条「能量积累到一定程度就可以发放相关技能」形同不存在（实测整局"放技能" 0 次）。
    const rest = []
    const poolAll = owned.filter((f) => f !== lead)
    for (const f of poolAll) {                       // 先按属性去重
      if (rest.length >= cfg.teamSize - 1) break
      if (!rest.some((g) => g.element === f.element)) rest.push(f)
    }
    for (const f of poolAll) {                       // 不够再按原顺序补
      if (rest.length >= cfg.teamSize - 1) break
      if (!rest.includes(f)) rest.push(f)
    }
    while (rest.length < cfg.teamSize - 1) {
      const cand = D.FORMS.find((f) => f !== lead && !rest.includes(f))
      if (!cand) break
      rest.push(cand)
    }
    const mkSide = (forms, side) => forms.slice(0, cfg.teamSize).map((f, i) => {
      // ⚠️ 属性在 `f.stats` 里，**不是平铺的**（`f.atk` 永远是 undefined）。
      //    第一版就是照着 `f.atk` 取的 → 每只的 pow 都落到下限，
      //    双方伤害完全一样，打起来毫无差别（诊断脚本抓到的）。
      const st = f.stats || {}
      const maxHp = Math.round((st.life || 300) * (1 + lv * 0.08))
      const pow = Math.max(8, Math.round((st.atk || 20) + (st.matk || 0) * 0.5))
      return {
        side, idx: i, name: f.name, element: f.element, form: f,
        role: i === 0 ? 'lead' : 'sub',            // official：主将 / 副将
        hp: maxHp, maxHp,
        pow,                                       // 出手威力（× 系数就是伤害）
        energy: 0,                                 // 该属性攒到的晶石能量
        flash: 0,          // 受击闪白
        actAt: 0,          // 下次自动出手的时刻（official：「每回合多比都会自动向对方攻击」）
      }
    })
    const mine = mkSide([lead].concat(rest), 'mine')
    // 对手：离线版没有真人（derived）。**但必须势均力敌** ——
    // 原版是跨服匹配，随机抓几只高级形态来打低级玩家不是"匹配"而是"碾压"：
    // 第一版就是随机抽，可能抽到「赤色多比」（life 803 / atk 164），而玩家的 5 只
    // 是背包里最前面的（克罗这种 life 257 / atk 32）→ 必输。
    // 规则：按**总战力**排序，从我方队伍平均战力 ±25% 的区间里挑，属性尽量分散。
    const strengthOf = (f) => {
      const s = f.stats || {}
      return (s.life || 0) + (s.atk || 0) + (s.def || 0) + (s.matk || 0) + (s.mdef || 0)
    }
    const mineAvg = [lead].concat(rest).reduce((a, f) => a + strengthOf(f), 0) / Math.max(1, [lead].concat(rest).length)
    // 对手：**逐位按血量找最接近的**（比"整队战力接近"靠谱得多 ——
    // 战力是个加权和，两队战力相同也可能一边 7400 血一边 13300 血，实测就是这样）。
    // 无属性形态也算候选：玩家的队伍里本来就可能有无属性。
    const all = D.FORMS.filter((f) => f.stats && f.stats.life > 0)
    const used = new Set()
    const foePick = []
    const mineList = [lead].concat(rest)
    for (let i = 0; i < cfg.teamSize; i++) {
      const want = (mineList[i] && mineList[i].stats && mineList[i].stats.life) || 300
      // 同属性优先（棋盘上每种晶石对双方都有用），其次按血量最接近。
      // **在"最接近的几只"里随机挑**，而不是死取最近那一只 ——
      // 否则双方阵容一模一样（镜像局），打赢了也没意思。
      const cands = []
      for (const f of all) {
        if (used.has(f.name)) continue
        const life = f.stats.life
        let score = Math.abs(life - want) / Math.max(1, want)
        if (mineList[i] && f.element === mineList[i].element) score -= 0.15
        cands.push({ f, score })
      }
      cands.sort((a, b) => a.score - b.score)
      const pick = cands.slice(0, 3)[Math.floor(Math.random() * Math.min(3, cands.length))]
      const best = pick && pick.f
      if (best) { used.add(best.name); foePick.push(best) }
    }
    const foe = mkSide(foePick, 'foe')

    // 棋盘上的晶石种类 = **双方出战多比的属性 + 红心**（official 第 4/5 条）。
    // 我方属性的晶石给我方充能；对方属性的晶石在棋盘上但**对我方没有作用** ——
    // 这正是原文「只有符合自己出战多比属性和恢复晶石才会有作用」的读法。
    const kinds = D.crystalKinds(mine.map((u) => u.form), foe.map((u) => u.form), 6)
    const grid = D.crystalBoard.make(cfg.cols, cfg.rows, kinds)
    return {
      cfg, kinds, grid, mine, foe,
      sel: null,                 // 选中的格子 {x,y}
      turn: 1,                   // 回合数
      t: 0,                      // 本回合已过时间
      log: [],                   // 战斗播报（最近几条）
      over: false, win: false,
      floaters: [],              // 飘字
      combo: 0,
    }
  }

  // 一次消除结算：给对应属性的多比充能；红心晶石回血（official 第 4/5 条）
  function crystalResolve(g, cleared) {
    if (!cleared.length) return
    const byKind = {}
    for (const k of cleared) byKind[k] = (byKind[k] || 0) + 1
    const cfg = g.cfg
    // 连击：一次消得越多，加成越高（official 第 7 条"一次消除的晶石数量过多"会被秒）
    const comboMul = 1 + Math.max(0, cleared.length - 3) * cfg.comboMul
    for (const [kStr, n] of Object.entries(byKind)) {
      const kind = g.kinds[Number(kStr)]
      if (!kind) continue
      const gain = Math.round(n * cfg.energyPerCrystal * comboMul)
      if (kind.kind === 'heal') {
        // 红心：给**血量最低的存活多比**加血
        const alive = g.mine.filter((u) => u.hp > 0)
        if (alive.length) {
          const tgt = alive.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b))
          const heal = Math.round(n * cfg.heartHeal * comboMul)
          tgt.hp = Math.min(tgt.maxHp, tgt.hp + heal)
          g.floaters.push({ side: 'mine', idx: tgt.idx, text: `+${heal}`, color: '#7dffa8' })
          g.log.push(`红心晶石 ×${n} → ${tgt.name} 回血 ${heal}`)
        }
      } else {
        // 属性晶石：充能给**该属性的多比**（可能有多只，平摊）
        const same = g.mine.filter((u) => u.hp > 0 && u.element === kind.id)
        if (same.length) {
          for (const u of same) u.energy = Math.min(cfg.skillAt, u.energy + Math.round(gain / same.length))
          g.log.push(`${kind.name} ×${n} → ${kind.id}属性多比充能 +${gain}`)
        }
      }
    }
    if (cleared.length >= 4) g.log.push(`一次消掉 ${cleared.length} 颗（连击 ×${comboMul.toFixed(2)}）`)
    while (g.log.length > 40) g.log.shift()
  }

  // 一个回合：双方**自动出手**（official：「每回合多比都会自动向对方攻击」）；
  // 能量满的多比改放技能（official：「多比属性能量积累到一定程度就可以发放相关技能」）
  function crystalTurn(g) {
    const cfg = g.cfg
    // 对手也在操作它自己面前的晶石板 —— **原文没写**，这里是 derived。
    // 【为什么必须有】官方只说"小多克需要操作晶石板积攒能量"，没写 AI 怎么攒。
    // 但如果对手完全不攒能量，那条「能量积累到一定程度就可以发放相关技能」
    // 就只有玩家一侧会触发（实测整局 0 次技能），机制等于**半死**。
    for (const u of g.foe) {
      if (u.hp > 0) u.energy = Math.min(cfg.skillAt, u.energy + Math.round(cfg.foeEnergyPerTurn))
    }
    for (const side of ['mine', 'foe']) {
      const atk = g[side], def = g[side === 'mine' ? 'foe' : 'mine']
      for (const u of atk) {
        if (u.hp <= 0) continue
        const targets = def.filter((d) => d.hp > 0)
        if (!targets.length) break
        // 打**血量最低**的那只（"集火"最直观，也让"能量满放技能"更容易看出效果）
        const tgt = targets.reduce((a, b) => (a.hp <= b.hp ? a : b))
        const isSkill = u.energy >= cfg.skillAt
        const mul = isSkill ? cfg.skillDmgMul : cfg.autoDmgMul
        let dmg = Math.round((u.pow + cfg.atkBase) * mul)
        // 主将技比副将技强（official 把"主将技/副将技"当成两种东西）
        if (isSkill && u.role === 'lead') dmg = Math.round(dmg * 1.35)
        dmg = Math.max(1, dmg)
        tgt.hp = Math.max(0, tgt.hp - dmg)
        tgt.flash = 0.45
        if (isSkill) u.energy = 0
        const who = side === 'mine' ? '我方' : '对方'
        g.log.push(`${who}${u.role === 'lead' ? '主将' : '副将'}${u.name}${isSkill ? '放技能' : '攻击'} → ${tgt.name} -${dmg}`)
        g.floaters.push({
          side: side === 'mine' ? 'foe' : 'mine', idx: tgt.idx,
          text: `-${dmg}`, color: isSkill ? '#ffd23f' : '#ff9e9e',
        })
      }
    }
    while (g.log.length > 40) g.log.shift()
    g.turn++
    // 胜负（official：「击败对方全部 5 个多比，战斗胜利」）
    //
    // ⚠️ 判据**只按官方那一句**：对方 5 只全灭 → 胜利。
    //    第 58 轮改回来过：V77 那版"先判我方"是我**被自己的测试误导**改的 ——
    //    当时那个用例复用了"对方已经全灭"的局面，于是"先判对方 = 误报胜利"，
    //    其实那是**正确**判定，是测试摆错了局面。
    //    而这个错误规则的实际后果很严重：双方伤害对称时，最后一回合必然同归于尽，
    //    于是**玩家永远赢不了**（副本通关体检直接把晶石对战报成打不通）。
    if (g.foe.every((u) => u.hp <= 0)) { g.over = true; g.win = true }
    else if (g.mine.every((u) => u.hp <= 0)) { g.over = true; g.win = false }
  }

  function crystalTick(dt) {
    const st = dungeonState()
    if (!st || !st.cr || st.phase !== 'crystal') return
    const g = st.cr
    if (g.over) return
    g.t += dt
    for (const f of g.floaters) f.life = (f.life === undefined ? 0.9 : f.life) - dt
    g.floaters = g.floaters.filter((f) => f.life > 0)
    for (const u of g.mine.concat(g.foe)) if (u.flash > 0) u.flash -= dt
    if (g.t >= g.cfg.turnSec) { g.t = 0; crystalTurn(g) }
  }

  function makeCrystalLegacy() { /* 占位：避免误用 */ return null }

  // 点格子：第一次选中，第二次跟相邻格交换（不相邻/换了不成三连 → 不算，取消选中）
  function crystalClick(cx, cy) {
    const st = dungeonState()
    const g = st && st.cr
    if (!g || g.over) return false
    if (!g.sel) {
      g.sel = { x: cx, y: cy }
      audio.sfx('assets/sfx/onMouseOver_03.mp3')
      return false
    }
    const a = g.sel
    if (a.x === cx && a.y === cy) { g.sel = null; return false }
    const ok = D.crystalBoard.trySwap(g.grid, g.cfg.cols, g.cfg.rows, a.x, a.y, cx, cy)
    g.sel = null
    if (!ok) { g.log.push('这两个格子换不成三连'); return false }
    audio.sfx('assets/sfx/onClick_03.mp3')
    // 消到没有三连为止（消除 → 下落 → 补新 → 可能又连上）
    let guard = 0
    while (guard++ < 30) {
      const m = D.crystalBoard.matches(g.grid, g.cfg.cols, g.cfg.rows)
      if (!m.size) break
      const r = D.crystalBoard.settle(g.grid, g.cfg.cols, g.cfg.rows, g.kinds)
      crystalResolve(g, r.cleared)
    }
    return true
  }

  // 只读桥：界面层（ui/crystal.js）不许直接读副本状态，经这里取当前晶石对战局面。
  function current() {
    const st = dungeonState()
    return st && st.cr ? st.cr : null
  }

  G.app = G.app || {}
  G.app.crystal = { makeCrystal, crystalResolve, crystalTurn, crystalTick, crystalClick, current }
})()