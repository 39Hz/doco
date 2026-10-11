// 战斗界面遮挡检测：让游戏把每个 UI 元素的矩形登记下来，
// 然后计算两两重叠。比肉眼看截图可靠。
//
// 做法：给 canvas 2D 上下文包一层记录器，拦截 fillRect/strokeRect/fillText/strokeText，
// 同时拦截 drawImage 记录精灵的绘制范围。游戏不需要知道这个包装。
//
// 用法: node ui-overlap.mjs <项目根>
import { T } from './game-harness.mjs'

const ROOT = process.argv[2] || '.'
const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

// ---------- 给 2D 上下文装记录器 ----------
const cvs = t.canvas
const ctx = cvs.getContext('2d')
const boxes = []
const texts = []          // 文字占位（用于"按钮压住文字"检查）
let seq = 0               // 绘制顺序
let cur = null
function push(kind, x, y, w, h, label, alpha) {
  if (!(w > 0) || !(h > 0)) return
  if (x < 0 || y < 0 || x > 960 || y > 560) return
  boxes.push({ kind, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), label, seq: seq++, alpha })
}
// 从 fillStyle 估不透明度：'#rrggbb' / 'rgb(...)' 视为 1，'rgba(...,a)' 取 a。
// 渐变对象（createLinearGradient 的返回值）没有 alpha 概念，按 1 处理。
function alphaOf(style) {
  if (typeof style !== 'string') return 1
  const m = style.match(/rgba?\(([^)]+)\)/)
  if (!m) return 1
  const parts = m[1].split(',').map((s) => parseFloat(s))
  return parts.length >= 4 ? parts[3] : 1
}
// fillRect / strokeRect
for (const m of ['fillRect', 'strokeRect']) {
  const orig = ctx[m].bind(ctx)
  ctx[m] = (...a) => {
    push(m === 'fillRect' ? 'rect' : 'rectLine', a[0], a[1], a[2], a[3], null,
      m === 'fillRect' ? alphaOf(ctx.fillStyle) : 1)
    return orig(...a)
  }
}
// fillText / strokeText：用字体大小估一个框
for (const m of ['fillText', 'strokeText']) {
  const orig = ctx[m].bind(ctx)
  ctx[m] = (s, x, y, ...rest) => {
    const size = parseFloat((ctx.font || '16px').match(/(\d+(\.\d+)?)px/)?.[1] || 16)
    // 宽度**实测**而不是估算：早先用 len*size*0.95 估，长句估出 524px（判为没越界），
    // 而实际渲染约 875px 已经跑出画面。ctx.font 在 stroked() 里已经设好，这里能直接量。
    let w = String(s).length * size * 0.95
    try {
      if (typeof ctx.measureText === 'function') {
        const m = ctx.measureText(String(s))
        if (m && m.width > 0) w = m.width
      }
    } catch { /* 量不了就退回估算 */ }
    const align = ctx.textAlign || 'left'
    const bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
    // 记录为文本占位（既关心和图形块的重叠，也关心被按钮压住）
    const box = { kind: 'text', text: String(s), x: bx, y: y - size * 0.8, w, h: size * 1.15, seq: seq++, align }
    cur = box
    texts.push(box)
    return orig(s, x, y, ...rest)
  }
}
const origDrawImage = ctx.drawImage.bind(ctx)
ctx.drawImage = (img, ...a) => {
  if (a.length >= 4) push('sprite', a[0], a[1], a[2], a[3])
  return origDrawImage(img, ...a)
}

// ---------- 帧边界与逐帧快照 ----------
// 渲染循环每帧开头都会 ctx.clearRect(0,0,W,H)（见 game.js 主循环）。
// 旧版把**所有帧**的图元堆在同一个数组里比较 → "战斗 HUD 的矩形"会和"探索帧里的文字"
// 被判成互相遮挡（实测 120 处里大半是这种跨帧误报）；
// 而只看最后一帧又会漏掉探索帧里的顶栏按钮压字（反面用例验证时发现的）。
// 所以：**逐帧快照、逐帧检查**。
const frames = []
let frameTag = 'first'
ctx.__setFrameTag = (s) => { frameTag = s }
const origClearRect = ctx.clearRect.bind(ctx)
ctx.clearRect = (...a) => {
  // 给每帧打上**当时的游戏模式**标签，便于只检查真正的游玩画面
  try {
    const st = t.get('window').__DKDbb_DEBUG__
    if (st && st.state) frameTag = st.state.mode
  } catch { /* 状态还没建好，沿用上一次的标签 */ }
  if (boxes.length > 4) frames.push({ boxes: boxes.slice(), texts: texts.slice(), tag: frameTag })
  boxes.length = 0
  texts.length = 0
  return origClearRect(...a)
}

// ---------- 进入战斗 ----------
// 【2026-09-26 修正】原版流程是「标题按空格 → 点岛 → 点怪物」，
// 但点击岛屿进的是**地点列表(places)**，不是场景，所以那套流程永远进不了战斗
// （表现就是"未进入战斗"直接退出）。这里改成走完整流程：
//   大地图 → 选岛 → 空格进地点列表 → 选地点 → 空格进场景(explore) → 点怪物
const DBG = () => t.get('window').__DKDbb_DEBUG__
const S = () => DBG().state
const VW = 960, VH = 560
const world = t.get('__world')
let started = false
outer:
for (const island of world.islands) {
  for (const sid of island.scenes) {
    S().mode = 'worldmap'; t.step(1)
    S().mapSel = world.islands.indexOf(island); S().placeSel = 0; t.step(1)
    t.key(' '); t.step(3)
    if (S().mode !== 'places') continue
    S().placeSel = island.scenes.indexOf(sid); S().placePage = 0; t.step(1)
    t.key(' '); t.step(4)
    if (S().mode !== 'explore') continue
    const sp = DBG().spawns
    if (!sp || !sp.monsters.length) continue
    const mon = sp.monsters[0]
    t.move(mon.x, mon.y - 20); t.step(1); t.click(mon.x, mon.y - 20)
    for (let k = 0; k < 200; k++) { t.step(1); if (S().mode === 'battle') { started = true; break outer } }
  }
}
if (!started) { console.log('未进入战斗'); process.exit(1) }
console.log(`进入战斗 vs ${S().battle.enemies[0].name}，阶段 ${S().battle.phase}`)

// ---------- 巡检各个面板 ----------
// 【为什么必须巡检】原先只走"进战斗"这一条路，于是**新加的战报/副本界面从来没被检查过** ——
// 副本列表底部那句说明跑出画面右边界，就是这么漏掉的。这里把每个面板都打开一帧。
{
  const tour = [
    ['zukan', () => { S().mode = 'explore'; t.step(1); t.key('l') }],
    ['warreport', () => { S().mode = 'explore'; t.step(1); t.key('z') }],
    ['dungeon-list', () => { S().mode = 'explore'; t.step(1); t.key('i') }],
    ['dungeon-flip', () => {
      S().mode = 'explore'; t.step(1)
      DBG().enterDungeon('jinzita')
      const st = DBG().dungeonState()
      st.idx = (t.get('window').DKDbbData.dungeonById('jinzita').stages || []).length
      st.phase = 'flip'
      st.flip = { faces: ['金币', '彩晶石', '晶石碎片', '技能书'], picked: -1, reward: null, dungeon: '金字塔' }
    }],
    ['dungeon-stealth', () => {
      S().mode = 'explore'; t.step(1)
      DBG().enterDungeon('huoshaochibi')
      for (let i = 0; i < 20; i++) { DBG().stealthTick(1 / 60); t.step(1) }
    }],
    ['dungeon-morale', () => {
      S().mode = 'explore'; t.step(1)
      DBG().enterDungeon('luluwang')
      DBG().moralePlay(0); DBG().moralePlay(1)
    }],
    ['treasure-make', () => { S().mode = 'explore'; t.step(1); t.key('j'); DBG().setTreasureTab(0) }],
    ['treasure-buy', () => { S().mode = 'explore'; t.step(1); t.key('j'); DBG().setTreasureTab(1) }],
    ['dungeon-current', () => {
      S().mode = 'explore'; t.step(1)
      DBG().enterDungeon('dayuzhishui')
      for (let i = 0; i < 40; i++) { DBG().currentTick(1 / 60); t.step(1) }
    }],
    ['dungeon-quiz', () => { S().mode = 'explore'; t.step(1); DBG().enterDungeon('wudangbaoweizhan') }],
    ['dungeon-pipe', () => { S().mode = 'explore'; t.step(1); DBG().enterDungeon('zhanshenjingang') }],
    ['dungeon-shooter', () => {
      S().mode = 'explore'; t.step(1)
      DBG().enterDungeon('taikongbaolei')
      const st = DBG().dungeonState()
      st.idx = 1; st.phase = 'stage'
      const s2 = t.get('window').DKDbbData.dungeonById('taikongbaolei').stages[1]
      st.sh = { need: s2.need || 5, hit: 0, miss: 0, maxMiss: 4, targets: [], t: 0, spawnT: 0.01, done: false, flash: 0 }
      st.phase = 'shooter'
      // 太空堡垒第一关是战斗，enterDungeon 已把 S.mode 切成 battle → 显式切回
      S().battle = null
      S().mode = 'dungeon'
      for (let i = 0; i < 60; i++) { DBG().shooterTick(1 / 60); t.step(1) }
    }],
    ['awaken', () => { S().mode = 'explore'; t.step(1); t.key('h') }],
    ['minigames', () => { S().mode = 'explore'; t.step(1); t.key('y') }],
    ['minigame-slide', () => { S().mode = 'explore'; t.step(1); DBG().startMinigame('magicArtisan') }],
    ['minigame-memory', () => { S().mode = 'explore'; t.step(1); DBG().startMinigame('memoryCrystal') }],
    ['minigame-blocks', () => {
      S().mode = 'explore'; t.step(1); DBG().startMinigame('thinkBlocks')
      // 让盘面有点内容，顺带看"提示框 + 已落下的方块"的观感
      const b = DBG().dungeonState().bl
      for (let r = b.rows - 3; r < b.rows; r++) for (let c = 0; c < b.cols; c++) b.grid[r][c] = (r + c) % b.kinds
    }],
    ['minigame-runner', () => {
      S().mode = 'explore'; t.step(1); DBG().startMinigame('dobiRun')
      for (let i = 0; i < 40; i++) { DBG().runnerPress(); DBG().runnerTick(1 / 60) }
    }],
    ['minigame-platformer', () => {
      S().mode = 'explore'; t.step(1); DBG().startMinigame('saveBook')
      // 摆一个"正在救书"的画面（有书、有火精灵、有提示语）
      const p = DBG().dungeonState().pf
      p.got = 2; p.msg = '救起一本古书（2/5）'; p.msgT = 1
    }],
    ['minigame-ski', () => {
      S().mode = 'explore'; t.step(1); DBG().startMinigame('skiJump')
      const s = DBG().dungeonState().ski
      s.phase = 'takeoff'; s.pointer = 0.80   // 拍"起跳判定"这一屏（有黄/红区与指针）
    }],
    ['minigame-notes', () => {
      S().mode = 'explore'; t.step(1); DBG().startMinigame('magicNote')
      const n = DBG().dungeonState().nt
      n.t = n.list[2].at; n.hits = 3; n.combo = 3; n.bestCombo = 3
      n.msg = '命中！3 连击'; n.msgT = 1
    }],
    ['minigame-chargeshooter', () => {
      S().mode = 'explore'; t.step(1); DBG().startMinigame('aceDogfight')
      // 摆一个"正在蓄力 + 有敌机 + 有子弹"的画面
      const g = DBG().dungeonState().cs
      g.charging = true; g.charge = g.holdSec; g.killed = 3; g.miss = 1
      for (let i = 0; i < 3; i++) DBG().spawnFoe({ x: 200 + i * 220, y: 180 + i * 60, hp: 1, r: 15 })
      g.shots.push({ x: g.x, y: g.y - 60, r: 16, powered: true, vy: -520, pierce: 3 })
    }],
    // 结算画面：直接把状态摆到 miniDone（版式检查用，不依赖真的解完谜题）
    ['minigame-done', () => {
      S().mode = 'explore'; t.step(1); DBG().startMinigame('magicArtisan')
      const st = DBG().dungeonState()
      st.miniResult = { name: '魔法工匠', id: 'magicArtisan', got: ['金币 +140', '彩晶石 +30', '智慧 +2　勇气 +1　声望 +1'] }
      st.phase = 'miniDone'
    }],
    ['bag', () => { S().mode = 'explore'; t.step(1); t.key('b') }],
    ['stats', () => { S().mode = 'explore'; t.step(1); t.key('c') }],
    ['shop', () => { S().mode = 'explore'; t.step(1); t.key('g') }],
  ]
  const seen = []
  for (const [name, go] of tour) {
    try { go(); t.step(3); seen.push(`${name}=${S().mode}`) } catch (e) { seen.push(`${name}!${e.message}`) }
  }
  console.log('  面板巡检：' + seen.join('  '))
  S().mode = 'explore'; t.step(2)
}

// ---------- 逐帧快照（frames 在文件上方 clearRect 钩子里收集）----------
console.log(`\n共快照 ${frames.length} 帧`)

function overlap(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return x * y
}
const isBackdrop = (b) => b.w >= 940 && b.h >= 500
const isBanner = (b) => b.w >= 940

// 白名单：这些是**原版就这么画的**，不是遮挡问题。加白名单必须写明理由（R3）。
const ALLOW_COVER = [
  {
    rect: [16, 16, 46, 46], sprite: [16, 16, 46, 46],
    why: '左上角队伍卡头像：深色底板 fillRect 与头像 drawImage 本来就同框（原版画法）',
  },
]
const ALLOW_TEXT_COVER = []
const seen = new Set()
const found = { panel: 0, sprite: 0, text: 0, bounds: 0 }
let allowedCover = 0, framesChecked = 0, skipped = 0, toastAllowed = 0
const SKIP_MODES = new Set(['loading', 'title', 'pick'])

for (let fi = 0; fi < frames.length; fi++) {
  const fr = frames[fi]
  const boxes = fr.boxes, texts = fr.texts
  if (boxes.length < 4) continue
  // 过场画面（加载/标题/开场选形态）不做遮挡检查：那里的"进度说明叠在卡片上"是
  // 有意的层叠设计，而且只存在不到 1 秒；盯它只会制造噪声，掩盖真正的遮挡。
  if (SKIP_MODES.has(fr.tag)) { skipped++; continue }
  framesChecked++
  const tag = fr.tag
  const solid = boxes.filter((b) => b.kind === 'rect' && b.w > 40 && b.h > 20 && !isBackdrop(b))
  // 画在 (0,0) 的精灵是整屏底图（不是角色），不参与"被面板盖住"的判定
  const sprites = boxes.filter((b) => b.kind === 'sprite' && !(b.x <= 2 && b.y <= 2))
  const dedup = (key) => { if (seen.has(key)) return false; seen.add(key); return true }

  // 本帧"全屏压暗层"的位置（模态面板与背景的分界）
  const lastDimSeq = boxes.filter((b) => isBackdrop(b) && b.kind === 'rect')
    .reduce((a, b) => Math.max(a, b.seq), -1)

  // --- 面板互相遮挡 ---
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const A = solid[i], B = solid[j]
      if (isBanner(A) || isBanner(B)) continue
      if (A.h < 8 || B.h < 8) continue
      const ovAB = overlap(A, B)
      if (ovAB <= 400) continue
      // 一方完全包含另一方（卡片背景包着内容 / 列表行里放按钮）属**故意嵌套**，放行；
      // 只有"部分重叠"才是真的互相遮挡。
      const areaA = A.w * A.h, areaB = B.w * B.h
      if (ovAB >= Math.min(areaA, areaB) * 0.92) continue
      // 「小矩形水平居中叠在大矩形上」= 面板上的居中标签/标题（世界地图详情条、地点卡片标题），
      // 是有意的层叠设计。容差 20px，且交叠要过半，避免把真正的错位遮挡放过去。
      {
        const small = areaA <= areaB ? A : B, big = areaA <= areaB ? B : A
        // 小元素**画在大元素之后** = 浮层/悬停提示/标签（地点列表的"前往…需经…"提示就是这样），
        // 浮层本来就该盖住内容。真正要抓的是"大面板盖住了先前画好的东西"。
        if (small.seq > big.seq) continue
        // 跨模态层：小的画在压暗层之后、大的画在压暗层之前 → 一个是模态内容、一个是背景，不算遮挡
        // 跨模态层（无论谁大谁小）：一个在模态上、一个在背景里，不算互相遮挡
        if ((small.seq < lastDimSeq) !== (big.seq < lastDimSeq)) continue
        const smallCx = small.x + small.w / 2
        const centered = smallCx >= big.x - 20 && smallCx <= big.x + big.w + 20
        const smallArea = small.w * small.h
        if (centered && ovAB >= smallArea * 0.5) continue
      }
      {
        if (!dedup(`p|${A.x},${A.y}|${B.x},${B.y}`)) continue
        console.log(`  ✗ [${tag}] 面板 ${A.w}x${A.h}@(${A.x},${A.y}) 与 ${B.w}x${B.h}@(${B.x},${B.y}) 重叠`)
        found.panel++
      }
    }
  }
  // --- 面板盖住精灵 ---
  // 先找出本帧「全屏压暗层」的位置：画在它之前的精灵属于**被模态面板压住的背景场景**，
  // 那是有意遮挡（战报/属性/背包这些面板都是拿探索画面当底图再压一层），不算缺陷。
  for (const s of solid) {
    if (isBanner(s)) continue
    for (const sp of sprites) {
      const ov = overlap(s, sp), area = sp.w * sp.h
      if (ov <= area * 0.12) continue
      // 立绘几乎完全落在面板内 = "卡片背景 + 立绘"（选形态卡片就是这样），放行
      if (ov >= area * 0.92) { allowedCover++; continue }
      // 小浮层（提示/标签）画在精灵之后盖住一部分 = 有意的浮层，放行；
      // 真正要抓的是**大面板**把角色挡住。
      if (s.w <= 240 && s.h <= 64 && s.seq > sp.seq) { allowedCover++; continue }
      // 【第 52 轮】浮动提示（toast）**按身份**放行，不再靠宽度猜。
      // 起因：`measureText` 改成"中文按 1em"之后，toast 的底板宽度从约 180px 变成 287px，
      // 越过了上面那条 240px 的任意阈值 → 冒出 4 条"面板压住精灵"的假红。
      // toast 本来就是**有意压在内容之上**的瞬时提示（自带 92% 不透明底板 + 边框），
      // 所以这里明确认出它（y=132 / h=34 就是它的位置，见 draw() 里的 toast 绘制），
      // 而不是把阈值往上抬 —— 抬阈值会把真正的大面板一起放进来。
      if (s.seq > sp.seq && Math.abs(s.y - 132) <= 2 && Math.abs(s.h - 34) <= 2) {
        allowedCover++
        toastAllowed++
        continue
      }
      // 精灵画在全屏压暗层之前 = 模态面板背后的场景角色
      if (sp.seq < lastDimSeq) { allowedCover++; continue }
      const ok = ALLOW_COVER.some((a) =>
        a.rect[0] === s.x && a.rect[1] === s.y && a.rect[2] === s.w && a.rect[3] === s.h &&
        a.sprite[0] === sp.x && a.sprite[1] === sp.y && a.sprite[2] === sp.w && a.sprite[3] === sp.h)
      if (ok) { allowedCover++; continue }
      if (!dedup(`s|${s.x},${s.y}|${sp.x},${sp.y}`)) continue
      console.log(`  ✗ [${tag}] 面板 ${s.w}x${s.h}@(${s.x},${s.y}) 盖住精灵 ${sp.w}x${sp.h}@(${sp.x},${sp.y}) 达 ${(ov / area * 100).toFixed(0)}%`)
      found.sprite++
    }
  }
  // --- 按钮/小控件压住文字 ---
  // 「战报」按钮一开始放在 (792,12,76,30)，压住顶部快捷键提示行；旧版检查根本没把文字纳入比较。
  for (const r of solid) {
    if (r.w > 240 || r.h > 64) continue                  // 只当它是按钮/小控件
    if ((r.alpha == null ? 1 : r.alpha) < 0.6) continue   // 半透明底不算遮挡
    for (const tx of texts) {
      if (tx.w < 2 || tx.h < 2) continue
      const ov = overlap(r, tx)
      if (ov <= 0) continue
      const cov = ov / (tx.w * tx.h)
      // 提示条这类"面板 + 居中的一句话"合法
      if (tx.align === 'center' && Math.abs((tx.x + tx.w / 2) - (r.x + r.w / 2)) < r.w * 0.6) continue
      // 右对齐的长提示行：只要和小控件有交叠就算问题（真正的缺陷只有 7% 覆盖，阈值会放过它）
      const isHintRow = tx.align === 'right' && tx.w > 120
      if (!isHintRow) {
        if (cov >= 0.9) continue                          // 控件自己的标签
        if (cov <= 0.15) continue
      }
      const okT = ALLOW_TEXT_COVER.find((a) => a.text === tx.text &&
        a.rect[0] === r.x && a.rect[1] === r.y && a.rect[2] === r.w && a.rect[3] === r.h)
      if (okT) continue
      if (!dedup(`t|${r.x},${r.y},${r.w},${r.h}|${tx.text}`)) continue
      console.log(`  ✗ [${tag}] 控件 ${r.w}x${r.h}@(${r.x},${r.y}) 压住文字「${tx.text.slice(0, 18)}」达 ${(cov * 100).toFixed(0)}%`)
      found.text++
    }
  }
  // --- 越界（含文字！）---
  // 【为什么加文字】副本列表底部那句说明文字一度跑出画面右边界，而旧版只查矩形与精灵，
  // 文字压根没进比较 —— 又是一个"看着是绿的、其实漏了"的守卫缺口。
  for (const b of boxes) {
    if (isBackdrop(b) || b.kind === 'sprite') continue
    if (b.x < 0 || b.y < 0 || b.x + b.w > 966 || b.y + b.h > 566) {
      if (!dedup(`b|${b.kind}|${b.x},${b.y},${b.w},${b.h}`)) continue
      console.log(`  ✗ [${tag}] ${b.kind} (${b.x},${b.y}) ${b.w}x${b.h} 超出画面`)
      found.bounds++
    }
  }
  for (const tx of texts) {
    if (tx.w < 2 || tx.y < 0) continue
    // 居中的长句两侧都可能溢出，所以左右都要看
    if (tx.x < 4 || tx.x + tx.w > 962) {
      if (!dedup(`tb|${tx.text}`)) continue
      console.log(`  ✗ [${tag}] 文字超出画面 x=${Math.round(tx.x)}..${Math.round(tx.x + tx.w)}「${tx.text.slice(0, 24)}」`)
      found.bounds++
    }
  }
}

console.log(`\n检查了 ${framesChecked} 帧（跳过过场帧 ${skipped} 个：loading/title/pick）`)
if (toastAllowed) console.log(`  · 浮动提示（toast）放行 ${toastAllowed} 处：它本来就有意压在内容之上，自带不透明底板`)
if (allowedCover) console.log(`  · 白名单放过 ${allowedCover} 处：${ALLOW_COVER.map((a) => a.why).join('；')}`)
const total = found.panel + found.sprite + found.text + found.bounds
if (!total) console.log('  ✓ 面板 / 精灵 / 文字 / 边界 全部无遮挡')
console.log(`\n${total === 0 ? '✅' : '❌'} 问题 ${total} 处（面板 ${found.panel} / 精灵 ${found.sprite} / 压字 ${found.text} / 越界 ${found.bounds}）`)
process.exit(total === 0 ? 0 : 1)
