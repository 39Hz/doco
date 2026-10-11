// 28 张立绘里，哪些是**归档原图**、哪些是**我们自己生成的**？
import fs from 'node:fs'
import path from 'node:path'
import { T } from './game-harness.mjs'
const t = T
t.load('game/game.js')
await t.settle()
const D = t.get('window').DKDbbData

// build-form-art 的来源表
const src = fs.readFileSync('_tools/build-form-art.mjs', 'utf8')
const m = src.match(/const MAP = \[([\s\S]*?)\n\]/)
const entries = [...m[1].matchAll(/\['([^']+)',\s*'([^']+)',\s*'([^']*)'\]/g)]
  .map((x) => ({ form: x[1], file: x[2], why: x[3] }))
const mapByForm = new Map(entries.map((e) => [e.form, e]))

const withArt = D.FORMS.filter((f) => f.art)
console.log(`有立绘 ${withArt.length} 只。逐只看来源：\n`)
let inferred = 0, archived = 0, unknown = 0
for (const f of withArt) {
  const e = mapByForm.get(f.name)
  const rel = f.art.replace('assets/forms/art/', '')
  if (!e) { unknown++; console.log(`   ? ${f.name.padEnd(14)} 来源表里没有 → 需人工确认`); continue }
  // 判断依据："同名"=直接对应；"由描述列推定/官方描述…；素材名"=推断映射
  const isSame = /同名/.test(e.why)
  const isInfer = /推定|描述|素材名|借|代替/.test(e.why)
  if (isSame) archived++
  else if (isInfer) inferred++
  else archived++
  console.log(`   ${isSame ? '○' : '△'} ${f.name.padEnd(14)} ← ${e.file.replace('多比形态素材/', '')}   ${e.why.slice(0, 46)}`)
}
console.log(`\n同名直取 ${archived} 只 · 由描述推定 ${inferred} 只 · 来源不明 ${unknown} 只`)

// 归档里到底有没有这些源文件（可复核）
console.log('\n源文件是否真的在归档里：')
for (const e of entries) {
  const p = path.join('多克多比专区资料素材', e.file)
  console.log(`   ${fs.existsSync(p) ? '在' : '★ 不在'}  ${e.file}`)
}
