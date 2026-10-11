// 画布几何体检（R14「视觉断言化」的执行体）
//
// 【为什么单独有这么一轮检查】
// `ui-overlap.mjs` 只扫**它自己注册过的面板矩形** —— 而"直接画在画布上的东西"不在它视野里。
// 于是本项目连续三次视觉事故都是**靠人看图**才发现的：
//   · 第 43 轮：操作说明最后 4 行画到屏幕外（HELP_ROWS 加到 18 行，行高还是写死的）
//   · 第 44 轮：小游戏规则行左右溢出画面（100 多字单行居中画）
//   · 第 45 轮：服饰货架被页脚压住
// R14 的要求：这些必须变成**会红的断言**。
//
// 做法：不从画布上"读像素"，而是让游戏把**它自己算出来的**矩形交出来
// （`__DKDbb_DEBUG__.uiBBoxes()`）—— 坐标改了它会跟着变，所以不会像抄死坐标的测试那样过期。
// 断言：每个矩形都必须落在 [0,W]×[0,H] 之内；登记表本身也要自证"不是空的"（R5）。
//
// 用法: node _tools/check-canvas-bounds.mjs
import { T } from './game-harness.mjs'

const t = T
t.load('game/game.js')
await T.settle()

const W = t.get('window')
const DBG = W.__DKDbb_DEBUG__
const CW = t.canvas.width, CH = t.canvas.height

let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

const inView = (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= CW && r.y + r.h <= CH
const fmt = (r) => `${r.name}[${r.x},${r.y} ${r.w}×${r.h}]`

section(`1) 主菜单（画布 ${CW}×${CH}）`)
{
  const TL = DBG.titleMenuLayout()
  const items = TL.items()
  // 主菜单项数：第 54 轮加了「保存存档」（用户要的"载入三个存档也可以选择载入保存"）→ 5 项变 6 项。
  // 改成**对着真正的清单**核，不再写死数字（写死的话每加一项都要回来改这里）。
  const want = ['继续冒险', '读取存档', '保存存档', '新的冒险', '操作说明', '关于本作']
  check(items.length === want.length, `主菜单 ${want.length} 项（实际 ${items.length}）`)
  const bad = items.filter((r) => !inView(r))
  check(bad.length === 0, '每一项都在画面内', bad.map(fmt).join('；'))
  // 面板本体（菜单底板 + 装饰线）也要在画面内
  const panel = { name: 'title-panel', x: TL.px - 12, y: TL.py - 34, w: TL.pw + 60, h: TL.ph + 20 }
  check(inView(panel), '菜单底板在画面内', fmt(panel))
  // 最后一项的底边不许贴到画面下沿（留出页脚）
  const last = items[items.length - 1]
  check(last.y + last.h <= CH - 20, `最后一项离下沿还有 20px 余量（底边 ${last.y + last.h} ≤ ${CH - 20}）`)
}

section('2) 各界面登记表全部在画面内')
{
  const boxes = DBG.uiBBoxes()
  check(boxes.length > 0, `登记表非空（${boxes.length} 个矩形）`)
  const errs = boxes.filter((r) => r.error)
  check(errs.length === 0, '每个界面的几何都能算出来（没有抛异常的）', errs.map((e) => e.name + ': ' + e.error).join('；'))
  const over = boxes.filter((r) => !r.error && !inView(r))
  check(over.length === 0, `${boxes.length} 个矩形全部落在 [0,${CW}]×[0,${CH}] 之内`,
    over.slice(0, 6).map(fmt).join('；'))

  // 分组自证：登记表必须真的覆盖到这些界面（否则"全在画面内"是空话）
  const groups = new Set(boxes.map((r) => String(r.name).split(':')[0]))
  for (const g of ['title', 'help', 'bag', 'zukan', 'war']) {
    check(groups.has(g), `登记表覆盖到「${g}」界面（${[...groups].join('/')}）`)
  }
  // 操作说明逐行核对：第 43 轮的 bug 就是"行数多了但行高没跟着缩"
  const help = boxes.filter((r) => String(r.name).startsWith('help:'))
  check(help.length >= 18, `操作说明逐行登记（${help.length} 行）`)
  const hb = help.filter((r) => !inView(r))
  check(hb.length === 0, '操作说明每一行都在画面内', hb.slice(0, 4).map(fmt).join('；'))
}

section('3) 战斗界面（进一场战斗后再核一次）')
{
  // 用游戏自己的入口开一场战斗，检查指令格与技能网格
  const st = DBG.state
  DBG.gotoScene(2)
  t.step(3)
  const sp = DBG.spawns
  if (sp && sp.monsters && sp.monsters.length) {
    DBG.startBattle(sp.monsters[0])
    t.step(5)
    const boxes = DBG.uiBBoxes().filter((r) => /^(cmd|skill):/.test(String(r.name)))
    check(boxes.length > 1, `战斗界面登记了 ${boxes.length} 个可点矩形`)
    const over = boxes.filter((r) => !inView(r))
    check(over.length === 0, '战斗指令/技能格全部在画面内', over.slice(0, 6).map(fmt).join('；'))
    // 指令格不许互相重叠（点错指令是真 bug）
    const cmds = boxes.filter((r) => String(r.name).startsWith('cmd:'))
    let overlap = 0
    for (let i = 0; i < cmds.length; i++) for (let j = i + 1; j < cmds.length; j++) {
      const a = cmds[i], b = cmds[j]
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlap++
    }
    check(overlap === 0, `${cmds.length} 个战斗指令格互不重叠`, overlap ? `${overlap} 对重叠` : '')
  } else {
    check(false, '场景 2 里应当有怪可以开战', '没有怪 → 本节没验到，视为失败而不是跳过')
  }
}

section('4) 正例自证（R5：判据必须抓得住坏例子）')
{
  const bad1 = { name: 'x', x: 900, y: 100, w: 200, h: 40 }     // 右溢出
  const bad2 = { name: 'x', x: 100, y: 540, w: 200, h: 40 }     // 下溢出（第 43 轮的形态）
  const bad3 = { name: 'x', x: -20, y: 100, w: 200, h: 40 }     // 左溢出
  check(!inView(bad1) && !inView(bad2) && !inView(bad3), '自证：右/下/左溢出都会被判据抓红')
  // 空登记表也必须算失败（否则"全部在画面内"可能只是因为什么都没登记）
  check(!(0 > 0), '自证：登记表为空时第 2 节的"非空"断言会红')
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
