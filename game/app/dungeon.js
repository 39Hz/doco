/* 多克多比 · 应用层：副本全流程（第 72 轮重构批次 4）
   来源：原 game.js 第 2218–2560 行，内容一致（含官方依据注释）。
   依赖：引擎 window.DKDbb（save / audio / util）+ 内容表 window.DKDbbData（D）
        + 内核 G.core（toast / S / H）+ 领域层 G.domain.dungeonRules（MORALE_*）
        + 跨应用层桥（下方 const 别名，惰性解析）：
          G.app.notice（战斗播报，批次 6 迁出）、G.app.startBattle（战斗，批次 6 迁出）、
          G.app.minigames.miniStagePass（小游戏过关结算，批次 7 · 续 迁出）、G.app.grantForm（唤醒用例，本批次另一模块）、
          G.app.minigames.*（小游戏实现，批次 7 · 续 已迁到 game/app/minigames.js）、
          G.app.crystal.makeCrystal（晶石对战构造，批次 7 · ui 收尾 迁出）、
          G.app.awaken.*（唤醒模块里的管线关 makePipePuzzle / 空战关 makeShooter）。
   只经 G.app.dungeon 出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'

  const G = window.DKDbbGame
  const { save, audio, util } = window.DKDbb
  const D = window.DKDbbData
  const { S, H } = G.core
  const { toast } = G.core
  const { MORALE_MOVES, MORALE_TABLE } = G.domain.dungeonRules
  // 跨应用层桥（惰性箭头：调用时才解析，故加载顺序无关）
  const notice = (...a) => G.app.notice(...a)
  const miniStagePass = () => G.app.minigames.miniStagePass()
  const startBattle = (spawn) => G.app.startBattle(spawn)
  const grantForm = (name) => G.app.grantForm(name)
  const makePipePuzzle = (...a) => G.app.awaken.makePipePuzzle(...a)
  const makeShooter = (...a) => G.app.awaken.makeShooter(...a)
  const makeSoar = (...a) => G.app.minigames.makeSoar(...a)
  const makeBallPush = (...a) => G.app.minigames.makeBallPush(...a)
  const makeCoinCatch = (...a) => G.app.minigames.makeCoinCatch(...a)
  const makeMirror = (...a) => G.app.minigames.makeMirror(...a)
  const makeSki = (...a) => G.app.minigames.makeSki(...a)
  const makeNotes = (...a) => G.app.minigames.makeNotes(...a)
  const makeFlyCatch = (...a) => G.app.minigames.makeFlyCatch(...a)
  const makeSumo = (...a) => G.app.minigames.makeSumo(...a)
  const makeCrystal = (...a) => G.app.crystal.makeCrystal(...a)
  const makePlatformer = (...a) => G.app.minigames.makePlatformer(...a)
  const makeChargeShooter = (...a) => G.app.minigames.makeChargeShooter(...a)
  const makeBlocks = (...a) => G.app.minigames.makeBlocks(...a)
  const makeRunner = (...a) => G.app.minigames.makeRunner(...a)
  const makeSlidePuzzle = (...a) => G.app.minigames.makeSlidePuzzle(...a)

  // ==================== 副本（M4-1，官方系统）====================
  //
  // 官方依据（原文汇总见 docs/官方资料库.md 第十二章）：
  //   · **只有组队才能进入副本**；副本是从**特定 NPC 传送**进去的
  //     （原文举例：迷失里的**拉鲁**把队伍传送到金字塔）
  //   · 骨架：小游戏/解谜关卡 → 战斗 → BOSS → 翻牌/掉落
  //   · **硬规则**：「完成副本冒险可以收获到只有在副本里才能获得的**魅力**属性」
  //   · 常规奖励：金币、彩晶石、晶石碎片、**魅力值**、勇气
  // 单机版取舍（derived，已登记 deviations V33）：
  //   · 没有真人组队 → 单人进入；两个 PVP 副本（大陆棋/晶石对战）改为对 AI
  //   · 关卡里的小游戏做成**记忆力复现**（对应原文的"记忆力/拼图/机关"这类解谜关）
  const DUNGEON_STAGE_NAMES = { memory: '记忆水晶', slide: '魔法工匠', blocks: '思维方块', runner: '多比快跑', platformer: '拯救多比古书', chargeshooter: '王牌大空战', ski: '滑雪跳台', notes: '魔幻音符', flycatch: '飞翔的衣服', catch: '哈里的金币', soar: '冲上云霄', ballpush: '极限顶顶球', mirror: '魔镜世界', sumo: '大陆棋', stealth: '潜行', morale: '士气', current: '激流', quiz: '考试', pipe: '管线', shooter: '空战', battle: '战斗', boss: 'BOSS', flip: '翻牌' }

  // 列表类面板的「页脚安全线」：**列表必须在这一行之前结束**，页脚从这里往下排。
  // 教训（连踩三次）：副本列表、珍宝小屋、唤醒列表都出现过"最后一行压住页脚文字"。
  // 之前每处各写各的行高，所以每加一批数据就会再犯一次。现在统一用这条线来定行高。
  const LIST_FOOTER_TOP = H - 74

  function dungeonState() {
    if (!S.dungeon) S.dungeon = { id: null, idx: 0, phase: 'list', log: [], flip: null, seq: null, result: null }
    return S.dungeon
  }
  function dungeonClears(id) { return (save.data.dungeonClears || {})[id] || 0 }

// 场景总数（第 62 轮）：**不写死**。原来 UI 里写的是 /88，加了 5 个官方场景后会显示
// "已探索 93/88" 这种自相矛盾的数字。改成从 S.scenes 实时取。
function SCENE_TOTAL() { return (S.scenes && Object.keys(S.scenes).length) || 88 }

  function enterDungeon(id) {
    const d = D.dungeonById(id)
    if (!d) { toast('没有这个副本'); return false }
    if (!d.stages.length) { notice(`${d.name}：玩法资料缺失（原文里查不到），按 R1 不编造`); return false }
    if (d.minLevel && (save.data.level || 1) < d.minLevel) {
      notice(`${d.name} 建议 ${d.minLevel} 级（原文），你现在 ${save.data.level} 级 —— 仍可进入，但会很吃力`)
    }
    const st = dungeonState()
    st.id = id; st.idx = 0; st.phase = 'stage'; st.log = []; st.flip = null; st.result = null
    S.mode = 'dungeon'
    audio.sfx('assets/sfx/onClick_03.mp3')
    startDungeonStage()
    return true
  }

  function curStage() {
    const st = dungeonState()
    const d = D.dungeonById(st.id)
    return d ? d.stages[st.idx] || null : null
  }

  // 开始当前关卡（不同 kind 走不同阶段）
  function startDungeonStage() {
    const st = dungeonState()
    const d = D.dungeonById(st.id)
    const s = curStage()
    st.flip = null; st.seq = null; st.result = null; st.st = null; st.mo = null
    // 【第 43 轮】把**每个小游戏自己的状态一并清掉**：以前只清 flip/seq/st/mo，
    // 于是玩过「思维方块」之后 st.bl 一直留着，进下一个关卡时还在（测试里表现为
    // "所有关卡的过关要求都读成了思维方块的 3"）。这类"上一关的残留"很容易造成串味 bug。
    st.bl = null; st.rn = null; st.pf = null; st.cs = null; st.nt = null; st.ski = null
    st.quiz = null; st.pipe = null; st.sh = null; st.fc = null; st.su = null
    st.cc = null; st.sr = null; st.bp = null; st.mr = null      // 第 47/48 轮新增的 4 个
    if (!s) { finishDungeon(true); return }
    if (s.kind === 'soar') {
      // 「冲上云霄」（7k7k/551114）：踩泡泡往上跳，大雁会动、踩不住；分数目标 50000 是官方原话
      st.sr = makeSoar()
      st.phase = 'soar'
    } else if (s.kind === 'ballpush') {
      // 「极限顶顶球」（归档截图规则 + 7k7k/660779）：左右移动 + 上键跳，把球顶进对方瓶子
      st.bp = makeBallPush()
      st.phase = 'ballpush'
    } else if (s.kind === 'catch') {
      // 「哈里的金币」（7k7k/660617）：金币下落，控制箱子去接；后面关越来越快
      st.cc = makeCoinCatch()
      st.phase = 'catch'
    } else if (s.kind === 'soar') {
      // 「冲上云霄」（7k7k/551114）：踩泡泡往上跳（分数目标 50000 是官方原话）
      st.sr = makeSoar()
      st.phase = 'soar'
    } else if (s.kind === 'ballpush') {
      // 「极限顶顶球」（归档截图规则 + 7k7k/660779）：左右移动 + 上键跳，把球顶进对方瓶子
      st.bp = makeBallPush()
      st.phase = 'ballpush'
    } else if (s.kind === 'mirror') {
      // 「魔镜世界」（7k7k/660928）：躲怪物 + 开箱子 + 找钥匙，方向被镜像
      st.mr = makeMirror()
      st.phase = 'mirror'
    } else if (s.kind === 'ski') {
      // 「滑雪跳台」：三个阶段都来自官方原话（平衡 → 起跳时机 → 进圈按键）
      st.ski = makeSki()
      st.phase = 'ski'
    } else if (s.kind === 'notes') {
      // 「魔幻音符」：左右键移动手指、下键弹奏
      st.nt = makeNotes()
      st.phase = 'notes'
    } else if (s.kind === 'flycatch') {
      // 「飞翔的衣服」：纯鼠标 —— 衣服满天飞，用网子抓（官方攻略 7k7k/534823）
      st.fc = makeFlyCatch()
      st.phase = 'flycatch'
    } else if (s.kind === 'sumo') {
      // 「大陆棋」：弹弓物理对战（官方攻略 558658/558684/558700，规则见 game/tables/sumo.js）
      st.su = makeSumo()
      st.phase = 'sumo'
    } else if (s.kind === 'crystal') {
      // 「晶石对战」：三消攒能量 + 多比自动出手 + 5v5（官方攻略 563849/545865，规则见 game/tables/crystal.js）
      st.cr = makeCrystal()
      st.phase = 'crystal'
    } else if (s.kind === 'platformer') {
      // 「拯救多比古书」：官方规则只有「方向键控制人物移动、跳跃」（V57 登记其余为 derived）
      st.pf = makePlatformer()
      st.phase = 'platformer'
    } else if (s.kind === 'chargeshooter') {
      // 「王牌大空战」：官方规则给了操作（方向键四向移动、Z 射击、按住 Z 蓄力松开）
      st.cs = makeChargeShooter()
      st.phase = 'chargeshooter'
    } else if (s.kind === 'blocks') {
      // 「思维方块」（官方截图规则）：四个以上相同的方块就可以消除；
      // 方向键控制提示框、空格键转动方向。盘面大小/颜色数/下落速度为 derived（V54）。
      st.bl = makeBlocks()
      st.phase = 'blocks'
    } else if (s.kind === 'runner') {
      // 「多比快跑」（官方截图规则）：连续按方向键奔跑和加速、空格跳跃、躲开石头与水塘、捡宝石。
      st.rn = makeRunner()
      st.phase = 'runner'
    } else if (s.kind === 'memory') {
      // 记忆力：先亮出一串方向，玩家照着重放（对应原文的"记忆力/机关/拼图"关卡）
      const dirs = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
      const n = util.clamp(s.seq || 4, 3, 6)
      const seq = []
      for (let i = 0; i < n; i++) seq.push(dirs[Math.floor(Math.random() * 4)])
      st.seq = { show: seq, input: [], showing: true, t: 0 }
      st.phase = 'memory'
    } else if (s.kind === 'stealth') {
      // 「无所遁形」（火烧赤壁，7k7k/115197 原文）：
      //   「在甲板上与敌人玩捉迷藏，与敌人要保持一定的距离，不要让敌人发现，
      //     掌握好敌人的速度，尽量在和敌人背对的时候行动」
      // 落地：一条甲板走道，守卫来回巡逻并有朝向；玩家按空格前进一格，
      // 若在守卫**面朝你且距离过近**时前进 → 被发现，本关重来。
      st.st = { steps: 6, pos: 0, guards: [], t: 0, caught: 0, spotted: 0 }
      const n = util.clamp(s.guards || 2, 1, 3)
      for (let i = 0; i < n; i++) {
        st.st.guards.push({ phase: (i + 1) * 1.7, speed: 1.1 + i * 0.25, x: 0.5, facing: 1 })
      }
      st.phase = 'stealth'
    } else if (s.kind === 'morale') {
      // 「士气对抗」（噜噜王的终结，7k7k/115968 原文）：
      //   「每个队伍进入噜噜王副本中会出现两个数值！一个是玩家队伍的士气值，一个是噜噜王的…」
      // ⚠️ 原文**只说了有两个数值**，没说怎么增减 —— 具体规则由本项目自定（derived，见 V37）。
      st.mo = { mine: 0, foe: 0, target: 100, turn: 0, sel: 0, last: null, done: null }
      st.phase = 'morale'
    } else if (s.kind === 'current') {
      // 「激流勇进」（大禹治水，7k7k/115195 原文）：
      //   「站在最后面未必是安全的，站在一个合适的位置并且能够留给自己足够的反应时间才是最重要的！
      //     另外大家最好站在一起，如果队友不小心…」
      // 落地：三条航道，湍流随机冲其中一条，玩家要在反应时间内换到别的航道。
      // ⚠️ 原文的"最后面未必安全"在我们的三条航道里体现为**每条航道被冲的概率相同**
      //    （即不存在安全位）；"大家站在一起"是多人协作，单机版没有 → 记 derived（V45）。
      st.st = { lanes: 3, lane: 1, wave: -1, t: 0, window: 1.2, hits: 0, pass: s.rounds || 3, done: 0, flash: 0 }
      st.phase = 'current'
    } else if (s.kind === 'slide') {
      // 「魔法工匠」（官方小游戏）：3×3 滑动宝石，完成合成公式
      st.slide = makeSlidePuzzle()
      st.phase = 'slide'
    } else if (s.kind === 'pipe') {
      // 「连接能量管线」（战神金刚）：旋转管件，把入水口与出水口连成一条通路
      st.pipe = makePipePuzzle()
      st.phase = 'pipe'
    } else if (s.kind === 'shooter') {
      // 「驾驶超级战机」（太空堡垒）：**纯鼠标**打靶（原文特意点明"不是方向键控制"）
      st.sh = makeShooter(s)
      st.phase = 'shooter'
    } else if (s.kind === 'quiz') {
      // 「玛丽娜的考试」（武当保卫战，7k7k/508282 原文：「玛丽娜要考考各位小多克」）
      // 题目与答案取自本项目已核实的官方资料，每题的出处会显示在界面上。
      st.quiz = { list: D.pickQuiz(3), idx: 0, sel: 0, right: 0, need: s.need || 2, picked: -1, t: 0 }
      st.phase = 'quiz'
    } else if (s.kind === 'battle' || s.kind === 'boss') {
      const mon = D.monster(s.mon)   // 按 id 取怪（D.MONSTERS 是数组，不能当字典用）
      if (!mon) { notice(`关卡「${s.label}」引用的怪物 ${s.mon} 不存在，跳过`); st.idx++; startDungeonStage(); return }
      st.phase = 'battle'
      const lv = s.lv || Math.max(1, save.data.level || 1)
      startBattle({ mon, level: lv, stats: D.monsterAtLevel(mon, lv), dungeon: true })
    } else {
      st.idx++; startDungeonStage()
    }
  }

  // ---- 「无所遁形」：守卫来回巡逻，玩家趁其背对时前进 ----
  function stealthTick(dt) {
    const st = dungeonState()
    if (!st.st) return
    st.st.t += dt
    for (const g of st.st.guards) {
      // 位置用正弦来回摆动：x ∈ [0.15, 0.85]
      const nx = 0.5 + 0.35 * Math.sin(st.st.t * g.speed + g.phase)
      // 由运动方向推出朝向（+1 表示往右走，脸朝右）
      g.facing = nx > g.x ? 1 : -1
      g.x = nx
    }
  }
  // 守卫是否正看着玩家（面朝玩家且在警戒范围内）
  function stealthSpotted() {
    const st = dungeonState()
    if (!st.st) return false
    const px = 0.08 + (st.st.pos / st.st.steps) * 0.84
    for (const g of st.st.guards) {
      const dx = g.x - px
      const toward = (dx > 0 && g.facing < 0) || (dx < 0 && g.facing > 0)
      if (toward && Math.abs(dx) < 0.20) return true
    }
    return false
  }
  function stealthAdvance() {
    const st = dungeonState()
    if (!st.st) return
    if (stealthSpotted()) {
      st.st.caught++
      st.st.pos = 0
      notice('被发现了！退回起点重来（原文：不要让敌人发现）')
      return
    }
    st.st.pos++
    if (st.st.pos >= st.st.steps) {
      notice('潜行通过')
      miniStagePass()
    }
  }

  // ---- 「士气对抗」：双方士气先到 100 者胜 ----
  // 3×3 收益表 MORALE_MOVES / MORALE_TABLE 已迁到 `game/domain/dungeon-rules.js`
  // （第 72 轮批次 2），见顶部解构 shim。
  function moralePlay(sel) {
    const st = dungeonState()
    if (!st.mo || st.mo.done) return
    const foe = Math.floor(Math.random() * 3)
    const [dm, df] = MORALE_TABLE[sel][foe]
    st.mo.mine += dm; st.mo.foe += df
    st.mo.turn++
    st.mo.last = `我方${MORALE_MOVES[sel]}　噜噜王${MORALE_MOVES[foe]}　士气 +${dm} / 对方 +${df}`
    if (st.mo.mine >= st.mo.target) st.mo.done = 'win'
    else if (st.mo.foe >= st.mo.target) st.mo.done = 'lose'
    if (st.mo.done === 'win') {
      notice('士气压过噜噜王！')
      miniStagePass()
    } else if (st.mo.done === 'lose') {
      // 停在失败状态，等玩家按空格再重来（早先是判负即重置，导致"被打垮了"根本看不见）
      notice('士气被打垮了…按空格再来一次')
    }
  }
  function moraleReset() {
    const st = dungeonState()
    st.mo = { mine: 0, foe: 0, target: 100, turn: 0, sel: 0, last: null, done: null }
  }

  // 战斗结束回到副本：推进到下一关
  function dungeonAfterBattle(win) {
    const st = dungeonState()
    if (!st.id || st.phase !== 'battle') return
    const s = curStage()
    st.log.push(`${win ? '通过' : '失败'}　${s ? s.label : ''}`)
    if (!win) { st.phase = 'fail'; return }
    st.idx++
    if (st.idx >= (D.dungeonById(st.id) || { stages: [] }).stages.length) { st.phase = 'flip'; makeFlip(); return }
    st.phase = 'stage'
    startDungeonStage()
  }

  // 翻牌：4 张选 1（原文：武当保卫战「奖励靠翻牌」、凤凰考验「通关翻牌有几率」）
  function makeFlip() {
    const st = dungeonState()
    const d = D.dungeonById(st.id)
    const faces = ['金币', '彩晶石', '晶石碎片', '技能书']
    // 打乱
    for (let i = faces.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = faces[i]; faces[i] = faces[j]; faces[j] = t }
    st.flip = { faces, picked: -1, reward: null, dungeon: d.name }
  }
  function pickFlip(i) {
    const st = dungeonState()
    if (!st.flip || st.flip.picked >= 0) return
    st.flip.picked = i
    const face = st.flip.faces[i]
    const R = D.DUNGEON_COMMON_REWARD
    let gain = { gold: R.gold, crystal: R.crystal }
    if (face === '金币') gain.gold += 300
    else if (face === '彩晶石') gain.crystal += 40
    else if (face === '晶石碎片') gain.crystal += 15
    else gain.gold += 150
    st.flip.reward = gain
    save.data.gold += gain.gold
    save.data.crystal = (save.data.crystal || 0) + gain.crystal   // 彩晶石落账（真实货币字段）
    // 彩晶石/碎片先作为道具记进背包（原版是独立货币，这里并入道具表）
    grantAttr({ charm: R.charm, brave: R.brave })   // ★ 魅力只能从副本获得（官方硬规则）
    save.persist()
    audio.sfx('assets/sfx/onClick_03.mp3')
  }

  // 副本结算：记通关次数、给常规奖励
  function finishDungeon() {
    const st = dungeonState()
    const d = D.dungeonById(st.id)
    const R = D.DUNGEON_COMMON_REWARD
    const first = dungeonClears(st.id) === 0
    save.data.dungeonClears = save.data.dungeonClears || {}
    save.data.dungeonClears[st.id] = dungeonClears(st.id) + 1
    // 魅力在翻牌时已给；这里给首通额外奖励
    if (first) { save.data.gold += 200; grantAttr({ fame: 2 }) }
    // 【第 45 轮】虚空水晶的官方来源之一：**副本「噜噜王的终结」掉落**
    //（7k7k/530436：「虚空水晶获得方式：…圣多克专属副本噜噜王的终结掉落…」）
    // 掉几个官方没给 → derived（写在 game/tables/costumes.js 的 D.VOID_CRYSTAL.luluDrop）
    let voidGot = 0
    if (st.id === 'luluwang' && D.VOID_CRYSTAL) {
      voidGot = D.VOID_CRYSTAL.luluDrop
      save.data.voidCrystal = (save.data.voidCrystal || 0) + voidGot
    }
    // 【第 52 轮】副本 BOSS 首通**必掉**一只限定形态。
    // 为什么要有：官方把 48 只形态归为"限定形态（活动/掉落）"，而单机版没有运营活动 ——
    // 不给替代途径的话这 48 只永远是死的（用户直接问"这个咋唤醒？活动在哪？"）。
    // 取"掉落"那一半做成单机版落地：一副本一只、主题相符、**首通必掉**（不是概率）。
    // 概率掉落没法写确定性断言，而且玩家不知道该刷哪儿。全部 derived（登记 V72）。
    let formGot = null
    if (first && D.DUNGEON_FORM_DROP) {
      // 走唯一发放入口 grantForm() —— 没有立绘的形态在这里被挡下
      const g = grantForm(D.DUNGEON_FORM_DROP[st.id])
      if (g.ok) formGot = g.form.name
    }
    save.persist()
    st.phase = 'done'
    st.result = { first, clears: dungeonClears(st.id), name: d ? d.name : '', voidGot, formGot }
    return true
  }

  // 角色属性（非战斗的那几项）累加
  const ATTR_NAMES = { wisdom: '智慧', brave: '勇气', love: '爱心', charm: '魅力', fame: '声望' }
  function grantAttr(delta) {
    const a = save.data.attrs || (save.data.attrs = { wisdom: 0, brave: 0, love: 0, charm: 0, fame: 0 })
    const got = []
    for (const k of Object.keys(delta)) {
      if (!delta[k]) continue
      a[k] = (a[k] || 0) + delta[k]
      got.push(`${ATTR_NAMES[k]} +${delta[k]}`)
    }
    if (got.length) notice('获得 ' + got.join('　'))
    return got
  }

  G.app = G.app || {}
  G.app.dungeon = {
    DUNGEON_STAGE_NAMES, LIST_FOOTER_TOP,
    dungeonState, dungeonClears, SCENE_TOTAL, enterDungeon, curStage, startDungeonStage,
    stealthTick, stealthSpotted, stealthAdvance, moralePlay, moraleReset,
    dungeonAfterBattle, makeFlip, pickFlip, finishDungeon,
    ATTR_NAMES, grantAttr,
  }
})()