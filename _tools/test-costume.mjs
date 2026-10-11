// 服饰与附魔（第 45 轮，官方系统）
//
// 官方原文（逐字，出处见 game/tables/costumes.js 文件头）：
//   ·「服饰店在多比大街上的最右端，名字叫服饰大楼。进入大楼后，点击麦基购买服饰。」（178975）
//   · 麦基台词「你好！想要点什么呢？我们有新的款式，试试吧！」（111998）
//   ·「服饰附魔系统是小多克通过虚空水晶赋予服饰属性」（530436）
//   ·「附魔系统一共有五个等级，每一级别需要的虚空水晶数量也都不相同」（530436）
//   ·「一旦附魔成功，服饰将会获得属性加成！不过加成属性完全随机」（529316）
//   ·「对于自己获得的属性值不满意还可以通过重新附魔来更改已经获得的属性加成。」（529316）
//   ·「变身成为多比也会享受这一加成！」（530436）
//   ·「虚空水晶获得方式：在珍宝小屋中购买…圣多克专属副本噜噜王的终结掉落…」（530436）
//
// 这个测试逐条钉住上面每一条 —— 尤其是"变身也享受"（必须挂在 playerStats 上）
// 与"属性完全随机"（不能每次都给同一条）。
import { T } from './game-harness.mjs'

const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
const D = W.DKDbbData
const save = W.DKDbb.save
let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n== ' + s + ' ==')

// ---------- 1) 货架：名字与立绘都必须来自归档 ----------
section('1) 货架：10 套官方服饰，名字与立绘都来自归档素材')
{
  const stock = DBG().costumeStock()
  check(stock.length === 10, `官方服饰 ${stock.length} 套`, stock.map((c) => c.name).join('/'))
  check(stock.every((c) => c.actions >= 4),
    '每套都有至少 4 组动作帧（正面一/二、背面一/二）',
    stock.map((c) => `${c.name}:${c.actions}`).join(' '))
  check(stock.every((c) => /归档/.test(c.evidence) && c.conf === 'official'),
    '每套都标了归档出处且 conf=official')
  check(stock.every((c) => c.price > 0), '每套都有售价（价格是 derived，界面要能看出来）')
  // 归档里真有这几套吗 —— 直接从动画索引核一遍，防止货架与素材脱节
  const anim = W.__DKDbb_ANIM__
  const dirs = Object.values(anim.actions).map((a) => a.dir)
  const missing = stock.filter((c) => !dirs.some((d) => d.indexOf('时装序列/' + c.name) === 0))
  check(missing.length === 0, `货架上每一套在归档里都真的有素材（缺 ${missing.map((m) => m.name).join('/') || '无'}）`)
}

// ---------- 2) 服饰大楼的位置与麦基（官方：多比大街最右端） ----------
section('2) 服饰大楼开在"多比大街最右端"，店主是麦基')
{
  const P = DBG().costumeParams()
  check(P.shop.name === '服饰大楼', `店名 ${P.shop.name}（官方原文）`)
  check(P.shop.npc === '麦基', `店主 ${P.shop.npc}（官方原文）`)
  check(/最右端/.test(P.shop.where), `位置标注"${P.shop.where}"（官方："多比大街上的最右端"）`)
  check(P.shop.greeting === '你好！想要点什么呢？我们有新的款式，试试吧！',
    '麦基的开场白是官方台词逐字', P.shop.greeting)
  check(/178975/.test(P.shop.evidence) && P.shop.conf === 'official', '位置与买法标了官方出处')

  // 场景里真有这位 NPC，而且在多比大街的**最后一个**场景。
  // ⚠️ 不能去问 D.sceneSpawns —— 那不是公开接口（第一版这么写，结果每次都拿到 null，
  // 断言失败还看不出原因）。走真实路径：进场景，再问 DBG().spawns。
  const world = t.get('__world')
  const island = world.islands.find((i) => i.id === 'market')
  check(!!island && island.scenes.length >= 2, `多比大街有 ${island ? island.scenes.length : 0} 个场景`)
  const rightEnd = island.scenes[island.scenes.length - 1]
  function enterScene(k) {
    S().mode = 'worldmap'; t.step(1)
    S().mapSel = world.islands.indexOf(island); S().placeSel = 0; S().placePage = 0; t.step(1)
    t.key(' '); t.step(3)
    if (S().mode !== 'places') return null
    S().placeSel = k; S().placePage = Math.floor(k / 8); t.step(1)
    t.key(' '); t.step(4)
    if (S().mode !== 'explore') return null
    return DBG().spawns
  }
  const namesIn = (k) => {
    const sp = enterScene(k)
    return sp ? (sp.npcs || []).map((n) => n.name) : []
  }
  const atRight = namesIn(island.scenes.length - 1)
  check(atRight.includes('麦基'),
    `麦基在多比大街的**最右一个**场景（${rightEnd}）里`, atRight.join('/'))
  // 反过来也要成立：别的场景不该有他，否则"最右端"这句话就没落地
  const others = []
  for (let k = 0; k < island.scenes.length - 1; k++) others.push(...namesIn(k))
  check(!others.includes('麦基'),
    `其余 ${island.scenes.length - 1} 个场景里都没有麦基（官方说的是"最右端"）`,
    others.filter((n) => n === '麦基').length + ' 次')
}

// ---------- 3) 买 / 穿 ----------
section('3) 买下来、穿上（官方："点击麦基购买服饰"）')
{
  S().mode = 'explore'
  check(DBG().openCostumeShop() === 'costume', '能打开服饰大楼面板')
  check(S().mode === 'costume', `mode=${S().mode}`)
  const r = DBG().costumeRect(0)
  check(r.x >= 0 && r.x + r.w <= 960 && r.y >= 0 && r.y + r.h <= 560, '货架第一格在画面内')
  const stock = DBG().costumeStock()
  const last = DBG().costumeRect(7)
  check(last.x >= 0 && last.x + last.w <= 960 && last.y + last.h <= 560,
    '第一页最后一格也在画面内（8 格两列都放得下）')

  save.data.gold = 0
  check(DBG().buyCostume(stock[0].id) === false, '钱不够时买不了')
  check(Object.keys(save.data.costumes).length === 0, '买失败不会白送一件')
  save.data.gold = 99999
  check(DBG().buyCostume(stock[0].id) === true, `买下「${stock[0].name}」`)
  check(save.data.gold === 99999 - stock[0].price, `金币扣了 ${stock[0].price}`)
  check(!!save.data.costumes[stock[0].id], '衣柜里有这件了')
  check(DBG().buyCostume(stock[0].id) === false, '同一件不能买两次（不会重复扣钱）')
  check(save.data.costumes[stock[0].id].lv === 0, '刚买来是未附魔状态')

  check(DBG().wearCostume(stock[0].id) === true, '能穿上')
  check(save.data.costumeWorn === stock[0].id, `当前穿戴=${save.data.costumeWorn}`)
  check(DBG().wearCostume(stock[0].id) === true, '再点一次＝脱下')
  check(save.data.costumeWorn === null, '脱下后是 null')
  DBG().wearCostume(stock[0].id)
}

// ---------- 4) 附魔：五级 / 消耗虚空水晶 / 属性随机 ----------
section('4) 附魔（官方：五级、每级数量不同、属性完全随机、可重新附魔）')
{
  const P = DBG().costumeParams()
  check(P.enchant.maxLevel === 5, `满级 ${P.enchant.maxLevel} 级（官方："一共有五个等级"）`)
  check(new Set(P.enchant.cost).size === 5,
    `五级消耗各不相同（官方："每一级别需要的虚空水晶数量也都不相同"）`, JSON.stringify(P.enchant.cost))
  check(P.enchant.cost[0] === 2,
    '第 1 级消耗 2 个 —— 对照玩家攻略「20 个虚空水晶＝10 次初级附魔」（官方数量参照）')

  const id = DBG().costumeStock()[0].id
  save.data.voidCrystal = 0
  check(DBG().enchantCostume(id) === false, '没有虚空水晶时附不了魔')
  check(save.data.costumes[id].lv === 0, '附魔失败不会白升一级')

  // 属性必须"完全随机"：反复重开、第一次附魔的属性应该出现多种
  const seen = new Set()
  for (let i = 0; i < 40; i++) {
    save.data.costumes[id] = { lv: 0, attr: null, val: 0 }
    save.data.voidCrystal = 99
    DBG().enchantCostume(id)
    const e = save.data.costumes[id]
    if (e.attr) seen.add(e.attr)
  }
  check(seen.size >= 3, `第一次附魔的属性是随机的（40 次里出现 ${seen.size} 种：${[...seen].join('/')}）`)

  // 五级走满：等级递增、消耗逐级变多、数值随等级变大
  save.data.costumes[id] = { lv: 0, attr: null, val: 0 }
  save.data.voidCrystal = 500
  const vals = []
  const spent = []
  for (let i = 0; i < 5; i++) {
    const before = save.data.voidCrystal
    check(DBG().enchantCostume(id) === true, `第 ${i + 1} 级附魔成功`)
    spent.push(before - save.data.voidCrystal)
    // 用**实时值**（不是存档里的快照 val）：数值是按当前基础值算的，见 costumeValue 的注释
    vals.push(DBG().costumeValue(id))
  }
  const e = save.data.costumes[id]
  check(e.lv === 5, `走满 5 级（lv=${e.lv}）`)
  check(spent.join(',') === P.enchant.cost.slice(0, 5).join(','),
    `每级实际扣的水晶与表一致（${spent.join('/')}）`)
  check(vals.every((v, i) => i === 0 || v >= vals[i - 1]),
    `数值随等级不降（${vals.join('→')}）`)
  check(DBG().enchantCostume(id) === false, '满级后不能再升（不会白扣水晶）')
  check(save.data.costumes[id].lv === 5, '满级拒绝后等级没变')

  // 重新附魔：换一条属性，等级不变
  const beforeAttr = save.data.costumes[id].attr
  const beforeLv = save.data.costumes[id].lv
  save.data.voidCrystal = 99
  check(DBG().reEnchantCostume(id) === true, '能重新附魔')
  check(save.data.costumes[id].attr !== beforeAttr,
    `重新附魔换了属性（${beforeAttr} → ${save.data.costumes[id].attr}）`)
  check(save.data.costumes[id].lv === beforeLv, `重新附魔不改等级（${beforeLv}）`)
}

// ---------- 5) 官方那句"变身成多比也享受"必须真的成立 ----------
section('5) 附魔加成要进战斗属性（官方："变身成为多比也会享受这一加成"）')
{
  // 清干净：把衣柜清空，量一次干净的基线
  save.data.costumes = {}
  const clean = DBG().playerStats()
  check(Object.keys(DBG().enchantBonus()).length === 0, '没有服饰时没有任何加成')

  const id = DBG().costumeStock()[1].id
  save.data.costumes[id] = { lv: 5, attr: 'atk', val: 30, k: 1 }
  const withBonus = DBG().playerStats()
  check(withBonus.atk === clean.atk + DBG().costumeValue(id),
    `攻击从 ${clean.atk} 变成 ${withBonus.atk}（+${DBG().costumeValue(id)}）`)
  check(DBG().enchantBonus().atk === DBG().costumeValue(id), '加成能被单独查出来（界面要显示它）')
  // 关键：加成挂在 playerStats 上 = 战斗里用的就是它 → 变身成多比照样算
  const baseStats = DBG().baseStats()
  check(baseStats.atk === clean.atk, `纯基础值不受附魔影响（${baseStats.atk}）—— 附魔不会复利滚雪球`)

  // ★ 数值必须**按当前基础值实时算**，不能把附魔那一刻的绝对值存死。
  // 否则：高等级附魔 → 换到低等级形态，那条巨大的绝对值还挂着（等于白送）。
  {
    const e = save.data.costumes[id]
    const beforeLv = save.data.level
    save.data.level = 1
    const low = DBG().costumeValue(id)
    save.data.level = 60
    const high = DBG().costumeValue(id)
    save.data.level = beforeLv
    check(high > low,
      `同一条附魔会随等级缩放（1 级 +${low} → 60 级 +${high}）—— 说明存的是百分比不是绝对值`)
    check(DBG().costumeValue(id) === DBG().costumeValue(id), '数值稳定（同状态下每次算出来一样）')
  }

  // 换形态之后加成仍在（这正是官方那句话的意思）。
  // 注意：换形态会换基础值，而附魔是按基础值的百分比算的 → 数值会跟着变，
  // 所以断言"加成仍在、且等于按新形态基础值算出来的数"，而不是钉死一个常数。
  const forms = D.FORMS
  const other = forms.find((f) => f.name !== S().form.name) || forms[0]
  const old = S().form
  const beforeSwitch = DBG().enchantBonus().atk
  S().form = other
  const afterSwitch = DBG().enchantBonus().atk
  const after = DBG().playerStats()
  check(afterSwitch > 0 && afterSwitch === DBG().costumeValue(id),
    `换形态后附魔加成仍在（${beforeSwitch} → ${afterSwitch}，随新形态的基础值缩放）`)
  check(DBG().playerStats().atk === DBG().baseStats().atk + afterSwitch,
    `战斗属性里确实含这条加成（基础 ${DBG().baseStats().atk} + ${afterSwitch} = ${after.atk}）`)
  S().form = old

  // 同一属性多件只取最高（derived 规则，防止堆同一属性叠成无敌）
  const id2 = DBG().costumeStock()[2].id
  const single = DBG().costumeValue(id)
  save.data.costumes[id2] = { lv: 5, attr: 'atk', k: 0.8 }      // 品质更差的一件
  const worse = DBG().costumeValue(id2)
  check(worse < single, `第二件品质更差（${worse} < ${single}）`)
  check(DBG().enchantBonus().atk === single,
    `两件都加攻击时只取最高的那件（${DBG().enchantBonus().atk}，不是 ${single + worse}）`)
  // 不同属性可以并存
  save.data.costumes[id2] = { lv: 5, attr: 'def', k: 1 }
  const defVal = DBG().costumeValue(id2)
  check(DBG().enchantBonus().def === defVal && defVal > 0,
    `不同属性的加成可以并存（防御 +${DBG().enchantBonus().def}）`)
}

// ---------- 6) 虚空水晶的官方来源 ----------
section('6) 虚空水晶的来源（官方明说两条，本作落地这两条）')
{
  const P = DBG().costumeParams()
  const usable = P.voidCrystal.sources.filter((s) => s.usable !== false)
  check(usable.length === 2, `官方给了 ${P.voidCrystal.sources.length} 条来源，本作落地 ${usable.length} 条`)
  check(usable.some((s) => s.kind === 'treasure'), '来源一：珍宝小屋购买（官方原文）')
  check(usable.some((s) => s.kind === 'dungeon' && s.dungeon === 'luluwang'),
    '来源二：副本「噜噜王的终结」掉落（官方原文）')
  // 用不了的必须**写清为什么**，不许静默丢掉（R3）
  const unusable = P.voidCrystal.sources.filter((s) => s.usable === false)
  check(unusable.length === 2 && unusable.every((s) => s.why && s.why.length > 6),
    `用不了的两条都写了原因（${unusable.map((s) => s.label).join(' / ')}）`)

  // 珍宝小屋真的卖虚空水晶
  const stock = D.treasureStock()
  check(stock.some((x) => x.kind === 'void'), '珍宝小屋的货架上真有虚空水晶')
  // 噜噜王的终结 打完真的掉
  save.data.voidCrystal = 0
  const sv = save.data
  sv.level = 30
  S().mode = 'explore'
  if (DBG().enterDungeon('luluwang') === true) {
    const st = DBG().dungeonState()
    st.idx = (D.dungeonById('luluwang').stages || []).length
    st.phase = 'stage'
    DBG().startStage()
    for (let i = 0; i < 30 && DBG().dungeonState().phase !== 'done'; i++) t.step(1)
    check(save.data.voidCrystal === P.voidCrystal.luluDrop,
      `通关「噜噜王的终结」掉了 ${save.data.voidCrystal} 个虚空水晶（表里写 ${P.voidCrystal.luluDrop}）`)
  } else {
    check(false, '进得去「噜噜王的终结」')
  }
  S().mode = 'explore'
  DBG().dungeonState().id = null; DBG().dungeonState().phase = 'list'
}

// ---------- 7) 可空字段：穿戴状态必须能过存档往返 ----------
// （第 43 轮 soyaActive 就是栽在这里：默认值 null 的字段被迁移当"类型不符"擦掉）
section('7) 穿戴状态与衣柜要能过存档往返')
{
  const stock = DBG().costumeStock()
  const id = stock[3].id
  save.data.costumes = {}
  save.data.costumes[id] = { lv: 3, attr: 'spd', val: 21, k: 1.1 }
  save.data.costumeWorn = id
  save.data.voidCrystal = 17
  const r = save.migrate(JSON.parse(JSON.stringify(save.data)))
  check(r.data.costumeWorn === id, `化妆…「${id}」穿戴状态没被迁移擦掉（${JSON.stringify(r.data.costumeWorn)}）`)
  check(!r.changes.some((c) => c.startsWith('costumeWorn')), '迁移没把它当成问题记账')
  check(r.changes.length === 0, `迁移是幂等的（${r.changes.length} 处改动）`, r.changes.join('；'))
  check(r.data.costumes[id].lv === 3 && r.data.costumes[id].attr === 'spd', '衣柜内容原样保留')
  check(r.data.voidCrystal === 17, '虚空水晶原样保留')
  // 真类型不对仍然要拦
  const bad = JSON.parse(JSON.stringify(save.data)); bad.costumeWorn = 12345
  check(save.migrate(bad).data.costumeWorn === null, '编号写成数字仍会被纠正成 null')
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
