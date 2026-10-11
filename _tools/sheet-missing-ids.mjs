// 只输出"还没对上编号"的那几个块，放大显示立绘 + 编号，供精确核对。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const png = decodePng(fs.readFileSync(path.join(ROOT, '多克多比专区资料素材', 'npc大全', '怪物图鉴.png')))
const { w: PW, h: PH, data: PD } = png
const isBg = (x, y) => (x < 0 || y < 0 || x >= PW || y >= PH) || PD[(y * PW + x) * 4 + 3] < 24

const items = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', '_blobs_labeled.json'), 'utf8'))
// 已经成功对上的 30 只，用它们的 art 位置做参照，找出"没用上"的块
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'monsters', 'labeled', 'index.json'), 'utf8'))
console.log('已对上的 atlasId: ' + Object.values(idx).map((v) => v.atlasId).join(' '))

// 我需要的 6 个缺失编号
const WANT = [110012, 110014, 110016, 110017, 119009, 119013]

// 把每个块 + 编号放大 2 倍画出来，全部 72 个都画，但把我要找的框上红边
const withLabel = items.filter((it) => it.label)
const COLS = 6, CW = 300, CH = 300
const ROWS = Math.ceil(withLabel.length / COLS)
const W = COLS * CW, H = ROWS * CH
const fb = makeFramebuffer(W, H)
for (let i = 0; i < fb.length; i += 4) { fb[i] = 245; fb[i + 1] = 245; fb[i + 2] = 248; fb[i + 3] = 255 }

withLabel.forEach((it, k) => {
  const c = k % COLS, r = Math.floor(k / COLS)
  const x0 = c * CW, y0 = r * CH
  const b = it.art
  const sc = Math.min((CW - 20) / b.w, (CH - 90) / b.h, 2)
  const dw = Math.max(1, Math.round(b.w * sc)), dh = Math.max(1, Math.round(b.h * sc))
  const ox = x0 + Math.floor((CW - dw) / 2), oy = y0 + 6
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = b.x + Math.min(b.w - 1, Math.floor(x / sc))
      const sy = b.y + Math.min(b.h - 1, Math.floor(y / sc))
      const s = (sy * PW + sx) * 4
      const a = PD[s + 3] / 255
      if (a <= 0.02) continue
      const d = ((oy + y) * W + ox + x) * 4
      fb[d] = fb[d] * (1 - a) + PD[s] * a
      fb[d + 1] = fb[d + 1] * (1 - a) + PD[s + 1] * a
      fb[d + 2] = fb[d + 2] * (1 - a) + PD[s + 2] * a
    }
  }
  // 编号放大 4 倍
  const L = it.label, S = 4
  const lw = L.w * S
  const lx = x0 + Math.floor((CW - lw) / 2), ly = y0 + CH - L.h * S - 16
  for (let y = 0; y < L.h; y++) {
    for (let x = 0; x < L.w; x++) {
      if (isBg(L.x + x, L.y + y)) continue
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
        const px = lx + x * S + dx, py = ly + y * S + dy
        if (px < 0 || py < 0 || px >= W || py >= H) continue
        const d = (py * W + px) * 4
        fb[d] = 0; fb[d + 1] = 0; fb[d + 2] = 0; fb[d + 3] = 255
      }
    }
  }
  // 块序号
  const t = String(k)
  for (let i = 0; i < t.length; i++) {
    const gx = x0 + 6 + i * 14, gy = y0 + 6
    for (let yy = 0; yy < 14; yy++) for (let xx = 0; xx < 10; xx++) {
      if ((yy === 0 || yy === 13) || (xx === 0 || xx === 9)) {
        const d = ((gy + yy) * W + gx + xx) * 4
        fb[d] = 160; fb[d + 1] = 60; fb[d + 2] = 200
      }
    }
  }
  // 分隔线
  for (let x = x0; x < x0 + CW; x++) { const d = (y0 * W + x) * 4; fb[d] = 200; fb[d + 1] = 205; fb[d + 2] = 215 }
  for (let y = y0; y < y0 + CH; y++) { const d = (y * W + x0) * 4; fb[d] = 200; fb[d + 1] = 205; fb[d + 2] = 215 }
})

// 分成上下两半输出，避免缩得太小看不清
const HALF = Math.ceil(H / 2)
for (let part = 0; part < 2; part++) {
  const y0 = part * HALF, y1 = Math.min(H, y0 + HALF)
  const hh = y1 - y0
  const sub = new Uint8Array(W * hh * 4)
  sub.set(fb.subarray(y0 * W * 4, y1 * W * 4))
  const p = path.join(ROOT, 'docs', 'sheets', '_missing_' + (part + 1) + '.png')
  fs.writeFileSync(p, encodePng(W, hh, sub))
  console.log('已输出 ' + p + '（' + W + '×' + hh + '，块 ' + (part * (withLabel.length / 2 | 0)) + ' 起）')
}
