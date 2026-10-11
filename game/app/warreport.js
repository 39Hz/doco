/* 多克多比 · 应用层：战报任务（第 72 轮重构 · 批次 4）
   来源：原 `game/game.js` 第 2155–2262 行，内容一致（含官方依据注释）。
   依赖：引擎 `window.DKDbb`（save / audio）+ 内容表 `window.DKDbbData`（D）
        + 内核 `G.core`（S / toast）
        + 跨应用层：`G.app.scene.sceneLabel`、`G.app.player.grantExp`（均批次 5 已迁出）。
   只经 `G.app.warreport` 出口对外，`game.js` 用「解构 shim」取用（调用点一处不改）。

   ⚠️ 保留原样：`WAR_ISLAND_SOYA_CHANCE` 在原实现里就没有声明（既有问题，只报告、不改），
   本批次是纯结构迁移，行为必须完全等价，故照原样迁来、不做"顺手修"。 */
(() => {
  'use strict'

  const G = window.DKDbbGame
  const { S } = G.core
  const { save, audio } = window.DKDbb
  const D = window.DKDbbData
  const { toast } = G.core
  // 跨应用层模块的调用：场景 / 玩家用例均批次 5 已迁出，直接走最终路径。
  const sceneLabel = (id) => G.app.scene.sceneLabel(id)
  const grantExp = (n) => G.app.player.grantExp(n)

  // ==================== 战报任务（M4 周边系统，有官方原文依据）====================
  //
  // 官方依据（7k7k/179097《多克多比战报任务》+ 178665 原文）：
  //   · 「点击游戏上方的『战报』按钮，即可挑战冒险者试炼。试炼从乌卡前哨战开始，
  //     每张练级地图都有相应的战斗任务，战报中详细介绍了完成任务的条件和奖励，
  //     首次完成这些任务全部可以重复领取和完成，小多克们可以反复完成相关任务得到多次奖励。」
  //   · 「在战报系统中还有多条战斗线路，小多克可以一步一步解锁战斗路线，
  //     完成比较困难的战斗线路也许可以得到稀有多比和神秘奖励呦！」
  //
  // 我们按原文落地，**自定的部分逐条标 derived**：
  //   · 任务 = 每张**有怪的场景**一条        ← 对应"每张练级地图都有相应的战斗任务"（official）
  //   · 条件 = 在该场景击败 WAR_TARGET 只怪   ← 具体只数原文没写（derived）
  //   · 解锁 = 该场景已经去过                ← 对应"一步一步解锁战斗路线"（derived 的落地方式）
  //   · 首通给较多金币、重复完成给较少金币     ← 原文只说"有奖励/可重复"，数额是 derived
  //   · 一座岛全部首通 → 额外随机一只索亚      ← 对应"较难线路也许可以得到稀有多比"（derived 映射）
  const WAR_TARGET = 3
  const WAR_FIRST_GOLD = 260
  const WAR_REPEAT_GOLD = 90
  const WAR_REPEAT_EXP = 30

  // 战报任务列表（按岛分组，方便"多条战斗线路"的呈现）
  //
  // ⚠️ 这里**绝对不能调 sceneSpawns()**：本函数会被 drawExplore / drawWarReport 调用，
  // 而 sceneSpawns 会把 88 个场景的怪按"当时的等级"提前固化（有副作用）。
  // 用 D.islandHasMonsters 做只读判断；怪物名优先取**已实际生成**的那只，
  // 场景还没进过就退回刷怪池第一只的名字（仅用于任务标题）。
  function warTasks() {
    const list = []
    const visits = save.data.visited || []
    const done = save.data.warDone || []
    const kills = save.data.warKills || {}
    for (const sc of Object.values(S.scenes || {})) {
      if (!sc || sc.kind !== 'scene') continue
      if (!D.islandHasMonsters(sc.island)) continue   // 只有"练级地图"才有战斗任务
      const spawned = sc._spawns && sc._spawns.monsters && sc._spawns.monsters[0]
      const monName = (spawned && spawned.mon && spawned.mon.name) || D.islandMonsterName(sc.island) || '野外怪物'
      const k = Math.min(kills[sc.id] || 0, WAR_TARGET)
      list.push({
        sid: sc.id,
        island: sc.island,
        islandName: sc.islandName || '未知区域',
        sceneName: sceneLabel(sc.id),
        monName,
        kills: k,
        firstDone: done.includes(sc.id),
        unlocked: visits.includes(sc.id),
      })
    }
    list.sort((a, b) => a.sid - b.sid)
    return list
  }

  // 一条任务当前的进度文本
  function warTaskText(t) {
    if (!t.unlocked) return '尚未抵达该地图'
    return `击败 ${t.monName} ${t.kills}/${WAR_TARGET}`
  }

  // 领取：进度够了才发奖。首次给多，之后每次给少（"可以反复完成"）。
  //
  // 注意：**不能信任传入对象里的 kills** —— 那可能是上一帧构建的快照。
  // 这是个会改存档的函数，必须重新读一次权威进度（否则拿旧引用就永远领不了）。
  function warClaim(t) {
    if (!t) return false
    const cur = warTasks().find((x) => x.sid === t.sid) || t
    if (!cur.unlocked) { toast('还没去过这张地图'); return false }
    if (cur.kills < WAR_TARGET) { toast(`还差 ${WAR_TARGET - cur.kills} 只`); return false }
    const first = !cur.firstDone
    const gold = first ? WAR_FIRST_GOLD : WAR_REPEAT_GOLD
    save.data.gold += gold
    // 消耗掉这一轮的进度（保留首次完成的标记）
    save.data.warKills[cur.sid] = 0
    if (first) save.data.warDone.push(cur.sid)
    if (!first) grantExp(WAR_REPEAT_EXP)
    save.persist()
    audio.sfx('assets/sfx/onClick_03.mp3')
    const islandAll = warTasks().filter((x) => x.island === cur.island)
    const allFirst = islandAll.length > 0 && islandAll.every((x) => x.firstDone || x.sid === cur.sid)
    let extra = ''
    // 「完成比较困难的战斗线路也许可以得到稀有多比」——一座岛全部首通就触发一次
    if (first && allFirst) {
      const miss = (D.SOYA || []).filter((x) => !save.data.soya.includes(x.id))
      if (miss.length && Math.random() < WAR_ISLAND_SOYA_CHANCE) {
        const got = miss[Math.floor(Math.random() * miss.length)]
        save.data.soya.push(got.id)
        save.data.soyaActive = got.id
        save.persist()
        extra = `　★ 路线全通奖励：稀有索亚「${got.name}」！`
      } else {
        extra = '　★ 本条战斗线路已全部首通'
      }
    }
    toast(`${first ? '首次完成' : '再次完成'}战报任务　+${gold} 金币${first ? '' : ` +${WAR_REPEAT_EXP} 经验`}${extra}`)
    return true
  }

  // 一座岛的战报完成度
  function warIslandProgress() {
    const m = new Map()
    for (const t of warTasks()) {
      const e = m.get(t.island) || { island: t.island, name: t.islandName, total: 0, first: 0, ready: 0 }
      e.total++
      if (t.firstDone) e.first++
      if (t.unlocked && t.kills >= WAR_TARGET) e.ready++
      m.set(t.island, e)
    }
    return [...m.values()]
  }

  G.app = G.app || {}
  G.app.warreport = { WAR_TARGET, WAR_FIRST_GOLD, WAR_REPEAT_GOLD, WAR_REPEAT_EXP, warTasks, warTaskText, warClaim, warIslandProgress }
})()