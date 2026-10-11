// 从怪物图鉴切出每只怪物（v3）
//
// 关键改进：每个格子内部「立绘」和下方「编号+名字」之间有一条水平空隙，
// 用行投影找到这条空隙来分割，立绘归立绘、文字归文字。
// v1/v2 的问题就是没做这个分割，导致立绘包围盒把文字也包进去，
// 于是既切不准、也读不到编号。
//
// 输出：
//   <out>/m_NNN.png        统一尺寸的怪物立绘（方形画布、底部居中）
//   <out>/label_NNN.png    对应的编号+名字文字条（供识别 ID）
//   <out>/index.json       每只的立绘框、文字框、尺寸
//
// 用法: node slice-atlas.mjs <图鉴png> <输出目录> [目标尺寸=200]
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const SRC = process.argv[2]
const OUT = process.argv[3]
const TARGET = Number(process.argv[4] || 200)

// ---------------- PNG 解码 ----------------
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
  if (interlace || bitDepth !== 8) throw new Error('unsupported png')
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

// ---------------- PNG 编码 ----------------
let CRC = null
function crc32(buf) {
  if (!CRC) { CRC = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c } }
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(t, d) {
  const len = Buffer.alloc(4); len.writeUInt32BE(d.length)
  const td = Buffer.concat([Buffer.from(t, 'ascii'), d])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function encodeRgba(w, h, rgba) {
  const stride = w * 4
  const raw = Buffer.alloc(h * (stride + 1))
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const line = rgba.subarray(y * stride, y * stride + stride)
    raw[y * (stride + 1)] = 4
    const dst = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? line[x - 4] : 0, b = prev[x], c = x >= 4 ? prev[x - 4] : 0
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
      const pred = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      dst[x] = (line[x] - pred) & 0xff
    }
    prev = line
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9, memLevel: 9 })), chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------- 像素工具 ----------------
const isInk = (d, i) => d[i + 3] > 24 && !(d[i] > 242 && d[i + 1] > 242 && d[i + 2] > 242)
// 彩色墨迹：三个通道差异明显（怪物立绘都是有色的；文字、轮廓、阴影是灰的）
const isColorInk = (d, i) => {
  if (!isInk(d, i)) return false
  const r = d[i], g = d[i + 1], b = d[i + 2]
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  return (mx - mn) > 26
}
function makeMask(img) {
  const m = new Uint8Array(img.w * img.h)
  for (let i = 0, p = 0; p < m.length; p++, i += 4) m[p] = isInk(img.data, i) ? 1 : 0
  return m
}
function makeColorMask(img) {
  const m = new Uint8Array(img.w * img.h)
  for (let i = 0, p = 0; p < m.length; p++, i += 4) m[p] = isColorInk(img.data, i) ? 1 : 0
  return m
}

// ---------------- 主流程 ----------------
console.log('解码图鉴…')
const img = decodePng(fs.readFileSync(SRC))
const mask = makeMask(img)
const colorMask = makeColorMask(img)
console.log(`  ${img.w}x${img.h}`)

// 只保留**含彩色**的行带 —— 怪物立绘是彩色的，标题、「普通/BOSS」标签、
// 编号名字行、阴影轮廓都是灰的，靠这一条就能把无关内容全部滤掉。
const rowInk = new Int32Array(img.h)
for (let y = 0; y < img.h; y++) {
  let n = 0, c = 0
  const o = y * img.w
  for (let x = 0; x < img.w; x++) { n += mask[o + x]; c += colorMask[o + x] }
  rowInk[y] = n
  if (c >= 3) rowInk[y] = Math.max(rowInk[y], 1)   // 标记为有效行
}
// 用「彩色行」重建有效行标记
const rowValid = new Uint8Array(img.h)
for (let y = 0; y < img.h; y++) {
  let c = 0
  const o = y * img.w
  for (let x = 0; x < img.w; x++) c += colorMask[o + x]
  rowValid[y] = c >= 3 ? 1 : 0
}

// 1) 只在「彩色行」上找内容带（间隙 >= 8 行断开，足以跨过立绘与文字行之间的空白）
const bands = []
{
  let y = 0
  while (y < img.h) {
    while (y < img.h && !rowValid[y]) y++
    if (y >= img.h) break
    const y0 = y
    let gap = 0
    while (y < img.h && gap < 8) {
      if (!rowValid[y]) gap++
      else gap = 0
      y++
    }
    const y1 = y - gap
    if (y1 - y0 >= 50) bands.push([y0, y1])
  }
}
console.log(`彩色内容带 ${bands.length} 段`)

fs.mkdirSync(OUT, { recursive: true })
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f))

const items = []
let n = 0

for (const [by0, by1] of bands) {
  // 2) 带内按列切
  const cols = new Int32Array(img.w)
  for (let x = 0; x < img.w; x++) {
    let c = 0
    for (let yy = by0; yy < by1; yy++) c += mask[yy * img.w + x]
    cols[x] = c
  }
  let x = 0
  const cells = []
  while (x < img.w) {
    while (x < img.w && cols[x] === 0) x++
    if (x >= img.w) break
    const x0 = x
    let gap = 0
    while (x < img.w && gap < 6) { if (cols[x] === 0) gap++; else gap = 0; x++ }
    const x1 = x - gap
    if (x1 - x0 >= 40) cells.push([x0, x1])
  }

  for (const [cx0, cx1] of cells) {
    // 3) 格子内部：行投影找「立绘 / 空隙 / 文字」三段
    const rInk = []
    for (let yy = by0; yy < by1; yy++) {
      let c = 0
      for (let xx = cx0; xx < cx1; xx++) c += mask[yy * img.w + xx]
      rInk.push(c)
    }
    // 分割「立绘 / 文字」：
    // 实测图鉴里立绘下方那行文字与立绘之间的空隙，比立绘内部空隙更可靠地
    // 出现在「底部 20%」区域。这里取位于 72% 高度之后的第一个足够宽的空隙。
    // （早期版本用「最大空隙」，结果多数格子切不出来。）
    const totalInk = rInk.reduce((a, b) => a + b, 0)
    if (totalInk === 0) continue
    let acc = 0, cut = -1, cutLen = 0
    let i2 = 0
    while (i2 < rInk.length) {
      if (rInk[i2] === 0) {
        const s = i2
        while (i2 < rInk.length && rInk[i2] === 0) i2++
        const len = i2 - s
        if (acc >= totalInk * 0.72 && s > 0 && i2 < rInk.length && len >= 4) {
          cut = s; cutLen = len; break
        }
      } else {
        acc += rInk[i2]
        i2++
      }
    }
    // 找不到合适空隙就退化为「下方 22% 视为文字」
    let bestGapStart, bestGapLen
    if (cut < 0) {
      bestGapStart = Math.round(rInk.length * 0.78)
      bestGapLen = 2
    } else {
      bestGapStart = cut; bestGapLen = cutLen
    }

    const artY0 = by0, artY1 = by0 + bestGapStart - 1
    const txtY0 = by0 + bestGapStart + bestGapLen, txtY1 = by1 - 1
    if (artY1 - artY0 < 40) continue

    // 立绘包围盒（只在 art 段内）
    let ax0 = cx1, ax1 = cx0, ay0 = artY1, ay1 = artY0
    for (let yy = artY0; yy <= artY1; yy++) {
      for (let xx = cx0; xx < cx1; xx++) {
        if (!mask[yy * img.w + xx]) continue
        if (xx < ax0) ax0 = xx
        if (xx > ax1) ax1 = xx
        if (yy < ay0) ay0 = yy
        if (yy > ay1) ay1 = yy
      }
    }
    if (ax1 < ax0) continue
    const aw = ax1 - ax0 + 1, ah = ay1 - ay0 + 1
    if (aw < 40 || ah < 45) continue
    // 立绘判据：宽高比不能太扁（文字条又扁又宽），且墨迹密度要够
    if (aw / ah > 2.6) continue
    let inkIn = 0
    for (let yy = ay0; yy <= ay1; yy++) {
      for (let xx = ax0; xx <= ax1; xx++) if (mask[yy * img.w + xx]) inkIn++
    }
    const density = inkIn / (aw * ah)
    if (density < 0.16) continue

    // 4) 缩放立绘到方形画布
    const k = Math.min(1, (TARGET - 10) / Math.max(aw, ah))
    const sw = Math.max(1, Math.round(aw * k)), sh = Math.max(1, Math.round(ah * k))
    const canvas = Buffer.alloc(TARGET * TARGET * 4)
    for (let dy = 0; dy < sh; dy++) {
      const sy0 = ay0 + Math.floor(dy * ah / sh), sy1 = Math.max(sy0 + 1, ay0 + Math.ceil((dy + 1) * ah / sh))
      for (let dx = 0; dx < sw; dx++) {
        const sx0 = ax0 + Math.floor(dx * aw / sw), sx1 = Math.max(sx0 + 1, ax0 + Math.ceil((dx + 1) * aw / sw))
        let r = 0, g = 0, b = 0, inkN = 0, tot = 0
        for (let sy = sy0; sy < Math.min(sy1, img.h); sy++) {
          for (let sx = sx0; sx < Math.min(sx1, img.w); sx++) {
            tot++
            const i2 = (sy * img.w + sx) * 4
            if (!isInk(img.data, i2)) continue
            r += img.data[i2]; g += img.data[i2 + 1]; b += img.data[i2 + 2]; inkN++
          }
        }
        if (!inkN) continue
        const ox = Math.round((TARGET - sw) / 2) + dx
        const oy = TARGET - sh - 5 + dy
        if (ox < 0 || oy < 0 || ox >= TARGET || oy >= TARGET) continue
        const o = (oy * TARGET + ox) * 4
        canvas[o] = r / inkN; canvas[o + 1] = g / inkN; canvas[o + 2] = b / inkN
        canvas[o + 3] = Math.min(255, Math.round(255 * inkN / Math.max(1, tot) * 1.6))
      }
    }
    const id = String(n).padStart(3, '0')
    fs.writeFileSync(path.join(OUT, `m_${id}.png`), encodeRgba(TARGET, TARGET, canvas))

    // 5) 文字条单独导出（按文字实际包围盒裁）
    let tx0 = cx1, tx1 = cx0, tyy0 = txtY1, tyy1 = txtY0
    for (let yy = txtY0; yy <= txtY1; yy++) {
      for (let xx = cx0; xx < cx1; xx++) {
        if (!mask[yy * img.w + xx]) continue
        if (xx < tx0) tx0 = xx
        if (xx > tx1) tx1 = xx
        if (yy < tyy0) tyy0 = yy
        if (yy > tyy1) tyy1 = yy
      }
    }
    let label = null
    if (tx1 > tx0 && tyy1 > tyy0) {
      const lw = tx1 - tx0 + 1, lh = tyy1 - tyy0 + 1
      const lab = Buffer.alloc(lw * lh * 4)
      for (let yy = 0; yy < lh; yy++) {
        for (let xx = 0; xx < lw; xx++) {
          const si = ((tyy0 + yy) * img.w + tx0 + xx) * 4
          const o = (yy * lw + xx) * 4
          // 文字条转成黑字白底，便于后续识别
          const ink = isInk(img.data, si)
          lab[o] = lab[o + 1] = lab[o + 2] = ink ? 0 : 255
          lab[o + 3] = 255
        }
      }
      fs.writeFileSync(path.join(OUT, `label_${id}.png`), encodeRgba(lw, lh, lab))
      label = { x0: tx0, y0: tyy0, w: lw, h: lh }
    }

    items.push({ idx: id, art: { x0: ax0, y0: ay0, w: aw, h: ah }, label, bytes: fs.statSync(path.join(OUT, `m_${id}.png`)).size })
    n++
  }
  process.stdout.write(`\r  已导出 ${n} 只`)
}

console.log(`\n完成：${n} 只怪物 -> ${OUT}`)
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({
  source: path.basename(SRC), target: TARGET, count: n, items,
}, null, 2))
const tot = items.reduce((a, m) => a + m.bytes, 0)
const withLabel = items.filter((i) => i.label).length
console.log(`  立绘总体积 ${(tot / 1048576).toFixed(2)} MB，平均 ${(tot / Math.max(1, n) / 1024).toFixed(1)} KB/只`)
console.log(`  带文字条 ${withLabel} / ${n}`)
