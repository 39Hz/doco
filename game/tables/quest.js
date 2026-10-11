/* 多克多比 · 任务与剧情系统
   数据来源：assets/quests.json（由 _tools/gen-quests.mjs 从原版任务策划表抽出）
   117 个任务 / 619 个步骤 / 1326 句台词 */
(() => {
  'use strict'
  const Q = window.DKDbbQuest = {}

  Q.all = []
  Q.byTitle = new Map()

  Q.load = function (data) {
    Q.all = (data && data.quests) || []
    Q.byTitle = new Map(Q.all.map((q) => [q.title, q]))
    return Q.all.length
  }

  // 主线按顺序推进；支线/热点按已解锁情况随机可接
  Q.main = () => Q.all.filter((q) => q.type === 'main')
  Q.side = () => Q.all.filter((q) => q.type === 'side')
  Q.event = () => Q.all.filter((q) => q.type === 'event')

  // 根据存档进度取当前该做的主线
  Q.currentMain = function (save) {
    const list = Q.main()
    const done = save.questsDone || []
    for (const q of list) if (!done.includes(q.id)) return q
    return null
  }

  // 从一条台词里剥掉尾部夹带的舞台提示，返回 {text, stage}
  Q.splitStage = function (text) {
    const stages = []
    let t = text
    const patterns = [
      /播放动画[（(]?([^）)。]*)[）)]?/g,
      /进入副本/g, /副本获得[^\s，。]*/g, /副本通过获得[^\s，。]*/g,
      /开通[^\s，。]*权限/g, /开启[^\s，。]*权限/g,
      /获得[^\s，。]*技能书/g, /获得[^\s，。]*圣器/g,
      /得到奖励[：:][^\s]*/g, /完成任务！/g,
    ]
    for (const re of patterns) {
      t = t.replace(re, (m) => { stages.push(m); return '' })
    }
    return { text: t.replace(/\s+/g, ' ').trim(), stage: stages.join('　') }
  }

  // 把一步展开成游戏可逐步播放的「演出序列」
  // 返回 [{type:'line'|'choice'|'stage'|'end', who, text, options?, stage?}]
  Q.expand = function (step) {
    const seq = []
    if (step.kind === 'end') {
      seq.push({ type: 'stage', text: step.text })
      seq.push({ type: 'end' })
      return seq
    }
    if (step.show) seq.push({ type: 'stage', text: '（' + step.show + '）' })
    for (const l of step.lines) {
      if (l.kind === 'choice') {
        const { text, stage } = Q.splitStage(l.text)
        seq.push({ type: 'choice', text, stage })
      } else {
        const { text, stage } = Q.splitStage(l.text)
        seq.push({ type: 'line', who: l.who, text })
        if (stage) seq.push({ type: 'stage', text: stage })
      }
    }
    // 该步骤的 meta 提示
    const m = step.meta || {}
    if (m.dungeon) seq.push({ type: 'stage', text: `副本 ${m.dungeon} 已解锁` })
    if (m.rewards && m.rewards.length) seq.push({ type: 'stage', text: '奖励：' + m.rewards.join('　') })
    return seq
  }

  // 说话人显示名
  Q.displayName = function (who, playerName) {
    if (who === '@player') return playerName || '多比'
    return who
  }
})()
