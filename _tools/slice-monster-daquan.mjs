// 切「怪物大全.png」（1913×1215，11 只立绘，白底带椭圆阴影）。
// 这只图没有编号，但有名字邻近的素材：SWF 文件里同名的可以直接对上（火岩/女妖木乃伊/大河妖…）。
// 做法：连通块切出 11 只，导出成对照图，我按外观 + 手头线索命名。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer } from './pixel-canvas.mjs'
import { loadGlyphAtlas, TextRenderer } from './text-render.mjs'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, '多克多比专区资料素材', '怪物', '怪物大全.png')
const png = decodePng(fs.readFileSync(SRC))
const { w: PW, h: PH, data: PD } = png
console.log('怪物大全 ' + PW + '×' + PH)

// 背景是白色（带一点灰），非背景 = 有颜色或明显深色
const isBg = (x, y) => {
  const i = (y * PW + x) * 4
  const r = PD[i], g = PD[i + 1], b = PD[i + 2], a = PD[i + 3]
  if (a < 40) return true
  return r > 238 && g > 238 && b > 238
}

// 连通块
const label = new Int32Array(PW * PH).fill(-1)
const blobs = []
const stack = new Int32Array(PW * PH)
for (let sy = 0; sy < PH; sy++) {
  for (let sx = 0; sx < PW; sx++) {
    const s0 = sy * PW + sx
    if (label[s0] >= 0) continue
    if (isBg(sx, sy)) continue
    const id = blobs.length
    let top = 0
    stack[top++] = s0
    label[s0] = id
    let minX = sx, maxX = sx, minY = sy, maxY = sy, n = 0
    while (top > 0) {
      const cur = stack[--top]
      const y = (cur / PW) | 0, x = cur - y * PW
      n++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      const push = (k) => { if (label[k] < 0) { const yy = (k / PW) | 0, xx = k - yy * PW; if (!isBg(xx, yy)) { label[k] = id; stack[top++] = k } } }
      if (x > 0) push(cur - 1)
      if (x < PW - 1) push(cur + 1)
      if (y > 0) push(cur - PW)
      if (y < PH - 1) push(cur + PW)
    }
    blobs.push({ id, minX, minY, maxX, maxY, n, w: maxX - minX + 1, h: maxY - minY + 1 })
  }
}
// 只要够大的（立绘），并排除"细长阴影椭圆"（h 很小）
const arts = blobs.filter((b) => b.n > 2000 && b.w > 40 && b.h > 40 && b.h / b.w > 0.5)
arts.sort((a, b) => (a.minY - b.minY) || (a.minX - b.minX))
console.log('切出候选 ' + arts.length + ' 个')

// 对照图
const COLS = 4, CW = 300, CH = 300
const ROWS = Math.ceil(arts.length / COLS)
const W = COLS * CW, H = ROWS * CH + 20
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
const OUT = path.join(ROOT, 'assets', 'monsters', 'daquan')
fs.mkdirSync(OUT, { recursive: true })
const meta = []
arts.forEach((b, k) => {
  const c = k % COLS, r = Math.floor(k / COLS)
  const x0 = c * CW, y0 = 20 + r * CH
  const sc = Math.min((CW - 30) / b.w, (CH - 50) / b.h, 1.6)
  const dw = Math.round(b.w * sc), dh = Math.round(b.h * sc)
  const ox = x0 + Math.floor((CW - dw) / 2), oy = y0 + 26
  const sub = new Uint8Array(b.w * b.h * 4)
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const si = ((b.minY + y) * PW + (b.minX + x)) * 4
      const di = (y * b.w + x) * 4
      sub[di] = PD[si]; sub[di + 1] = PD[si + 1]; sub[di + 2] = PD[si + 2]; sub[di + 3] = 255
    }
  }
  fs.writeFileSync(path.join(OUT, 'dq_' + String(k).padStart(2, '0') + '.png'), encodePng(b.w, b.h, sub))
  meta.push({ k, w: b.w, h: b.h, file: 'assets/monsters/daquan/dq_' + String(k).padStart(2, '0') + '.png' })
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(b.w - 1, Math.floor(x / sc)), sy = Math.min(b.h - 1, Math.floor(y / sc))
      const si = (sy * b.w + sx) * 4
      const px = ox + x, py = oy + y
      if (px < 0 || py < 0 || px >= W || py >= H) continue
      const di = (py * W + px) * 4
      fb[di] = sub[si]; fb[di + 1] = sub[si + 1]; fb[di + 2] = sub[si + 2]
    }
  }
  tr.draw(fake, '#' + k + '  ' + b.w + 'x' + b.h, x0 + 6, y0 + 4, [180, 40, 40, 255], 1, '16px sans-serif', 'left', 'top')
  for (let x = x0; x < x0 + CW; x++) { const i = (y0 * W + x) * 4; fb[i] = 205; fb[i + 1] = 210; fb[i + 2] = 220 }
  for (let y = y0; y < y0 + CH; y++) { const i = (y * W + x0) * 4; fb[i] = 205; fb[i + 1] = 210; fb[i + 2] = 220 }
})
fs.writeFileSync(path.join(ROOT, 'docs', 'sheets', '_daquan.png'), encodePng(W, H, fb))
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 1), 'utf8')
console.log('已输出 docs/sheets/_daquan.png（' + W + '×' + H + '，' + arts.length + ' 只）')
