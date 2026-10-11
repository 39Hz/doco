// 按"图鉴的物理行"输出高清条带：一行立绘 + 该行每格下面的编号，一次一行看清楚。
// 之前用 blob 索引 + 人工映射总是错位，直接看行最可靠。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const png = decodePng(fs.readFileSync(path.join(ROOT, '多克多比专区资料素材', 'npc大全', '怪物图鉴.png')))
const { w: PW, h: PH, data: PD } = png
const isBg = (x, y) => (x < 0 || y < 0 || x >= PW || y >= PH) || PD[(y * PW + x) * 4 + 3] < 24

// 逐行统计不透明像素，找出内容行段（立绘行）
const rowN = new Int32Array(PH)
for (let y = 0; y < PH; y++) {
  let n = 0
  for (let x = 0; x < PW; x += 2) if (!isBg(x, y)) n++
  rowN[y] = n
}
const runs = []
let s = -1
for (let y = 0; y < PH; y++) {
  if (rowN[y] > 3) { if (s < 0) s = y } else { if (s >= 0) { runs.push([s, y - 1]); s = -1 } }
}
if (s >= 0) runs.push([s, PH - 1])
const merged = []
for (const r of runs) {
  if (merged.length && r[0] - merged[merged.length - 1][1] < PH * 0.006) merged[merged.length - 1][1] = r[1]
  else merged.push([...r])
}
console.log('内容行段 ' + merged.length + ' 个，高度: ' + merged.map((r) => r[1] - r[0] + 1).join(','))

// 每个行段输出一条：整行按宽度切成 9 列显示（含每格下方的编号）
const COLS = 9
let n = 0
for (const [y0, y1] of merged) {
  const h = y1 - y0 + 1
  if (h < 60) continue
  n++
  const cellW = Math.floor(PW / COLS)
  const SCALE = Math.min(2, 1600 / PW)
  const W = Math.round(PW * SCALE), H = Math.round(h * SCALE)
  const fb = makeFramebuffer(W, H)
  for (let i = 0; i < fb.length; i += 4) { fb[i] = 250; fb[i + 1] = 250; fb[i + 2] = 252; fb[i + 3] = 255 }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < PW; x++) {
      if (isBg(x, y0 + y)) continue
      const dx = Math.round(x * SCALE), dy = Math.round(y * SCALE)
      const s2 = ((y0 + y) * PW + x) * 4
      for (let sy = 0; sy < Math.ceil(SCALE); sy++) {
        for (let sx = 0; sx < Math.ceil(SCALE); sx++) {
          const px = dx + sx, py = dy + sy
          if (px < 0 || py < 0 || px >= W || py >= H) continue
          const d = (py * W + px) * 4
          fb[d] = PD[s2]; fb[d + 1] = PD[s2 + 1]; fb[d + 2] = PD[s2 + 2]; fb[d + 3] = 255
        }
      }
    }
  }
  // 列分隔线
  for (let c = 1; c < COLS; c++) {
    const x = Math.round(c * cellW * SCALE)
    for (let y = 0; y < H; y++) { const d = (y * W + x) * 4; fb[d] = 255; fb[d + 1] = 60; fb[d + 2] = 60 }
  }
  const p = path.join(ROOT, 'docs', 'sheets', 'row_' + String(n).padStart(2, '0') + '.png')
  fs.writeFileSync(p, encodePng(W, H, fb))
  console.log('  ' + path.basename(p) + '  y=' + y0 + '..' + y1 + '  ' + W + '×' + H)
}
console.log('共 ' + n + ' 张行图（红竖线是我画的列分隔，帮助定位格子边界）')
