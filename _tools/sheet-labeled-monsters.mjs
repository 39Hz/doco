// 把切出来的怪物立绘拼成对照图，检查每格是不是完整的怪物（有没有被切开或串到邻格）。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer } from './pixel-canvas.mjs'
import { loadGlyphAtlas, TextRenderer } from './text-render.mjs'

const ROOT = path.resolve('.')
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'monsters', 'labeled', 'index.json'), 'utf8'))
const items = Object.entries(idx)
const COLS = 6, ROWS = Math.ceil(items.length / COLS)
const CW = 150, CH = 150, LABEL = 16, PAD = 4
const W = COLS * (CW + PAD) + PAD, H = ROWS * (CH + LABEL + PAD) + PAD
const fb = makeFramebuffer(W, H)
for (let i = 0; i < fb.length; i += 4) { fb[i] = 232; fb[i + 1] = 232; fb[i + 2] = 236; fb[i + 3] = 255 }

const tr = new TextRenderer(loadGlyphAtlas())
const fake = {
  W, H, buf: fb, _clip: null, globalAlpha: 1,
  _blend(px, py, r, g, b, a) {
    px |= 0; py |= 0
    if (px < 0 || py < 0 || px >= W || py >= H) return
    const i = (py * W + px) * 4
    fb[i] = fb[i] * (1 - a) + r * a
    fb[i + 1] = fb[i + 1] * (1 - a) + g * a
    fb[i + 2] = fb[i + 2] * (1 - a) + b * a
  },
  _inClip() { return true },
}

items.forEach(([id, info], k) => {
  const col = k % COLS, row = Math.floor(k / COLS)
  const x0 = PAD + col * (CW + PAD), y0 = PAD + row * (CH + LABEL + PAD) + LABEL
  // 格子底
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const i = ((y0 + y) * W + x0 + x) * 4
    fb[i] = 255; fb[i + 1] = 255; fb[i + 2] = 255
  }
  let png = null
  try { png = decodePng(fs.readFileSync(path.join(ROOT, info.file))) } catch (e) { png = null }
  if (png) {
    // 等比放进格子
    const sc = Math.min((CW - 12) / png.w, (CH - 12) / png.h, 1)
    const dw = Math.round(png.w * sc), dh = Math.round(png.h * sc)
    const ox = x0 + Math.floor((CW - dw) / 2), oy = y0 + CH - 6 - dh
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(png.w - 1, Math.floor(x / sc)), sy = Math.min(png.h - 1, Math.floor(y / sc))
        const s = (sy * png.w + sx) * 4
        const a = png.data[s + 3] / 255
        if (a <= 0.01) continue
        const d = ((oy + y) * W + ox + x) * 4
        fb[d] = fb[d] * (1 - a) + png.data[s] * a
        fb[d + 1] = fb[d + 1] * (1 - a) + png.data[s + 1] * a
        fb[d + 2] = fb[d + 2] * (1 - a) + png.data[s + 2] * a
      }
    }
  }
  tr.draw(fake, id + ' ' + info.name, x0 + 2, y0 - LABEL + 1, [20, 30, 50, 255], 1, '12px sans-serif', 'left', 'top')
  tr.draw(fake, png ? png.w + 'x' + png.h : 'ERR', x0 + 2, y0 + CH - 14, [120, 130, 150, 255], 1, '11px sans-serif', 'left', 'top')
})

const out = path.join(ROOT, 'docs', 'sheets', 'monsters-labeled.png')
fs.writeFileSync(out, encodePng(W, H, fb))
console.log('已输出 ' + out + '  (' + W + '×' + H + ')，共 ' + items.length + ' 只')
