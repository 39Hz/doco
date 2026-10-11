// 找出"能玩但没有立绘"的形态（游戏里会显示空白）
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const f = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/forms.json'), 'utf8'))

// 磁盘上的立绘名（去扩展名）
const artFiles = fs.readdirSync(path.join(ROOT, 'assets/forms/art'))
  .filter((n) => n.endsWith('.png') && !n.includes('_icon'))
  .map((n) => n.replace(/\.png$/, ''))
// 归一化：去掉空格、间隔号、'多比' 后缀差异
const norm = (s) => String(s).replace(/[\s·・]/g, '')
const artSet = new Set(artFiles.map(norm))

const forms = f.forms || []
const artOnly = f.artOnly || []
console.log(`形态 ${forms.length} 个 · 仅形象 ${artOnly.length} 个 · 磁盘立绘 ${artFiles.length} 张\n`)

// 逐个形态判断：它的 art 字段指向的文件在不在？名字能不能对上？
const missing = [], okList = []
for (const fm of forms) {
  const hasArtField = !!fm.art
  const byName = artSet.has(norm(fm.name))
  const fileExists = fm.art ? fs.existsSync(path.join(ROOT, fm.art)) : false
  if (fileExists && hasArtField) okList.push(fm.name)
  else missing.push({ name: fm.name, art: fm.art || '(空)', byName, hasArtField })
}
console.log(`=== 有立绘（游戏里能正常显示）：${okList.length} 个 ===`)
console.log(`=== 没有立绘（游戏里会是空白）：${missing.length} 个 ===`)
for (const m of missing) {
  console.log(`  ${m.name.padEnd(16)} art=${m.art.padEnd(34)} 磁盘有同名图=${m.byName ? '**有**' : '没有'}`)
}

// 反向：磁盘上有图、但没有任何形态/仅形象引用它（孤儿图）
const used = new Set()
for (const fm of [...forms, ...artOnly]) {
  if (fm.art) used.add(norm(path.basename(fm.art, '.png')))
  used.add(norm(fm.name))
}
const orphans = artFiles.filter((n) => !used.has(norm(n)))
console.log(`\n=== 磁盘上有图但没被引用（孤儿，${orphans.length} 张）===`)
console.log('  ' + (orphans.join('、') || '（无）'))
