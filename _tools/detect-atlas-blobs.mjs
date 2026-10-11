// 用连通块（flood fill）从图鉴里把每只怪切出来。
//
// 前面几版都失败在"按固定网格猜坐标"上 —— 图鉴的行列间距并不均匀，
// 而且立绘横向几乎挨在一起（列段检测出来是 1 段 3138 宽）。
// 连通块是唯一稳的办法：每只怪是一块独立的不透明区域。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, '多克多比专区资料素材', 'npc大全', '怪物图鉴.png')
const OUT = path.join(ROOT, 'assets', 'monsters', 'labeled')
fs.mkdirSync(OUT, { recursive: true })
const png = decodePng(fs.readFileSync(SRC))
const { w: PW, h: PH, data: PD } = png
console.log('图鉴 ' + PW + '×' + PH)

const opaque = new Uint8Array(PW * PH)
for (let i = 0, p = 0; i < PD.length; i += 4, p++) opaque[p] = PD[i + 3] >= 24 ? 1 : 0

// 连通块（4 邻域，用显式栈避免递归爆栈）
const label = new Int32Array(PW * PH).fill(-1)
const blobs = []
const stack = new Int32Array(PW * PH)
for (let sy = 0; sy < PH; sy++) {
  for (let sx = 0; sx < PW; sx++) {
    const s0 = sy * PW + sx
    if (!opaque[s0] || label[s0] >= 0) continue
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
      // 4 邻域
      if (x > 0) { const k = cur - 1; if (opaque[k] && label[k] < 0) { label[k] = id; stack[top++] = k } }
      if (x < PW - 1) { const k = cur + 1; if (opaque[k] && label[k] < 0) { label[k] = id; stack[top++] = k } }
      if (y > 0) { const k = cur - PW; if (opaque[k] && label[k] < 0) { label[k] = id; stack[top++] = k } }
      if (y < PH - 1) { const k = cur + PW; if (opaque[k] && label[k] < 0) { label[k] = id; stack[top++] = k } }
    }
    blobs.push({ id, minX, minY, maxX, maxY, n, w: maxX - minX + 1, h: maxY - minY + 1 })
  }
}
console.log('连通块总数: ' + blobs.length)

// 立绘块的特征：面积大、且长宽比正常。编号文字是很多很小的块。
const areas = blobs.map((b) => b.n).sort((a, b) => b - a)
console.log('最大 10 块面积: ' + areas.slice(0, 10).join(', '))
const sprites = blobs.filter((b) => b.n >= 1500 && b.h >= 40 && b.w >= 40)
console.log('立绘候选块（面积≥1500 且宽高≥40）: ' + sprites.length)
sprites.sort((a, b) => (a.minY - b.minY) || (a.minX - b.minX))

// 拼一张对照图（按从上到下、从左到右排序编号），供核对
const COLS = 9
const CW = Math.max(...sprites.map((s) => s.w)) + 10
const CH = Math.max(...sprites.map((s) => s.h)) + 10
const ROWS = Math.ceil(sprites.length / COLS)
const fb = makeFramebuffer(COLS * CW, ROWS * CH)
for (let i = 0; i < fb.length; i += 4) { fb[i] = 240; fb[i + 1] = 240; fb[i + 2] = 246; fb[i + 3] = 255 }
sprites.forEach((s, k) => {
  const c = k % COLS, r = Math.floor(k / COLS)
  const ox = c * CW + 5, oy = r * CH + 5
  for (let y = s.minY; y <= s.maxY; y++) {
    for (let x = s.minX; x <= s.maxX; x++) {
      const p = y * PW + x
      if (label[p] !== s.id) continue
      const d = ((oy + y - s.minY) * COLS * CW + ox + x - s.minX) * 4
      fb[d] = PD[p * 4]; fb[d + 1] = PD[p * 4 + 1]; fb[d + 2] = PD[p * 4 + 2]; fb[d + 3] = 255
    }
  }
})
const sheetPath = path.join(ROOT, 'docs', 'sheets', '_atlas-blobs.png')
fs.writeFileSync(sheetPath, encodePng(COLS * CW, ROWS * CH, fb))
console.log('已输出 ' + sheetPath + '（' + COLS * CW + '×' + ROWS * CH + '，每格 ' + CW + '×' + CH + '）')
fs.writeFileSync(path.join(ROOT, '_tools', '_blobs.json'), JSON.stringify(sprites.map((s) => ({ x: s.minX, y: s.minY, w: s.w, h: s.h, n: s.n }))), 'utf8')
