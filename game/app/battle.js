/* 多克多比 · 应用层：战斗逻辑（第 72 轮重构批次 6）
   来源：原 game.js 第 199–207、349–365、379–512、580–673、675–757、762–836、
   848–865、911–988、1002–1091、1093–1126、1128–1412、3218–3313、3315–3372 行，内容一致（含原注释）。
   依赖：内核 G.core 的共享状态 S / 画布 W,H / 提示原语 toast；引擎 window.DKDbb 的
   util / anim / save / audio 与 window.DKDbbFx 的 FX；内容表 window.DKDbbData；
   领域层 G.domain 的 battleMath / seal / orderBySpeed。
   对话 / 玩家 / 场景 / 副本 / 领域等已迁出，直接指向最终模块；仍在 game.js 的战斗视图
   （battleLayout / P_POS / E_POS / SEAL_ARROWS / POWER / DEF / activeSoya / buffLabel /
   索亚跳跃）经 G.app.* 惰性解析（各自迁出后删掉对应临时桥）。只经 G.app.battle
   出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'

  const G = window.DKDbbGame
  const { S, W, H, toast } = G.core
  const { util, anim, save, audio } = window.DKDbb
  const FX = window.DKDbbFx
  const D = window.DKDbbData

  // 领域层纯函数（批次 2）。
  const { channelOf, atkOf, defOf, defFactor, elementFitMul, speedMultiplier } = G.domain.battleMath
  const { SEAL_MAX_SP, SEAL_STEPS, SEAL_STEP_DUR, sealMultiplier } = G.domain.seal

  // 跨应用层桥（惰性箭头：调用时才解析，故加载顺序无关）。
  const diff = (...a) => G.app.difficulty.diff(...a)
  const battleLayout = (...a) => G.app.battleLayout(...a)
  const activeSoya = (...a) => G.app.player.activeSoya(...a)
  // buff 字段 → 中文名，用于战斗播报。
  // （批次 8 归位：原先在 game.js；它只被本模块用，若放 ui 会让 app → ui 反向依赖，故落在应用层。）
  const BUFF_LABEL = { def: '防御', mdef: '魔防', atk: '攻击', matk: '魔攻', spd: '速度', hit: '命中', crit: '暴击', life: '生命', eva: '闪避' }
  function buffLabel(b) {
    if (!b) return ''
    const names = Object.keys(b).filter((k) => k !== 'turns').map((k) => BUFF_LABEL[k] || k)
    return names.length ? names.join('、') : '能力'
  }
  const POWER = (...a) => G.app.battleGeom.POWER(...a)
  const DEF = (...a) => G.app.battleGeom.DEF(...a)
  const E_POS = (...a) => G.app.battleGeom.E_POS(...a)
  const dungeonAfterBattle = (...a) => G.app.dungeon.dungeonAfterBattle(...a)
  const curStage = (...a) => G.app.dungeon.curStage(...a)
  const sceneBgmFor = (...a) => G.app.bgm.sceneBgmFor(...a)
  const ensureVitals = (...a) => G.app.player.ensureVitals(...a)
  const playerStats = (...a) => G.app.player.playerStats(...a)
  const battleSkills = (...a) => G.app.player.battleSkills(...a)
  const grantExp = (...a) => G.app.player.grantExp(...a)
  const grantForm = (...a) => G.app.awaken.grantForm(...a)
  const rollShardDrop = (...a) => G.app.economy.rollShardDrop(...a)
  const sceneLabel = (...a) => G.app.scene.sceneLabel(...a)
  // 索亚跳跃计时：变量声明仍在 game.js（绘制侧也在读），用取值/设值桥共用同一份。
  const getHop = () => G.app.getSoYaHop()
  const setHop = (v) => G.app.setSoYaHop(v)

  function makeUnit(mon, lv, stats) {
    const st = stats || D.monsterAtLevel(mon, lv || mon.baseLevel || 1)
    return {
      name: mon.name, element: mon.element, level: lv || mon.baseLevel || 1,
      size: mon.size, mon,
      hp: st.life, maxHp: st.life, mp: st.mp, maxMp: st.mp, stats: st,
      buffs: [], isPlayer: false, flash: 0, dead: false,
    }
  }

  // 这个技能现在能不能用；不能用就返回原因（给玩家看的短句）
  function skillBlockReason(b, name) {
    const sk = D.SKILLS[name]
    if (!sk) return '技能数据缺失'
    // 结印技走 SP 而不是 MP（官方：结印技并不需要消耗魔法能量）
    if (sk.seal) {
      const need = sk.sp || 1
      if ((b.player.sp || 0) < need) return `结印需要 ${need} SP（现有 ${b.player.sp || 0}，攻击或被打都会积攒）`
      const cdS = (b.cooldowns && b.cooldowns[name]) || 0
      if (cdS > 0) return `${name} 还在冷却（剩 ${cdS} 回合）`
      return null
    }
    if (b.player.mp < (sk.energy || 0)) return `能量不足（需要 ${sk.energy}，现有 ${Math.floor(b.player.mp)}）`
    const cdLeft = (b.cooldowns && b.cooldowns[name]) || 0
    if (cdLeft > 0) return `${name} 还在冷却（剩 ${cdLeft} 回合）`
    return null
  }

  function gainSp(who, amount) {
    if (!who || !who.isPlayer) return
    // 封顶：任何路径都不该让 SP 超过官方上限 3
    who.sp = util.clamp(who.sp || 0, 0, SEAL_MAX_SP)
    if (who.sp >= SEAL_MAX_SP) { who.spCharge = 0; return }
    who.spCharge = (who.spCharge || 0) + amount
    while (who.spCharge >= 1 && who.sp < SEAL_MAX_SP) {
      who.spCharge -= 1
      who.sp += 1
      const b = S.battle
      if (b) {
        b.log.push(`SP 攒满一格！（${who.sp}/${SEAL_MAX_SP}）结印技已就绪`)
        notice(`结印能量 +1　（${who.sp}/${SEAL_MAX_SP}）`, 1400)
        setHop(Math.min(1, getHop() + 0.6))
      }
    }
    if (who.sp >= SEAL_MAX_SP) who.spCharge = 0
  }

  // 开始一次结印操作。注意顺序：**先结印、再结算伤害**，
  // 与原版「选择释放结印技能以后，会出现结印操作」一致。
  //
  // SP 与冷却在**这里**就扣掉（而不是等到 settle），
  // 否则 finishSeal → playerAct 会再扣一次，SP 被扣两遍。
  function startSeal(name) {
    const b = S.battle
    if (!b) return false
    const sk = D.SKILLS[name]
    if (!sk || !sk.seal) return false
    const need = sk.sp || 1
    if ((b.player.sp || 0) < need) { notice(`结印需要 ${need} SP（现有 ${b.player.sp || 0}）`); return false }
    const cdLeft = (b.cooldowns && b.cooldowns[name]) || 0
    if (cdLeft > 0) { notice(`${name} 还在冷却（剩 ${cdLeft} 回合）`); return false }
    b.player.sp -= need
    if (sk.cd > 0) {
      if (!b.cooldowns) b.cooldowns = {}
      b.cooldowns[name] = sk.cd
    }
    const seq = []
    for (let i = 0; i < SEAL_STEPS; i++) seq.push(G.app.battleGeom.SEAL_ARROWS[Math.floor(Math.random() * G.app.battleGeom.SEAL_ARROWS.length)])
    b.seal = {
      name, seq, idx: 0, hits: 0, misses: 0,
      log: [],               // 每一步成没成（画界面用）
      stepT: SEAL_STEP_DUR, stepDur: SEAL_STEP_DUR,
      flash: 0, flashOk: false,
    }
    b.phase = 'sealing'
    b.log.push(`发动结印技「${name}」——按方向键结印！`)
    audio.sfx('assets/sfx/onClick_03.mp3')
    return true
  }

  function sealAdvance(hit) {
    const b = S.battle
    const s = b && b.seal
    if (!s) return
    if (hit) s.hits++; else s.misses++
    s.flash = 0.22
    s.flashOk = !!hit
    if (s.log) s.log.push(!!hit)
    s.idx++
    s.stepT = SEAL_STEP_DUR
    if (s.idx >= s.seq.length) finishSeal()
  }

  function finishSeal() {
    const b = S.battle
    const s = b && b.seal
    if (!s) return
    const mul = sealMultiplier(s)
    const name = s.name
    b.seal = null
    b.sealMul = mul
    b.phase = 'command'
    b.log.push(`结印完成：成功 ${s.hits}/${s.seq.length}　威力 ×${mul.toFixed(2)}`)
    notice(`结印 成功 ${s.hits}/${s.seq.length}　威力 ×${mul.toFixed(2)}`, 1600)
    // 费用已在 startSeal 扣过，这里不再扣
    playerAct('skill', name, true)
  }

  // 统一的"放技能"入口：键盘、鼠标点击、右下角确认大按钮都走这里。
  // 结印技不能直接结算 —— 要先进结印操作（startSeal 会扣 SP 与冷却），
  // 结印完成后由 finishSeal 回来结算伤害。
  function useSkill(b, name) {
    if (!b || b.phase !== 'command') return false
    const why = name ? skillBlockReason(b, name) : '技能数据缺失'
    if (why) return why
    const sk = D.SKILLS[name]
    if (sk && sk.seal) { startSeal(name); return null }
    playerAct('skill', name)
    return null
  }

  // 面板打开时默认落在**第一个能用的技能**上。
  // 用户反馈"有的技能有时候放不出来，鼠标移上去再按空格就能放"——
  // 根因就是这里：以前固定选第 0 个，而它常常正好在冷却，按空格只会闪一句提示。
  function firstUsableSkill(b) {
    const list = S.form.skills || []
    for (let i = 0; i < list.length; i++) if (!skillBlockReason(b, list[i])) return i
    return 0
  }
  // 从 from 往后找下一个能用的技能；都没有就返回 -1
  function nextUsableSkill(b, from) {
    const list = battleSkills(S.form)
    for (let k = 1; k <= list.length; k++) {
      const i = (from + k) % list.length
      if (!skillBlockReason(b, list[i])) return i
    }
    return -1
  }
  // 战斗中的醒目提示条（比角落的 toast 明显得多）
  function notice(msg, ms = 1600) {
    const b = S.battle
    if (!b) { toast(msg, ms); return }
    b.notice = { text: msg, until: performance.now() + ms }
    battleLog(msg)                       // 同时进战斗消息框（第 51 轮：原版左下角那个白底框）
    audio.sfx('assets/sfx/onClick_03.mp3')
  }

  // 战斗消息框的内容（原版左下角那条白底框写的就是战斗播报）。
  // 【为什么要单独存】原来战斗里的提示只有"画面正中一闪而过"的那种，玩家打完之后
  // 完全想不起来"刚才那一击打了多少"。原版的做法是**留一条常驻的消息框**，
  // 所以这里把每条播报都记下来，最多留 LOG_MAX 条。
  const LOG_MAX = 5
  function battleLog(msg) {
    const b = S.battle
    if (!b || !msg) return
    if (!b.log) b.log = []
    b.log.push({ text: String(msg), t: performance.now() })
    while (b.log.length > LOG_MAX) b.log.shift()
  }

  // 三个按钮的真功能（键鼠共用入口）
  const QUICK_TALK = ['加油！', '小心它的技能！', '先打小的', '谢谢～']
  function battleBtnAct(id) {
    const b = S.battle
    if (!b) return
    if (id === 'back') {
      if (b.phase !== 'command') { notice('等这一下打完再退'); return }
      // 确认一下再退（防误触；原版这个键也是"返回"）
      if (S.battleQuitAsk) {
        S.battleQuitAsk = false
        playerAct('escape')          // 走游戏里既有的"逃跑"路径（不要另写一份撤退逻辑）
        return
      }
      S.battleQuitAsk = true
      notice('再点一次「←」就退出战斗')
      return
    }
    if (id === 'menu') {
      // 战斗速度：1× → 2× → 3× 循环（原版这个键开菜单，我们这里放最实用的那项）
      const order = [1, 2, 3]
      const cur = order.indexOf(S.battleSpeed || 1)
      S.battleSpeed = order[(cur + 1) % order.length]
      notice(`战斗速度 ${S.battleSpeed}×`)
      return
    }
    if (id === 'talk') {
      // 快捷发言：循环发一句（原版这个键是聊天输入，我们给一组预设）
      S.talkIdx = ((S.talkIdx || 0) + 1) % QUICK_TALK.length
      battleLog('我说：' + QUICK_TALK[S.talkIdx])
      notice('我说：' + QUICK_TALK[S.talkIdx])
    }
  }

  // 四个指令的统一入口（键盘与鼠标都走这里）
  // 指令入口。按**名字**分发而不是按下标 ——
  // 原版操作栏是 6 个方格（攻击/技能/道具/防御/逃跑/自动），下标一变，
  // 用 i===0/1/2/3 写死的分派就会串位（技能按成逃跑这种）。
  function doCommand(i) {
    const b = S.battle
    if (!b || b.phase !== 'command') return
    const L = battleLayout(b)
    const label = (L.cmdRects[i] || {}).label
    if (label === '攻击') playerAct('attack')
    else if (label === '技能') { b.menu = 'skill'; b.skillSel = firstUsableSkill(b) }
    else if (label === '道具') {
      // 道具：按「恢复/强化/投掷」分页列出背包里的道具
      if (!D.bag.total(save.data.items)) { toast('背包里还没有道具　到主城的杂货铺买一些吧'); return }
      b.menu = 'item'; b.itemSel = 0; b.itemTab = 0
      // 打开时定位到第一个非空页签，免得落在空页上让人以为没道具
      const tabs = D.ITEM_TABS
      for (let k = 0; k < tabs.length; k++) {
        if (D.bag.owned(save.data.items, tabs[k].key).length) { b.itemTab = k; break }
      }
    }
    else if (label === '防御') playerAct('defend')
    else if (label === '逃跑') playerAct('escape')
    else if (label === '自动') toast('自动战斗还没开放')
  }

  // 道具网格的矩形（在 battleLayout 里算，绘制与命中测试共用）
  //
  // 版式说明：一格 236×46，**分两行**——上行是名字与数量，下行是效果。
  // 早先是单行「名字 + 效果 + ×N」挤在一起，"奇异果实（小）生命+400 能量+240 ×3"
  // 直接糊成一团（截图里能看到）。
  const ITEM_GRID = { perRow: 3, rows: 5, sw: 236, sh: 46, sgx: 10, sgy: 6 }
  function itemRects(b) {
    const { perRow, rows, sw, sh, sgx, sgy } = ITEM_GRID
    const tabs = D.ITEM_TABS
    const tab = tabs[util.clamp(b.itemTab || 0, 0, tabs.length - 1)]
    const list = D.bag.owned(save.data.items, tab.key)
    const perPage = perRow * rows
    const pages = Math.max(1, Math.ceil(list.length / perPage))
    // 翻页跟着选中项走，不用额外按键
    const page = util.clamp(Math.floor(util.clamp(b.itemSel || 0, 0, Math.max(0, list.length - 1)) / perPage), 0, pages - 1)
    const gridW = perRow * sw + (perRow - 1) * sgx
    // 面板高度只按**实际用到的行数**算：投掷类只有 7 件时，
    // 固定 5 行会白白挡住半个战场（截图里那块空面板把怪物盖住了）。
    const usedRows = util.clamp(Math.ceil(list.length / perRow) || 1, 1, rows)
    const gridH = usedRows * sh + (usedRows - 1) * sgy
    const gx = (W - gridW) / 2
    const by = H - G.app.battleGeom.BATTLE_BAR_H - 12 - 30
    const gy = by - 10 - gridH
    const rects = []
    for (let i = 0; i < perPage; i++) {
      const k = page * perPage + i
      rects.push({
        it: list[k] || null, i: k, idx: k, empty: !list[k],
        x: gx + (i % perRow) * (sw + sgx),
        y: gy + Math.floor(i / perRow) * (sh + sgy),
        w: sw, h: sh,
      })
    }
    return { tab, list, rects, gx, gy, gridW, gridH, perRow, sw, sh, sgx, sgy, page, pages, perPage }
  }

  // ==================== 道具 ====================
  // 官方策划表里 55 件战斗道具（assets/items.js）：恢复型 48 件 + 投掷型 7 件。
  // 这里负责把它们变成战斗里的一次行动。
  //
  // 投掷道具的伤害表里没给具体数值，只写了"向目标投掷XX，攻击敌人"。
  // 所以用 damageMul × 玩家攻击力 换算，档位按 ID 顺序（板砖<炸弹<T4炸弹…），
  // 保证"投掷"是稳定伤害而不是看脸的技能 —— 这也是道具相对技能的意义。
  function performItem(actor, item, targets, selfTarget) {
    const results = []
    let text_ = ''
    if (item.hp) {
      const before = actor.hp
      actor.hp = Math.min(actor.maxHp, actor.hp + item.hp)
      results.push({ t: actor, amt: actor.hp - before, isSelf: true })
    }
    if (item.mp) {
      const before = actor.mp
      actor.mp = Math.min(actor.maxMp, actor.mp + item.mp)
      results.push({ t: actor, amt: actor.mp - before, isSelf: true, mp: true })
    }
    if (item.buff) {
      const bf = D.itemBuff(item)
      if (bf) applyBuff(actor, bf)
    }
    if (item.damageMul) {
      for (const t of targets) {
        // 投掷道具必中（不然玩家会觉得扔了钱还打空），伤害按倍率算
        const dmg = Math.max(1, Math.round(POWER(actor) * item.damageMul * defFactor(DEF(t))))
        t.hp = Math.max(0, t.hp - dmg); t.flash = 0.4
        if (t.hp === 0) t.dead = true
        results.push({ t, dmg, crit: false, missed: false, em: 1, spd: 1 })
      }
      if (item.debuff && item.debuff.stat !== 'stun') {
        for (const t of targets) applyBuff(t, { [item.debuff.stat]: item.debuff.pct, turns: item.debuff.turns })
      }
    }
    const parts = results.map((r) => r.isSelf ? `+${r.amt}${r.mp ? ' 能量' : ' 生命'}`
      : `${r.dmg}`)
    text_ = `${actor.name} 使用 ${item.name}：${parts.join('、') || '没有效果'}`
    return { actor, anim: null, text: text_, results, t: 0, isItem: true, itemId: item.id }
  }

  // ==================== 技能 ====================
  // 技能 -> 招式动画：每个技能放不同的动作，不再全一样
  const SKILL_ANIM = {
    龙多比形态序列: {
      重击: '龙多比发招一', 多重重击: '龙多比发招二', 破甲: '龙多比发招三',
      雷霆冲击: '龙多比发招四', 嗜血: '龙多比发招五',
    },
    凤凰多比形态序列: {
      火球: '凤凰多比发招一', 火雨: '凤凰多比发招二', 多重火球: '凤凰多比发招三', 嗜血: '凤凰多比发招四',
    },
    光多比形态序列: {
      恢复: '光多比动作一', 清洁: '光多比动作二', 重击: '光多比动作三',
      群体恢复: '光多比动作四', 破甲: '光多比动作五',
    },
    暗多比形态序列: {
      闪电: '暗多比动作二', 旋风: '暗多比动作三', 破甲: '暗多比动作四', 嗜血: '暗多比动作一',
    },
    蝎多比形态序列: {
      重击: '蝎多比发招一', 破甲: '蝎多比发招二', 坚韧: '蝎多比发招三', 旋风: '蝎多比翻滚',
    },
    超级克罗多比形态序列: {
      重击: '超级克罗多比发招一', 多重重击: '超级克罗多比发招二',
      破甲: '超级克罗多比发招三', 雷霆冲击: '超级克罗多比发招四',
    },
  }
  // 先按形态精灵目录查，查不到再按动作名兜底
  const animForSkill = (form, skill) => {
    const t = SKILL_ANIM[form.spriteDir]
    if (t && t[skill]) return t[skill]
    // 兜底：在该形态的可用招式动作里按技能顺序取一个
    const list = form.actionSkills || []
    if (!list.length) return null
    const names = Object.keys(D.SKILLS || {})
    const idx = Math.max(0, names.indexOf(skill))
    return list[idx % list.length]
  }

  function animLen(formName, action) {
    const e = anim.get(S.form.spriteDir, action)
    return e ? e.frames : 0
  }

  // 离开战斗的统一出口。
  //
  // 之前"切回场景曲"只写在**结算界面按空格**那一条路上，于是别的出口
  // （成功逃跑、战斗对象被清空）会留在战斗音乐里出不来。
  // test-bgm 就是这么红的：它跑的那一局不是走的结算路径。
  function leaveBattle() {
    const wasWin = !!(S.result && S.result.win)
    const inDungeon = !!(S.dungeon && S.dungeon.id && S.dungeon.phase === 'battle')
    S.battle = null
    S.result = null
    if (inDungeon) {
      // 副本里打完一场 → 回到副本流程（推进下一关 / 翻牌 / 失败结算），不回场景
      dungeonAfterBattle(wasWin)
      // ⚠️ 别无条件盖成 'dungeon'：**下一关如果又是战斗**（battle → boss 这种连着的），
      // dungeonAfterBattle → startDungeonStage 已经把 mode 设成 'battle' 了，
      // 这里再盖一次就会变成"阶段是 battle、但没有战斗界面"，玩家**永远卡死**。
      // （第 42 轮由副本通关体检 check-dungeon-playthrough 抓出来：索亚迷局打完第一场就停住。）
      if (S.mode !== 'battle') S.mode = 'dungeon'
      return
    }
    S.mode = 'explore'
    if (S.current) audio.playBgm(S.current.bgm || sceneBgmFor(S.current))
  }

  function startBattle(spawn) {
    const mon = spawn.mon
    ensureVitals()
    const st = playerStats()
    const p = {
      name: save.data.playerName, element: S.form.element, level: save.data.level,
      hp: save.data.hp, maxHp: save.data.maxHp, mp: save.data.mp, maxMp: save.data.maxMp,
      stats: st, buffs: [], isPlayer: true, flash: 0, dead: false,
      // 结印技要用的 SP。官方《结印技能特点》：攻击或被打都会积 SP，
      // 槽满得 1 点，**每个多比最多积累 3 SP**，普通战斗常常攒到 1 点就打完了，
      // 所以老玩家大多只在 BOSS 战里见过结印技。
      sp: 0,          // 已积攒的 SP（0~3）
      spCharge: 0,    // 当前这一格的进度（0~1）
    }
    const enemies = [makeUnit(mon, spawn.level, spawn.stats)]
    // 高等级偶尔带一只小弟（同岛、同等级区间）
    // 小弟等级压一档：修好"每只怪各打一次"之后，两只同级怪会让玩家一回合挨两次打，
    // 实测那样两连战存活率掉到三成以下，所以小弟弱一点，保持"一打二有压力但能赢"。
    // 【第 43 轮】"一打二"本身就是难度杠杆 —— 简单档把概率和触发等级都压低。
    const dcfg = diff()
    const addFoeChance = dcfg.addFoeChance === undefined ? 0.30 : dcfg.addFoeChance
    const addFoeMinLevel = dcfg.needMul < 1 ? 10 : 4
    if (save.data.level > addFoeMinLevel && Math.random() < addFoeChance) {
      const sp2 = D.spawnFor(S.current.island, Math.random, save.data.level)
      if (sp2 && sp2.mon.id !== mon.id) enemies.push(makeUnit(sp2.mon, Math.max(1, sp2.level - 1), sp2.stats))
    }
    S.battle = {
      player: p, enemies, target: 0,
      log: [`野生的${mon.name}出现了！`],
      phase: 'command', menu: 'main', menuSel: 0, skillSel: 0,
      action: null,          // 当前演出 {actor, anim, t, dur, text, results, side}
      animT: 0, spawn, t: 0,
      fx: [],                // 技能特效实例
      floats: [],            // 伤害飘字
      hitStop: 0,            // 命中停顿剩余时间
      cooldowns: {},         // 技能冷却（每回合 -1）
      seal: null,            // 结印操作状态（见 startSeal）
      intro: 1.5,            // 开场演出剩余时间（>0 时不接受指令）
      victory: false, round: 1,
      // 出手顺序：每回合按速度从高到低排出的行动序列（见 buildTurnOrder）。
      // 官方《多克多比属性介绍》：「速度：这个直接影响多比是否能够快速进入回合的数值」。
      turnOrder: [], turnIdx: 0, turnStarted: false,
      enemyPhase: false,     // 当前是不是敌人正在行动（界面据此显示"敌人行动中"）
    }
    S.mode = 'battle'
    S.toast = null          // 清掉上一条提示（"进入 XX"），别飘在战斗画面上
    // 进战斗切战斗音乐；BOSS 类（id 以 19 开头）用乌卡前线
    const isBoss = /^19/.test(String(mon.id))
    const BGM = G.app.bgm.BGM
    audio.playBgm((isBoss && BGM.boss) ? BGM.boss : BGM.battle)
    audio.sfx('assets/sfx/onClick_03.mp3')
  }

  // ==================== 伤害公式 ====================
  // 伤害 = K × 攻 × defFactor × 克制 × 暴击
  // defFactor 曲线与"为什么是这个形状"的完整推导见 domain/battle-math.js。
  // DMG_K 唯一的使用者（expectedDamage 与索亚追击）都在本模块。
  const DMG_K = (window.DKDbbData && window.DKDbbData.DMG_K) || 2.1

  // 索亚的伤害修正（数值是 derived，见 assets/soya.js 的说明）
  function soyaAtkMul(attacker) {
    if (!attacker || !attacker.isPlayer) return 1
    const sy = activeSoya()
    return sy && sy.effect === 'power' ? 1.2 : 1
  }
  function soyaDefMul(defender) {
    if (!defender || !defender.isPlayer) return 1
    const sy = activeSoya()
    return sy && sy.effect === 'guard' ? 0.8 : 1
  }

  // ==================== 索亚（宠物）自己出手 ====================
  //
  // 【第 55 轮：为什么加这个】用户原话：「**然后让宠物也能攻击不然宠物一点用都没有**」。
  //   查证结果：宠物其实**早就有战斗机制**（`assets/soya.js` 里 6 只各有 effect：
  //   claw 钢爪追伤 / guard 守护减伤 / cling 粘人回血 / shock 静电麻痹 / thorn 尖刺反伤 / power 全力+20%），
  //   但它们**全都挂在主人的行动上**（`soyaAtkMul` 只改主人的伤害、`claw` 只在主人攻击时追加）。
  //   → 玩家在战斗里看不到"宠物在打"，自然觉得它没用。
  //
  //   所以给宠物**自己的出手回合**：它有自己的先手槽、自己挑目标、自己弹伤害数字。
  //   原有的性格机制**保留**（那些是官方设定的落地），两者叠加 —— 宠物既"有性格"也"真在打"。
  //
  // 数值都是 derived（官方表里没有索亚数值，见 `assets/soya.js` 的 note）：
  //   · 出手力度 = 主人的 45%（比主人弱一档，但不至于可有可无）
  //   · 出手频率：速度取主人的 **95%** —— 意图是"紧跟在主人之后出手"。
  //     ⚠️ 这个 0.95 是**量出来的**：第一版用 0.85，实测顺序是
  //     `主人(152) → 敌人(131) → 宠物(129)` —— 宠物被挤到敌人后面，
  //     玩家的感受是"我的宠物最后才动"，与"陪伴宠物"的定位不符。
  //     0.95 下宠物=144，落在主人与多数敌人之间。
  const SOYA_ATK_SCALE = 0.45
  const SOYA_SPD_SCALE = 0.95

  // 把宠物包成一个"能进伤害公式"的单位。
  // ⚠️ 必须是**每次现取**（主人的攻防会随装备/形态/增益变化），不能在开战时算一次存着。
  // 数值按主人比例缩放后复用 `expectedDamage()` —— 不另写一套公式（两份公式必然漂移）。
  function soyaBattleStats(sy) {
    const st = (S.battle && S.battle.player && S.battle.player.stats) || {}
    const sc = (v) => Math.max(1, Math.round((v || 0) * SOYA_ATK_SCALE))
    return {
      atk: sc(st.atk), matk: sc(st.matk != null ? st.matk : st.atk),
      def: sc(st.def), mdef: sc(st.mdef != null ? st.mdef : st.def),
      spd: Math.max(1, Math.round((st.spd || 100) * SOYA_SPD_SCALE)),
      hit: st.hit || 40, eva: st.eva || 35, crit: 3,
    }
  }
  function soyaAttacker(sy) {
    return {
      name: sy.name.replace(/[（(].*?[)）]/g, ''),
      element: '无',
      // 参与伤害公式的最小单位形状（atkOf/defOf 只读 .stats）
      stats: soyaBattleStats(sy),
      // ⚠️ `buffs` 必须给：`buffed(u, ...)` 会直接 `for (const b of u.buffs)` 遍历它，
      //    少这个字段就是 `TypeError: u.buffs is not iterable`（第一次跑就这么炸的）。
      //    玩家/敌人单位在构造时也都带了这个空数组（见 makeUnit）。
      buffs: [],
      isPlayer: true,          // 算"我方出手"：吃简单模式的 atkMul 与命中加成
      isSoya: true,            // 标记来源，便于日志/测试区分
    }
  }

  function expectedDamage(attacker, defender, skill) {
    const ch = channelOf(skill)
    const pow = atkOf(attacker, ch)
    const base = skill && skill.power ? pow * skill.power : pow
    const el = (skill && skill.element) || attacker.element
    const em = D.multiplier(el, defender.element)
    const fit = elementFitMul(attacker, skill)
    const d = diff()
    // 难度只作用在"谁打谁"上：我方出手 ×atkMul，敌方出手 ×defMul
    const side = attacker && attacker.isPlayer ? d.atkMul : d.defMul
    return Math.max(1, Math.round(DMG_K * base * defFactor(defOf(defender, ch)) * em * fit * soyaAtkMul(attacker) * soyaDefMul(defender) * side))
  }

  function damage(attacker, defender, skill) {
    const el = (skill && skill.element) || attacker.element
    const em = D.multiplier(el, defender.element)
    // 双通道（M1-3）：力量型吃攻击/防御，精神力吃魔攻/魔防，魔武混合取两者平均
    const ch = channelOf(skill)
    const fit = elementFitMul(attacker, skill)
    let dmg = expectedDamage(attacker, defender, skill)
    const crit = Math.random() < (attacker.stats.crit || 3) / 100
    if (crit) dmg = Math.round(dmg * 1.7)
    // 下限 0.70：真机日志里出现过连续三次落空（下限 0.5 时），对儿童页游太挫败
    // 难度加成只给我方（简单模式命中 +6%）
    const bonus = attacker && attacker.isPlayer ? diff().hitBonus : 0
    const hitRate = util.clamp(0.72 + ((attacker.stats.hit || 40) - (defender.stats.eva || 35)) / 200 + bonus, 0.70, 0.99)
    const missed = Math.random() > hitRate
    return { dmg: missed ? 0 : dmg, crit, missed, em, channel: ch, fit }
  }

  function applyBuff(u, buff) {
    const key = Object.keys(buff)[0]
    u.buffs = u.buffs.filter((b) => !(key in b))
    u.buffs.push({ ...buff })
  }

  // 执行一次行动，返回演出对象（含动画名）
  function perform(actor, kind, arg, targets) {
    let text_ = '', results = [], animName = null
    if (kind === 'attack') {
      for (const t of targets) {
        // 速度 → 伤害倍率（见上面的 speedMultiplier）
        const mul = speedMultiplier(actor, t)
        const r0 = damage(actor, t, null)
        const total = r0.missed ? 0 : Math.round(r0.dmg * mul)
        t.hp = Math.max(0, t.hp - total); t.flash = 0.4
        if (t.hp === 0) t.dead = true
        results.push({ t, dmg: total, crit: r0.crit, missed: r0.missed, em: 1, spd: mul })
      }
      animName = actor.isPlayer ? animForSkill(S.form, '重击') : null
      // ---- 索亚：钢爪追加一击（官方设定"锋利的钢爪，很喜欢睡觉"，所以有几率打瞌睡）----
      const syAtk = activeSoya()
      if (actor.isPlayer && syAtk && syAtk.effect === 'claw') {
        if (Math.random() < 0.65) {
          const t0 = targets[0]
          if (t0 && !t0.dead) {
            const extra = Math.max(1, Math.round(DMG_K * POWER(actor) * 0.45 * defFactor(DEF(t0))))
            t0.hp = Math.max(0, t0.hp - extra); t0.flash = 0.4
            if (t0.hp === 0) t0.dead = true
            results.push({ t: t0, dmg: extra, crit: false, missed: false, em: 1, spd: 1, soya: '钢爪' })
            setHop(1)
          }
        } else results.push({ t: null, dmg: 0, soya: '打瞌睡', slept: true })
      }
      // ---- 索亚：静电让目标麻痹 ----
      if (actor.isPlayer && syAtk && syAtk.effect === 'shock') {
        const t0 = targets[0]
        if (t0 && !t0.dead && Math.random() < 0.35) {
          t0.stun = 1
          results.push({ t: t0, dmg: 0, soya: '麻痹' })
        }
      }
      // ---- 索亚：尖刺反弹（敌人打主人时）----
      if (!actor.isPlayer) {
        const syDef = activeSoya()
        if (syDef && syDef.effect === 'thorn') {
          const back = Math.max(1, Math.round(actor.maxHp * 0.06))
          actor.hp = Math.max(0, actor.hp - back)
          if (actor.hp === 0) actor.dead = true
          results.push({ t: actor, dmg: back, crit: false, missed: false, em: 1, spd: 1, soya: '尖刺' })
        }
      }
      const parts = results.filter((r) => r.t).map((r) => r.missed ? '落空'
        : `${r.dmg}${r.spd > 1.02 ? ` (速度×${r.spd.toFixed(2)})` : ''}${r.crit ? ' 暴击' : ''}`)
      text_ = `${actor.name} 攻击：${parts.join('、')}` + (syAtk && actor.isPlayer ? `　（${syAtk.effectLabel}）` : '')
    } else {
      const sk = D.SKILLS[arg]
      animName = actor.isPlayer ? animForSkill(S.form, arg) : null
      if (sk.heal) {
        const amt = Math.round(actor.maxHp * sk.heal)
        for (const t of targets) { t.hp = Math.min(t.maxHp, t.hp + amt); results.push({ t, amt }) }
        text_ = `${actor.name} 使用 ${arg}，恢复 ${amt} 点生命`
        animName = animName || '光多比动作一'
      } else if (sk.cleanse) {
        for (const t of targets) t.buffs = []
        text_ = `${actor.name} 使用 清洁，驱散了异常状态`
      } else if (sk.buff) {
        for (const t of targets) applyBuff(t, sk.buff)
        // 播报要写清到底加了什么（原来写死"防御提升"，加攻击也报防御）
        text_ = `${actor.name} 使用 ${arg}，${buffLabel(sk.buff)}提升`
      } else {
        // 结印倍率由 finishSeal() 写入（官方：成功结印越多威力越大），用完即清
        const bcur = S.battle
        const sealMul = (sk.seal && bcur && bcur.sealMul) ? bcur.sealMul : 1
        if (bcur && sk.seal) bcur.sealMul = null
        for (const t of targets) {
          const r = damage(actor, t, sk)
          const mul = speedMultiplier(actor, t)
          const dmg2 = r.missed ? 0 : Math.round(r.dmg * mul * sealMul)
          t.hp = Math.max(0, t.hp - dmg2); t.flash = 0.4
          if (t.hp === 0) t.dead = true
          results.push({ t, ...r, dmg: dmg2, spd: mul, sealMul })
        }
        const parts = results.map((r) => r.missed ? '落空' : `${r.dmg}${r.crit ? ' 暴击' : ''}${r.em > 1 ? ' 克制' : r.em < 1 ? ' 抵抗' : ''}`)
        text_ = `${actor.name} 使用 ${arg}：${parts.join('、')}`
          + (sealMul !== 1 ? `　（结印 ×${sealMul.toFixed(2)}）` : '')
      }
    }
    return { actor, anim: animName, text: text_, results, t: 0 }
  }

  // 索亚出手：自动挑一个活着的敌人打一下，弹出伤害数字。
  //
  // 【为什么自己挑目标，而不是用玩家选的那个】宠物是"自动"的：如果它打玩家选的目标，
  //   玩家就会觉得"无法控制"；而在"打血最少的"这条简单规则下，它的行为可预期、也真的有用
  //   （优先补刀）。这条策略属于 derived，写在注释里以便复核。
  function petAct(b, sy) {
    const alive = b.enemies.filter((e) => !e.dead)
    if (!alive.length) { b.turnIdx = (b.turnOrder || []).length; return }
    const target = alive.slice().sort((x, y) => x.hp - y.hp)[0]
    const pet = soyaAttacker(sy)
    // 无属性普通攻击：伤害走**和玩家同一条**公式（`damage()` → `expectedDamage()`），
    // 只是攻防按 SOYA_ATK_SCALE 缩放。不另写公式，避免两套数值漂移。
    const sk = { name: '索亚攻击', power: 1, kind: 'attack', element: '无' }
    const r = damage(pet, target, sk)
    if (!r.missed) {
      target.hp = Math.max(0, target.hp - r.dmg)
      target.flash = 0.35
      if (target.hp === 0) target.dead = true
    }
    setHop(1)                                    // 宠物跳一下（复用现成的动画）
    b.log.push(r.missed
      ? `${pet.name} 扑了上去，被 ${target.name} 躲开了`
      : `${pet.name} 咬了 ${target.name} 一口　-${r.dmg}${r.crit ? '（暴击）' : ''}`)
    // 演出：与玩家攻击同一套（`beginAction` 负责把 results 变成飘字与日志）
    beginAction({
      actor: pet, anim: null, t: 0,
      text: `${pet.name} 出手！`,
      results: [{ t: target, dmg: r.missed ? 0 : r.dmg, crit: r.crit, missed: r.missed, em: r.em, spd: 1, soya: '出手' }],
      isSoya: true,
    }, () => {
      // 演出结束：检查胜负，然后继续推进回合（否则会卡在宠物这一槽）
      if (!checkBattleEnd()) advanceTurn()
    })
  }

  function beginAction(action, after) {
    const b = S.battle
    b.action = action
    b.phase = 'acting'
    const frames = action.anim ? animLen(S.form.spriteDir, action.anim) : 0
    // 有动画就按帧数定演出时长（24fps），道具没有招式动画，给个短停顿
    b.actionDur = action.isItem ? 0.55 : (frames ? Math.max(0.7, frames / 24) : 0.7)
    b.actionAfter = after
    // ---- 打击感：命中停顿 + 伤害飘字 ----
    // 伤害数字必须在演出开始前就确定（perform 里已经算好并写进 results），
    // 所以这里只负责把它变成飘字动画。
    if (action.results && action.results.length) {
      for (const r of action.results) {
        if (!r.t) continue
        if (r.missed) {
          b.floats.push({ text: 'MISS', x: 0, y: 0, t: 0, dur: 0.9, color: '#9fb0cc', size: 22, on: r.t })
        } else if (r.amt) {
          b.floats.push({ text: '+' + r.amt, x: 0, y: 0, t: 0, dur: 1.0, color: '#5ee06a', size: 24, on: r.t })
        } else {
          const strong = r.em > 1 || r.crit
          b.floats.push({
            text: (r.crit ? '' : '') + '-' + r.dmg,
            x: 0, y: 0, t: 0, dur: 0.95,
            color: r.crit ? '#ffd23f' : r.em > 1 ? '#ff8a3c' : '#ff6b6b',
            size: strong ? 30 : 22,
            tag: r.crit ? '暴击' : (r.em > 1 ? '克制' : (r.em < 1 ? '抵抗' : '')),
            on: r.t,
          })
        }
      }
      // 有伤害就加一点停顿（hit stop），让打击有分量
      const anyHit = action.results.some((r) => r.dmg || r.amt)
      if (anyHit) b.hitStop = 0.1

      // ---- SP 积攒 ----
      // 官方《结印技能特点》：「玩家在战斗中被怪物攻击或者攻击怪物都会得到 SP，
      // SP 槽到顶峰积累 1 SP」。这里把两个方向都算上，挨打给得多一点，
      // 这样 BOSS 战里才可能攒到 1~3 点（原版普通战斗往往刚攒 1 点就结束了）。
      {
        const p = b.player
        if (action.actor && action.actor.isPlayer) {
          const dealt = action.results.filter((r) => r.t && !r.t.isPlayer && r.dmg > 0).length
          if (dealt) gainSp(p, 0.16 * dealt)
        }
        const taken = action.results.filter((r) => r.t && r.t.isPlayer && r.dmg > 0).length
        if (taken) gainSp(p, 0.30 * taken)
      }
    }

    b.log.push(action.text)
    if (b.log.length > 6) b.log.shift()

    // ---- 技能特效 ----
    // 玩家出手时按技能类型放对应特效；普攻用斩击/冲撞，不放法术
    if (action.actor.isPlayer && action.isItem) {
      // 道具：恢复/强化在自己脚下冒光，投掷在目标身上炸开
      const item = D.item(action.itemId)
      const selfUse = !item || D.itemTargetsSelf(item)
      if (selfUse) {
        const base = FX.SKILL_FX['恢复']
        b.fx.push(FX.create({ ...base, color: item && item.mp && !item.hp ? '#bfe4ff' : base.color,
          color2: item && item.mp && !item.hp ? '#3f8cff' : base.color2 },
          { x: G.app.battleGeom.P_POS.x, y: G.app.battleGeom.P_POS.y }, { x: G.app.battleGeom.P_POS.x, y: G.app.battleGeom.P_POS.y }, 2))
      } else {
        const base = FX.BY_ELEMENT[(item && item.element) || S.form.element] || FX.BY_ELEMENT['无']
        const tg = (action.results || []).map((r) => r.t).filter((t) => t && !t.isPlayer)
        tg.forEach((t, i) => {
          const ei = b.enemies.indexOf(t)
          b.fx.push(FX.create({ ...base, shape: 'ball', multi: 2 }, { x: G.app.battleGeom.P_POS.x, y: G.app.battleGeom.P_POS.y - 40 },
            E_POS(ei < 0 ? 0 : ei), (i + 1) * 6 + 3))
        })
      }
    } else if (action.actor.isPlayer && action.skillName) {
      const sk = D.SKILLS[action.skillName] || {}
      const cfg = FX.configFor(action.skillName, sk.element || S.form.element)
      const targets = (action.results || []).map((r) => r.t).filter((t) => t && !t.isPlayer)
      const from = { x: G.app.battleGeom.P_POS.x, y: G.app.battleGeom.P_POS.y - 40 }
      if (cfg.onSelf || sk.heal || sk.buff || sk.cleanse) {
        b.fx.push(FX.create(cfg, { x: G.app.battleGeom.P_POS.x, y: G.app.battleGeom.P_POS.y }, { x: G.app.battleGeom.P_POS.x, y: G.app.battleGeom.P_POS.y }, action.t + 1))
      } else if (targets.length) {
        targets.forEach((tg, i) => {
          const ei = b.enemies.indexOf(tg)
          const to = E_POS(ei < 0 ? 0 : ei)
          b.fx.push(FX.create(cfg, from, to, (i + 1) * 7 + 3))
        })
      }
    } else if (action.actor.isPlayer) {
      // 普通攻击：斩击特效
      const cfg = FX.BY_ELEMENT[S.form.element] || FX.BY_ELEMENT['无']
      const slash = { ...cfg, shape: 'slash', multi: 2 }
      const ei = b.enemies.indexOf((action.results || [])[0] && action.results[0].t)
      b.fx.push(FX.create(slash, { x: G.app.battleGeom.P_POS.x, y: G.app.battleGeom.P_POS.y }, E_POS(ei < 0 ? 0 : ei), 5))
    }
  }

  // 一个完整回合结束后推进冷却（每回合 -1）
  function tickCooldowns() {
    const b = S.battle
    if (!b || !b.cooldowns) return
    for (const k of Object.keys(b.cooldowns)) {
      b.cooldowns[k]--
      if (b.cooldowns[k] <= 0) delete b.cooldowns[k]
    }
  }

  // 让第 ei 只敌人出手
  function actEnemy(ei) {
    const b = S.battle
    const e = b.enemies[ei]
    if (!e || e.dead) return
    const act = perform(e, 'attack', null, [b.player])
    act.lunge = 1
    e.lungeAt = 1
    beginAction(act)
    b.actionSide = 'enemy'
  }

  // ==================== 出手顺序 ====================
  // 【第 72 轮重构批次 2】排序规则（"速度降序、同速玩家优先"，含官方原文依据）已迁到
  // `game/domain/turn-order.js` 的 `orderBySpeed()`。这里只剩**按当前战斗状态拼槽位**这件事：
  // 谁是玩家、索亚挂不挂、取哪几只活着的敌人 —— 拼好后交给领域层排序。
  function buildTurnOrder(b) {
    const list = []
    if (!b.player.dead) list.push({ side: 'player', spd: Math.round(b.player.stats.spd || 100) })
    // 索亚自己也有先手槽（第 55 轮）：速度取主人的 85%，所以通常紧跟在主人之后出手。
    // 没有出战索亚时（未装备 / 还没遇到）就不加这一槽 —— 不占位、不空转。
    if (!b.player.dead && !b.petDead && activeSoya()) {
      list.push({ side: 'pet', spd: Math.round((b.player.stats.spd || 100) * SOYA_SPD_SCALE) })
    }
    b.enemies.forEach((e, i) => {
      if (!e.dead) list.push({ side: 'enemy', i, spd: Math.round(e.stats.spd || 100), name: e.name, element: e.element })
    })
    return G.domain.orderBySpeed(list)
  }

  function beginRound(b) {
    b.turnOrder = buildTurnOrder(b)
    b.turnIdx = 0
    advanceTurn()
  }

  // 推进到下一个行动者。轮到玩家时把控制权交回（phase='command' 等输入）。
  function advanceTurn() {
    const b = S.battle
    if (!b) return
    if (checkBattleEnd()) return
    const order = b.turnOrder || []
    while (b.turnIdx < order.length) {
      const slot = order[b.turnIdx]
      if (slot.side === 'player') {
        b.turnIdx++
        if (b.player.dead) continue
        b.enemyPhase = false
        b.phase = 'command'; b.menu = 'main'
        b.target = util.clamp(b.target, 0, Math.max(0, b.enemies.filter((e) => !e.dead).length - 1))
        return
      }
      // 索亚的回合（第 55 轮）：**自动出手**，不打断玩家的操作。
      // 走完立刻 continue 继续推进，所以玩家感觉不到"多了一个等待步骤"。
      if (slot.side === 'pet') {
        b.turnIdx++
        const sy = activeSoya()
        if (!sy || b.player.dead) continue
        petAct(b, sy)
        return          // petAct 会走一段演出，演完由 battleTick 继续推进
      }
      const e = b.enemies[slot.i]
      b.turnIdx++
      if (!e || e.dead) continue
      if (e.stun > 0) {                       // 静电麻痹：跳过这一回合
        e.stun--
        b.log.push(`${e.name} 被静电麻痹，动弹不得`)
        continue
      }
      b.enemyPhase = true
      actEnemy(slot.i)
      return
    }
    endRound(b)
  }

  function endRound(b) {
    b.enemyPhase = false
    b.round = (b.round || 1) + 1
    // ---- 索亚：粘人的每回合给主人回一点血（官方设定"很喜欢粘人"）----
    const syR = activeSoya()
    if (syR && syR.effect === 'cling' && !b.player.dead) {
      const heal = Math.max(1, Math.round(b.player.maxHp * 0.05))
      const before = b.player.hp
      b.player.hp = Math.min(b.player.maxHp, b.player.hp + heal)
      if (b.player.hp > before) {
        b.log.push(`${syR.name} 凑过来蹭了蹭，生命 +${b.player.hp - before}`)
        b.floats.push({ text: '+' + (b.player.hp - before), x: 0, y: 0, t: 0, dur: 1.0, color: '#5ee06a', size: 22, on: b.player })
      }
    }
    for (const u of [b.player, ...b.enemies]) {
      u.buffs = u.buffs.map((x) => ({ ...x, turns: x.turns - 1 })).filter((x) => x.turns > 0)
    }
    tickCooldowns()
    beginRound(b)
  }

  function nextPhase() {
    const b = S.battle
    b.action = null
    if (checkBattleEnd()) return
    advanceTurn()
  }

  function playerAct(kind, arg, costsPaid) {
    const b = S.battle
    if (!b || b.phase !== 'command') return
    const alive = b.enemies.filter((x) => !x.dead)
    if (!alive.length) return
    const target = alive[util.clamp(b.target, 0, alive.length - 1)]
    if (kind === 'escape') {
      if (Math.random() < 0.65) { toast('成功逃离了战斗'); leaveBattle(); return }
      b.log.push('逃跑失败！'); b.phase = 'acting'; b.action = { text: '', results: [], t: 0 }; b.actionDur = 0.6
      b.actionAfter = null; b.actionSide = 'player'
      return
    }
    let targets = [target], actionKind = 'attack'
    if (kind === 'defend') {
      // 防御：本回合防御大幅提升（用现成的 buff 通道），并回一点能量。
      // 原版指令栏里就有这一格，早先我把它做成了"未开放"，现在补上。
      applyBuff(b.player, { def: 0.9, turns: 1 })
      b.player.mp = Math.min(b.player.maxMp, b.player.mp + Math.round(b.player.maxMp * 0.08))
      save.data.mp = b.player.mp
      beginAction({ actor: b.player, anim: null, text: `${b.player.name} 摆出防御姿态`, results: [], t: 0, isDefend: true })
      b.actionSide = 'player'
      return
    }
    if (kind === 'item') {      const item = D.item(arg)
      if (!item) { toast('没有这件道具'); return }
      if (!D.bag.take(save.data.items, item.id, 1)) { toast(`「${item.name}」不够了`); return }
      save.persist()
      const selfTarget = D.itemTargetsSelf(item)
      const useTargets = selfTarget ? [b.player] : (item.aoe ? alive : [target])
      const act = performItem(b.player, item, useTargets, selfTarget)
      // 用道具也算一回合：演出短一点，节奏别拖
      beginAction(act)
      b.actionSide = 'player'
      return
    }
    if (kind === 'skill') {
      const sk = D.SKILLS[arg]
      // 防御：arg 取不到时给一句提示，别让 D.SKILLS[undefined] 抛异常把整帧打断
      if (!sk) { notice('这个技能现在用不了'); return }
      if (sk.seal) {
        // 结印技走 SP 不扣魔法。
        // costsPaid=true 表示经由 startSeal → finishSeal 的正常路径：
        // SP 与冷却**在那里已经扣过**，这里绝不能再校验一次冷却 ——
        // 否则刚上的冷却会把自己拦下，结印技的伤害永远结算不了。
        if (!costsPaid) {
          const need = sk.sp || 1
          if ((b.player.sp || 0) < need) { notice(`结印需要 ${need} SP（现有 ${b.player.sp || 0}）`); return }
          const cdS = (b.cooldowns && b.cooldowns[arg]) || 0
          if (cdS > 0) { notice(`${arg} 还在冷却（剩 ${cdS} 回合）`); return }
          b.player.sp -= need
          if (sk.cd > 0) {
            if (!b.cooldowns) b.cooldowns = {}
            b.cooldowns[arg] = sk.cd
          }
        }
      } else {
        if (b.player.mp < (sk.energy || 0)) { notice(`能量不足（需要 ${sk.energy}，现有 ${Math.floor(b.player.mp)}）`); return }
        const cdLeft = (b.cooldowns && b.cooldowns[arg]) || 0
        if (cdLeft > 0) { notice(`${arg} 还在冷却（剩 ${cdLeft} 回合）`); return }
        b.player.mp -= (sk.energy || 0); save.data.mp = b.player.mp; save.persist()
        // 上冷却：CD 值就是等待回合数
        if (sk.cd > 0) {
          if (!b.cooldowns) b.cooldowns = {}
          b.cooldowns[arg] = sk.cd
        }
      }
      actionKind = 'skill'
      if (sk.range === 1) targets = alive
      else if (sk.range === 2) targets = sk.heal ? [b.player] : alive
      else if (sk.heal || sk.buff || sk.cleanse) targets = [b.player]
    }
    const act = perform(b.player, actionKind, kind === 'skill' ? arg : null, targets)
    act.skillName = kind === 'skill' ? arg : null
    beginAction(act)
    b.actionSide = 'player'
  }

  function checkBattleEnd() {
    const b = S.battle
    if (b.enemies.every((e) => e.dead)) {
      b.phase = 'over'; b.victory = true
      const exp = b.enemies.reduce((a, e) => a + Math.round(14 + e.level * 7), 0)
      const gold = b.enemies.reduce((a, e) => a + Math.round(4 + e.level * 2), 0)
      b.rewardExp = exp; b.rewardGold = gold
      b.log.push(`战斗胜利！+${exp} 经验 +${gold} 金币`)
      grantExp(exp)
      save.data.gold += gold

      // ---- 形态掉落：击败怪物有几率获得新多比形态 ----
      // ★ 第 66 轮（用户要求）：**只从"有模型立绘"的形态里掉**。
      //   原来这一行是 `D.FORMS.filter(f => !forms.includes(f.name))` —— 从**全部**形态里抽，
      //   等于 24 只没有任何立绘的形态都在这条路上，是四条途径里漏得最狠的一条
      //   （兑换/副本掉落/唤醒好歹还是点名指定的）。
      const artOk = (f) => (typeof D.formHasArt === 'function' ? D.formHasArt(f) : !!f.art)
      const locked = D.FORMS.filter((f) => !save.data.forms.includes(f.name) && artOk(f))
      if (locked.length) {
        // 场上怪物的元素 + 等级越高，掉落概率越大
        const lvBonus = Math.min(0.25, (b.enemies[0].level || 1) * 0.012)
        const chance = 0.16 + lvBonus
        if (Math.random() < chance) {
          // 优先掉与怪物同元素的形态
          const sameElem = locked.filter((f) => f.element === b.enemies[0].element)
          const pickFrom = sameElem.length ? sameElem : locked
          const got = pickFrom[Math.floor(Math.random() * pickFrom.length)]
          // 走唯一发放入口（上面的 locked 已经过滤过，这里是同一道关的第二道锁）
          const g = grantForm(got.name)
          if (g.ok) {
            b.dropForm = g.form.name
            b.log.push(`★ 获得新形态「${g.form.name}」！按 B 打开背包变身`)
          }
        }
      }
      // ---- 索亚：打赢有几率遇到新的一只 ----
      {
        const missSoya = (D.SOYA || []).filter((x) => !save.data.soya.includes(x.id))
        if (missSoya.length && Math.random() < 0.22) {
          const got = missSoya[Math.floor(Math.random() * missSoya.length)]
          save.data.soya.push(got.id)
          save.data.soyaActive = got.id
          b.dropSoya = got.name
          b.log.push(`★ 遇到了索亚「${got.name}」！已自动设为出战`)
        }
      }
      // ---- 白色彩晶石碎片（官方来源：精英怪 / 副本BOSS / 野外BOSS）----
      // 原文没提普通野外怪 → 普通怪不掉；副本 BOSS 必掉；精英/野外BOSS 按概率。
      {
        const isDungeonBoss = !!(S.dungeon && S.dungeon.id && curStage() && curStage().kind === 'boss')
        const bossTier = D.isBossTier && b.enemies[0] && D.isBossTier(b.enemies[0].id)
        const got = rollShardDrop({ dungeonBoss: isDungeonBoss, bossTier })
        if (got) b.log.push(`★ 获得白色彩晶石碎片 ×${got}（按 Z 打开战报、按 J 进珍宝小屋合成）`)
      }

      save.persist()
      if (b.spawn) {
        // 打倒后**不是永久消失**：记下刷新时间，到点原地重刷（见 refreshSpawns）。
        // 之前只置 alive=false 就再也不会出现了，一张图清完就永远没得打。
        b.spawn.alive = false
        b.spawn.respawnAt = performance.now() / 1000 + G.app.spawn.RESPAWN_SEC
      }

      // ---- 战报任务进度：在当前场景的计数上加 1（封顶在 WAR_TARGET，多打不溢出）----
      // 只在"从场景里打的怪"上计数；副本/斗技场之类没有 b.spawn 的战斗不计。
      if (b.spawn && S.current) {
        const wk = save.data.warKills || (save.data.warKills = {})
        const cur = wk[S.current.id] || 0
        if (cur < G.app.warreport.WAR_TARGET) {
          wk[S.current.id] = cur + 1
          const left = G.app.warreport.WAR_TARGET - (cur + 1)
          b.log.push(left > 0
            ? `战报任务：${sceneLabel(S.current.id)} ${cur + 1}/${G.app.warreport.WAR_TARGET}`
            : `战报任务：${sceneLabel(S.current.id)} 已达成！按 Z 打开战报领取`)
        }
      }

      // ---- 战后喘息：恢复一部分生命 ----
      // 一个场景里有 1~2 只怪，如果打完不回血，连续遭遇就是必死螺旋
      // （实测只回 30% 时"两连战"存活率仍然只有 30~50%）。赢一场回 45% 上限。
      const gain = Math.round(save.data.maxHp * 0.45)
      if (save.data.hp < save.data.maxHp) {
        const before2 = save.data.hp
        save.data.hp = Math.min(save.data.maxHp, save.data.hp + gain)
        b.log.push(`战后恢复生命 +${save.data.hp - before2}`)
      }
      save.persist()
      return true
    }
    if (b.player.dead) {
      b.phase = 'over'; b.victory = false
      b.log.push('你被击倒了…')
      return true
    }
    return false
  }

  function battleTick(dt) {
    const b = S.battle
    if (!b) return
    b.animT += dt
    // 开场演出：这段时间只放动画，不接受指令
    if (b.intro > 0) {
      b.intro -= dt
      for (const u of [b.player, ...b.enemies]) if (u.flash > 0) u.flash -= dt
      // 开场演出结束 → 排出第一回合的出手顺序。
      // 若最快的不是玩家，这里就会直接让敌人先出手（"速度决定谁先进入回合"）。
      if (b.intro <= 0 && !b.turnStarted) { b.turnStarted = true; beginRound(b) }
      return
    }
    // 技能特效推进（结束后自动移除）
    if (b.fx && b.fx.length) b.fx = b.fx.filter((f) => FX.update(f, dt))
    // 伤害飘字推进
    if (b.floats && b.floats.length) b.floats = b.floats.filter((f) => { f.t += dt; return f.t < f.dur })
    // 命中停顿：这段时间里演出计时暂停，画面像被"砸住"一下
    let step = dt
    if (b.hitStop > 0) {
      b.hitStop -= dt
      step = dt * 0.25
    }
    if (b.action) {
      b.action.t += step        // 命中停顿时演出计时减速（见上面 step）
      for (const r of (b.action.results || [])) if (r.t) r.t.flash = Math.max(0, r.t.flash - dt)
    }
    for (const u of [b.player, ...b.enemies]) if (u.flash > 0) u.flash -= dt

    // 把战斗内的血量同步回存档。
    // 原来只在胜负结算时才写 save.data.hp，后果有两个：
    //   1) 战斗中途关掉游戏 → 血量回到开战前（回满）
    //   2) 场景顶部的血条与存档不一致
    // 每帧写一次太频繁（localStorage 有开销），所以只在**整数变化**时写。
    if (Math.round(b.player.hp) !== save.data.hp) {
      save.data.hp = Math.round(Math.max(0, b.player.hp))
    }

    if (b.phase === 'acting') {
      if (b.action && b.action.t >= b.actionDur) nextPhase()
    } else if (b.phase === 'sealing') {
      // 结印操作：每一下都有时限，超时算失误
      const s = b.seal
      if (!s) { b.phase = 'command' }
      else {
        if (s.flash > 0) s.flash -= dt
        s.stepT -= dt
        if (s.stepT <= 0) sealAdvance(false)     // 超时
      }
    } else if (b.phase === 'over') {
      b.t += dt
      if (b.t > 1.8) {
        if (b.victory) S.result = { win: true, exp: b.rewardExp, gold: b.rewardGold, name: b.enemies[0].name, dropForm: b.dropForm || null }
        else { save.data.hp = save.data.maxHp; save.data.mp = save.data.maxMp; save.persist(); S.result = { win: false, name: b.enemies[0].name } }
        S.mode = 'result'; b.t = 0
      }
    }
  }

  G.app = G.app || {}
  G.app.battle = { makeUnit, skillBlockReason, gainSp, startSeal, sealAdvance, finishSeal, useSkill,
    firstUsableSkill, nextUsableSkill, notice, battleLog, battleBtnAct, doCommand, itemRects, performItem,
    animLen, leaveBattle, startBattle, soyaAtkMul, soyaDefMul, soyaBattleStats, soyaAttacker,
    expectedDamage, damage, applyBuff, perform, petAct, beginAction, tickCooldowns, actEnemy, buildTurnOrder,
    beginRound, advanceTurn, endRound, nextPhase, playerAct, checkBattleEnd, battleTick }
  // 跨应用层桥（economy / awaken / dungeon 经 G.app.notice / G.app.startBattle 取用）。
  G.app.notice = notice
  G.app.startBattle = startBattle
})()