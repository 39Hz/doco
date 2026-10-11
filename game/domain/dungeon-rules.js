/* 领域层 · 副本规则（纯逻辑，零 I/O）—— 第 72 轮重构批次 2。
 *
 * 只放**纯数据与纯判定**里真正零 I/O 的部分。目前是「士气对抗」的 3×3 收益表：
 * 双方各出一招，交叉查表得"我方 +dm / 对方 +df"，先到 100 者胜。
 *
 * ★ 为什么「无所遁形」的隐蔽几何没迁进来 ★
 *   stealthTick / stealthSpotted / stealthAdvance 都要先 `dungeonState()`（读运行时 S），
 *   再叠音效 / 提示 / 过关节拍；把它们硬迁进 domain 会让 domain 反向依赖 app（更糟）。
 *   那份几何判定暂时留在 game.js，等 app/dungeon.js 拆出来时再一并归位。
 */
(() => {
  'use strict'
  const G = (window.DKDbbGame = window.DKDbbGame || {})

  // ---- 「士气对抗」：双方士气先到 100 者胜 ----
  // 3×3 收益表（derived：原文只说"有两个数值"，没说规则，见 deviations V37）
  const MORALE_MOVES = ['进攻', '防守', '鼓舞']
  const MORALE_TABLE = [
    [[8, 8], [4, 2], [14, 6]],
    [[2, 4], [6, 6], [8, 10]],
    [[6, 14], [10, 8], [9, 9]],
  ]

  G.domain = G.domain || {}
  G.domain.dungeonRules = { MORALE_MOVES, MORALE_TABLE }
})()