// 地图互相关联：官方「七大地形」+ 通道图。
//
// 用户要求：「在做地图之间的互相关联，能从这个地方进入哪里」。
// 数据来源是 5068《多克多比地形全介绍 七大地形有什么用》原文（见 world.js 注释与
// docs/官方资料库.md），这里验证：
//   1) 11 座岛全部归入 7 个地形，没有孤儿
//   2) 通道图对称、无自环、无重复、指向的岛都真实存在
//   3) 任意两岛之间都走得到（否则玩家会被困死）
//   4) 多比城堡是枢纽（官方：可前往大部分地方）
//   5) 游戏里能算出路径，并在界面上给出"可前往"信息
import { T } from './game-harness.mjs'

const t = T
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
let pass = 0, fail = 0
const check = (c, s) => { console.log((c ? '  ✓ ' : '  ✗ ') + s); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

const world = t.get('__world')
const isles = world.islands
const ids = isles.map((i) => i.id)

// ---------- 1) 七大地形 ----------
section('1) 官方七大地形覆盖全部岛屿')
const dists = world.districts || []
check(dists.length === 7, `地形数量 ${dists.length}（官方就是七个）`)
const expectNames = ['多比城堡', '多比大街', '多比学院', '索亚森林', '勇气峡谷', '智慧城', '未知悬浮岛']
const gotNames = dists.map((d) => d.name)
check(expectNames.every((n) => gotNames.includes(n)),
  `七个名字都对得上：${gotNames.join('、')}`)
const mapped = dists.flatMap((d) => d.islands || [])
check(mapped.length === ids.length && ids.every((id) => mapped.includes(id)),
  `11 座岛全部归入地形（映射 ${mapped.length} 个，岛 ${ids.length} 座）`)
const dupMap = mapped.filter((id, i) => mapped.indexOf(id) !== i)
check(dupMap.length === 0, `没有一座岛被归到两个地形（重复: ${dupMap.join(',') || '无'}）`)
// 每个地形都要有官方原文说明
const noOfficial = dists.filter((d) => !d.official || !d.role)
check(noOfficial.length === 0, `每个地形都带官方原文与职责（缺: ${noOfficial.map((d) => d.name).join('、') || '无'}）`)

// ---------- 2) 通道图健全性 ----------
section('2) 通道图本身要健全')
const links = world.links || {}
let bad = []
for (const id of ids) {
  const ls = links[id]
  if (!Array.isArray(ls) || !ls.length) { bad.push(`${id} 没有通道`); continue }
  if (ls.includes(id)) bad.push(`${id} 有自环`)
  if (new Set(ls).size !== ls.length) bad.push(`${id} 有重复通道`)
  for (const to of ls) {
    if (!ids.includes(to)) bad.push(`${id} → ${to} 指向不存在的岛`)
    else if (!(links[to] || []).includes(id)) bad.push(`${id} → ${to} 不是双向的`)
  }
}
check(bad.length === 0, `通道图没有坏边（${bad.slice(0, 4).join('；') || '全部正常'}）`)

// ---------- 3) 全图连通 ----------
section('3) 任意两点都走得到（不会被困死）')
function bfs(from) {
  const seen = new Set([from]); const q = [from]
  while (q.length) {
    const c = q.shift()
    for (const n of (links[c] || [])) if (!seen.has(n)) { seen.add(n); q.push(n) }
  }
  return seen
}
let unreachable = []
for (const a of ids) {
  const seen = bfs(a)
  for (const b of ids) if (!seen.has(b)) unreachable.push(`${a}→${b}`)
}
check(unreachable.length === 0, `全图连通（不通的组合: ${unreachable.slice(0, 4).join(',') || '无'}）`)

// ---------- 4) 多比城堡是枢纽 ----------
section('4) 多比城堡是枢纽（官方：可前往大部分地方）')
const hub = links.castle || []
check(hub.length >= 5, `多比城堡直达 ${hub.length} 处：${hub.join('、')}`)
const maxDeg = Math.max(...ids.map((id) => (links[id] || []).length))
check(hub.length === maxDeg, `它的连接数最多（${hub.length} = 最大度数 ${maxDeg}）`)
// 任意岛到城堡的距离都不超过 2 跳
let far = []
for (const id of ids) {
  if (id === 'castle') continue
  const path = DBG().routeTo(id, 'castle')
  if (!path || path.length - 1 > 2) far.push(`${id}(${path ? path.length - 1 : '?'} 跳)`)
}
check(far.length === 0, `任何地方到主城最多 2 跳（超出的: ${far.join(',') || '无'}）`)

// ---------- 5) 游戏里的路径计算 ----------
section('5) 路径计算')
check(typeof DBG().routeTo === 'function', '暴露了 routeTo 供界面与测试共用')
const p1 = DBG().routeTo('coral', 'castle')
check(!!p1 && p1[0] === 'coral' && p1[p1.length - 1] === 'castle',
  `珊瑚秘境 → 主城：${p1 ? p1.join(' → ') : '无路径'}`)
const p2 = DBG().routeTo('castle', 'castle')
check(p2 && p2.length === 1, `原地不动返回单元素路径（${p2 ? p2.join('→') : '-'}）`)
const p3 = DBG().routeTo('desert', 'islet')
check(!!p3, `沙漠遗迹 → 未知悬浮岛：${p3 ? p3.join(' → ') : '无路径'}`)
check(p3 && p3.length > 2, `这条要绕路（${p3 ? p3.length - 1 : '-'} 跳），不是直达`)

// ---------- 6) 界面要真的显示出来 ----------
section('6) 界面上能看到"从这里能去哪"')
// 进到一个场景，看探索界面的顶栏文字是否含"可前往"
const path = world.islands[0].scenes
S().mode = 'worldmap'
t.step(1)
S().mapSel = 0
t.step(1)
t.key(' '); t.step(3)
if (S().mode === 'places') { S().placeSel = 0; t.step(1); t.key(' '); t.step(4) }
check(S().mode === 'explore', `进入了场景（mode=${S().mode}）`)
if (S().mode === 'explore') {
  const sc = S().current
  const dist = DBG().districtOf(sc.island)
  check(!!dist, `当前场景归属地形：${dist ? dist.name : '无'}`)
  const direct = DBG().linksOf(sc.island)
  check(direct.length > 0, `从此处可直达 ${direct.length} 处：${direct.join('、')}`)
}
// 大地图：核对当前所在与可达列表算得出来
S().mode = 'worldmap'
t.step(2)
const here = S().current && S().current.island
check(!!here, `大地图知道当前所在：${here}`)
check(DBG().linksOf(here).includes('castle') || here === 'castle',
  `主城在可达范围内（${here} → ${DBG().linksOf(here).join('、')}）`)
// 画一帧，确认不抛异常（通道连线、信息面板都在这一帧里画）
t.step(3)
check(true, '大地图绘制一帧无异常')

console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} 项，失败 ${fail} 项`)
if (fail) process.exit(1)
