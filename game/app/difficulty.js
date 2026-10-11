/* 多克多比 · 应用层：难度档位（第 72 轮重构 · 批次 9 · 常量与工具）
   来源：原 game/game.js 的「难度」整段（DIFFS / diff / needOf / winOf / setDifficulty / toggleDifficulty）。
   依赖：引擎存档 window.DKDbb.save（读 / 写 difficulty）+ 内核 G.core（toast）。
   消费方（app/awaken.js、app/battle.js、app/minigames.js、ui/title.js）经 G.app.difficulty.* 惰性取用；
   game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const save = window.DKDbb.save
  const { toast } = G.core

  // ==================== 难度 ====================
  // 【第 43 轮，按用户反馈加】用户实测觉得太难并要求"调整至简单模式"。
  // 注意：本项目**所有战斗数值本来就是 derived**（原版系数只存在服务端，见 B5/D6），
  // 所以调难度不涉及"篡改官方数值" —— 但要如实登记，并让玩家看得见当前是哪个模式。
  // 设计：默认 easy（用户要求），可在游戏里用 M 键切到 normal。
  const DIFFS = {
    easy: {
      id: 'easy', name: '简单',
      atkMul: 1.5,        // 我方打出的伤害
      defMul: 0.5,        // 我方受到的伤害
      hitBonus: 0.06,     // 我方命中率加成
      needMul: 0.6,       // 小游戏过关要求（越小越少）
      windowMul: 1.5,     // 小游戏判定窗口
      addFoeChance: 0.10, // 一场战斗里带小弟的概率（原版是"偶尔有"，这里是难度杠杆）
      note: '我方伤害 ×1.5 · 受到伤害 ×0.5 · 命中 +6% · 小游戏过关要求 ×0.6 · 判定窗口 ×1.5',
    },
    normal: {
      id: 'normal', name: '普通',
      atkMul: 1, defMul: 1, hitBonus: 0, needMul: 1, windowMul: 1, addFoeChance: 0.30,
      note: '本项目的推算原值（没有任何加成或减免）',
    },
  }
  function diff() { return DIFFS[(save.data && save.data.difficulty) || 'easy'] || DIFFS.easy }
  // 小游戏"要完成多少个"按难度缩放（下限 2，免得简单模式变得没得玩）
  function needOf(base) { return Math.max(2, Math.round(base * diff().needMul)) }
  function winOf(base) { return base * diff().windowMul }
  // 第 43 轮：游戏里可以随时切难度（N 键）。原版没有这个开关 —— 原版的战斗系数在服务器上（D6/B5），
  // 我们只能推算，所以给玩家一个明说的档位选择，而不是偷偷把数值调软。
  function setDifficulty(id) {
    if (!DIFFS[id]) return false
    save.data.difficulty = id
    save.persist()
    return true
  }
  function toggleDifficulty() {
    const next = diff().id === 'easy' ? 'normal' : 'easy'
    setDifficulty(next)
    const d = diff()
    toast(`难度切换为「${d.name}」：${d.note}`, 3200)
    return d.id
  }

  G.app = G.app || {}
  G.app.difficulty = { DIFFS, diff, needOf, winOf, setDifficulty, toggleDifficulty }
})()
