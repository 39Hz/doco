// 读 7k7k 美术资源包的「条目资料.json」—— 技能条目的字段结构
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const BASE = path.join(ROOT, '_tmp_test_out/7k7k-res/多克多比_7k7k美术资源_20260929/资料')
for (const f of ['条目资料.json', '图片清单.json', '下载统计.json']) {
  const p = path.join(BASE, f)
  if (!fs.existsSync(p)) { console.log(`✗ 缺 ${f}`); continue }
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  console.log(`\n=== ${f} ===`)
  if (Array.isArray(j)) {
    console.log(`  数组，${j.length} 条`)
    console.log('  第 1 条字段：' + Object.keys(j[0]).join(', '))
    console.log('  样本：' + JSON.stringify(j[0], null, 1).slice(0, 700))
  } else {
    console.log('  对象字段：' + Object.keys(j).join(', '))
    console.log('  ' + JSON.stringify(j, null, 1).slice(0, 500))
  }
}

// 技能条目
const entries = JSON.parse(fs.readFileSync(path.join(BASE, '条目资料.json'), 'utf8'))
const arr = Array.isArray(entries) ? entries : (entries.entries || [])
const skills = arr.filter((e) => JSON.stringify(e).includes('技能') && /技能/.test(e.category || e.类别 || ''))
console.log(`\n=== 技能类目条目 ${skills.length} 个 ===`)
if (skills.length) {
  console.log('字段：' + Object.keys(skills[0]).join(', '))
  for (const s of skills.slice(0, 5)) {
    console.log('  ' + JSON.stringify(s).slice(0, 300))
  }
}
// 按 category 统计
const byCat = {}
for (const e of arr) {
  const c = e.category || e.类别 || '?'
  byCat[c] = (byCat[c] || 0) + 1
}
console.log('\n条目按类目：' + Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join('  '))
