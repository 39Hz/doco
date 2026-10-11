// 服饰与附魔 —— 官方系统的数据与规则（第 45 轮）
//
// 为什么单独一个文件：这两块的**规则全部来自官方原文**，数值全部是推算，
// 把"官方说了什么"和"我们定了什么数"放在一处，评审时一眼能分开（R2/R9）。
//
// ══════════════ 官方原文（逐字） ══════════════
// 【服饰大楼在哪、找谁买】（7k7k/178975）
//   「服饰店在多比大街上的最右端，名字叫服饰大楼。进入大楼后，点击麦基购买服饰。」
//   另有 7k7k/111414：「在商业街服饰大楼可以买服装哟！」
// 【麦基的台词】（7k7k/111998，麦基有独立的官方 NPC 页，2012-01-10）
//   「你好！想要点什么呢？我们有新的款式，试试吧！」
// 【服饰大楼还兼作"劳动换物"的地方】（7k7k/161465）
//   「华多却说他捡到战靴后就将其卖给了服饰店的麦基…要么给麦基3000晶石，要么为她劳动换回战靴…
//     于是，我们就可进入捕捉衣服的游戏。」
// 【附魔】（7k7k/530436、529316、529325、529716、559421）
//   「服饰附魔系统是小多克通过虚空水晶赋予服饰属性」
//   「附魔系统一共有五个等级，每一级别需要的虚空水晶数量也都不相同」
//   「一旦附魔成功，服饰将会获得属性加成！不过加成属性完全随机，想要获得自己想要的属性就只能靠运气啦！」
//   「对于自己获得的属性值不满意还可以通过重新附魔来更改已经获得的属性加成。」
//   「变身成为多比也会享受这一加成！」
// 【虚空水晶从哪来】（7k7k/530436）
//   「虚空水晶获得方式：在珍宝小屋中购买，光系BOSS罗兰特掉落，暗系BOSS奥利弗掉落，
//     圣多克专属副本噜噜王的终结掉落，英雄级别副本通关奖励。」
//   （7k7k/529322 另有同义表述：「虚空水晶可以在珍宝小屋、英雄级别的副本、噜噜王副本、
//     世界级光BOSS，暗BOSS处获得。」）
//   玩家攻略里还有一个数量参照（7k7k/529183）：「举例 20 个虚空水晶＝10 次初级附魔」。
//
// ══════════════ 落地时哪些用了、哪些没用（R3 不静默降级） ══════════════
//   用了（能在单机落地）：
//     · 珍宝小屋购买          —— 本作已有珍宝小屋（game/tables/treasure.js）
//     · 噜噜王的终结掉落      —— 本作已有副本 `luluwang`
//   没用（如实登记，不编）：
//     · 光系BOSS罗兰特 / 暗系BOSS奥利弗掉落 —— 归档的怪物表里**没有这两只**，无处可挂
//     · 英雄级别副本通关奖励  —— 本作的 14 个副本**没有"普通/英雄"分级这个字段**，
//                                硬套到"等级高的副本"上是编造，故不做
//     · 充值礼包              —— 单机离线版没有充值，不适用
;(function () {
  const D = window.DKDbbData || (window.DKDbbData = {})

  const SRC = {
    shop: '7k7k/178975、7k7k/111414',
    shop2: '7k7k/161465',
    npc: '7k7k/111998',
    enchant: '7k7k/530436、7k7k/529316、7k7k/529325、7k7k/529716、7k7k/559421',
    voidFrom: '7k7k/530436、7k7k/529322',
    voidCount: '7k7k/529183',
  }

  // 服饰大楼（官方：多比大街最右端）
  D.COSTUME_SHOP = {
    name: '服饰大楼',
    npc: '麦基',
    where: '多比大街·最右端',
    // 官方台词，逐字
    greeting: '你好！想要点什么呢？我们有新的款式，试试吧！',
    evidence: `${SRC.shop}（位置与买法）；${SRC.npc}（麦基台词逐字）`,
    conf: 'official',
  }

  // 虚空水晶（官方道具名，本作落地为一种材料，与碎片/白彩并列）
  D.VOID_CRYSTAL = {
    name: '虚空水晶',
    // 官方给了四条来源，其中两条在本作里能落地（见文件头的说明）
    sources: [
      { kind: 'treasure', label: '珍宝小屋购买', conf: 'official', src: SRC.voidFrom },
      { kind: 'dungeon', label: '副本「噜噜王的终结」掉落', conf: 'official', src: SRC.voidFrom, dungeon: 'luluwang' },
      { kind: 'boss', label: '光系BOSS罗兰特 / 暗系BOSS奥利弗掉落', conf: 'official', usable: false, why: '归档怪物表里没有这两只 BOSS' },
      { kind: 'heroDungeon', label: '英雄级别副本通关奖励', conf: 'official', usable: false, why: '本作的副本没有"普通/英雄"分级字段，硬套即编造' },
    ],
    evidence: SRC.voidFrom,
    // 价格与掉落量：官方**没给数字** → derived
    price: { white: 1, amount: 3 },        // 珍宝小屋：1 白彩 = 3 个（derived）
    luluDrop: 2,                            // 噜噜王的终结 通关掉落（derived）
    note: '官方给了四条来源，本作落地其中两条（珍宝小屋购买 / 噜噜王的终结掉落）；价格与掉落量为 derived',
  }

  // 附魔：官方说"五个等级、每级数量不同、属性完全随机、可重新附魔"
  // 数量与属性幅度官方都没给 → derived。唯一有官方数量参照的是**初级**那档：
  // 玩家攻略写「20 个虚空水晶＝10 次初级附魔」→ 第 1 级 = 2 个，这一档照它定。
  D.ENCHANT = {
    maxLevel: 5,                       // official
    // 每级消耗的虚空水晶（第 1 级 = 2 来自官方数量参照；2~5 级为 derived 递增）
    cost: [2, 4, 8, 14, 22],
    costConf: ['official（数量参照）', 'derived', 'derived', 'derived', 'derived'],
    // 随机属性的可选范围：本作的战斗属性（官方只说"属性加成…完全随机"）
    attrs: ['life', 'mp', 'atk', 'def', 'matk', 'mdef', 'hit', 'eva', 'spd'],
    attrNames: { life: '生命', mp: '魔法', atk: '攻击', def: '防御', matk: '魔攻', mdef: '魔防', hit: '命中', eva: '闪避', spd: '速度' },
    // 加成幅度：按**当前形态该属性的值**取百分比（这样低级高级都不会失衡）
    //   每级 2.5% + 随机 0.6~1.4 倍 → 满级大约 +20% 上下，且只会落在一条属性上
    pctPerLevel: 0.025, jitter: [0.6, 1.4],
    // 命中/闪避/速度这类的数值本来就小，按同一百分比会小到看不出来 → 给一个下限
    minValue: 2,
    note: '五级、每级数量不同、属性完全随机、可重新附魔 —— 这四条是官方；具体数量与幅度为 derived（第 1 级消耗 2 个来自官方数量参照）',
  }

  // ══════════════ 货架商品：10 套官方服饰 ══════════════
  // 名字与立绘**全部来自归档** `assets/anim/index.js` 的「时装序列」——
  // 每套都有 正面一/正面二/背面一/背面二（狮子男另有 正面三/四、背面三），各 17 帧。
  // 这里只给"价格"和"款式说明"，**款式说明是对该套立绘外观的白描**，不是官方文案。
  const STOCK = [
    { name: '化妆男', price: 900, look: '礼帽 + 燕尾服的化妆舞会男装' },
    { name: '化妆女', price: 900, look: '面具 + 长裙的化妆舞会女装' },
    { name: '喵喵男', price: 1200, look: '猫耳兜帽的喵喵男装' },
    { name: '喵喵女', price: 1200, look: '猫耳 + 蓬裙的喵喵女装' },
    { name: '狮子女', price: 1500, look: '狮子鬃毛披肩的女装' },
    { name: '狮子男', price: 1800, look: '狮子鬃毛铠甲男装（归档里唯一有 4 个正面姿态的一套）' },
    { name: '草莓女', price: 1500, look: '草莓装饰的甜点风女装' },
    { name: '菠萝男', price: 1500, look: '菠萝纹样的热带风男装' },
    { name: '蝙蝠女', price: 2000, look: '蝙蝠翼斗篷女装' },
    { name: '蝙蝠男', price: 2000, look: '蝙蝠翼斗篷男装' },
  ]

  // 从归档动画索引里把每套服饰的**各个方向/姿态**解析出来。
  // 不写死动作名：索引里怎么命名就怎么取（狮子男就多出正面三/四）。
  D.costumeStock = function (animIndex) {
    const actions = (animIndex && animIndex.actions) || {}
    const byCostume = {}
    for (const a of Object.values(actions)) {
      if (!a.dir || a.dir.indexOf('时装序列/') !== 0) continue
      const parts = a.dir.split('/')
      const who = parts[1]
      if (!who) continue
      ;(byCostume[who] = byCostume[who] || []).push(a)
    }
    const out = []
    for (const it of STOCK) {
      const acts = byCostume[it.name]
      if (!acts || !acts.length) continue          // 归档里没有这套 → 不上架（宁缺勿造）
      // 正面一/正面二 作待机与踏步，背面一/背面二 作背向踏步
      const pick = (re) => acts.find((a) => re.test(a.action)) || null
      const front1 = pick(/正面一|正面1/) || acts[0]
      const front2 = pick(/正面二|正面2/) || front1
      const back1 = pick(/背面一|背面1/) || front1
      const back2 = pick(/背面二|背面2/) || back1
      out.push({
        id: it.name, name: it.name, look: it.look, price: it.price,
        dir: front1.dir != null ? front1.dir.split('/').slice(0, 2).join('/') : null,
        anim: { front1, front2, back1, back2, all: acts.length },
        evidence: '归档 `assets/anim` 时装序列/' + it.name + '（官方原始立绘，' + acts.length + ' 组动作）',
        conf: 'official',
        priceConf: 'derived',
        note: '立绘与名字 = 官方素材；价格为推算（官方未给售价）',
      })
    }
    return out
  }

  // 附魔一条属性要花多少、加多少。用**当前形态该属性的实际值**做基数，
  // 所以低级/高级形态都不会出现"加了个看不出来的数"。
  //
  // 【属性是怎么定的】官方只说"加成属性完全随机""可重新附魔更改**已经获得的**属性加成"。
  // 两句合起来读：**属性在第一次附魔时随机定下，之后升级只涨数值，想换属性才去重新附魔**。
  // 所以：
  //   · 第一次附魔 → 随机摇一条属性 + 摇一个"品质系数" k，存进存档
  //   · 之后升级   → 属性不变、k 不变，只按等级把数值做上去（升级永远不会变差）
  //   · 重新附魔   → 换一条属性（等级与消耗照旧）
  // 这条"属性是否随升级重摇"原文没说 → derived（已登记 V64）。
  D.rollEnchant = function (stats, level, rnd, forceAttr) {
    const r = rnd || Math.random
    const E = D.ENCHANT
    const pool = E.attrs.filter((k2) => Number(stats && stats[k2]) > 0)
    if (!pool.length) return null
    const attr = forceAttr && pool.indexOf(forceAttr) >= 0
      ? forceAttr
      : pool[Math.floor(r() * pool.length)]
    const base = Number(stats[attr]) || 0
    const [lo, hi] = E.jitter
    const k = 1 + (lo + r() * (hi - lo) - 1) * 0.5      // 0.6~1.4 的收窄版，避免极端值
    const val = Math.max(E.minValue, Math.round(base * E.pctPerLevel * level * k))
    return { attr, val, level, k }
  }
  // 按已存的属性与品质，算出某个等级该有多少数值（升级用，不重摇）
  D.enchantValueAt = function (stats, attr, k, level) {
    const E = D.ENCHANT
    const base = Number(stats && stats[attr]) || 0
    return Math.max(E.minValue, Math.round(base * E.pctPerLevel * level * (k || 1)))
  }
})()
