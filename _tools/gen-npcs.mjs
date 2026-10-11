// 官方 NPC 表 -> assets/npcs.js
//
// 数据源：归档 `多克多比专区资料素材\npc大全\NPC.xlsx`（**官方策划表，70 个 NPC**）
//   列：ID | 截图 | 名称 | 身份 | 位置 | 鼠标焦点对话 | 普通对话 | NPC描述
//   这张表此前从没被任何工具读过 —— 于是游戏里的 NPC 一直说着**程序生成的通用台词**。
//
// 放置规则（**只认精确匹配**，宁可少放也不硬凑）：
//   ① 位置 == 某个场景的 title        → 放那个场景
//   ② 位置 == 七大地形之一            → 放该地形（地形名与官方区域名完全一致）
//   ③ 位置 == 某座岛的名字            → 放那座岛
//   ④ 其余 → **unmapped**，如实列出来（不许拿"看起来像"的地点顶替，R9）
//
// 用法: node _tools/gen-npcs.mjs
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { readXlsx } from './xlsx.mjs'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, '多克多比专区资料素材', 'npc大全', 'NPC.xlsx')
if (!fs.existsSync(SRC)) { console.error('找不到 NPC.xlsx：' + SRC); process.exit(2) }

const { sheets } = readXlsx(SRC)
const rows = sheets[0].rows
let head = -1
for (let i = 0; i < Math.min(6, rows.length); i++) {
  if ((rows[i] || []).some((c) => String(c).includes('位置'))) { head = i; break }
}
if (head < 0) { console.error('找不到表头行（含「位置」的那行）'); process.exit(2) }
const col = (r, i) => String((r && r[i]) || '').trim()

const raw = []
for (let i = head + 1; i < rows.length; i++) {
  const r = rows[i]
  const id = col(r, 0)
  if (!/^NPC/i.test(id)) continue
  raw.push({
    id,
    shot: col(r, 1),
    name: col(r, 2),          // 只有「克里文」有名字，其余为空
    role: col(r, 3),          // 身份：广场守护者 / 多比广场老爷爷 / …
    place: col(r, 4),
    hover: col(r, 5),
    talk: col(r, 6).replace(/——?\s*离开\s*$/, '').trim(),
    desc: col(r, 7),
  })
}
console.log(`NPC.xlsx：读到 ${raw.length} 个 NPC`)

// ---------- 我们的世界 ----------
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'))
const sceneByTitle = new Map()
for (const s of man.scenes) if (!sceneByTitle.has(s.title)) sceneByTitle.set(s.title, s.id)

const ctx = { window: {} }
vm.createContext(ctx)
vm.runInContext(fs.readFileSync(path.join(ROOT, 'world.js'), 'utf8'), ctx, { filename: 'world.js' })
const WORLD = ctx.window.__DKDbb_WORLD__ || ctx.window.DKDbbWorld
const districtByName = new Map((WORLD.districts || []).map((d) => [d.name, d]))
const islandByName = new Map((WORLD.islands || []).map((i) => [i.name, i]))
// 地形 -> 它的场景（用 islands[].scenes 反查，取该地形下的第一个场景，确定性）
const sceneOfDistrict = new Map()
for (const isl of WORLD.islands) {
  for (const sid of isl.scenes) {
    const s = man.scenes.find((x) => x.id === sid)
    if (!s) continue
    const dist = (WORLD.districts || []).find((d) => (isl.districts || []).includes(d.id) || d.islands && d.islands.includes(isl.id))
    if (dist && !sceneOfDistrict.has(dist.name)) sceneOfDistrict.set(dist.name, sid)
  }
}

// 地形 -> 它下面的**全部场景**；岛 -> 它的全部场景。
// 放置时要把"目标"落到具体场景 id 上，游戏那边才好直接用（不必再算一遍世界结构）。
const scenesOfIsland = new Map((WORLD.islands || []).map((i) => [i.id, (i.scenes || []).slice()]))
const scenesOfDistrict = new Map()
for (const d of (WORLD.districts || [])) {
  const ids = []
  for (const iid of (d.islands || [])) ids.push(...(scenesOfIsland.get(iid) || []))
  scenesOfDistrict.set(d.name, ids)
}
console.log(`地形→场景：${[...scenesOfDistrict.entries()].map(([n, ids]) => `${n}(${ids.length})`).join(' ')}`)

// ---------- 放置 ----------
// 先按"官方表里到底有没有内容"分三类（这是表本身的结构，不是我们的取舍）：
//   · 有对话/焦点语 + 有位置 → 可放置
//   · 有内容但位置对不上我们的世界 → unmapped（如实列出，不硬凑）
//   · 官方表里就是空的（ID 里常写着「暂缺」「新增)」）→ unfilled
//     —— 这类**不能算我们的缺失**，是原表自己还没写。
const entries = []
const unmapped = []
const unfilled = []
const byPlace = new Map()
for (const n of raw) {
  const place = n.place
  if (place) byPlace.set(place, (byPlace.get(place) || 0) + 1)
  const hasContent = !!(n.talk || n.hover)
  if (!hasContent) { unfilled.push(n); continue }
  let target = null
  if (sceneByTitle.has(place)) target = { kind: 'scene', id: sceneByTitle.get(place), sceneIds: [sceneByTitle.get(place)] }
  else if (islandByName.has(place)) {
    const isl = islandByName.get(place)
    target = { kind: 'island', id: isl.id, sceneIds: scenesOfIsland.get(isl.id) || [] }
  } else if (districtByName.has(place)) {
    const d = districtByName.get(place)
    target = { kind: 'district', id: d.id, name: place, sceneIds: scenesOfDistrict.get(place) || [] }
  }
  if (!target || !target.sceneIds.length) { unmapped.push(n); continue }
  // 显示名：官方表里只有 1 个 NPC 有「名称」列，其余用「身份」；身份也空的话只能给一个通用称呼，
  // 并且**标明这是推算的**（不许让人以为原版就叫这个）。
  const displayName = n.name || n.role || '多克居民'
  const nameSource = n.name ? 'official（名称列）' : n.role ? 'official（身份列）' : 'derived（表里名称为空，用通用称呼）'
  entries.push({
    id: n.id, displayName, role: n.role, nameSource,
    place, hover: n.hover, talk: n.talk, desc: n.desc,
    target,
  })
}
console.log(`可放置 ${entries.length} 个；位置对不上 ${unmapped.length} 个；官方表里本身为空 ${unfilled.length} 个`)

const out = {
  generated: new Date().toISOString(),
  source: '多克多比专区资料素材/npc大全/NPC.xlsx（官方策划表，逐字引用：名称 / 身份 / 位置 / 鼠标焦点对话 / 普通对话）',
  note: '放置**只认精确匹配**：位置 == 场景名 / 岛名 / 七大地形名。对不上的一律放进 unmapped，不硬凑（R9）。'
    + '官方表里本身就是空白的行放进 unfilled —— 那是原表还没写，不算我们的缺失。',
  counts: {
    total: raw.length, placed: entries.length, unmapped: unmapped.length,
    unfilled: unfilled.length, places: byPlace.size,
  },
  entries,
  unmapped: unmapped.map((n) => ({
    id: n.id, role: n.role || '（身份为空）', place: n.place || '（位置为空）',
    why: n.place ? '我们世界里的场景/岛屿/地形没有与它同名的地点' : '官方表里没有填位置',
  })),
  unfilled: unfilled.map((n) => ({ id: n.id, role: n.role || null, place: n.place || null, why: '官方表里这一行本身就是空的（ID 里常带「暂缺」「新增)」）' })),
}

const js = '/* 自动生成，勿手改。重跑 _tools/gen-npcs.mjs */\n' +
  'window.__DKDbb_NPCS__ = ' + JSON.stringify(out) + ';\n'
fs.writeFileSync(path.join(ROOT, 'assets', 'npcs.js'), js, 'utf8')
console.log(`已写出 assets/npcs.js（${(js.length / 1024).toFixed(0)} KB）`)

// ---------- 自检（R5）----------
console.log('\n自检：')
let bad = 0
const c1 = raw.length >= 60
console.log(`  ${c1 ? '✓' : '✗'} 表里读到 ${raw.length} 个 NPC（预期 70 上下）`)
if (!c1) bad++
const noContent = entries.filter((n) => !n.talk && !n.hover)
console.log(`  ${noContent.length === 0 ? '✓' : '✗'} 可放置的每个都有原文（对话或焦点语）（缺 ${noContent.length}）`)
if (noContent.length) bad++
// 「身份」列官方自己就有空的（实测 1 个：NPC-05-01/勇气峡谷）。
// 所以不该要求"每个都有身份"，而该要求"**没有身份的必须如实标成 derived**、不许冒充官方名"。
const noRole = entries.filter((n) => !n.role)
const noRoleOk = noRole.every((n) => n.nameSource.startsWith('derived'))
console.log(`  ${noRoleOk ? '✓' : '✗'} 身份列为空的 ${noRole.length} 个都退回了 derived 通用称呼（${noRole.map((n) => n.id).join('、') || '无'}）`)
if (!noRoleOk) bad++
// 放置必须**只**来自精确匹配 —— 逐条复核一遍
const wrong = entries.filter((e) => {
  if (e.target.kind === 'scene') return !sceneByTitle.has(e.place) || sceneByTitle.get(e.place) !== e.target.id
  if (e.target.kind === 'island') return !islandByName.has(e.place) || islandByName.get(e.place).id !== e.target.id
  return !districtByName.has(e.place)
})
console.log(`  ${wrong.length === 0 ? '✓' : '✗'} 每一条放置都能追溯到精确同名（异常 ${wrong.length}）`)
if (wrong.length) bad++
const c2 = entries.length + unmapped.length + unfilled.length === raw.length
console.log(`  ${c2 ? '✓' : '✗'} 可放置 + 位置对不上 + 官方表本身为空 = 总数（${entries.length} + ${unmapped.length} + ${unfilled.length} = ${raw.length}）`)
if (!c2) bad++
// 通用称呼必须标成 derived，不许冒充官方名
const claimed = entries.filter((n) => n.displayName === '多克居民' && n.nameSource !== 'derived（表里名称为空，用通用称呼）')
console.log(`  ${claimed.length === 0 ? '✓' : '✗'} 没有官方名的 NPC 都标了 derived（异常 ${claimed.length}）`)
if (claimed.length) bad++
console.log(`\n  可放置 ${entries.length} 个，涉及地点：${[...new Set(entries.map((e) => e.place))].join('、')}`)
console.log(`  官方表里本身为空：${unfilled.map((n) => n.id).join('、')}`)
if (bad) process.exit(1)
