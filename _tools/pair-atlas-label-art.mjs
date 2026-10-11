// 用**位置配对**建立「图鉴编号 ↔ 立绘块」的映射。
//
// 前面几版失败在"用 blob 索引 + 人工映射表"：blob 检测会漏掉一些块、顺序也不等于图鉴阅读顺序，
// 于是整体错位（赛罗特显示成章鱼、魔龙显示成天使）。
//
// 可靠做法：每个编号文字就印在它那只怪的正下方。所以
//   1) 把"编号文字"单独检测出来（它们是不透明的小字块）
//   2) 每个编号文字去找**正上方最近的那个立绘块**，配成一对
//   3) 编号 → 图鉴 ID 用文件名的映射表读出名字，再对到怪兽表
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const png = decodePng(fs.readFileSync(path.join(ROOT, '多克多比专区资料素材', 'npc大全', '怪物图鉴.png')))
const { w: PW, h: PH, data: PD } = png
const isOpaque = (x, y) => !(x < 0 || y < 0 || x >= PW || y >= PH) && PD[(y * PW + x) * 4 + 3] >= 24

// ---- 连通块（不透明像素）----
const label = new Int32Array(PW * PH).fill(-1)
const blobs = []
const stack = new Int32Array(PW * PH)
for (let sy = 0; sy < PH; sy++) {
  for (let sx = 0; sx < PW; sx++) {
    const s0 = sy * PW + sx
    if (!isOpaque(sx, sy) || label[s0] >= 0) continue
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
      if (x > 0) { const k = cur - 1; if (label[k] < 0 && PD[k * 4 + 3] >= 24) { label[k] = id; stack[top++] = k } }
      if (x < PW - 1) { const k = cur + 1; if (label[k] < 0 && PD[k * 4 + 3] >= 24) { label[k] = id; stack[top++] = k } }
      if (y > 0) { const k = cur - PW; if (label[k] < 0 && PD[k * 4 + 3] >= 24) { label[k] = id; stack[top++] = k } }
      if (y < PH - 1) { const k = cur + PW; if (label[k] < 0 && PD[k * 4 + 3] >= 24) { label[k] = id; stack[top++] = k } }
    }
    blobs.push({ id, minX, minY, maxX, maxY, n, w: maxX - minX + 1, h: maxY - minY + 1 })
  }
}
console.log('连通块 ' + blobs.length + ' 个')

// ---- 把小块水平合并成"编号文字" ----
// 编号是 6 个数字，每个数字是独立的小块，但间距很小；同一行的数字 y 基本一致。
// 做法：先取所有"小高度块"（h 在 12~40），按行聚类，再在行内按 x 间距合并。
const smalls = blobs.filter((b) => b.h >= 12 && b.h <= 44 && b.w >= 4 && b.w <= 40 && b.n < 900)
console.log('可能是数字的小块: ' + smalls.length)
const numRows = []
for (const b of [...smalls].sort((x, y) => x.minY - y.minY)) {
  let row = numRows.find((r) => Math.abs(r.cy - (b.minY + b.h / 2)) < 10)
  if (!row) { row = { cy: b.minY + b.h / 2, items: [] }; numRows.push(row) }
  row.items.push(b)
  row.cy = row.items.reduce((a2, x) => a2 + (x.minY + x.h / 2), 0) / row.items.length
}
// 行内按 x 合并成"文字串"：间距 < 12 视为同一串
const labels = []
for (const row of numRows) {
  const items = row.items.sort((a, b) => a.minX - b.minX)
  let cur = null
  for (const b of items) {
    if (cur && b.minX - cur.maxX < 14) {
      cur.maxX = Math.max(cur.maxX, b.maxX)
      cur.minY = Math.min(cur.minY, b.minY)
      cur.maxY = Math.max(cur.maxY, b.maxY)
    } else {
      if (cur) labels.push(cur)
      cur = { minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY }
    }
  }
  if (cur) labels.push(cur)
}
// 编号串：宽度 60~200（6 位数字），高度 12~44
const idLabels = labels.filter((L) => {
  const w = L.maxX - L.minX + 1, h = L.maxY - L.minY + 1
  return w >= 55 && w <= 210 && h >= 12 && h <= 44
})
console.log('识别出编号文字串: ' + idLabels.length + '（应约 61~72）')

// ---- 每个编号串 → 正上方最近的立绘块 ----
const arts = blobs.filter((b) => b.n >= 1500 && b.w >= 40 && b.h >= 40)
console.log('立绘候选块: ' + arts.length)
const pairs = []
for (const L of idLabels) {
  const lx = (L.minX + L.maxX) / 2
  let best = null
  for (const a of arts) {
    const ax = (a.minX + a.maxX) / 2
    const dx = Math.abs(ax - lx)
    const dy = L.minY - a.maxY            // 编号在立绘下方 → 正值
    if (dy < -10 || dy > 60) continue     // 太远不算
    if (dx > (a.w / 2 + 40)) continue     // 水平差太多
    const score = dx + Math.abs(dy) * 1.5
    if (!best || score < best.score) best = { a, score, dx, dy }
  }
  pairs.push({ L, art: best ? best.a : null, dx: best ? best.dx : null, dy: best ? best.dy : null })
}
const okPairs = pairs.filter((p) => p.art)
console.log('配对成功: ' + okPairs.length + '/' + pairs.length)

// ---- 手动读出的编号（从 docs/sheets/_readids.png + 行图核对的结果）----
// 说明：图鉴里有 11 个格子的编号被黑条涂掉，读不出来；这里只放能读出来的。
// 按"每行从左到右"的顺序记录，key 是配对的序号（配对结果按 y 再按 x 排序后编号）。
const SORTED = [...okPairs].sort((p, q) => (p.L.minY - q.L.minY) || (p.L.minX - q.L.minX))
console.log('\n=== 按位置排序的配对（序号: 立绘中心x, 编号中心x, 水平差, 垂直差）===')
SORTED.forEach((p, i) => {
  const ax = Math.round((p.art.minX + p.art.maxX) / 2)
  const lx = Math.round((p.L.minX + p.L.maxX) / 2)
  const w = p.L.maxX - p.L.minX + 1
  console.log('  ' + String(i).padStart(2) + ': art@' + String(ax).padStart(4) + ' label@' + String(lx).padStart(4) +
    '  水平差' + String(Math.round(p.dx)).padStart(4) + ' 垂直差' + String(Math.round(p.dy)).padStart(3) +
    '  编号宽' + String(w).padStart(3) + '  立绘 ' + p.art.w + '×' + p.art.h)
})
// ---- 4) 放宽过滤：把全部立绘块都配上编号 ----
// 之前限制 dy<=40 只得到 38 对；但图鉴有的行编号离立绘更远（行距不同）。
// 这里按"每个立绘块只取水平差最小、且在其下方的编号"，不再卡死 dy 阈值。
const byArt = new Map()
const artsAll = blobs.filter((b) => b.n >= 1500 && b.w >= 40 && b.h >= 40)
for (const a of artsAll) {
  const ax = (a.minX + a.maxX) / 2
  let best = null
  for (const L of idLabels) {
    const lx = (L.minX + L.maxX) / 2
    const dy = L.minY - a.maxY
    if (dy < -8 || dy > 90) continue                 // 编号必须在立绘下方（允许稍远）
    if (Math.abs(lx - ax) > a.w * 0.75 + 30) continue // 水平不能差太多
    const score = Math.abs(lx - ax) * 1.0 + dy * 0.8
    if (!best || score < best.score) best = { L, score, dx: lx - ax, dy }
  }
  if (best) byArt.set(a.minX + ',' + a.minY, { art: a, ...best })
}
// 一个编号只配一个立绘（取 score 最小的）
const byLabel = new Map()
for (const p of byArt.values()) {
  const key = p.L.minX + ',' + p.L.minY
  const cur = byLabel.get(key)
  if (!cur || p.score < cur.score) byLabel.set(key, p)
}
const FINAL = [...byLabel.values()].sort((p, q) => (p.L.minY - q.L.minY) || (p.L.minX - q.L.minX))
console.log('放宽后配对: ' + FINAL.length)

console.log('\n=== 最终配对（序号: 立绘, 编号, 水平差, 垂直差）===')
FINAL.forEach((p, i) => {
  const ax = Math.round((p.art.minX + p.art.maxX) / 2)
  const lx = Math.round((p.L.minX + p.L.maxX) / 2)
  console.log('  ' + String(i).padStart(2) + ': art@' + String(ax).padStart(4) + ' label@' + String(lx).padStart(4) +
    '  Δx' + String(Math.round(p.dx)).padStart(4) + ' Δy' + String(Math.round(p.dy)).padStart(3) +
    '  立绘 ' + p.art.w + '×' + p.art.h)
})
fs.writeFileSync(path.join(ROOT, '_tools', '_pairs.json'), JSON.stringify(FINAL.map((p) => ({
  art: { x: p.art.minX, y: p.art.minY, w: p.art.w, h: p.art.h },
  label: { x: p.L.minX, y: p.L.minY, w: p.L.maxX - p.L.minX + 1, h: p.L.maxY - p.L.minY + 1 },
  dx: p.dx, dy: p.dy,
}))), 'utf8')
console.log('\n已写 _tools/_pairs.json（' + FINAL.length + ' 对）')

