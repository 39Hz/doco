// 核实并修复：assets/skills 下的图标有两套编号（官方 ID / 游戏编号），
// 而 index.json 只登记了一部分 → 看起来像 97 个"孤儿文件"。
//
// 目的：让**索引覆盖磁盘上的每个图标文件**，并给每条标清来源（R12 单一事实源）。
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const ROOT = path.resolve('.')
const DIR = path.join(ROOT, 'assets/skills')
const idxPath = path.join(DIR, 'index.json')
const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'))

// 技能表实际引用了哪些图标
const DKDbbData = {}
const ctx = { window: { DKDbbData }, console }
vm.createContext(ctx)
vm.runInContext(fs.readFileSync(path.join(ROOT, 'game/tables/skills-official.js'), 'utf8'), ctx)
const T = ctx.window.DKDbbData.SKILLS
const usedByTable = new Map()          // 图标文件 → 技能名
for (const [name, v] of Object.entries(T)) if (v.icon) usedByTable.set(v.icon + '.png', name)

// forms.js 也引用（旧编号那 17 个）
const fctx = { window: {} }
vm.createContext(fctx)
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/forms.js'), 'utf8'), fctx)
for (const [name, v] of Object.entries(fctx.window.__DKDbb_FORMS__.skills || {})) {
  if (v.icon) usedByTable.set(v.icon + '.png', name)
}

const indexed = new Map(idx.icons.map((e) => [path.basename(e.file), e]))
const onDisk = fs.readdirSync(DIR).filter((f) => f.endsWith('.png')).sort()
console.log(`磁盘 ${onDisk.length} · 索引 ${indexed.size} · 技能表引用 ${usedByTable.size}`)

let added = 0, orphan = []
for (const f of onDisk) {
  if (indexed.has(f)) continue
  const skill = usedByTable.get(f)
  const idm = f.match(/^skill_icon_(\d+)\.png$/)
  const rec = {
    id: idm ? Number(idm[1]) : null,
    name: skill || '(未被技能表引用)',
    file: `assets/skills/${f}`,
    from: idm ? '第 55 轮：7k7k 角色大全缩略图（游戏编号格式）' : '来源不明',
    evidence: skill
      ? `被技能表 game/tables/skills-official.js 引用为「${skill}」的图标`
      : '**未被任何地方引用** —— 待确认是否可删',
    source: skill ? '7k7k' : '待确认',
  }
  idx.icons.push(rec)
  indexed.set(f, rec)
  added++
  if (!skill) orphan.push(f)
}

idx.generated = new Date().toISOString()
idx.note = (idx.note || '') + ` 第 55 轮：把磁盘上的全部图标登记进索引（补 ${added} 条），并标出未被引用的。`
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 1))

console.log(`补登记 ${added} 条；索引现 ${idx.icons.length} 条`)
if (orphan.length) {
  console.log(`\n⚠️ 仍未被引用的 ${orphan.length} 个（可考虑删除，但先确认）：`)
  console.log('  ' + orphan.slice(0, 20).join(', '))
} else {
  console.log('✓ 磁盘上的每个图标都被索引覆盖，且都有引用来源')
}

// 反向检查：索引里有、磁盘上没有的
const missing = idx.icons.filter((e) => !fs.existsSync(path.join(ROOT, e.file)))
console.log(`\n索引指向不存在文件：${missing.length} 个${missing.length ? ' → ' + missing.slice(0, 6).map((e) => e.file).join(', ') : ''}`)
