// 确认 10022(赛罗特)/10023(托米拉) 回退后的立绘是否正确（应该与图鉴里的对应格一致）。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer } from './pixel-canvas.mjs'
import { loadGlyphAtlas, TextRenderer } from './text-render.mjs'

const ROOT = path.resolve('.')
const Items = [
  { id: 10022, name: '赛罗特', sprite: 'assets/monsters/labeled/mon_10022.png' },
  { id: 10023, name: '托米拉', sprite: 'assets/monsters/labeled/mon_10023.png' },
  { id: 10021, name: '赛贝猪', sprite: 'assets/monsters/labeled/mon_10021.png' },
  { id: 19008, name: '拉乌比I型', sprite: 'assets/monsters/labeled/mon_19008.png' },
]
const CW = 320, CH = 340
const W = CW * Items.length, H = CH + 24
const fb = makeFramebuffer(W, H)
for (let i = 0; i < fb.length; i += 4) { fb[i] = 248; fb[i + 1] = 248; fb[i + 2] = 251; fb[i + 3] = 255 }
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
Items.forEach((it, i) => {
  const x0 = i * CW
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const d = ((y) * W + x0 + x) * 4
    const v = 250 - Math.round(14 * (y / CH))
    fb[d] = v; fb[d + 1] = v; fb[d + 2] = v + 3
  }
  const p = path.join(ROOT, it.sprite)
  if (fs.existsSync(p)) {
    const png = decodePng(fs.readFileSync(p))
    const sc = Math.min((CW - 30) / png.w, (CH - 60) / png.h, 1.3)
    const dw = Math.round(png.w * sc), dh = Math.round(png.h * sc)
    const ox = x0 + Math.floor((CW - dw) / 2), oy = 34
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(png.w - 1, Math.floor(x / sc)), sy = Math.min(png.h - 1, Math.floor(y / sc))
        const si = (sy * png.w + sx) * 4
        const a = png.data[si + 3] / 255
        if (a <= 0.02) continue
        const px = ox + x, py = oy + y
        if (px < 0 || py < 0 || px >= W || py >= H) continue
        const di = (py * W + px) * 4
        fb[di] = fb[di] * (1 - a) + png.data[si] * a
        fb[di + 1] = fb[di + 1] * (1 - a) + png.data[si + 1] * a
        fb[di + 2] = fb[di + 2] * (1 - a) + png.data[si + 2] * a
      }
    }
    tr.draw(fake, it.id + ' ' + it.name, x0 + 10, 8, [20, 40, 80, 255], 1, '18px sans-serif', 'left', 'top')
    tr.draw(fake, png.w + 'x' + png.h, x0 + 10, CH + 4, [120, 126, 140, 255], 1, '13px sans-serif', 'left', 'top')
  } else {
    tr.draw(fake, it.id + ' 缺文件', x0 + 10, 8, [200, 40, 40, 255], 1, '18px sans-serif', 'left', 'top')
  }
  for (let y = 0; y < H; y++) { const d = (y * W + x0) * 4; fb[d] = 200; fb[d + 1] = 205; fb[d + 2] = 215 }
})
fs.writeFileSync(path.join(ROOT, 'docs', 'sheets', '_check-fallback.png'), encodePng(W, H, fb))
console.log('已输出 docs/sheets/_check-fallback.png')
