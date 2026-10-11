/* 多克多比 · 珍宝小屋（M4-4，官方系统）
 *
 * 官方依据（7k7k/177906《多克多比珍宝小屋隆重上线》原文）：
 *   「珍宝小屋开张啦！！**稀有多比技能打不到？珍宝小屋里面有！！！珍稀索亚？珍宝小屋里面也有！**
 *     只要你又足够的**白色彩晶石**，珍宝小屋会尽可能的满足你的愿望！
 *     6 月 22 日以后，在**圣多克骑士厅**那里找**肖恩普**就可以进入珍宝小屋啦！
 *     珍宝小屋中一共包含**道具、战斗道具、技能、服饰**等几个大类！」
 *
 * 原文给了：入口 NPC（肖恩普）、地点（圣多克骑士厅）、货币（白色彩晶石）、
 *          可买的大类（道具 / 战斗道具 / 技能 / 服饰）、并且点名可以买到**珍稀索亚**。
 * 原文**没给**：具体商品名单与价格 → 价格全部为推算（derived，见 deviations V41）。
 *
 * 我们的取舍（R1：没有依据的类目宁可不做）：
 *   · **珍稀索亚** —— 有货可卖（6 只索亚里未拥有的可以买）
 *   · **道具 / 战斗道具** —— 有货可卖（从 55 件道具里**按 kind 动态取**，不写死 id）
 *   · **技能** —— 本作技能由形态自带（固定技能槽），**没有"学技能"机制** → 标 missing
 *   · **服饰** —— 归档里没有可交易的服饰道具 → 标 missing
 */
(() => {
  'use strict'
  const D = window.DKDbbData = window.DKDbbData || {}

  // 价格单位＝白色彩晶石。原文未给价格，按原金币价折算（derived）。
  const whitePriceOf = (item) => Math.max(2, Math.round((item.price || 20) / 10))

  // 店里的商品**每次打开时从真实数据解析**（不写死 id，避免道具表一变就失效）
  D.treasureStock = function () {
    const items = D.items()
    // 官方策划表里道具只有两种 kind：「恢复型」与「投掷型」。
    // ⚠️ 投掷型的字段是 **damageMul**（倍率），`damage` 是 0 —— 早先按 `damage > 0` 筛，
    // 结果「战斗道具」一件都筛不出来（测试里那条断言红了才发现）。
    const heal = items.filter((i) => i.kind === '恢复型').slice(0, 4)
    const battle = items.filter((i) => i.kind === '投掷型').slice(0, 4)
    const owned = (typeof window !== 'undefined' && window.DKDbb && window.DKDbb.save)
      ? (window.DKDbb.save.data.soya || []) : []
    const soya = (D.SOYA || []).filter((s) => !owned.includes(s.id))
    const out = []
    for (const i of heal) {
      out.push({ kind: 'item', id: i.id, name: i.name, cat: '道具', white: whitePriceOf(i), desc: i.desc })
    }
    for (const i of battle) {
      out.push({ kind: 'item', id: i.id, name: i.name, cat: '战斗道具', white: whitePriceOf(i), desc: i.desc })
    }
    for (const s of soya) {
      // 原文点名「珍稀索亚？珍宝小屋里面也有！」——价格按稀有度自定（derived）
      out.push({ kind: 'soya', id: s.id, name: s.name, cat: '珍稀索亚', white: 12, desc: s.effectLabel || s.desc || '' })
    }
    // 虚空水晶（第 45 轮）：官方明说「**在珍宝小屋中购买**」（7k7k/530436），
    // 所以这是**官方来源**，不是我们为了附魔方便自己加的。价格与一份几个为 derived。
    if (D.VOID_CRYSTAL) {
      out.push({
        kind: 'void', id: 'voidCrystal', name: `${D.VOID_CRYSTAL.name} ×${D.VOID_CRYSTAL.price.amount}`,
        cat: '附魔材料', white: D.VOID_CRYSTAL.price.white,
        desc: '给服饰附魔用（官方：服饰附魔系统通过虚空水晶赋予服饰属性）',
      })
    }
    // 【第 52 轮】多比形态兑换：官方那些"限定形态"在单机版没有运营活动可参加，
    // 必须给一条替代途径，否则 48 只形态永远拿不到（用户就是这么问的：
    // "这个咋唤醒？活动在哪？"）。这里用**官方货币**白色彩晶石换（用途是 derived，见 forms-acquire.js）。
    if (D.formExchangeStock) out.push(...D.formExchangeStock())
    return out
  }

  // 原文点名了这两类，但我们**没有对应机制/素材** → 明确标 missing，不在店里假装有
  D.TREASURE_UNAVAILABLE = [
    { cat: '技能', reason: '本作技能由形态自带（固定技能槽），没有"学技能"机制 → 无货可卖', conf: 'missing' },
    // 【第 45 轮改】原先写"归档里没有可交易的服饰道具"—— 现在服饰系统做出来了，
    // 但**官方给服饰的售卖点是「服饰大楼」找麦基**（7k7k/178975），
    // 所以珍宝小屋这一格仍然不卖服饰，理由改成这条（不是"没有素材"，是"卖点不在这"）。
    { cat: '服饰', reason: '服饰的官方售卖点是多比大街最右端的「服饰大楼」（找麦基），见 game/tables/costumes.js → 本店不重复售卖', conf: 'official' },
  ]

  // 碎片 → 白色彩晶石：几块碎片合一块？原文没写 → derived。
  // 原文只写了「每人每天最多合成 5 块白色彩晶石」（official）。
  D.treasureShardsPerCrystal = () => 3
  D.treasureDailyLimit = () => 5

  // 掉落概率（derived）：副本 BOSS 必掉；精英/野外BOSS 与**普通野外怪**按概率。
  //
  // 【第 54 轮改：普通怪从"不掉"改成会掉】用户的原话是：
  //   「因为单机必须要能打了就能获得碎片，不然怎么获得角色」
  // 这条诉求是对的，而且是**产品层面的硬约束**：碎片→白色彩晶石→兑换/唤醒形态，
  // 而单机版**没有运营活动**。原版只让"精英怪 / 副本BOSS / 野外BOSS"（7k7k/177905）掉碎片，
  // 但那三类在单机版里分布稀疏、刷新有限 —— 照原样落地，玩家会卡在"永远凑不齐一只形态"。
  // 所以把普通野外怪也接上（值 0.4 = derived，已登记 deviations）。
  // 另外原文里碎片还有几条来源（在线礼包 / 幸运转盘 / 箱子怪活动 / 小游戏S级），
  // 其中**在线礼包**已在本作落地（见 game.js 的在线礼包），它同样走这个表。
  D.SHARD_DROP = { dungeonBoss: 1.0, bossTier: 0.35, normal: 0.4, onlineGift: 1 }

})()
