/* 多克多比 · 应用层：NPC 排布 + 功能菜单 + 恢复生命（第 72 轮重构批次 5）
   来源：原 game.js 第 101–133、768–914、2151–2175 行，内容一致（含原注释）。
   依赖：内核 G.core 的共享状态 S 与画布 W；引擎 window.DKDbb 的 util / save / audio；
   鼠标 window.DKDbbMouse；任务表 window.DKDbbQuest；内容表 window.DKDbbData。
   对话 / 唤醒 / 副本已迁出，直接指向最终模块 G.app.dialog / G.app.awaken / G.app.dungeon；
   商店 / 珍宝 / 服饰 / 小游戏入口与 MINI 仍在 game.js，经 G.app.* 惰性解析
   （各自迁出后删掉对应临时桥）。只经 G.app.npc 出口对外，game.js 用「解构 shim」取用
   （调用点一处不改）。 */
(() => {
  'use strict'

  const G = window.DKDbbGame
  const { S, W, toast } = G.core
  const { util, save, audio } = window.DKDbb
  const D = window.DKDbbData
  const Q = window.DKDbbQuest
  const M = window.DKDbbMouse

  // 跨应用层桥（惰性箭头：调用时才解析，故加载顺序无关）。
  const say = (...a) => G.app.dialog.say(...a)
  const playQuest = (...a) => G.app.dialog.playQuest(...a)
  const lockedForms = (...a) => G.app.awaken.lockedForms(...a)
  const dungeonState = (...a) => G.app.dungeon.dungeonState(...a)
  const openShop = (...a) => G.app.shop.openShop(...a)
  const openAwaken = (...a) => G.app.openAwaken(...a)
  const openTreasure = (...a) => G.app.openTreasure(...a)
  const openCostumeShop = (...a) => G.app.shop.openCostumeShop(...a)
  const startMinigame = (...a) => G.app.minigame.startMinigame(...a)
  const openMinigames = (...a) => G.app.minigame.openMinigames(...a)

  // ── NPC 排布的**唯一实现**（界面与测试共用，避免两边算法分叉）──
  // 第 46 轮抽出来，因为 check-scene-npc.mjs 要核对"每个人都在画面内"，
  // 如果测试自己再算一遍列数，就会出现本仓库反复记过的"同一逻辑两份实现 → 一定分叉"。
  const NPC_ROW_Y = [330, 430, 500]      // 画布 560；主用两行 330/430（430+70=500 ≤ 560），500 只是兜底
  const NPC_COSTUME_H = 70               // 立绘约 70px 高，用于"脚底不出画"的判定
  const NPC_ZONE = { x0: 200, x1: 760 }  // 左右各留 200：出口箭头占 x<116 与 x>844
  const NPC_MIN_GAP = 60                 // 同一行相邻两人的最小间距（立绘宽约 40，留出让玩家点得准的余量）
  function npcLayout(n) {
    // 【为什么这样取列数】
    // 硬上限是 9 人（第 40 轮"一屏 14 个人"之后定的），而画布只有 560 高：
    //   · 两行主位 y=330/430，立绘 70 高 → 脚底 500 ≤ 560，安全；
    //   · 第三行 y=500 → 脚底 570 **超出画布**（第 46 轮 check-scene-npc 抓到的真 bug：
    //     第 9 个人被摆到画面外，玩家看不见也点不到，而当时所有测试都是绿的）。
    // 所以列数必须**保证 ≤9 人只用两行**：
    //   ≤3 人一行、4~6 人两行三列、7~8 人两行四列、9 人两行五列 —— 全部脚底 500，永不出画。
    // 行数由 ceil(n/cols) 得出（不再写死两行，避免"人多了就往下堆"再次出画）。
    const cols = n <= 0 ? 1 : n <= 3 ? n : n <= 6 ? 3 : n <= 8 ? 4 : 5
    return { cols, rows: Math.max(1, Math.ceil(n / cols)), rowY: NPC_ROW_Y.slice() }
  }
  function npcPositions(n) {
    const lay = npcLayout(n)
    const spanX = NPC_ZONE.x1 - NPC_ZONE.x0
    const out = []
    for (let i = 0; i < n; i++) {
      const col = i % lay.cols, row = Math.floor(i / lay.cols)
      out.push({
        x: lay.cols === 1 ? W / 2 : NPC_ZONE.x0 + col * (spanX / (lay.cols - 1)),
        y: NPC_ROW_Y[Math.min(row, NPC_ROW_Y.length - 1)],
        row, col,
      })
    }
    return { ...lay, points: out, bottom: out.length ? Math.max(...out.map((p) => p.y)) + NPC_COSTUME_H : 0 }
  }

  // 当前主线任务该在哪个场景找谁 —— 用任务里记录的场景/角色信息
  function currentQuestNpcFor(sc) {
    const q = Q.currentMain(save.data)
    if (!q) return null
    // 任务第一步的 meta 里记录的 NPC 名（台词里第一个非玩家说话人）
    const first = q.steps[0]
    if (!first) return null
    const speaker = first.lines.find((l) => l.who !== '@player' && l.kind !== 'choice' && l.who !== '旁白')
    if (!speaker) return null
    // 只在「主城」类场景布置主线 NPC，避免每个场景都出现
    if (!['castle', 'market', 'wilds'].includes(sc.island)) {
      return sc.id === (save.data.questScene || sc.id) ? null : null
    }
    return { name: speaker.who, quest: q, lines: null }
  }

  // ==================== NPC 功能菜单 ====================
  // 原版交互（据 7k7k 剧情攻略）：点击 NPC → 弹出带选项文字的菜单 → 选择后触发
  //   例：点击沙拉塔 → 选「沙拉塔的收获」开始任务；点击霍卡 → 选「博学的霍卡」
  function openActorMenu(npc) {
    const items = []
    if (npc.shop) {
      items.push({
        label: `${npc.name}的货架`, hint: `道具 · 金币 ${save.data.gold}`,
        action: () => openShop(),
      })
      items.push({
        label: '打听行情', hint: '闲聊',
        action: () => say([
          { who: npc.name, text: '金币打怪就有，攒够了就换成道具，别舍不得。' },
          { who: npc.name, text: '恢复的、强化的、扔出去砸人的，我这儿都齐。' },
        ]),
      })
    }
    if (npc.heal) {
      items.push({
        label: `请${npc.name}恢复生命`, hint: `免费 · HP ${save.data.hp}/${save.data.maxHp}`,
        action: () => doHeal(npc),
      })
      // 原文：「小多克们可以去**宝石大厅**唤醒多比哦。在宝石大厅那里，还有多比的唤醒条件」
      //      「多比恢复的 npc 有：**宝石大厅的艾伦**」
      // 艾伦是原文里唯一有名有姓的"宝石大厅 NPC" → 由他引导唤醒（这层关联是推算，见 V42）
      items.push({
        label: '唤醒多比', hint: `宝石大厅 · 未拥有 ${lockedForms().length} 只`,
        action: () => openAwaken(),
      })
    }
    if (npc.treasure) {
      items.push({
        label: '进入珍宝小屋', hint: `白彩 ${save.data.white || 0} · 碎片 ${save.data.shards || 0}`,
        action: () => openTreasure(),
      })
    }
    if (npc.dungeonGate) {
      // 原版：副本由特定 NPC 传送进入（原文举例「迷失里的拉鲁，可以将你的队伍传送到金字塔」）
      items.push({
        label: '传送到副本', hint: `官方 14 个 · ${D.playableDungeons().length} 个可玩`,
        action: () => {
          dungeonState().phase = 'list'; S.dunSel = 0; S.dunHover = -1
          S.mode = 'dungeon'
        },
      })
    }
    if (npc.costumeShop) {
      // 官方：「进入大楼后，点击麦基购买服饰」（7k7k/178975）
      const own = Object.keys(save.data.costumes || {}).length
      items.push({
        label: '买服饰（服饰大楼）', hint: `官方 ${D.costumeStock ? D.costumeStock(window.__DKDbb_ANIM__).length : 0} 套 · 已有 ${own} 套`,
        action: () => openCostumeShop(),
      })
      items.push({
        label: '附魔服饰', hint: `虚空水晶 ${save.data.voidCrystal || 0} 个`,
        action: () => openCostumeShop(),
      })
    }
    if (npc.miniGate) {
      // 第 47 轮：攻略页点名过"谁开哪个小游戏"的 NPC（华多→哈里的金币、安迪→魔镜世界）
      // 直接开那一个，而不是把整个列表丢给玩家。依据见 NPC 定义处的注释与 docs/官方资料库.md 16 章。
      const specific = npc.miniId ? D.minigameById(npc.miniId) : null
      if (specific) {
        items.push({
          label: `玩「${specific.name}」`,
          hint: '出处：官方攻略页点名了这个地点与 NPC',
          action: () => startMinigame(specific.id),
        })
      }
      items.push({
        label: specific ? '看其它小游戏' : '去玩小游戏',
        hint: `已知 ${D.MINIGAMES.length} 个 · ${D.playableMinigames().length} 个可玩`,
        action: () => { G.app.minigame.MINI.from = 'explore'; openMinigames() },
      })
    }
    // ★ 官方 NPC ↔ 小游戏的**推算关联**（第 37 轮）：官方台词里点到了某个小游戏的主题/名字，
    // 于是让这位 NPC 直接开启它。**这是推算，不是原文点明**（原文只说"有个介绍小游戏的 NPC"），
    // 所以：① 关联表记在 `game/tables/minigame-links.js` 里、每条都带理由与 conf；
    //      ② 菜单提示语里直接写「推算关联」，不让玩家以为是官方设定。
    if (npc.minigameLink) {
      const mg = D.minigameById(npc.minigameLink.id)
      if (mg) {
        items.push({
          label: `玩：${mg.name}`,
          hint: (mg.impl ? '' : '（机制未实现）') + '推算关联 · 台词里提到过',
          action: () => { G.app.minigame.MINI.from = 'explore'; startMinigame(mg.id) },
        })
      }
    }
    if (npc.quest) {
      const q = npc.quest
      items.push({
        label: questMenuLabel(npc.name, q), hint: `主线 · ${q.steps.length} 步`,
        action: () => playQuest(q),
      })
      items.push({
        label: '打听消息', hint: '闲聊',
        action: () => say([
          { who: npc.name, text: '你手上还有要紧的事，先把该办的办了吧。' },
          { who: npc.name, text: '按 Q 可以查看任务列表。' },
        ]),
      })
    } else {
      // 根据 NPC 名生成一句像原版的功能条目
      items.push({
        label: `与${npc.name}交谈`, hint: '对话',
        action: () => say(npc.lines || [{ who: npc.name, text: '……' }]),
      })
      items.push({
        label: `关于${S.current.islandName || '这里'}`, hint: '情报',
        action: () => say([
          { who: npc.name, text: S.current.desc || '这一带还算太平。' },
          { who: npc.name, text: `这里的场景编号是 ${S.current.id}，共用 ${S.current.w}×${S.current.h} 的原版素材。` },
        ]),
      })
    }
    items.push({ label: '离开', hint: 'Esc', action: () => { } })
    // 菜单出现在 NPC 头顶。
    // 注意：必须**在这里**就把宽高算出来，不能等 drawMenu 里再赋值 ——
    // M.menuHitTest 依赖 m.w/m.h，如果它们还是 undefined，`mx <= m.x + m.w` 就是 NaN 比较，
    // 恒为 false，于是"点选项"会被判成"点菜单外面"而直接关掉菜单（这就是菜单点不动的根因）。
    const menuSize = M.measureMenu(items, npc.name)
    const w = menuSize.w, h = menuSize.h
    M.openMenu(npc.name, items, util.clamp(npc.x - w / 2, 8, W - w - 8), Math.max(8, npc.y - 150), w, h)
  }

  // 菜单条目文字：主城类 NPC 用「XX的收获」这种原版风格命名
  function questMenuLabel(npcName, q) {
    return `${q.title}`.length <= 10 ? q.title : `${q.title.slice(0, 10)}…`
  }

  // ==================== 恢复生命 NPC（原版系统，有官方原文依据）====================
  //
  // 官方依据（7k7k/178965《多克多比恢复生命》原文）：
  //   「多比战斗时会有生命的消耗，所以小多克可以选择多种方式恢复生命。
  //     1，战斗时，可以使用加血技能恢复，还可以使用背包中的药品恢复生命。
  //     2，非战斗时，小多克可以找到多比恢复的 npc 来恢复多比的生命。
  //     多比恢复的 npc 有：宝石大厅的艾伦、维西岛屿的夏丽…」
  //
  // 落地：安宁场景（无怪）里放恢复 NPC，交互即回满 HP/MP。
  // **派生部分（derived）**：原文只给了两个 NPC 名字和所属地点，
  // 没给"具体哪张图有"，所以这里让恢复 NPC 出现在所有无怪场景里（并在 deviations 登记）。
  const HEAL_NPCS = ['艾伦', '夏丽']        // 官方 NPC 名（原文）
  function healerFor(sc) {
    if (!sc) return null
    return HEAL_NPCS[sc.id % HEAL_NPCS.length]
  }
  function doHeal(npc) {
    const d = save.data
    const needHp = d.hp < d.maxHp, needMp = d.mp < d.maxMp
    if (!needHp && !needMp) { toast(`${npc.name}：你精神得很，不用恢复。`); return }
    d.hp = d.maxHp; d.mp = d.maxMp
    save.persist()
    audio.sfx('assets/sfx/onClick_03.mp3')
    toast(`${npc.name}为你恢复了生命与魔法　HP ${d.maxHp} / MP ${d.maxMp}`)
  }

  G.app = G.app || {}
  G.app.npc = { NPC_ROW_Y, NPC_COSTUME_H, NPC_ZONE, NPC_MIN_GAP, npcLayout, npcPositions,
    currentQuestNpcFor, openActorMenu, questMenuLabel, HEAL_NPCS, healerFor, doHeal }
})()