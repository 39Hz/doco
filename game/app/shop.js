/* 多克多比 · 应用层：杂货铺 + 服饰大楼（第 72 轮重构 · 批次 7 · ui 收尾）
   来源：原 `game/game.js` 的杂货铺购买与服饰大楼买 / 穿 / 附魔逻辑，内容一致（含原注释）。
   —— 这里只放**会读写存档**的买卖与附魔逻辑；纯绘制与布局在同批次的 `game/ui/shop.js`。
   依赖：引擎 `window.DKDbb`（save / audio）+ 内容表 `window.DKDbbData`（D）
        + 内核 `G.core`（S / toast）+ 同层 `G.app.player`（costumeById / ownedCostumes / baseStats）。
   只经 `G.app.shop` 出口对外，`game.js` 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const { S, toast } = G.core
  const { save, audio } = window.DKDbb
  const D = window.DKDbbData

  // 同层应用模块（惰性箭头：调用时才解析，故加载顺序无关）。
  const costumeById = (id) => G.app.player.costumeById(id)
  const ownedCostumes = () => G.app.player.ownedCostumes()
  const baseStats = () => G.app.player.baseStats()

  // ==================== 杂货铺 ====================
  function openShop() {
    S.mode = 'shop'
    S.shopTab = S.shopTab || 0
    S.shopSel = 0
    S.shopPage = 0
    audio.sfx('assets/sfx/onClick_03.mp3')
  }
  function buyItem(it) {
    if (!it) return
    if (save.data.gold < it.price) { toast(`金币不够（还差 ${it.price - save.data.gold}）`); return }
    save.data.gold -= it.price
    D.bag.add(save.data.items, it.id, 1)
    save.persist()
    toast(`买下「${it.name}」 -${it.price} 金币`)
    audio.sfx('assets/sfx/onClick_03.mp3')
  }

  // ---- 服饰大楼（官方：多比大街最右端，找麦基买服饰；7k7k/178975）----
  const COSTUME = { sel: 0, hover: -1, msg: '', msgT: 0, page: 0 }
  function openCostumeShop() {
    COSTUME.sel = 0; COSTUME.hover = -1; COSTUME.page = 0
    S.mode = 'costume'
    audio.sfx('assets/sfx/onClick_03.mp3')
  }

  // 买一件
  function buyCostume(id) {
    const c = costumeById(id)
    if (!c) return false
    const own = ownedCostumes()
    if (own[id]) { costumeMsg('这件已经在你衣柜里了'); return false }
    if ((save.data.gold || 0) < c.price) { costumeMsg(`金币不够（要 ${c.price}，你有 ${save.data.gold || 0}）`); return false }
    save.data.gold -= c.price
    own[id] = { lv: 0, attr: null, val: 0 }     // 买来还没附魔
    save.persist()
    costumeMsg(`买下了「${c.name}」—— 去附魔可以让它加属性`)
    audio.sfx('assets/sfx/onClick_03.mp3')
    return true
  }
  // 穿上 / 脱下
  function wearCostume(id) {
    const own = ownedCostumes()
    if (!own[id]) { costumeMsg('还没买这件'); return false }
    save.data.costumeWorn = save.data.costumeWorn === id ? null : id
    save.persist()
    costumeMsg(save.data.costumeWorn ? `穿上了「${id}」` : `脱下了「${id}」`)
    audio.sfx('assets/sfx/onClick_03.mp3')
    return true
  }
  // 附魔 / 重新附魔
  // 官方：「通过虚空水晶赋予服饰属性」「一共五个等级」「加成属性完全随机」
  //       「不满意还可以通过重新附魔来更改」
  function enchantCostume(id) {
    const c = costumeById(id)
    const own = ownedCostumes()
    const e = own[id]
    if (!c || !e) { costumeMsg('先买下这件才能附魔'); return false }
    const E = D.ENCHANT
    if (e.lv >= E.maxLevel) { costumeMsg(`${c.name} 已经满级（${E.maxLevel} 级）—— 可以"重新附魔"换一条属性`); return false }
    const cost = E.cost[Math.min(e.lv, E.cost.length - 1)]     // 升到下一级要的
    const have = save.data.voidCrystal || 0
    if (have < cost) { costumeMsg(`虚空水晶不够：要 ${cost} 个，你有 ${have} 个`); return false }
    save.data.voidCrystal = have - cost
    let rolled
    if (!e.lv || !e.attr) {
      // 第一次附魔：**随机摇一条属性 + 一个品质系数**（官方："加成属性完全随机"）
      rolled = D.rollEnchant(baseStats(), 1)
      if (rolled) { e.attr = rolled.attr; e.k = rolled.k }
    } else {
      // 升级：属性与品质不变，只把等级做上去（数值是按当前基础值实时算的）
      rolled = { attr: e.attr, val: D.enchantValueAt(baseStats(), e.attr, e.k, e.lv + 1), level: e.lv + 1 }
    }
    if (!rolled) { costumeMsg('附魔失败（没有可加的属性）'); return false }
    e.lv = e.lv + 1
    e.attr = rolled.attr; e.val = rolled.val     // val 只用于"刚刚附魔成功"的提示显示
    save.persist()
    const nm = E.attrNames[rolled.attr] || rolled.attr
    costumeMsg(`附魔成功！${c.name} 现在是 ${e.lv} 级：${nm} +${rolled.val}（变身成多比也照样享受）`)
    audio.sfx('assets/sfx/onClick_03.mp3')
    return true
  }
  // 重新附魔：官方说"不满意可以重新附魔更改**已经获得的**属性加成" → 换一条属性，等级照旧
  function reEnchantCostume(id) {
    const c = costumeById(id)
    const own = ownedCostumes()
    const e = own[id]
    if (!c || !e || !e.lv) { costumeMsg('得先附过魔才能重附'); return false }
    const E = D.ENCHANT
    const cost = E.cost[Math.min(e.lv, E.cost.length - 1)]
    const have = save.data.voidCrystal || 0
    if (have < cost) { costumeMsg(`重新附魔要 ${cost} 个虚空水晶，你有 ${have} 个`); return false }
    save.data.voidCrystal = have - cost
    // 强制换一条**别的**属性（否则"重新附魔"有一半概率原样返回，玩家会觉得没生效）
    const stats = baseStats()
    const others = E.attrs.filter((k) => Number(stats[k]) > 0 && k !== e.attr)
    const rolled = D.rollEnchant(stats, e.lv, Math.random, others.length ? others[Math.floor(Math.random() * others.length)] : e.attr)
    if (!rolled) { costumeMsg('重新附魔失败'); return false }
    e.attr = rolled.attr; e.val = rolled.val; e.k = rolled.k
    save.persist()
    const nm = E.attrNames[rolled.attr] || rolled.attr
    costumeMsg(`重新附魔：${c.name}（${e.lv} 级）→ ${nm} +${rolled.val}`)
    return true
  }
  function costumeMsg(s) { COSTUME.msg = s; COSTUME.msgT = 2.4 }

  // 只读取值（ui 侧经这些窄接口取用，避免直接读存档）。
  const gold = () => save.data.gold
  const voidCrystal = () => save.data.voidCrystal
  const wornId = () => save.data.costumeWorn
  const playerAtk = () => save.data.atk

  G.app = G.app || {}
  G.app.shop = { COSTUME, openShop, openCostumeShop, buyItem, buyCostume, wearCostume,
    enchantCostume, reEnchantCostume, costumeMsg, gold, voidCrystal, wornId, playerAtk }
})()