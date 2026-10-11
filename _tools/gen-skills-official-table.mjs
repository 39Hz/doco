// 把官方技能表（资源需求文档_魔法技能及道具.xlsx →「战斗内技能列表」）落成结构化数据
// + 与图标 FLA 的编号区间对齐（skill_icon_<start>_<end>.fla 里的编号就是技能 ID）
//
// 产出：assets/skills-official.json（权威）+ docs/技能表-官方.md
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const RAW = path.join(ROOT, '_tmp_test_out/_skill_xlsx.json')
const data = JSON.parse(fs.readFileSync(RAW, 'utf8'))
const sheetName = Object.keys(data).find((k) => k.includes('技能列表'))
const rows = data[sheetName]
const header = rows[0]
console.log(`工作表「${sheetName}」表头 ${header.length} 列：${header.join(' / ')}`)

const col = (name) => header.findIndex((h) => String(h).trim() === name)
const C = {
  id: col('编号ID'), name: col('效果名称'), effect: col('效果'), element: col('系别'),
  desc: col('技能描述'), type: col('类型'), charge: col('蓄力'),
  front: col('前段'), mid: col('中段'), back: col('后段'), hit: col('击中'),
}
console.log('列定位：', JSON.stringify(C))

const skills = []
for (const r of rows.slice(1)) {
  const id = String(r[C.id] || '').trim()
  const name = String(r[C.name] || '').trim()
  if (!/^\d{5,}$/.test(id) || !name) continue
  const g = (i) => (i >= 0 ? String(r[i] || '').trim() : '')
  skills.push({
    id: Number(id), name,
    effect: g(C.effect), element: g(C.element), type: g(C.type),
    desc: g(C.desc),
    anim: { charge: g(C.charge), front: g(C.front), mid: g(C.mid), back: g(C.back), hit: g(C.hit) },
  })
}
console.log(`\n解析出 ${skills.length} 个技能（ID ${skills[0].id} ~ ${skills[skills.length - 1].id}）`)

// 按 ID 前缀（万位以上）分组，这对应图标的 FLA 区间
const groups = {}
for (const s of skills) {
  const g = Math.floor(s.id / 1000)
  ;(groups[g] = groups[g] || []).push(s)
}
console.log('\n按 ID 分组（= 图标 FLA 的区间）：')
for (const [g, list] of Object.entries(groups).sort()) {
  console.log(`  ${g}xxx : ${String(list.length).padStart(3)} 个  ${list[0].id}~${list[list.length - 1].id}  例：${list.slice(0, 4).map((s) => s.name).join('、')}`)
}

// 与图标 FLA 文件名对齐
const FLADIR = path.join(ROOT, '多克多比专区资料素材/魔法道具ICON等/多克多比技能')
const flas = fs.readdirSync(FLADIR).filter((f) => /^skill_icon_(\d+)_(\d+)\.fla$/.test(f)).map((f) => {
  const m = f.match(/^skill_icon_(\d+)_(\d+)\.fla$/)
  return { file: f, start: Number(m[1]), end: Number(m[2]) }
}).sort((a, b) => a.start - b.start)
console.log(`\n图标 FLA ${flas.length} 个区间：`)
let covered = 0
for (const f of flas) {
  const inRange = skills.filter((s) => s.id >= f.start && s.id <= f.end)
  covered += inRange.length
  console.log(`  ${f.file}  → 覆盖技能 ${inRange.length} 个  ${inRange.length ? '（' + inRange.slice(0, 3).map((s) => s.name).join('、') + '…）' : '**该区间无技能**'}`)
}
console.log(`\n被 FLA 区间覆盖的技能：${covered} / ${skills.length}`)

// 元素分布
const byEl = {}
for (const s of skills) (byEl[s.element] = byEl[s.element] || []).push(s.name)
console.log('\n按系别：')
for (const [el, list] of Object.entries(byEl).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${el.padEnd(4)} ${String(list.length).padStart(3)} 个`)
}

fs.writeFileSync(path.join(ROOT, 'assets/skills-official.json'), JSON.stringify({
  generated: new Date().toISOString(),
  source: '多克多比专区资料素材/魔法道具ICON等/多克多比技能/资源需求文档_魔法技能及道具.xlsx → 工作表「战斗内技能列表」',
  note: '官方原版技能表：编号ID / 效果名称 / 系别 / 描述 / 单体群体 / 光效编号（蓄力·前段·中段·后段·击中）',
  count: skills.length,
  iconRanges: flas,
  byElement: Object.fromEntries(Object.entries(byEl).map(([k, v]) => [k, v.length])),
  skills,
}, null, 1))
console.log('\n已写出 assets/skills-official.json')
