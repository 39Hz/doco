// 盘点：每个形态"动作帧"的实际可用情况（决定"哪些能保留"）
// 来源：
//   A) assets/anim/index.json —— 归档导出的动作序列（按时装 spriteDir 索引）
//   B) assets/forms/walk/index.json —— 主角走路帧（46 只，合成）
//   C) assets/forms/art/*.png —— 立绘（有立绘才有形象）
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const forms = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/forms.json'), 'utf8')).forms

// A) 动作序列
let animIdx = { byDir: {} }
const animPath = path.join(ROOT, 'assets/anim/index.json')
if (fs.existsSync(animPath)) {
  const a = JSON.parse(fs.readFileSync(animPath, 'utf8'))
  animIdx = a
}
const animDirs = new Set(Object.keys(animIdx.forms || animIdx.byDir || animIdx))

// B) 走路帧
const walkPath = path.join(ROOT, 'assets/forms/walk/index.json')
const walk = fs.existsSync(walkPath) ? JSON.parse(fs.readFileSync(walkPath, 'utf8')) : { forms: {} }
const walkNames = new Set(Object.keys(walk.forms || {}))

console.log(`形态 ${forms.length} 只`)
console.log(`归档动作序列目录 ${animDirs.size} 个 · 走路帧 ${walkNames.size} 只\n`)

const rows = []
for (const f of forms) {
  const hasArt = !!f.art && fs.existsSync(path.join(ROOT, f.art))
  const hasWalk = walkNames.has(f.name)
  const dir = f.spriteDir || ''
  const hasAnim = dir ? [...animDirs].some((d) => d && (d === dir || dir.includes(d) || d.includes(dir))) : false
  rows.push({ name: f.name, hasArt, hasWalk, hasAnim, dir, ownSprite: f.ownSprite })
}

const groups = {
  '有立绘 + 有走路帧': rows.filter((r) => r.hasArt && r.hasWalk),
  '有立绘，无走路帧': rows.filter((r) => r.hasArt && !r.hasWalk),
  '无立绘但有走路帧': rows.filter((r) => !r.hasArt && r.hasWalk),
  '无立绘、无走路帧（纯空白）': rows.filter((r) => !r.hasArt && !r.hasWalk),
}
for (const [k, list] of Object.entries(groups)) {
  console.log(`=== ${k}：${list.length} 只 ===`)
  console.log('  ' + list.map((r) => r.name).join('、'))
  console.log()
}

console.log('=== 有"归档动作序列"的形态 ===')
const withAnim = rows.filter((r) => r.hasAnim)
console.log(`  ${withAnim.length} 只：${withAnim.map((r) => `${r.name}(${r.dir})`).join('、') || '（无）'}`)

console.log('\n=== 结论 ===')
console.log(`  · 有形象（立绘）的：${rows.filter((r) => r.hasArt).length}`)
console.log(`  · 有动作（走路帧）的：${rows.filter((r) => r.hasWalk).length}`)
console.log(`  · 两者都有（真正"能玩"）：${groups['有立绘 + 有走路帧'].length}`)
console.log(`  · 都没有（一定是空白）：${groups['无立绘、无走路帧（纯空白）'].length}`)
