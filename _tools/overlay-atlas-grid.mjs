// 把我的格子坐标叠到图鉴原图上，直观看算得准不准。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, '多克多比专区资料素材', 'npc大全', '怪物图鉴.png')
const png = decodePng(fs.readFileSync(SRC))
console.log('图鉴 ' + png.w + '×' + png.h)

const SX = png.w / 1695
const SY = png.h / 2473
const colX = (c) => (85 + c * 93.7) * SX
const normalRowY = (r) => (72 + r * 128.5) * SY
const bossRowY = (r) => (588 + r * 128.5) * SY
const HW = 44 * SX, HH = 58 * SY

// 复制一份，画上去
const out = new Uint8Array(png.data.length)
out.set(png.data)

function px(x, y, r, g, b) {
  x = Math.round(x); y = Math.round(y)
  if (x < 0 || y < 0 || x >= png.w || y >= png.h) return
  const i = (y * png.w + x) * 4
  out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255
}
function hline(x0, x1, y, r, g, b) { for (let x = x0; x <= x1; x++) px(x, y, r, g, b) }
function vline(x, y0, y1, r, g, b) { for (let y = y0; y <= y1; y++) px(x, y, r, g, b) }

// 画格心十字 + 我实际用的裁剪框（青框）+ 编号带位置（红框）
for (let r = 0; r < 5; r++) {
  for (let c = 0; c < 9; c++) {
    const x = colX(c), y = normalRowY(r)
    hline(x - 8, x + 8, y, 255, 0, 0); vline(x, y - 8, y + 8, 255, 0, 0)
    // 我的裁剪框：x-HW..x+HW, y-HH*2.05..y-HH*0.15
    const x0 = x - HW, x1 = x + HW, y0 = y - HH * 2.05, y1 = y - HH * 0.15
    hline(x0, x1, y0, 0, 200, 255); hline(x0, x1, y1, 0, 200, 255)
    vline(x0, y0, y1, 0, 200, 255); vline(x1, y0, y1, 0, 200, 255)
  }
}
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 9; c++) {
    const x = colX(c), y = bossRowY(r)
    hline(x - 8, x + 8, y, 255, 0, 0); vline(x, y - 8, y + 8, 255, 0, 0)
    const x0 = x - HW, x1 = x + HW, y0 = y - HH * 2.05, y1 = y - HH * 0.15
    hline(x0, x1, y0, 0, 200, 255); hline(x0, x1, y1, 0, 200, 255)
    vline(x0, y0, y1, 0, 200, 255); vline(x1, y0, y1, 0, 200, 255)
  }
}

const p = path.join(ROOT, 'docs', 'sheets', '_atlas-grid.png')
fs.writeFileSync(p, encodePng(png.w, png.h, out))
console.log('已输出 ' + p)
