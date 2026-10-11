// 自检：我给官方 ID 写的图标，是否与"已知名字的那批图标"逐像素一致？
//
// 【为什么这一验最关键】游戏里已有 17 个技能图标且**已肉眼核对过**（`assets/skills/skill_icon_1001.png` 等）。
//   如果我的映射正确，那么：
//     301001(重击) 应与 1001(重击) 相同       302001(火球) 应与 2001(火球) 相同
//     303001(冰枪) 应与 3001(冰枪) 相同       304001(地之咆哮) 应与 4001(地之咆哮) 相同
//   一致 → 映射对；不一致 → 映射错位，必须修。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const DIR = path.join(ROOT, 'assets/skills')

// 官方技能名 → 官方 ID（从 assets/skills-official.json）
const off = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/skills-official.json'), 'utf8'))
const byName = new Map()
for (const s of off.skills) {
  const n = s.name.replace(/\n/g, '').trim()
  if (!byName.has(n)) byName.set(n, s)
}

// 游戏技能名 → 旧图标 ID（从 assets/forms.js 的 skills 表）
const vm = await import('node:vm')
const ctx = { window: {} }
vm.createContext(ctx)
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/forms.js'), 'utf8'), ctx)
const sk = ctx.window.__DKDbb_FORMS__.skills || {}

const load = (p) => {
  if (!fs.existsSync(p)) return null
  return decodePng(fs.readFileSync(p))
}
const dist = (a, b) => {
  if (!a || !b) return null
  const S = 64
  let s = 0, n = 0
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const ax = Math.min(a.w - 1, Math.floor(x * a.w / S)), ay = Math.min(a.h - 1, Math.floor(y * a.h / S))
    const bx = Math.min(b.w - 1, Math.floor(x * b.w / S)), by = Math.min(b.h - 1, Math.floor(y * b.h / S))
    const ai = (ay * a.w + ax) * 4, bi = (by * b.w + bx) * 4
    if (a.data[ai + 3] < 40 && b.data[bi + 3] < 40) continue
    s += Math.abs(a.data[ai] - b.data[bi]) + Math.abs(a.data[ai + 1] - b.data[bi + 1]) + Math.abs(a.data[ai + 2] - b.data[bi + 2])
    n++
  }
  return n ? s / n / 3 : 999
}

console.log('游戏技能名  |  旧图标 → 官方ID  |  两张图是否一致')
let ok = 0, bad = 0, miss = 0
const badList = []
for (const [name, rec] of Object.entries(sk)) {
  const official = byName.get(name.replace(/\s+/g, ' ').trim()) || byName.get(name.trim())
  if (!official) { console.log(`  ${name.padEnd(8)}  ⚠️ 官方表里没有同名技能`); miss++; continue }
  const oldImg = load(path.join(DIR, rec.icon + '.png'))
  const newImg = load(path.join(DIR, 'skill_icon_' + official.id + '.png'))
  const d = dist(oldImg, newImg)
  const verdict = d === null ? '缺图' : d < 8 ? '✓ 一致' : d < 18 ? '~ 接近' : '✗ 不一致'
  if (d !== null && d < 8) ok++
  else if (d === null) miss++
  else { bad++; badList.push({ name, old: rec.icon, id: official.id, d: d.toFixed(1) }) }
  console.log(`  ${name.padEnd(9)} ${String(rec.icon).padEnd(18)} → ${official.id}  ${verdict}${d !== null ? `（色差 ${d.toFixed(1)}）` : ''}`)
}
console.log(`\n一致 ${ok} · 不一致/接近 ${bad} · 缺失 ${miss}`)
if (badList.length) {
  console.log('\n需要检查的：')
  for (const b of badList) console.log(`  ${b.name}（旧 ${b.old} → 官方 ${b.id}）色差 ${b.d}`)
}
process.exit(bad === 0 ? 0 : 1)
