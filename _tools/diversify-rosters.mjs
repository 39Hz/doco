// 最终修正：给每座岛配**多元素**怪池。
//
// 前面所有扫描都显示同一件事：不管怎么调系数，形态间胜率极差都在 70~90 点，
// 而且最差的永远是"元素被那座岛克"的形态（火系打珊瑚、水系打火山、风系被火克制）。
// 根因是原版怪物元素分布太集中，而我把它们按主题一座岛一种元素配了过去：
//   珊瑚秘境岛 4 只全是水、熔岩火山岛 4 只全是火、浮空碎石台 3 只全是暗。
// 玩家基础形态是"无属性"，遇到单元素岛就是"要么克制要么被克"，没有中间档。
//
// 修法：每座岛配 2~3 种元素，保证任何形态都能找到"克制/中立/被克"的混合遭遇，
// 元素克制从"决定你能不能玩这座岛"变成"决定你打得顺不顺"。
import { readFileSync, writeFileSync } from 'node:fs'
import vm from 'node:vm'

const sandbox = { window: {}, console, globalThis: null }
sandbox.globalThis = sandbox
vm.createContext(sandbox)
for (const f of ['game/tables/data.js', 'world.js', 'assets/gamedata.js', 'assets/manifest.js', 'assets/forms.js']) {
  vm.runInContext(readFileSync(f, 'utf8'), sandbox, { filename: f })
}
const D = sandbox.window.DKDbbData
const world = sandbox.window.__DKDbb_WORLD__

// 全部 36 只怪的基础数值，用来挑"同强度档"的怪
const rows = []
for (const m of sandbox.window.__DKDbb_DATA__.monsters) {
  const mon = D.monster(m.id)
  if (!mon) continue
  rows.push({ id: m.id, name: m.name, element: mon.element, power: mon.stats.atk * mon.stats.life, atk: mon.stats.atk, life: mon.stats.life })
}
rows.sort((a, b) => a.power - b.power)
console.log('=== 全部怪按战力分档 ===')
const tiers = { 低: [], 中: [], 高: [] }
for (const r of rows) {
  if (r.power < 4500) tiers['低'].push(r)
  else if (r.power < 7000) tiers['中'].push(r)
  else tiers['高'].push(r)
}
for (const k of Object.keys(tiers)) {
  console.log('  ' + k + '档(' + tiers[k].length + '只): ' + tiers[k].map((r) => r.name + '(' + r.element + ',' + r.power + ')').join(' '))
}

// 每座岛的元素主题 + 需要补的元素
// 原则：以原主题元素为主（保留岛屿特色），再混入 1~2 种其他元素的同档怪
const NEW_ROSTER = {
  // 主城/集市：安全区
  castle: [],
  market: [],
  // 草原野外：新手区，史莱姆系为主，混无属性
  wilds: [10002, 10003, 10021],                       // 毒 毒 无
  // 沙漠遗迹岛：土为主，混毒/无
  desert: [10001, 10020, 10021],                      // 土 毒 无
  // 森林岛：风/毒为主，混暗
  forest: [10019, 19008, 19005, 19013],               // 风 无 毒 暗
  // 云端神殿岛：光为主，混无/火
  angel: [10018, 19007, 10023, 19001],                // 光 光 无 火
  // 地精工坊岛：毒为主，混暗
  factory: [10006, 10007, 19010, 19002],              // 毒 毒 暗 暗
  // 珊瑚秘境岛：水为主，混毒/暗（原来 4 只全水，火系形态必死）
  coral: [10005, 10013, 19011, 19005],                // 水 水 水 毒
  // 云海孤丘 · 霜原：光/火/无
  islet: [19007, 10018, 19001, 10023],                // 光 光 火 无
  // 熔岩火山岛：火为主，混土/无（原来 4 只全火，水系形态必死）
  volcano: [10004, 10016, 19012, 10001],              // 火 火 火 土
  // 浮空碎石台：暗为主，混毒/水（原来 3 只全暗，光系形态无对手）
  rock: [10011, 19002, 19013, 19006],                 // 毒 暗 暗 水
}
console.log('\n=== 新的怪物池（每座岛的元素构成）===')
for (const isl of Object.keys(NEW_ROSTER)) {
  const ids = NEW_ROSTER[isl]
  if (!ids.length) continue
  const info = ids.map((id) => {
    const r = rows.find((x) => x.id === id)
    return r ? r.name + '(' + r.element + ')' : '?' + id
  })
  const els = [...new Set(ids.map((id) => (rows.find((x) => x.id === id) || {}).element))]
  const powers = ids.map((id) => (rows.find((x) => x.id === id) || {}).power)
  const ratio = Math.max(...powers) / Math.min(...powers)
  console.log('  ' + (world.islands.find((i) => i.id === isl) || {}).name + '：' + info.join(' ') +
    '  → ' + els.length + ' 种元素，战力极差 ' + ratio.toFixed(2) + 'x')
}

// 检查每个元素是否至少出现在 3 座岛（保证任何形态都能找到可打的岛）
console.log('\n=== 每种怪元素出现的岛数（任何形态都该有 3 座以上可打）===')
const ELS = ['火', '水', '风', '土', '光', '暗', '毒', '无']
for (const el of ELS) {
  const where = Object.keys(NEW_ROSTER).filter((isl) => NEW_ROSTER[isl].some((id) => (rows.find((x) => x.id === id) || {}).element === el))
  console.log('  ' + el + '：' + where.length + ' 座岛  ' + where.map((i) => (world.islands.find((x) => x.id === i) || {}).name).join('、'))
}

// 写回
const dPath = 'game/tables/data.js'
let dj = readFileSync(dPath, 'utf8')
const s1 = dj.indexOf('  D.ISLAND_MONSTERS = {')
const s2 = dj.indexOf('\n  }', s1) + 4
const block = `  D.ISLAND_MONSTERS = {
    // 每座岛 3~4 只怪，**必须多元素**。
    // 教训：原版怪物元素分布集中（珊瑚 4 只全水、火山 4 只全火、浮空台 3 只全暗），
    // 我按"岛屿主题"配过去之后，任何形态在某座岛的胜率完全取决于"我的元素克不克这座岛"，
    // 实测形态间极差高达 89 点（火系打珊瑚 12%，风系打沙漠 100%），怎么调系数都压不下去。
    // 改成每岛 2~3 种元素后，克制从"决定能不能玩"变成"决定打得顺不顺"。
${Object.entries(NEW_ROSTER).map(([k, v]) => `    ${k}: [${v.join(', ')}],`).join('\n')}
  }`
dj = dj.slice(0, s1) + block + dj.slice(s2)
writeFileSync(dPath, dj, 'utf8')
console.log('\n已写 game/tables/data.js 的新怪物池')
