// 检查 assets/monsters/m_*.png 里哪些是"真立绘"、哪些是"问号幽灵占位图"。
// 判据：占位图是纯灰 + 白问号，饱和度极低；真立绘有颜色。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer } from './pixel-canvas.mjs'
import { loadGlyphAtlas, TextRenderer } from './text-render.mjs'

const ROOT = path.resolve('.')
const files = fs.readdirSync(path.join(ROOT, 'assets', 'monsters')).filter((f) => /^m_\d+\.png$/.test(f)).sort()
console.log('m_*.png 共 ' + files.length + ' 个')

const stats = []
for (const f of files) {
  const p = decodePng(fs.readFileSync(path.join(ROOT, 'assets', 'monsters', f)))
  let satSum = 0, n = 0, opaque = 0
  for (let i = 0; i < p.data.length; i += 4) {
    if (p.data[i + 3] < 40) continue
    opaque++
    const r = p.data[i], g = p.data[i + 1], b = p.data[i + 2]
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    satSum += mx === 0 ? 0 : (mx - mn) / mx
    n++
  }
  const sat = n ? satSum / n : 0
  stats.push({ f, w: p.w, h: p.h, sat, opaque, ghost: sat < 0.07 })
}
const ghosts = stats.filter((s) => s.ghost)
const real = stats.filter((s) => !s.ghost)
console.log('  幽灵占位（低饱和）: ' + ghosts.length)
console.log('  真立绘（有颜色）: ' + real.length)
console.log('\n=== 真立绘清单 ===')
real.forEach((s) => console.log('  ' + s.f + '  ' + s.w + '×' + s.h + '  饱和' + s.sat.toFixed(2)))

// 把"真立绘"拼一张图，看看它们各自是什么怪
const COLS = 8, CW = 150, CH = 150
const ROWS = Math.ceil(real.length / COLS)
const W = COLS * CW, H = ROWS * CH + 30
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
real.forEach((s, k) => {
  const c = k % COLS, r = Math.floor(k / COLS)
  const x0 = c * CW, y0 = 30 + r * CH
  const p = decodePng(fs.readFileSync(path.join(ROOT, 'assets', 'monsters', s.f)))
  const sc = Math.min((CW - 16) / p.w, (CH - 30) / p.h, 1)
  const dw = Math.round(p.w * sc), dh = Math.round(p.h * sc)
  const ox = x0 + Math.floor((CW - dw) / 2), oy = y0 + Math.floor((CH - 24 - dh) / 2)
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(p.w - 1, Math.floor(x / sc)), sy = Math.min(p.h - 1, Math.floor(y / sc))
      const si = (sy * p.w + sx) * 4
      const al = p.data[si + 3] / 255
      if (al <= 0.02) continue
      const d = ((oy + y) * W + ox + x) * 4
      fb[d] = fb[d] * (1 - al) + p.data[si] * al
      fb[d + 1] = fb[d + 1] * (1 - al) + p.data[si + 1] * al
      fb[d + 2] = fb[d + 2] * (1 - al) + p.data[si + 2] * al
    }
  }
  tr.draw(fake, s.f.replace('.png', ''), x0 + 6, y0 + CH - 20, [20, 40, 80, 255], 1, '13px sans-serif', 'left', 'top')
})
fs.writeFileSync(path.join(ROOT, 'docs', 'sheets', '_m_real.png'), encodePng(W, H, fb))
console.log('\n已输出 docs/sheets/_m_real.png（' + W + '×' + H + '，' + real.length + ' 个真立绘）')
fs.writeFileSync(path.join(ROOT, '_tools', '_m_stats.json'), JSON.stringify(stats, null, 1), 'utf8')
