// 一次性探针：打印各个数据文件里的真实条目数（用于 make-dist 生成发布说明、以及新计划书核对）
// 用法: node _tools\probe-facts.mjs
import fs from 'node:fs'

function loadExpr(file, marker) {
  const s = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  const at = marker ? s.indexOf(marker) : s.indexOf('{')
  const start = s.indexOf('{', at)
  let d = 0, str = null
  for (let j = start; j < s.length; j++) {
    const c = s[j]
    if (str) { if (c === '\\') { j++; continue } if (c === str) str = null; continue }
    if (c === '"' || c === "'") { str = c; continue }
    if (c === '{') d++
    else if (c === '}') { d--; if (!d) return JSON.parse(s.slice(start, j + 1)) }
  }
  throw new Error('括号未闭合: ' + file)
}

const forms = loadExpr('assets/forms.js', '__DKDbb_FORMS__')
const data = loadExpr('assets/gamedata.js', '__DKDbb_DATA__')
const items = loadExpr('assets/items.js', '__DKDbb_ITEMS__')

const shape = (o, name) => {
  console.log(`\n[${name}] 顶层键: ${Object.keys(o).join(', ')}`)
  for (const k of Object.keys(o)) {
    const v = o[k]
    if (Array.isArray(v)) console.log(`   ${k}: array[${v.length}]${v.length && typeof v[0] === 'object' ? ' 首元素键: ' + Object.keys(v[0]).slice(0, 10).join(',') : ''}`)
    else if (v && typeof v === 'object') console.log(`   ${k}: object{${Object.keys(v).length}} 键样例: ${Object.keys(v).slice(0, 8).join(',')}`)
  }
}
shape(forms, 'forms.js __DKDbb_FORMS__')
shape(data, 'gamedata.js __DKDbb_DATA__')
shape(items, 'items.js __DKDbb_ITEMS__')

// 场景数 / 怪物立绘数 / 形态立绘数：按目录数（发布说明里要用）
const count = (p) => (fs.existsSync(p) ? fs.readdirSync(p).filter((f) => !f.startsWith('.')).length : 0)
console.log('\n[目录计数]')
for (const d of ['assets/scenes', 'assets/forms/art', 'assets/monsters', 'assets/items', 'assets/skills', 'assets/knights', 'assets/bgm/named']) {
  console.log(`   ${d.padEnd(24)} ${count(d)}`)
}
console.log(`   game/ 脚本数              ${fs.readdirSync('game').filter((f) => f.endsWith('.js')).length}`)
const html = fs.readFileSync('game.html', 'utf8')
console.log(`   game.html <script src>    ${[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].length}`)
