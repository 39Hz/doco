// 给 11 个多比按属性重新配招，全部从官方技能表里选。
//
// 规则（确定性，可复核）：
//   1. 每只多比保留它自己的**招牌技能**（原版策划表 forms[].skill.name，非空时必选）
//   2. 其余槽位从**同属性**官方技能里挑，按 MP 从低到高铺开，保证有：
//        一个低耗单体、一个中耗技、一个全体技、一个辅助/增益技
//   3. 最后一个槽位放一个**结印技**（同属性优先，无同属性则取任意结印技），
//      这样每只多比都有机会用到原版的结印系统
//   4. 属性为「无」的多比，从 无属性 + 物理 技能里挑
//
// 输出： game/tables/form-skills-official.js
// 用法： node _tools/assign-form-skills.mjs
import fs from 'node:fs'

const formsSrc = fs.readFileSync('assets/forms.js', 'utf8')
const FORMS = JSON.parse(formsSrc.slice(formsSrc.indexOf('{'), formsSrc.lastIndexOf('}') + 1))
const forms = FORMS.forms || []
if (!forms.length) { console.error('!! 没读到形态'); process.exit(1) }

const offSrc = fs.readFileSync('game/tables/skills-official.js', 'utf8')
const m = offSrc.match(/var T = (\{[\s\S]*?\n\})\n/)
if (!m) { console.error('!! 解析不出技能表'); process.exit(1) }
const T = JSON.parse(m[1])
const NAMES = Object.keys(T)
console.log(`官方技能 ${NAMES.length} 个`)

const elemOf = (n) => T[n].element
const pool = (el) => NAMES.filter((n) => (el === '无' ? (elemOf(n) === null || elemOf(n) === '无') : elemOf(n) === el))
const seals = NAMES.filter((n) => T[n].seal)
const supports = NAMES.filter((n) => T[n].buff || T[n].heal || T[n].cleanse || T[n].purge)

const byMp = (a, b) => (T[a].mp || 0) - (T[b].mp || 0)
const report = []
const out = {}

for (const f of forms) {
  const el = f.element || '无'
  const cand = pool(el).slice().sort(byMp)
  const picked = []
  const add = (n) => { if (n && T[n] && !picked.includes(n)) picked.push(n) }

  // 1. 招牌技能
  const sig = f.skill && f.skill.name
  add(sig)
  // 2. 铺开：招牌 → 低耗单体 → 结印技 → 全体 → 辅助 → 补满
  //    结印技放第 3 位，避免被 slice 截断（原版策划表里低级形态只有 2 个槽位，
  //    那样的形态永远用不到结印系统，所以下面把槽位下限提到 3，这是有意的调整）
  const singles = cand.filter((n) => !T[n].seal && T[n].range === 0 && T[n].power > 0)
  const aoe = cand.filter((n) => !T[n].seal && T[n].range === 2 && T[n].power > 0)
  const sup = cand.filter((n) => supports.includes(n) && !T[n].seal)
  const sealSame = seals.filter((n) => elemOf(n) === el)
  if (singles.length) add(singles[0])
  add(sealSame[0] || seals[0])          // 结印技：同属性优先
  if (aoe.length) add(aoe[0])
  if (sup.length) add(sup[0])
  if (singles.length > 2) add(singles[Math.floor(singles.length / 2)])

  const tableSlots = f.skillSlots || 5
  const slots = Math.max(3, tableSlots)  // 下限 3，见上面的说明
  for (const n of cand) { if (picked.length >= slots) break; add(n) }
  out[f.name] = picked.slice(0, slots)
  report.push({
    form: f.name, el, slots, tableSlots,
    before: (f.skills || []).join('、'),
    after: out[f.name].join('、'),
    adjusted: slots !== tableSlots,
  })
}

console.log('\n配招结果：')
for (const r of report) {
  console.log(`  ${r.form}（${r.el}，槽位 ${r.tableSlots}${r.adjusted ? '→' + r.slots : ''}）`)
  console.log(`    旧: ${r.before}`)
  console.log(`    新: ${r.after}`)
}

// 自检
let bad = 0
for (const [k, v] of Object.entries(out)) {
  if (v.length < 3) { console.error(`!! ${k} 技能过少: ${v.join('、')}`); bad++ }
  for (const n of v) if (!T[n]) { console.error(`!! ${k} 引用了不存在的技能 ${n}`); bad++ }
}
const sealForms = Object.values(out).filter((v) => v.some((n) => T[n] && T[n].seal)).length
console.log(`\n${Object.keys(out).length} 只多比，其中 ${sealForms} 只配有结印技`)
if (bad) process.exit(1)
if (sealForms < Object.keys(out).length) { console.error('!! 有形态拿不到结印技'); process.exit(1) }

const js = `// 本文件由 _tools/assign-form-skills.mjs 自动生成，请勿手改。
// 按属性从官方技能表给每个多比配招；每只保留原版策划表里的招牌技能，
// 并保证至少配有一个结印技（原版结印系统需要 SP，见 docs/官方资料库.md）。
// 必须排在 assets/forms.js 之后加载。
(function () {
  var g = (typeof window !== 'undefined' ? window : globalThis).__DKDbb_FORMS__
  if (!g || !g.forms) return
  var MAP = ${JSON.stringify(out, null, 1)}
  for (var i = 0; i < g.forms.length; i++) {
    var f = g.forms[i]
    if (MAP[f.name]) f.skills = MAP[f.name]
  }
  g.skillAssignSource = 'official（_tools/assign-form-skills.mjs）'
})()
`
fs.writeFileSync('game/tables/form-skills-official.js', js, 'utf8')
console.log(`写出 game/tables/form-skills-official.js  ${(js.length / 1024).toFixed(1)} KB`)
console.log('自检通过')
