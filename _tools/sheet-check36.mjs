// 最终核对图：怪兽表的 36 只 × 当前切出的立绘。一眼就能看出哪只对错了。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer } from './pixel-canvas.mjs'
import { loadGlyphAtlas, TextRenderer } from './text-render.mjs'

const ROOT = path.resolve('.')
const gd = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'gamedata.json'), 'utf8'))
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'monsters', 'map.json'), 'utf8'))
const COLS = 6, CW = 250, CH = 220
const items = gd.monsters
const ROWS = Math.ceil(items.length / COLS)
const W = COLS * CW, H = ROWS * CH
const fb = makeFramebuffer(W, H)
for (let i = 0; i < fb.length; i += 4) { fb[i] = 250; fb[i + 1] = 250; fb[i + 2] = 252; fb[i + 3] = 255 }
const tr = new TextRenderer(loadGlyphAtlas())
const fake = {
  W, H, buf: fb, _clip: null, globalAlpha: 1,
  _blend(px, py, R, G, B, a) {
    px |= 0; py |= 0
    if (px < 0 || py < 0 || px >= W || py >= H) return
    const d = (py * W + px) * 4
    fb[d] = fb[d] * (1 - a) + R * a; fb[d + 1] = fb[d + 1] * (1 - a) + G * a; fb[d + 2] = fb[d + 2] * (1 - a) + B * a
  },
  _inClip() { return true },
}

items.forEach((m, k) => {
  const c = k % COLS, r = Math.floor(k / COLS)
  const x0 = c * CW, y0 = r * CH
  const file = map.map[String(m.id)]
  let png = null
  try { png = decodePng(fs.readFileSync(path.join(ROOT, file))) } catch (e) { png = null }
  if (png) {
    const sc = Math.min((CW - 30) / png.w, (CH - 56) / png.h, 1.2)
    const dw = Math.max(1, Math.round(png.w * sc)), dh = Math.max(1, Math.round(png.h * sc))
    const ox = x0 + Math.floor((CW - dw) / 2), oy = y0 + 30
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(png.w - 1, Math.floor(x / sc)), sy = Math.min(png.h - 1, Math.floor(y / sc))
        const s = (sy * png.w + sx) * 4
        const a = png.data[s + 3] / 255
        if (a <= 0.02) continue
        const d = ((oy + y) * W + ox + x) * 4
        fb[d] = fb[d] * (1 - a) + png.data[s] * a
        fb[d + 1] = fb[d + 1] * (1 - a) + png.data[s + 1] * a
        fb[d + 2] = fb[d + 2] * (1 - a) + png.data[s + 2] * a
      }
    }
  }
  tr.draw(fake, m.id + ' ' + m.name, x0 + 6, y0 + 4, [20, 40, 80, 255], 1, '16px sans-serif', 'left', 'top')
  tr.draw(fake, (m.element || '无') + '  ' + (png ? png.w + 'x' + png.h : '缺图'), x0 + 6, y0 + CH - 18,
    [120, 124, 136, 255], 1, '12px sans-serif', 'left', 'top')
  for (let x = x0; x < x0 + CW; x++) { const d = (y0 * W + x) * 4; fb[d] = 200; fb[d + 1] = 205; fb[d + 2] = 215 }
  for (let y = y0; y < y0 + CH; y++) { const d = (y * W + x0) * 4; fb[d] = 200; fb[d + 1] = 205; fb[d + 2] = 215 }
})

const out = path.join(ROOT, 'docs', 'sheets', '_check36.png')
fs.writeFileSync(out, encodePng(W, H, fb))
console.log('已输出 ' + out + '（' + W + '×' + H + '，36 只）')
