/* 领域层 · 出手顺序（纯逻辑，零 I/O）—— 第 72 轮重构批次 2。
 *
 * 官方《多克多比属性介绍》原文：「速度：这个直接影响多比是否能够**快速进入回合**的数值」。
 * 改之前是固定"玩家先手，然后所有敌人各打一次"，速度只拿来做伤害浮动 —— 与官方不符。
 * 现在每回合按速度从高到低排出行动序列，轮到谁谁动：
 *   · 比玩家快的敌人会**先于玩家**出手（这才是"快速进入回合"）；
 *   · 同速时玩家优先（同速若随机，同一套配置会出现"这场先手、下场后手"，玩家不可预期）。
 *
 * 本文件只回答"谁先谁后"：输入是**应用层按当前战斗状态拼好的槽位列表**
 * （每槽形如 `{ side: 'player' | 'pet' | 'enemy', spd, ... }`）。
 * 本函数**不读** S / save / 画布 —— "怎么拼槽位"（谁是玩家、索亚挂哪、取哪几只敌人）
 * 留在 app 层（game.js 的 buildTurnOrder）。
 */
(() => {
  'use strict'
  const G = (window.DKDbbGame = window.DKDbbGame || {})

  // 速度降序；同速时 player 槽排最前。
  // 返回**新数组**（不改调用者的 list），语义与旧实现一致（旧实现直接 sort 并返回同一个 list）。
  function orderBySpeed(slots) {
    return slots.slice().sort((a, c) => (c.spd - a.spd) || (a.side === 'player' ? -1 : c.side === 'player' ? 1 : 0))
  }

  G.domain = G.domain || {}
  Object.assign(G.domain, { orderBySpeed })
})()