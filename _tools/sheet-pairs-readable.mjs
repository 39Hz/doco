// 把 38 组干净配对渲染成对照图：立绘 + 它的编号（编号按格宽缩放，不溢出）。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer } from './pixel-canvas.mjs'
import { loadGlyphAtlas, TextRenderer } from './text-render.mjs'

const ROOT = path.resolve('.')
const png = decodePng(fs.readFileSync(path.join(ROOT, '多克多比专区资料素材', 'npc大全', '怪物图鉴.png')))
const { w: PW, data: PD } = png
const isBg = (x, y) => PD[((y) * PW + x) * 4 + 3] < 24

const pairs = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', '_pairs.json'), 'utf8'))
const COLS = 6
const CW = 260, ART = 150, LBL = 90
const CH = ART + LBL + 6
const ROWS = Math.ceil(pairs.length / COLS)
const W = COLS * CW, H = ROWS * CH
const fb = makeFramebuffer(W, H)
for (let i = 0; i < fb.length; i += 4) { fb[i] = 252; fb[i + 1] = 252; fb[i + 2] = 254; fb[i + 3] = 255 }
const tr = new TextRenderer(loadGlyphAtlas())

pairs.forEach((p, k) => {
  const c = k % COLS, r = Math.floor(k / COLS)
  const x0 = c * CW, y0 = r * CH
  const a = p.art
  const sc = Math.min((CW - 24) / a.w, (ART - 16) / a.h, 1.4)
  const dw = Math.max(1, Math.round(a.w * sc)), dh = Math.max(1, Math.round(a.h * sc))
  const ox = x0 + Math.floor((CW - dw) / 2), oy = y0 + 8
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = a.x + Math.min(a.w - 1, Math.floor(x / sc))
      const sy = a.y + Math.min(a.h - 1, Math.floor(y / sc))
      const s = (sy * PW + sx) * 4
      const al = PD[s + 3] / 255
      if (al <= 0.02) continue
      const d = ((oy + y) * W + ox + x) * 4
      fb[d] = fb[d] * (1 - al) + PD[s] * al
      fb[d + 1] = fb[d + 1] * (1 - al) + PD[s + 1] * al
      fb[d + 2] = fb[d + 2] * (1 - al) + PD[s + 2] * al
    }
  }
  // 编号：按格宽缩放（最多放到 2.4 倍），保证完整可见
  const L = p.label
  const S = Math.min(2.4, (CW - 30) / L.w)
  const lw = Math.round(L.w * S), lh = Math.round(L.h * S)
  const lx = x0 + Math.floor((CW - lw) / 2), ly = y0 + ART + 2
  for (let y = 0; y < L.h; y++) {
    for (let x = 0; x < L.w; x++) {
      if (isBg(L.x + x, L.y + y)) continue
      for (let dy = 0; dy < Math.ceil(S); dy++) {
        for (let dx = 0; dx < Math.ceil(S); dx++) {
          const px = lx + Math.round(x * S) + dx, py = ly + Math.round(y * S) + dy
          if (px < 0 || py < 0 || px >= W || py >= H) continue
          const d = (py * W + px) * 4
          fb[d] = 0; fb[d + 1] = 0; fb[d + 2] = 0; fb[d + 3] = 255
        }
      }
    }
  }
  // 序号 + 尺寸（用我自己的字形，清晰）
  const fake = {
    W, H, buf: fb, _clip: null, globalAlpha: 1,
    _blend(px, py, R, G, B, al) {
      px |= 0; py |= 0
      if (px < 0 || py < 0 || px >= W || py >= H) return
      const d = (py * W + px) * 4
      fb[d] = fb[d] * (1 - al) + R * al; fb[d + 1] = fb[d + 1] * (1 - al) + G * al; fb[d + 2] = fb[d + 2] * (1 - al) + B * al
    },
    _inClip() { return true },
  }
  tr.draw(fake, '#' + k, x0 + 4, y0 + 2, [190, 40, 40, 255], 1, '15px sans-serif', 'left', 'top')
  tr.draw(fake, a.w + 'x' + a.h, x0 + CW - 4, y0 + 2, [120, 120, 130, 255], 1, '12px sans-serif', 'right', 'top')
  for (let x = x0; x < x0 + CW; x++) { const d = (y0 * W + x) * 4; fb[d] = 200; fb[d + 1] = 205; fb[d + 2] = 215 }
  for (let y = y0; y < y0 + CH; y++) { const d = (y * W + x0) * 4; fb[d] = 200; fb[d + 1] = 205; fb[d + 2] = 215 }
})

const out = path.join(ROOT, 'docs', 'sheets', '_pairs_readable.png')
fs.writeFileSync(out, encodePng(W, H, fb))
console.log('已输出 ' + out + '（' + W + '×' + H + '，' + pairs.length + ' 组，序号 #0..# + (pairs.length - 1)）'.replace('# + (pairs.length - 1)', (pairs.length - 1)))
