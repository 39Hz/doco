// 划清边界：7k7k 接入的图标里，哪些是"游戏已在用"的技能，哪些是"游戏没有"的新技能
// 目的：让用户决定"已用技能要不要换成 7k7k 版"（7k7k 是 wiki，项目原版是官方图鉴）
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const ROOT = path.resolve('.')
const off = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/skills-official.json'), 'utf8'))
const k7 = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/skills-7k7k.json'), 'utf8'))

const ctx = { window: {} }
vm.createContext(ctx)
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/forms.js'), 'utf8'), ctx)
const gameSkills = ctx.window.__DKDbb_FORMS__.skills || {}

const byName = new Map()
for (const s of off.skills) {
  const n = s.name.replace(/\n/g, '').trim()
  if (!byName.has(n)) byName.set(n, [])
  byName.get(n).push(s)
}

const imported = []
for (const p of k7.skills) {
  const cands = byName.get(p.name)
  if (!cands) continue
  const hit = cands.find((c) => String(c.element).replace(/系$/, '') === p.el)
  if (!hit) continue
  const f = path.join(ROOT, 'assets/skills/skill_icon_' + hit.id + '.png')
  if (!fs.existsSync(f)) continue
  imported.push({ id: hit.id, name: p.name, el: p.el, inGame: !!gameSkills[p.name], gameIcon: gameSkills[p.name] ? gameSkills[p.name].icon : null })
}

const overlap = imported.filter((x) => x.inGame)
const fresh = imported.filter((x) => !x.inGame)
console.log(`7k7k 接入 ${imported.length} 个技能图标`)
console.log(`  其中**游戏已在用**的技能：${overlap.length} 个（这些原本已有官方图鉴图标）`)
for (const o of overlap) console.log(`    ${o.id}  ${o.name.padEnd(10)} [${o.el}]  原用 ${o.gameIcon}.png`)
console.log(`  游戏**没有**的技能（纯新增）：${fresh.length} 个`)
console.log('    ' + fresh.map((f) => `${f.id} ${f.name}`).join('、'))

console.log(`\n7k7k 里"名字对不上官方表"的技能：${k7.skills.length - imported.length} 个`)
const unmatched = k7.skills.filter((p) => {
  const c = byName.get(p.name)
  if (!c) return true
  return !c.find((x) => String(x.element).replace(/系$/, '') === p.el)
})
console.log('    ' + unmatched.map((u) => `${u.name}[${u.el}]`).join('、'))
