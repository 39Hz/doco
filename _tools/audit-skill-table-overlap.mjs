// 对齐：我要加的 39 个技能 与 游戏已有的 skills-official.js（136 个）有多少重叠
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const ROOT = path.resolve('.')
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/skills/index.json'), 'utf8'))
const k7 = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/skills-7k7k.json'), 'utf8'))

// 在沙箱里跑 skills-official.js，拿到它注册的表（它写的是 window.DKDbbData.SKILLS）
const DKDbbData = {}
const ctx = { window: { DKDbbData }, console }
vm.createContext(ctx)
vm.runInContext(fs.readFileSync(path.join(ROOT, 'game/tables/skills-official.js'), 'utf8'), ctx)
const D = ctx.window.DKDbbData
const keys = Object.keys(D)
console.log('skills-official.js 写入的键：' + keys.join(', '))
const table = D.SKILLS
if (!table) { console.log('✗ 没拿到 D.SKILLS'); process.exit(1) }
console.log(`  技能表 ${Object.keys(table).length} 条`)

// 我要加的 39 个（source=7k7k 的 index 条目）
const mine = idx.icons.filter((i) => i.source === '7k7k')
console.log(`\n我新增的图标对应 ${mine.length} 个技能`)
const inTable = [], notInTable = []
for (const m of mine) {
  if (table[m.name]) inTable.push(m)
  else notInTable.push(m)
}
console.log(`  已在游戏技能表里：${inTable.length}`)
for (const m of inTable) console.log(`    ${m.id}  ${m.name.padEnd(12)} 表里 icon=${table[m.name].icon || '(无)'}  conf=${table[m.name].conf || '?'}`)
console.log(`  不在游戏技能表里：${notInTable.length}`)
for (const m of notInTable) console.log(`    ${m.id}  ${m.name.padEnd(12)} [${m.element}]`)

// 表里有多少技能缺图标
const noIcon = Object.entries(table).filter(([, v]) => !v.icon)
console.log(`\n游戏技能表 ${Object.keys(table).length} 条里，缺 icon 的：${noIcon.length}`)
if (noIcon.length) console.log('  例：' + noIcon.slice(0, 12).map(([n]) => n).join('、'))
