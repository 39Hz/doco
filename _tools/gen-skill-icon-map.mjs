// 固化「图标 FLA 区间 / PNG 素材表 ↔ 技能 ID 段」的对应关系
//
// 【为什么这就是解】之前卡在"图标该配哪个技能名"—— 因为图标是按元素打包的、
//   技能名是按用途列的，两边看不出关系。现在有了官方技能表（编号ID），
//   而图标 FLA 的文件名**自带 ID 区间**（`skill_icon_301001_301020.fla`），
//   于是"区间内的第 N 个图标 = 区间内第 N 个技能 ID"这条映射可以建立起来（同序假设，可复核）。
//
// 产出：assets/skill-icon-map.json（区间 → 技能列表，供切图脚本按序命名）
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const off = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/skills-official.json'), 'utf8'))
const skills = off.skills
const flas = off.iconRanges

// 用户提供的 PNG 素材表 → 元素。
// ⚠️ 官方技能表里的系别写作 `火系/水系/…`（带"系"），而素材表名是 `火系/水系`、元素短名是 `火/水`，
//    第一版直接把长名和短名比对 → 全部匹配不上（打印出"(无对应表)"）。这里统一去掉"系"字。
const SHEET_EL = {
  火系: '火', 水系: '水', 风系: '风', 土系: '土', 光系: '光', 暗系: '暗', 毒系: '毒',
  无属性系: '物理', 宠物技能: '宠物',
}
const shortEl = (e) => String(e || '').replace(/系$/, '')

// 每张表切出的图标数（来自切片产物）
const sliced = JSON.parse(fs.readFileSync(path.join(ROOT, '_tmp_test_out/skill-icons-sliced/index.json'), 'utf8'))
const sheetCount = {}
for (const s of sliced.sheets) sheetCount[s.element] = s.count

// 元素 → 技能 ID 段（从官方表统计）
const segByEl = {}
for (const s of skills) {
  const seg = Math.floor(s.id / 1000)
  segByEl[seg] = segByEl[seg] || {}
  const k = shortEl(s.element); segByEl[seg][k] = (segByEl[seg][k] || 0) + 1
}
console.log('技能 ID 段的系别构成（用于把 FLA 区间归到元素）：')
for (const [seg, els] of Object.entries(segByEl).sort()) {
  console.log(`  ${seg}xxx  ${Object.entries(els).map(([e, n]) => `${e}×${n}`).join('  ')}`)
}

const map = { generated: new Date().toISOString(), note: '同序假设：区间内第 N 个图标 = 区间内第 N 个技能（ID 升序）。可用"图标主色 vs 技能系别"自动复核。', ranges: [] }
console.log('\n区间 ↔ 技能 ↔ 图标素材表：')
for (const f of flas) {
  const list = skills.filter((s) => s.id >= f.start && s.id <= f.end).sort((a, b) => a.id - b.id)
  if (!list.length) continue
  // 这个区间的系别（取多数）。
  // ⚠️ 官方表的系别写作「火系/物理」，素材表 key 也带「系」，而元素短名是「火」——
  //    第一版直接拿长名比短名，结果全部"(无对应表)"。统一用 shortEl() 归一。
  const els = {}
  for (const s of list) { const k = shortEl(s.element); els[k] = (els[k] || 0) + 1 }
  const el = Object.entries(els).sort((a, b) => b[1] - a[1])[0][0]
  const sheet = Object.entries(SHEET_EL).find(([, e]) => shortEl(e) === shortEl(el))?.[0] || '(无对应表)'
  const avail = sheetCount[sheet] ?? 0
  map.ranges.push({
    fla: f.file, start: f.start, end: f.end,
    element: el, sheet, iconsAvailable: avail,
    skills: list.map((s) => ({ id: s.id, name: s.name, type: s.type, desc: s.desc.slice(0, 40) })),
  })
  console.log(`  ${String(f.start)}~${String(f.end)}  ${el.padEnd(3)} ×${String(list.length).padStart(2)}  素材表「${sheet}」有 ${avail} 个图标  ${list.length === avail ? '✓ 数量相等' : `差 ${list.length - avail}`}`)
  console.log(`      技能：${list.slice(0, 6).map((s) => `${s.id} ${s.name.replace(/\n/g, '')}`).join('、')}${list.length > 6 ? ' …' : ''}`)
}
fs.writeFileSync(path.join(ROOT, 'assets/skill-icon-map.json'), JSON.stringify(map, null, 1))
console.log('\n已写出 assets/skill-icon-map.json')
