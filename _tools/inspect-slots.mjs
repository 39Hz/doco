// 把 _pairs.json 里 k=0/1/2 的 art 区域原样导出，看看到底是什么（空占位格 还是 真立绘）。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer } from './pixel-canvas.mjs'
import { loadGlyphAtlas, TextRenderer } from './text-render.mjs'

const ROOT = path.resolve('.')
const png = decodePng(fs.readFileSync(path.join(ROOT, '多克多比专区资料素材', 'npc大全', '怪物图鉴.png')))
const { w: PW, data: PD } = png
const pairs = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', '_pairs.json'), 'utf8'))

const K = [0, 1, 2, 3, 19, 20, 21]
const CW = 240, CH = 240
const W = K.length * CW, H = CH + 40
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

K.forEach((k, i) => {
  const p = pairs[k]
  const x0 = i * CW
  if (!p) return
  const a = p.art
  const sc = Math.min((CW - 20) / a.w, (CH - 20) / a.h, 1)
  const dw = Math.round(a.w * sc), dh = Math.round(a.h * sc)
  const ox = x0 + Math.floor((CW - dw) / 2), oy = 10
  // 画一个深色底，方便看出"淡影"
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const d = ((oy + y) * W + ox + x) * 4
    fb[d] = 60; fb[d + 1] = 64; fb[d + 2] = 72
  }
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
  tr.draw(fake, 'k=' + k + '  art ' + a.w + 'x' + a.h, x0 + 6, CH + 4, [20, 30, 60, 255], 1, '14px sans-serif', 'left', 'top')
  tr.draw(fake, 'at (' + a.x + ',' + a.y + ')', x0 + 6, CH + 22, [110, 116, 130, 255], 1, '12px sans-serif', 'left', 'top')
})

const out = path.join(ROOT, 'docs', 'sheets', '_slots_inspect.png')
fs.writeFileSync(out, encodePng(W, H, fb))
console.log('已输出 ' + out + '（' + W + '×' + H + '）— 深色底，看得见"淡影"')
