// 从 SWF 里提取**动作帧位图**（DefineBitsJPEG2/3、DefineBitsLossless/2）
//
// 【为什么需要】归档里的「多比战斗动画」是 SWF，里面**每个动作帧就是一张内嵌 JPEG**：
//   水多比-战斗.swf 有 138 张、火多比-战斗.swf 199 张、超级多比-战斗.swf 150 张…
//   而 `carve-fla.mjs` 只会扫"裸 JPEG 签名"，这些数据包在 `DefineBitsJPEG3` 标签里
//   （JPEG 后面还跟一段 zlib 压缩的 alpha 通道），所以之前抠出 **0 张**。
//   → 只要按 SWF 标签结构解析，就能把全部动作帧拿出来。**不需要写 Flash 渲染器。**
//
// 标签格式（SWF 规范）：
//   DefineBitsJPEG2 (21)：u16 charId + JPEG/PNG/GIF 数据（老版本可能是 PNG/GIF 魔数）
//   DefineBitsJPEG3 (35)：u16 charId + u32 alphaDataOffset + JPEG数据 + zlib(alpha)
//   DefineBitsLossless (20) / DefineBitsLossless2 (36)：调色板或 ARGB 位图（zlib 压缩）
//
// 用法: node _tools/extract-swf-frames.mjs <swf文件或目录> <输出目录> [最小字节数]
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SRC = process.argv[2]
const OUT = process.argv[3] || path.join(ROOT, '_tmp_test_out/swf-frames')
const MIN = Number(process.argv[4] || 4000)
if (!SRC) { console.log('用法: node _tools/extract-swf-frames.mjs <swf|目录> <输出目录> [最小字节数]'); process.exit(1) }

function body(buf) {
  const sig = buf.toString('ascii', 0, 3)
  if (sig === 'FWS') return buf.subarray(8)
  if (sig === 'CWS') return zlib.inflateSync(buf.subarray(8))
  throw new Error('未知签名 ' + sig)
}
function readRect(b, p) {
  const nbits = b[p] >> 3
  const total = 5 + nbits * 4
  const bytes = Math.ceil(total / 8)
  let bits = ''
  for (let i = 0; i < bytes; i++) bits += b[p + i].toString(2).padStart(8, '0')
  const rd = (o) => parseInt(bits.slice(o, o + nbits), 2)
  return { xmin: rd(5), xmax: rd(5 + nbits), ymin: rd(5 + nbits * 2), ymax: rd(5 + nbits * 3), next: p + bytes }
}

// 把 lossless 位图解成 RGBA
function decodeLossless(payload, hasAlpha) {
  const fmt = payload[0]
  const w = payload.readUInt16BE(1)
  const h = payload.readUInt16BE(3)
  const data = zlib.inflateSync(payload.subarray(hasAlpha ? 8 : 7))
  const out = new Uint8ClampedArray(w * h * 4)
  if (fmt === 3) {                       // 8-bit 调色板
    const n = payload[7] + 1
    const pal = []
    let o = 8
    for (let i = 0; i < n; i++) { pal.push([payload[o], payload[o + 1], payload[o + 2], hasAlpha ? payload[o + 3] : 255]); o += hasAlpha ? 4 : 3 }
    const rowBytes = (w + 3) & ~3
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = pal[data[y * rowBytes + x]] || [0, 0, 0, 0]
      const d = (y * w + x) * 4
      out[d] = c[0]; out[d + 1] = c[1]; out[d + 2] = c[2]; out[d + 3] = c[3]
    }
  } else if (fmt === 4) {                // 15-bit
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = data.readUInt16BE((y * w + x) * 2)
      const d = (y * w + x) * 4
      out[d] = ((v >> 10) & 31) * 255 / 31; out[d + 1] = ((v >> 5) & 31) * 255 / 31; out[d + 2] = (v & 31) * 255 / 31; out[d + 3] = 255
    }
  } else if (fmt === 5) {                // 24/32-bit
    const bpp = hasAlpha ? 4 : 3
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = (y * w + x) * bpp, d = (y * w + x) * 4
      out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = hasAlpha ? data[s + 3] : 255
    }
  } else return null
  return { w, h, data: out }
}
// 把 JPEG 包成可解析的（这里不解码 JPEG，直接原样另存；需要尺寸就从 SOF 读）
function jpegSize(buf) {
  let i = 2
  while (i < buf.length - 9) {
    if (buf[i] !== 0xFF) { i++; continue }
    const m = buf[i + 1]
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
    }
    i += 2 + buf.readUInt16BE(i + 2)
  }
  return null
}

const files = []
const st = fs.statSync(SRC)
if (st.isDirectory()) {
  const raw = fs.readdirSync(SRC, { withFileTypes: true })
  for (const e of raw) {
    if (!e.isFile()) continue                 // ⚠️ 必须只收普通文件：第一版把目录也收进来了，
    if (!/\.swf$/i.test(e.name)) continue     //    导致 readFileSync 报 EISDIR
    files.push(path.join(SRC, e.name))
  }
} else files.push(SRC)
// 运行期自证：把参数与待处理清单打出来（这类"路径传错"的问题一眼可见）
console.log(`SRC = ${JSON.stringify(SRC)}`)
console.log(`是目录 ${st.isDirectory()}，待处理 ${files.length} 个文件：`)
for (const f of files) console.log(`  ${f}  ${(fs.statSync(f).size / 1024).toFixed(0)}KB`)

fs.mkdirSync(OUT, { recursive: true })
let totalImgs = 0
for (const file of files) {
  const base = path.basename(file, path.extname(file))
  const buf = fs.readFileSync(file)
  let b
  try { b = body(buf) } catch (e) { console.log(`✗ ${base}: ${e.message}`); continue }
  const r = readRect(b, 8)
  let p = r.next + 4
  let nJpeg = 0, nLoss = 0, nSkip = 0
  const made = []
  while (p + 2 <= b.length) {
    const tagLen = b.readUInt16LE(p); p += 2
    const code = tagLen >> 6
    let len = tagLen & 0x3f
    if (len === 0x3f) { len = b.readUInt32LE(p); p += 4 }
    if (code === 0) break
    const payload = b.subarray(p, p + len)
    try {
      if (code === 21 || code === 35) {                     // JPEG2 / JPEG3
        const charId = payload.readUInt16LE(0)
        let jpeg, alphaOff = 0
        if (code === 35) { alphaOff = payload.readUInt32LE(2); jpeg = payload.subarray(6, 6 + alphaOff) }
        else jpeg = payload.subarray(2)
        if (jpeg.length >= MIN && jpeg[0] === 0xFF && jpeg[1] === 0xD8) {
          const nm = `${base}_${String(nJpeg + 1).padStart(3, '0')}_id${charId}.jpg`
          fs.writeFileSync(path.join(OUT, nm), jpeg)
          const sz = jpegSize(jpeg)
          made.push({ nm, w: sz ? sz.w : 0, h: sz ? sz.h : 0, bytes: jpeg.length, alpha: code === 35 && alphaOff > 0 })
          nJpeg++
        } else nSkip++
      } else if (code === 20 || code === 36) {              // Lossless / Lossless2
        const img = decodeLossless(payload.subarray(2), code === 36)
        if (img && img.w * img.h > 500) {
          const nm = `${base}_${String(nLoss + 1).padStart(3, '0')}_ll.png`
          fs.writeFileSync(path.join(OUT, nm), encodePng(img.w, img.h, img.data))
          made.push({ nm, w: img.w, h: img.h, bytes: img.data.length, alpha: code === 36 })
          nLoss++
        } else nSkip++
      }
    } catch (e) { nSkip++ }
    p += len
    if (p > b.length) break
  }
  totalImgs += made.length
  const sizes = made.slice(0, 1).map((m) => `${m.w}×${m.h}`)
  console.log(`${base}:  JPEG ${nJpeg} · Lossless ${nLoss} · 跳过 ${nSkip}${sizes.length ? '   例 ' + sizes[0] : ''}`)
}
console.log(`\n合计提取 ${totalImgs} 张 → ${path.relative(ROOT, OUT)}`)
