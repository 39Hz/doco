// 在世界地图上叠加编号标记，用于核对热区坐标
// 用法: node overlay.mjs <底图> <输出> <x,y,标签> ...
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { execFileSync } from 'node:child_process'

// 复用 sheet.mjs 的解码思路，这里单独实现 jpeg 用不了，所以只支持 PNG 底图。
// 世界地图是 jpg，因此先用内置解码器转成 png（通过 _tools 里的转换脚本）。
const [src, out, ...marks] = process.argv.slice(2)

// --- 最小 PNG 编解码（只需支持 8bit RGB/RGBA 非隔行）---
function decodePng(buf) {
  let off = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12] }
    else if (type === 'IDAT') idat.push(Buffer.from(data))
    else if (type === 'IEND') break
    off += 12 + len
  }
  if (interlace) throw new Error('interlaced unsupported')
  if (bitDepth !== 8) throw new Error('bitDepth ' + bitDepth + ' unsupported')
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
  if (!ch) throw new Error('colorType ' + colorType)
  const stride = w * ch
  const outBuf = Buffer.alloc(h * stride)
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
    cur.copy(outBuf, y * stride); prev = cur
  }
  const rgba = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const s = i * ch, d = i * 4
    if (ch === 1) { rgba[d] = rgba[d + 1] = rgba[d + 2] = outBuf[s]; rgba[d + 3] = 255 }
    else if (ch === 2) { rgba[d] = rgba[d + 1] = rgba[d + 2] = outBuf[s]; rgba[d + 3] = outBuf[s + 1] }
    else if (ch === 3) { rgba[d] = outBuf[s]; rgba[d + 1] = outBuf[s + 1]; rgba[d + 2] = outBuf[s + 2]; rgba[d + 3] = 255 }
    else { rgba[d] = outBuf[s]; rgba[d + 1] = outBuf[s + 1]; rgba[d + 2] = outBuf[s + 2]; rgba[d + 3] = outBuf[s + 3] }
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
function encodePng(w, h, rgba) {
  const stride = w * 4
  const raw = Buffer.alloc(h * (stride + 1))
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  const chunk = (t, d) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(d.length)
    const td = Buffer.concat([Buffer.from(t, 'ascii'), d])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ])
}

// 5x7 点阵字体，够画标记数字和字母
const FONT = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  'I': ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  'J': ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  'W': ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
}

const img = decodePng(fs.readFileSync(src))
console.log(`底图 ${img.w}x${img.h}`)

const px = (x, y, r, g, b, a = 255) => {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return
  const o = (y * img.w + x) * 4
  const t = a / 255
  img.data[o] = img.data[o] * (1 - t) + r * t
  img.data[o + 1] = img.data[o + 1] * (1 - t) + g * t
  img.data[o + 2] = img.data[o + 2] * (1 - t) + b * t
  img.data[o + 3] = 255
}
const disc = (cx, cy, rad, r, g, b, a = 255) => {
  for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
    const d = Math.hypot(x, y)
    if (d <= rad) px(cx + x, cy + y, r, g, b, d > rad - 1.5 ? 255 : a)
  }
}
const cross = (cx, cy, len, r, g, b) => {
  for (let i = -len; i <= len; i++) { px(cx + i, cy, r, g, b); px(cx, cy + i, r, g, b) }
}
const text = (s, x, y, scale, r, g, b) => {
  let cx = x
  for (const c of s.toUpperCase()) {
    const glyph = FONT[c] || FONT[' ']
    for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++) {
      if (glyph[gy][gx] === '1') {
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) px(cx + gx * scale + sx, y + gy * scale + sy, r, g, b)
      }
    }
    cx += 6 * scale
  }
}

let n = 0
for (const m of marks) {
  const [xs, ys, label] = m.split(',')
  const x = Number(xs), y = Number(ys)
  n++
  // 十字准星 + 半透明圆盘 + 编号
  disc(x, y, 13, 255, 40, 40, 110)
  cross(x, y, 16, 255, 255, 0)
  text(label || String(n), x + 18, y - 20, 2, 255, 255, 0)
  console.log(`  标记 ${label || n}: (${x}, ${y})  → 百分比 (${(x / img.w * 100).toFixed(1)}%, ${(y / img.h * 100).toFixed(1)}%)`)
}

fs.writeFileSync(out, encodePng(img.w, img.h, img.data))
console.log(`已写出 ${out}`)
