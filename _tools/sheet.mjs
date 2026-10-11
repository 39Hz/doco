// 零依赖 PNG 编解码 + 联系表生成器（只用 node:zlib）
// 用途：把大量地图缩略成一张大图，便于一次性审阅全部场景
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

// ---------- PNG 解码 ----------
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png')
  let off = 8
  let w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0
  const idat = []
  let palette = null, trns = null
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4)
      bitDepth = data[8]; colorType = data[9]; interlace = data[12]
    } else if (type === 'PLTE') palette = Buffer.from(data)
    else if (type === 'tRNS') trns = Buffer.from(data)
    else if (type === 'IDAT') idat.push(Buffer.from(data))
    else if (type === 'IEND') break
    off += 12 + len
  }
  if (interlace) throw new Error('interlaced png unsupported')
  const raw = zlib.inflateSync(Buffer.concat(idat))

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  if (channels === undefined) throw new Error('colorType ' + colorType)
  const bpp = Math.max(1, (channels * bitDepth) >> 3)
  const stride = Math.ceil((w * channels * bitDepth) / 8)

  // 反滤波
  const out = Buffer.alloc(h * stride)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const cur = Buffer.from(line)
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0
      const b = prev[x]
      const c = x >= bpp ? prev[x - bpp] : 0
      let v = cur[x]
      if (ft === 1) v += a
      else if (ft === 2) v += b
      else if (ft === 3) v += (a + b) >> 1
      else if (ft === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      cur[x] = v & 0xff
    }
    cur.copy(out, y * stride)
    prev = cur
  }

  // 统一成 RGBA
  const rgba = Buffer.alloc(w * h * 4)
  const readSample = (base, idx) => {
    if (bitDepth === 8) return out[base + idx]
    if (bitDepth === 16) return out[base + idx * 2]
    if (bitDepth === 4) return (out[base + (idx >> 1)] >> (idx % 2 ? 0 : 4)) & 0x0f
    if (bitDepth === 1) return (out[base + (idx >> 3)] >> (7 - (idx % 8))) & 1
    if (bitDepth === 2) return (out[base + (idx >> 2)] >> (6 - 2 * (idx % 4))) & 3
    return 0
  }
  const scale = bitDepth === 8 ? 1 : bitDepth === 16 ? 1 / 257 : 255 / ((1 << bitDepth) - 1)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const base = y * stride
      const o = (y * w + x) * 4
      if (colorType === 3) {
        const pi = readSample(base, x)
        rgba[o] = palette[pi * 3]; rgba[o + 1] = palette[pi * 3 + 1]; rgba[o + 2] = palette[pi * 3 + 2]
        rgba[o + 3] = trns && pi < trns.length ? trns[pi] : 255
      } else if (colorType === 0 || colorType === 4) {
        const g = Math.round(readSample(base, x * channels) * scale)
        rgba[o] = rgba[o + 1] = rgba[o + 2] = g
        rgba[o + 3] = colorType === 4 ? Math.round(readSample(base, x * channels + 1) * scale) : 255
      } else {
        rgba[o] = Math.round(readSample(base, x * channels) * scale)
        rgba[o + 1] = Math.round(readSample(base, x * channels + 1) * scale)
        rgba[o + 2] = Math.round(readSample(base, x * channels + 2) * scale)
        rgba[o + 3] = colorType === 6 ? Math.round(readSample(base, x * channels + 3) * scale) : 255
      }
    }
  }
  return { w, h, data: rgba }
}

// ---------- PNG 编码 ----------
function encodePng(w, h, rgba) {
  const stride = w * 4
  const raw = Buffer.alloc(h * (stride + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const deflated = zlib.deflateSync(raw, { level: 9 })
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflated), chunk('IEND', Buffer.alloc(0)),
  ])
}
let CRC_T = null
function crc32(buf) {
  if (!CRC_T) {
    CRC_T = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC_T[n] = c
    }
  }
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return c ^ -1
}

// ---------- 缩放 + 联系表 ----------
function downscale(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const sy0 = Math.floor((y * sh) / dh), sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * sh) / dh))
    for (let x = 0; x < dw; x++) {
      const sx0 = Math.floor((x * sw) / dw), sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * sw) / dw))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * sw + sx) * 4
          r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]; n++
        }
      }
      const o = (y * dw + x) * 4
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n
    }
  }
  return out
}

const dir = process.argv[2]
const outFile = process.argv[3]
const COLS = Number(process.argv[4] || 6)
const CELL_W = Number(process.argv[5] || 320)

const files = fs.readdirSync(dir).filter(f => /\.png$/i.test(f)).sort()
const cellH = Math.round(CELL_W * 560 / 960)
const rows = Math.ceil(files.length / COLS)
const W = COLS * CELL_W, H = rows * cellH
const canvas = Buffer.alloc(W * H * 4)
// 深灰底，便于看清新图边界
for (let i = 0; i < W * H; i++) { canvas[i * 4] = 24; canvas[i * 4 + 1] = 26; canvas[i * 4 + 2] = 34; canvas[i * 4 + 3] = 255 }

const index = []
files.forEach((f, i) => {
  const cx = (i % COLS) * CELL_W, cy = Math.floor(i / COLS) * cellH
  try {
    const { w, h, data } = decodePng(fs.readFileSync(path.join(dir, f)))
    const thumb = downscale(data, w, h, CELL_W, cellH)
    for (let y = 0; y < cellH; y++) thumb.copy(canvas, ((cy + y) * W + cx) * 4, y * CELL_W * 4, y * CELL_W * 4 + CELL_W * 4)
    index.push({ n: i + 1, file: f, src: `${w}x${h}` })
  } catch (e) {
    index.push({ n: i + 1, file: f, err: e.message })
  }
})

fs.writeFileSync(outFile, encodePng(W, H, canvas))
console.log(`联系表: ${outFile}  ${W}x${H}  ${files.length} 格 (${COLS} 列)`)
index.forEach(r => console.log(`  #${String(r.n).padStart(2)}  ${r.file.slice(0, 14)}  ${r.src || 'ERR ' + r.err}`))
