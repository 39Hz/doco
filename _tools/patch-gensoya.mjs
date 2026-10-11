// 修 gen-soya.mjs：两个数据源的编号体系不一样，必须**按名字**关联。
//   官方 xlsx `索亚介绍.xlsx` 用 70001~70008（70001=斯提尔兽）
//   图鉴4.3 用 170001~170008（170001=威泰格兽）
// 编号顺序不同，按编号 join 会全部错位（上一版就是这么得到 0 只的）。
import fs from 'node:fs'
const p = '_tools/gen-soya.mjs'
let s = fs.readFileSync(p, 'utf8')

const a = [
  'const art = JSON.parse(fs.readFileSync(path.join(ROOT, \'assets\', \'soya\', \'index.json\'), \'utf8\'))',
  'const artById = new Map(art.soya.map((s) => [s.id, s]))',
].join('\n')
const b = [
  'const art = JSON.parse(fs.readFileSync(path.join(ROOT, \'assets\', \'soya\', \'index.json\'), \'utf8\'))',
  '// 按**名字**建索引：两个源的编号体系不同，按编号 join 会错位',
  '// （xlsx: 70001=斯提尔兽；图鉴: 170001=威泰格兽）',
  'const nrm = (x) => String(x || \'\').replace(/[（(].*?[)）]/g, \'\').replace(/[\\s·・]/g, \'\')',
  'const artByName = new Map(art.soya.map((s) => [nrm(s.name), s]))',
].join('\n')
if (!s.includes(a)) { console.error('没找到 artById 锚点'); process.exit(1) }
s = s.replace(a, b)

const a2 = [
  'for (const [id, info] of [...descById].sort((a, b) => a[0] - b[0])) {',
  '  const a = artById.get(id)',
  '  if (!a) continue                     // 没有立绘的先不进游戏',
].join('\n')
const b2 = [
  'for (const [id, info] of [...descById].sort((a, b) => a[0] - b[0])) {',
  '  const a = artByName.get(nrm(info.name))',
  '  if (!a) { console.log(`  跳过 ${info.name}（没有立绘）`); continue }',
].join('\n')
if (!s.includes(a2)) { console.error('没找到循环锚点'); process.exit(1) }
s = s.replace(a2, b2)

// 效果表跟着改成按名字索引（原表按 17000x 写）
s = s.replace('const EFFECT = {', 'const EFFECT_BY_NAME = {')
for (const [id, name] of [[170001, '威泰格兽'], [170002, '伊莱切兽'], [170003, '欧瑞坦兽'], [170004, '凯科特斯兽'], [170005, '帕古因兽'], [170006, '斯提尔兽']]) {
  s = s.replace(`  ${id}: {`, `  '${name}': {`)
}
s = s.replace('const e = EFFECT[id] || { kind: \'none\', label: \'—\', text: \'\' }',
  'let e = { kind: \'none\', label: \'—\', text: \'\' }\n  for (const [k, v] of Object.entries(EFFECT_BY_NAME)) { if (nrm(info.name).includes(k)) { e = v; break } }')

// id 用 xlsx 的编号，另外记下图鉴编号
s = s.replace('    id, name: info.name || a.name, desc: info.desc,',
  '    id, name: info.name || a.name, desc: info.desc, daquanId: a.id,')

fs.writeFileSync(p, s, 'utf8')
console.log('✓ gen-soya.mjs 改成按名字关联')
