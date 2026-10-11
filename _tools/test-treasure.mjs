// M4-4 白色彩晶石经济 + 珍宝小屋（官方系统）。
//
// 官方依据（原文，见 docs/官方资料库.md 12.3）：
//   · 碎片来源（7k7k/177905）：「小多克们可以在**维西岛的精英怪、副本的BOSS、野外BOSS**身上
//     有一定机率获得白色彩晶石碎片」，可合成为白色彩晶石，
//     但「**每个玩家每天最多只能合成 5 块**白色彩晶石」
//   · 珍宝小屋（7k7k/177906）：**圣多克骑士厅**找**肖恩普**进入，用**白色彩晶石**买，
//     点名可买**稀有多比技能**与**珍稀索亚**，大类含 道具/战斗道具/技能/服饰
//   · 积分超市（7k7k/528376）：「**每消费 1 白色彩晶石就会自动获得 1 积分**」
//
// 本测试同时守住两条容易走偏的边界：
//   · **普通野外怪不掉碎片**（原文只列了精英怪/副本BOSS/野外BOSS 三类来源）
//   · 技能 / 服饰这两类我们**没有机制**，必须如实标 missing，不能在店里假装有
import { T } from './game-harness.mjs'

const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
const save = W.DKDbb.save
const D = W.DKDbbData
let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

// ---------- 1) 存档字段 ----------
section('1) 存档：碎片 / 白彩 / 积分 / 每日计数')
check(typeof save.data.shards === 'number', `shards = ${save.data.shards}`)
check(typeof save.data.white === 'number', `white = ${save.data.white}`)
check(typeof save.data.points === 'number', `points = ${save.data.points}`)
check(typeof save.data.crystalToday === 'number', `crystalToday = ${save.data.crystalToday}`)
{
  const r = save.migrate({ playerName: '老档', level: 3, started: true })
  check(typeof r.data.shards === 'number' && typeof r.data.white === 'number', '老档迁移后补齐碎片/白彩')
  check(typeof r.data.points === 'number' && typeof r.data.crystalToday === 'number', '老档迁移后补齐积分/每日计数')
  check(r.data.crystalDay === '', '老档的 crystalDay 是空串（首次进游戏会滚成今天）')
}

// ---------- 2) 每日上限（官方硬规则：每天最多 5 块） ----------
section('2) 合成上限：每天最多 5 块')
{
  check(/^\d{4}-\d{2}-\d{2}$/.test(DBG().dayKey()), `日期键格式 ${DBG().dayKey()}`)
  const limit = D.treasureDailyLimit()
  const need = D.treasureShardsPerCrystal()
  check(limit === 5, `每日上限 = ${limit}（原文写死 5 块）`)
  check(need >= 1, `几块碎片合一块 = ${need}`)

  // 备足碎片
  save.data.shards = need * 20
  save.data.white = 0
  save.data.crystalDay = DBG().dayKey()
  save.data.crystalToday = 0
  let made = 0
  for (let i = 0; i < limit; i++) if (DBG().synthesizeCrystal()) made++
  check(made === limit, `连续合成 ${made} 块`)
  check(save.data.white === limit, `白彩 = ${save.data.white}`)
  check(DBG().synthesizeCrystal() === false, '第 6 次合成被拒绝（超过每日上限）')
  check(save.data.crystalToday === limit, `当日计数停在 ${save.data.crystalToday}`)
  check(save.data.shards > 0, '碎片还有剩余，只是今天不能再合了')

  // 跨天：把 crystalDay 改成昨天，再合成应当成功
  const y = new Date(Date.now() - 86400000)
  save.data.crystalDay = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`
  check(DBG().synthesizeCrystal() === true, '换成"昨天"之后可以再合成（跨天重置）')
  check(save.data.crystalToday === 1, `跨天后当日计数重置为 ${save.data.crystalToday}`)

  // 碎片不够
  save.data.shards = need - 1
  save.data.crystalToday = 0
  check(DBG().synthesizeCrystal() === false, '碎片不够时不能合成')
}

// ---------- 3) 掉落来源（原文三类） ----------
section('3) 掉落规则：副本BOSS 必掉 · 精英/野外BOSS 概率 · 普通怪不掉')
{
  // 【第 54 轮改：普通怪从"不掉"改成"会掉"】
  //   原文（7k7k/177905）只列了「精英怪 / 副本BOSS / 野外BOSS」三类来源，**没提普通怪**，
  //   旧断言于是把 `normal === 0` 钉死。但用户提出：「单机必须要能打了就能获得碎片，
  //   不然怎么获得角色」—— 这是产品层面的硬约束：碎片→白彩→兑换/唤醒形态，
  //   而单机版没有运营活动；照原文那样普通怪不掉，就只剩稀疏的精英/BOSS，凑不齐一只形态。
  //   所以本条**故意偏离原文**（已登记 deviations），断言改成钉"新意图"：
  //   普通怪会掉、且掉率在合理区间。**偏离本身也要被钉住**，否则以后没人知道它是有意为之。
  check(D.SHARD_DROP.normal > 0,
    `普通野外怪会掉碎片（${D.SHARD_DROP.normal}）—— 单机版没有运营活动，不掉就凑不齐形态`)
  check(D.SHARD_DROP.normal <= 0.5,
    `普通怪掉率 ≤0.5（${D.SHARD_DROP.normal}），否则碎片贬值、形态失去分量`)
  check(D.SHARD_DROP.dungeonBoss === 1, '副本 BOSS 必掉')

  save.data.shards = 0
  let dungeonGot = 0
  for (let i = 0; i < 20; i++) { save.data.shards = 0; dungeonGot += DBG().rollShardDrop({ dungeonBoss: true }) }
  check(dungeonGot === 20, `副本BOSS 20 次全掉（${dungeonGot}/20）`)

  // 抽样掉率：2000 次，允差 ±8 个百分点（随机波动）
  let normalGot = 0
  const NR = 2000
  for (let i = 0; i < NR; i++) normalGot += DBG().rollShardDrop({})
  const nrate = normalGot / NR
  check(normalGot > 0, `普通怪确实会掉（${normalGot}/${NR}）`)
  check(Math.abs(nrate - D.SHARD_DROP.normal) < 0.08,
    `普通怪 ${NR} 次实测掉率 ${(nrate * 100).toFixed(1)}%（配置 ${(D.SHARD_DROP.normal * 100).toFixed(0)}%，允差 ±8）`)

  let tierGot = 0
  for (let i = 0; i < 400; i++) tierGot += DBG().rollShardDrop({ bossTier: true })
  check(tierGot > 0 && tierGot < 400, `精英/野外BOSS 400 次掉了 ${tierGot} 次（概率掉落）`)

  // bossTier 名单是按**项目里已有的判据**算的，不是另列的名单 → 自证
  const ids = DBG().bossTierIds()
  check(ids.length > 0, `精英/野外BOSS 档共 ${ids.length} 只`)
  const all = D.MONSTERS
  const power = (m) => (m.stats ? m.stats.life * m.stats.atk : (m.life || 0) * (m.atk || 0))
  const vals = all.map(power).filter((v) => v > 0).sort((a, b) => a - b)
  const median = vals[Math.floor(vals.length / 2)]
  const wrong = ids.filter((id) => {
    const m = D.monster(id)
    return !m || power(m) < median * 2
  })
  check(wrong.length === 0, `名单里每一只都满足"战力 ≥ 中位数×2"（中位数 ${Math.round(median)}）`, wrong.join(','))
  check(D.monster(ids[0]) != null, `名单里的 id 都能取到怪（例：${D.monster(ids[0]).name}）`)
}

// ---------- 4) 珍宝小屋货架 ----------
section('4) 珍宝小屋：类目与 missing 如实标注')
{
  save.data.soya = []
  save.data.white = 0
  const list = DBG().treasureStock()
  check(list.length > 0, `货架上有 ${list.length} 件商品`)
  const cats = new Set(list.map((x) => x.cat))
  check(cats.has('道具'), '有「道具」（原文点名的大类）')
  check(cats.has('战斗道具'), '有「战斗道具」（原文点名的大类）')
  check(cats.has('珍稀索亚'), '有「珍稀索亚」（原文：珍稀索亚？珍宝小屋里面也有！）')
  check(list.every((x) => x.white > 0 && x.name), '每件都有名字与白彩价格')
  // 守住刚踩的坑：投掷型的伤害在 damageMul 上，damage 是 0
  const throwItems = D.items().filter((i) => i.kind === '投掷型')
  check(throwItems.length > 0, `道具表里有 ${throwItems.length} 件投掷型（战斗道具的来源）`)
  check(throwItems.every((i) => (i.damage || 0) === 0 && (i.damageMul || 0) > 0),
    '投掷型用 damageMul 表示威力、damage 为 0 —— 所以不能按 damage>0 筛')

  const un = D.TREASURE_UNAVAILABLE
  check(un.some((u) => u.cat === '技能' && u.conf === 'missing'), '「技能」如实标 missing（我们没有学技能机制）')
  // 【第 45 轮改】原先断言「服饰」标 missing、理由是"归档里没有可交易的服饰道具"。
  // 服饰系统做出来之后那条理由已经不成立 —— 但**珍宝小屋仍然不卖服饰**：
  // 官方给的服饰售卖点是多比大街最右端的「服饰大楼」找麦基（7k7k/178975）。
  // 所以断言改成"这一格仍不在货架上，且理由指向真正的售卖点"，
  // 而不是把这条删掉 —— 删掉就等于以后不再检查这一格了。
  const noCostume = un.find((u) => u.cat === '服饰')
  check(!!noCostume, '「服饰」这一类仍然明确标注不在本店售卖')
  check(!!noCostume && /服饰大楼|麦基/.test(noCostume.reason),
    '理由指向官方真正的售卖点（服饰大楼 / 麦基）', noCostume && noCostume.reason)
  check(D.treasureStock().every((x) => x.kind !== 'costume'), '货架上确实没有服饰商品')
  check(un.every((u) => u.reason && u.reason.length > 6), '每一类缺失都写了原因')
}

// ---------- 5) 购买与积分 ----------
section('5) 购买：扣白彩、给货、每消费 1 白彩得 1 积分')
{
  save.data.white = 0
  const item = DBG().treasureStock().find((x) => x.kind === 'item')
  check(!!item, `找到普通商品：${item ? item.name : '—'}`)
  if (!item) { console.log('  （货架为空，后面的购买断言跳过）') }
  else {
    check(DBG().treasureBuy(item) === false, '白彩不足时买不了')
    check((save.data.items[item.id] || 0) === 0, '白彩不足时背包没变')
  }

  save.data.white = 100
  save.data.points = 0
  const before = save.data.items[item.id] || 0
  check(DBG().treasureBuy(item) === true, '白彩足够时买下')
  check((save.data.items[item.id] || 0) === before + 1, `背包 +1（${before} → ${save.data.items[item.id]}）`)
  check(save.data.white === 100 - item.white, `白彩扣掉 ${item.white}（剩 ${save.data.white}）`)
  check(save.data.points === item.white, `积分 +${item.white}（原文：每消费 1 白彩得 1 积分）`)

  // 买索亚
  const sy = DBG().treasureStock().find((x) => x.kind === 'soya')
  check(!!sy, `货架上有珍稀索亚：${sy ? sy.name : '—'}`)
  save.data.soya = []
  save.data.white = 100
  check(DBG().treasureBuy(sy) === true, '买下珍稀索亚')
  check(save.data.soya.includes(sy.id), `索亚已入库（${save.data.soya.join(',')}）`)
  check(save.data.soyaActive === sy.id, '自动设为出战')
  check(DBG().treasureBuy(sy) === false, '同一只索亚不能重复买')
}

// ---------- 6) 界面与入口 ----------
section('6) 入口：NPC「肖恩普」+ J 键')
{
  const names = D.TREASURE_UNAVAILABLE.length
  check(names >= 2, '缺失类目表可用')
  S().mode = 'explore'; t.step(2)
  t.key('j'); t.step(2)
  check(S().mode === 'treasure', `按 J 进入珍宝小屋（mode=${S().mode}）`)
  const tabs = DBG().treasureTab()
  t.key('q'); t.step(1)
  check(DBG().treasureTab() !== tabs, `Q 能换页签（${tabs} → ${DBG().treasureTab()}）`)
  DBG().setTreasureTab(1)
  const rects = DBG().treasureRects()
  check(rects.length > 0 && rects.every((r) => r.x >= 0 && r.x + r.w <= 960 && r.y >= 0 && r.y + r.h <= 560),
    `兑换页 ${rects.length} 个商品矩形都在屏内`)
  // 【第 52 轮】兑换页加了 30 多种多比形态后一共 40+ 件 → 必须分页，否则画到屏幕外。
  // 这一段钉住"一页装得下 + 翻页能翻到最后一页 + 最后一页也不越界"。
  {
    const pi = DBG().treasurePage()
    check(pi.total > pi.perPage, `兑换页商品比一页多（共 ${pi.total} 件，每页 ${pi.perPage} 件）→ 必须分页`)
    check(pi.pages === Math.ceil(pi.total / pi.perPage), `页数算得对（${pi.pages} 页）`)
    check(rects.length <= pi.perPage, `当前页的矩形不超过每页上限（${rects.length} ≤ ${pi.perPage}）`)
    let allIn = true, seen = 0
    for (let p = 0; p < pi.pages; p++) {
      DBG().treasureSetPage(p)
      const rs = DBG().treasureRects()
      seen += rs.length
      if (!rs.every((r) => r.x >= 0 && r.x + r.w <= 960 && r.y >= 0 && r.y + r.h <= 560)) allIn = false
    }
    check(allIn, `翻遍 ${pi.pages} 页，每页的商品矩形都在屏内`)
    check(seen === pi.total, `每件商品都排进了某一页（${seen} = ${pi.total}）`)
    DBG().treasureSetPage(0)
  }
  t.key('Escape'); t.step(2)
  check(S().mode === 'explore', `Esc 返回探索（mode=${S().mode}）`)

  // 官方入口 NPC
  // 【第 40 轮改】入口类 NPC 现在**只在"该岛的中心场景"**出现（用户反馈 NPC 太多，
  // 原先按岛随机刷、满地图都是肖恩普）。所以这里要去找王城的**中心场景**，而不是随便一个王城场景。
  const castleIsl = ((S().world && S().world.islands) || []).find((i) => i.id === 'castle')
  const castleSceneId = castleIsl && castleIsl.scenes && castleIsl.scenes[0]
  const castle = castleSceneId ? S().scenes[castleSceneId]
    : Object.values(S().scenes).find((sc) => sc.island === 'castle' && sc.kind === 'scene')
  S().mode = 'explore'
  DBG().gotoScene(castle.id, 'left'); t.step(3)
  const npc = DBG().spawns.npcs.find((n) => n.treasure)
  check(!!npc, `王城中心场景（scene_${castle.id}）有珍宝小屋 NPC：${npc ? npc.name : '（无）'}`)
  check(npc && npc.name === '肖恩普', '用的官方 NPC 名「肖恩普」（原文：圣多克骑士厅找肖恩普）')
  // 而且**不该**每个王城场景都有他（这是本轮修的"NPC 太多"）
  const others = Object.values(S().scenes).filter((sc) => sc.island === 'castle' && sc.id !== castle.id && sc.kind === 'scene')
  let dup = 0
  for (const sc of others) {
    S().mode = 'explore'; DBG().gotoScene(sc.id); t.step(1)
    if ((DBG().spawns.npcs || []).some((n) => n.treasure)) dup++
  }
  check(dup === 0, `其他 ${others.length} 个王城场景里没有重复的肖恩普（入口只在中心场景）`)
}

console.log(`\n结果: 通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
