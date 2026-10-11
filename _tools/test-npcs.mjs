// 官方 NPC（归档官方策划表 `npc大全\NPC.xlsx`）。
//
// 背景：这张表此前从没被读过，于是游戏里的 NPC 一直说着程序生成的通用台词。
// 表里有 70 个 NPC、逐字对话、以及「位置」。放置规则是**只认精确同名**：
//   位置 == 场景名 / 岛名 / 七大地形名 → 才放；对不上的一律进 unmapped，不硬塞（R9）。
import { T } from './game-harness.mjs'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const D = W.DKDbbData
const DBG = () => W.__DKDbb_DEBUG__
const ROOT = path.resolve('.')
let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

const RAW = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'npcs.js'), 'utf8')
  .replace(/^[\s\S]*?window\.__DKDbb_NPCS__\s*=\s*/, '').replace(/;\s*$/, ''))

section('1) 官方 NPC 表读进来了')
{
  check(RAW.counts.total === 70, `表里 70 个 NPC（实际 ${RAW.counts.total}）`)
  check(RAW.entries.length === 16, `可放置 ${RAW.entries.length} 个`)
  check(RAW.unmapped.length === 50, `位置对不上 ${RAW.unmapped.length} 个`)
  check(RAW.unfilled.length === 4, `官方表本身为空 ${RAW.unfilled.length} 个`)
  check(RAW.entries.length + RAW.unmapped.length + RAW.unfilled.length === RAW.counts.total,
    '可放置 + 对不上 + 表本身为空 = 总数')
  check(/NPC\.xlsx/.test(RAW.source), '出处写明来自官方表 NPC.xlsx', RAW.source)
  check(RAW.unfilled.every((u) => /暂缺|新增|空/.test(u.why)), '表本身为空的那几条写明了原因')
}

section('2) 放置只认精确同名（逐条复核）')
{
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'))
  const titles = new Map()
  for (const s of man.scenes) if (!titles.has(s.title)) titles.set(s.title, s.id)
  const ctx = { window: {} }
  vm.createContext(ctx)
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'world.js'), 'utf8'), ctx, { filename: 'world.js' })
  const WORLD = ctx.window.__DKDbb_WORLD__
  const islByName = new Map(WORLD.islands.map((i) => [i.name, i]))
  const distByName = new Map(WORLD.districts.map((d) => [d.name, d]))

  let mismatch = 0
  for (const e of RAW.entries) {
    const p = e.place
    if (e.target.kind === 'scene') {
      if (!titles.has(p) || titles.get(p) !== e.target.id) mismatch++
    } else if (e.target.kind === 'island') {
      if (!islByName.has(p) || islByName.get(p).id !== e.target.id) mismatch++
    } else if (e.target.kind === 'district') {
      if (!distByName.has(p) || distByName.get(p).id !== e.target.id) mismatch++
    } else mismatch++
  }
  check(mismatch === 0, `16 条放置全部能追溯到精确同名（异常 ${mismatch}）`)
  // 每个目标都必须落到具体场景上，否则游戏里根本不会出现
  check(RAW.entries.every((e) => Array.isArray(e.target.sceneIds) && e.target.sceneIds.length > 0),
    '每条都算出了具体的场景 id 列表')
}

section('3) 对话是官方原文（逐字），不是生成的')
{
  const noText = RAW.entries.filter((e) => !e.talk && !e.hover)
  check(noText.length === 0, '每条都有对话或焦点语原文', noText.map((e) => e.id).join('、'))
  // 抽查三条必须与官方表逐字一致（写死对照，防止以后有人"顺手润色"）
  const OFFICIAL = {
    'NPC_01_05': '看看这些水晶，他们是可以唤醒你记忆的潜力。',
    'NPC_01_15': '讨厌的火精灵，赶都赶不走。他们喜欢把书当食物。这里是多克多比世界的图书馆。',
    'NPC-05-01': '勇气峡谷可不是随便玩的地方。这里是勇者才有资格来的地方。',
  }
  for (const [id, text] of Object.entries(OFFICIAL)) {
    const e = RAW.entries.find((x) => x.id === id)
    check(!!e, `${id} 在表里`)
    if (e) check(e.talk.startsWith(text.slice(0, 20)), `${id} 的对话与官方表逐字一致（开头 20 字）`, (e.talk || '').slice(0, 20))
  }
  // 通用称呼必须标 derived
  const generic = RAW.entries.filter((e) => !e.role)
  check(generic.every((e) => /derived/.test(e.nameSource)),
    `官方表里没写身份的（${generic.length} 个）用的是标了 derived 的通用称呼`)
}

section('4) 真的生成到了场景里（不是只躺在数据里）')
{
  // 智慧学堂（scene 32）：官方表里那个地点有 4 个 NPC，但第 40 轮起**每个场景最多放 3 个**
  //（用户反馈 NPC 太多），并且**带小游戏关联的优先保留**。
  const forStudy = D.officialNpcsFor(32)
  check(forStudy.length >= 4, `智慧学堂那个场景的官方数据里有 ${forStudy.length} 个 NPC`)
  check(forStudy.some((n) => n.displayName === '多比奶奶'), '包含「多比奶奶」')
  const lib = D.officialNpcsFor(42)
  check(lib.some((n) => n.displayName === '图书管理员'), '图书馆那个场景包含「图书管理员」')
  // 场景生成器必须真的把它们推进 npcs 列表
  DBG().gotoScene(32)
  DBG().refreshSpawns(true)
  const npcs = DBG().spawns.npcs || []
  const official = npcs.filter((n) => n.official)
  check(official.length >= 3, `场景里真的出现了 ${official.length} 个官方 NPC（不只是数据里有）`)
  check(official.length <= 3, `而且不超过 3 个（第 40 轮封顶：一屏最多 3 个官方 NPC）`)
  // 带小游戏关联的那几个**不能被封顶挤掉**（第一版按原顺序砍，正好砍掉了「飞行员多比」）
  const linkedHere = D.officialNpcsFor(32).filter((o) => D.npcMinigameLink(o.id))
  const kept = linkedHere.filter((o) => official.some((n) => n.officialId === o.id))
  check(kept.length === Math.min(linkedHere.length, 3),
    `有 ${linkedHere.length} 个带小游戏关联的，保留了 ${kept.length} 个（不该被挤掉）`,
    linkedHere.map((o) => o.displayName).join('、'))
  const withLine = official.filter((n) => (n.lines || []).some((l) => l.who === n.name && l.text))
  check(withLine.length === official.length, '每个官方 NPC 都带着对话（who/text 都对）')
  // 与任务 NPC 不能重名（重名会让人以为是同一个角色）
  const dup = npcs.filter((n, i) => npcs.findIndex((m) => m.name === n.name) !== i)
  check(dup.length === 0, '没有同名 NPC 重复出现', dup.map((n) => n.name).join('、'))
  // ★ 第 40 轮新增的两条硬要求（用户反馈）：同屏不撞衫、固定 NPC 不游荡
  const costumeNames = npcs.map((n) => n.costume && n.costume.name).filter(Boolean)
  check(new Set(costumeNames).size === costumeNames.length,
    `同一个场景里没有两个人穿同一套时装（${costumeNames.length} 人 ${new Set(costumeNames).size} 套）`,
    costumeNames.join('、'))
  check(npcs.length <= 6, `一个场景最多 6 个 NPC（实际 ${npcs.length}）`)
}

section('5) 未放置的 50 个如实登记（不许硬凑）')
{
  check(RAW.unmapped.every((u) => u.why && u.id), '每条未放置都写了 id 与原因')
  const places = [...new Set(RAW.unmapped.map((u) => u.place))]
  check(places.length > 10, `涉及 ${places.length} 个我们没有的地点`)
  // 这些地点的名字**绝不能**被拿去命名一个场景（那就是"看起来像就顶上"）
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'))
  const titles = new Set(man.scenes.map((s) => s.title))
  const leaked = places.filter((p) => titles.has(p))
  check(leaked.length === 0, '未放置地点的名字没有被拿去命名场景', leaked.join('、'))
}

section('6) 官方 NPC ↔ 小游戏的关联：必须是 derived 且引用得到台词')
{
  // 第 37 轮：官方 NPC 的台词里点到了某个小游戏的主题/名字，于是让那位 NPC 直接开启它。
  // **原文并没有说"由这位 NPC 开启"**（原文只说"有个介绍小游戏的 NPC"，连名字都没给），
  // 所以这张表整张都是推算 —— 测试要守住三件事：
  //   ① 每条都标 derived；
  //   ② 每条引用的台词**真的出现在那位 NPC 的官方对话里**（不能凭印象编理由）；
  //   ③ 小游戏 id 必须真实存在。
  const links = D.NPC_MINIGAME_LINKS || []
  check(links.length >= 5, `关联表 ${links.length} 条`)
  const byId = new Map(RAW.entries.map((e) => [e.id, e]))
  for (const l of links) {
    check(l.conf === 'derived', `${l.npc}：标的是 derived（不是官方结论）`, l.conf)
    const e = byId.get(l.npcId)
    check(!!e, `${l.npc}：npcId 在官方表里找得到（${l.npcId}）`)
    const mg = D.minigameById(l.minigame)
    check(!!mg, `${l.npc} → 小游戏 ${l.minigame} 存在`, mg ? mg.name : '不存在')
    // 理由里必须引用了该 NPC 的官方台词（取台词前 8 字去比对）
    if (e && l.why) {
      const corpus = (e.talk || '') + (e.hover || '')
      const quoted = (l.why.match(/「([^」]{6,})」/) || [])[1] || ''
      const key = quoted.slice(0, 8)
      check(key.length >= 6 && corpus.includes(key),
        `${l.npc}：理由里引用的台词确实出自该 NPC 的官方对话`, key)
    }
  }
  // 没对上的不许硬连：台词里既没有小游戏名、也没有主题词的 NPC 不该有关联
  const linked = new Set(links.map((l) => l.npcId))
  const suspicious = RAW.entries.filter((e) => linked.has(e.id) && !e.talk)
  check(suspicious.length === 0, '有关联的 NPC 都有官方对话原文')
  // 场景里的 NPC 对象要真的带上链接，并且菜单里会显示（看源码即可）
  DBG().gotoScene(32)
  DBG().refreshSpawns(true)
  const withLink = (DBG().spawns.npcs || []).filter((n) => n.minigameLink)
  check(withLink.length >= 2, `场景里出现了 ${withLink.length} 个带小游戏链接的官方 NPC`)
  // 模块化后实现可能已搬到 game/app、game/ui、game/core 等子目录，
  // 只扫 game/game.js 会因为「换了文件」而误报 —— 整棵 game/ 树拼起来一起扫。
  // ⚠️ 不用 fs.readdirSync(dir,{recursive:true})：Node 18.17+ 才有，Node 16 会静默忽略 → 只扫顶层。
  const readTree = (dir) => {
    const out = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) out.push(...readTree(p))
      else if (e.name.endsWith('.js')) out.push(fs.readFileSync(p, 'utf8'))
    }
    return out
  }
  const src = readTree(path.join(ROOT, 'game')).join('\n')
  check(/npc\.minigameLink/.test(src), 'NPC 菜单里用到了 minigameLink（点了能进小游戏）')
  check(/推算关联/.test(src), '菜单提示语里写明了"推算关联"（不让玩家以为是官方设定）')
  // 可玩的那两个：真的能开起来
  const playable = links.filter((l) => { const m = D.minigameById(l.minigame); return m && m.impl })
  check(playable.length >= 2, `其中 ${playable.length} 个关联指向当前可玩的小游戏`)
  for (const l of playable) {
    DBG().state.mode = 'explore'
    check(DBG().startMinigame(l.minigame) === true, `${l.npc} 的那个小游戏能开起来（${l.minigame}）`)
  }
  DBG().state.mode = 'explore'
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
