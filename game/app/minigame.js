/* 多克多比 · 应用层：小游戏入口 / 奖励 / 结算（第 72 轮重构 · 批次 7）
   来源：原 `game/game.js` 的「小游戏系统（M4-4）」里会进副本、发奖励、结算的那部分（含原注释）。
   —— 小游戏跑在**临时单关卡副本**上，复用副本的阶段机与结算（见 `game/app/dungeon.js`），
      不再造一套状态机。列表面板的版式与绘制仍在 `game.js`（ui 尚未拆），本模块只负责
      「开一局 / 发奖励 / 过关结算」这些会读写存档的动作。
   依赖：引擎 `window.DKDbb`（save / audio）+ 内容表 `window.DKDbbData`（D）+ 内核 `G.core`（S）
        + 同层 `G.app.dungeon`（enterDungeon / dungeonState / grantAttr / ATTR_NAMES）
        + `G.app.battle.notice`（战斗播报，批次 6 迁出）。
   只经 `G.app.minigame` 出口对外，`game.js` 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const { save, audio } = window.DKDbb
  const D = window.DKDbbData
  const { S } = G.core

  // 同层 / 跨模块桥（惰性箭头：调用时才解析，故加载顺序无关）。
  const notice = (...a) => G.app.battle.notice(...a)
  const enterDungeon = (...a) => G.app.dungeon.enterDungeon(...a)
  const dungeonState = (...a) => G.app.dungeon.dungeonState(...a)
  const grantAttr = (...a) => G.app.dungeon.grantAttr(...a)
  const attrNames = () => G.app.dungeon.ATTR_NAMES

  // 小游戏列表面板状态（选中项 / 悬停 / 分页 / 来源）。
  // 面板本身的输入与绘制仍在 `game.js`（ui 尚未拆），只把状态放在这里，
  // 由 `G.app.minigame.MINI` 对外暴露（原 `G.app.MINI` 桥随之撤销）。
  const MINI = { sel: 0 }

  // 从面板开一局小游戏：登记一个"单关卡临时副本"，然后走 enterDungeon（复用整套阶段机）
  function startMinigame(id) {
    const mg = D.minigameById(id)
    if (!mg) { notice('没有这个小游戏'); return false }
    if (!mg.impl) { notice(`${mg.name}：${mg.rule ? '规则已解读、机制尚未实现' : '规则未解读'} —— 按 R1 不做`); return false }
    // 每种小游戏 → 一个关卡描述（label 用官方名，hint 用官方规则原文）
    const STAGE_OF = {
      memory: { kind: 'memory', label: '记忆水晶', seq: 4 },
      slide: { kind: 'slide', label: '魔法工匠' },
      blocks: { kind: 'blocks', label: '思维方块' },
      runner: { kind: 'runner', label: '多比快跑' },
      platformer: { kind: 'platformer', label: '拯救多比古书' },
      chargeshooter: { kind: 'chargeshooter', label: '王牌大空战' },
      ski: { kind: 'ski', label: '滑雪跳台' },
      notes: { kind: 'notes', label: '魔幻音符' },
      flycatch: { kind: 'flycatch', label: '飞翔的衣服' },
      // 第 47 轮新增的 4 个（玩法来自官方攻略页，逐字见 docs/官方资料库.md 第 16 章）
      catch: { kind: 'catch', label: '哈里的金币' },
      soar: { kind: 'soar', label: '冲上云霄' },
      ballpush: { kind: 'ballpush', label: '极限顶顶球' },
      mirror: { kind: 'mirror', label: '魔镜世界' },
    }
    const base = STAGE_OF[mg.kind]
    if (!base) { notice(`${mg.name}：没有对应的关卡类型（kind=${mg.kind}）—— 这是程序问题，不是资料问题`); return false }
    const stage = Object.assign({}, base, { hint: mg.rule })
    const tempId = '__mini_' + mg.id
    D._tempDungeons[tempId] = {
      id: tempId, name: mg.name, minLevel: 0, players: '单人', order: 0,
      stages: [stage], drop: [], conf: 'official', evidence: mg.evidence,
      miniReward: mg.reward, miniId: mg.id,
    }
    return enterDungeon(tempId)
  }
  // 小游戏结算：按官方原文给 金币 / 彩晶石 / 声望 / 属性 四类奖励
  function finishMinigame() {
    const st = dungeonState()
    const d = D.dungeonById(st.id)
    const r = (d && d.miniReward) || {}
    const got = []
    if (r.gold) { save.data.gold += r.gold; got.push(`金币 +${r.gold}`) }
    if (r.crystal) { save.data.crystal = (save.data.crystal || 0) + r.crystal; got.push(`彩晶石 +${r.crystal}`) }
    // 属性奖励：官方原文点名「智慧、勇气和魅力」，但按 ATTR_NAMES 通用发放（多一个也不会漏）
    const ATTR_NAMES = attrNames()
    const attrGain = {}
    for (const k of Object.keys(ATTR_NAMES)) if (r[k]) attrGain[k] = r[k]
    if (Object.keys(attrGain).length) {
      const g = grantAttr(attrGain)
      if (g.length) got.push(g.join('　'))
    }
    save.data.miniPlays = save.data.miniPlays || {}
    if (d && d.miniId) save.data.miniPlays[d.miniId] = (save.data.miniPlays[d.miniId] || 0) + 1
    save.persist()
    st.phase = 'miniDone'
    st.miniResult = { name: d ? d.name : '', id: d ? d.miniId : null, got }
  }

  function openMinigames() {
    MINI.sel = 0; MINI.hover = -1
    S.mode = 'minigames'
    audio.sfx('assets/sfx/onClick_03.mp3')
  }

  G.app.minigame = { MINI, startMinigame, finishMinigame, openMinigames }
})()