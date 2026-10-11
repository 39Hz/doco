// 新增技能图标核对图（39 个，按元素分组，带元素色带）
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/skills/index.json'), 'utf8'))
const list = idx.icons.filter((i) => i.source === '7k7k').sort((a, b) => a.id - b.id)

const GROUPS = [['物理', 301], ['火', 302], ['水', 303], ['土', 304], ['风', 305], ['光', 306], ['暗', 307], ['毒', 308]]
const BANDC = { 物理: [150, 100, 70], 火: [200, 80, 40], 水: [60, 120, 200], 土: [170, 110, 40], 风: [110, 110, 190], 光: [180, 80, 170], 暗: [170, 130, 60], 毒: [110, 150, 140] }
const present = GROUPS.filter(([el, seg]) => list.some((x) => Math.floor(x.id / 1000) === seg))

const CELL = 72, GAP = 8, PAD = 14, BAND = 18
const cols = Math.max(...present.map(([, seg]) => list.filter((x) => Math.floor(x.id / 1000) === seg).length))
const totW = PAD * 2 + cols * (CELL + GAP)
const totH = PAD * 2 + present.length * (BAND + CELL + GAP)
const fb = new Uint8ClampedArray(totW * totH * 4)
for (let i = 0; i < totW * totH; i++) { fb[i * 4] = 18; fb[i * 4 + 1] = 22; fb[i * 4 + 2] = 36; fb[i * 4 + 3] = 255 }

let oy = PAD
const summary = []
for (const [el, seg] of present) {
  const items = list.filter((x) => Math.floor(x.id / 1000) === seg)
  const bc = BANDC[el]
  for (let y = oy; y < oy + BAND - 4; y++) for (let x = PAD; x < totW - PAD; x++) {
    const d = (y * totW + x) * 4
    fb[d] = bc[0]; fb[d + 1] = bc[1]; fb[d + 2] = bc[2]
  }
  let ox = PAD
  for (const it of items) {
    const p = path.join(ROOT, it.file)
    if (fs.existsSync(p)) {
      const im = decodePng(fs.readFileSync(p))
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
    }
    ox += CELL + GAP
  }
  oy += BAND + CELL + GAP
  summary.push({ el, items })
}
fs.mkdirSync(path.join(ROOT, 'docs/shots'), { recursive: true })
const OUT = path.join(ROOT, 'docs/shots/skill-icons-new39.png')
fs.writeFileSync(OUT, encodePng(totW, totH, fb))
console.log(`已写出 ${path.relative(ROOT, OUT)}  ${totW}×${totH}`)
console.log(`共 ${list.length} 个新增图标\n`)
for (const s of summary) {
  console.log(`【${s.el}】${s.items.length} 个`)
  console.log('  ' + s.items.map((i) => `${i.id} ${i.name}`).join('、'))
}
