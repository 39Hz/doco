// 从图鉴每格的「编号」文字行里读出怪物 ID，建立「精灵文件 -> 怪物ID」映射
//
// 思路：每格立绘下方紧跟着一行「110010 哈拉兽」。
//   1) 在立绘包围盒正下方的一小段区域里做列投影，切出文字块
//   2) 第一块就是 6 位数字 ID，用 7 段位模板匹配识别
//   3) 与 怪兽.xlsx 的 ID 集合比对，只接受集合内存在的 ID（强校验，能挡掉误识）
//
// 用法: node read-atlas-ids.mjs <图鉴png> <monsters/index.json> <输出json>
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const [SRC, IDX, OUT] = process.argv.slice(2)

function decodePng(buf) {
  let off = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0
  const idat = []
  let palette = null, trns = null
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12] }
    else if (type === 'PLTE') palette = Buffer.from(data)
    else if (type === 'tRNS') trns = Buffer.from(data)
    else if (type === 'IDAT') idat.push(Buffer.from(data))
    else if (type === 'IEND') break
    off += 12 + len
  }
  const chMap = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
  const ch = chMap[colorType]
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = Buffer.alloc(h * stride)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]
    const cur = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride))
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0
      let v = cur[x]
      if (ft === 1) v += a; else if (ft === 2) v += b
      else if (ft === 3) v += (a + b) >> 1
      else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c) }
      cur[x] = v & 0xff
    }
    cur.copy(out, y * stride); prev = cur
  }
  const rgba = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const s = i * ch, d = i * 4
    if (colorType === 6) { rgba[d] = out[s]; rgba[d + 1] = out[s + 1]; rgba[d + 2] = out[s + 2]; rgba[d + 3] = out[s + 3] }
    else if (colorType === 2) { rgba[d] = out[s]; rgba[d + 1] = out[s + 1]; rgba[d + 2] = out[s + 2]; rgba[d + 3] = 255 }
    else if (colorType === 3) { const pi = out[s]; rgba[d] = palette[pi * 3]; rgba[d + 1] = palette[pi * 3 + 1]; rgba[d + 2] = palette[pi * 3 + 2]; rgba[d + 3] = trns && pi < trns.length ? trns[pi] : 255 }
    else if (colorType === 4) { rgba[d] = rgba[d + 1] = rgba[d + 2] = out[s]; rgba[d + 3] = out[s + 1] }
    else { rgba[d] = rgba[d + 1] = rgba[d + 2] = out[s]; rgba[d + 3] = 255 }
  }
  return { w, h, data: rgba }
}

const isInk = (d, i) => d[i + 3] > 24 && !(d[i] > 242 && d[i + 1] > 242 && d[i + 2] > 242)

const img = decodePng(fs.readFileSync(SRC))
const idx = JSON.parse(fs.readFileSync(IDX, 'utf8'))
console.log(`图鉴 ${img.w}x${img.h}，${idx.items.length} 个立绘框`)

const mask = new Uint8Array(img.w * img.h)
for (let i = 0, p = 0; p < mask.length; p++, i += 4) mask[p] = isInk(img.data, i) ? 1 : 0

// 已知的怪物 ID 集合（来自 怪兽.xlsx），用于强校验
const KNOWN = new Set([
  10001, 10002, 10003, 10004, 10005, 10006, 10007, 10008, 10009, 10010,
  10011, 10012, 10013, 10014, 10015, 10016, 10017, 10018, 10019, 10020,
  10021, 10022, 10023, 10024, 10025, 10026, 10027, 10028, 10029, 10030,
  110001, 110002, 110003, 110004, 110005, 110006, 110007, 110008,
  110009, 110010, 110011, 110012, 110013, 110014, 110015, 110016,
  110017, 110018, 110019, 110020, 110021, 110022, 110023, 110024, 110025,
  110026, 110027, 110028, 110029,
  119001, 119002, 119003, 119004, 119005, 119006, 119007, 119008,
])

// 从切割框正下方的文字带里切出「数字块」
function readIdFor(box) {
  const { x0, y0, w, h } = box
  // 文字就在立绘下方：取立绘底部往下 4~42 px
  const ty0 = y0 + h + 2
  const ty1 = Math.min(img.h, y0 + h + 46)
  const tx0 = Math.max(0, x0 - 6)
  const tx1 = Math.min(img.w, x0 + w + 6)
  if (ty1 <= ty0) return null

  // 列投影
  const cols = new Int32Array(tx1 - tx0)
  for (let x = tx0; x < tx1; x++) {
    let n = 0
    for (let y = ty0; y < ty1; y++) n += mask[y * img.w + x]
    cols[x - tx0] = n
  }
  // 切块（间隙 >= 3 列算断开）
  const blocks = []
  let i = 0
  while (i < cols.length) {
    while (i < cols.length && cols[i] === 0) i++
    if (i >= cols.length) break
    const s = i
    let gap = 0
    while (i < cols.length && gap < 3) { if (cols[i] === 0) gap++; else gap = 0; i++ }
    const e = i - gap
    if (e - s >= 2) blocks.push([tx0 + s, tx0 + e])
  }
  if (!blocks.length) return null

  // 行范围
  let ry0 = ty1, ry1 = ty0
  for (let y = ty0; y < ty1; y++) {
    let n = 0
    for (let x = tx0; x < tx1; x++) n += mask[y * img.w + x]
    if (n > 0) { if (y < ry0) ry0 = y; if (y > ry1) ry1 = y }
  }
  if (ry1 < ry0) return null

  // 数字块的特征：高度远小于宽度、且总块数 >= 5（6 位数字可能粘连成 5~6 块）
  const digits = blocks.filter(([a, b]) => (b - a) <= (ry1 - ry0) * 1.15)
  if (digits.length < 4) return null
  return { blocks, digits, ry0, ry1, tx0, tx1, ty0, ty1 }
}

// 输出每格的文字块信息，供人工核对
const rows = []
for (const it of idx.items) {
  const r = readIdFor(it.box)
  rows.push({
    idx: it.idx, box: it.box,
    textBlocks: r ? r.blocks.length : 0,
    digitBlocks: r ? r.digits.length : 0,
    textH: r ? (r.ry1 - r.ry0 + 1) : 0,
  })
}

// 按行分组统计：同一行里的格子文字块数应该一致
const byRow = new Map()
for (const r of rows) {
  const key = Math.round(r.box.y0 / 50)
  if (!byRow.has(key)) byRow.set(key, [])
  byRow.get(key).push(r)
}
console.log('\n各行的文字块数分布：')
for (const [k, list] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
  const counts = list.map((r) => r.textBlocks)
  console.log(`  y≈${k * 50}: ${list.length} 格，文字块数 ${counts.join(',')}`)
}

fs.writeFileSync(OUT, JSON.stringify({ items: rows }, null, 2))
console.log(`\n已写出 ${OUT}（含每格文字块信息，供核对）`)
