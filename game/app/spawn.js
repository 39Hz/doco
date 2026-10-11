/* 多克多比 · 应用层：小怪刷新与重生 + 场景内容生成（第 72 轮重构批次 5）
   来源：原 game.js 第 399–701 行，内容一致（含原注释）。
   依赖：内核 G.core 的共享状态 S / 画布 W / 提示原语 toast；引擎 window.DKDbb 的 save；
   内容表 window.DKDbbData（D）。NPC 排布与任务 NPC 经 G.app.npc 惰性解析，
   时装池 costumePool 仍在 game.js，经 G.app.costumePool 惰性解析。
   只经 G.app.spawn 出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'

  const G = window.DKDbbGame
  const { S, W, toast } = G.core
  const { save } = window.DKDbb
  const D = window.DKDbbData

  // 跨应用层桥（惰性箭头：调用时才解析，故加载顺序无关）。
  const currentQuestNpcFor = (...a) => G.app.npc.currentQuestNpcFor(...a)
  const npcPositions = (...a) => G.app.npc.npcPositions(...a)
  const costumePool = (...a) => G.app.costumePool(...a)

  // ==================== 小怪刷新 ====================
  // 需求：打完怪要能刷新，不然一张图清完就永远没得打了。
  // 规则（两条，都是本项目自定的，原版刷新表未留存 → derived）：
  //   1) 打死之后计时刷新：等 RESPAWN_SEC 秒，原地重新出现；
  //   2) 重新进图（走到相邻场景再走回来 / 从大地图进来）→ 立刻全部刷新。
  // 第 2 条正好和"同一座岛内场景互通"配合：出去再进来，怪就回来了。
  const RESPAWN_SEC = 20
  function refreshSpawns(sc, force) {
    const sp = sc && sc._spawns
    if (!sp || !sp.monsters) return 0
    const now = performance.now() / 1000
    let n = 0
    for (const m of sp.monsters) {
      if (m.alive) continue
      if (force || (m.respawnAt != null && now >= m.respawnAt)) {
        m.alive = true
        m.respawnAt = null
        m.bob = Math.random() * 6.28
        m.spawnPop = 0.5          // 出场小动画（画的时候用）
        n++
      }
    }
    if (n && force) toast(`${sc.name || '这里'}的小怪又出现了（${n} 只）`, 1800)
    return n
  }
  // 每帧检查计时刷新（玩家一直待在原地也能等到怪回来）
  function tickRespawns() {
    const sc = S.current
    const sp = sc && sc._spawns
    if (!sp || !sp.monsters) return
    const now = performance.now() / 1000
    for (const m of sp.monsters) {
      if (m.alive) continue
      if (m.respawnAt != null && now >= m.respawnAt) {
        m.alive = true
        m.respawnAt = null
        m.bob = Math.random() * 6.28
        m.spawnPop = 0.5
        toast('小怪刷新了', 1400)
      }
    }
  }

  // 场景内的 NPC 与怪物（确定性，同一场景每次一致）
  function sceneSpawns(sc) {
    if (!sc) return { monsters: [], npcs: [] }   // 防御：场景还没设好时不能崩
    if (sc._spawns) return sc._spawns
    let seed = (sc.id * 2654435761) % 2147483647
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    const monsters = []
    if (sc.island && sc.kind === 'scene') {
      // 一个场景 1~2 只怪。原先随机 1~3 只，实测"三连战"存活率只有 10~30%
      // （见 _tools/check-balance.mjs 的连续遭遇模拟），儿童页游不会这么设计。
      const cnt = 1 + (rnd() < 0.25 ? 1 : 0)
      for (let i = 0; i < cnt; i++) {
        const sp = D.spawnFor(sc.island, rnd, save.data.level || 1)
        if (!sp) continue
        monsters.push({
          mon: sp.mon, level: sp.level, stats: sp.stats,
          x: 120 + rnd() * (W - 240), y: 300 + rnd() * 140,
          bob: rnd() * 6.28, alive: true,
        })
      }
    }
    // NPC：安静场景放居民；有主线任务时放任务 NPC
    //
    // 【第 40 轮：用户反馈"NPC 太多、皮肤都一样、还到处乱跑"】三条一起改：
    //   ① **数量封顶**：一个场景最多 6 个（原先主城能堆到 14 个）；
    //   ② **造型不重样**：同一个场景里优先挑没被用过的时装（原先"多克居民"用同一个种子，
    //      一屏居民长得一模一样）；
    //   ③ 拉鲁 / 肖恩普 / 小游戏向导 只在**该岛的中心场景**出现，不再满地图刷 ——
    //      它们本来就只是入口，键盘 I / J / Y 随时能开。
    const npcs = []
    // 时装造型池（真实立绘）。取不到就退回圆形占位（drawExplore 里有兜底）。
    const costumes = costumePool()
    const usedCostume = new Set()
    // 造型分配：先按 hash 挑一个；这个场景里已经用过就顺延到下一个没用过的。
    // 这样"同一个 NPC 每次进场景长得一样"仍然成立（hash 稳定），但**同屏不会撞衫**。
    const costumeOf = (name, salt) => {
      if (!costumes.length) return null
      let h = 0
      const s = String(name) + '|' + String(salt)
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
      const start = h % costumes.length
      for (let k = 0; k < costumes.length; k++) {
        const c = costumes[(start + k) % costumes.length]
        if (!usedCostume.has(c.name)) { usedCostume.add(c.name); return c }
      }
      return costumes[start]
    }
    // 该场景是不是"这座岛屿的中心场景"（第一个场景）—— 入口类 NPC 只放这儿
    const island = ((S.world && S.world.islands) || []).find((i) => i.id === sc.island) || null
    const isHub = !!(island && island.scenes && island.scenes[0] === sc.id)
    // 该场景是不是"这座岛的最右一个场景"——官方说服饰大楼在**多比大街的最右端**
    //（7k7k/178975：「服饰店在多比大街上的最右端」）。场景链的最后一个就是最右端。
    const isRightEnd = !!(island && island.scenes && island.scenes[island.scenes.length - 1] === sc.id)
    // 数量上限：**中心场景放宽到 8**（那里本来就该热闹，而且入口类 NPC 都在这儿），
    // 其他场景 5。第一版一律 6，结果中心场景里**功能型的入口 NPC 被封顶砍掉了**
    //（肖恩普 / 小游戏向导排在后面）—— 这是测试抓出来的。
    const MAX_NPC = isHub ? 8 : 5

    const questNpc = currentQuestNpcFor(sc)
    if (questNpc) {
      npcs.push({
        x: 300, y: 360, name: questNpc.name, quest: questNpc.quest, lines: questNpc.lines,
        bob: rnd() * 6.28, costume: costumeOf(questNpc.name, sc.id),
      })
    }
    // ★ 官方 NPC（第 36 轮）：来自归档的官方策划表 `npc大全\NPC.xlsx`（70 个 NPC，逐字对话）。
    // 只有"位置与我们的场景/岛屿/地形**精确同名**"的才会被放到这里（放置规则写在 _tools/gen-npcs.mjs），
    // 对不上的 50 个老老实实待在 unmapped 名单里，不硬塞（R9）。
    // 与任务 NPC 重名的跳过 —— 任务 NPC 有自己的剧情线，不能出现两个同名的人。
    // 第 40 轮：**每个场景最多放 3 个**（原先智慧学堂那一屏挤了 7 个官方 NPC）。
    // 但封顶不能把"有功能的"挤掉 —— 带小游戏关联的（V56）优先保留：
    // 之前按原顺序砍，正好把「飞行员多比」（关联王牌大空战）砍掉了。
    const officialHere = (D.officialNpcsFor ? D.officialNpcsFor(sc.id) : [])
    const linked = officialHere.filter((o) => D.npcMinigameLink && D.npcMinigameLink(o.id))
    const rest = officialHere.filter((o) => !(D.npcMinigameLink && D.npcMinigameLink(o.id)))
    const officialPick = linked.concat(rest).slice(0, isHub ? 2 : 3)
    for (const on of officialPick) {
      if (questNpc && questNpc.name === on.displayName) continue
      const lines = []
      if (on.hover) lines.push({ who: on.displayName, text: on.hover })
      if (on.talk) lines.push({ who: on.displayName, text: on.talk })
      if (!lines.length) continue
      // 官方描述作为最后一句补上（有就显示，没有就只显示对话）
      if (on.desc) lines.push({ who: on.displayName, text: on.desc })
      npcs.push({
        x: 140 + rnd() * 660, y: 330 + rnd() * 110, name: on.displayName,
        official: true, officialId: on.id, officialPlace: on.place,
        // 官方 NPC ↔ 小游戏的**推算关联**（表在 game/tables/minigame-links.js，每条都带理由）
        minigameLink: D.npcMinigameLink ? D.npcMinigameLink(on.id) : null,
        bob: rnd() * 6.28,
        costume: costumeOf(on.displayName, sc.id + on.id.length),
        lines,
      })
    }
    // 恢复 NPC（原版：宝石大厅的艾伦 / 维西岛屿的夏丽 —— 见 docs/官方资料库.md 12.3）。
    // 安宁场景（没有怪）一定放一个，让玩家打完几场能就近回血；
    // 野外小概率遇到（走商式的巡回恢复）。**这条优先于"居民"**，因为它有实际功能。
    if (!monsters.length || rnd() < 0.3) {
      const hName = G.app.npc.HEAL_NPCS[sc.id % G.app.npc.HEAL_NPCS.length]
      npcs.push({
        x: 150 + rnd() * 480, y: 330 + rnd() * 90, name: hName, heal: true, bob: rnd() * 6.28,
        costume: costumeOf(hName, sc.id + 13),
        lines: [
          { who: hName, text: '打累了就来找我，多比的生命我能替你补满。' },
          { who: hName, text: '战斗里也能用药，不过免费的还是这儿最实在。' },
        ],
      })
    }
    // 服饰大楼（官方：多比大街的**最右端**，找**麦基**买服饰；7k7k/178975）
    // 只放在多比大街的最后一个场景 —— 原文说的就是"最右端"，放在别处就不是那个位置了。
    if (sc.island === 'market' && isRightEnd) {
      const cShop = D.COSTUME_SHOP
      npcs.push({
        x: 620, y: 380, name: cShop.npc, costumeShop: true, bob: rnd() * 6.28,
        costume: costumeOf(cShop.npc, sc.id + 61),
        lines: [
          // 官方台词逐字（7k7k/111998）
          { who: cShop.npc, text: cShop.greeting },
          { who: cShop.npc, text: '这里是服饰大楼，多比大街最右端就是我家。' },
          { who: cShop.npc, text: '买了衣服还能附魔 —— 用虚空水晶，变身成多比照样算数。' },
        ],
      })
    }
    // 商贩：只放**中心场景**（原版道具就是在 多比大街/索亚城 的店铺里买的）
    const isTown = ['castle', 'market'].includes(sc.island) || !monsters.length
    if (isHub && isTown) {
      const shopName = SHOP_NPCS[sc.id % SHOP_NPCS.length]
      npcs.push({
        x: 420 + rnd() * 300, y: 350 + rnd() * 80, name: shopName, shop: true, bob: rnd() * 6.28,
        costume: costumeOf(shopName, sc.id + 7),
        lines: [
          { who: shopName, text: '来看看货吧，恢复、强化、投掷的家伙我这儿都有。' },
          { who: shopName, text: '打起架来光靠技能可不够，背包里备点道具心里才有底。' },
        ],
      })
    }
    // 副本传送 NPC：官方原文点名「迷失里的**拉鲁**，可以将你的队伍传送到金字塔」。
    // 第 40 轮起**只在中心场景**出现（原先按岛随机刷，满地图都是他）。
    if (isHub && ['castle', 'market', 'forest'].includes(sc.island)) {
      const gName = '拉鲁'          // 官方 NPC 名（原文）
      npcs.push({
        x: 300 + rnd() * 320, y: 350 + rnd() * 70, name: gName, dungeonGate: true, bob: rnd() * 6.28,
        costume: costumeOf(gName, sc.id + 29),
        lines: [
          { who: gName, text: '要进副本吗？我可以把队伍传送过去。' },
          { who: gName, text: '金字塔、火烧赤壁、大禹治水……每个副本的玩法都不一样。' },
        ],
      })
    }
    // 珍宝小屋的入口 NPC：官方原文「在圣多克骑士厅那里找**肖恩普**就可以进入珍宝小屋」。
    // 「圣多克骑士厅」在我们的岛表里没有同名地点 → 放在中心场景（derived，V41）。
    if (isHub && ['castle', 'market'].includes(sc.island)) {
      const tName = '肖恩普'        // 官方 NPC 名（原文）
      npcs.push({
        x: 560 + rnd() * 260, y: 340 + rnd() * 70, name: tName, treasure: true, bob: rnd() * 6.28,
        costume: costumeOf(tName, sc.id + 41),
        lines: [
          { who: tName, text: '珍宝小屋开张啦～稀有多比技能、珍稀索亚，这儿都有。' },
          { who: tName, text: '只要你有足够的白色彩晶石，我尽量满足你的愿望。' },
        ],
      })
    }
    // 小游戏入口 NPC：官方原文只说「多克多比游戏中有个**专门介绍这些游戏的 npc** 哦~」，
    // 但**没有给出名字** → NPC 名是我起的（derived，见 V52），对话里直接向玩家说明这一点。
    if (isHub && ['castle', 'market'].includes(sc.island)) {
      const mName = '小游戏向导'    // ← 非官方名（语料未给出），已登记为 derived
      npcs.push({
        x: 180 + rnd() * 300, y: 380 + rnd() * 60, name: mName, miniGate: true, bob: rnd() * 6.28,
        costume: costumeOf(mName, sc.id + 52),
        lines: [
          { who: mName, text: '想玩点轻松的？记忆水晶、魔法工匠、思维方块……这儿都能玩。' },
          { who: mName, text: '（我的名字在归档的资料里没写，是移植时起的 —— 玩法和奖励都照原版。）' },
        ],
      })
    }
    // ── 第 47 轮：两个**官方点名的小游戏 NPC**（各自的位置写在官方攻略页上）──
    // 依据（逐字见 docs/官方资料库.md 16.1 / 16.4）：
    //   「游戏名称：哈里的金币／游戏地点：商业街—多比大街／NPC名称：华多」（7k7k/660617）
    //   「游戏名称：魔镜世界／游戏地点：多比城堡—智慧学堂／NPC名称：安迪」（7k7k/660928）
    // 这两个名字**不在官方 NPC 表（NPC.xlsx 70 条）里** —— 因为他们不是剧情 NPC，只在攻略页出现。
    // 所以按 R2 标为 community（出自当年官方专区的攻略页），并在对话里如实写明出处。
    if (isHub && sc.island === 'market') {
      const hName = '华多'
      npcs.push({
        x: 620 + rnd() * 120, y: 380 + rnd() * 40, name: hName, miniGate: true, miniId: 'harryCoin',
        bob: rnd() * 6.28, costume: costumeOf(hName, sc.id + 71),
        lines: [
          { who: hName, text: '金币掉下来的时候，把箱子挪过去接住就行 —— 后面的关会越来越快。' },
          { who: hName, text: '（玩法和我的位置出自 7k7k 的攻略页「游戏地点：商业街—多比大街　NPC名称：华多」。）' },
        ],
      })
    }
    if (isHub && sc.island === 'castle') {
      const aName = '安迪'
      npcs.push({
        x: 560 + rnd() * 160, y: 350 + rnd() * 50, name: aName, miniGate: true, miniId: 'mirrorWorld',
        bob: rnd() * 6.28, costume: costumeOf(aName, sc.id + 83),
        lines: [
          { who: aName, text: '魔镜世界里方向是反的 —— 躲开怪物、打开箱子，把钥匙找出来。' },
          { who: aName, text: '（出处：攻略页写「游戏地点：多比城堡—智慧学堂　NPC名称：安迪」。）' },
        ],
      })
    }
    // 居民：**只在人少的时候补**，而且只在没有官方 NPC 的场景里（官方 NPC 本身就是内容，
    // 不能再拿通用居民去挤）。原先"有怪 70% 也放一个"，一屏两三个居民却没一句话有用的。
    if (npcs.length <= 2 && !officialHere.length && rnd() < 0.5) {
      const npcName = '多克居民'
      npcs.push({
        x: 200 + rnd() * 520, y: 340 + rnd() * 100, name: npcName, bob: rnd() * 6.28,
        costume: costumeOf(npcName, sc.id),
        lines: [
          { who: npcName, text: `这里是${sc.islandName || '浮空群岛'}。风景不错吧？` },
          { who: npcName, text: '按 Tab 可以打开大地图，去别的岛看看。' },
        ],
      })
    }
    // 封顶。**入口类 NPC 一个都不许砍** —— 砍的只能是居民，其次是官方 NPC。
    //
    // 【为什么把优先级写成代码】第 40 轮就栽过一次：「肖恩普 / 小游戏向导 排在后面，
    // 被 MAX_NPC 砍掉了」，当时的修法是"把它们往前挪"。可那只解决了那一次 ——
    // 第 45 轮加「麦基」时同样的位置问题又发生了一次（多比大街最右端的场景已经有 5 个 NPC，
    // 麦基 push 在后面，直接被截掉，而且**不报错**，界面看起来只是"这店里没人"）。
    // 所以这次不再靠 push 顺序碰运气：把"谁是入口"写成判据，按类裁剪。
    const isEntrance = (n) => !!(n.quest || n.shop || n.dungeonGate || n.treasure
      || n.miniGate || n.costumeShop || n.heal)
    if (npcs.length > MAX_NPC) {
      const must = npcs.filter(isEntrance)
      const rest = npcs.filter((n) => !isEntrance(n))
      // 入口类全留；剩下的名额先给官方 NPC（他们的台词是官方内容），居民最后。
      const room = Math.max(0, MAX_NPC - must.length)
      const officialRest = rest.filter((n) => n.official)
      const others = rest.filter((n) => !n.official)
      const kept = must.concat(officialRest.slice(0, room))
      const room2 = Math.max(0, room - officialRest.length)
      npcs.length = 0
      for (const n of kept.concat(others.slice(0, room2))) npcs.push(n)
      // 硬上限：入口本身就多的时候也不能堆成一屏十几个人（第 40 轮用户反馈过）
      if (npcs.length > 9) {
        const ent = npcs.filter(isEntrance)
        npcs.length = 0
        for (const n of ent.slice(0, 9)) npcs.push(n)
      }
    }
    // 排布：**两行**均匀铺开，并留出两边 200px 的安全区。
    // 【为什么留边】第一版从 130 铺到 830，结果两端的 NPC 正好压在
    // 场景出口箭头上（ui-overlap 报"面板盖住精灵 15~23%"）——
    // 出口标记占 x∈[0,116] 和 [844,960]，所以 NPC 只在 200~760 之间排。
    // 列数/行数一律由 npcPositions 统一算（界面与测试读同一份实现）。
    {
      const pos = npcPositions(npcs.length)
      for (let i = 0; i < npcs.length; i++) {
        npcs[i].x = pos.points[i].x
        npcs[i].y = pos.points[i].y
      }
    }
    sc._spawns = { monsters, npcs }
    return sc._spawns
  }
  // 商贩名字：原版 NPC 名单里挑几个像店主的（见 assets/gamedata.js 的角色名）
  const SHOP_NPCS = ['杂货商人', '道具店老板', '旅行商人', '香料铺掌柜']

  G.app = G.app || {}
  G.app.spawn = { RESPAWN_SEC, refreshSpawns, tickRespawns, sceneSpawns, SHOP_NPCS }
})()