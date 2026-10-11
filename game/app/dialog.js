/* 多克多比 · 应用层：对话推进（第 72 轮重构批次 5）
   来源：原 game.js 第 911–967 行，内容一致（含原注释）。
   依赖：内核 G.core 的共享状态 S 与 toast 原语；任务表 window.DKDbbQuest（只读，Q.expand）；
   引擎 window.DKDbb 的 save。任务奖励里的经验经 G.app.player.grantExp 惰性解析
   （player 已迁出，直接指向最终模块路径）。
   只经 G.app.dialog 出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'

  const G = window.DKDbbGame
  const { S } = G.core
  const Q = window.DKDbbQuest
  const { save } = window.DKDbb

  // 共享提示原语与经验发放都经 G.app / G.core 惰性解析（调用时才取，顺序无关）。
  const toast = G.core.toast
  const grantExp = (...a) => G.app.player.grantExp(...a)

  // ==================== 对话 ====================
  function say(lines, onEnd) {
    S.dialog = { lines: Array.isArray(lines) ? lines : [{ who: '旁白', text: String(lines) }], i: 0, onEnd, t: 0, choice: null }
    S.mode = 'dialog'
  }

  // 任务演出：把 expand 出来的序列逐步播放
  function playQuest(q, onEnd) {
    const seq = []
    for (const step of q.steps) {
      for (const item of Q.expand(step)) seq.push(item)
    }
    S.dialog = { lines: seq, i: 0, onEnd, t: 0, quest: q, choice: null }
    S.mode = 'dialog'
  }

  function advanceDialog() {
    const d = S.dialog
    if (!d) return
    const cur = d.lines[d.i]
    // 选项步骤：绘制时会把「从 i 开始连续的 choice」整组当成候选列表。
    // 如果用户没按数字键（比如直接按空格、或者连按空格撞到这里），
    // 默认选第一项并把整组跳过 —— 否则会卡死在这一步（实测就是这个 bug）。
    if (cur && cur.type === 'choice') {
      if (d.choice === null) d.choice = 0
      let n = 0
      for (let k = d.i; k < d.lines.length && d.lines[k].type === 'choice'; k++) n++
      d.i += Math.max(1, n)
      d.t = 0
      d.choice = null
      if (d.i >= d.lines.length) return finishDialog(d)
      return
    }
    d.choice = null
    d.i++
    d.t = 0
    if (d.i >= d.lines.length) return finishDialog(d)
  }

  // 对话结束：结算任务奖励、执行回调、回到场景
  function finishDialog(d) {
    const cb = d.onEnd
    const q = d.quest
    S.dialog = null
    S.mode = 'explore'
    if (q) {
      if (!save.data.questsDone.includes(q.id)) {
        save.data.questsDone.push(q.id)
        const reward = 20 + q.steps.length * 8
        save.data.gold += reward
        grantExp(reward * 2)
        toast(`完成「${q.title}」　+${reward * 2} 经验　+${reward} 金币`, 3000)
      }
      save.persist()
    }
    if (cb) cb()
  }

  G.app = G.app || {}
  G.app.dialog = { say, playQuest, advanceDialog, finishDialog }
})()