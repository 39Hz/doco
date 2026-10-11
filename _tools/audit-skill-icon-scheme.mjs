// 摸清：游戏技能表 136 条里 icon 的赋值规律（谁有、谁没有、编号怎么定的）
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const ROOT = path.resolve('.')
const DKDbbData = {}
const ctx = { window: { DKDbbData }, console }
vm.createContext(ctx)
vm.runInContext(fs.readFileSync(path.join(ROOT, 'game/tables/skills-official.js'), 'utf8'), ctx)
const T = ctx.window.DKDbbData.SKILLS

const rows = Object.entries(T)
console.log(`技能表 ${rows.length} 条`)
const has = rows.filter(([, v]) => v.icon)
const no = rows.filter(([, v]) => !v.icon)
console.log(`  有 icon：${has.length}`)
console.log(`  缺 icon：${no.length}`)

console.log('\n=== 有 icon 的（看编号规律）===')
for (const [n, v] of has) console.log(`  ${String(v.icon).padEnd(18)}  ${n.padEnd(12)} [${v.element || '无'}]  conf=${v.conf}`)

console.log('\n=== 缺 icon 的按元素分组 ===')
const byEl = {}
for (const [n, v] of no) {
  const el = v.element || '（未标）'
  ;(byEl[el] = byEl[el] || []).push(n)
}
for (const [el, list] of Object.entries(byEl).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${el.padEnd(6)} ${String(list.length).padStart(3)} 个：${list.slice(0, 10).join('、')}${list.length > 10 ? ' …' : ''}`)
}

// 现有 icon 编号 → 推断方案
console.log('\n=== 现有 icon 编号方案推断 ===')
const segs = {}
for (const [, v] of has) {
  const m = String(v.icon).match(/skill_icon_(\d)(\d{3})/)
  if (m) (segs[m[1]] = segs[m[1]] || []).push({ el: v.element, n: Number(m[2]) })
}
for (const [d, list] of Object.entries(segs).sort()) {
  const els = [...new Set(list.map((x) => x.el))]
  const nums = list.map((x) => x.n).sort((a, b) => a - b)
  console.log(`  ${d}xxx  元素=${els.join('/')}  序号 ${nums[0]}~${nums[nums.length - 1]}  共 ${nums.length} 个`)
}
