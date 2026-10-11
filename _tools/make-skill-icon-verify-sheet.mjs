// 技能图标核对图：把 74 个"专属图标"按图鉴行列排开，带行列与对应技能序号
// 用途：让用户一眼核对映射对不对（比看数字强）
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
const ROW_TO_SEG = [[1, 2, 301, '物理'], [3, 0, 302, '火'], [4, 5, 303, '水'], [6, 7, 304, '土'],
[8, 9, 305, '风'], [10, 0, 306, '光'], [11, 0, 307, '暗'], [12, 0, 308, '毒']]

const CELL = 72, GAP = 8, PAD = 16, LAB = 26
const cols = 13
const rowsOut = ROW_TO_SEG.length
const totW = PAD * 2 + cols * (CELL + GAP)
const totH = PAD * 2 + rowsOut * (CELL + GAP + LAB)
const fb = new Uint8ClampedArray(totW * totH * 4)
for (let i = 0; i < totW * totH; i++) { fb[i * 4] = 18; fb[i * 4 + 1] = 22; fb[i * 4 + 2] = 36; fb[i * 4 + 3] = 255 }

let oy = PAD
let total = 0
for (const [r1, r2, seg, el] of ROW_TO_SEG) {
  const rowNums = r2 ? [r1, r2] : [r1]
  const icons = []
  for (const rn of rowNums) {
    const row = man.rows.find((x) => x.row === rn)
    if (row) for (let c = 0; c < row.files.length; c++) icons.push({ rn, c, f: row.files[c] })
  }
  const list = bySeg.get(seg) || []
  let ox = PAD
  for (let i = 0; i < icons.length; i++) {
    const ic = icons[i]
    const p = path.join(ATLAS, ic.f)
    if (!fs.existsSync(p)) continue
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
    // 底部色条：专属=绿，沿用=橙
    const direct = i < list.length
    for (let y = oy + CELL; y < oy + CELL + 4; y++) for (let x = ox; x < ox + CELL; x++) {
      const d = (y * totW + x) * 4
      fb[d] = direct ? 80 : 220; fb[d + 1] = direct ? 200 : 140; fb[d + 2] = direct ? 120 : 60
    }
    ox += CELL + GAP
    total++
  }
  oy += CELL + GAP + LAB
}

fs.mkdirSync(path.join(ROOT, 'docs/shots'), { recursive: true })
const OUT = path.join(ROOT, 'docs/shots/skill-icons-official.png')
fs.writeFileSync(OUT, encodePng(totW, totH, fb))
console.log(`已写出 ${path.relative(ROOT, OUT)}  ${totW}×${totH}`)
console.log(`行顺序（上→下）：${ROW_TO_SEG.map((x) => x[3]).join('  ')}`)
console.log(`共 ${total} 个图标（绿条=图鉴专属对应，橙条=沿用同元素）`)
console.log('\n每行对应技能（前 3 个）：')
for (const [r1, r2, seg, el] of ROW_TO_SEG) {
  const list = bySeg.get(seg) || []
  console.log(`  ${el.padEnd(3)} ${list.slice(0, 3).map((s) => s.id + ' ' + s.name.replace(/\n/g, '')).join('、')} …`)
}
