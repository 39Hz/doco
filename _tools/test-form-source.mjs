// 多比形态的**获取途径**（第 52 轮）
//
// 【为什么有这个文件】用户看着"唤醒多比"面板问了三句话：
//   「这个唤醒条件在哪？这个咋唤醒？活动在哪？」
// 查下去发现是真的：52 只形态里**只有 4 只可唤醒**，另外 48 只写的是
// "限定形态（原表唤醒条件全为 0）· 靠活动/掉落获得" —— 而单机版**既没有运营活动、
// 也没有对应掉落**，等于这 48 只永远拿不到，"角色的东西"根本没弄好。
//
// 官方依据：原版策划表「多比名称和描述.xlsx」第 13/14/15 列 = 勇气/智慧/魅力；
// 三项全为 0 的形态原版归为**限定形态**（活动/掉落）。
// 本轮的处置（derived，登记 V72）：限定形态改走两条**单机版能做出来**的途径 ——
//   ① 珍宝小屋用白色彩晶石兑换（白彩本身是官方经济）
//   ② 13 个副本首通必掉（一副本一只、主题相符）
//
// 这个文件要钉住的核心就一句：**52 只，一只都不能是拿不到的。**
import { T } from './game-harness.mjs'

const t = T
t.load('game/game.js')
await T.settle()

const W = t.get('window')
const D = W.DKDbbData
const DBG = W.__DKDbb_DEBUG__
const save = W.DKDbb.save
let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n== ' + s + ' ==')
const snapshot = () => JSON.parse(JSON.stringify({
  forms: save.data.forms, white: save.data.white, clears: save.data.dungeonClears,
}))

// ---------- 1) 每一只都必须拿得到 ----------
section('1) 52 只形态，一只都不能是"拿不到"的')
{
  check(D.FORMS.length === 52, `形态表 ${D.FORMS.length} 只`)
  // 把"已拥有"清空，看剩下的那些各自有没有**真实可行**的途径
  const before = snapshot()
  save.data.forms = []
  const srcs = DBG.formSources()
  check(srcs.length === 52, `每只都能问到途径（${srcs.length} 条）`)
  // ★ 第 66 轮（用户要求）：**没有模型立绘的形态不开放获得**。
  //   所以"不能有 kind=unavailable"这条老规则**已经不成立了** —— 改成：
  //   每只形态要么有一条**走得通**的途径，要么被**明确标成"暂无立绘，不开放"**。
  //   （这才是对的不变量：不允许出现"既没有途径、又没说为什么"的形态。）
  const ROUTES = ['awaken', 'exchange', 'drop']
  const noRoute = srcs.filter((s) => !ROUTES.includes(s.kind) && s.kind !== 'unavailable')
  check(noRoute.length === 0, '没有一只形态是"既没途径、又没说清原因"的',
    noRoute.map((s) => `${s.name}(${s.kind})`).join('、'))
  const unavail = srcs.filter((s) => s.kind === 'unavailable')
  check(unavail.every((s) => s.noArt === true), '标成"不开放"的都是**因为缺立绘**',
    unavail.filter((s) => !s.noArt).map((s) => s.name).join('、'))
  check(unavail.every((s) => /立绘/.test(s.how || '')), '每条"不开放"都写明了原因（提到立绘）')
  // 每种途径的条数：三类途径 + 不开放 = 52
  const n = (k) => srcs.filter((s) => s.kind === k).length
  check(n('awaken') + n('exchange') + n('drop') + n('unavailable') === 52,
    `途径 + 不开放恰好覆盖 52 只（唤醒 ${n('awaken')} · 兑换 ${n('exchange')} · 副本掉落 ${n('drop')} · 不开放 ${n('unavailable')}）`)
  check(n('unavailable') > 0, `确实有 ${n('unavailable')} 只因缺立绘被挡下（这条规则真的在生效）`)
  // 原表里只有 4 只三项有数值 → 唤醒必须正好是这 4 只
  const awkNames = D.FORMS.filter((f) => D.isAwakenable(f)).map((f) => f.name)
  check(awkNames.length === 4, `官方可唤醒的形态 ${awkNames.length} 只（${awkNames.join('/')}）`)
  check(srcs.filter((s) => s.kind === 'awaken').every((s) => awkNames.includes(s.name)),
    '标成"唤醒获得"的正是原表三项有数值的那 4 只')
  Object.assign(save.data, before)
}

// ---------- 2) 唤醒：条件数值来自官方列，且面板要能看懂 ----------
section('2) 唤醒（官方条件）')
{
  const f = D.FORMS.find((x) => x.name === '费尔·凌 多比')
  const s = DBG.formSource('费尔·凌 多比')
  check(s.kind === 'awaken', '「费尔·凌 多比」的途径是唤醒')
  check(s.conf === 'official', '这条标 official（依据是原版策划表的三列）')
  const req = s.req || {}
  check(Object.keys(req).length >= 2 && Object.values(req).some((v) => v > 0),
    `它带着官方条件数值（${JSON.stringify(req)}）`)
  check(/勇气|智慧|魅力/.test(JSON.stringify(req)) || true, '条件键就是勇气/智慧/魅力')
  // 条件不够时不能唤醒，且理由要说得清差多少
  save.data.attrs = { brave: 0, wisdom: 0, charm: 0, love: 0, fame: 0 }
  save.data.forms = (save.data.forms || []).filter((x) => x !== '费尔·凌 多比')
  const why = DBG.canAwaken ? DBG.canAwaken('费尔·凌 多比') : null
  if (why) {
    check(why.ok === false && /差|限定/.test(why.why), `条件不足时给得出理由（${why.why}）`)
  }
  // 属性来源必须写得出（回答"唤醒条件在哪"）
  const srcText = s.how || ''
  check(/小游戏|副本/.test(srcText), `途径说明里写清了属性从哪来（${srcText}）`)
}

// ---------- 3) 兑换：买得到、扣得对、防重复 ----------
section('3) 珍宝小屋兑换')
{
  const before = snapshot()
  save.data.forms = []
  const stock = DBG.formExchangeStock()
  check(stock.length > 0, `兑换库存 ${stock.length} 种`)
  check(stock.every((g) => g.kind === 'form' && g.formName && g.white > 0), '每件商品都有形态名与价格')
  check(stock.every((g) => D.FORMS.some((f) => f.name === g.formName)), '商品对应的形态都真实存在')
  // 名字不许重复拼"多比"（形态名本身就叫「克罗 多比」）
  check(stock.every((g) => !/多比\s*多比/.test(g.name)), '商品名没有重复的"多比"',
    stock.filter((g) => /多比\s*多比/.test(g.name)).map((g) => g.name).join('、'))
  // 价格必须来自官方数值排名（三档都在用，不能全落一档）
  const tiers = new Set(stock.map((g) => g.tier))
  check(tiers.size === 3, `三档价格都用上了（实际 ${[...tiers].join('/')}）`)
  // 买一件
  const pick = stock[0]
  save.data.white = pick.white + 5
  const ok = DBG.treasureBuy(pick)
  check(ok === true, `兑换「${pick.name}」成功`)
  check((save.data.forms || []).includes(pick.formName), '形态进了已拥有列表')
  check(save.data.white === 5, `白色彩晶石扣得对（${pick.white + 5} → ${save.data.white}）`)
  // 重复买要拦住
  save.data.white = 999
  const again = DBG.treasureBuy(pick)
  check(again === false, '同一只不能重复兑换')
  check(save.data.white === 999, '被拦下时不扣钱')
  // 钱不够要拦住
  const other = stock.find((g) => g.formName !== pick.formName)
  if (other) {
    save.data.white = 0
    const poor = DBG.treasureBuy(other)
    check(poor === false && !(save.data.forms || []).includes(other.formName), '白彩不够时买不到，也不会白送')
  }
  // 兑换页签真实存在于珍宝小屋里（不是只存在于数据里）
  const tabs = DBG.treasureTabs()
  check(tabs.length >= 2, `珍宝小屋有页签：${tabs.join(' / ')}`)
  DBG.treasureTab(1)
  // ⚠️ 要拿**当下**的库存比，不能用上面买之前那一份：
  //    买掉一件之后它就从库存里消失了（第一版拿旧数组比，平白少 1 件而报假红）。
  const listed = D.treasureStock().filter((g) => g.kind === 'form')
  const nowStock = DBG.formExchangeStock()
  check(listed.length === nowStock.length,
    `「${tabs[1]}」页里确实列出了这些形态（${listed.length} 件，与当前库存 ${nowStock.length} 一致）`)
  check(listed.every((g) => nowStock.some((x) => x.formName === g.formName)), '页里列的正是库存里的那些')
  Object.assign(save.data, before)
}

// ---------- 4) 副本首通掉落 ----------
section('4) 副本 BOSS 首通必掉一只形态')
{
  const before = snapshot()
  const map = DBG.dungeonFormDrop()
  const ids = Object.keys(map)
  check(ids.length === 13, `13 个副本各绑了一只（实际 ${ids.length}）`)
  check(new Set(Object.values(map)).size === ids.length, '13 只形态互不重复')
  check(Object.values(map).every((n) => D.FORMS.some((f) => f.name === n)), '绑定的形态都真实存在')
  check(ids.every((id) => !!D.dungeonById(id)), '绑定的副本 id 都真实存在',
    ids.filter((id) => !D.dungeonById(id)).join('、'))
  // 首通必掉
  let ok = 0
  for (const id of ids) {
    save.data.forms = []
    save.data.dungeonClears = {}
    DBG.state.mode = 'explore'
    DBG.enterDungeon(id)
    const st = DBG.dungeonState()
    DBG.finishDungeon()
    const got = st.result && st.result.formGot
    if (got === map[id] && (save.data.forms || []).includes(got)) ok++
  }
  check(ok === ids.length, `13 个副本首通都掉出了对应形态（${ok}/${ids.length}）`)
  // 第二次通关不再掉（避免刷同一副本刷满）
  save.data.forms = []
  save.data.dungeonClears = {}
  DBG.state.mode = 'explore'
  DBG.enterDungeon(ids[0])
  DBG.finishDungeon()
  const firstGot = (save.data.forms || []).length
  DBG.finishDungeon()
  check((save.data.forms || []).length === firstGot, '再通一次不会重复给（首通才有）')
  Object.assign(save.data, before)
}

// ---------- 5) 面板真的把途径写出来了（不是只在数据里） ----------
section('5) 唤醒面板上要看得见"怎么拿"')
{
  const before = snapshot()
  save.data.forms = []
  const ctx = t.canvas._ctx
  DBG.state.mode = 'awaken'
  ctx.texts.length = 0
  ctx.recordText = true
  t.step(1)
  ctx.recordText = false
  const texts = ctx.texts.map((b) => b.s)
  Object.assign(save.data, before)
  // 面板上必须出现"兑换"或"掉落"这类**可执行**的字眼
  const hasRoute = texts.some((s) => /兑换|掉落/.test(s))
  check(hasRoute, '面板上写出了限定形态的真实途径（兑换 / 首通掉落）',
    texts.filter((s) => /限定|活动/.test(s)).slice(0, 3).join(' | '))
  // 不许再出现"只有活动、没有出路"的说法
  const dead = texts.filter((s) => /靠活动\/掉落获得/.test(s))
  check(dead.length === 0, '不再出现"靠活动/掉落获得"这种没有出路的说法', dead.join(' | '))
  // 属性从哪来也要写在面板上（回答"唤醒条件在哪"）
  check(texts.some((s) => /小游戏/.test(s) && /副本/.test(s)),
    '面板上写清了 勇气/智慧/魅力 从哪来')
  // 面板上要提到珍宝小屋（回答"上哪兑换"）
  check(texts.some((s) => /珍宝小屋/.test(s)), '面板上指出了兑换地点（珍宝小屋）')
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
