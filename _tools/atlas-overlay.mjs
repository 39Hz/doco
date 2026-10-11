// 把 slice-atlas.mjs 的切割框按序号标回原图，用于人工核对每只是哪个 ID
// 用法: node atlas-overlay.mjs <图鉴png> <monsters/index.json> <输出png>
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
// 3x5 点阵数字，够标序号用
const F = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'],
}
function drawNum(canvas, W, H, s, x, y, sc, r, g, b) {
  let cx = x
  for (const ch of String(s)) {
    const gl = F[ch]; if (!gl) { cx += 4 * sc; continue }
    for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++) {
      if (gl[gy][gx] !== '1') continue
      for (let sy = 0; sy < sc; sy++) for (let sx = 0; sx < sc; sx++) {
        const px = cx + gx * sc + sx, py = y + gy * sc + sy
        if (px < 0 || py < 0 || px >= W || py >= H) continue
        const o = (py * W + px) * 4
        canvas[o] = r; canvas[o + 1] = g; canvas[o + 2] = b; canvas[o + 3] = 255
      }
    }
    cx += 4 * sc
  }
}

const img = decodePng(fs.readFileSync(SRC))
const idx = JSON.parse(fs.readFileSync(IDX, 'utf8'))
console.log(`图鉴 ${img.w}x${img.h}，${idx.items.length} 个切割框`)

// 画框
for (const it of idx.items) {
  const { x0, y0, w, h } = it.box
  for (let x = x0; x < x0 + w; x++) {
    for (const y of [y0, y0 + h - 1]) {
      if (x < 0 || x >= img.w || y < 0 || y >= img.h) continue
      const o = (y * img.w + x) * 4
      img.data[o] = 255; img.data[o + 1] = 40; img.data[o + 2] = 40; img.data[o + 3] = 255
    }
  }
  for (let y = y0; y < y0 + h; y++) {
    for (const x of [x0, x0 + w - 1]) {
      if (x < 0 || x >= img.w || y < 0 || y >= img.h) continue
      const o = (y * img.w + x) * 4
      img.data[o] = 255; img.data[o + 1] = 40; img.data[o + 2] = 40; img.data[o + 3] = 255
    }
  }
  // 序号写在框内左上角（黑底黄字，便于辨认）
  const n = String(parseInt(it.idx, 10))
  const sc = 2
  const tw = n.length * 4 * sc + 4, th = 5 * sc + 4
  for (let yy = y0; yy < y0 + th; yy++) for (let xx = x0; xx < x0 + tw; xx++) {
    if (xx < 0 || xx >= img.w || yy < 0 || yy >= img.h) continue
    const o = (yy * img.w + xx) * 4
    img.data[o] = 0; img.data[o + 1] = 0; img.data[o + 2] = 0; img.data[o + 3] = 255
  }
  drawNum(img.data, img.w, img.h, n, x0 + 3, y0 + 2, sc, 255, 226, 80)
}

fs.writeFileSync(OUT, encode(img.w, img.h, img.data))
console.log(`已写出 ${OUT}`)
