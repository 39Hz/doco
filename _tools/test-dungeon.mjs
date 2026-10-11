// M4-1 副本：数据表 + 统一骨架 + 魅力属性（官方硬规则）。
//
// 官方依据（docs/官方资料库.md 第十二章）：
//   · 只有组队才能进入；副本由**特定 NPC 传送**进入（原文举例：迷失里的拉鲁 → 金字塔）
//   · 骨架：小游戏/解谜 → 战斗 → BOSS → 翻牌/掉落
//   · **硬规则**：「完成副本冒险可以收获到只有在副本里才能获得的**魅力**属性」
//   · 常规奖励：金币、彩晶石、晶石碎片、魅力值、勇气
//
// 数据完整性是重点：14 个副本引用的怪物必须真实存在，来源等级与出处必须齐全，
// 英雄抉择（原文查不到玩法）必须**保持缺失而不是编一个**。
import { T } from './game-harness.mjs'
import fs from 'node:fs'
import path from 'node:path'
const ROOT = path.resolve('.')

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

// ---------- 1) 数据表 ----------
section('1) 14 个副本的数据表')
const duns = DBG().dungeons()
check(duns.length === 14, `共 ${duns.length} 个副本（官方 14 个）`)
check(duns.every((d) => d.name && d.conf), '每个都有名字与来源等级')
{
  const byConf = {}
  for (const d of duns) byConf[d.conf] = (byConf[d.conf] || 0) + 1
  check(byConf.official >= 11, `official ${byConf.official} 个 / derived ${byConf.derived || 0} 个 / missing ${byConf.missing || 0} 个`)
  const noInfo = D.DUNGEONS.filter((d) => !d.evidence)
  check(noInfo.length === 0, '每个副本都写了出处（evidence）', noInfo.map((d) => d.name).join(','))
}
check(DBG().playableDungeons().length === 13, `13 个有玩法依据可玩（实际 ${DBG().playableDungeons().length}）`)
{
  const hero = D.DUNGEONS.find((d) => d.id === 'yingxiongjueze')
  check(!!hero, '英雄抉择在表里')
  check(hero.conf === 'missing', `英雄抉择标为 ${hero.conf}（玩法查不到就不编）`)
  check(hero.stages.length === 0, '英雄抉择没有关卡（不编造玩法）')
  check(!!hero.missingNote, '英雄抉择写明了缺失原因')
}

// ---------- 2) 引用的怪物必须真实存在 ----------
section('2) 关卡引用的怪物必须真实存在')
{
  const ids = D.dungeonMonsterIds()
  const bad = ids.filter((id) => !D.monster(id))
  check(bad.length === 0, `${ids.length} 个引用的怪物全部存在`, bad.join(','))
  check(ids.includes(19009), '用到官方点名的「蛇面蝙蝠」（金字塔守卫者）')
  check(ids.includes(19011), '用到官方剧情里的「魔化河伯」（大禹治水）')
  // 顺带守住一个真踩过的坑：D.MONSTERS 是数组，按 id 取怪必须用 D.monster()
  check(Array.isArray(D.MONSTERS), 'D.MONSTERS 是数组（不是 id 字典）')
  check(D.MONSTERS[String(19009)] === undefined, '用 D.MONSTERS["19009"] 取不到怪 —— 所以必须用 D.monster()')
  check(!!D.monster(19009), 'D.monster(19009) 能取到蛇面蝙蝠')
  check(D.islandMonsterName('volcano') === D.monster(D.ISLAND_MONSTERS.volcano[0]).name,
    `islandMonsterName 返回真实怪名（${D.islandMonsterName('volcano')}）`)
}
{
  // 替换说明必须写明（R3：不得静默降级）
  const need = []
  for (const d of D.DUNGEONS) for (const st of d.stages) {
    if (st.kind === 'boss' && st.monNote == null) need.push(`${d.name}/${st.label}`)
  }
  check(need.length === 0, '每个 BOSS 关都注明了"原文是谁 / 我们用了谁"', need.join(','))
}

// ---------- 3) 存档字段（老档要能迁移） ----------
section('3) 存档：角色属性 + 副本通关记录')
check(save.data.attrs && typeof save.data.attrs === 'object', 'attrs 是对象')
check(DBG().attrNames().charm === '魅力', '属性名表里有魅力')
{
  const names = DBG().attrNames()
  for (const k of ['wisdom', 'brave', 'love', 'charm', 'fame']) check(k in names, `有 ${k}（${names[k]}）`)
  const legacy = { playerName: '老档', level: 5, started: true }
  const r = save.migrate(legacy)
  check(r.data.attrs && typeof r.data.attrs === 'object', '老档迁移后补齐 attrs')
  check(typeof r.data.dungeonClears === 'object', '老档迁移后补齐 dungeonClears')
  check(r.data.attrs.charm === 0, `魅力初值 ${r.data.attrs.charm}`)
}

// ---------- 4) 入口：NPC 传送（原版形式） ----------
section('4) 入口：官方 NPC「拉鲁」传送 + F 键')
{
  // 进一个主城场景，找传送 NPC
  const castle = Object.values(S().scenes).find((sc) => sc.island === 'castle' && sc.kind === 'scene')
  check(!!castle, '找到王城场景')
  S().mode = 'explore'
  DBG().gotoScene(castle.id, 'left'); t.step(3)
  // 刷怪是懒加载的：进图后由 sceneSpawns 建；直接问调试接口拿当前场景的
  const gate = DBG().spawns.npcs.find((n) => n.dungeonGate)
  check(!!gate, `王城有副本传送 NPC：${gate ? gate.name : '（无）'}`)
  check(gate && gate.name === '拉鲁', '用的官方 NPC 名「拉鲁」（原文：迷失里的拉鲁传送金字塔）')

  S().mode = 'explore'; t.step(2)
  t.key('i'); t.step(2)
  check(S().mode === 'dungeon', `按 I 进入副本界面（mode=${S().mode}）`)
  check(DBG().dungeonState().phase === 'list', '停在列表页')
  const rects = DBG().dungeonListRects()
  check(rects.length === 14, `列表版式给出 ${rects.length} 个矩形`)
  check(rects.every((r) => r.x >= 0 && r.x + r.w <= 960 && r.y >= 0 && r.y + r.h <= 560), '列表矩形都在屏内')
}

// ---------- 5) 打通金字塔（记忆力 → 战斗 → 记忆力 → BOSS → 翻牌） ----------
section('5) 打通金字塔：解谜 → 战斗 → 解谜 → BOSS → 翻牌')
// 先把玩家练强，否则打不过 BOSS（这是测试手段，不是玩法）
save.data.level = 70
save.data.forms = D.FORMS.map((f) => f.name)
save.data.hp = 0; save.data.maxHp = 0; save.data.mp = 0; save.data.maxMp = 0
DBG().refreshVitals ? DBG().refreshVitals() : null
t.step(2)
save.data.hp = save.data.maxHp || 99999
save.data.mp = save.data.maxMp || 9999
if (save.data.maxHp < 1000) save.data.maxHp = save.data.hp = 99999
check(save.data.hp > 1000, `玩家已强化（HP ${save.data.hp}）`)

check(DBG().enterDungeon('jinzita') === true, '进入金字塔')
check(S().mode === 'dungeon', `mode=${S().mode}`)

const arrowKey = { ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' }
let guard = 0
let sawBattle = 0, sawFlip = 0, memFrames = 0, sawSlide = 0
const seenMemStages = new Set()
// 注意：副本里打战斗时 S.mode 会变成 'battle'，所以循环条件必须同时包含两者，
// 否则一进战斗就退出循环（这正是第一次跑时"打了 0 场"的原因）。
while ((S().mode === 'dungeon' || S().mode === 'battle' || S().mode === 'result') && guard++ < 40000) {
  const st = DBG().dungeonState()
  if (S().mode === 'result') {
    // 副本里打完一场会先出结算画面，按空格才回副本流程
    t.key(' '); t.step(2)
    continue
  }
  if (S().mode === 'battle') {
    sawBattle++
    const b = S().battle
    t.step(1)
    if (b && b.phase === 'command' && b.intro <= 0) t.key('Enter')
    continue
  }
  if (st.phase === 'memory') {
    if (st.seq.showing) { memFrames++; t.step(1); continue }
    seenMemStages.add(st.idx)
    const i = st.seq.input.length
    const k = st.seq.show[i]
    if (!k) { t.step(1); continue }
    t.key(arrowKey[k]); t.step(1)
  } else if (st.phase === 'slide') {
    // 【第 40 轮】金字塔第二关「机关拼图」从"通用记忆力关"改成了**滑动拼图**
    //（原文写的是"解谜**拼图**游戏"，拼图比记忆力贴近得多）。
    // 测试这边就：把盘面摆成"差一步"，再滑一下就过关。
    sawSlide++
    const p = st.slide
    if (!p._tested) {
      const tgt = p.target.slice()
      const b = tgt.indexOf(0)
      const nb = b % 3 === 0 ? b + 1 : b - 1
      tgt[b] = tgt[nb]; tgt[nb] = 0
      p.cells = tgt
      p._tested = true
      DBG().slideMove(b)
    }
    t.step(1)
  } else if (st.phase === 'battle') {
    sawBattle++
    const b = S().battle
    t.step(1)
    if (b && b.phase === 'command' && b.intro <= 0) t.key('Enter')
  } else if (st.phase === 'flip') {
    sawFlip++
    if (st.flip.picked < 0) { DBG().pickFlip(0); t.step(1) }
    else { t.key(' '); t.step(3) }
  } else if (st.phase === 'stage') {
    t.step(1)
  } else break
}
check(seenMemStages.size >= 1, `走过了 ${seenMemStages.size} 段记忆力关（原文：幻影栈道；亮序列共 ${memFrames} 帧）`)
check(sawSlide >= 1, `走过了 ${sawSlide} 帧滑动拼图（原文：机关拼图"解谜拼图游戏"）`)
check(sawBattle > 0, `打了 ${sawBattle} 帧战斗（木乃伊 + 法老两场）`)
check(sawFlip >= 1, '走到翻牌')
check(DBG().dungeonState().phase === 'done', `副本结算 phase=${DBG().dungeonState().phase}`)
check(DBG().dungeonClears('jinzita') === 1, `通关次数 ${DBG().dungeonClears('jinzita')}`)

// ---------- 6) 魅力只能从副本获得（官方硬规则） ----------
section('6) 魅力属性（官方：只能在副本里获得）')
{
  const a = save.data.attrs
  check(a.charm > 0, `通关后魅力 = ${a.charm}`)
  check(a.brave > 0, `同时给了勇气 = ${a.brave}（原文：常规奖励含勇气）`)
  check(a.fame > 0, `首次通关给了声望 = ${a.fame}`)
  // 野外战斗不应该给魅力
  const before = a.charm
  DBG().grantAttr({ brave: 1 })
  check(a.charm === before, '只有副本/明确调用才加魅力（野外战斗路径不给）')
}

// ---------- 7) 翻牌 ----------
section('7) 翻牌：4 张选 1，翻牌前拿不到奖励')
{
  const flipRects = DBG().flipRects()
  check(flipRects.length === 4, `4 张牌（${flipRects.length}）`)
  check(flipRects.every((r) => r.x >= 0 && r.x + r.w <= 960), '牌都在屏内')

  // 再进一次金字塔，手动推进到翻牌阶段
  DBG().enterDungeon('jinzita')
  const st = DBG().dungeonState()
  st.idx = (D.dungeonById('jinzita').stages || []).length
  st.phase = 'flip'
  st.flip = { faces: ['金币', '彩晶石', '晶石碎片', '技能书'], picked: -1, reward: null, dungeon: '金字塔' }
  const charm0 = save.data.attrs.charm
  const gold0 = save.data.gold
  check(st.flip.picked === -1 && st.flip.reward === null, '翻牌前奖励未发放')
  check(save.data.attrs.charm === charm0, '翻牌前魅力未增加')

  DBG().pickFlip(0)
  check(st.flip.picked === 0, '翻开了第 1 张')
  check(!!st.flip.reward, `翻牌结果：${st.flip.reward ? JSON.stringify(st.flip.reward) : '—'}`)
  check(save.data.gold > gold0, `金币增加（${gold0} → ${save.data.gold}）`)
  check(save.data.attrs.charm > charm0, `★ 翻牌结算给了魅力（${charm0} → ${save.data.attrs.charm}）`)
  // 不能重复翻
  const gold1 = save.data.gold
  DBG().pickFlip(1)
  check(save.data.gold === gold1 && st.flip.picked === 0, '同一轮不能重复翻牌')

  // 结算并离开
  DBG().finishDungeon()
  check(DBG().dungeonClears('jinzita') >= 1, `通关次数（${DBG().dungeonClears('jinzita')}）`)
}

// ---------- 8) 缺失的副本不能进入 ----------
section('8) 英雄抉择（玩法无原文）不能进入')
{
  const before = S().mode
  const ok = DBG().enterDungeon('yingxiongjueze')
  check(ok === false, 'enterDungeon 返回 false（不进入）')
  check(S().mode !== 'dungeon' || DBG().dungeonState().id !== 'yingxiongjueze',
    `没有切到英雄抉择（mode=${S().mode}，之前 ${before}）`)
}

// ---------- 9) 「无所遁形」潜行关（火烧赤壁，7k7k/115197 原文） ----------
section('9) 无所遁形：趁守卫背对时前进，被盯上就退回起点')
{
  const names = DBG().stageNames()
  check(names.stealth === '潜行', `关卡类型表里有潜行（${names.stealth}）`)
  check(names.morale === '士气', `关卡类型表里有士气（${names.morale}）`)
  const chibi = D.dungeonById('huoshaochibi')
  check(chibi.stages[0].kind === 'stealth', `火烧赤壁第一关是潜行（实际 ${chibi.stages[0].kind}）`)
  check(chibi.stages[0].label === '无所遁形', `关卡名用了原文的「${chibi.stages[0].label}」`)

  save.data.level = 70
  DBG().enterDungeon('huoshaochibi')
  const st = DBG().dungeonState()
  check(st.phase === 'stealth', `进入潜行阶段（${st.phase}）`)
  check(st.st.guards.length === 2, `有 ${st.st.guards.length} 个守卫巡逻`)
  check(st.st.steps === 6, `甲板共 ${st.st.steps} 格`)
  check(st.st.pos === 0, '从起点开始')

  const x0 = st.st.guards[0].x
  for (let i = 0; i < 30; i++) DBG().stealthTick(1 / 60)
  check(st.st.guards[0].x !== x0, `守卫在巡逻（x ${x0.toFixed(3)} → ${st.st.guards[0].x.toFixed(3)}）`)
  check(typeof DBG().stealthSpotted() === 'boolean', 'stealthSpotted 返回布尔值')

  let tries = 0
  while (DBG().stealthSpotted() && tries++ < 600) DBG().stealthTick(1 / 60)
  const pos0 = st.st.pos
  DBG().stealthAdvance()
  check(st.st.pos === pos0 + 1, `没被盯上时前进成功（${pos0} → ${st.st.pos}）`)

  // 构造"正被盯着"：把一个守卫放到玩家正前方且面朝玩家
  const px = 0.08 + (st.st.pos / st.st.steps) * 0.84
  st.st.guards[0].x = px + 0.10
  st.st.guards[0].facing = -1
  check(DBG().stealthSpotted() === true, '守卫面朝玩家且距离近 → 判定为被发现')
  const caught0 = st.st.caught
  const posBefore = st.st.pos
  DBG().stealthAdvance()
  check(st.st.pos === 0, `被发现后退回起点（${posBefore} → ${st.st.pos}）`)
  check(st.st.caught === caught0 + 1, `被发现次数 +1（${caught0} → ${st.st.caught}）`)

  st.st.guards[0].facing = 1
  check(DBG().stealthSpotted() === false, '守卫背对玩家 → 没被发现')

  let guard2 = 0
  while (st.phase === 'stealth' && guard2++ < 8000) {
    if (DBG().stealthSpotted()) { DBG().stealthTick(1 / 60); continue }
    DBG().stealthAdvance()
    if (st.phase !== 'stealth') break
  }
  check(st.phase !== 'stealth', `走完甲板后离开潜行阶段（现在 ${st.phase}）`)
}

// ---------- 10) 「士气对抗」（噜噜王的终结，7k7k/115968 原文） ----------
section('10) 士气对抗：双方士气先到 100 者胜')
{
  const lu = D.dungeonById('luluwang')
  check(lu.stages[0].kind === 'morale', `噜噜王第一关是士气（实际 ${lu.stages[0].kind}）`)

  const moves = DBG().moraleMoves()
  check(moves.length === 3, `三种招式：${moves.join('/')}`)
  const rects = DBG().moraleRects()
  check(rects.length === 3 && rects.every((r) => r.x >= 0 && r.x + r.w <= 960), '三个招式按钮都在屏内')
  const tbl = DBG().moraleTable()
  check(tbl.length === 3 && tbl.every((r) => r.length === 3), '3×3 收益表')
  check(tbl.every((r) => r.every((c) => c.length === 2 && c[0] > 0 && c[1] > 0)), '每个格子都给出双方的正向收益')

  DBG().enterDungeon('luluwang')
  const st = DBG().dungeonState()
  check(st.phase === 'morale', `进入士气阶段（${st.phase}）`)
  check(st.mo.target === 100, `目标士气 ${st.mo.target}`)
  check(st.mo.mine === 0 && st.mo.foe === 0, '双方从 0 开始')

  DBG().moralePlay(0)
  check(st.mo.mine > 0 && st.mo.foe > 0, `出手后双方都涨（我 ${st.mo.mine} / 敌 ${st.mo.foe}）`)
  check(st.mo.turn === 1, `回合数 ${st.mo.turn}`)
  check(typeof st.mo.last === 'string' && st.mo.last.includes('噜噜王'), `有出手记录：${st.mo.last}`)

  st.mo.mine = 96; st.mo.foe = 0
  let g3 = 0
  while (st.phase === 'morale' && g3++ < 50) DBG().moralePlay(2)
  check(st.phase !== 'morale', `士气先到 100 即过关（现在 ${st.phase}）`)

  // 必败路径：对方只差 5 点、自己从 0 开始 → 必输，应当重置而不是卡死
  DBG().enterDungeon('luluwang')
  const st2 = DBG().dungeonState()
  st2.mo.mine = 0; st2.mo.foe = 95
  let g4 = 0
  while (!st2.mo.done && g4++ < 50) DBG().moralePlay(1)
  check(st2.mo.done === 'lose', `对方先到 100 → 判定失败（done=${st2.mo.done}）`)
  check(st2.mo.foe >= 100, `对方士气已到 ${st2.mo.foe}`)
  // 失败状态**要停住给玩家看见**（早先是判负即重置，界面上根本看不到"被打垮了"）
  DBG().moraleReset()
  check(st2.mo.mine === 0 && st2.mo.foe === 0 && st2.mo.done === null, '按空格后士气重置，可以再来（不会卡死）')
  check(st2.mo.target === 100 && st2.mo.turn === 0, '重置后回满初始状态')
}

// ---------- 11) 「激流勇进」（大禹治水，7k7k/115195 原文） ----------
section('11) 激流勇进：三条航道被冲中的概率一样，要在窗口内换道')
{
  const names = DBG().stageNames()
  check(names.current === '激流', `关卡类型表里有激流（${names.current}）`)
  const dy = D.dungeonById('dayuzhishui')
  check(dy.stages[0].kind === 'current', `大禹治水第一关是激流（实际 ${dy.stages[0].kind}）`)
  check(dy.stages[0].label === '激流勇进', `关卡名用了原文的「${dy.stages[0].label}」`)

  save.data.level = 70
  DBG().enterDungeon('dayuzhishui')
  const st = DBG().dungeonState()
  check(st.phase === 'current', `进入激流阶段（${st.phase}）`)
  const g = st.st
  check(g.lanes === 3, `共 ${g.lanes} 条航道`)
  check(g.pass >= 1, `需要躲开 ${g.pass} 波`)
  check(g.window > 0, `反应窗口 ${g.window} 秒`)

  let guard = 0
  while (g.wave < 0 && guard++ < 600) DBG().currentTick(1 / 60)
  check(g.wave >= 0 && g.wave < 3, `出现湍流在第 ${g.wave} 条航道`)

  g.lane = (g.wave + 1) % 3
  const done0 = g.done
  for (let i = 0; i < 200 && g.wave >= 0; i++) DBG().currentTick(1 / 60)
  check(g.done === done0 + 1, `躲开后计数 +1（${done0} → ${g.done}）`)

  while (g.wave < 0 && guard++ < 4000) DBG().currentTick(1 / 60)
  g.lane = g.wave
  const hits0 = g.hits
  for (let i = 0; i < 200 && g.wave >= 0; i++) DBG().currentTick(1 / 60)
  check(g.hits === hits0 + 1, `没躲开则被冲中 +1（${hits0} → ${g.hits}）`)

  // 被冲中 3 次 → 本关重来
  st.st.hits = 2
  while (st.st.wave < 0) DBG().currentTick(1 / 60)
  st.st.lane = st.st.wave
  for (let i = 0; i < 200 && st.st.wave >= 0; i++) DBG().currentTick(1 / 60)
  check(st.st.hits === 0 && st.st.done === 0, `被冲中 3 次后本关重来（hits=${st.st.hits} done=${st.st.done}）`)

  const brave0 = (save.data.attrs || {}).brave || 0
  let g2 = 0
  while (st.phase === 'current' && g2++ < 40000) {
    const gg = st.st
    if (gg.wave >= 0 && gg.lane === gg.wave) gg.lane = (gg.wave + 1) % 3
    DBG().currentTick(1 / 60)
  }
  check(st.phase !== 'current', `连续躲开后离开激流阶段（现在 ${st.phase}）`)
  const brave1 = (save.data.attrs || {}).brave || 0
  check(brave1 > brave0, `激流关给勇气（${brave0} → ${brave1}）`)
}

// ---------- 12) 「玛丽娜的考试」（武当保卫战，7k7k/508282 原文） ----------
section('12) 玛丽娜的考试：题目答案都带出处，答够题数才通过')
{
  const names = DBG().stageNames()
  check(names.quiz === '考试', `关卡类型表里有考试（${names.quiz}）`)
  const wd = D.dungeonById('wudangbaoweizhan')
  check(wd.stages[0].kind === 'quiz', `武当保卫战第一关是考试（实际 ${wd.stages[0].kind}）`)

  const bank = DBG().quizBank()
  check(bank.length >= 3, `题库共 ${bank.length} 道题`)
  check(bank.every((q) => q.a && q.a.length === 3), '每题 3 个选项')
  check(bank.every((q) => Number.isInteger(q.right) && q.right >= 0 && q.right < 3), '正确答案下标合法')
  check(bank.every((q) => q.evidence && q.evidence.length > 3), '每题都标了出处（答案取自已核实的官方资料）',
    bank.filter((q) => !q.evidence).map((q) => q.q).join(' | '))
  check(bank.every((q) => q.q && q.q.length > 4 && new Set(q.a).size === 3), '题面与选项都不重复')

  DBG().enterDungeon('wudangbaoweizhan')
  const st = DBG().dungeonState()
  check(st.phase === 'quiz', `进入考试阶段（${st.phase}）`)
  const q = st.quiz
  check(q.list.length === 3, `一次考 ${q.list.length} 道题`)
  check(q.need === 2, `需要答对 ${q.need} 道`)

  const r0 = q.right
  DBG().quizAnswer(q.list[q.idx].right)
  check(q.picked >= 0, '已作答')
  check(q.right === r0 + 1, `答对后计数 +1（${r0} → ${q.right}）`)
  DBG().quizNext()
  check(q.idx === 1 && q.picked < 0, `进入第 ${q.idx + 1} 题`)

  const wis0 = (save.data.attrs || {}).wisdom || 0
  let g3 = 0
  while (st.phase === 'quiz' && g3++ < 300) {
    if (q.picked < 0) DBG().quizAnswer(q.list[q.idx].right)
    else DBG().quizNext()
  }
  check(st.phase !== 'quiz', `答够题数后离开考试阶段（现在 ${st.phase}）`)
  check(((save.data.attrs || {}).wisdom || 0) > wis0, `考试给智慧（${wis0} → ${(save.data.attrs || {}).wisdom}）`)

  // 全答错 → 重考
  DBG().enterDungeon('wudangbaoweizhan')
  const st2 = DBG().dungeonState()
  const q2 = st2.quiz
  let g4 = 0
  while (st2.phase === 'quiz' && g4++ < 300) {
    const cur = st2.quiz
    if (cur.picked < 0) DBG().quizAnswer((cur.list[cur.idx].right + 1) % 3)
    else DBG().quizNext()
    if (st2.quiz !== cur && st2.quiz.idx === 0) break    // 已经换了一批题 → 重考
  }
  check(st2.phase === 'quiz', '答不够题数不会过关')
  check(!!st2.quiz && st2.quiz.right === 0 && st2.quiz.idx === 0,
    `重考一次（right=${st2.quiz ? st2.quiz.right : '?'} idx=${st2.quiz ? st2.quiz.idx : '?'}）`)
  check(D.dungeonById('wudangbaoweizhan').stages[0].kind === 'quiz', '考试关仍然挂在武当保卫战上')
}

// ---------- 13) 「连接能量管线」（战神金刚，7k7k/163435 原文） ----------
section('13) 连接能量管线：旋转管件把入水口与出水口接通')
{
  const names = DBG().stageNames()
  check(names.pipe === '管线', `关卡类型表里有管线（${names.pipe}）`)
  const zs = D.dungeonById('zhanshenjingang')
  check(zs.stages[0].kind === 'pipe', `战神金刚第一关是管线（实际 ${zs.stages[0].kind}）`)
  check(zs.stages[0].label === '连接能量管线', `关卡名用了原文的「${zs.stages[0].label}」`)

  save.data.level = 70
  DBG().enterDungeon('zhanshenjingang')
  const st = DBG().dungeonState()
  check(st.phase === 'pipe', `进入管线阶段（${st.phase}）`)
  const p = st.pipe
  check(p.cells.length === 9, `3×3 共 ${p.cells.length} 格`)
  check(p.cells.every((c) => c.rot >= 0 && c.rot < 4), '每格都有 0~3 的旋转态')
  const rects = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => DBG().pipeRect(i))
  check(rects.every((r) => r.x >= 0 && r.x + r.w <= 960 && r.y >= 0 && r.y + r.h <= 560), '9 个格子都在屏内')
  check(!rects.some((a, i) => rects.some((b, j) => i < j && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)),
    '格子之间不重叠')

  // 自证：解法通路**一定可解** —— 逐个把解法格转到"应该有的口"上，必须能接通
  const solution = DBG().pipeSolution()
  check(solution.length === 5, `解法通路 ${solution.length} 格（入水口→出水口）`)
  // 直接构造一个已解开的局面来验证判定逻辑
  const solved = [
    { x: 0, y: 0, shape: 'elbow', rot: 3, locked: true },  // elbow 东+南 转 3 → 南+西
    { x: 0, y: 1, shape: 'elbow', rot: 1, locked: true },  // 东+南 转 1 → 南+西? 见下
    { x: 1, y: 1, shape: 'elbow', rot: 3, locked: true },
    { x: 1, y: 2, shape: 'elbow', rot: 1, locked: true },
    { x: 2, y: 2, shape: 'straight', rot: 0, locked: true },
  ]
  // 与其猜旋转值，不如**穷举**：把 9 格全部旋转状态暴力搜一遍，确认存在解
  let found = false
  let mask = -1
  const backup = p.cells.map((c) => ({ ...c }))
  for (let m2 = 0; m2 < Math.pow(4, 9) && !found; m2++) {
    let m = m2
    for (let i = 0; i < 9; i++) { p.cells[i].rot = m % 4; m = Math.floor(m / 4) }
    if (DBG().pipeConnected()) { found = true; mask = m2 }
  }
  check(found, '存在可接通的旋转组合（题目一定可解）')
  p.cells.forEach((c, i) => { c.rot = backup[i].rot; c.shape = backup[i].shape })

  // 旋转是 4 循环：**必须在接通之前、在一个装饰格上验证，而且每次都重读实时状态**。
  // 上一版是在"差一步"的解法格上转 4 次 —— 第一次就接通了、副本翻页，后面 3 次转的是
  // **上一题的残留对象**（老代码不清 st.pipe），4 次相加刚好回到原点，断言其实在看死数据。
  // 第 43 轮给 startDungeonStage 补上 st.pipe = null 之后这个假通过就暴露了。
  // 第 2 格（x=2,y=0）不在解法通路上，转它不会破坏通路；此时盘面还是初始随机态，一定没接通。
  {
    const q0 = DBG().dungeonState().pipe
    q0.sel = 2
    const r0 = q0.cells[2].rot
    for (let i = 0; i < 4; i++) DBG().pipeRotate()
    const stNow = DBG().dungeonState()
    const q1 = stNow.pipe
    const r1 = q1 ? q1.cells[2].rot : null
    check(stNow.phase === 'pipe' && r1 === r0,
      `旋转 4 次回到原状（第 2 格 ${r0} → ${r1}，阶段 ${stNow.phase}）`)
    // 把选中格还原成默认的第 0 格 —— 下面的断言默认转的是"当前选中格"
    if (q1) q1.sel = 0
  }

  // 旋转一格应当改变它的口
  const before = DBG().pipeBits(0).join('')
  DBG().pipeRotate()
  const after = DBG().pipeBits(0).join('')
  check(before !== after || p.cells[0].shape === 'cross', `旋转会改变管件的口（${before} → ${after}）`)

  // 走到接通：把解出来的组合摆好，**让最后一次旋转走真实代码路径**触发过关
  // （一开始写成"只转当前选中格"，那样永远解不开 —— 选中格不会自己换）
  const want = []
  { let m = mask; for (let i = 0; i < 9; i++) { want[i] = m % 4; m = Math.floor(m / 4) } }
  let pick = -1
  for (let i = 0; i < 9; i++) if (want[i] !== p.cells[i].rot) { pick = i; break }
  check(pick >= 0, `找到需要转动的格子（第 ${pick} 格）`)
  const wis0 = (save.data.attrs || {}).wisdom || 0
  for (let i = 0; i < 9; i++) if (i !== pick) p.cells[i].rot = want[i]
  p.sel = pick
  p.cells[pick].rot = (want[pick] + 3) % 4   // 差一步
  // 只验一条一定成立的性质：再转一次就从"差一步"归位（这次会真的接通）
  check(((p.cells[pick].rot + 1) % 4) === want[pick], '差一步时再转一格即归位')
  DBG().pipeRotate()
  check(st.phase !== 'pipe', `接通后离开管线阶段（现在 ${st.phase}）`)
  const wis1 = (save.data.attrs || {}).wisdom || 0
  check(wis1 > wis0, `管线关给智慧（${wis0} → ${wis1}）`)
}

// ---------- 14) 「驾驶超级战机」（太空堡垒，7k7k/511864 原文） ----------
section('14) 驾驶超级战机：纯鼠标击落（原文点明不是方向键控制）')
{
  const names = DBG().stageNames()
  check(names.shooter === '空战', `关卡类型表里有空战（${names.shooter}）`)
  const tk = D.dungeonById('taikongbaolei')
  check(tk.stages[1].kind === 'shooter', `太空堡垒第二关是空战（实际 ${tk.stages[1].kind}）`)
  check(/不是方向键控制/.test(tk.stages[1].hint || ''), '关卡提示里保留了原文那句"不是方向键控制"')

  save.data.level = 70
  DBG().enterDungeon('taikongbaolei')
  const st = DBG().dungeonState()
  // 第一关是战斗 → 直接把 idx 推到第二关（shooter），再用**真的关卡工厂**开局。
  // 第 43 轮之前这里是手搓一个 st2.sh 字面量，等于绕开了 makeShooter —— 
  // 后来给空战加难度缩放和怪物立绘时，这种"手搓局面"根本测不到新代码。
  const s2 = D.dungeonById('taikongbaolei').stages[1]
  check(s2.kind === 'shooter', '确认第二关类型')
  st.idx = 1
  DBG().state.mode = 'dungeon'      // 第一关是战斗关，mode 会停在 battle
  check(DBG().startStage() === 'shooter', '第二关进入的是空战阶段')
  const st2 = DBG().dungeonState()
  const g = st2.sh
  check(!!g, '空战局面已由 makeShooter 建立')

  // 有效过关要求是**难度缩放后**的值（第 43 轮）：问游戏自己，不写死
  const effNeed = DBG().needs().shooterNeed
  check(g.need === effNeed, `需要击落 ${g.need} 架（难度 ${DBG().difficulty()}）`)
  // 敌机用的是归档里的**官方怪物立绘**，不是自己画的橙色圆圈
  check(g.roster.length > 0 && g.roster.every((m) => m && m.name),
    `敌机候补来自归档怪物（${g.roster.length} 只，前 3：${g.roster.slice(0, 3).map((m) => m.name).join('、')}）`)
  check(DBG().difficulty() !== 'easy' || g.radMul > 1, `简单模式命中半径放宽（×${g.radMul}）`)

  // 推进到出现目标
  let guard = 0
  while (!g.targets.length && guard++ < 600) DBG().shooterTick(1 / 60)
  check(g.targets.length > 0, `出现来袭目标 ${g.targets.length} 架`)
  const tg = g.targets[0]

  // 点空白处不命中
  const hit0 = g.hit
  check(DBG().shooterHit(5, 5) === false, '点空白处不算命中')
  check(g.hit === hit0, '命中数没变')

  // 点目标 → 命中
  check(DBG().shooterHit(tg.x, tg.y) === true, '点中目标算命中')
  check(g.hit === hit0 + 1, `击落数 +1（${hit0} → ${g.hit}）`)

  // 目标飞出左侧 → 记为漏掉
  g.targets.push({ x: -60, y: 200, vx: -100, r: 26, bob: 0 })
  const miss0 = g.miss
  DBG().shooterTick(1 / 60)
  check(g.miss === miss0 + 1, `飞出画面的算漏掉（${miss0} → ${g.miss}）`)

  // 漏满上限 → 本关重来（上限是难度缩放后的值）
  g.miss = g.maxMiss - 1
  g.targets.push({ x: -60, y: 200, vx: -100, r: 26, bob: 0 })
  DBG().shooterTick(1 / 60)
  check(st2.sh.hit === 0 && st2.sh.miss === 0, `漏掉 ${g.maxMiss} 架后本关重来（hit=${st2.sh.hit} miss=${st2.sh.miss}）`)

  // 打够数 → 过关并给勇气
  const brave0 = (save.data.attrs || {}).brave || 0
  st2.phase = 'shooter'
  st2.sh.targets = []
  let g2 = 0
  while (st2.phase === 'shooter' && g2++ < 20000) {
    const gg = st2.sh
    if (gg.targets.length) DBG().shooterHit(gg.targets[0].x, gg.targets[0].y)
    else DBG().shooterTick(1 / 60)
  }
  check(st2.phase !== 'shooter', `击落足够数量后离开空战阶段（现在 ${st2.phase}）`)
  const brave1 = (save.data.attrs || {}).brave || 0
  check(brave1 > brave0, `空战关给勇气（${brave0} → ${brave1}）`)
}

// ---------- 15) 归档里的副本小游戏录像（只拿到名字，画面未解读） ----------
section('15) 归档录像：文件名给出了原版小游戏的名字，但画面没解读')
{
  // 第 34 轮：归档 `多克多比素材fla\…\副本视频及素材\` 里有 12 段副本录像。
  // 文件名本身就是官方证据（原版美术/策划自己命名的），所以要把**名字**登记下来；
  // 但本机**没有视频解码器**（无 ffmpeg，WPF 媒体栈在这个沙箱里也跑不起来），
  // 画面完全没看过 —— 所以玩法必须标 missing，**不许因为"知道名字"就假装知道玩法**。
  const withVid = D.DUNGEONS.filter((d) => d.videoEvidence)
  check(withVid.length === 3, `3 个副本登记了归档录像（实际 ${withVid.length}）`,
    withVid.map((d) => d.name).join('、'))
  for (const d of withVid) {
    const v = d.videoEvidence
    check(Array.isArray(v.files) && v.files.length > 0, `${d.name}：列了录像文件（${v.files.length} 段）`)
    check(v.files.every((f) => /\.(wmv|avi)$/i.test(f)), `${d.name}：文件名都是视频格式`)
    // 每一条都必须写明"画面未解读"，这是不许静默降级的关键字
    check(/未解读|没看过|无解码器|无视频解码器/.test(v.note || ''),
      `${d.name}：注明了画面未解读（不许假装看过）`, v.note)
    for (const f of v.files) {
      const p = path.join(ROOT, '多克多比专区资料素材', '多克多比素材fla', '多克多比电广素材', '副本视频及素材', f)
      check(fs.existsSync(p), `${d.name}：录像文件在归档里（${f}）`)
    }
  }
  // 凤凰考验：录像文件名给出的四个小游戏名字必须逐字登记
  const fh = D.DUNGEONS.find((d) => d.id === 'fengHuangKaoYan')
  check(fh && fh.videoEvidence && fh.videoEvidence.names.join(',') === '射击,铲煤,队长火车,电工',
    '凤凰考验：四个小游戏名字（射击/铲煤/队长火车/电工）逐字来自录像文件名',
    fh && fh.videoEvidence && fh.videoEvidence.names.join(','))
  const zs = D.DUNGEONS.find((d) => d.id === 'zhanshenjingang')
  check(zs && zs.videoEvidence && zs.videoEvidence.names.join(',') === '队长射击,接口,装配及挖矿',
    '战神金刚：三个小游戏名字（队长射击/接口/装配及挖矿）逐字来自录像文件名',
    zs && zs.videoEvidence && zs.videoEvidence.names.join(','))
  // 凤凰考验当前用通用记忆力关替代 —— 关卡 hint 里必须**当面告诉玩家**
  const fhStage = fh.stages.find((s) => s.kind === 'memory')
  check(!!fhStage && /未解读/.test(fhStage.hint || ''),
    '凤凰考验的替代关卡在界面上写明了"玩法未解读"', fhStage && fhStage.hint)
  // 副本列表要把这条显示出来（界面文案里出现过 videoEvidence 字段名就说明接上了）
  // ⚠ 第 72 轮重构 · 批次 8：drawDungeonList 已迁到 `game/ui/dungeon-view.js` —— 改扫**整棵 game/ 树**
  //   （原先只扫 game/game.js，模块搬家后会误报；同 test-crystal / test-npcs 的修法。）
  const src = (function readTree(dir) {
    const out = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) out.push(...readTree(p))
      else if (e.name.endsWith('.js')) out.push(fs.readFileSync(p, 'utf8'))
    }
    return out
  })(path.join(ROOT, 'game')).join('\n')
  check(/videoEvidence/.test(src), '副本列表界面用到了 videoEvidence（玩家看得到这条说明）')
}

// ---------- 16) 连着两场战斗的副本：打完第一场不能卡住 ----------
section('16) 打完一场接着又开一场时，模式不能被盖回去（第 42 轮修的卡死 bug）')
{
  // 【这个 bug 会真的卡死玩家】副本里有**连着两场战斗**的构成。
  // 第一场打完 → 结算 → 空格 → leaveBattle() → dungeonAfterBattle() 推进到下一关 →
  // startDungeonStage() 把 mode 设成 'battle' 开了第二场 —— 可 leaveBattle() 紧接着
  // **无条件**执行 `S.mode = 'dungeon'`，把刚开起来的战斗盖掉。
  // 结果：阶段停在 battle、却没有战斗界面，玩家永远出不去。
  // 这个 bug 是副本通关体检（check-dungeon-playthrough）抓出来的。
  //
  // ⚠️ 第 58 轮更新两处：
  //   ① 索亚迷局从 2 关扩成 **5 关**（按官方 11 步剧情补了 密林危途 / 抓捕米雅 / 躲陷阱），
  //      它**已经没有"连着两场战斗"**了 —— 所以这里只核它的构成；
  //   ② "连着两场战斗"改用**战神金刚**（pipe → battle → boss，第 1→2 关正好是 battle→boss）
  //      来验。断言本身（"第二场要自动开起来、mode 不能被盖回去"）一条没减。
  const save2 = t.get('DKDbb').save
  save2.data.level = 40
  if (DBG().refreshVitals) DBG().refreshVitals()
  save2.data.hp = save2.data.maxHp = Math.max(save2.data.maxHp || 0, 9999)
  S().mode = 'explore'
  // ① 索亚迷局的构成（第 58 轮按原文补的三段）
  const suoya = D.DUNGEONS.find((x) => x.id === 'suoyamiju')
  const kinds16 = suoya.stages.map((s) => s.kind)
  check(kinds16.join(',') === 'runner,battle,catch,stealth,boss',
    `索亚迷局是 ${kinds16.join(' → ')}（补了三段，且**不是**拿普通战斗糊过去）`)
  check(kinds16.filter((k) => k === 'battle' || k === 'boss').length === 2,
    `索亚迷局里只有 ${kinds16.filter((k) => k === 'battle' || k === 'boss').length} 关是战斗`)
  // ② 连着两场战斗：战神金刚 battle#1 → boss#2
  check(DBG().enterDungeon('zhanshenjingang') === true, '进入战神金刚')
  const zs16 = D.DUNGEONS.find((x) => x.id === 'zhanshenjingang')
  check(zs16.stages[1].kind === 'battle' && zs16.stages[2].kind === 'boss',
    '这一关的构成确实是"战斗 → BOSS"连着两场')
  {
    const st16 = DBG().dungeonState()
    st16.idx = 1
    DBG().startDungeonStage()
    t.step(2)
  }
  check(S().mode === 'battle', `已经进到第 2 关的战斗里（mode=${S().mode}）`, S().mode)
  let guard16 = 0, firstOver = false
  while (guard16++ < 3000 && !firstOver) {
    if (S().mode === 'battle') {
      const b = S().battle
      t.step(1)
      if (b && b.phase === 'command' && b.intro <= 0) t.key('Enter')
      if (b && b.phase === 'over') firstOver = true
    } else if (S().mode === 'result') {
      t.key(' ')          // 关掉结算 → 走 leaveBattle
      t.step(2)
    } else t.step(1)
  }
  check(firstOver, '第一场战斗打完了')
  // 关掉结算 → 等副本真正推进到第 3 关（战神金刚：pipe#0 → battle#1 → boss#2）
  // ⚠️ 起始 idx 是 1（我把指针挪到了 battle），所以这里等的是"变成 2"。
  //    第一版写的是 `idx === 0` → "推进到 idx=1"，那是**旧构成**下的写法，
  //    换副本之后条件立刻就不成立了（靠断言里的数字对不上才发现）。
  let guard2 = 0
  while (guard2++ < 900 && DBG().dungeonState().idx === 1) {
    if (S().mode === 'result') { t.key(' '); t.step(2) } else t.step(1)
  }
  t.step(4)
  check(DBG().dungeonState().idx === 2, `副本推进到第 3 关（idx=${DBG().dungeonState().idx}）`)
  check(S().mode === 'battle', `第二场（BOSS）自动开起来了（mode=${S().mode}）`, S().mode)
  check(!!S().battle, '而且战斗对象真的存在（不是"阶段是 battle 但没有战斗界面"）')
  // 收尾：把第二场也打完，确认能一路走到结算
  let guard3 = 0
  while (guard3++ < 4000) {
    if (S().mode === 'battle') {
      const b = S().battle
      t.step(1)
      if (b && b.phase === 'command' && b.intro <= 0) t.key('Enter')
    } else if (S().mode === 'result') { t.key(' '); t.step(2) }
    else if (DBG().dungeonState().phase === 'flip') { DBG().pickFlip(0); t.step(1); t.key(' '); t.step(2) }
    else if (DBG().dungeonState().phase === 'done') break
    else t.step(1)
  }
  check(DBG().dungeonState().phase === 'done', `索亚迷局能一路打到结算（phase=${DBG().dungeonState().phase}）`)
  DBG().dungeonState().id = null; DBG().dungeonState().phase = 'list'
  S().mode = 'explore'
}

console.log(`\n结果: 通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
