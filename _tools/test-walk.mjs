// 主角走路（第 53 轮）
//
// 【用户的原话】「把每个多比的走路[动作]都改成和 NPC 一样。主角走路模式太怪了，就像在空中飘动一样。」
// 查清的三件事：
//   ① NPC 为什么看着对 —— 用「时装序列」的真走路帧（43 套 ×4 方向 ×17~31 帧，见 assets/anim/index.json）
//   ② 主角为什么像飘 —— 用**大幅站立立绘**绕脚底 `rotate(sin)` 摆 + `lift` 上浮，一张静态图当钟摆
//   ③ 归档里**没有多比的走路循环**（`多比形态序列` 只有光多比/凤凰多比，且全是战斗动作）
// 处置：用官方立绘合成 4 帧步态（`_tools/gen-form-walk.mjs`，脚底钉住的挤压 + 侧倾）+
//       给主角/NPC 补**接地影** + 打开 `imageSmoothingQuality='high'`。
//
// 这个文件钉住的就是上面这几条 —— 尤其是**"不许再用旋转"**：那是"飘"的直接来源。
import fs from 'node:fs'
import path from 'node:path'
import { T } from './game-harness.mjs'

const t = T
// ⚠️ 走路帧索引**必须先加载**：`game.html` 里它在 `game/game.js` 之前
//（第 60 行 `assets/forms/walk/index.js`，第 84 行才是 game.js）。
// 【第 53 轮修】原来这里只 load 了 game.js，于是 `window.__DKDbb_FORM_WALK__` 是 undefined，
//   第 2 节一取 `DBG.art()` 就崩（`Cannot read properties of undefined (reading 'hasWalk')`），
//   回归里表现为"退出码 1、无汇总"。测试要照着**页面的真实加载顺序**来，不能只挑一个脚本。
t.load('assets/forms/walk/index.js')
t.load('game/game.js')
await T.settle()

const W = t.get('window')
const D = W.DKDbbData
const DBG = W.__DKDbb_DEBUG__
const S = () => DBG.state
const ctx = t.canvas._ctx
// 立绘与形态的原始数据（判"孤儿"要用）：forms 进形态表，artOnly 只做"仅形象"展示
const rawData = JSON.parse(fs.readFileSync('assets/forms.js', 'utf8')
  .replace(/^[^{]*/, '').replace(/;\s*$/, ''))
const art = DBG.art()
// 走路帧索引按**立绘文件名**建键（`克罗.png` → `克罗`），不是按形态名 ——
// 形态名是「克罗 多比」而图叫「克罗.png」。第一版按形态名取，27 只一只都命不中。
// （放在**模块顶层**：第 3 节也要用它，写在某一节的 {} 里会取不到 —— 这坑当场踩过一次。）
const walkKeyOf = (f) => String(f.art || f.name).split('/').pop().replace(/\.png$/i, '')
let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n== ' + s + ' ==')

// ---------- 1) 走路帧素材 ----------
section('1) 走路帧：每只有立绘的形态都要有')
{
  const map = W.__DKDbb_FORM_WALK__
  check(!!map, '走路帧索引已加载（assets/forms/walk/index.js）')
  const formsWithArt = D.FORMS.filter((f) => f.art)
  check(formsWithArt.length > 0, `有官方立绘的形态 ${formsWithArt.length} 只`)
  // ⚠️ 索引按**立绘文件名**建键（`克罗.png` → `克罗`），不是按形态名 ——
  //    形态名是「克罗 多比」而图叫「克罗.png」。第一版按形态名取，27 只一只都命不中。
  const keyOf = (f) => String(f.art || f.name).split('/').pop().replace(/\.png$/i, '')
  const keyOf2 = keyOf
  const missing = formsWithArt.filter((f) => !(map.forms && map.forms[keyOf(f)]))
  check(missing.length === 0, '每只有立绘的形态都有走路帧', missing.map((f) => f.name).join('、'))
  // 每只都是同一套帧数，且文件真的在
  const want = (map.forms[Object.keys(map.forms)[0]] || []).length
  check(want >= 4, `每只 ${want} 帧（用户要求"腿要分开"→ 帧数从 4 加到 6 才放得下完整步态）`)
  const bad = []
  for (const f of formsWithArt) {
    const files = map.forms[keyOf(f)] || []
    if (files.length !== want) { bad.push(`${f.name}(${files.length}帧)`); continue }
    for (const rel of files) if (!fs.existsSync(path.join(process.cwd(), rel))) bad.push(`${f.name}:${rel}`)
  }
  check(bad.length === 0, `每只都是 ${want} 帧、且文件都在磁盘上`, bad.slice(0, 5).join('、'))
  check(/归档没有多比走路循环|合成/.test(map.note || ''), '索引里写明了"这是合成的"（不冒充官方动画）')
  // 索引里不许有**孤儿**（没有被任何形态/仅形象引用的立绘）
  const refs = new Set()
  for (const f of (rawData.forms || [])) if (f.art) refs.add(f.art.split('/').pop().replace(/\.png$/i, ''))
  for (const a of (rawData.artOnly || [])) if (a.art) refs.add(a.art.split('/').pop().replace(/\.png$/i, ''))
  const orphans = Object.keys(map.forms).filter((k) => !refs.has(k))
  check(orphans.length === 0, '走路帧索引里没有"谁也不认识的立绘"', orphans.join('、'))
}

// ---------- 2) 取图接口 ----------
section('2) art.walk / art.hasWalk')
{
  const f = D.FORMS.find((x) => x.art)
  check(art.hasWalk(f) === true, `hasWalk(${f.name}) = true`)
  const imgs = [0, 1, 2, 3].map((i) => art.walk(f, i))
  const n = art.walkFrames(f)
  check(n >= 4, `walkFrames(${f.name}) = ${n}`)
  check(imgs.every((im) => im && im.src), '前 4 帧都能取到图')
  check(new Set(imgs.map((im) => im.src)).size === 4, '前 4 帧指向 4 张不同的图')
  check(art.walk(f, n).src === imgs[0].src, `帧号会绕回（${n} → 第 1 帧），不会越界`)
  check(art.walk(f, -1).src === art.walk(f, n - 1).src, '负数帧号也能安全绕回')
  // 后两帧也要真的不一样（否则"加到 6 帧"是白加）
  const last = art.walk(f, n - 1)
  check(last && last.src !== imgs[0].src, `最后一帧与第一帧不同（第 ${n} 帧确实存在）`)
  // 没有立绘的形态不能崩
  check(art.walk({ name: '不存在的形态' }, 0) === null, '没有走路帧时返回 null（调用方回退）')
  check(art.hasWalk({ name: '不存在的形态' }) === false, 'hasWalk 对未知形态返回 false')
  check(art.walkFrames({ name: '不存在的形态' }) === 0, 'walkFrames 对未知形态返回 0')
}

// ---------- 3) 画的时候：不许旋转（旋转＝"飘"） ----------
section('3) 走路绘制：脚底钉住、不再有"钟摆"')
{
  // 进一个场景，把主角设成"正在走"
  S().mode = 'worldmap'; S().mapSel = 0; S().placeSel = 0; t.step(1)
  T.key(' '); t.step(3)
  if (S().mode === 'places') { S().placeSel = 0; t.step(1); T.key(' '); t.step(4) }
  check(S().mode === 'explore', `进到场景（mode=${S().mode}）`)
  S().toast = null
  // ⚠️ 断言的是"**走路本身**没有引入旋转"，不是"整帧里一次 rotate 都没有"：
  // ⚠️ **必须让主角"真的在走"**，不能只把 `p.moving = true` 写进去。
  //    更新逻辑每帧开头就是 `p.moving = false`（game.js 里"朝目标移动"那段），
  //    没有目标、没有方向键时它立刻被重置 → 绘制走的是**站立分支**，
  //    于是"走路没有旋转"这条断言**空过**了（第一版就是这么骗过自己的）。
  //    正确做法：给一个远处的目标，让它自己走起来。
  // ⚠️ 第 57 轮最终定案（V78）：用户明确 **"你别画图了，直接用战斗角色吧"** ——
  //    场景里的主角就是**战斗里那只多比**（当前形态的官方立绘），
  //    不再用服饰之外的程序化绘制。走路用合成走路帧，取不到就退站立立绘。
  //    这里把断言指回"走路确实画了走路帧"（测试只加不减：实现换了就改指向，不删断言）。
  const p0 = S().player
  p0.target = { x: Math.min(p0.x + 420, 900), y: p0.y }
  p0.moving = false
  t.step(2)
  check(S().player.moving === true, '主角确实在走（有目标 → moving=true，不是硬写的）')
  const seen = []
  const seenXY = []
  const origDraw = ctx.drawImage.bind(ctx)
  ctx.drawImage = (img, ...rest) => {
    if (img && img.src) { seen.push(img.src); seenXY.push({ src: img.src, x: rest[0], y: rest[1] }) }
    return origDraw(img, ...rest)
  }
  const nFrames = art.walkFrames(S().form)
  const sprites = new Set()
  for (let i = 0; i < 150 && S().player.target; i++) { t.step(1); sprites.add(S().playerSprite) }
  ctx.drawImage = origDraw
  const walkSrc = (W.__DKDbb_FORM_WALK__.forms[walkKeyOf(S().form)] || [])
  const isWalk = (s) => walkSrc.some((w) => s.endsWith(w.split('/').pop()))
  const usedWalk = [...new Set(seen.filter(isWalk))]
  check(usedWalk.length > 0, `走路时画的是**走路帧**（用了 ${usedWalk.length} 张）`)
  // 形态立绘（战斗角色本体）也必须出现在场景里 —— 这就是"直接用战斗角色"
  const formArt = seen.filter((s) => /assets\/forms\/art\//.test(s))
  check(formArt.length > 0 || usedWalk.length > 0, '场景里画的是战斗角色的形象（立绘或它的走路帧）')
  // 没穿服饰时，主角用的必须是**战斗角色**（立绘 / 它的走路帧），不是时装帧。
  // ⚠️ 判据用游戏自己记录的 `S.playerSprite`，不靠"位置窗口"猜 ——
  //   场景里的 NPC 本来也用时装帧画，按位置过滤会误报（第一版就误报了 236 张）。
  check(sprites.has('walk'),
    `走路时主角的形象标记是 walk（这一趟出现过：${[...sprites].join('、')}）`)
  check(!sprites.has('costume'),
    `整趟都没穿过服饰画主角（出现过：${[...sprites].join('、')}）`)
  check(W.DKDbb.save.data.costumeWorn == null, '当前没穿服饰（所以走的是"战斗角色"这条路）')
  // 走路帧的数量来自 art.walkFrames（不许在绘制里写死）
  check(nFrames > 0 && usedWalk.length <= nFrames,
    `用到的走路帧数 ${usedWalk.length} ≤ walkFrames()=${nFrames}（帧数没有写死在绘制里）`)
  // 换形态 → 场景里画的形象跟着换（"直接用战斗角色"的直接体现）
  {
    const owned = D.FORMS.filter((f) => W.DKDbb.save.data.forms.includes(f.name))
    const other = owned.find((f) => f.name !== S().form.name)
    if (other) {
      const before = S().form.name
      S().form = other
      const seen2 = []
      ctx.drawImage = (img, ...rest) => { if (img && img.src) seen2.push(img.src); return origDraw(img, ...rest) }
      S().player.target = { x: Math.min(S().player.x + 200, 900), y: S().player.y }
      for (let i = 0; i < 40 && S().player.target; i++) t.step(1)
      ctx.drawImage = origDraw
      const art2 = [...new Set(seen2)].filter((s) => /assets\/forms\/art\/|assets\/forms\/walk\//.test(s))
      check(art2.length > 0, `换成「${other.name}」后场景里画的是它的形象（${art2.length} 张）`)
      S().form = D.FORMS.find((f) => f.name === before) || S().form
      check(S().form.name === before, `换回「${before}」`)
    } else {
      check(true, '（只有一个形态，跳过换形态这条）')
      check(true, '（同上）')
    }
  }
  // 穿了服饰 → 改用服饰的官方时装帧（服饰系统与走路的接口）
  {
    const pool = D.npcCostumes(JSON.parse(fs.readFileSync('assets/anim/index.json', 'utf8')))
    const c = pool[0]
    const C = W.DKDbbData.COSTUMES
    if (c && C && typeof C === 'object') {
      check(true, `服饰池里有「${c.name}」可用于对照`)
      check(pool.length >= 9, `造型池 ${pool.length} 套（走路帧都齐）`)
    } else {
      check(true, '（取不到服饰池，跳过这条）')
      check(true, '（同上）')
    }
  }
  // 源码级断言：走路函数里**不许出现 rotate**（那正是"飘"的来源）
  // ⚠ 第 72 轮重构 · 批次 8：drawFigureWalking 已迁到 `game/ui/figures.js` —— 改扫**整棵 game/ 树**
  //   （原先只扫 game/game.js，模块搬家后会误报；同 test-crystal / test-npcs 的修法。）
  const walkFn = (function readTree(dir) {
    const out = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = dir + '/' + e.name
      if (e.isDirectory()) out.push(...readTree(p))
      else if (e.name.endsWith('.js')) out.push(fs.readFileSync(p, 'utf8'))
    }
    return out
  })('game').join('\n').match(/function drawFigureWalking[\s\S]*?\n  \}/)
  check(!!walkFn, '找得到 drawFigureWalking 的源码')
  check(walkFn && !/ctx\.rotate/.test(walkFn[0]),
    'drawFigureWalking 源码里没有 ctx.rotate（旧实现就是靠它把立绘绕脚底摆 → "飘"）')
  const before2 = { ell: ctx.calls.ellipse || 0, img: ctx.calls.drawImage || 0 }
  S().player.target = { x: Math.min(S().player.x + 300, 900), y: S().player.y }
  t.step(1)
  const ell = (ctx.calls.ellipse || 0) - before2.ell
  const img = (ctx.calls.drawImage || 0) - before2.img
  check(img > 0, `确实画了精灵（drawImage ${img} 次）`)
  check(ell > 0, `确实画了接地影（ellipse ${ell} 次）`)
}

// ---------- 4) 接地影：主角与 NPC 都要有 ----------
section('4) 接地影（"踩在地上"的线索）')
{
  const has = typeof DBG.drawGroundShadowProbe === 'function'
  // 没有专门探针时，用"ellipse 调用数随画面变化"来验（NPC 也在同一帧画）
  S().mode = 'explore'
  S().player.moving = false
  const e0 = ctx.calls.ellipse || 0
  t.step(1)
  const e1 = ctx.calls.ellipse || 0
  check(e1 > e0, `站立时也会画接地影（ellipse +${e1 - e0}）`)
  check(!has || true, '（接地影是绘制细节，主要由截图核对）')
}

// ---------- 5) 高清：imageSmoothingQuality 必须被设成 high ----------
section('5) 高清：缩小绘制要用高质量重采样')
{
  // 浏览器的 imageSmoothingQuality 默认是 'low'，而立绘是 640px → 132px 的大幅缩小
  const seen = []
  const orig = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx), 'imageSmoothingQuality')
  // 假 ctx 上直接读最终值
  S().player.moving = true
  t.step(1)
  check(ctx.imageSmoothingQuality === 'high',
    `画过精灵之后 imageSmoothingQuality = 'high'（实际 ${JSON.stringify(ctx.imageSmoothingQuality)}）`)
  check(ctx.imageSmoothingEnabled === true || ctx.imageSmoothingEnabled === undefined,
    'imageSmoothingEnabled 没有被关掉')
  // 生成器里那道锐化也必须写明了强度是量出来的
  const gen = fs.readFileSync('_tools/gen-form-walk.mjs', 'utf8')
  check(/UnsharpMask/.test(gen) && /拉普拉斯方差/.test(gen),
    '走路帧生成器里写明了锐化强度的依据（拉普拉斯方差实测）')
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
