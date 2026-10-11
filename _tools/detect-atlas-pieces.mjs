// 第三版：不猜坐标，改用"检测每一格的编号文字"作为锚点。
//
// 前两版都栽在垂直坐标上：横向（列）能对上，纵向（行）老偏一格。
// 图鉴每格的结构是固定的：上面是立绘，下面是编号文字（一小行深色字）。
// 所以只要在预期位置附近找到那行字，就能精确反推立绘的范围。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, '多克多比专区资料素材', 'npc大全', '怪物图鉴.png')
const OUT = path.join(ROOT, 'assets', 'monsters', 'labeled')
fs.mkdirSync(OUT, { recursive: true })
const png = decodePng(fs.readFileSync(SRC))
console.log('图鉴 ' + png.w + '×' + png.h)

// 背景是**透明的**（rgba 0,0,0,0）。
// 之前按"浅灰/白"判背景是错的 —— 预览图把透明区渲染成白灰，让我误判了。
const isBg = (x, y) => {
  if (x < 0 || y < 0 || x >= png.w || y >= png.h) return true
  const i = (y * png.w + x) * 4
  return png.data[i + 3] < 24
}

// ---- 1) 先找列：扫描整图，统计每一列的非背景像素数，找出一列一列的内容带 ----
const colCount = new Int32Array(png.w)
for (let y = 0; y < png.h; y += 2) {
  for (let x = 0; x < png.w; x++) if (!isBg(x, y)) colCount[x]++
}
// 找连续有内容的列段
const colRuns = []
let cs = -1
for (let x = 0; x < png.w; x++) {
  if (colCount[x] > 2) { if (cs < 0) cs = x } else { if (cs >= 0) { colRuns.push([cs, x - 1]); cs = -1 } }
}
if (cs >= 0) colRuns.push([cs, png.w - 1])
// 把窄的段合并（同一列的立绘和文字会连成一段）
const merged = []
for (const r of colRuns) {
  if (merged.length && r[0] - merged[merged.length - 1][1] < png.w * 0.012) merged[merged.length - 1][1] = r[1]
  else merged.push([...r])
}
console.log('检测到 ' + merged.length + ' 个横向内容段')
console.log('  段宽: ' + merged.map((r) => (r[1] - r[0] + 1)).join(','))

// ---- 2) 再找行：只看立绘区域，统计每一行的非背景像素 ----
// 立绘占大部分宽度，编号文字只占中间一小段 —— 用这个区别把"行"切出来
const rowCount = new Int32Array(png.h)
for (let y = 0; y < png.h; y++) {
  let n = 0
  for (let x = 0; x < png.w; x += 2) if (!isBg(x, y)) n++
  rowCount[y] = n
}
const rowRuns = []
let rs = -1
for (let y = 0; y < png.h; y++) {
  if (rowCount[y] > 4) { if (rs < 0) rs = y } else { if (rs >= 0) { rowRuns.push([rs, y - 1]); rs = -1 } }
}
if (rs >= 0) rowRuns.push([rs, png.h - 1])
const mergedRows = []
for (const r of rowRuns) {
  if (mergedRows.length && r[0] - mergedRows[mergedRows.length - 1][1] < png.h * 0.008) mergedRows[mergedRows.length - 1][1] = r[1]
  else mergedRows.push([...r])
}
console.log('检测到 ' + mergedRows.length + ' 个纵向内容段，高度: ' + mergedRows.map((r) => (r[1] - r[0] + 1)).join(','))

// ---- 3) 直接按"段"切，不按固定网格 ----
// 每个纵向段内，从左到右按横向段切出多只怪
let ok = 0
const index = {}
const pieces = []
for (const [ry0, ry1] of mergedRows) {
  if (ry1 - ry0 < png.h * 0.02) continue        // 太矮，是标题之类的横条
  for (const [cx0, cx1] of merged) {
    // 在该矩形内找非背景像素的紧致包围盒
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, n = 0
    for (let y = ry0; y <= ry1; y++) {
      for (let x = cx0; x <= cx1; x++) {
        if (isBg(x, y)) continue
        n++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
    if (maxX < 0 || n < 200) continue
    pieces.push({ x0: minX, y0: minY, x1: maxX, y1: maxY, n, w: maxX - minX + 1, h: maxY - minY + 1 })
  }
}
console.log('共切出候选块 ' + pieces.length + ' 个')
console.log('尺寸分布: ' + pieces.slice(0, 12).map((p) => p.w + 'x' + p.h).join(', '))

// 把候选块存成一张对照图（带序号），供人工核对后再映射 ID
const COLS = 9
const CW = Math.max(...pieces.map((p) => p.w)) + 8
const CH = Math.max(...pieces.map((p) => p.h)) + 8
const ROWS = Math.ceil(pieces.length / COLS)
const { makeFramebuffer } = await import('./pixel-canvas.mjs')
const fb = makeFramebuffer(COLS * CW, ROWS * CH)
for (let i = 0; i < fb.length; i += 4) { fb[i] = 240; fb[i + 1] = 240; fb[i + 2] = 244; fb[i + 3] = 255 }
pieces.forEach((p, k) => {
  const c = k % COLS, r = Math.floor(k / COLS)
  const ox = c * CW + 4, oy = r * CH + 4
  for (let y = p.y0; y <= p.y1; y++) {
    for (let x = p.x0; x <= p.x1; x++) {
      if (isBg(x, y)) continue
      const s = (y * png.w + x) * 4
      const d = ((oy + y - p.y0) * COLS * CW + ox + x - p.x0) * 4
      fb[d] = png.data[s]; fb[d + 1] = png.data[s + 1]; fb[d + 2] = png.data[s + 2]; fb[d + 3] = 255
    }
  }
})
fs.writeFileSync(path.join(ROOT, 'docs', 'sheets', '_atlas-pieces.png'), encodePng(COLS * CW, ROWS * CH, fb))
console.log('已输出 docs/sheets/_atlas-pieces.png（' + COLS * CW + '×' + ROWS * CH + '，' + pieces.length + ' 块）')
fs.writeFileSync(path.join(ROOT, '_tools', '_pieces.json'), JSON.stringify(pieces), 'utf8')
