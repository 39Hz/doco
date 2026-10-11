// 碎片获取来源（第 54 轮）
//
// 【为什么有这个测试】用户的原话：「单机必须要能打了就能获得碎片，不然怎么获得角色」。
// 碎片是"打怪 → 白彩 → 兑换/唤醒形态"这条链的入口，断了后面全断。
// 本文件钉住三件事：
//   ① 普通野怪会掉碎片（第 54 轮从"不掉"改成会掉，依据与理由见 game/tables/treasure.js）；
//   ② 在线礼包：10/20/30 分钟三档、能领、不能重复领、没到点不能领
//      （官方原文 7k7k/178665：达到 10/20/30 分钟得在线大礼包，含白色彩晶石碎片）；
//   ③ 整条链通得了：碎片 → 白彩 → 形态价格，且打怪量级是"能凑齐一只形态"的。
import { T } from './game-harness.mjs'
const t = T
t.load('game/game.js')
await T.settle()
const W = t.get('window')
const D = W.DKDbbData
const DBG = () => W.__DKDbb_DEBUG__
const save = W.DKDbb.save

let ok = 0, bad = 0
const check = (cond, label, extra) => {
  if (cond) { ok++; console.log(`  ✓ ${label}`) }
  else { bad++; console.log(`  ✗ ${label}${extra ? '  → ' + extra : ''}`) }
}
const section = (s) => console.log(`\n=== ${s} ===`)

section('1) 掉落表：三类来源 + 普通怪（第 54 轮起）')
{
  check(D.SHARD_DROP.dungeonBoss === 1, `副本 BOSS 必掉（${D.SHARD_DROP.dungeonBoss}）`)
  check(D.SHARD_DROP.bossTier > 0 && D.SHARD_DROP.bossTier < 1, `精英/野外BOSS 按概率（${D.SHARD_DROP.bossTier}）`)
  check(D.SHARD_DROP.normal > 0, `普通野怪会掉（${D.SHARD_DROP.normal}）—— 单机版没有运营活动，这是唯一能反复刷的来源`)
}

section('2) 普通怪掉落实测')
{
  const N = 2000
  let hits = 0
  const before = save.data.shards || 0
  for (let i = 0; i < N; i++) hits += DBG().rollShardDrop({})
  const got = (save.data.shards || 0) - before
  check(hits > 0, `普通怪 ${N} 次命中了 ${hits} 次`)
  check(hits === got, `命中次数与碎片增量一致（${hits} = ${got}）`)
  check(Math.abs(hits / N - D.SHARD_DROP.normal) < 0.08,
    `实测掉率 ${(hits / N * 100).toFixed(1)}% ≈ 配置 ${(D.SHARD_DROP.normal * 100).toFixed(0)}%`)
}

section('3) 在线礼包（官方原文：10/20/30 分钟三档）')
{
  save.data.playSeconds = 0
  save.data.onlineGift = {}
  check(DBG().onlineGiftReady().length === 0, '新档（0 分钟）没有可领的礼包')

  save.data.playSeconds = 11 * 60
  save.data.onlineGift = {}
  const r11 = DBG().onlineGiftReady()
  check(r11.length === 1 && r11[0] === 10, `11 分钟时只有 10 分钟那档可领（${r11.join(',')}）`)

  save.data.playSeconds = 31 * 60
  save.data.onlineGift = {}
  const s0 = save.data.shards || 0, g0 = save.data.gold || 0
  check(DBG().claimOnlineGift() === true, '31 分钟时领取成功（一次结清三档）')
  const ds = (save.data.shards || 0) - s0, dg = (save.data.gold || 0) - g0
  check(ds === 10, `碎片 +${ds}（2+3+5=10，越久越丰厚）`)
  check(dg === 2100, `金币 +${dg}（300+600+1200=2100）`)
  check(DBG().claimOnlineGift() === false, '不能重复领（已领过的档不再发）')
  check(DBG().onlineGiftReady().length === 0, '领完之后没有可领项')

  save.data.playSeconds = 5 * 60
  save.data.onlineGift = {}
  check(DBG().claimOnlineGift() === false, '5 分钟时领不到（没到 10 分钟）')
}

section('4) 整条链：碎片 → 白彩 → 形态')
{
  const per = D.treasureShardsPerCrystal()
  check(per >= 1, `合成比 ${per} 碎片 = 1 白彩`)
  check(D.treasureDailyLimit() === 5, `每日最多合 5 块白彩（官方原文）`)
  const common = D.FORM_PRICE_TIERS[0].white
  const epic = D.FORM_PRICE_TIERS[D.FORM_PRICE_TIERS.length - 1].white
  check(common > 0 && epic > common, `形态价格分档：${common} ~ ${epic} 白彩`)

  // 量级自证：打多少只怪 ≈ 一只最便宜的形态？（不能是"要打上万只"那种不可达）
  const kills = Math.ceil((common * per) / D.SHARD_DROP.normal)
  check(kills < 200, `打约 ${kills} 只普通怪 ≈ 一只最便宜的形态（${common}白彩 = ${common * per}碎片）`)
  // 也不能太便宜：一两只怪就换一只形态，形态就没分量了
  check(kills > 20, `打 ${kills} 只换一只形态 —— 不至于一两只就到手（保持形态的分量）`)
}

console.log(`\n通过 ${ok} 项，失败 ${bad} 项`)
process.exit(bad ? 1 : 0)
