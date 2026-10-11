/* 多克多比 · 应用层：白色彩晶石经济 + 珍宝小屋 + 在线礼包（第 72 轮重构 · 批次 4）
   来源：原 `game/game.js` 第 2552–2731 行，内容一致（含官方依据注释）。
   依赖：引擎 `window.DKDbb`（save / audio / util）+ 内容表 `window.DKDbbData`（D）
        + 内核 `G.core.toast` + 跨应用层桥：`G.app.notice`（战斗播报，批次 6 迁出）、
        `G.app.grantForm`（唤醒用例，本批次下一个模块迁出）。
   只经 `G.app.economy` 出口对外，`game.js` 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'

  const G = window.DKDbbGame
  const { save, audio, util } = window.DKDbb
  const D = window.DKDbbData
  const { toast } = G.core
  const notice = (...a) => G.app.notice(...a)
  const grantForm = (name) => G.app.grantForm(name)

  // ==================== 白色彩晶石经济 + 珍宝小屋（M4-4，官方系统）====================
  //
  // 官方依据：
  //   · 碎片来源（7k7k/177905）：「小多克们可以在**维西岛的精英怪、副本的BOSS、野外BOSS**身上
  //     有一定机率获得白色彩晶石碎片」，并且「可以把白色彩晶石碎片合成为白色彩晶石」，
  //     但「由于大宝石的能量有限，**每个玩家每天最多只能合成 5 块**白色彩晶石」
  //   · 珍宝小屋（7k7k/177906）：在**圣多克骑士厅**找**肖恩普**进入，用**白色彩晶石**购买，
  //     点名可以买到**稀有多比技能**与**珍稀索亚**，大类有 道具/战斗道具/技能/服饰
  //   · 积分超市（7k7k/528376）：「**每消费 1 白色彩晶石就会自动获得 1 积分**」
  // 落地时自定的部分（derived，已登记 deviations V40/V41）：掉落概率、几碎片合一块、价格。
  const TREASURE_DAILY = () => D.treasureDailyLimit()
  const SHARDS_PER = () => D.treasureShardsPerCrystal()

  // 本地日期键（跨天要重置"今天合成了几块"）
  function dayKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  function rollCrystalDay() {
    const k = dayKey()
    if (save.data.crystalDay !== k) {
      save.data.crystalDay = k
      save.data.crystalToday = 0
      save.persist()
    }
  }
  function crystalsToday() {
    rollCrystalDay()
    return save.data.crystalToday || 0
  }

  // 合成：碎片 → 白色彩晶石（每日上限 5 块）
  function synthesizeCrystal() {
    rollCrystalDay()
    const need = SHARDS_PER(), left = TREASURE_DAILY() - (save.data.crystalToday || 0)
    if (left <= 0) { notice(`今天已经合成 ${TREASURE_DAILY()} 块了（原文：每天最多合成 5 块），明天再来`); return false }
    if ((save.data.shards || 0) < need) { notice(`碎片不够：需要 ${need} 块，现有 ${save.data.shards || 0} 块`); return false }
    save.data.shards -= need
    save.data.white = (save.data.white || 0) + 1
    save.data.crystalToday = (save.data.crystalToday || 0) + 1
    save.persist()
    audio.sfx('assets/sfx/onClick_03.mp3')
    toast(`合成成功：白色彩晶石 +1　今天还可合成 ${left - 1} 块`)
    return true
  }

  // 购买：花白色彩晶石，同时按原文给积分
  function treasureBuy(goods) {
    if (!goods) return false
    const cost = goods.white || 0
    if ((save.data.white || 0) < cost) { notice(`白色彩晶石不够：需要 ${cost} 块，现有 ${save.data.white || 0} 块`); return false }
    if (goods.kind === 'soya') {
      if ((save.data.soya || []).includes(goods.id)) { notice('这只索亚已经拥有了'); return false }
      save.data.soya.push(goods.id)
      save.data.soyaActive = goods.id
    } else if (goods.kind === 'void') {
      // 官方：「虚空水晶获得方式：**在珍宝小屋中购买**…」（7k7k/530436）
      // 价格与每次给几个官方没给 → derived（写在 game/tables/costumes.js 的 D.VOID_CRYSTAL 里）
      const V = D.VOID_CRYSTAL
      save.data.voidCrystal = (save.data.voidCrystal || 0) + V.price.amount
    } else if (goods.kind === 'form') {
      // 【第 52 轮】兑换多比形态。官方那些"限定形态"原版靠**运营活动/掉落**，
      // 单机版没有活动 → 用官方货币白色彩晶石换（用途是我们加的，登记 V72）。
      // 【第 66 轮】改走唯一发放入口 —— 没有立绘的形态连货架都不该上，
      // 这里再挡一次是因为**库存列表和发放是两条独立的代码路径**（防脱节）。
      const name = goods.formName || goods.id
      const g = grantForm(name)
      if (!g.ok) { notice(g.why); return false }
      toast(`★ 兑换成功！获得战斗形态「${name}」`)
    } else {
      save.data.items[goods.id] = (save.data.items[goods.id] || 0) + 1
    }
    save.data.white -= cost
    save.data.points = (save.data.points || 0) + cost   // 原文：每消费 1 白彩 = 1 积分
    save.persist()
    audio.sfx('assets/sfx/onClick_03.mp3')
    if (goods.kind !== 'form') toast(`买下「${goods.name}」　-${cost} 白色彩晶石　+${cost} 积分`)
    else toast(`★ 兑换「${goods.name}」　-${cost} 白色彩晶石　+${cost} 积分`)
    return true
  }

  // 战斗掉落：副本 BOSS 必掉；精英/野外BOSS 与**普通野外怪**按概率。
  // 【第 54 轮】普通怪从"不掉"改成 0.4 —— 依据与理由见 game/tables/treasure.js 的 SHARD_DROP 注释：
  //   单机版没有运营活动，若普通怪不掉，碎片就凑不齐 → 形态永远拿不到（用户的原话）。
  function rollShardDrop(opts = {}) {
    const rate = opts.dungeonBoss ? D.SHARD_DROP.dungeonBoss
      : (opts.bossTier ? D.SHARD_DROP.bossTier : D.SHARD_DROP.normal)
    if (!rate) return 0
    if (Math.random() >= rate) return 0
    save.data.shards = (save.data.shards || 0) + 1
    save.persist()
    return 1
  }

  // ==================== 在线礼包（第 54 轮，官方原文）====================
  //
  // 原文（7k7k/178665、7k7k/179049）：
  //   「小多克在多克多比的世界里达到 10 分钟、20 分钟、30 分钟都会得到一份在线大礼包。
  //     在线的时间越长，礼包的内容也越丰厚！其中还有稀有的白色彩晶石碎片和竞技勋章等着你哦！
  //     点击游戏右上角的"在线奖励"按钮，即可领取奖励。」
  //
  // 【为什么单机版必须补这个】用户原话：「单机必须要能打了就能获得碎片，不然怎么获得角色」。
  //   碎片 → 白色彩晶石 → 兑换/唤醒形态，而单机版**没有运营活动**。
  //   原文点名的碎片来源里：「小游戏 S 级」做不了（评级标准官方没给，本作明确不做评级）、
  //   「幸运转盘 / 箱子怪」是限时活动；**只有"在线礼包"既有原文依据、又能无损落地**。
  //   所以这条既是修复获取途径，也是照原文还原。
  //
  // 档位：三个时间点（10/20/30 分钟）与"越久越丰厚"= official；碎片/金币数量 = derived。
  const ONLINE_GIFTS = [
    { min: 10, shards: 2, gold: 300 },
    { min: 20, shards: 3, gold: 600 },
    { min: 30, shards: 5, gold: 1200 },
  ]
  function onlineGiftReady() {
    const claim = save.data.onlineGift || (save.data.onlineGift = {})
    const mins = (save.data.playSeconds || 0) / 60
    return ONLINE_GIFTS.filter((g) => mins >= g.min && !claim[g.min])
  }
  function claimOnlineGift() {
    const ready = onlineGiftReady()
    if (!ready.length) {
      const next = ONLINE_GIFTS.find((g) => (save.data.playSeconds || 0) / 60 < g.min)
      toast(next
        ? `在线礼包：再玩 ${Math.ceil(next.min - (save.data.playSeconds || 0) / 60)} 分钟可领`
        : '在线礼包已全部领完')
      return false
    }
    const claim = save.data.onlineGift || (save.data.onlineGift = {})
    let sh = 0, gd = 0
    const got = []
    for (const g of ready) {
      claim[g.min] = 1
      sh += g.shards; gd += g.gold
      got.push(`${g.min}分钟`)
    }
    save.data.shards = (save.data.shards || 0) + sh
    save.data.gold = (save.data.gold || 0) + gd
    save.persist()
    toast(`★ 在线礼包（${got.join('、')}）：白色彩晶石碎片 ×${sh}　金币 ${gd}`, 2600)
    audio.sfx('assets/sfx/onMouseOver_03.mp3')
    return true
  }
  // 到点提示一次（不自动发 —— 照原文"点击按钮领取"）
  let onlineGiftHinted = 0
  function tickOnlineGift() {
    const ready = onlineGiftReady()
    if (!ready.length) return
    const key = ready[ready.length - 1].min
    if (onlineGiftHinted === key) return
    onlineGiftHinted = key
    notice(`在线礼包可领（${ready.map((g) => g.min + '分钟').join('、')}）—— 按 T 或点右上角「礼包」`)
  }

  const TREASURE = { tabs: ['碎片合成', '珍宝兑换'], tab: 0, sel: 0, page: 0 }
  const TREASURE_PER_PAGE = 12        // 2 列 × 6 行
  function treasureAll() { return TREASURE.tab === 1 ? D.treasureStock() : [] }
  function treasurePages() { return Math.max(1, Math.ceil(treasureAll().length / TREASURE_PER_PAGE)) }
  // 【第 52 轮】必须分页：兑换页加了 33 种多比形态后一共 47 件，
  // 旧版式（不分页、从 y=146 往下排）直接画到屏幕外 —— 切片断言 check-canvas-text
  // 当场报「珍宝小屋·兑换 越界 87 条」，test-treasure 也报"47 个商品矩形都在屏内"假红。
  function treasureList() {
    const all = treasureAll()
    const pages = Math.max(1, Math.ceil(all.length / TREASURE_PER_PAGE))
    TREASURE.page = util.clamp(TREASURE.page || 0, 0, pages - 1)
    const start = TREASURE.page * TREASURE_PER_PAGE
    return all.slice(start, start + TREASURE_PER_PAGE)
  }
  function treasurePageInfo() {
    const all = treasureAll()
    const pages = Math.max(1, Math.ceil(all.length / TREASURE_PER_PAGE))
    return { total: all.length, pages, page: TREASURE.page || 0 }
  }
  function treasureRects(list) {
    // 行高要**给页脚留空间**：每页最多 12 件 = 6 行，6*(38+6) = 264，从 146 起 → 末行到 410，
    // 页脚从 470 往下排，中间还留得下页码行。（早先用 ch=42/gap=8 → 末行到 496，压住页脚，截图发现。）
    const cols = 2, cw = 430, ch = 38, gap = 6, x = 40, y = 146
    return list.map((_, i) => {
      const c = i % cols, r = Math.floor(i / cols)
      return { x: x + c * (cw + gap), y: y + r * (ch + gap), w: cw, h: ch }
    })
  }

  G.app = G.app || {}
  G.app.economy = {
    TREASURE_DAILY, SHARDS_PER, dayKey, rollCrystalDay, crystalsToday,
    synthesizeCrystal, treasureBuy, rollShardDrop,
    ONLINE_GIFTS, onlineGiftReady, claimOnlineGift, tickOnlineGift,
    TREASURE, TREASURE_PER_PAGE, treasureAll, treasurePages, treasureList, treasurePageInfo, treasureRects,
  }
})()