// 验证用户的这条要求是否落实：**没有模型立绘的形态，一条获得途径都不能有**
import { T } from './game-harness.mjs'
import fs from 'node:fs'
import path from 'node:path'
const t = T
t.load('game/game.js')
await t.settle()
const W = t.get('window')
const D = W.DKDbbData
const save = W.DKDbb.save
save.newGame(1)

let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n== ' + s + ' ==')

const rows = D.FORMS.map((f) => ({ f, src: D.formSource(f, { save }), art: !!f.art }))

section('1) 分类')
const noArt = rows.filter((r) => !r.art)
const got = rows.filter((r) => r.art)
check(typeof D.formHasArt === 'function', '有唯一判定入口 D.formHasArt()')
check(noArt.length + got.length === rows.length, `有立绘 ${got.length} 只 / 无立绘 ${noArt.length} 只 = ${rows.length}`)

section('2) 无立绘的形态：一条获得途径都不能有')
const OBTAIN = ['exchange', 'drop', 'awaken']
const leaked = noArt.filter((r) => OBTAIN.includes(r.src.kind))
check(leaked.length === 0, `${noArt.length} 只无立绘形态全部不可获得`,
  leaked.map((r) => `${r.f.name}(${r.src.kind})`).join('、'))
const allUnavail = noArt.every((r) => r.src.kind === 'unavailable')
check(allUnavail, '它们全部标成 unavailable（界面上会说清原因）')
check(noArt.every((r) => r.src.noArt === true), '都带 noArt 标记（UI 可据此区分）')

section('3) 有立绘的形态：仍然拿得到（没有把好事一起挡掉）')
const obtainable = got.filter((r) => OBTAIN.includes(r.src.kind))
check(obtainable.length > 0, `有立绘且可获得 ${obtainable.length} 只`)
const kinds = {}
for (const r of got) kinds[r.src.kind] = (kinds[r.src.kind] || 0) + 1
console.log('   ' + Object.entries(kinds).map(([k, n]) => `${k}=${n}`).join('  '))
check((kinds.awaken || 0) > 0, `唤醒途径还通（${kinds.awaken || 0} 只）`)
check((kinds.drop || 0) > 0, `副本掉落途径还通（${kinds.drop || 0} 只）`)
check((kinds.exchange || 0) > 0, `珍宝小屋兑换途径还通（${kinds.exchange || 0} 只）`)

section('4) 副本掉落绑定表：13 个副本全部绑的是有立绘的形态')
let bad = 0
for (const [id, name] of Object.entries(D.DUNGEON_FORM_DROP)) {
  const f = D.FORMS.find((x) => x.name === name)
  if (!f || !f.art) { bad++; console.log(`   ★ ${id} → ${name}（${!f ? '形态不存在' : '无立绘'}）`) }
}
check(bad === 0, `13 个绑定全部有立绘（坏的 ${bad} 个）`)
check(Object.keys(D.DUNGEON_FORM_DROP).length === 13, `绑定条数 13（实际 ${Object.keys(D.DUNGEON_FORM_DROP).length}）`)

section('5) 唯一发放入口：源码里不许再有绕过它的 push')
// 模块化后实现可能已搬到 game/app、game/ui、game/core 等子目录，
// 只扫 game/game.js 会因为「换了文件」而误报 —— 整棵 game/ 树拼起来一起扫。
// ⚠️ 不用 fs.readdirSync(dir,{recursive:true})：Node 18.17+ 才有，Node 16 会静默忽略 → 只扫顶层。
const readTree = (dir) => {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...readTree(p))
    else if (e.name.endsWith('.js')) out.push(fs.readFileSync(p, 'utf8'))
  }
  return out
}
const src = readTree('game').join('\n')
const pushes = [...src.matchAll(/save\.data\.forms\.push\(/g)]
// 允许的只有 grantForm 内部那一处 + applySaveToRuntime 里的初始形态
check(pushes.length <= 2, `save.data.forms.push 只剩 ${pushes.length} 处（grantForm 内部 + 初始形态）`,
  pushes.map((m) => src.slice(Math.max(0, m.index - 60), m.index).split('\n').pop().trim()).join(' | '))
check(/function grantForm\(/.test(src), 'grantForm() 存在')
const calls = (src.match(/grantForm\(/g) || []).length
check(calls >= 5, `grantForm 被调用 ${calls} 次（定义 1 + 4 条途径）`)

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
