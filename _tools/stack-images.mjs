// 把文字条按原始分辨率纵向堆叠成一张长图（不缩放），用于人工核对编号
// 用法: node stack-images.mjs <目录> <输出png> [筛选前缀] [每行最多几个]
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const DIR = process.argv[2]
const OUT = process.argv[3]
const PREFIX = process.argv[4] || ''
const PER_ROW = Number(process.argv[5] || 4)

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
function encode(w, h, rgba) {
  const stride = w * 4
  const raw = Buffer.alloc(h * (stride + 1))
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ])
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.png') && f.startsWith(PREFIX)).sort()
const imgs = files.map((f) => ({ f, img: decodePng(fs.readFileSync(path.join(DIR, f))) }))
console.log(`共 ${imgs.length} 张`)

// 按每行 PER_ROW 个排布，列宽取最大宽度，行高取该行最大高度
const cellW = Math.max(...imgs.map((x) => x.img.w)) + 12
const rows = Math.ceil(imgs.length / PER_ROW)
const rowH = []
for (let r = 0; r < rows; r++) {
  let h = 0
  for (let c = 0; c < PER_ROW; c++) {
    const it = imgs[r * PER_ROW + c]
    if (it) h = Math.max(h, it.img.h)
  }
  rowH.push(h + 10)
}
const W = cellW * PER_ROW
const H = rowH.reduce((a, b) => a + b, 0)
const canvas = Buffer.alloc(W * H * 4)
for (let i = 0; i < W * H; i++) { canvas[i * 4] = canvas[i * 4 + 1] = canvas[i * 4 + 2] = 255; canvas[i * 4 + 3] = 255 }

let oy = 0
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < PER_ROW; c++) {
    const it = imgs[r * PER_ROW + c]
    if (!it) continue
    const ox = c * cellW + 6
    for (let y = 0; y < it.img.h; y++) {
      for (let x = 0; x < it.img.w; x++) {
        const s = (y * it.img.w + x) * 4
        const d = ((oy + y) * W + ox + x) * 4
        canvas[d] = it.img.data[s]; canvas[d + 1] = it.img.data[s + 1]
        canvas[d + 2] = it.img.data[s + 2]; canvas[d + 3] = 255
      }
    }
  }
  oy += rowH[r]
}
fs.writeFileSync(OUT, encode(W, H, canvas))
console.log(`已写出 ${OUT}  ${W}x${H}`)
console.log('文件顺序（按行）：')
files.forEach((f, i) => {
  process.stdout.write(f.replace(/\.png$/, '') + '  ')
  if ((i + 1) % PER_ROW === 0) process.stdout.write('\n')
})
console.log('')
