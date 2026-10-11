// 按计划书第 0.1 节做的「实地勘察」：只做存在性检查与计数，不遍历大目录。
// 遵守 C2（不遍历 dist/ 与 多克多比专区资料素材/）与 C4（一次跑完输出汇总）。
// 遵守 R5：本脚本自带一个必然为真的正例（应存在的游戏入口与核心文件），
// 如果连正例都报缺失，说明脚本本身有问题，而不是项目缺文件。
import fs from 'node:fs'
import path from 'node:path'

const R = (p) => path.resolve(p)
const has = (p) => fs.existsSync(R(p))
const size = (p) => (has(p) ? fs.statSync(R(p)).size : -1)
const lines = (p) => {
  if (!has(p)) return -1
  const t = fs.readFileSync(R(p), 'utf8')
  return t.split('\n').length
}
const countFiles = (dir, filter) => {
  if (!has(dir)) return -1
  let n = 0
  for (const e of fs.readdirSync(R(dir), { withFileTypes: true })) {
    if (e.isFile() && (!filter || filter(e.name))) n++
  }
  return n
}
const countDirs = (dir) => {
  if (!has(dir)) return -1
  return fs.readdirSync(R(dir), { withFileTypes: true }).filter((e) => e.isDirectory()).length
}
const kb = (b) => (b < 0 ? '缺失' : (b / 1024).toFixed(1) + ' KB')

console.log('===== 0) 自证有效（R5）：正例必须存在 =====')
const POSITIVE = ['game.html', 'game/game.js', 'game/engine/engine.js', 'world.js', 'assets/manifest.json']
let posOk = 0
for (const p of POSITIVE) {
  const ok = has(p)
  console.log(`  ${ok ? '✓' : '✗'} ${p}`)
  if (ok) posOk++
}
if (posOk < POSITIVE.length) {
  console.error('!! 正例缺失 —— 先怀疑脚本/路径，而不是项目')
  process.exit(1)
}
console.log(`  正例 ${posOk}/${POSITIVE.length} 全部存在 → 脚本能给出肯定结果，后续"缺失"的结论可信`)

console.log('\n===== 1) 计划书说的文件是否存在 =====')
const DOCS = [
  '00-PLAN.md', 'STATE.md', 'BLOCKED.md', 'README.md', '场景命名对照表.md',
  'docs/素材考古报告.md', 'docs/官方资料库.md', 'docs/自主迭代日志.md',
  'docs/Unity素材勘查报告.md', 'docs/deviations.md',
]
for (const p of DOCS) {
  console.log(`  ${has(p) ? '有  ' : '没有'} ${p.padEnd(30)} ${has(p) ? (size(p) / 1024).toFixed(1) + ' KB / ' + lines(p) + ' 行' : ''}`)
}

console.log('\n===== 2) 游戏与数据现状 =====')
const GAME = [
  ['game/game.js', '主逻辑'],
  ['game/engine/engine.js', '引擎'],
  ['game/tables/data.js', '数据接口'],
  ['game/tables/skills-official.js', '官方技能表'],
  ['game/tables/form-skills-official.js', '形态配招'],
  ['game/engine/fx.js', '特效'],
  ['game/engine/mouse.js', '鼠标'],
  ['game/tables/quest.js', '任务'],
  ['world.js', '世界/岛屿'],
  ['assets/forms.js', '形态'],
  ['assets/items.js', '道具'],
  ['assets/soya.js', '索亚'],
  ['assets/gamedata.js', '怪兽'],
  ['assets/quests.js', '任务数据'],
]
for (const [p, why] of GAME) console.log(`  ${has(p) ? '✓' : '✗'} ${p.padEnd(32)} ${kb(size(p)).padStart(10)}  ${why}`)

console.log('\n===== 3) 素材计数（只看目录，不递归大目录）=====')
const COUNT = [
  ['assets/scenes', '场景图'],
  ['assets/bgm', 'BGM'],
  ['assets/sfx', '音效'],
  ['assets/monsters/labeled', '怪物立绘'],
  ['assets/forms/art', '形态立绘'],
  ['assets/items', '道具图标'],
  ['assets/skills', '技能图标'],
  ['assets/soya', '索亚立绘'],
]
for (const [d, why] of COUNT) console.log(`  ${String(countFiles(d)).padStart(4)} 个  ${d.padEnd(26)} ${why}`)
console.log(`  ${String(countDirs('assets/anim')).padStart(4)} 个目录  assets/anim               动画动作组`)

console.log('\n===== 4) 测试清单与实际项数 =====')
const tools = has('_tools') ? fs.readdirSync(R('_tools')) : []
const tests = tools.filter((f) => /^test-.*\.mjs$/.test(f)).sort()
const others = tools.filter((f) => f.endsWith('.mjs') && !/^test-/.test(f)).sort()
console.log(`  test-*.mjs 共 ${tests.length} 个：${tests.join(', ')}`)
console.log(`  其它 .mjs 共 ${others.length} 个`)
console.log(`  _tools 文件总数 ${tools.length}`)

console.log('\n===== 5) _web 抓取结果 =====')
for (const d of ['_web/5068/txt', '_web/7k7k/txt', '_web/5068/raw', '_web/7k7k/raw']) {
  console.log(`  ${String(countFiles(d)).padStart(5)} 篇  ${d}`)
}
console.log(`  ${has('_web/skills.json') ? '有' : '没有'} _web/skills.json  ${kb(size('_web/skills.json'))}`)

console.log('\n===== 6) 打包与 exe =====')
console.log(`  ${has('dist/多克多比.exe') ? '有' : '没有'} dist/多克多比.exe  ${kb(size('dist/多克多比.exe'))}`)
for (const z of fs.readdirSync('.').filter((f) => f.endsWith('.zip'))) {
  console.log(`  ${z}  ${(size(z) / 1024 / 1024).toFixed(1)} MB`)
}

console.log('\n===== 7) M3-1 的低垂果实：未解包的 rar =====')
{
  const cands = fs.readdirSync('.', { withFileTypes: true })
    .filter((e) => (e.isDirectory() || e.isFile()) && /rar|压缩|未解压/i.test(e.name))
  console.log('  顶层可疑项: ' + (cands.map((e) => e.name).join('、') || '无'))
  const matDir = '多克多比专区资料素材'
  if (has(matDir)) {
    const inMat = fs.readdirSync(R(matDir), { withFileTypes: true })
    const rars = inMat.filter((e) => /\.rar$/i.test(e.name))
    console.log(`  ${matDir}/ 顶层条目 ${inMat.length} 个，其中 .rar ${rars.length} 个`)
    if (rars.length) console.log('    ' + rars.slice(0, 26).map((e) => e.name).join('\n    '))
  } else console.log(`  ${matDir}/ 不存在`)
}

console.log('\n勘察完成')
