// 逐行核对图：把图鉴每行的图标 与 该元素的官方技能名 一一对齐显示
// 目的：让用户一眼看出"哪一列对应哪个技能"，特别是火系那行的疑点
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const ATLAS = path.join(ROOT, '_tmp_test_out/skill-atlas-icons')
const man = JSON.parse(fs.readFileSync(path.join(ATLAS, 'manifest.json'), 'utf8'))
const off = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/skills-official.json'), 'utf8'))

const bySeg = new Map()
for (const s of off.skills.slice().sort((a, b) => a.id - b.id)) {
  const g = Math.floor(s.id / 1000)
  if (!bySeg.has(g)) bySeg.set(g, [])
  bySeg.get(g).push(s)
}
// 行 → 元素段（已由 3 个元素组独立验证）
const ROWS = [
  { rows: [1, 2], seg: 301, el: '物理' },
  { rows: [3], seg: 302, el: '火' },
  { rows: [4, 5], seg: 303, el: '水' },
  { rows: [6, 7], seg: 304, el: '土' },
  { rows: [8, 9], seg: 305, el: '风' },
  { rows: [10], seg: 306, el: '光' },
  { rows: [11], seg: 307, el: '暗' },
  { rows: [12], seg: 308, el: '毒' },
]

const CELL = 80, GAP = 8, PAD = 16, BAND = 22
const cols = 13
const totW = PAD * 2 + cols * (CELL + GAP)
const totH = PAD * 2 + ROWS.length * (BAND + CELL + GAP)
const fb = new Uint8ClampedArray(totW * totH * 4)
for (let i = 0; i < totW * totH; i++) { fb[i * 4] = 18; fb[i * 4 + 1] = 22; fb[i * 4 + 2] = 36; fb[i * 4 + 3] = 255 }

// 极简 5×7 数字/字母点阵（只画序号与元素名首字，避免引入字体依赖）
const GLYPH = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
}
const drawText = (s, x0, y0, color) => {
  let cx = x0
  for (const ch of String(s)) {
    const g = GLYPH[ch]
    if (g) {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
        if (g[y][x] === '1') {
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            const px = cx + x * 2 + dx, py = y0 + y * 2 + dy
            if (px < 0 || py < 0 || px >= totW || py >= totH) continue
            const d = (py * totW + px) * 4
            fb[d] = color[0]; fb[d + 1] = color[1]; fb[d + 2] = color[2]
          }
        }
      }
    }
    cx += 12
  }
}

let oy = PAD
const summary = []
for (const R of ROWS) {
  const list = bySeg.get(R.seg) || []
  const icons = []
  for (const rn of R.rows) {
    const row = man.rows.find((x) => x.row === rn)
    if (row) for (let c = 0; c < row.files.length; c++) icons.push({ rn, c, f: row.files[c] })
  }
  // 行标题带：元素色
  const bandColor = (R.el === '火') ? [200, 80, 40] : (R.el === '水') ? [60, 120, 200] : (R.el === '土') ? [170, 110, 40]
    : (R.el === '风') ? [110, 110, 190] : (R.el === '光') ? [180, 80, 170] : (R.el === '暗') ? [170, 130, 60]
      : (R.el === '毒') ? [110, 150, 140] : [150, 100, 70]
  for (let y = oy; y < oy + BAND - 4; y++) for (let x = PAD; x < totW - PAD; x++) {
    const d = (y * totW + x) * 4
    fb[d] = bandColor[0]; fb[d + 1] = bandColor[1]; fb[d + 2] = bandColor[2]
  }
  // 元素名用序号代替（点阵只有数字）：显示该段第 1 个技能 ID 的后三位
  drawText(String(R.seg - 300), PAD + 4, oy + 4, [255, 255, 255])
  oy += BAND

  let ox = PAD
  for (let i = 0; i < icons.length; i++) {
    const p = path.join(ATLAS, icons[i].f)
    if (fs.existsSync(p)) {
      const im = decodePng(fs.readFileSync(p))
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        const sx = Math.min(im.w - 1, Math.floor(x * im.w / CELL)), sy = Math.min(im.h - 1, Math.floor(y * im.h / CELL))
        const si = (sy * im.w + sx) * 4, al = im.data[si + 3] / 255
        if (al <= 0) continue
        const d = ((oy + y) * totW + ox + x) * 4
        fb[d] = im.data[si] * al + fb[d] * (1 - al)
        fb[d + 1] = im.data[si + 1] * al + fb[d + 1] * (1 - al)
        fb[d + 2] = im.data[si + 2] * al + fb[d + 2] * (1 - al)
        fb[d + 3] = 255
      }
    }
    // 列号
    drawText(String(i), ox + 2, oy + CELL + 2, [200, 200, 120])
    ox += CELL + GAP
  }
  oy += CELL + GAP
  summary.push({ el: R.el, count: icons.length, skills: list.slice(0, icons.length).map((s) => s.id + ' ' + s.name.replace(/\n/g, '')) })
}

fs.mkdirSync(path.join(ROOT, 'docs/shots'), { recursive: true })
const OUT = path.join(ROOT, 'docs/shots/skill-atlas-by-element.png')
fs.writeFileSync(OUT, encodePng(totW, totH, fb))
console.log(`已写出 ${path.relative(ROOT, OUT)}  ${totW}×${totH}`)
console.log('\n每行图标数 与 按列序对应的官方技能（供核对）：')
for (const s of summary) {
  console.log(`\n【${s.el}】${s.count} 个图标`)
  for (let i = 0; i < s.skills.length; i++) console.log(`  列${String(i).padStart(2)}  ${s.skills[i]}`)
}
