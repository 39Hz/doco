// 一步重建：7k7k 技能图标全部接入（修好元素归一化之后）
//
// 背景：元素归一化有过两个 bug ——
//   ① `normEl` 在导出脚本里没生效 → skills-7k7k.json 里混着「火属性」「无属性」
//   ② 用 `--dry` 跑导入 → JSON 没被重新生成，改了个寂寞
// 本脚本把整条链**串起来跑**，避免再漏步骤：
//   1) 生成 7k7k 数据（含元素归一化）—— 非 dry
//   2) 按"名字+元素"匹配官方表，写出图标文件（游戏编号规则）
//   3) 生成图标映射 assets/skill-icons-7k7k.json
//   4) 重新合并技能表 game/tables/skills-official.js
//   5) 校验：表里每个 icon 的文件都在磁盘上
//
// 用法: node _tools/rebuild-7k7k-skill-icons.mjs
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const DIR = path.join(ROOT, 'assets/skills')
const BAK = path.join(ROOT, '_tmp_test_out/orig-skill-icons')
const TMP = path.join(ROOT, '_tmp_test_out/_7k7k_conv')
fs.mkdirSync(TMP, { recursive: true })

const step = (n, s) => console.log(`\n=== ${n}. ${s} ===`)

// ---------- 1) 生成 7k7k 数据 ----------
step(1, '生成 7k7k 技能数据（元素归一化）')
execFileSync(process.execPath, [path.join(ROOT, '_tools/import-7k7k-skill-icons.mjs')], { stdio: 'inherit', cwd: ROOT })
const k7 = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/skills-7k7k.json'), 'utf8'))
const off = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/skills-official.json'), 'utf8'))

const byName = new Map()
for (const s of off.skills) {
  const n = s.name.replace(/\n/g, '').trim()
  if (!byName.has(n)) byName.set(n, [])
  byName.get(n).push(s)
}
const SEG_EL = { 301: '物理', 302: '火', 303: '水', 304: '土', 305: '风', 306: '光', 307: '暗', 308: '毒' }
const EL_DIGIT = { 物理: 1, 火: 2, 水: 3, 土: 4, 风: 5, 毒: 6 }

// ---------- 2) 匹配 + 写图标 ----------
step(2, '按「名字+元素」匹配官方表并写出图标')
const matched = []
for (const p of k7.skills) {
  const cands = byName.get(p.name)
  if (!cands) continue
  const hit = cands.find((c) => String(c.element).replace(/(属性|系)$/, '') === p.el)
  if (hit) matched.push({ p, off: hit })
}
console.log(`  名字+元素 双确认：${matched.length} 个`)

let written = 0, skippedExisting = 0
const bySkill = {}

// 元素位（游戏既有约定：1=物理 2=火 3=水 4=土 5=风；毒/光/暗为本项目新增约定）
const EL_DIGIT_ALL = { 物理: 1, 火: 2, 水: 3, 土: 4, 风: 5, 毒: 6, 光: 7, 暗: 8 }
// 「只 7k7k 有」的技能（官方表里没有 → 没有官方 ID 可推编号）。
// 给它们**追加式编号**（9x），不占用官方序号位，并在 evidence 里写明来源。
// 实测这 3 个：狂毒专属(毒) / 龙卷火焰(火) / 圣光剑雨(光)。
const APPEND_SEQ = { 毒: 91, 火: 91, 光: 91, 水: 91, 土: 91, 风: 91, 物理: 91, 暗: 91 }
const usedAppend = {}
function writeIcon(srcThumb, gameId) {
  const newName = `skill_icon_${gameId}.png`
  const dst = path.join(DIR, newName)
  if (fs.existsSync(dst)) return false
  if (!srcThumb) return false
  const kp = path.join(ROOT, srcThumb)
  if (!fs.existsSync(kp)) return false
  let imgPath = kp
  if (!/\.png$/i.test(kp)) {
    imgPath = path.join(TMP, path.basename(kp) + '.png')
    if (!fs.existsSync(imgPath)) {
      execFileSync(path.join(ROOT, '_tools/py/python.exe'),
        ['-c', `from PIL import Image;Image.open(r"${kp}").convert("RGBA").save(r"${imgPath}")`], { stdio: 'ignore' })
    }
  }
  const im = decodePng(fs.readFileSync(imgPath))
  const S = 64
  const out = new Uint8ClampedArray(S * S * 4)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const sx = Math.min(im.w - 1, Math.floor(x * im.w / S)), sy = Math.min(im.h - 1, Math.floor(y * im.h / S))
    const si = (sy * im.w + sx) * 4, di = (y * S + x) * 4
    out[di] = im.data[si]; out[di + 1] = im.data[si + 1]; out[di + 2] = im.data[si + 2]; out[di + 3] = im.data[si + 3]
  }
  fs.writeFileSync(dst, encodePng(S, S, out))
  return true
}

for (const m of matched) {
  const idStr = String(m.off.id)
  const seg = Math.floor(Number(idStr) / 1000)
  const seq = Number(idStr) % 1000
  const el = SEG_EL[seg] || m.p.el
  const digit = EL_DIGIT[el]
  if (!digit) { console.log(`  ⊘ ${m.p.name}：元素 ${el} 无编号约定`); continue }
  const gameId = `${digit}${String(seq).padStart(3, '0')}`
  const dst = path.join(DIR, `skill_icon_${gameId}.png`)

  if (fs.existsSync(dst)) { skippedExisting++; bySkill[m.p.name] = { gameIcon: `skill_icon_${gameId}`, officialId: m.off.id, element: el }; continue }
  if (writeIcon(m.p.thumb, gameId)) {
    written++
    bySkill[m.p.name] = { gameIcon: `skill_icon_${gameId}`, officialId: m.off.id, element: el, iconIdRule: `元素位 ${digit}(${el}) + 组内序号 ${seq}` }
  }
}
console.log(`  新写图标 ${written} 个 · 已存在跳过 ${skippedExisting} 个`)

// ---------- 2b) 「只 7k7k 有」的技能（官方表里没有 → 没有官方 ID）----------
// 实测这 3 个漏掉了：狂毒专属(毒) / 龙卷火焰(火) / 圣光剑雨(光)。
// 给它们**追加式编号**（序号 9x），既接上图标又不占用任何官方序号位。
const matchedNames = new Set(matched.map((m) => m.p.name))
let appendWritten = 0
for (const p of k7.skills) {
  if (matchedNames.has(p.name)) continue
  if (!p.thumb) continue
  const el = p.el
  const digit = EL_DIGIT_ALL[el]
  if (!digit) { console.log(`  ⊘ ${p.name}：元素 ${el} 无编号约定`); continue }
  usedAppend[el] = (usedAppend[el] || APPEND_SEQ[el] || 91)
  const seq = usedAppend[el]++
  const gameId = `${digit}${String(seq).padStart(3, '0')}`
  if (writeIcon(p.thumb, gameId)) {
    appendWritten++
    bySkill[p.name] = { gameIcon: `skill_icon_${gameId}`, officialId: null, element: el, appended: true, note: '官方表无此技能 → 追加式编号（不占官方序号位）' }
    console.log(`  + ${p.name}（${el}）→ skill_icon_${gameId}（追加式）`)
  }
}
console.log(`  追加式新写 ${appendWritten} 个`)

// ---------- 3) 映射 ----------
step(3, '写出图标映射 assets/skill-icons-7k7k.json')
fs.writeFileSync(path.join(ROOT, 'assets/skill-icons-7k7k.json'), JSON.stringify({
  generated: new Date().toISOString(),
  source: '多克多比_7k7k美术资源_20260929（角色大全技能条目缩略图）',
  rule: 'skill_icon_<元素位><三位序号>；元素位 1=物理 2=火 3=水 4=土 5=风 6=毒（毒为本项目新增约定）；序号=官方元素组内序号',
  count: Object.keys(bySkill).length,
  bySkill,
}, null, 1))
console.log(`  ${Object.keys(bySkill).length} 条`)

// ---------- 4) 重新合并技能表 ----------
step(4, '重新合并技能表')
execFileSync(process.execPath, [path.join(ROOT, '_tools/merge-skills3.mjs')], { stdio: 'inherit', cwd: ROOT })

// ---------- 5) 校验 ----------
step(5, '校验图标文件')
execFileSync(process.execPath, [path.join(ROOT, '_tools/verify-skill-icons-wired.mjs')], { stdio: 'inherit', cwd: ROOT })

// 原版 17 个必须仍逐字节一致
let same = 0
for (const f of fs.readdirSync(BAK)) {
  const d = path.join(DIR, f)
  if (fs.existsSync(d) && fs.readFileSync(d).equals(fs.readFileSync(path.join(BAK, f)))) same++
}
console.log(`\n原版 17 个图标逐字节一致：${same}/17`)
