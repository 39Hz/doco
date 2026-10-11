// 晶石对战 —— 官方规则与落地数值（第 57 轮）
//
// 【为什么单独一个文件】这是**最后一个"规则已查明、实现与原文不符"的副本**。
// 第 47 轮就把原文挖出来了，但一直没做：现有实现是一关普通 `boss`（"打一场架"），
// 而原文说的是**三消攒能量 + 多比自动出手 + 5v5**。
//
// ══════════════ 官方原文（逐字，7k7k/563849 副本攻略 + 545865） ══════════════
// 【入口】1「晶石对战的入口在**新场景万象小屋的皮格万**处进入」
// 【编成】2「每个多比都有**主将技和副将技**！**主将只能有一个多比，副将可以有四个多比**。」
// 【核心玩法】3「**每回合多比都会自动向对方攻击**！而小多克需要操作自己面前的
//        **晶石板来积攒晶石能量**打击对方！」
// 【晶石种类】4「**红心晶石：恢复能力晶石可以进行加血**！其他晶石：**每种属性都有自己的晶石**！」
// 【什么晶石有用】5「**只有符合自己出战多比属性和恢复晶石才会有作用**，
//        **多比属性能量积累到一定程度就可以发放相关技能**」
// 【胜负】6「**击败对方全部 5 个多比，战斗胜利**！」
// 【为什么会被秒】7「有的小多克一回合就被秒杀……因为对手的运气太好，
//        **一次性消除的晶石数量过多**导致」
//
// ══════════════ 落地：哪些是官方、哪些是推算 ══════════════
//   official：三消攒能量 · 多比每回合自动攻击 · 1 主将 + 4 副将 = 5v5 · 红心晶石回血 ·
//             每种属性有自己的晶石 · 只有"自己出战多比的属性 + 红心"才有作用 ·
//             能量攒够就放技能 · 击败对方全部 5 只获胜 · 一次消太多会被秒
//   derived ：棋盘的**尺寸与晶石种类数**（官方没给；原文说"每种属性都有自己的晶石"，
//             但 8 种元素同屏根本连不成线 → 按第 5 条只放**你出战多比的元素 + 红心**，最多 6 种）
//             · 能量阈值/伤害/回血的具体数字 · 自动攻击的间隔 · 消除得分与连击的换算
;(function () {
  const D = window.DKDbbData || (window.DKDbbData = {})

  const SRC = {
    entry: '7k7k/563849',
    rule: '7k7k/563849 · 545865',
  }

  D.CRYSTAL = {
    name: '晶石对战',
    entry: { npc: '皮格万', where: '万象小屋', evidence: SRC.entry, conf: 'official' },

    // 棋盘（derived）。8×5 的格子 + 缩小到 40px —— 960×560 里要同时放下
    // 「上方对手 5 张卡 + 棋盘 + 下方我方 5 张卡」，46px×6 行会把下方卡片压住（截图核对时抓到的）。
    cols: 8, rows: 5, cell: 40, gap: 3,

    // 出战编成（official：1 主将 + 4 副将）
    teamSize: 5,

    // 能量与数值（derived）
    energyPerCrystal: 10,     // 每消掉一颗晶石积多少能量
    skillAt: 100,             // 能量攒到这个数就放一次技能（放完清零）
    heartHeal: 8,             // 每颗红心晶石回多少血（给自己血量最低的那只）
    comboMul: 0.25,           // 每多一档连击，本次消除的能量/伤害加成

    // 「每回合多比都会自动向对方攻击」——落地成按时间推进的回合
    turnSec: 2.6,             // 一个回合的间隔（秒）
    autoDmgMul: 1.0,          // 自动攻击的伤害系数（× 威力）
    skillDmgMul: 2.6,         // 技能伤害系数（× 威力）—— 比自动攻击重得多，
                              // 这样"一次消太多 → 能量暴涨 → 技能连发"才真的会秒人（官方第 7 条）
    atkBase: 10,              // 伤害基数，避免低威力时打出 0
    foeEnergyPerTurn: 14,     // 对手每回合攒多少能量（derived：官方只写了玩家攒能量，
                              // 但对手完全不攒的话"放技能"就永远只有玩家一侧会发生）

    evidence: SRC,
    note: '玩法/编成/胜负/红心/属性对应 = official；棋盘尺寸、晶石种类数、能量与伤害数值、回合间隔 = derived（V76）',
  }

  // 出战的双方都参与：**我方**的属性晶石有用；对方的属性晶石在棋盘上但**对我方无效**
  //（这正是原文第 5 条的意思：「只有符合自己出战多比属性和恢复晶石**才会有作用**」
  //  —— 反过来说，不符合的那些**也在棋盘上**，只是没作用）。
  // 只放我方属性的第一版有个实际毛病：新手只有 1 种属性 → 棋盘只有 2 种晶石，
  // 三消几乎必然连成，玩起来没有挑战。
  D.crystalKinds = function (mineForms, foeForms, maxKinds) {
    const cap = maxKinds || 6
    const counts = {}
    const order = []
    for (const arr of [mineForms || [], foeForms || []]) {
      for (const f of arr) {
        const e = f && f.element
        if (!e || e === '无') continue      // 无属性多比没有对应的属性晶石
        if (!order.includes(e)) order.push(e)
        counts[e] = (counts[e] || 0) + 1
      }
    }
    order.sort((a, b) => (counts[b] || 0) - (counts[a] || 0))
    const elems = order.slice(0, Math.max(1, cap - 1))
    // 种类**下限 4**（含红心）。为什么需要：新手背包里可能只有 1 种属性 →
    // 棋盘只有 2 种晶石 → 三消几乎必然连成，玩起来没有难度。
    // 补进来的那些晶石对我方**没有作用** —— 这不违背原文，恰恰是原文第 5 条的读法：
    // 「只有符合自己出战多比属性和恢复晶石**才会有作用**」（别的也在棋盘上，只是没用）。
    const ALL = (D.ELEMENTS || []).filter((e) => e !== '无')
    for (const e of ALL) {
      if (elems.length >= Math.max(3, cap - 1)) break
      if (!elems.includes(e)) elems.push(e)
    }
    const kinds = elems.map((e) => ({
      id: e, kind: 'elem', name: `${e}晶石`,
      color: (D.ELEMENT_COLOR && D.ELEMENT_COLOR[e]) || '#cfd6e4',
    }))
    // 红心晶石（official 第 4 条）永远在
    kinds.push({ id: 'heal', kind: 'heal', name: '红心晶石', color: '#ff5c8a' })
    return kinds
  }

  // ---- 棋盘逻辑（纯函数，方便单测）----
  D.crystalBoard = {
    // 造一个**开局就没有三连**的棋盘
    make(cols, rows, kinds, rnd) {
      const R = rnd || Math.random
      const g = []
      for (let y = 0; y < rows; y++) {
        g.push([])
        for (let x = 0; x < cols; x++) {
          let k, guard = 0
          do {
            k = Math.floor(R() * kinds.length)
            guard++
          } while (guard < 40 && (
            (x >= 2 && g[y][x - 1] === k && g[y][x - 2] === k) ||
            (y >= 2 && g[y - 1][x] === k && g[y - 2][x] === k)
          ))
          g[y].push(k)
        }
      }
      return g
    },
    // 找出所有三连及以上的位置（返回 Set of "x,y"）
    matches(g, cols, rows) {
      const out = new Set()
      for (let y = 0; y < rows; y++) {
        let run = 1
        for (let x = 1; x <= cols; x++) {
          const same = x < cols && g[y][x] !== -1 && g[y][x] === g[y][x - 1]
          if (same) run++
          else {
            if (run >= 3) for (let k = x - run; k < x; k++) out.add(`${k},${y}`)
            run = 1
          }
        }
      }
      for (let x = 0; x < cols; x++) {
        let run = 1
        for (let y = 1; y <= rows; y++) {
          const same = y < rows && g[y][x] !== -1 && g[y][x] === g[y - 1][x]
          if (same) run++
          else {
            if (run >= 3) for (let k = y - run; k < y; k++) out.add(`${x},${k}`)
            run = 1
          }
        }
      }
      return out
    },
    // 消除 + 下落 + 顶部补新。返回 { cleared: [kindIndex...], grid }
    settle(g, cols, rows, kinds, rnd) {
      const R = rnd || Math.random
      const cleared = []
      for (const key of D.crystalBoard.matches(g, cols, rows)) {
        const [x, y] = key.split(',').map(Number)
        cleared.push(g[y][x])
        g[y][x] = -1
      }
      for (let x = 0; x < cols; x++) {
        let write = rows - 1
        for (let y = rows - 1; y >= 0; y--) {
          if (g[y][x] !== -1) { g[write][x] = g[y][x]; write-- }
        }
        for (let y = write; y >= 0; y--) g[y][x] = Math.floor(R() * kinds.length)
      }
      return { cleared, grid: g }
    },
    // 交换两个相邻格；不合法（不相邻 / 换了没三连）返回 false
    trySwap(g, cols, rows, ax, ay, bx, by) {
      if (Math.abs(ax - bx) + Math.abs(ay - by) !== 1) return false
      const t = g[ay][ax]; g[ay][ax] = g[by][bx]; g[by][bx] = t
      if (D.crystalBoard.matches(g, cols, rows).size === 0) {
        const t2 = g[ay][ax]; g[ay][ax] = g[by][bx]; g[by][bx] = t2
        return false
      }
      return true
    },
  }
})()
