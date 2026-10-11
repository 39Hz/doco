// 把各测试/工具里**自己复刻的地图版式公式**统一改为向游戏查询 mapGeom()。
//
// 背景：大地图的版式（地图区顶部、信息条位置）在 game.js 里改过一次，
// 于是 7 个文件里复刻的 `Math.min(960/MW, (560-150)/MH)` 全部失效 ——
// 表现是"点岛没反应"，但测试只会报"没进地点列表"，看不出是坐标过期。
// 这类"同一个几何算两遍"的写法必须消除：几何只有一个来源。
//
// 用法： node _tools/fix-mapgeom-in-tests.mjs
import fs from 'node:fs'

const FILES = [
  'diag-click.mjs', 'diag-menu.mjs', 'diag-npc.mjs',
  'playtest.mjs', 'playthrough.mjs', 'test-bgm.mjs', 'test-mouse.mjs', 'shoot.mjs',
]
// 匹配两行：先算子，再算 ox/oy。变量名可能是 r 或 r2，宽高常量可能是
// VW/VH 或 960/560，MW/MH 可能是局部常量或 world.mapW/world0.mapW。
const RE = new RegExp(
  String.raw`const (r\d*) = Math\.min\((?:VW|960) \/ (?:MW|world\d*\.mapW), \((?:VH|560) - 150\) \/ (?:MH|world\d*\.mapH)\)\s*\n` +
  String.raw`const ox = \((?:VW|960) - (?:MW|world\d*\.mapW) \* \1\) \/ 2, oy = 96 \+ \((?:VH|560) - 150 - (?:MH|world\d*\.mapH) \* \1\) \/ 2`,
  'g',
)

let changed = 0
const report = []
for (const f of FILES) {
  const p = '_tools/' + f
  if (!fs.existsSync(p)) { report.push(`${f}: 不存在，跳过`); continue }
  const src = fs.readFileSync(p, 'utf8')
  if (!RE.test(src)) { report.push(`${f}: 没有匹配到旧公式（可能已改过）`); RE.lastIndex = 0; continue }
  RE.lastIndex = 0
  const out = src.replace(RE, (_m, rv) =>
    `// 地图版式**向游戏查询**，不要在这里复刻公式（改了 game.js 的版式就会点空）\n` +
    `const _G = DBG().mapGeom(), ${rv} = _G.r, ox = _G.ox, oy = _G.oy`)
  fs.writeFileSync(p, out, 'utf8')
  changed++
  report.push(`${f}: 已改为 mapGeom()`)
}
report.forEach((r) => console.log('  ' + r))
console.log(`\n改动 ${changed} 个文件`)

// ---- 自检（R5）----
console.log('\n自检：')
const leftovers = []
for (const f of FILES) {
  const p = '_tools/' + f
  if (!fs.existsSync(p)) continue
  const s = fs.readFileSync(p, 'utf8')
  if (/\(560 - 150\)|\(VH - 150\)/.test(s)) leftovers.push(f)
}
if (leftovers.length) {
  console.error('!! 仍有文件残留旧公式: ' + leftovers.join(', '))
  process.exit(1)
}
console.log('  ✓ 没有文件残留旧的地图版式公式')
if (changed < 5) {
  console.error(`!! 只改了 ${changed} 个文件，少于预期（7 个），先核实`)
  process.exit(1)
}
console.log('  ✓ 改动文件数符合预期')
