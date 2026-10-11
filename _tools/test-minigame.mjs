// M4-4 小游戏系统（官方系统）。
//
// 官方依据（7k7k/167013 原文）：
//   「在多克多比的世界中，除了任务、副本之外，还有丰富的小游戏供小多克们来挑战~
//     完成这些游戏，小多克就会得到不同的奖励哦，除了金币、彩晶石和声望的奖励外，
//     还有增加多克属性的奖励，包括智慧、勇气和魅力~这些都是唤醒多比所必不可少的东西~
//     其实很简单啦~多克多比游戏中有个专门介绍这些游戏的 npc 哦~」
//
// 小游戏的**名字与规则**来自归档原版截图 `图片资源\小游戏截图\`（规则直接印在画面上），
// 是 official 证据。测试里把这几条规则**写死对照**，
// 这样以后谁改了 minigames.js、把官方原文弄丢了，会立刻被发现（R7）。
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

// ---------- 1) 名单与官方规则原文（写死对照） ----------
section('1) 小游戏名单与官方规则原文必须在（写死对照）')
{
  // 截图文件名 = 官方名；规则 = 印在截图上的原文
  const OFFICIAL_RULES = {
    '记忆水晶': '按提示按顺序放入正确的水晶，点击已放入的水晶可取消选择。',
    '魔法工匠': '用鼠标向四个方向移动宝石，完成合成公式',
    '思维方块': '四个以上相同的方块，就可以消除哦~~（方向键控制提示框，空格键转动方向）',
    '多比快跑': '连续按方向键控制人物奔跑和加速，按空格跳跃。注意躲开石头和水塘，别忘了捡宝石哦~',
  }
  const list = DBG().minigames()
  check(list.length === DBG().minigames().length, `登记数与运行时一致（${list.length} 个）`, `实际 ${list.length}`)
  for (const [name, rule] of Object.entries(OFFICIAL_RULES)) {
    const m = list.find((x) => x.name === name)
    check(!!m, `有「${name}」`)
    check(m && m.rule === rule, `「${name}」规则与截图原文逐字一致`,
      m ? `实际「${m.rule}」` : '取不到')
  }
  // 每个都要有出处，且不能是编的
  check(list.every((m) => m.evidence && m.evidence.length > 4), '每一条都带出处')
  check(list.every((m) => m.conf === undefined || m.conf === 'official' || m.conf === 'derived'),
    '来源等级只能是 official/derived')
  const names = list.map((m) => m.name)
  check(new Set(names).size === names.length, '名字不重复', names.join('/'))
  // 官方原文点名的**四类**奖励（金币 / 彩晶石 / 声望 / 属性）一个都不能少 ——
  // 可玩的小游戏里少任何一类，都等于"照原文的四类只发了三类"。
  const ATTR_KEYS = ['wisdom', 'brave', 'love', 'charm', 'fame']
  for (const m of list.filter((x) => x.impl)) {
    const r = m.reward || {}
    check((r.gold || 0) > 0, `「${m.name}」给金币`)
    check((r.crystal || 0) > 0, `「${m.name}」给彩晶石（原文明列这一类，不许漏）`,
      `crystal=${r.crystal}`)
    check((r.fame || 0) > 0, `「${m.name}」给声望`)
    check(ATTR_KEYS.some((k) => k !== 'fame' && (r[k] || 0) > 0), `「${m.name}」给属性（智慧/勇气/魅力）`)
  }
  // 不可玩的没有奖励表，不许编
  check(list.filter((x) => !x.impl).every((x) => x.reward == null),
    '不可玩的一个都不发奖励（没有奖励表）')
  // R1：规则未解读的必须 rule=null，不许编。
  // 【第 44 轮改成"自己算"】原来写死「3 个」并逐个点名 —— 每实现一个就要来改一次，
  // 而且"到底几个没规则"这种数字写死之后，新增条目会让断言变成假话（这轮就撞上了：
  // 又登记了哈里的金币/冲上云霄，实际变 4 个）。改成：名单必须与数据一致，
  // 且**每一条没规则的都必须真的没有 rule、也没有 impl**。
  const noRule = list.filter((m) => !m.rule).map((m) => m.name)
  check(noRule.length > 0, `有 ${noRule.length} 个只有名字的小游戏，保持 rule=null（R1 不编）`, noRule.join('/'))
  for (const m of list.filter((x) => !x.rule)) {
    check(m.impl === false && m.reward == null,
      `「${m.name}」没有规则 → 没有 impl、没有奖励表`)
  }
  // 反方向也要钉住：**有规则的不许留 rule=null**（否则等于把读出来的规则丢了）
  check(list.filter((x) => x.rule && !x.rule.trim()).length === 0, '没有"规则是空字符串"的条目')
  // 第 29 轮在嵌套子目录里新找到的 6 个：名字与规则都要在
  const NEW_RULES = {
    '王牌大空战': '控制人物上下左右移动，"Z"键为普通射击，按住Z秒松开为蓄力射击。',
    '极限顶顶球': '小多克！努力将球顶入对方的试管，就能赢取最后的胜利哦~~ 加油！　方向键控制小多克',
    '拯救多比古书': '方向键控制人物移动、跳跃',
    '多克大富翁': null,   // 只有棋盘截图，规则只是一句宣传语 → 不算规则
  }
  for (const [n, rule] of Object.entries(NEW_RULES)) {
    const m = list.find((x) => x.name === n)
    check(!!m, `嵌套子目录里的「${n}」已登记`)
    if (m && rule) check(m.rule === rule, `「${n}」规则与截图原文逐字一致`, `实际「${m.rule}」`)
  }
  // 【第 47 轮】「极限顶顶球」的规则**必须与截图原文逐字一致** ——
  // 攻略页补充的那句"球进哪一边就算谁得分"另放 note，不混进官方规则原话里
  {
    const m = list.find((x) => x.name === '极限顶顶球')
    check(m && m.rule === '小多克！努力将球顶入对方的试管，就能赢取最后的胜利哦~~ 加油！　方向键控制小多克',
      '「极限顶顶球」规则与截图原文逐字一致（攻略补充另记 note）', m ? `实际「${m.rule}」` : '缺条目')
    check(m && /660779/.test(m.evidence || ''), '「极限顶顶球」证据含攻略页 660779')
    check(m && /得分归属/.test(m.note || ''), 'note 里记下了攻略补充的"得分归属看球进哪一边"')
  }
  // 魔幻音符 / 滑雪跳台：上一轮只有名字，这轮从截图里读出了规则
  for (const [n, rule] of Object.entries({
    '魔幻音符': '左右键控制手指移动　下键确认选择弹奏',
    '滑雪跳台': '看 ←→ 箭头位置用 ←→ 控制平衡；看 —— 黄色位置按 ↑ 起跳，红色跳的最远；当（图标）进入 ○ 的时候按相应的方向键做出动作。',
  })) {
    const m = list.find((x) => x.name === n)
    check(m && m.rule === rule, `「${n}」的规则已从截图读出并逐字入库`, m ? `实际「${m.rule}」` : '缺条目')
  }
  // 官方截图证据：小游戏是多人玩法（1~4 人，先选人数再等待其他玩家）
  const mp = DBG().minigameMultiplayer()
  check(Array.isArray(mp.players) && mp.players.join(',') === '1,2,3,4',
    '登记了官方"选择游戏人数 1/2/3/4"这条事实', JSON.stringify(mp.players))
  check(/多人/.test(mp.offline || ''), '并且如实写明离线版只做单人')

  // ---- 第 44 轮：从语料（不是截图）里新读出的小游戏 ----
  // 官方活动公告 7k7k/517609：「哈里的金币、飞翔的衣服、多比快跑、极限顶顶球、冲上云霄
  // 五个小游戏达到S级就会获得数量不等的白色彩晶石碎片」—— 这一句同时给出
  // ① 两个我们名单里没有的小游戏名；② 小游戏**有评级**（S 级）这个事实。
  // ---- 第 47 轮：这两个的规则也在语料里读出来了（从"只有名字"升级为"规则已查明"）----
  // 「哈里的金币」第 47 轮实现（7k7k/660617）；「冲上云霄」第 58 轮实现并通过验证。
  // 所以这里不再断言"rule 必须是 null" —— 那会把"查到了却如实登记"判成错误。
  // 真正要守的是：**没有依据的仍然不许有 rule**（下面单独一条守着）。
  for (const [n, src, wantImpl] of [['哈里的金币', '660617', true], ['冲上云霄', '551114', true]]) {
    const m = list.find((x) => x.name === n)
    check(!!m, `语料里新发现的「${n}」已登记`)
    if (m) {
      check(typeof m.rule === 'string' && m.rule.length > 10,
        `「${n}」的规则已从官方攻略页读出并逐字入库`, `rule=${JSON.stringify(m.rule)}`)
      check(new RegExp(src).test(m.evidence || ''), `「${n}」的证据写明出处（含 ${src}）`)
      check(m.impl === wantImpl, `「${n}」的 impl=${wantImpl}（${wantImpl ? '已实现并可玩' : '规则查明但机制未实现'}）`)
    }
  }
  // R1 的底线：**规则没查到的，rule 必须为空**（查不到就不许编）
  {
    const unknowns = list.filter((m) => !m.impl && !m.rule)
    check(unknowns.length > 0, `仍有 ${unknowns.length} 个规则未解读的登记在案（${unknowns.map((m) => m.name).join('/')}）`)
    check(unknowns.every((m) => m.rule === null), '规则未解读的条目 rule 一律为 null，没有编造')
  }
  // 飞翔的衣服：规则来自官方攻略页 7k7k/534823，逐字可读
  {
    const m = list.find((x) => x.name === '飞翔的衣服')
    check(!!m && m.impl === true, '「飞翔的衣服」已实现')
    check(!!m && /用网子抓住它们/.test(m.rule || ''), '规则里保留了官方原话"用网子抓住它们"')
    check(!!m && /提前下网/.test(m.rule || ''), '规则里保留了官方窍门"提前下网"')
    check(!!m && /534823/.test(m.evidence || ''), '证据指到官方攻略页 534823')
  }
}

// ---------- 2) 可玩 / 不可玩的分界 ----------
section('2) 只有规则已解读的实现出来了（R1：规则不明的不做）')
{
  const playable = DBG().playableMinigames()
  // 第 47 轮：实现「哈里的金币」「魔镜世界」后可玩 9 → 11
  // 第 48 轮：实现「极限顶顶球」后可玩 11 → 12
  // 第 58 轮：**「冲上云霄」终于通过自动试玩验证**（机器人 6/6，平均 7.2 秒）→ 可玩 12 → 13
  check(playable.length === 13, '当前可玩 13 个', playable.join('/'))
  check(playable.includes('memoryCrystal') && playable.includes('magicArtisan'),
    '可玩的是 记忆水晶 / 魔法工匠')
  check(playable.includes('thinkBlocks') && playable.includes('dobiRun'),
    '可玩：思维方块 / 多比快跑')
  check(playable.includes('flyClothes'), '可玩：飞翔的衣服（第 44 轮新增）')
  check(playable.includes('harryCoin') && playable.includes('mirrorWorld'),
    '可玩：哈里的金币 / 魔镜世界（第 47 轮新增）')
  check(playable.includes('ballDuel'), '可玩：极限顶顶球（第 48 轮新增，机器人 6/6 通关）')
  // 【第 58 轮】这条断言原来守的是"**不算可玩**"。现在它通过了机器人试玩（6/6），
  // 按"测试只加不减"改成守**新的正确事实**：它可玩，而且**奖励表补齐了**。
  check(playable.includes('soarSky'),
    '「冲上云霄」**算可玩** —— 第 58 轮修掉 3 个引擎 bug 后机器人 6/6 通关（平均 7.2 秒）')
  {
    // `list` 在另一个块作用域里，这里自己取一次
    const soar = DBG().minigames().find((m) => m.id === 'soarSky')
    check(!!soar && soar.impl === true, '冲上云霄 impl=true')
    check(!!soar && !!soar.reward, '冲上云霄**有奖励表**（reward 为空会让通关后被当成副本、永远到不了结算）')
    check(!!soar && soar.kind === 'soar', `冲上云霄的 kind = ${soar && soar.kind}（体检按 kind 找机器人）`)
    check(!!soar && /50000/.test(soar.rule || ''), '规则里保留了官方分数目标 50000')
  }
  // 列表版式：登记条目已 15 个，必须分页才排得下 —— 这里核的是"当前这一页"的矩形
  const ML = DBG().miniLayout()
  check(ML.perPage * ML.pages >= ML.total,
    `列表分页：每页 ${ML.perPage} 条 × ${ML.pages} 页 ≥ ${ML.total} 条`)
  check(ML.rects.every((r) => r.x >= 0 && r.x + r.w <= 960 && r.y >= 0 && r.y + r.h <= 560),
    `当前页 ${ML.rects.length} 个矩形全部落在画面内`)
  // 规则**未**读出的仍然拒绝开始
  // （第 39 轮：滑雪跳台 / 魔幻音符 已实现，从这份名单里移出；第 47 轮 richman 规则已解读）
  DBG().state.mode = 'minigames'
  for (const id of ['crazyIce']) {
    const m = DBG().minigameById(id)
    check(!!m && !m.rule && !m.impl, `「${m.name}」规则未解读、未实现`)
    check(DBG().startMinigame(id) === false, `不能开始「${m.name}」`)
  }
  // 规则已解读但**仍然**不实现的，同样不许开始（不许半成品上线）
  // 【第 48 轮】richman 规则只读懂一半 → 拒绝。
  // 【第 58 轮】`soarSky` 从这一组**移出去**了 —— 它修掉 3 个引擎 bug 后
  //   机器人 6/6 通关（平均 7.2 秒），已经**可以上线**。断言不是删掉而是**换边**：
  //   下面单独守着"它能开始、能玩到结算"。
  for (const id of ['richman']) {
    const m = DBG().minigameById(id)
    check(!!m && !!m.rule && !m.impl, `「${m.name}」规则已查明但未通过验证 → 不可玩`)
    check(DBG().startMinigame(id) === false, `不能开始「${m.name}」`)
  }
  check(S().mode === 'minigames', '被拒绝后仍停在小游戏列表，没被塞进副本状态机')
  check(DBG().startMinigame('不存在的东西') === false, '不存在的 id 也拒绝')
  // 【第 58 轮】冲上云霄：验证过了 → **必须能开始**（与上面那组正好相反）
  {
    const m = DBG().minigameById('soarSky')
    check(!!m && !!m.impl, '「冲上云霄」已验证 → impl=true')
    check(DBG().startMinigame('soarSky') === true, '可以开始「冲上云霄」')
    check(DBG().dungeonState().phase === 'soar', `进到了 soar 阶段（${DBG().dungeonState().phase}）`)
    S().mode = 'explore'; DBG().dungeonState().id = null; DBG().dungeonState().phase = 'list'
  }
}

// ---------- 3) 「魔法工匠」谜题：一定可解 ----------
section('3) 魔法工匠：3×3 滑动宝石（公式已可解性是硬要求）')
{
  const recipe = DBG().magicRecipe()
  check(recipe.length === 3 && recipe.every((r) => r.length === 3), '合成公式是 3×3')
  check(recipe.flat().filter((x) => x === 0).length === 1, '公式里恰好一个空位（否则滑动谜题不成立）')

  // 开 20 局，每局都从初始态用 BFS 判定能否走到目标（状态空间 9! = 362880，够小）
  const key = (a) => a.join('')
  const target = key(recipe.flat())
  let solvable = 0, moved = 0
  for (let round = 0; round < 20; round++) {
    S().mode = 'explore'
    if (DBG().startMinigame('magicArtisan') !== true) { check(false, `第 ${round + 1} 局开不起来`); break }
    const start = DBG().slideCells()
    if (!start) { check(false, '开局能取到盘面'); break }
    // BFS（每步只能把与空位相邻的格子滑进空位）
    const seen = new Set([key(start)])
    let frontier = [start], ok = key(start) === target
    while (!ok && frontier.length && seen.size < 200000) {
      const next = []
      for (const st of frontier) {
        const b = st.indexOf(0), bx = b % 3, by = Math.floor(b / 3)
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const nx = bx + dx, ny = by + dy
          if (nx < 0 || ny < 0 || nx > 2 || ny > 2) continue
          const ni = ny * 3 + nx
          const c = st.slice(); c[b] = c[ni]; c[ni] = 0
          const k = key(c)
          if (seen.has(k)) continue
          seen.add(k); next.push(c)
        }
      }
      frontier = next
      if (seen.has(target)) { ok = true; break }
    }
    if (ok) solvable++
    if (key(start) !== target) moved++
  }
  check(solvable === 20, `20 局全部可解（BFS 验证）`, `可解 ${solvable}/20`)
  check(moved >= 18, `20 局里至少 18 局不是一开局就已完成`, `实际 ${moved}`)
}

// ---------- 4) 滑动规则：只能相邻、完成即过关 ----------
section('4) 滑动规则与过关')
{
  S().mode = 'explore'
  DBG().startMinigame('magicArtisan')
  const cells = DBG().slideCells()
  const b = cells.indexOf(0)
  const bx = b % 3, by = Math.floor(b / 3)
  // 与空位不相邻的格子必须滑不动
  let far = -1
  for (let i = 0; i < 9; i++) {
    const x = i % 3, y = Math.floor(i / 3)
    if (Math.abs(bx - x) + Math.abs(by - y) > 1) { far = i; break }
  }
  check(far >= 0, '存在与空位不相邻的格子')
  check(DBG().slideMove(far) === false, '不相邻的格子滑不动')
  const before = DBG().slideCells()
  check(before.join('') === cells.join(''), '滑不动时盘面没变')

  // 四个方向都要断言（能滑的 / 走不动的分别断言什么）。
  // 【为什么要写 else 分支】以前只在"能滑"时断言，于是空位落在角上（只有 2 个方向能滑）
  // 时断言条数就少一条 —— 实测断言总数在 256/258 之间浮动，而且
  // "走不动时盘面不该变"这条**从来没被测过**。现在每个方向都恰好一条断言。
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]]
  let okDir = 0
  for (const [dx, dy] of dirs) {
    const save0 = DBG().slideCells()
    const moved = DBG().slideMoveDir(dx, dy)
    if (moved) {
      okDir++
      check(DBG().slideCells().join('') !== save0.join(''), `方向 (${dx},${dy}) 滑动后盘面改变`)
      DBG().slideMoveDir(-dx, -dy)   // 滑回去
    } else {
      check(DBG().slideCells().join('') === save0.join(''), `方向 (${dx},${dy}) 走不动 → 盘面不变`)
    }
  }
  // 能滑的方向数由空位位置**唯一决定**：上/下/左/右四条边，贴着盘面外的方向走不了
  const expectDirs = (bx > 0 ? 1 : 0) + (bx < 2 ? 1 : 0) + (by > 0 ? 1 : 0) + (by < 2 ? 1 : 0)
  check(okDir === expectDirs,
    `能滑的方向数与空位位置一致（空位 (${bx},${by}) → 应有 ${expectDirs} 个，实际 ${okDir}）`)

  // 直接照着公式把盘面摆好 → 必须判定完成
  const recipe = DBG().magicRecipe().flat()
  const cur = DBG().slideCells()
  const blank = cur.indexOf(0)
  // 用 BFS 求一条到目标的路径，然后逐步 slideMove 走完（顺带再验证一次可解）
  const key = (a) => a.join('')
  const tgt = key(recipe)
  const prev = new Map([[key(cur), null]])
  let head = [cur], found = null
  while (head.length && !found) {
    const next = []
    for (const st of head) {
      const b2 = st.indexOf(0), x0 = b2 % 3, y0 = Math.floor(b2 / 3)
      for (const [dx, dy] of dirs) {
        const nx = x0 + dx, ny = y0 + dy
        if (nx < 0 || ny < 0 || nx > 2 || ny > 2) continue
        const ni = ny * 3 + nx
        const c = st.slice(); c[b2] = c[ni]; c[ni] = 0
        const k = key(c)
        if (prev.has(k)) continue
        prev.set(k, { from: key(st), idx: ni })
        if (k === tgt) { found = k; break }
        next.push(c)
      }
      if (found) break
    }
    head = next
  }
  check(!!found, '从初始盘面能搜到目标盘面')
  if (found) {
    const path = []
    let k = found
    while (prev.get(k)) { const p = prev.get(k); path.unshift(p.idx); k = p.from }
    let done = false
    for (const idx of path) { DBG().slideMove(idx); if (DBG().slideSolved()) { done = true; break } }
    check(done, `按搜出的 ${path.length} 步走完 → 判定完成`)
  }
  check(DBG().slideSolved(), '盘面现在是公式状态')
  // 空位在右下角（公式 [3,3,0]）→ 矩形必须落在可点区域内
  const r0 = DBG().slideRect(0)
  const r8 = DBG().slideRect(8)
  check(r0 && r8 && r8.y + r8.h < 470, '盘面最后一行的底边在页脚安全线以上',
    r8 ? `底边 ${r8.y + r8.h}` : '取不到')
}

// ---------- 5) 从面板开局 → 结算 → 回到面板 ----------
section('5) 开局 / 结算 / 奖励落账')
{
  // 先重置到干净状态
  S().mode = 'explore'
  const beforeGold = save.data.gold || 0
  const beforeCrystal = save.data.crystal || 0
  const beforeFame = (save.data.attrs || {}).fame || 0
  const beforeWisdom = (save.data.attrs || {}).wisdom || 0
  const beforePlays = (DBG().miniPlays()['magicArtisan'] || 0)   // 第 4 节已经通过了一局

  check(DBG().openMinigames('explore') === 'minigames', 'Y 面板能打开（mode=minigames）')
  check(S().mode === 'minigames', '确实进了小游戏面板')
  const allMg = DBG().minigames()
  const ML2 = DBG().miniLayout()
  // 第 47 轮起列表分页（15 个条目已排不下一页）→ 断言的是"当前页矩形数 = 每页条数（最后一页取余）"
  const expectOnPage = Math.min(ML2.perPage, allMg.length - ML2.page * ML2.perPage)
  check(DBG().miniRects().length === expectOnPage,
    `列表版式给当前页每个条目都留了矩形（第 ${ML2.page + 1} 页 ${expectOnPage} 个）`, `实际 ${DBG().miniRects().length}`)
  const rects = DBG().miniRects()
  check(rects.every((r, i) => i === 0 || r.y > rects[i - 1].y - 1), '矩形按阅读顺序排列（不会有两个挤在同一格）')
  check(rects.every((r) => r.x >= 0 && r.x + r.w <= 960 && r.y >= 0 && r.y + r.h <= 560), '矩形都在画面内')

  // 用键盘走一遍：↓ 选到第二个（魔法工匠），空格开局
  const i1 = DBG().minigames().findIndex((m) => m.id === 'magicArtisan')
  DBG().setMiniSel(i1)
  check(DBG().miniSel() === i1, '能选中「魔法工匠」')
  check(DBG().startMinigame('magicArtisan') === true, '开局成功')
  check(S().mode === 'dungeon', '进了副本状态机（小游戏跑在单关卡临时副本上）')
  const st = DBG().dungeonState()
  check(!!st && st.id === '__mini_magicArtisan', '临时副本 id 正确', st ? st.id : '取不到')
  check(!!D.dungeonById('__mini_magicArtisan'), '临时副本能按 id 查到')

  // 直接把盘面摆成公式 → 触发过关与结算
  const recipe = DBG().magicRecipe().flat()
  const cur = DBG().slideCells()
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]]
  const key = (a) => a.join('')
  const tgt = key(recipe)
  const prev = new Map([[key(cur), null]])
  let head = [cur], found = null
  while (head.length && !found) {
    const next = []
    for (const s2 of head) {
      const b2 = s2.indexOf(0), x0 = b2 % 3, y0 = Math.floor(b2 / 3)
      for (const [dx, dy] of dirs) {
        const nx = x0 + dx, ny = y0 + dy
        if (nx < 0 || ny < 0 || nx > 2 || ny > 2) continue
        const ni = ny * 3 + nx
        const c = s2.slice(); c[b2] = c[ni]; c[ni] = 0
        const k = key(c)
        if (prev.has(k)) continue
        prev.set(k, { from: key(s2), idx: ni })
        if (k === tgt) { found = k; break }
        next.push(c)
      }
      if (found) break
    }
    head = next
  }
  const path = []
  if (found) { let k = found; while (prev.get(k)) { const p = prev.get(k); path.unshift(p.idx); k = p.from } }
  for (const idx of path) { DBG().slideMove(idx); if (DBG().dungeonState().phase === 'miniDone') break }

  check(DBG().dungeonState().phase === 'miniDone', '过关后进入小游戏结算界面',
    DBG().dungeonState().phase)
  const mg = DBG().minigameById('magicArtisan')
  check(save.data.gold === beforeGold + mg.reward.gold, `金币 +${mg.reward.gold}`,
    `${beforeGold} → ${save.data.gold}`)
  check((save.data.crystal || 0) === beforeCrystal + (mg.reward.crystal || 0), '彩晶石按奖励表落账',
    `${beforeCrystal} → ${save.data.crystal}`)
  check(((save.data.attrs || {}).wisdom || 0) === beforeWisdom + mg.reward.wisdom,
    `智慧 +${mg.reward.wisdom}（官方：小游戏给智慧/勇气/魅力）`)
  check(((save.data.attrs || {}).fame || 0) === beforeFame + mg.reward.fame, `声望 +${mg.reward.fame}`)
  check((DBG().miniPlays()['magicArtisan'] || 0) === beforePlays + 1, '游玩次数 +1',
    `${beforePlays} → ${DBG().miniPlays()['magicArtisan']}`)

  // 空格 → 回小游戏列表（不是副本列表）
  t.key(' ')
  t.step(2)
  check(S().mode === 'minigames', '空格后回到小游戏列表', S().mode)
  check(DBG().miniSel() === i1, '光标停在刚才玩的那个上')

  // Esc → 回探索
  t.key('Escape')
  t.step(2)
  check(S().mode === 'explore', 'Esc 回到探索', S().mode)
}

// ---------- 6) 「记忆水晶」也要走小游戏结算（不能掉进副本翻牌） ----------
section('6) 记忆水晶：从面板开局 → 复现顺序 → 小游戏结算')
{
  S().mode = 'explore'
  const g0 = save.data.gold || 0
  const w0 = (save.data.attrs || {}).wisdom || 0
  const p0 = DBG().miniPlays()['memoryCrystal'] || 0
  check(DBG().startMinigame('memoryCrystal') === true, '开局成功')
  const st = DBG().dungeonState()
  check(st.phase === 'memory', '进入记忆力阶段', st.phase)
  check(!!st.seq && Array.isArray(st.seq.show) && st.seq.show.length === 4, '提示序列 4 步（官方难度）')
  check(st.seq.show.every((d2) => ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(d2)),
    '提示序列只由四个方向组成', JSON.stringify(st.seq.show))
  // 先按错一次 → 必须重来（而不是直接过关）
  st.seq.showing = false
  const wrong = st.seq.show[0] === 'ArrowUp' ? 'ArrowDown' : 'ArrowUp'
  t.key(wrong === 'ArrowUp' ? 'ArrowUp' : 'ArrowDown')
  t.step(2)
  check(DBG().dungeonState().phase === 'memory', '按错后仍在这一关（重来）')
  check((DBG().dungeonState().seq.input || []).length === 0, '按错后输入被清空')
  // 再按对
  DBG().dungeonState().seq.showing = false
  const seq = DBG().dungeonState().seq.show.slice()
  const keyOf = { ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' }
  for (const d2 of seq) { t.key(keyOf[d2]); t.step(1) }
  t.step(2)
  check(DBG().dungeonState().phase === 'miniDone', `按对 4 步后进入小游戏结算（不是副本翻牌）`,
    DBG().dungeonState().phase)
  const mg = DBG().minigameById('memoryCrystal')
  check((save.data.gold || 0) === g0 + mg.reward.gold, `金币 +${mg.reward.gold}`)
  check(((save.data.attrs || {}).wisdom || 0) === w0 + mg.reward.wisdom,
    `智慧只发一次（+${mg.reward.wisdom}，不是 +${mg.reward.wisdom * 2}）`,
    `${w0} → ${(save.data.attrs || {}).wisdom}`)
  check((DBG().miniPlays()['memoryCrystal'] || 0) === p0 + 1, '记忆水晶的游玩次数 +1')
  t.key(' ')
  t.step(2)
  check(S().mode === 'minigames', '空格回到小游戏列表', S().mode)
  t.key('Escape'); t.step(2)
}

// ---------- 7) 彩晶石必须是真的存档字段（不是"只显示不落账"） ----------
section('7) 彩晶石（crystal）是真字段，不是画面上写写')
{
  check(Object.prototype.hasOwnProperty.call(save.defaults, 'crystal'), '存档默认值里有 crystal')
  check(save.defaults.crystal === 0, 'crystal 默认 0')
  // 老档（没有 crystal）读进来要补 0，而不是 undefined
  const r = save.migrate({ level: 3, gold: 10, started: true })
  check(r.data.crystal === 0, '老档迁移后 crystal = 0', String(r.data.crystal))
  const r2 = save.migrate({ level: 3, crystal: 77 })
  check(r2.data.crystal === 77, '已有 crystal 的档保持原值', String(r2.data.crystal))
}

// ---------- 8) 入口：按键与 NPC ----------
section('8) 入口：Y 键 与「小游戏向导」NPC')
{
  // NPC：官方原文只说"有个专门介绍这些游戏的 npc"，**没给名字** → 名字必须标成 derived
  const mName = '小游戏向导'
  // 【第 40 轮改】入口类 NPC 现在**只在"该岛的中心场景"**出现（用户反馈 NPC 太多）。
  // 所以这里检的是"每座岛的中心场景各有一个"，而不是"每个主城场景都有"。
  const isles = (t.get('__world').islands || []).filter((i) => i.id === 'castle' || i.id === 'market')
  check(isles.length === 2, `主城/集市两座岛都在（${isles.length}）`)
  let foundNpc = 0, badGate = 0, stray = 0
  for (const isl of isles) {
    const hub = isl.scenes[0]
    DBG().gotoScene(hub); DBG().refreshSpawns(true)
    const n = (DBG().spawns.npcs || []).find((x) => x.name === mName)
    if (n) { foundNpc++; if (!n.miniGate) badGate++ }
    // 同一座岛的其他场景不该再有他
    for (const sid of isl.scenes.slice(1, 4)) {
      DBG().gotoScene(sid); DBG().refreshSpawns(true)
      if ((DBG().spawns.npcs || []).some((x) => x.name === mName)) stray++
    }
  }
  check(foundNpc === isles.length, `「${mName}」在每座岛的中心场景各出现一次（${foundNpc}/${isles.length}）`)
  check(badGate === 0, '出现的 NPC 都带 miniGate 标记（点了能进小游戏）')
  check(stray === 0, `非中心场景里没有重复的「${mName}」（检查了 ${isles.length * 3} 个，重复 ${stray}）`)

  // Y 键：从探索进面板
  S().mode = 'explore'
  t.key('y')
  t.step(2)
  check(S().mode === 'minigames', 'Y 键打开小游戏面板', S().mode)
  t.key('Escape')
  t.step(2)
  check(S().mode === 'explore', '再按 Esc 退出', S().mode)
}

// ---------- 9) 「思维方块」：官方判定是"四个以上相同就消除" ----------
section('9) 思维方块：四连消除（官方判定原话）')
{
  const P = DBG().blockParams()
  check(P.need === 4, '消除判定是"四个以上"（官方原话）', String(P.need))
  check(P.cols > 0 && P.rows > 0 && P.kinds >= 2, `盘面 ${P.cols}×${P.rows} / ${P.kinds} 色（derived）`)

  S().mode = 'explore'
  check(DBG().startMinigame('thinkBlocks') === true, '开局成功')
  check(S().mode === 'dungeon', '进了临时副本状态机')
  check(DBG().dungeonState().phase === 'blocks', '进入 blocks 阶段')
  const b0 = DBG().blocksState()
  check(!!b0 && b0.grid.length === P.rows && b0.grid[0].length === P.cols, '盘面尺寸对')
  check(b0.lines === 0 && b0.over === 0, '开局 0 条、未结束')
  check(b0.grid.every((row) => row.every((v) => v === -1)), '开局盘面是空的')
  check(!!b0.piece, '有正在下落的"提示框"（三格）')

  // 提示框：方向键能左右移动、空格能转动方向
  const p0 = DBG().blocksState().piece
  const moved = DBG().blocksMove(-1, 0)
  check(moved === true && DBG().blocksState().piece.cx === p0.cx - 1, '左移一格')
  DBG().blocksMove(1, 0)
  check(DBG().blocksState().piece.cx === p0.cx, '右移回来')
  const d0 = DBG().blocksState().piece.dir
  DBG().blocksRotate()
  const d1 = DBG().blocksState().piece.dir
  check(d1 !== d0 || DBG().blocksState().piece.cx !== p0.cx, '转动方向（或做了贴墙位移）')
  DBG().blocksRotate()

  // 官方判定：摆出 4 个同色 → 必须消掉
  DBG().blocksFillRow(0, 1)
  DBG().blocksFillRow(1, 1)
  check(DBG().blocksState().grid[0].every((v) => v === 1), '第一行已摆成同色')
  const runs = DBG().blocksRuns()
  check(runs.length === 2 * P.cols, `两行各 ${P.cols} 格都在"该消除"的集合里`, String(runs.length))
  const cleared = DBG().blocksClear()
  check(cleared >= 2, `消掉的行数 ≥ 2（实际 ${cleared}）`)
  check(DBG().blocksState().grid[0].every((v) => v === -1)
    && DBG().blocksState().grid[1].every((v) => v === -1), '消掉之后这两行空了')

  // 只摆 3 个 → 必须**不**消（这正是"四个以上"的下界）
  const st4 = DBG().dungeonState().bl
  for (let c = 0; c < P.cols; c++) st4.grid[4][c] = c < 3 ? 2 : -1
  const runs3 = DBG().blocksRuns()
  check(!runs3.some((k) => k.startsWith('4,')), '一行里只有 3 连同色时**不**消除（下界正确）', runs3.join(' '))

  // 过关：消满 target 条 → 走 miniStagePass（不是副本翻牌）
  const g0 = save.data.gold || 0
  const w0 = (save.data.attrs || {}).wisdom || 0
  for (let i = 0; i < P.target; i++) {
    const st2 = DBG().dungeonState().bl
    st2.grid[P.rows - 1 - i].fill(1)
    DBG().blocksSettle()
  }
  const st5 = DBG().dungeonState()
  check(st5.bl.lines >= P.target, `已消除 ${st5.bl.lines} 条（目标 ${P.target}）`)
  // 让提示框落地一次，触发过关检查
  for (let i = 0; i < 40 && DBG().dungeonState().phase === 'blocks'; i++) DBG().blocksMove(0, 1)
  for (let i = 0; i < 60 && DBG().dungeonState().phase === 'blocks'; i++) DBG().blocksTick(1 / 60)
  check(DBG().dungeonState().phase === 'miniDone', '消满目标条数 → 小游戏结算', DBG().dungeonState().phase)
  const mg = DBG().minigameById('thinkBlocks')
  check((save.data.gold || 0) === g0 + mg.reward.gold, `金币 +${mg.reward.gold}`)
  check(((save.data.attrs || {}).wisdom || 0) === w0 + mg.reward.wisdom, `智慧 +${mg.reward.wisdom}`)

  // 版式：最下面一行的底边不许压到页脚
  const last = DBG().blocksCellRect(P.rows - 1, 0)
  check(last.y + last.h < 560 - 60, '盘面最后一行的底边留出了页脚空间', String(last.y + last.h))

  // ★ 过关条件按"消了几段"算，不是"占了几个行号"。
  // 【第 41 轮修的 bug】竖着消一列 4 格曾被算成 **4 条**，于是有一局 0.8 秒就通关。
  // 这里把两种情形都钉住：横着一段算 1、竖着一段也算 1。
  DBG().state.mode = 'explore'
  DBG().startMinigame('thinkBlocks')
  const b2 = DBG().dungeonState().bl
  for (let r = 0; r < b2.rows; r++) for (let c = 0; c < b2.cols; c++) b2.grid[r][c] = -1
  for (let c = 0; c < 4; c++) b2.grid[b2.rows - 1][c] = 1     // 竖着的一段（同列 4 格）
  check(DBG().blocksClear() === 1, '竖着消一列 4 格只算 **1** 段（不是 4 条）', String(DBG().blocksClear()))
  for (let r = 0; r < b2.rows; r++) for (let c = 0; c < b2.cols; c++) b2.grid[r][c] = -1
  for (let c = 0; c < 4; c++) b2.grid[3][c] = 2               // 横着的一段
  check(DBG().blocksClear() === 1, '横着消一行 4 格也算 1 段')
  for (let r = 0; r < b2.rows; r++) for (let c = 0; c < b2.cols; c++) b2.grid[r][c] = -1
  for (let c = 0; c < 4; c++) { b2.grid[3][c] = 3; b2.grid[5][c] = 3 }   // 两段
  check(DBG().blocksClear() === 2, '两段算 2')
  t.key('Escape'); t.step(2); S().mode = 'explore'
}

// ---------- 10) 「多比快跑」：连按加速、空格跳、躲障碍、捡宝石 ----------
section('10) 多比快跑（官方玩法原话）')
{
  const R = DBG().runnerParams()
  check(R.need > 0, `通关要捡 ${R.need} 颗宝石（derived）`)
  const K = DBG().runConst()
  check(K.base > 0 && K.max > K.base, '有基础速度与速度上限')

  S().mode = 'explore'
  check(DBG().startMinigame('dobiRun') === true, '开局成功')
  check(DBG().dungeonState().phase === 'runner', '进入 runner 阶段')
  const r0 = DBG().runnerState()
  check(r0.dist === 0 && r0.gems === 0 && r0.hits === 0, '开局归零')
  check(r0.itemCount > 0, `赛道上有 ${r0.itemCount} 个物件`)
  const items = DBG().runnerItems()
  check(items.some((x) => x.kind === 'rock'), '赛道上有石头（原文点名）')
  check(items.some((x) => x.kind === 'pond'), '赛道上有水塘（原文点名）')
  check(items.some((x) => x.kind === 'gem'), '赛道上有宝石（原文点名）')
  check(items.filter((x) => x.kind === 'gem').length >= R.need, '宝石总数够通关所需')
  check(items.every((x, i) => i === 0 || x.at > items[i - 1].at), '物件按距离递增排布（不会两个叠在一处）')

  // "连续按方向键…加速"：连按速度上升，不按会掉下来
  const s0 = DBG().runnerState().speed
  for (let i = 0; i < 6; i++) DBG().runnerPress()
  DBG().runnerTick(1 / 60)
  const s1 = DBG().runnerState().speed
  check(s1 > s0, '连按方向键 → 速度上升', `${s0.toFixed(2)} → ${s1.toFixed(2)}`)
  for (let i = 0; i < 90; i++) DBG().runnerTick(1 / 60)
  const s2 = DBG().runnerState().speed
  check(s2 < s1, '不按了速度回落', `${s1.toFixed(2)} → ${s2.toFixed(2)}`)
  check(DBG().runnerState().presses === 6, '按键次数被记下来')

  // "按空格跳跃"：跳起来会落地
  check(DBG().runnerJump() === true, '空格能起跳')
  check(DBG().runnerState().air === true, '起跳后处于空中')
  check(DBG().runnerJump() === false, '空中不能再跳')
  let landed = false
  for (let i = 0; i < 120; i++) { DBG().runnerTick(1 / 60); if (!DBG().runnerState().air) { landed = true; break } }
  check(landed, '跳完会落回地面')

  // 撞石头：不跳就掉速；跳过去就没事
  DBG().runnerReset()
  const it0 = DBG().runnerItems().find((x) => x.kind === 'rock')
  const st6 = DBG().dungeonState().rn
  st6.dist = it0.at - 1
  st6.y = 0; st6.air = false; st6.boost = 5
  DBG().runnerTick(1 / 60)
  check(DBG().runnerState().hits === 1, '没跳 → 撞到石头记一次')
  check(DBG().runnerState().boost === 0, '撞到后掉速（boost 归零）')
  DBG().runnerReset()
  const it1 = DBG().runnerItems().find((x) => x.kind === 'rock')
  const st7 = DBG().dungeonState().rn
  st7.dist = it1.at - 1; st7.y = 2.0; st7.air = true; st7.vy = 1; st7.boost = 5
  DBG().runnerTick(1 / 60)
  check(DBG().runnerState().hits === 0, '跳过去 → 不记碰撞')

  // 宝石：地上的跑过就捡；天上挂着的必须跳
  DBG().runnerReset()
  const gemGround = DBG().runnerItems().find((x) => x.kind === 'gem' && !x.hi)
  const st8 = DBG().dungeonState().rn
  st8.dist = gemGround.at - 1; st8.y = 0; st8.air = false
  DBG().runnerTick(1 / 60)
  check(DBG().runnerState().gems === 1, '地上的宝石跑过去就捡到')
  const gemAir = DBG().runnerItems().find((x) => x.kind === 'gem' && x.hi)
  if (gemAir) {
    const st9 = DBG().dungeonState().rn
    st9.dist = gemAir.at - 1; st9.y = 0; st9.air = false
    DBG().runnerTick(1 / 60)
    check(DBG().runnerState().gems === 1, '挂在天上的宝石，站着跑过去捡不到')
    const st10 = DBG().dungeonState().rn
    st10.dist = gemAir.at - 1; st10.y = 2.0; st10.air = true; st10.vy = 1
    DBG().runnerTick(1 / 60)
    check(DBG().runnerState().gems === 2, '跳起来才捡到天上的宝石')
  }

  // 捡满 need 颗 → 过关结算（用一个"看得懂时机"的控制器跑：起跳点在提前 0.36 秒）
  const g0 = save.data.gold || 0
  const b0 = (save.data.attrs || {}).brave || 0
  const st11 = DBG().dungeonState().rn
  st11.dist = 0; st11.gems = 0
  for (let i = 0; i < 8000 && DBG().dungeonState().phase === 'runner'; i++) {
    const st12 = DBG().dungeonState().rn
    if (!st12) break
    DBG().runnerPress()
    const nx = DBG().runnerItems().find((x) => !x.got && x.at > st12.dist - 1)
    if (nx) {
      // 这一跳该跳吗：障碍必须跳，天上的宝石必须跳，地上的宝石不用
      const mustJump = nx.kind !== 'gem' || nx.hi
      const eta = (nx.at - st12.dist) / Math.max(0.001, st12.speed)
      if (mustJump && !st12.air && eta < 0.36) DBG().runnerJump()
    }
    DBG().runnerTick(1 / 60)
  }
  check(DBG().dungeonState().phase === 'miniDone', '捡满宝石 → 小游戏结算', DBG().dungeonState().phase)
  const mg2 = DBG().minigameById('dobiRun')
  check((save.data.gold || 0) === g0 + mg2.reward.gold, `金币 +${mg2.reward.gold}`)
  check(((save.data.attrs || {}).brave || 0) === b0 + mg2.reward.brave, `勇气 +${mg2.reward.brave}`)
  // 空格回面板
  t.key(' '); t.step(2)
  check(S().mode === 'minigames', '结算后空格回小游戏列表', S().mode)
  t.key('Escape'); t.step(2)
}

// ---------- 11) 「拯救多比古书」：方向键移动、跳跃（官方规则只有这一句） ----------
section('11) 拯救多比古书（平台跳跃）')
{
  const P = DBG().platformerParams()
  check(P.need === 5, `要救 ${P.need} 本书（derived：官方只说"移动、跳跃"）`)
  S().mode = 'explore'
  check(DBG().startMinigame('saveBook') === true, '开局成功')
  check(DBG().dungeonState().phase === 'platformer', '进入 platformer 阶段')
  const p0 = DBG().platformerState()
  check(!!p0 && p0.plats.length >= 4, `场景里有 ${p0.plats.length} 块平台（含地面）`)
  check(p0.books.length === P.need, `放了 ${p0.books.length} 本书`)
  check(p0.spirits.length >= 1, `有 ${p0.spirits.length} 个火精灵在巡逻`)

  // ★ 可达性自检：**按物理参数算一遍**，每本书都必须够得着。
  // 【第 41 轮加的守卫】原来的关卡地面到 2 号平台要爬 140px，而跳跃最高只有 90px ——
  // **两本书在物理上就够不到**，机器人 0/4 通关（自动试玩体检 check-minigame-balance 抓出来的）。
  // 现在这条断言会在关卡被改坏时立刻报出来，而不是等玩家玩到那儿才发现。
  {
    const maxClimb = (P.jump * P.jump) / (2 * P.gravity)          // 跳跃最高点
    const airTime = (2 * P.jump) / P.gravity                       // 一次跳跃的滞空时间
    const maxRun = P.speed * airTime                               // 滞空期间能横移多远
    // 从地面出发，做个"平台可达"的广搜
    const reach = new Set([0])
    let grew = true
    while (grew) {
      grew = false
      for (const i of [...reach]) {
        for (let j = 0; j < p0.plats.length; j++) {
          if (reach.has(j)) continue
          const a = p0.plats[i], b = p0.plats[j]
          const climb = a.y - b.y                                  // 往上爬多少（负=更高）
          const gap = b.x > a.x + a.w ? b.x - (a.x + a.w) : a.x > b.x + b.w ? a.x - (b.x + b.w) : 0
          if (climb <= maxClimb * 0.75 && gap <= maxRun * 0.8) { reach.add(j); grew = true }
        }
      }
    }
    const unreachable = p0.books.filter((bk) => {
      return ![...reach].some((i) => {
        const g = p0.plats[i]
        const onIt = bk.x >= g.x - 10 && bk.x <= g.x + g.w + 10
        const close = Math.abs(bk.y - (g.y - 28 + 14)) <= 28
        return onIt && close
      })
    })
    check(unreachable.length === 0,
      `每本书都够得到（跳跃最高 ${maxClimb.toFixed(0)}px、滞空可横移 ${maxRun.toFixed(0)}px；够不到的有 ${unreachable.length} 本）`,
      unreachable.map((b) => `(${b.x},${b.y})`).join(' '))
  }

  // 方向键左右移动（持续按住）
  const x0 = DBG().platformerState().x
  t.keyDown('ArrowRight'); t.step(20)
  const x1 = DBG().platformerState().x
  check(x1 > x0, `按住 → 会向右移动（${x0.toFixed(0)} → ${x1.toFixed(0)}）`)
  t.win.fire('keyup', { key: 'ArrowRight' })
  t.keyDown('ArrowLeft'); t.step(10)
  check(DBG().platformerState().x < x1, '按住 ← 会向左移动')
  t.win.fire('keyup', { key: 'ArrowLeft' })

  // 重力：不踩平台会往下掉
  const st0 = DBG().dungeonState().pf
  st0.x = 60; st0.y = 200; st0.vy = 0; st0.onGround = false
  const yBefore = st0.y
  t.step(10)
  check(DBG().platformerState().y > yBefore, '不踩平台时会往下落（有重力）')
  // 落地后就停住
  t.step(120)
  const landed = DBG().platformerState()
  check(landed.onGround === true, '落到平台上会停住（onGround）')
  check(Math.abs(landed.vy) < 1, '落地后垂直速度归零')

  // 跳跃：只有站在地上才跳得起来
  check(DBG().platformerJump() === true, '站在地上能跳')
  check(DBG().platformerState().vy < 0, '起跳时垂直速度为负（向上）')
  check(DBG().platformerJump() === false, '空中不能再跳')

  // 救书：走到书的位置就会 +1
  // 注意：有效过关要求是**难度缩放后**的值（第 43 轮），不能拿基础参数 P.need 当断言，
  // 要问游戏自己（needs().platformer）。踩书的过程中一旦救满，阶段就切走了，
  // 所以循环必须以"阶段还是 platformer"为条件。
  const g0 = save.data.gold || 0
  const w0 = (save.data.attrs || {}).wisdom || 0
  const effNeed = DBG().needs().platformer
  for (let i = 0; i < DBG().platformerState().books.length; i++) {
    if (DBG().dungeonState().phase !== 'platformer') break
    const st = DBG().dungeonState().pf
    const b = DBG().platformerState().books[i]
    if (!b || b.got) continue
    st.x = b.x - 11; st.y = b.y - 14; st.vy = 0
    t.step(1)
  }
  const after = DBG().platformerState()
  check(after.got >= effNeed, `走到书上就救起来了（${after.got}/${effNeed}）`)
  check(DBG().dungeonState().phase === 'miniDone', '救满 → 小游戏结算', DBG().dungeonState().phase)
  const mg = DBG().minigameById('saveBook')
  check((save.data.gold || 0) === g0 + mg.reward.gold, `金币 +${mg.reward.gold}`)
  check(((save.data.attrs || {}).wisdom || 0) === w0 + mg.reward.wisdom, `智慧 +${mg.reward.wisdom}`)

  // 被火精灵撞到：弹开 + 记一次，但**不判负**（官方没说撞了会怎样）
  S().mode = 'explore'
  DBG().startMinigame('saveBook')
  const st2 = DBG().dungeonState().pf
  const sp = DBG().platformerState().spirits[0]
  st2.x = sp.x - 5; st2.y = sp.y - 10; st2.invuln = 0
  t.step(1)
  const hit = DBG().platformerState()
  check(hit.hits === 1, '撞到火精灵记一次')
  check(hit.invuln > 0, '撞到后有短暂无敌（不会被连续判定）')
  check(DBG().dungeonState().phase === 'platformer', '撞到**不会**判负（官方只说了移动和跳跃）')
  t.key('Escape'); t.step(2); S().mode = 'explore'
}

// ---------- 12) 「王牌大空战」：四向移动 + Z 普通射击 + 按住 Z 蓄力松开 ----------
section('12) 王牌大空战（蓄力射击）')
{
  const C = DBG().chargeShooterParams()
  check(C.need === 8, `要击落 ${C.need} 架（derived）`)
  check(C.holdSec > 0, `蓄力门槛 ${C.holdSec} 秒（原文「按住Z秒」缺数字 → derived）`)
  S().mode = 'explore'
  check(DBG().startMinigame('aceDogfight') === true, '开局成功')
  check(DBG().dungeonState().phase === 'chargeshooter', '进入 chargeshooter 阶段')

  // 四向移动（官方原话「控制人物上下左右移动」）
  const a0 = DBG().chargeShooterState()
  t.keyDown('ArrowRight'); t.step(10)
  const a1 = DBG().chargeShooterState()
  check(a1.x > a0.x, `→ 向右移动（${a0.x.toFixed(0)} → ${a1.x.toFixed(0)}）`)
  t.win.fire('keyup', { key: 'ArrowRight' })
  t.keyDown('ArrowUp'); t.step(10)
  const a2 = DBG().chargeShooterState()
  check(a2.y < a1.y, '↑ 向上移动')
  t.win.fire('keyup', { key: 'ArrowUp' })
  t.keyDown('ArrowDown'); t.step(6)
  check(DBG().chargeShooterState().y > a2.y, '↓ 向下移动')
  t.win.fire('keyup', { key: 'ArrowDown' })
  t.keyDown('ArrowLeft'); t.step(6)
  check(DBG().chargeShooterState().x < a2.x, '← 向左移动')
  t.win.fire('keyup', { key: 'ArrowLeft' })

  // 短按 Z → 普通弹
  const shots0 = DBG().chargeShooterState().shots.length
  t.keyDown('z'); t.step(2)
  t.win.fire('keyup', { key: 'z' }); t.step(2)
  const afterTap = DBG().chargeShooterState()
  check(afterTap.shots.length > shots0, '短按 Z 会打出子弹')
  check(afterTap.shots.every((s) => !s.powered || s.powered === false) || afterTap.shots.some((s) => !s.powered),
    '短按打出的是**普通**弹（不是蓄力弹）')

  // 按住 Z 超过门槛 → 松开打出蓄力弹
  DBG().chargeShooterReset()
  t.keyDown('z')
  let sawCharging = false
  for (let i = 0; i < 120; i++) {
    t.step(1)
    const s = DBG().chargeShooterState()
    if (s.charging) sawCharging = true
    if (s.charge >= C.holdSec) break
  }
  check(sawCharging, '按住 Z 时进入蓄力状态')
  check(DBG().chargeShooterState().charge >= C.holdSec, '蓄力条攒满（达到门槛）')
  t.win.fire('keyup', { key: 'z' }); t.step(2)
  const powered = DBG().chargeShooterState().shots
  check(powered.some((s) => s.powered), '松开后打出的是**蓄力弹**（powered）')

  // 蓄力弹能把大敌机一次打掉（普通弹要三下）
  DBG().chargeShooterReset()
  check(DBG().spawnFoe({ x: DBG().chargeShooterState().x, y: 300, hp: 3, big: true, r: 22 }) === true, '能放一架大敌机')
  t.keyDown('z'); t.step(80); t.win.fire('keyup', { key: 'z' })
  for (let i = 0; i < 40 && DBG().chargeShooterState().foes.length; i++) t.step(1)
  check(DBG().chargeShooterState().killed >= 1, '蓄力弹一发打掉 3 血的大敌机')

  // 漏掉太多架会重来（不是判负）
  // 容错上限也是**难度缩放后**的值（第 43 轮），读实时状态而不是基础参数 C.maxMiss。
  DBG().chargeShooterReset()
  const effMaxMiss = DBG().chargeShooterState().maxMiss
  for (let i = 0; i < effMaxMiss; i++) {
    const s = DBG().chargeShooterState()
    DBG().spawnFoe({ x: 100 + i * 40, y: 560, hp: 1, r: 15 })
    t.step(1)
  }
  const reset = DBG().chargeShooterState()
  check(reset.miss === 0 && reset.killed === 0, `漏满上限后本关重来（漏 ${effMaxMiss} 架 → miss 归零）`, JSON.stringify({ miss: reset.miss }))

  // 击落足够 → 结算
  const g0 = save.data.gold || 0
  const b0 = (save.data.attrs || {}).brave || 0
  DBG().chargeShooterReset()
  for (let i = 0; i < C.need + 6 && DBG().dungeonState().phase === 'chargeshooter'; i++) {
    const s = DBG().chargeShooterState()
    DBG().spawnFoe({ x: s.x, y: 200, hp: 1, r: 15 })
    t.keyDown('z'); t.step(2); t.win.fire('keyup', { key: 'z' })
    for (let k = 0; k < 30 && DBG().dungeonState().phase === 'chargeshooter'; k++) t.step(1)
  }
  check(DBG().dungeonState().phase === 'miniDone', '击落足够 → 小游戏结算', DBG().dungeonState().phase)
  const mg2 = DBG().minigameById('aceDogfight')
  check((save.data.gold || 0) === g0 + mg2.reward.gold, `金币 +${mg2.reward.gold}`)
  check(((save.data.attrs || {}).brave || 0) === b0 + mg2.reward.brave, `勇气 +${mg2.reward.brave}`)
  t.key(' '); t.step(2)
  S().mode = 'explore'
}

// ---------- 13) 「滑雪跳台」：平衡 → 起跳 → 进圈按键（三段都来自官方原话） ----------
section('13) 滑雪跳台（三段玩法）')
{
  const K = DBG().skiConst()
  check(K.pass > 0 && K.balanceSec > 0, `过关线 ${K.pass} 米 / 平衡 ${K.balanceSec} 秒（derived）`)
  S().mode = 'explore'
  check(DBG().startMinigame('skiJump') === true, '开局成功')
  check(DBG().dungeonState().phase === 'ski', '进入 ski 阶段')
  check(DBG().skiState().phase === 'balance', '第一段是平衡（官方「←→ 控制平衡」）')

  // 平衡会被风吹偏，按住 ←→ 能拉回来
  DBG().skiSet({ balance: 0.5, drift: 0.5 })
  t.step(10)
  const drifted = DBG().skiState().balance
  check(drifted > 0.5, `不操作时平衡会漂（0.50 → ${drifted.toFixed(2)}）`)
  DBG().skiSet({ balance: 0.5, drift: 0.5 })
  t.keyDown('ArrowLeft'); t.step(20)
  check(DBG().skiState().balance < 0.5, '按住 ← 能把平衡拉回来')
  t.win.fire('keyup', { key: 'ArrowLeft' })
  // 偏得太多会摔倒（记一次、平衡复位，但不判负）
  // 判据是 |balance-0.5| > 0.45 —— 所以要给到 0.96 以上才会触发（第一版给 0.9 差一点，测试自己抓出来了）
  const s0 = DBG().skiState().stumbles
  DBG().skiSet({ balance: 0.97, drift: 0 })
  t.step(3)
  check(DBG().skiState().stumbles === s0 + 1, '平衡偏太多会摔倒一次')
  check(DBG().dungeonState().phase === 'ski', '摔倒不会判负（可以继续）')

  // 平衡阶段结束 → 起跳阶段
  DBG().skiSet({ phase: 'takeoff', t: 0, pointer: 0, pdir: 1 })
  t.step(2)
  // 指针落在红色区时按 ↑ → 跳得最远
  DBG().skiSet({ pointer: 0.80 })
  t.key('ArrowUp'); t.step(1)
  const red = DBG().skiState()
  check(red.quality === 'red', `红色区起跳判为 red（实际 ${red.quality}）`)
  check(red.jump === 60, `红色区跳 ${red.jump} 米`)
  check(red.phase === 'trick', '进入第三段：进圈按键')
  // 黄色区跳得近一些
  DBG().skiSet({ phase: 'takeoff', t: 0, pointer: 0.60, quality: null, jump: 0 })
  t.step(1); t.key('ArrowUp'); t.step(1)
  const yel = DBG().skiState()
  check(yel.quality === 'yellow' && yel.jump < 60, `黄色区跳 ${yel.jump} 米（比红色近）`)

  // 第三段：圈缩到够小时按对应方向键 → 拿到动作分
  const want = DBG().skiState().want
  DBG().skiSet({ phase: 'trick', ring: 0.08, trick: 0 })
  t.key(want); t.step(1)
  const tricked = DBG().skiState()
  check(tricked.trick >= 20, `进圈按键拿到动作分（+${tricked.trick}）`)
  check(tricked.phase === 'done', '三段走完 → 结算')
  // 按早了不给分
  DBG().skiSet({ phase: 'trick', ring: 0.9, trick: 0 })
  const want2 = DBG().skiState().want
  t.key(want2); t.step(1)
  check(DBG().skiState().trick === 0, '按太早不给动作分')

  // 过关：三段都拿满 → 结算发奖
  const g0 = save.data.gold || 0
  const b0 = (save.data.attrs || {}).brave || 0
  S().mode = 'explore'
  DBG().startMinigame('skiJump')
  DBG().skiSet({ phase: 'done', t: 0, jump: 60, trick: 30, stumbles: 0 })
  t.step(2)
  check(DBG().dungeonState().phase === 'miniDone', `过关线以上 → 小游戏结算（${DBG().skiState().total} 米）`,
    DBG().dungeonState().phase)
  const mg = DBG().minigameById('skiJump')
  check((save.data.gold || 0) === g0 + mg.reward.gold, `金币 +${mg.reward.gold}`)
  check(((save.data.attrs || {}).brave || 0) === b0 + mg.reward.brave, `勇气 +${mg.reward.brave}`)
  t.key(' '); t.step(2); S().mode = 'explore'
  // 不到过关线：留在本关、可以重来
  DBG().startMinigame('skiJump')
  DBG().skiSet({ phase: 'done', t: 0, jump: 20, trick: 0, stumbles: 3 })
  t.step(2)
  check(DBG().dungeonState().phase === 'ski', '不到过关线不结算，留在本关')
  t.key(' '); t.step(2)
  check(DBG().skiState().phase === 'balance', '按空格重来 → 回到第一段')
  t.key('Escape'); t.step(2); S().mode = 'explore'
}

// ---------- 14) 「魔幻音符」：左右键移动手指、下键弹奏 ----------
section('14) 魔幻音符（移动手指 + 弹奏）')
{
  const NC = DBG().noteConst()
  S().mode = 'explore'
  check(DBG().startMinigame('magicNote') === true, '开局成功')
  check(DBG().dungeonState().phase === 'notes', '进入 notes 阶段')
  const n0 = DBG().notesState()
  check(n0.lanes === 5, `${n0.lanes} 条琴键`)
  check(n0.list.length === 12, `放了 ${n0.list.length} 个音符`)
  check(n0.finger === 2, `手指初始在中间（${n0.finger}）`)

  // 左右键移动手指（同一帧里按两次只算一次 —— input.once 是按帧去重的，所以中间要 step）
  t.key('ArrowLeft'); t.step(1)
  check(DBG().notesState().finger === 1, '← 手指左移')
  t.key('ArrowRight'); t.step(1)
  t.key('ArrowRight'); t.step(1)
  check(DBG().notesState().finger === 3, '→ 手指右移')
  for (let i = 0; i < 8; i++) { t.key('ArrowLeft'); t.step(1) }
  check(DBG().notesState().finger === 0, '手指不会移出最左边')
  for (let i = 0; i < 8; i++) { t.key('ArrowRight'); t.step(1) }
  check(DBG().notesState().finger === 4, '手指不会移出最右边')

  // 在判定窗口内按下键 → 命中并累计连击
  const st = DBG().dungeonState().nt
  const note = st.list[0]
  st.finger = note.lane
  st.t = note.at   // 正好在判定线上
  t.key('ArrowDown'); t.step(1)
  const hit1 = DBG().notesState()
  check(hit1.hits === 1, '在窗口内按下键 → 命中')
  check(hit1.combo === 1, '连击从 1 开始')
  // 再来一个（同一个指位）
  const note2 = st.list[1]
  st.finger = note2.lane
  st.t = note2.at
  t.key('ArrowDown'); t.step(1)
  check(DBG().notesState().combo === 2, '连续命中 → 连击数累加')
  // 按错位置 → 断连击
  st.t = st.list[2].at
  st.finger = (st.list[2].lane + 1) % 5
  t.key('ArrowDown'); t.step(1)
  const miss1 = DBG().notesState()
  check(miss1.miss >= 1, '按错位置记一次失误')
  check(miss1.combo === 0, '按错会断连击')
  // 离判定线太远按下 → 不算命中
  // 【为什么要把其它音符先标掉】第一版只把 t 调到 list[3] 前 1 秒就断言 hits 不变，
  // 结果偶发失败 —— 因为随机生成的音符里**可能恰好有另一个落在 ±0.22 的窗口内**，
  // 那一下就命中了。测试要控制住随机性，而不是靠运气。
  const before = DBG().notesState().hits
  for (let i = 0; i < st.list.length; i++) if (i !== 3) st.list[i].hit = true
  st.t = st.list[3].at - 1.0
  st.finger = st.list[3].lane
  t.key('ArrowDown'); t.step(1)
  check(DBG().notesState().hits === before, '离判定线太远按下键不算命中')
  check(DBG().notesState().miss >= 2, '这一下算失误')

  // 通关：命中够数 → 结算发奖
  const g0 = save.data.gold || 0
  const w0 = (save.data.attrs || {}).wisdom || 0
  S().mode = 'explore'
  DBG().startMinigame('magicNote')
  const ns = DBG().dungeonState().nt
  ns.hits = ns.need
  t.step(2)
  check(DBG().dungeonState().phase === 'miniDone', '命中够数 → 小游戏结算', DBG().dungeonState().phase)
  const mg = DBG().minigameById('magicNote')
  check((save.data.gold || 0) === g0 + mg.reward.gold, `金币 +${mg.reward.gold}`)
  check(((save.data.attrs || {}).wisdom || 0) === w0 + mg.reward.wisdom, `智慧 +${mg.reward.wisdom}`)
  check(!!DBG().dungeonState().miniResult, '结算画面有结果对象')
  t.key(' '); t.step(2); S().mode = 'explore'
}

// ---------- 15) 「飞翔的衣服」：官方攻略读出来的玩法（第 44 轮） ----------
// 官方原文（7k7k/534823）：衣服满天飞 → 用网子抓 → **要判断方向提前下网** →
// 越后面越多越快 → 限时抓完，抓不完这一关算失败。
// 这里逐条钉住，尤其是"提前下网"这条 —— 它是这一关**唯一有官方依据的机制**，
// 如果网子没有落点延迟，这条提示就是摆设，等于把官方玩法做丢了。
section('15) 飞翔的衣服（网子要提前下）')
{
  const A = DBG().flyCatchParams()
  check(A.netDelay > 0, `网子有落点延迟 ${A.netDelay}s（官方"提前下网"的前提）`)
  check(A.addPerLevel > 0, `每关件数递增 +${A.addPerLevel}（官方"越后面越多"）`)
  check(A.speedPerLevel > 0, `每关速度递增 +${A.speedPerLevel}（官方"越来越快"）`)
  check(A.levelSec > 0, `每关有限时 ${A.levelSec}s（官方"注意时间"）`)

  S().mode = 'explore'
  check(DBG().startMinigame('flyClothes') === true, '能开局')
  check(DBG().dungeonState().phase === 'flycatch', `进入 flycatch 阶段（${DBG().dungeonState().phase}）`)
  const g0 = DBG().flyCatchState()
  check(g0.count >= 2, `第 1 关有 ${g0.count} 件衣服`)
  check(g0.timeLeft > 0, `限时 ${g0.timeLeft.toFixed(1)}s`)
  check(g0.passLevels >= 2, `要打满 ${g0.passLevels} 关`)

  // ---- 机制核心：下网 ≠ 立刻抓到，要等网合拢 ----
  const c0 = g0.clothes[0]
  check(DBG().flyCatchCast(c0.x, c0.y) === true, '能下网')
  check(DBG().flyCatchState().caught === 0, '刚下网时还没抓到（网还没合拢）')
  DBG().flyCatchTick(A.netDelay * 0.5)
  check(DBG().flyCatchState().caught === 0, '过了半个延迟仍然没抓到')
  check(DBG().flyCatchState().nets.some((n) => !n.closed), '此时网仍在飞（还没合拢）')
  // 一次只能有一张网在飞（否则狂点鼠标就能通关，"提前下网"失去意义）
  // ⚠️ 必须趁网**还没合拢**的时候试第二次下网 —— 先 tick 到合拢再断言就成了假通过
  check(DBG().flyCatchCast(c0.x, c0.y) === false, '有网在飞时不能再下网')
  DBG().flyCatchTick(A.netDelay * 0.6)
  check(DBG().flyCatchState().nets.every((n) => n.closed), '过了延迟 → 网合拢')

  // ---- 官方窍门真的有用：按提前量下网能抓到；不提前就抓空 ----
  // 用一个受控局面，避免随机性：只留一件衣服，放在场地正中，速度给一个定值。
  DBG().flyCatchReset()
  const st = DBG().dungeonState().fc
  const a = DBG().flyCatchArena()
  const mk = (vx, vy) => {
    st.clothes = [{ x: 480, y: 300, vx, vy, r: 22, got: false, spin: 0, kind: 0 }]
    st.count = 1; st.total = 1; st.nets = []; st.caught = 0; st.timeLeft = 999
  }
  const lead = A.netDelay
  // ① 打在"衣服现在的位置"：等网合拢时衣服已经飞走了（位移 > 网口）
  const speed = (A.baseSpeed || 62) + (A.speedPerLevel || 20) * 2      // 用第 3 关的速度
  mk(speed, 0)
  DBG().flyCatchCast(480, 300)
  DBG().flyCatchTick(lead + 1 / 60)
  check(DBG().flyCatchState().caught === 0,
    `不提前 → 抓空（衣服在这段时间飞了 ${(speed * lead).toFixed(0)}px，超过网口 ${A.netR}px）`)
  // ② 打在"提前量"上：正好逮住
  mk(speed, 0)
  DBG().flyCatchCast(480 + speed * lead, 300)
  DBG().flyCatchTick(lead + 1 / 60)
  check(DBG().flyCatchState().caught === 1, '按提前量下网 → 抓到了')

  // ---- 限时到了还没抓完 → 这一关重来（官方："这一关也算挑战失败"） ----
  // 【为什么要重开一局】上面的"提前量"子测试会真的把那一关抓完（正是它该做的事），
  // 于是 cleared 会 +1；如果这里继续用同一局，就可能刚好凑满 passLevels 直接结算，
  // 阶段变成 miniDone，flyCatchTick 会立刻返回 —— 断言就变成在测一个已经结束的局面。
  // 每个子测试自己起一局，才不会被前一个子测试的进度影响。
  S().mode = 'explore'
  DBG().startMinigame('flyClothes')
  const st2 = DBG().dungeonState().fc
  st2.timeLeft = 0.05
  const lv0 = st2.level
  const phaseBefore = DBG().dungeonState().phase
  DBG().flyCatchTick(0.1)
  const afterFail = DBG().flyCatchState()
  check(phaseBefore === 'flycatch', `超时前还在这一关（phase=${phaseBefore}）`)
  check(afterFail.fails === 1, '超时记一次本关失败',
    `fails=${afterFail.fails} level=${afterFail.level} cleared=${afterFail.cleared} time=${afterFail.timeLeft.toFixed(2)}`)
  check(afterFail.level === lv0, `超时后仍在第 ${afterFail.level} 关（重打本关，不是重开整局）`)
  check(afterFail.cleared === 0, '超时不会白送过关数')
  check(afterFail.timeLeft > 0, '重打时限时重置')

  // ---- 抓完所有衣服 → 过关数 +1；抓满 passLevels → 结算发奖 ----
  const gold0 = save.data.gold || 0
  const brave0 = (save.data.attrs || {}).brave || 0
  S().mode = 'explore'
  DBG().startMinigame('flyClothes')
  let guard = 0
  while (DBG().dungeonState().phase === 'flycatch' && guard++ < 12000) {
    const s = DBG().flyCatchState()
    const alive = s.clothes.filter((c) => !c.got)
    if (alive.length && s.nets.filter((n) => !n.closed).length === 0) {
      const c = alive[0]
      DBG().flyCatchCast(c.x + c.vx * A.netDelay, c.y + c.vy * A.netDelay)
    }
    DBG().flyCatchTick(1 / 60)
  }
  check(DBG().dungeonState().phase === 'miniDone',
    `按提前量下网 → 打满通关（${DBG().dungeonState().phase}）`)
  const mg = DBG().minigameById('flyClothes')
  check((save.data.gold || 0) === gold0 + mg.reward.gold, `金币 +${mg.reward.gold}`)
  check(((save.data.attrs || {}).brave || 0) === brave0 + mg.reward.brave, `勇气 +${mg.reward.brave}`)
  t.key(' '); t.step(2); S().mode = 'explore'
}

// ---------- 16) 哈里的金币（第 47 轮新增 · 官方攻略 7k7k/660617） ----------
section('16) 哈里的金币（金币掉进箱子 · 箱子要二维移动）')
{
  const P = DBG().coinCatchParams()
  // 官方原话给了两条机制，必须真的成立：
  check(P.target > 0 && P.needPerLevel > P.target, `接住 ${P.target}/${P.needPerLevel} 枚过关（掉的总数要多于目标）`)
  check(P.delayPerLevel > 0 && P.minDelay < P.firstDelay,
    `每关掉落更快：间隔 ${P.firstDelay}s → 每关 -${P.delayPerLevel}s（下限 ${P.minDelay}s）（官方"后面速度越来越快"）`)
  check(P.speedPerLevel > 0, `下落速度每关 +${P.speedPerLevel}（同一条官方原话）`)

  S().mode = 'explore'
  check(DBG().startMinigame('harryCoin') === true, '能开局')
  check(DBG().dungeonState().phase === 'catch', `进入 catch 阶段（${DBG().dungeonState().phase}）`)

  // ---- 箱子必须**四个方向都能动** ----
  // 依据：官方技巧是「按住键盘上的四个方向键不松」—— 只做左右移动的话那条技巧就不成立了。
  const a = DBG().coinCatchArena()
  const g0 = DBG().coinCatchState()
  const x0 = g0.x, y0 = g0.y
  const hold = (key, frames, probe) => {
    t.key(key)                       // 注意：key() 是按下并抬起，这里用 raf 持续按住
    return frames
  }
  const press = (key) => { W.fire('keydown', { key, preventDefault() { } }) }
  const release = (key) => { W.fire('keyup', { key }) }
  press('ArrowRight')
  for (let i = 0; i < 20; i++) DBG().coinCatchTick(1 / 60)
  release('ArrowRight')
  const afterX = DBG().coinCatchState().x
  check(afterX > x0 + 20, `按住 → 箱子横向移动（${x0.toFixed(0)} → ${afterX.toFixed(0)}）`)
  press('ArrowUp')
  for (let i = 0; i < 20; i++) DBG().coinCatchTick(1 / 60)
  release('ArrowUp')
  const afterY = DBG().coinCatchState().y
  check(afterY < y0 - 20, `按住 ↑ 箱子纵向移动（${y0.toFixed(0)} → ${afterY.toFixed(0)}）—— 这就是官方"四个方向键"那条技巧的前提`)
  // 不许出界
  press('ArrowRight')
  for (let i = 0; i < 600; i++) DBG().coinCatchTick(1 / 60)
  release('ArrowRight')
  const gEdge = DBG().coinCatchState()
  check(gEdge.x + (P.boxW || 76) / 2 <= a.x1 + 1, `箱子撞到右边界会停住（x=${gEdge.x.toFixed(0)}）`)

  // ---- 接住判定：金币落到箱口时才算接到 ----
  DBG().coinCatchReset()
  const st = DBG().dungeonState().cc
  const halfH = (P.boxH || 34) / 2
  st.coins = [{ x: st.x, y: st.y - halfH - 4, vy: 120, r: 13, got: false, miss: false }]
  st.dropped = 1
  DBG().coinCatchTick(1 / 60)
  check(DBG().coinCatchState().got === 1, '金币落到箱口 → 接住')

  // ---- 漏太多 → 本关重来（不是直接判负，也不是白过） ----
  DBG().coinCatchReset()
  const st2 = DBG().dungeonState().cc
  const missN = (P.needPerLevel || 15) - (P.target || 8) + 1
  st2.coins = []
  for (let i = 0; i < missN; i++) st2.coins.push({ x: 40, y: 99999, vy: 0, r: 13, got: false, miss: false })
  st2.dropped = missN
  DBG().coinCatchTick(1 / 60)
  const gMiss = DBG().coinCatchState()
  check(gMiss.got === 0 && gMiss.level === 1, `漏掉 ${missN} 枚 → 第 1 关重来（got 归零、关卡不变）`)

  // ---- 接满就通关并结算（官方点名的四类奖励都要发） ----
  const gold0 = save.data.gold || 0
  const wis0 = ((save.data.attrs || {}).wisdom) || 0
  DBG().coinCatchReset()
  const st3 = DBG().dungeonState().cc
  st3.got = (P.target || 8) - 1
  st3.coins = [{ x: st3.x, y: st3.y - halfH - 4, vy: 120, r: 13, got: false, miss: false }]
  DBG().coinCatchTick(1 / 60)
  check(DBG().dungeonState().phase === 'miniDone', `接满 ${P.target} 枚 → 通关（${DBG().dungeonState().phase}）`)
  const mg2 = DBG().minigameById('harryCoin')
  check((save.data.gold || 0) === gold0 + mg2.reward.gold, `金币 +${mg2.reward.gold}`)
  check((((save.data.attrs || {}).wisdom) || 0) === wis0 + mg2.reward.wisdom, `智慧 +${mg2.reward.wisdom}`)
  t.key(' '); t.step(2); S().mode = 'explore'
}

// ---------- 17) 魔镜世界（第 47 轮新增 · 官方攻略 7k7k/660928 + 660934） ----------
section('17) 魔镜世界（躲怪物 + 开箱子 + 找钥匙，方向被镜像）')
{
  const P = DBG().mirrorParams()
  check(P.mirrorX === true && P.mirrorY === true, '方向整体镜像（攻略："把键盘颠倒180度"）')
  check(P.crates >= 2, `${P.crates} 个箱子（其中 1 个藏钥匙）`)
  check(P.monsters >= 1, `${P.monsters} 只巡逻怪`)
  check(P.monsterSpeed < P.playerSpeed, `怪物比玩家慢（怪 ${P.monsterSpeed} < 玩家 ${P.playerSpeed}）—— 所以能靠走位躲开`)

  S().mode = 'explore'
  check(DBG().startMinigame('mirrorWorld') === true, '能开局')
  check(DBG().dungeonState().phase === 'mirror', `进入 mirror 阶段（${DBG().dungeonState().phase}）`)
  const g0 = DBG().mirrorState()
  check(g0.crates.filter((c) => c.hasKey).length === 1, '恰好有 1 个箱子里有钥匙')
  check(g0.exit && g0.exit.open === false, '出口初始是锁着的')
  // 「怪物的行动轨迹是有规律的」→ 必须是固定巡逻（不是随机游走）
  const m0 = g0.mons.map((m) => m.x)
  for (let i = 0; i < 30; i++) DBG().mirrorTick(1 / 60)
  const m1 = DBG().mirrorState().mons.map((m) => m.x)
  check(m1.some((x, i) => Math.abs(x - m0[i]) > 5), '怪物会沿固定路线移动（往返巡逻）')

  // ---- ★ 镜像：按右键往左走、按上键往下走（这一关的玩法内核） ----
  const press = (key) => { W.fire('keydown', { key, preventDefault() { } }) }
  const release = (key) => { W.fire('keyup', { key }) }
  DBG().mirrorReset()
  const p0 = DBG().mirrorState()
  press('ArrowRight')
  for (let i = 0; i < 12; i++) DBG().mirrorTick(1 / 60)
  release('ArrowRight')
  const p1 = DBG().mirrorState()
  check(p1.px < p0.px - 5, `按 → 实际往左走（${p0.px.toFixed(0)} → ${p1.px.toFixed(0)}）—— 镜像生效`)
  press('ArrowUp')
  for (let i = 0; i < 12; i++) DBG().mirrorTick(1 / 60)
  release('ArrowUp')
  const p2 = DBG().mirrorState()
  check(p2.py > p1.py + 5, `按 ↑ 实际往下走（${p1.py.toFixed(0)} → ${p2.py.toFixed(0)}）—— 上下也镜像`)

  // ---- 开箱子：走到箱子旁边就打开 ----
  DBG().mirrorReset()
  const st = DBG().dungeonState().mr
  st.px = st.crates[0].x; st.py = st.crates[0].y
  DBG().mirrorTick(1 / 60)
  check(DBG().mirrorState().opened === 1, '走到箱子旁边 → 箱子打开')

  // ---- ★ 全开 + 拿到钥匙 → 出口才打开（第一版没有出口，这一关永远打不完） ----
  DBG().mirrorReset()
  const st2 = DBG().dungeonState().mr
  st2.crates.forEach((c) => { c.opened = true })
  st2.opened = st2.crates.length
  st2.hasKey = true
  DBG().mirrorTick(1 / 60)
  check(DBG().mirrorState().exit.open === true, '开完全部箱子且拿到钥匙 → 出口打开')
  check(DBG().dungeonState().phase === 'mirror', '此时还没通关（要走到出口）')
  // 走到出口 → 通关
  const ex = DBG().mirrorState().exit
  st2.px = ex.x; st2.py = ex.y
  DBG().mirrorTick(1 / 60)
  check(DBG().dungeonState().phase === 'miniDone', `走到出口 → 通关（${DBG().dungeonState().phase}）`)
  const mg3 = DBG().minigameById('mirrorWorld')
  check((save.data.gold || 0) > 0 && mg3.reward.gold > 0, `结算给了金币 +${mg3.reward.gold}`)

  // ---- 出口没开时走到出口位置**不算过关** ----
  S().mode = 'explore'
  DBG().startMinigame('mirrorWorld')
  const st3 = DBG().dungeonState().mr
  st3.px = st3.exit.x; st3.py = st3.exit.y
  DBG().mirrorTick(1 / 60)
  check(DBG().dungeonState().phase === 'mirror', '钥匙没拿到时，站在出口位置也不能过关')

  // ---- 限时到 → 本关重来 ----
  const st4 = DBG().dungeonState().mr
  st4.timeLeft = 0.01
  DBG().mirrorTick(1 / 30)
  const g4 = DBG().mirrorState()
  check(g4.timeLeft > 10 && g4.fails === 1, `限时到 → 本关重来（时间重置为 ${Math.round(g4.timeLeft)}s，失败计数 ${g4.fails}）`)
  t.key(' '); t.step(2); S().mode = 'explore'
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
