// 生成带场景编号标注的联系表，便于人工核对与指认
// 用法: node sheet-labeled.mjs <场景目录> <输出png> [列数] [每格宽] [最多张数]
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

// ---------- PNG 解码（支持全部色彩类型：灰度/真彩/索引/带A）----------
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG（文件头不匹配）')
  let off = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0
  const idat = []
  let palette = null, trns = null
  while (off + 8 <= buf.length) {
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
  if (interlace) throw new Error('不支持隔行扫描的 PNG')
  if (bitDepth !== 8) throw new Error('不支持 bitDepth=' + bitDepth)
  const chMap = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
  const ch = chMap[colorType]
  if (!ch) throw new Error('不支持的 colorType=' + colorType)
  if (colorType === 3 && !palette) throw new Error('索引色但缺 PLTE')

  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * ch
  if (raw.length < h * (stride + 1)) throw new Error(`数据不足：期望 ${h * (stride + 1)}，实际 ${raw.length}`)
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
      else if (ft === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      cur[x] = v & 0xff
    }
    cur.copy(out, y * stride); prev = cur
  }

  const rgba = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const s = i * ch, d = i * 4
    if (colorType === 6) {          // 真彩 + A
      rgba[d] = out[s]; rgba[d + 1] = out[s + 1]; rgba[d + 2] = out[s + 2]; rgba[d + 3] = out[s + 3]
    } else if (colorType === 2) {   // 真彩
      rgba[d] = out[s]; rgba[d + 1] = out[s + 1]; rgba[d + 2] = out[s + 2]; rgba[d + 3] = 255
    } else if (colorType === 3) {   // 索引色
      const pi = out[s]
      rgba[d] = palette[pi * 3]; rgba[d + 1] = palette[pi * 3 + 1]; rgba[d + 2] = palette[pi * 3 + 2]
      rgba[d + 3] = trns && pi < trns.length ? trns[pi] : 255
    } else if (colorType === 4) {   // 灰度 + A
      rgba[d] = rgba[d + 1] = rgba[d + 2] = out[s]; rgba[d + 3] = out[s + 1]
    } else {                        // 灰度
      rgba[d] = rgba[d + 1] = rgba[d + 2] = out[s]; rgba[d + 3] = 255
    }
  }
  return { w, h, data: rgba }
}
function downscale(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const sy0 = Math.floor((y * sh) / dh), sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * sh) / dh))
    for (let x = 0; x < dw; x++) {
      const sx0 = Math.floor((x * sw) / dw), sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * sw) / dw))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
        const i = (sy * sw + sx) * 4
        r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]; n++
      }
      const o = (y * dw + x) * 4
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n
    }
  }
  return out
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

// 5x7 点阵大字，用于在图上写清编号
const F = {
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
  'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
}
function drawText(canvas, W, H, s, x, y, scale, r, g, b) {
  let cx = x
  for (const ch of s.toUpperCase()) {
    const gl = F[ch] || F[' ']
    for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++) {
      if (gl[gy][gx] !== '1') continue
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
        const px = cx + gx * scale + sx, py = y + gy * scale + sy
        if (px < 0 || py < 0 || px >= W || py >= H) continue
        const o = (py * W + px) * 4
        canvas[o] = r; canvas[o + 1] = g; canvas[o + 2] = b; canvas[o + 3] = 255
      }
    }
    cx += 6 * scale
  }
}
function fillRect(canvas, W, H, x, y, w, h, r, g, b, a = 255) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
    const o = (yy * W + xx) * 4
    const t = a / 255
    canvas[o] = canvas[o] * (1 - t) + r * t
    canvas[o + 1] = canvas[o + 1] * (1 - t) + g * t
    canvas[o + 2] = canvas[o + 2] * (1 - t) + b * t
    canvas[o + 3] = 255
  }
}

const dir = process.argv[2]                 // 图片目录
const outFile = process.argv[3]
const COLS = Number(process.argv[4] || 7)
const CELL_W = Number(process.argv[5] || 200)
const LIMIT = Number(process.argv[6] || 0)
const OFFSET = Number(process.argv[7] || 0) // 从第几张开始（按编号排序后）

// manifest 固定在 <项目根>/assets/manifest.json；由图片目录反推项目根
const ROOT = path.resolve(dir, '..', '..')
const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'))
// 按编号排序，并按 OFFSET/LIMIT 取窗口
const sorted = m.scenes.slice().sort((a, b) => a.id - b.id)
const files = sorted.slice(OFFSET, OFFSET + (LIMIT || sorted.length))
// 在指定目录里找同名文件（不管扩展名），这样 png/jpg 都能用
const inDir = new Set(fs.readdirSync(dir))
const pickPath = (s) => {
  const base = path.basename(s.file).replace(/\.[^.]+$/, '')
  for (const ext of ['.png', '.jpg', '.jpeg']) {
    if (inDir.has(base + ext)) return path.join(dir, base + ext)
  }
  return null
}
const CELL_H = Math.round(CELL_W * 560 / 960)
const rows = Math.ceil(files.length / COLS)
const W = COLS * CELL_W, H = rows * CELL_H
const canvas = Buffer.alloc(W * H * 4)
for (let i = 0; i < W * H; i++) { canvas[i * 4] = 20; canvas[i * 4 + 1] = 22; canvas[i * 4 + 2] = 30; canvas[i * 4 + 3] = 255 }

files.forEach((s, i) => {
  const cx = (i % COLS) * CELL_W, cy = Math.floor(i / COLS) * CELL_H
  const p = pickPath(s)
  if (!p) { console.error(`  ✗ 第 ${i + 1} 格 scene_${s.id} 在 ${dir} 找不到对应文件`); return }
  try {
    const img = decodePng(fs.readFileSync(p))
    const th = downscale(img.data, img.w, img.h, CELL_W, CELL_H)
    for (let y = 0; y < CELL_H; y++) {
      th.copy(canvas, ((cy + y) * W + cx) * 4, y * CELL_W * 4, y * CELL_W * 4 + CELL_W * 4)
    }
  } catch (e) {
    console.error(`  ✗ 第 ${i + 1} 格 scene_${s.id} (${path.basename(p)}) 解码失败: ${e.message}`)
  }
  // 左上角写编号，带半透明底
  const label = String(s.id)
  const tw = label.length * 6 * 3 + 6
  fillRect(canvas, W, H, cx + 4, cy + 4, tw, 7 * 3 + 4, 0, 0, 0, 190)
  drawText(canvas, W, H, label, cx + 7, cy + 6, 3, 255, 226, 80)
  // 底部写原始尺寸
  fillRect(canvas, W, H, cx + 4, cy + CELL_H - 16, 84, 12, 0, 0, 0, 150)
  drawText(canvas, W, H, `${s.w}x${s.h}`, cx + 7, cy + CELL_H - 14, 1, 200, 210, 230)
})

fs.writeFileSync(outFile, encodePng(W, H, canvas))
console.log(`带编号联系表: ${outFile}  ${W}x${H}  ${files.length} 张  ${COLS} 列`)
console.log(`  左上角黄色数字 = 场景编号（对应 assets/scenes/scene_NN）`)
console.log('  编号 -> 位置:')
files.forEach((s, i) => {
  process.stdout.write(`${s.id}:r${Math.floor(i / COLS) + 1}c${(i % COLS) + 1}  `)
  if ((i + 1) % COLS === 0) process.stdout.write('\n')
})
console.log('')
