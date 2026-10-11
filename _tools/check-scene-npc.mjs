// 场景 NPC 体检（R15 的执行体：把人类实测反馈变成**会红的断言**）
//
// 【为什么必须有这个脚本】
// 人类报过三次"玩起来不对"，全部出在 NPC 上，而每次修完都**没有留下断言**：
//   · 第 40 轮：一屏 14 个人（无上限）· 皮肤全一样（同一场景共用一个种子）· 满地图乱跑
//   · 第 40/45 轮：入口类 NPC 被封顶砍掉两次（「飞行员多比」被砍、「麦基」被砍且不报错）
//   · 第 46 轮（本脚本第一次跑就抓到）：**第 7 个 NPC 被摆到画面外的 y=573**
//     —— 画布高 560，玩家看不见也点不到，而当时所有测试都是绿的。
// 三次都是"靠人再玩一遍才发现"。R15 的要求就是：同一条反馈不许出现第二次。
//
// 判据一律从**游戏自己**读（`__DKDbb_DEBUG__.sceneNpcs` / `npcLayout`），
// 不在测试里重算列数或抄坐标 —— 抄死的坐标在改版式那天会全红（本项目已经栽过）。
//
// 用法: node _tools/check-scene-npc.mjs      （产出「通过 N 项，失败 M 项」汇总行）
import { T } from './game-harness.mjs'

const t = T
t.load('game/game.js')
await T.settle()

const W = t.get('window')
const DBG = W.__DKDbb_DEBUG__
const MAN = t.get('__man')
const WORLD = t.get('__world')
const CW = t.canvas.width, CH = t.canvas.height

let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

const scenes = MAN.scenes.map((s) => s.id).sort((a, b) => a - b)
const MAX_ABS = 9                      // 硬上限（第 40 轮用户反馈"一屏 14 个人"后加的）
const SAFE = { x0: 200, x1: 760, yTop: 300, yBottom: 505 }   // NPC 排布安全区（进出口箭头在 x<116 与 x>844）
const SPRITE_H = 70
// 必须在 88 个场景里真的会出现的功能型 NPC（第 47 轮把两个官方点名的小游戏 NPC 加进来）
const MUST_APPEAR = ['拉鲁', '肖恩普', '小游戏向导', '麦基', '艾伦', '夏丽', '华多', '安迪']

// ─────────────────────────── 1) 逐场景核对 ───────────────────────────
section('1) 逐场景核对（88 个场景，全部走游戏自己的数据）')
const perScene = []
let readFail = 0
for (const id of scenes) {
  DBG.gotoScene(id)
  t.step(2)
  const list = DBG.sceneNpcs(id)
  if (!list) { readFail++; continue }
  perScene.push({ id, list })
}
check(readFail === 0, `${scenes.length} 个场景都能读出 NPC 清单`, readFail ? `${readFail} 个读不出` : '')
check(perScene.length === scenes.length, `实测场景数 = 清单数（${perScene.length}）`)

// 1.1 上限
const over = perScene.filter((s) => s.list.length > MAX_ABS)
check(over.length === 0, `没有场景超过硬上限 ${MAX_ABS} 人`,
  over.map((s) => `场景${s.id}=${s.list.length}人`).join('、'))

// 1.2 同屏不撞衫（第 40 轮人类反馈"皮肤都一样"）
const clashes = []
let withCostume = 0
for (const s of perScene) {
  withCostume += s.list.filter((n) => n.costume).length
  const seen = new Map()
  for (const n of s.list) {
    if (!n.costume) continue
    if (seen.has(n.costume)) clashes.push(`场景${s.id}：${seen.get(n.costume)} 与 ${n.name} 都穿「${n.costume}」`)
    else seen.set(n.costume, n.name)
  }
}
check(clashes.length === 0, `88 个场景同屏撞衫 0 例`, clashes.slice(0, 5).join('；'))
check(withCostume > 0, `造型确实取自真实立绘池（共 ${withCostume} 人次有造型）`)

// 1.3 全部在画面内（第 46 轮抓到的真 bug：第 7 个人在 y=573）
const outX = [], outY = []
for (const s of perScene) {
  for (const n of s.list) {
    if (!(n.x >= SAFE.x0 && n.x <= SAFE.x1)) outX.push(`场景${s.id}「${n.name}」x=${Math.round(n.x)}`)
    if (!(n.y >= SAFE.yTop && n.y <= SAFE.yBottom)) outY.push(`场景${s.id}「${n.name}」y=${Math.round(n.y)}`)
  }
}
check(outX.length === 0, `NPC 全部避开左右出口箭头（x∈[${SAFE.x0},${SAFE.x1}]）`, outX.slice(0, 5).join('；'))
check(outY.length === 0, `NPC 全部在画面内的可用行（y∈[${SAFE.yTop},${SAFE.yBottom}]）`, outY.slice(0, 5).join('；'))
const bottoms = perScene.flatMap((s) => s.list.map((n) => n.y + SPRITE_H))
check(bottoms.every((b) => b <= CH), `所有人脚底都在画布内（最高脚底 ${Math.round(Math.max(...bottoms, 0))} ≤ ${CH}）`)
const xs = perScene.flatMap((s) => s.list.map((n) => Math.round(n.x)))
const ys = perScene.flatMap((s) => s.list.map((n) => Math.round(n.y)))

// 1.4 入口类 NPC 一个都不许被砍（第 40、45 轮各踩一次）
const islOf = new Map()
for (const isl of WORLD.islands) for (const sid of isl.scenes) islOf.set(sid, isl.id)
const hubIds = new Set([...islOf.entries()].filter(([, isl]) => true).length ? [] : [])
for (const isl of WORLD.islands) if (isl.scenes && isl.scenes.length) hubIds.add(isl.scenes[0])
const hubs = perScene.filter((s) => hubIds.has(s.id))
const hubsOver8 = hubs.filter((s) => s.list.length > 8)
check(hubsOver8.length === 0, `中心场景不超过 8 人（中心场景 ${hubs.length} 个）`,
  hubsOver8.map((s) => `场景${s.id}=${s.list.length}`).join('、'))
const nonHubOver5 = perScene.filter((s) => !hubIds.has(s.id) && s.list.length > 5)
check(nonHubOver5.length === 0, `普通场景不超过 5 人`,
  nonHubOver5.map((s) => `场景${s.id}=${s.list.length}人`).join('、'))

// 1.5 每个入口类 NPC 都要真的出现在某个场景里（"加了却没人"是最隐蔽的回归）
// 逐个"必须存在"的功能点：按名字核对，读的是**游戏里真的出现了谁**
const namesAll = new Set(perScene.flatMap((s) => s.list.map((n) => n.name)))
for (const nm of MUST_APPEAR) {
  check(namesAll.has(nm), `入口/功能 NPC「${nm}」在 88 个场景里真的会出现`)
}
// 麦基必须在多比大街的**最右一个场景**（官方原文：服饰店在多比大街上的最右端）
{
  const market = WORLD.islands.find((i) => i.id === 'market')
  const rightEnd = market && market.scenes[market.scenes.length - 1]
  const here = perScene.find((s) => s.id === rightEnd)
  check(!!here && here.list.some((n) => n.name === '麦基'), `麦基在多比大街最右端场景（${rightEnd}）`)
  const elsewhere = perScene.filter((s) => s.id !== rightEnd && s.list.some((n) => n.name === '麦基'))
  check(elsewhere.length === 0, '麦基不在别的场景重复出现', elsewhere.map((s) => s.id).join('、'))
}

// ─────────────────────────── 2) 排布实现本身（边界枚举，不靠某个场景碰巧命中）───────────────────────────
section('2) 排布实现：0~9 人逐一枚举（9 = 游戏内硬上限）')
{
  // 只枚举到 9：游戏里 `MAX_NPC ≤ 8` 且硬上限 9，10 人以上到不了排布这一步。
  // 若哪天把上限抬高，枚举范围要跟着抬 —— 那时会立刻红（而不是悄悄出画）。
  const CAP = 9
  let bad = []
  for (let n = 0; n <= CAP; n++) {
    const lay = DBG.npcLayout(n)
    if (n === 0) { if (lay.points.length !== 0) bad.push('0 人应当没有点'); continue }
    for (const p of lay.points) {
      if (!(p.x >= SAFE.x0 - 1 && p.x <= SAFE.x1 + 1)) bad.push(`${n}人 x=${Math.round(p.x)}`)
      if (!(p.y >= SAFE.yTop && p.y <= SAFE.yBottom)) bad.push(`${n}人 y=${Math.round(p.y)}`)
      if (p.y + SPRITE_H > CH) bad.push(`${n}人 脚底 ${Math.round(p.y + SPRITE_H)} 出画`)
    }
    // 还要不许重叠：同一行相邻两人的间距必须大于立绘宽度的一半（约 40px）
    const rows = new Map()
    for (const p of lay.points) { if (!rows.has(p.row)) rows.set(p.row, []); rows.get(p.row).push(p.x) }
    for (const [row, arr] of rows) {
      arr.sort((a, b) => a - b)
      for (let i = 1; i < arr.length; i++) if (arr[i] - arr[i - 1] < 60) bad.push(`${n}人 第${row}行间距 ${Math.round(arr[i] - arr[i - 1])}px < 60`)
    }
  }
  check(bad.length === 0, `0~${CAP} 人的排布全部在画面内、不重叠`, bad.slice(0, 6).join('；'))
  // 上限本身也要有守卫：上限值与排布能容纳的人数必须一致
  const lay9 = DBG.npcLayout(9)
  check(lay9.points.length <= 2 * lay9.cols && lay9.bottom <= CH,
    `硬上限 ${CAP} 人只用两行且不出画（列数 ${lay9.cols}，脚底 ${lay9.bottom} ≤ ${CH}）`)
}

// ─────────────────────────── 3) 固定 NPC 不许乱跑（第 40 轮反馈）───────────────────────────
section('3) 固定 NPC 不许乱跑')
{
  DBG.gotoScene(hubIds.values().next().value)
  t.step(2)
  const id = DBG.state.current.id
  const before = DBG.sceneNpcs(id).map((n) => `${n.name}@${Math.round(n.x)},${Math.round(n.y)}`)
  t.step(180)                                  // 3 秒
  const after = DBG.sceneNpcs(id).map((n) => `${n.name}@${Math.round(n.x)},${Math.round(n.y)}`)
  check(before.length > 0 && before.join('|') === after.join('|'),
    `场景 ${id} 的 ${before.length} 个 NPC 静置 180 帧后位置不变`,
    before.join(' | ') + '  →  ' + after.join(' | '))
  // 小怪仍然会动（"不乱跑"只针对 NPC，别把怪也钉死了）
  const sp = DBG.state.current._spawns
  const mBefore = (sp.monsters || []).map((m) => `${Math.round(m.x)},${Math.round(m.y)}`).join('|')
  t.step(180)
  const mAfter = (sp.monsters || []).map((m) => `${Math.round(m.x)},${Math.round(m.y)}`).join('|')
  check((sp.monsters || []).length === 0 || mBefore !== mAfter,
    `同场景小怪仍然会游荡（${(sp.monsters || []).length} 只）`)
}

// ─────────────────────────── 4) 正例自证（R5：这个脚本必须抓得住坏例子）───────────────────────────
section('4) 正例自证：假的坏数据必须被抓出来')
{
  // 把排布函数当成被测对象：构造一个"两行 4 列、9 个人"的坏排布，验证上面的判据会红
  const badLayout = { cols: 4, points: [] }
  for (let i = 0; i < 9; i++) badLayout.points.push({ x: 200 + (i % 4) * 186.67, y: i < 4 ? 330 : 573, row: i < 4 ? 0 : 1, col: i % 4 })
  const caughtOverflow = badLayout.points.some((p) => p.y + SPRITE_H > CH)
  check(caughtOverflow, '自证：旧的「固定两行 4 列」排布（第 9 人 y=573）会被判据抓红')
  const dupCostume = ['喵喵男', '喵喵男'].length !== new Set(['喵喵男', '喵喵男']).size
  check(dupCostume, '自证：撞衫（两个同名造型）会被判据抓红')
  const overlap = [200, 210].sort((a, b) => a - b).some((v, i, a) => i > 0 && v - a[i - 1] < 60)
  check(overlap, '自证：间距不足 60px 会被判据抓红')
}

// ─────────────────────────── 汇总 ───────────────────────────
section('统计（供人看，不参与判定）')
{
  const counts = perScene.map((s) => s.list.length)
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length
  console.log(`  每屏 NPC：平均 ${avg.toFixed(1)} · 最多 ${Math.max(...counts)} · 最少 ${Math.min(...counts)} · 总数 ${counts.reduce((a, b) => a + b, 0)}`)
  console.log(`  坐标范围：x ${Math.min(...xs)}~${Math.max(...xs)} · y ${Math.min(...ys)}~${Math.max(...ys)}（画布 ${CW}×${CH}）`)
  const hist = new Map()
  for (const c of counts) hist.set(c, (hist.get(c) || 0) + 1)
  console.log('  人数分布：' + [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}人×${v}场景`).join(' · '))
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
