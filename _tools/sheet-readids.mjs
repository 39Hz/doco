// 生成"立绘 + 它的编号"紧邻的对照图，供人工核对 ID。
// 前面自动 OCR 的路走不通（数字粘连、切位不准），人工读一遍 61 个编号最可靠。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, '多克多比专区资料素材', 'npc大全', '怪物图鉴.png')
const png = decodePng(fs.readFileSync(SRC))
const { w: PW, h: PH, data: PD } = png
const isBg = (x, y) => (x < 0 || y < 0 || x >= PW || y >= PH) || PD[(y * PW + x) * 4 + 3] < 24

const items = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', '_blobs_labeled.json'), 'utf8'))
const withLabel = items.filter((it) => it.label)
console.log('带编号的块: ' + withLabel.length)

// 每格：立绘（等比放进 130×130）+ 下方编号（放大 3 倍）
const COLS = 6
const CW = 150, ART = 132, LBL = 42
const CH = ART + LBL + 4
const ROWS = Math.ceil(withLabel.length / COLS)
const W = COLS * CW, H = ROWS * CH
const fb = makeFramebuffer(W, H)
for (let i = 0; i < fb.length; i += 4) { fb[i] = 250; fb[i + 1] = 250; fb[i + 2] = 252; fb[i + 3] = 255 }

withLabel.forEach((it, k) => {
  const c = k % COLS, r = Math.floor(k / COLS)
  const x0 = c * CW, y0 = r * CH
  // 序号（左上角，便于我说"第几个错了"）
  // 立绘
  const b = it.art
  const sc = Math.min((ART - 8) / b.w, (ART - 8) / b.h, 1)
  const dw = Math.max(1, Math.round(b.w * sc)), dh = Math.max(1, Math.round(b.h * sc))
  const ox = x0 + Math.floor((CW - dw) / 2), oy = y0 + ART - 4 - dh
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
  // 编号（放大 3 倍，黑色）
  const L = it.label
  const S = 3
  for (let y = 0; y < L.h; y++) {
    for (let x = 0; x < L.w; x++) {
      if (isBg(L.x + x, L.y + y)) continue
      for (let dy = 0; dy < S; dy++) {
        for (let dx = 0; dx < S; dx++) {
          const px = x0 + 8 + x * S + dx, py = y0 + ART + 2 + y * S + dy
          if (px < 0 || py < 0 || px >= W || py >= H) continue
          const d = (py * W + px) * 4
          fb[d] = 10; fb[d + 1] = 10; fb[d + 2] = 10; fb[d + 3] = 255
        }
      }
    }
  }
  // 分隔线
  for (let x = x0; x < x0 + CW; x++) { const d = (y0 * W + x) * 4; fb[d] = 210; fb[d + 1] = 215; fb[d + 2] = 225 }
})

const p = path.join(ROOT, 'docs', 'sheets', '_readids.png')
fs.writeFileSync(p, encodePng(W, H, fb))
console.log('已输出 ' + p + '（' + W + '×' + H + '，' + withLabel.length + ' 格，序号按行从左到右 0..' + (withLabel.length - 1) + '）')
