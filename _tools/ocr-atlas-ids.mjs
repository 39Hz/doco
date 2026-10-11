// 自动识别图鉴编号：数字是固定点阵字体，做**模板匹配 + 位置传播**。
//
// 人工读编号的办法已经证明不可靠（72 个里错位/漏了几个，导致 42 只怪对不上）。
// 正确做法：
//   1) 把编号切成单个数字位图（按列空隙分割）
//   2) 位置 0/1 几乎全是 "1"、"1"（编号形如 110007 / 119003），先把这两位的模板定下来
//   3) 用已知模板去匹配其余位置，把新匹配上的字形加入模板库（自举）
//   4) 全部 6 位解码完，得到 编号 → 立绘块 的精确对应
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

// ---- 把编号区域转成二值位图，并裁到刚好包住 ----
function toBitmap(L) {
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1
  for (let y = L.y; y < L.y + L.h; y++) {
    for (let x = L.x; x < L.x + L.w; x++) {
      if (isBg(x, y)) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  const w = maxX - minX + 1, h = maxY - minY + 1
  const bm = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) bm[y * w + x] = isBg(minX + x, minY + y) ? 0 : 1
  }
  // 上采样到固定高度 24，便于比较（最近邻即可，字形是点阵）
  const H2 = 24
  const W2 = Math.max(1, Math.round((w / h) * H2))
  const up = new Uint8Array(W2 * H2)
  for (let y = 0; y < H2; y++) {
    for (let x = 0; x < W2; x++) {
      const sx = Math.min(w - 1, Math.floor((x / W2) * w))
      const sy = Math.min(h - 1, Math.floor((y / H2) * h))
      up[y * W2 + x] = bm[sy * w + sx]
    }
  }
  return { w: W2, h: H2, bm: up, rawW: w, rawH: h, ox: minX, oy: minY }
}

// ---- 按列空隙切出单个数字 ----
function splitDigits(lab) {
  const { w, h, bm } = lab
  const colHas = new Uint8Array(w)
  for (let x = 0; x < w; x++) {
    let n = 0
    for (let y = 0; y < h; y++) if (bm[y * w + x]) n++
    colHas[x] = n
  }
  // 找连续有内容的列段
  const segs = []
  let s = -1
  for (let x = 0; x < w; x++) {
    if (colHas[x] > 0) { if (s < 0) s = x } else { if (s >= 0) { segs.push([s, x - 1]); s = -1 } }
  }
  if (s >= 0) segs.push([s, w - 1])
  // 相邻段之间的空隙太小就合并（数字内部可能有空隙，比如 0 的中间是空的但列不空）
  const merged = []
  for (const g of segs) {
    if (merged.length && g[0] - merged[merged.length - 1][1] <= 1) merged[merged.length - 1][1] = g[1]
    else merged.push([...g])
  }
  return merged.map(([x0, x1]) => {
    const dw = x1 - x0 + 1
    const d = new Uint8Array(dw * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < dw; x++) d[y * dw + x] = bm[y * w + x0 + x]
    return { w: dw, h, bm: d }
  })
}

// ---- 字形相似度：尺寸一致时按重合度算 ----
function similar(a, b) {
  if (Math.abs(a.w - b.w) > 1 || a.h !== b.h) return 0
  const w = Math.min(a.w, b.w)
  let same = 0, tot = 0
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < w; x++) {
      const va = a.bm[y * a.w + x], vb = b.bm[y * b.w + x]
      if (va || vb) tot++
      if (va === vb) same++
    }
  }
  return tot ? same / tot : 0
}

const labs = withLabel.map((it) => toBitmap(it.label)).filter(Boolean)
console.log('可用编号位图: ' + labs.length + '（宽度分布 ' + [...new Set(labs.map((l) => l.w))].sort((a, b) => a - b).join(',') + '）')
const digitsOf = labs.map((l) => splitDigits(l))
console.log('切出的位数分布: ' + JSON.stringify([...new Set(digitsOf.map((d) => d.length))].sort()))
const six = digitsOf.map((d, i) => ({ i, d })).filter((x) => x.d.length === 6)
console.log('恰好 6 位的: ' + six.length)

// ---- 自举模板：位置 0/1 基本都是 1 ----
const templates = new Map()   // 字符 -> 模板位图
function addTemplate(ch, g) { if (!templates.has(ch)) templates.set(ch, g) }
// 位置 0：取出现最多的字形当 '1'
for (const pos of [0, 1]) {
  const groups = []
  for (const { d } of six) {
    const g = d[pos]
    let hit = groups.find((gr) => similar(gr.g, g) > 0.9)
    if (hit) { hit.n++; } else groups.push({ g, n: 1 })
  }
  groups.sort((a, b) => b.n - a.n)
  addTemplate('1', groups[0].g)
  console.log('位置 ' + pos + ' 的字形组数 ' + groups.length + '，最常见占 ' + groups[0].n + '/' + six.length + ' → 判为 "1"')
}
// 位置 2：110xxx 是 0，119xxx 是 9
{
  const groups = []
  for (const { d } of six) {
    const g = d[2]
    let hit = groups.find((gr) => similar(gr.g, g) > 0.9)
    if (hit) hit.n++; else groups.push({ g, n: 1 })
  }
  groups.sort((a, b) => b.n - a.n)
  console.log('位置 2 的字形组数 ' + groups.length + '，前两组占比 ' + groups.slice(0, 2).map((g) => g.n).join('/') + ' → 分别判为 "0" 和 "9"（0 更多）')
  addTemplate('0', groups[0].g)
  if (groups[1]) addTemplate('9', groups[1].g)
}
// 位置 3：普通怪是 0，BOSS 是 0/0/9? 实际 119001 与 110001 的差异在第 3 位（1 vs 9 已在位置 2 处理）
// 这里把位置 3 最常见的当 '0'，其余靠匹配
{
  const groups = []
  for (const { d } of six) {
    const g = d[3]
    let hit = groups.find((gr) => similar(gr.g, g) > 0.9)
    if (hit) hit.n++; else groups.push({ g, n: 1 })
  }
  groups.sort((a, b) => b.n - a.n)
  if (!templates.has('0')) addTemplate('0', groups[0].g)
  console.log('位置 3 字形组数 ' + groups.length + '，最常见 ' + groups[0].n + ' 次')
}

// ---- 迭代自举：用现有模板匹配所有位，未匹配的聚成新组，人工不可行 → 用"已确定整串"反推 ----
// 更稳的办法：先把能全串匹配上模板的编号定下来，再用它们扩展
function matchChar(g) {
  let best = null, bestScore = 0
  for (const [ch, t] of templates) {
    const sc = similar(t, g)
    if (sc > bestScore) { bestScore = sc; best = ch }
  }
  return bestScore >= 0.72 ? { ch: best, score: bestScore } : null
}

// 已知：编号只可能是 110xxx / 119xxx，且第 4~6 位是数字。
// 先把位置 4、5 的模板用"出现最多的那种"起头不合适（数字未知），
// 改为：把所有 position4/5 的字形做全量聚类，聚类数应该 ≈ 10（数字 0-9），
// 然后用"已知编号序列"来给聚类贴标签 —— 但这里没有已知序列。
// 所以换一条路：直接把聚类结果导出成一张对照图，人工只读 10 个数字一次。
const allGlyphs = []
for (const { d } of six) for (let p = 4; p <= 5; p++) allGlyphs.push(d[p])
const clusters = []
for (const g of allGlyphs) {
  let hit = clusters.find((c) => similar(c.g, g) > 0.9)
  if (hit) hit.n++; else clusters.push({ g, n: 1 })
}
clusters.sort((a, b) => b.n - a.n)
console.log('\n末两位字形聚类数: ' + clusters.length + '（应当接近 10 种数字）')

// 导出聚类对照图（放大 8 倍）
const SCALE = 8
const cw = Math.max(...clusters.map((c) => c.g.w)) * SCALE + 16
const chh = 24 * SCALE + 16
const COLS = Math.min(clusters.length, 10)
const ROWS = Math.ceil(clusters.length / COLS)
const fb = makeFramebuffer(COLS * cw, ROWS * chh)
for (let i = 0; i < fb.length; i += 4) { fb[i] = 255; fb[i + 1] = 255; fb[i + 2] = 255; fb[i + 3] = 255 }
clusters.forEach((c, k) => {
  const cc = k % COLS, rr = Math.floor(k / COLS)
  const ox = cc * cw + 8, oy = rr * chh + 8
  for (let y = 0; y < c.g.h; y++) {
    for (let x = 0; x < c.g.w; x++) {
      if (!c.g.bm[y * c.g.w + x]) continue
      for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) {
        const px = ox + x * SCALE + dx, py = oy + y * SCALE + dy
        if (px < 0 || py < 0 || px >= COLS * cw || py >= ROWS * chh) continue
        const d = (py * COLS * cw + px) * 4
        fb[d] = 0; fb[d + 1] = 0; fb[d + 2] = 0; fb[d + 3] = 255
      }
    }
  }
})
const p = path.join(ROOT, 'docs', 'sheets', '_digitclusters.png')
fs.writeFileSync(p, encodePng(COLS * cw, ROWS * chh, fb))
console.log('已输出 ' + p + '（' + COLS * cw + '×' + ROWS * chh + '，' + clusters.length + ' 个字形，放大 8x）')
console.log('聚类按出现次数排序，次数: ' + clusters.map((c) => c.n).join(','))
fs.writeFileSync(path.join(ROOT, '_tools', '_digitclusters.json'), JSON.stringify(clusters.map((c) => ({ w: c.g.w, h: c.g.h, n: c.n, bm: Buffer.from(c.g.bm).toString('base64') }))), 'utf8')
fs.writeFileSync(path.join(ROOT, '_tools', '_sixdigits.json'), JSON.stringify(six.map((x) => ({
  blob: x.i,
  digits: x.d.map((g) => ({ w: g.w, h: g.h, bm: Buffer.from(g.bm).toString('base64') })),
}))), 'utf8')
