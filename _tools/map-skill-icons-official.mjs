// 建立「技能 ID → 图鉴行列」映射并裁出图标
//
// 【依据（都可复核）】
//   · 图鉴 12 行，每行一个元素（平均色与元素参考色距离 0~20，实测：土 0、光 0、风 1、火 3、水 5、物理 10）
//   · 锚定验证：已知名字的「地之咆哮」= 行6列0、「大地之怒」= 行6列2 ——
//     与 `assets/skills/index.json` 记录的「图鉴 y=1164 第0列 / 第2列」**完全一致**
//   · 所以：行 = 元素组，行内列序 = 该元素组内技能 ID 升序
//
// 【做不到的部分（如实标注）】图鉴总计 74 个图标，官方技能 217 个 ——
//   图鉴只画了"每个元素的主要技能"，等级系列技能（力量祝福Lv1~Lv5 等）共用一个图标。
//   所以只有前 74 个技能能拿到专属图标，其余按元素沿用同组图标（conf=derived），
//   并**在 index.json 里写明是沿用**，不假装是原版专属图标（R1/R9）。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const ATLAS = path.join(ROOT, '_tmp_test_out/skill-atlas-icons')
const OUTDIR = path.join(ROOT, 'assets/skills')
const DRY = process.argv.includes('--dry')

const man = JSON.parse(fs.readFileSync(path.join(ATLAS, 'manifest.json'), 'utf8'))
const off = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/skills-official.json'), 'utf8'))

// 图鉴行 → 官方技能 ID 段。
// 【依据】不是目视，是**已知图标的来源坐标**（`assets/skills/index.json` 里的 `from` 字段，
//   由并行线在自己那批图标上写好）：
//     重击   = 行1 列0      多重重击 = 行1 列1      破甲 = 行1 列2
//     迅捷飞刀 = 行2 列0
//   → 行 1+2 = 物理（301xxx）。
//   再验证：行 1 平均色 rgb(201,123,68) ≈「重击」rgb(212,141,106) —— 同一批图。
// ⚠️ 我曾据"核对图里第 1 行看着像红色"改成 [2,1] —— 那是**目视误判**（红橙≠火），已撤回。
const ROW_TO_SEG = [
  { rows: [1, 2], seg: 301, el: '物理' },   // 10 + 3 = 13
  { rows: [3], seg: 302, el: '火' },        // 8
  { rows: [4, 5], seg: 303, el: '水' },     // 8 + 4 = 12
  { rows: [6, 7], seg: 304, el: '土' },     // 10 + 1 = 11
  { rows: [8, 9], seg: 305, el: '风' },     // 10 + 1 = 11
  { rows: [10], seg: 306, el: '光' },       // 5
  { rows: [11], seg: 307, el: '暗' },       // 7
  { rows: [12], seg: 308, el: '毒' },       // 7
]

const bySeg = new Map()
for (const s of off.skills.slice().sort((a, b) => a.id - b.id)) {
  const g = Math.floor(s.id / 1000)
  if (!bySeg.has(g)) bySeg.set(g, [])
  bySeg.get(g).push(s)
}

console.log('=== 映射方案 ===')
const plan = []          // { skill, row, col, conf }
for (const m of ROW_TO_SEG) {
  const list = bySeg.get(m.seg) || []
  const icons = []
  for (const r of m.rows) {
    const row = man.rows.find((x) => x.row === r)
    if (!row) { console.log(`  ⚠️ 找不到行 ${r}`); continue }
    for (let c = 0; c < row.files.length; c++) icons.push({ row: r, col: c, file: row.files[c] })
  }
  console.log(`  ${m.el}（${m.seg}xxx）：图鉴 ${icons.length} 个图标 vs 技能 ${list.length} 个`)
  for (let i = 0; i < list.length; i++) {
    // 图标不够时按元素沿用同组第一个（并标注 derived）
    const direct = i < icons.length
    plan.push({
      skill: list[i],
      icon: direct ? icons[i] : icons[icons.length - 1],
      conf: direct ? 'official' : 'derived（沿用同元素图标：图鉴未单独绘制）',
    })
  }
}

console.log(`\n共 ${plan.length} 个技能可挂图标`)
const official = plan.filter((p) => p.conf === 'official').length
console.log(`  专属图标（图鉴直接对应）：${official}`)
console.log(`  沿用同元素图标：${plan.length - official}`)

if (DRY) {
  console.log('\n（--dry：未写出文件）')
  console.log('\n前 8 条：')
  for (const p of plan.slice(0, 8)) console.log(`  ${p.skill.id} ${p.skill.name.replace(/\n/g, '')}  ←  行${p.icon.row}列${p.icon.col}  [${p.conf}]`)
  process.exit(0)
}

// ---- 写出 ----
fs.mkdirSync(OUTDIR, { recursive: true })
const idxPath = path.join(OUTDIR, 'index.json')
const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'))
const byId = new Map(idx.icons.map((i) => [i.id, i]))
let n = 0
for (const p of plan) {
  const src = path.join(ATLAS, p.icon.file)
  if (!fs.existsSync(src)) continue
  const file = `assets/skills/skill_icon_${p.skill.id}.png`
  fs.copyFileSync(src, path.join(ROOT, file))
  n++
  const rec = {
    id: p.skill.id,
    name: p.skill.name.replace(/\n/g, ''),
    file,
    from: `技能ICON.png 行${p.icon.row} 列${p.icon.col}`,
    evidence: `第 55 轮：图鉴行=元素组、行内列序=技能ID升序（锚定验证见 _tools/match-atlas-anchors.mjs）`,
    element: p.skill.element,
    conf: p.conf.startsWith('official') ? 'official' : 'derived',
    confNote: p.conf.startsWith('official') ? '' : p.conf,
  }
  if (byId.has(p.skill.id)) Object.assign(byId.get(p.skill.id), rec)
  else { idx.icons.push(rec); byId.set(p.skill.id, rec) }
}
idx.generated = new Date().toISOString()
idx.note = (idx.note || '') + ` 第 55 轮：按官方技能表 + 图鉴行列对应补齐技能图标（写出 ${n} 张）。`
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 1))
console.log(`\n✓ 写出 ${n} 张 → assets/skills/，index.json 现 ${idx.icons.length} 条`)
