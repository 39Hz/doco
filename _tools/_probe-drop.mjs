// 副本掉落要重排：原来 13 个副本里 8 个掉的是**没有立绘**的形态
import { T } from './game-harness.mjs'
const t = T
t.load('game/game.js')
await t.settle()
const D = t.get('window').DKDbbData
const save = t.get('window').DKDbb.save
save.newGame(1)

const hasArt = (f) => !!f.art
console.log('① 当前副本掉落绑定：')
const keep = [], need = []
for (const [id, formName] of Object.entries(D.DUNGEON_FORM_DROP)) {
  const f = D.FORMS.find((x) => x.name === formName)
  const ok = f && hasArt(f)
  const dn = D.dungeonById(id) ? D.dungeonById(id).name : id
  console.log(`   ${ok ? '○ 保留' : '★ 要换'}  ${dn.padEnd(10)} → ${formName}${f ? '' : '（形态表里没有这只！）'}`)
  if (ok) keep.push(formName); else need.push({ id, dn, old: formName })
}
console.log(`\n   保留 ${keep.length} 个，需要重新指派 ${need.length} 个`)

console.log('\n② 可以用来顶上的形态（有立绘 且 不是官方唤醒 且 还没被别的副本占用）：')
const used = new Set(keep)
const pool = D.FORMS.filter((f) => hasArt(f) && !used.has(f.name))
  .filter((f) => !(D.isAwakenable && D.isAwakenable(f)))
console.log(`   候选 ${pool.length} 只：`)
for (const f of pool) console.log(`      ${f.name.padEnd(14)} ${f.element || '无'}属性  强度 ${D.formStrength(f)}`)
