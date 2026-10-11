// 按原始像素渲染精灵帧并画参考网格，用于核对帧内定位与对齐
// 用法: node anim-sheet.mjs <精灵目录> <输出png> [列数] [缩放倍数] [最多帧]
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const dir = process.argv[2]
const outFile = process.argv[3]
const COLS = Number(process.argv[4] || 8)
const ZOOM = Number(process.argv[5] || 1)
const LIMIT = Number(process.argv[6] || 0)

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
  if (interlace || bitDepth !== 8) throw new Error('unsupported')
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
function encodePng(w, h, rgba) {
  const stride = w * 4
  const raw = Buffer.alloc(h * (stride + 1))
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ])
}

const files = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort()
const use = LIMIT ? files.slice(0, LIMIT) : files
const imgs = use.map((f) => decodePng(fs.readFileSync(path.join(dir, f))))
const cw = Math.max(...imgs.map((i) => i.w)) * ZOOM
const chh = Math.max(...imgs.map((i) => i.h)) * ZOOM
const rows = Math.ceil(use.length / COLS)
const W = COLS * cw, H = rows * chh
const canvas = Buffer.alloc(W * H * 4)
// 深色底，便于看清透明区
for (let i = 0; i < W * H; i++) { canvas[i * 4] = 30; canvas[i * 4 + 1] = 33; canvas[i * 4 + 2] = 42; canvas[i * 4 + 3] = 255 }

imgs.forEach((img, i) => {
  const cx = (i % COLS) * cw, cy = Math.floor(i / COLS) * chh
  for (let y = 0; y < img.h * ZOOM; y++) {
    for (let x = 0; x < img.w * ZOOM; x++) {
      const s = (Math.floor(y / ZOOM) * img.w + Math.floor(x / ZOOM)) * 4
      const a = img.data[s + 3] / 255
      if (a === 0) continue
      const dx = cx + x, dy = cy + y
      if (dx >= W || dy >= H) continue
      const o = (dy * W + dx) * 4
      canvas[o] = canvas[o] * (1 - a) + img.data[s] * a
      canvas[o + 1] = canvas[o + 1] * (1 - a) + img.data[s + 1] * a
      canvas[o + 2] = canvas[o + 2] * (1 - a) + img.data[s + 2] * a
      canvas[o + 3] = 255
    }
  }
  // 画格子边界（1px 亮线），用于核对帧内定位
  for (let x = 0; x < cw; x++) { const o = (cy * W + cx + x) * 4; canvas[o] = 90; canvas[o + 1] = 200; canvas[o + 2] = 190 }
  for (let y = 0; y < chh; y++) { const o = ((cy + y) * W + cx) * 4; canvas[o] = 90; canvas[o + 1] = 200; canvas[o + 2] = 190 }
})

fs.writeFileSync(outFile, encodePng(W, H, canvas))
console.log(`精灵逐帧图: ${outFile}  ${W}x${H}  每格 ${cw}x${chh}  共 ${use.length} 帧`)
console.log(`  格子边框颜色为青色，用于核对角色在画布内的位置`)
