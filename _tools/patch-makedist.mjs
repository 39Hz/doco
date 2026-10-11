// 修打包脚本：原来它按固定清单拷 assets 子目录（scenes/bgm/sfx/anim/monsters），
// 后来新加的 forms（形态立绘）、items（道具图标）、skills（技能图标）**没进清单**，
// 打出来的包打开是没立绘、没道具图标的 —— 这个错误已经发出去过一版。
//
// 改成整棵 assets/ 递归拷贝，并且逐个目录打印文件数（漏了能立刻看出来）。
import fs from 'node:fs'

const p = '_build/make-dist.mjs'
let s = fs.readFileSync(p, 'utf8')

// 找到从 "assets/monsters（怪物图鉴立绘 + 映射）" 到 "for (const sub of [...]) {...}" 结束的整段，替换掉
const startMark = '// assets/monsters（怪物图鉴立绘 + 映射）'
const endMark = "  log(`    assets/${sub.padEnd(8)} ${String(n).padStart(4)} 个文件`)\n}"
const a = s.indexOf(startMark)
const b = s.indexOf(endMark)
if (a < 0 || b < 0) { console.error('没找到要替换的区间'); process.exit(1) }
const bEnd = b + endMark.length

const replacement = [
  '// assets/ 整棵递归拷贝。',
  '// 不再逐个列目录：早期版本手写了 scenes/bgm/sfx/anim/monsters 五个，',
  '// 后来加的 forms/items/skills 就漏了，包打出来没立绘也没道具图标（发出去过一版）。',
  '{',
  "  const assetsSrc = path.join(d, 'assets')",
  "  const assetsDst = path.join(web, 'assets')",
  '  fs.cpSync(assetsSrc, assetsDst, { recursive: true })',
  '  // 逐个子目录报数，漏了能一眼看出来',
  "  for (const e of fs.readdirSync(assetsDst, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name))) {",
  '    if (!e.isDirectory()) continue',
  '    const full = path.join(assetsDst, e.name)',
  '    let n = 0',
  '    const walk = (q) => { for (const x of fs.readdirSync(q, { withFileTypes: true })) x.isDirectory() ? walk(path.join(q, x.name)) : n++ }',
  '    walk(full)',
  "    log(`    assets/${e.name.padEnd(12)} ${String(n).padStart(5)} 个文件`)",
  '  }',
  '  // 关键文件的存在性自检：这几样缺了游戏就是"能打开但没画面"',
  "  const must = ['forms/art', 'items', 'skills', 'monsters/labeled', 'scenes']",
  '  for (const m of must) {',
  "    const q = path.join(assetsDst, m)",
  "    const cnt = fs.existsSync(q) ? fs.readdirSync(q).length : 0",
  "    if (!cnt) { console.error(`  ★ 打包自检失败：assets/${m} 是空的！`); process.exit(1) }",
  '  }',
  '  log(`    ✓ 自检通过：形态立绘 / 道具图标 / 技能图标 / 怪物立绘 / 场景图 都在`)',
  '}',
].join('\n')

s = s.slice(0, a) + replacement + s.slice(bEnd)
fs.writeFileSync(p, s, 'utf8')
console.log('✓ make-dist.mjs 改成整棵 assets 递归拷贝，并加了空目录自检')
