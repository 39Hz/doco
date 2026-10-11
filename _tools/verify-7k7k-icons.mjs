// 交叉验证 + 核对图
//  ① 7k7k 图标 与 项目原版图标 在**同名技能**上是否一致（若是同一批图，本项该通过）
//  ② 出一张按元素分组的核对图（图标 + 技能名编号）
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const DIR = path.join(ROOT, 'assets/skills')
const BAK = path.join(ROOT, '_tmp_test_out/orig-skill-icons')
const off = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/skills-official.json'), 'utf8'))
const k7 = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/skills-7k7k.json'), 'utf8'))

// 项目原版：旧图标 ID → 技能名（从 forms.js）
const vm = await import('node:vm')
const ctx = { window: {} }
vm.createContext(ctx)
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/forms.js'), 'utf8'), ctx)
const gameSkills = ctx.window.__DKDbb_FORMS__.skills || {}

const byName = new Map()
for (const s of off.skills) {
  const n = s.name.replace(/\n/g, '').trim()
  if (!byName.has(n)) byName.set(n, [])
  byName.get(n).push(s)
}

const norm = (img, S = 64) => {
  const out = new Float32Array(S * S * 4)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const sx = Math.min(img.w - 1, Math.floor(x * img.w / S)), sy = Math.min(img.h - 1, Math.floor(y * img.h / S))
    const si = (sy * img.w + sx) * 4, di = (y * S + x) * 4
    out[di] = img.data[si]; out[di + 1] = img.data[si + 1]; out[di + 2] = img.data[si + 2]; out[di + 3] = img.data[si + 3]
  }
  return out
}
const dist = (a, b) => {
  let s = 0, n = 0
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] < 40 && b[i + 3] < 40) continue
    s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n++
  }
  return n ? s / n / 3 : 999
}

console.log('=== ① 交叉验证：同名技能，项目原版 vs 7k7k ===')
let same = 0, diff = 0, checked = 0
for (const [name, rec] of Object.entries(gameSkills)) {
  const cands = byName.get(name)
  if (!cands) continue
  const oldP = path.join(BAK, rec.icon + '.png')
  if (!fs.existsSync(oldP)) continue
  // 找 7k7k 里同名条目
  const k = k7.skills.find((s) => s.name === name)
  if (!k || !k.thumb) continue
  // 7k7k 缩略图（相对路径）转成绝对
  const kp = path.join(ROOT, k.thumb)
  if (!fs.existsSync(kp)) continue
  // 7k7k 是 jpg（可能），用 python 转一下
  let kImg
  if (/\.png$/i.test(kp)) kImg = decodePng(fs.readFileSync(kp))
  else {
    const { execFileSync } = await import('node:child_process')
    const TMP = path.join(ROOT, '_tmp_test_out/_7k7k_conv')
    fs.mkdirSync(TMP, { recursive: true })
    const tp = path.join(TMP, path.basename(kp) + '.png')
    if (!fs.existsSync(tp)) execFileSync(path.join(ROOT, '_tools/py/python.exe'), ['-c', `from PIL import Image;Image.open(r"${kp}").convert("RGBA").save(r"${tp}")`], { stdio: 'ignore' })
    kImg = decodePng(fs.readFileSync(tp))
  }
  const d = dist(norm(decodePng(fs.readFileSync(oldP))), norm(kImg))
  checked++
  const v = d < 12 ? '✓ 一致' : d < 25 ? '~ 接近' : '✗ 不同'
  if (d < 12) same++; else diff++
  console.log(`  ${name.padEnd(10)} 原版 ${rec.icon}  vs 7k7k  色差 ${d.toFixed(1)}  ${v}`)
}
console.log(`\n一致 ${same} · 不同/接近 ${diff} · 共查 ${checked}`)

// === ② 核对图 ===
const list = []
for (const p of k7.skills) {
  const cands = byName.get(p.name)
  if (!cands) continue
  const hit = cands.find((c) => String(c.element).replace(/系$/, '') === p.el)
  if (!hit) continue
  const f = path.join(DIR, 'skill_icon_' + hit.id + '.png')
  if (!fs.existsSync(f)) continue
  list.push({ id: hit.id, name: p.name, el: p.el, file: f })
}
list.sort((a, b) => a.id - b.id)

const GROUPS = [['物理', 301], ['火', 302], ['水', 303], ['土', 304], ['风', 305], ['光', 306], ['暗', 307], ['毒', 308]]
const CELL = 64, GAP = 8, PAD = 14, BAND = 18
const cols = 13
const totW = PAD * 2 + cols * (CELL + GAP)
const totH = PAD * 2 + GROUPS.length * (BAND + CELL + GAP)
const fb = new Uint8ClampedArray(totW * totH * 4)
for (let i = 0; i < totW * totH; i++) { fb[i * 4] = 18; fb[i * 4 + 1] = 22; fb[i * 4 + 2] = 36; fb[i * 4 + 3] = 255 }
const BANDC = { 物理: [150, 100, 70], 火: [200, 80, 40], 水: [60, 120, 200], 土: [170, 110, 40], 风: [110, 110, 190], 光: [180, 80, 170], 暗: [170, 130, 60], 毒: [110, 150, 140] }
let oy = PAD
for (const [el, seg] of GROUPS) {
  const items = list.filter((x) => Math.floor(x.id / 1000) === seg)
  const bc = BANDC[el]
  for (let y = oy; y < oy + BAND - 4; y++) for (let x = PAD; x < totW - PAD; x++) {
    const d = (y * totW + x) * 4
    fb[d] = bc[0]; fb[d + 1] = bc[1]; fb[d + 2] = bc[2]
  }
  let ox = PAD
  for (const it of items) {
    const im = decodePng(fs.readFileSync(it.file))
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
      const sx = Math.min(im.w - 1, Math.floor(x * im.w / CELL)), sy = Math.min(im.h - 1, Math.floor(y * im.h / CELL))
      const si = (sy * im.w + sx) * 4, al = im.data[si + 3] / 255
      if (al <= 0) continue
      const d = ((oy + BAND + y) * totW + ox + x) * 4
      fb[d] = im.data[si] * al + fb[d] * (1 - al)
      fb[d + 1] = im.data[si + 1] * al + fb[d + 1] * (1 - al)
      fb[d + 2] = im.data[si + 2] * al + fb[d + 2] * (1 - al)
      fb[d + 3] = 255
    }
    ox += CELL + GAP
  }
  oy += BAND + CELL + GAP
}
fs.mkdirSync(path.join(ROOT, 'docs/shots'), { recursive: true })
const OUT = path.join(ROOT, 'docs/shots/skill-icons-7k7k.png')
fs.writeFileSync(OUT, encodePng(totW, totH, fb))
console.log(`\n已写出核对图 ${path.relative(ROOT, OUT)}（按元素分组，色带=元素）`)
console.log(`共 ${list.length} 个图标：` + GROUPS.map(([el, seg]) => `${el} ${list.filter((x) => Math.floor(x.id / 1000) === seg).length}`).join('  '))
