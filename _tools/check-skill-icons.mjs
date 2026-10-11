// 核对技能图标：文件在不在、名字对不对、游戏里查的路径和实际是否一致。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const dir = path.join(ROOT, 'assets', 'skills')
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort()
console.log(`assets/skills 下 ${files.length} 个 PNG：`)
console.log('  ' + files.join(' '))

const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'))
console.log(`\nindex.json 记录 ${idx.icons.length} 个：`)
for (const it of idx.icons.slice(0, 4)) console.log('  id=' + it.id + '  file=' + it.file + '  存在=' + fs.existsSync(path.join(ROOT, it.file)))

const forms = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'forms.js'), 'utf8')
  .replace(/^[\s\S]*?window\.__DKDbb_FORMS__\s*=\s*/, '').replace(/;\s*$/, ''))
console.log('\nD.SKILLS 每个技能的 icon 字段 → 实际文件：')
let miss = 0
for (const [name, s] of Object.entries(forms.skills)) {
  const f = 'assets/skills/' + s.icon + '.png'
  const ok = fs.existsSync(path.join(ROOT, f))
  if (!ok) miss++
  console.log(`  ${name.padEnd(8)} icon=${String(s.icon).padEnd(20)} ${ok ? '✓' : '★ 缺文件 ' + f}`)
}
console.log(miss ? `\n★ 缺 ${miss} 个` : '\n✓ 全部对得上')
