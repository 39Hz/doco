// 并排出图：旧图标（已核对过）vs 我按官方 ID 裁的图标 —— 肉眼确认是否同一张图
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const DIR = path.join(ROOT, 'assets/skills')
const PAIRS = [
  ['重击', 'skill_icon_1001', 'skill_icon_301001'],
  ['火球', 'skill_icon_2001', 'skill_icon_302001'],
  ['冰枪', 'skill_icon_3001', 'skill_icon_303001'],
  ['地之咆哮', 'skill_icon_4001', 'skill_icon_304001'],
  ['闪电', 'skill_icon_5001', 'skill_icon_305001'],
]
const CELL = 96, GAP = 12, PAD = 14
const cols = 2
const totW = PAD * 2 + cols * CELL + GAP
const totH = PAD * 2 + PAIRS.length * (CELL + GAP)
const fb = new Uint8ClampedArray(totW * totH * 4)
for (let i = 0; i < totW * totH; i++) { fb[i * 4] = 20; fb[i * 4 + 1] = 24; fb[i * 4 + 2] = 40; fb[i * 4 + 3] = 255 }

const put = (img, ox, oy) => {
  if (!img) return
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    const sx = Math.min(img.w - 1, Math.floor(x * img.w / CELL)), sy = Math.min(img.h - 1, Math.floor(y * img.h / CELL))
    const si = (sy * img.w + sx) * 4, al = img.data[si + 3] / 255
    if (al <= 0) continue
    const d = ((oy + y) * totW + ox + x) * 4
    fb[d] = img.data[si] * al + fb[d] * (1 - al)
    fb[d + 1] = img.data[si + 1] * al + fb[d + 1] * (1 - al)
    fb[d + 2] = img.data[si + 2] * al + fb[d + 2] * (1 - al)
    fb[d + 3] = 255
  }
}
let oy = PAD
console.log('左=旧图标（已核对）  右=我按官方ID裁的')
for (const [name, oldId, newId] of PAIRS) {
  const o = fs.existsSync(path.join(DIR, oldId + '.png')) ? decodePng(fs.readFileSync(path.join(DIR, oldId + '.png'))) : null
  const n = fs.existsSync(path.join(DIR, newId + '.png')) ? decodePng(fs.readFileSync(path.join(DIR, newId + '.png'))) : null
  put(o, PAD, oy)
  put(n, PAD + CELL + GAP, oy)
  console.log(`  ${name.padEnd(8)} 旧 ${o ? o.w + 'x' + o.h : '缺'}   新 ${n ? n.w + 'x' + n.h : '缺'}`)
  oy += CELL + GAP
}
fs.mkdirSync(path.join(ROOT, 'docs/shots'), { recursive: true })
const OUT = path.join(ROOT, 'docs/shots/skill-icon-compare-old-new.png')
fs.writeFileSync(OUT, encodePng(totW, totH, fb))
console.log(`\n已写出 ${path.relative(ROOT, OUT)}  ${totW}×${totH}`)
