/* 领域层 · 结印技（纯逻辑，零 I/O）—— 第 72 轮重构批次 2。
 *
 * 官方《结印技能特点》原文要点：
 *   · 结印技**不消耗魔法能量**，但**威力远远超出普通技能**
 *   · 每次释放需要消耗 SP；攻击怪物或被打都会积攒 SP，槽满得 1 点，**最多 3 点**
 *   · 攒到 SP 之后结印技图标才会变亮
 *   · 「多克多比首创结印式释放」：出现结印操作，玩家在**规定时间内**按**上下左右**，
 *     **成功结印越多威力越大**
 *
 * 本文件只放**规则与算法**（上限 / 步数 / 每步限时 / 倍率曲线）—— 纯数字进、纯数字出。
 * 真正"读 S、放音效、弹提示"的编排（gainSp / startSeal / sealAdvance / finishSeal）
 * 仍留在 game.js（应用层）—— 那里要拿战斗状态与演出。
 * 方向键映射 SEAL_ARROWS 与箭头显示字 SEAL_LABEL 属输入/界面，也留在 game.js。
 */
(() => {
  'use strict'
  const G = (window.DKDbbGame = window.DKDbbGame || {})

  const SEAL_MAX_SP = 3         // 官方上限：SP 最多 3 点
  const SEAL_STEPS = 5          // 一次结印要按几下（derived 调参）
  const SEAL_STEP_DUR = 1.15    // 每下的限时（秒，derived 调参）

  // 结印结算：成功越多威力越大。官方只说"成功结印越多威力越大"，
  // 具体倍率官方没给，这里取「全失误 0.55 倍 ~ 全成功 1.60 倍」。
  function sealMultiplier(seal) {
    const n = seal.seq.length || 1
    const rate = seal.hits / n
    return 0.55 + rate * 1.05
  }

  G.domain = G.domain || {}
  G.domain.seal = { SEAL_MAX_SP, SEAL_STEPS, SEAL_STEP_DUR, sealMultiplier }
})()