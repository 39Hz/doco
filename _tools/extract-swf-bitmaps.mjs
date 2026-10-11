// 从 SWF 里提取内嵌位图。
//
// 为什么用 SWF 而不是 FLA：FLA 是 Flash 的**矢量**工程（25MB 那个是矢量路径数据，没有位图），
// 而 SWF 是导出产物，里面的位图以 DefineBitsLossless2 / DefineBitsJPEG 标签直接存放。
// 更关键的是文件名是权威的 `monster_<图鉴编号><名字>.swf`，能精确对上怪兽表。
//
// SWF 格式要点：
//   · 签名 CWS = 前 8 字节后接 zlib 压缩体（FWS 未压缩，ZWS 是 LZMA）
//   · 解压后是 [RECT 帧尺寸] + [uint16 帧率] + [uint16 帧数] + 一串 tag
//   · tag = uint16 (code<<6 | length)；length=0x3f 时后面跟 int32 真实长度
//   · 位图 tag：
//       DefineBitsLossless  (20) / DefineBitsLossless2 (36)
//         characterId, format(3=8bit调色板,4=15bit,5=32bit ARGB), width, height,
//         调色板时多一个 colorTableSize，之后是 zlib 压缩的像素
//       DefineBitsJPEG2 (21) / DefineBitsJPEG3 (35)  —— 内嵌 JPEG（35 还带 alpha）
//       DefineBits (6)  —— 依赖 JPEGTables(8)
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const OUT = path.join(ROOT, 'assets', 'monsters', 'fromswf')
fs.mkdirSync(OUT, { recursive: true })

function readSwfBody(buf) {
  const sig = buf.toString('ascii', 0, 3)
  if (sig === 'FWS') return buf.subarray(8)
  if (sig === 'CWS') return zlib.inflateSync(buf.subarray(8))
  throw new Error('不支持的签名 ' + sig)
}

// 位读取器（用于跳过 RECT）
function makeBitReader(buf) {
  let pos = 0, bit = 0
  return {
    align() { if (bit) { bit = 0; pos++ } },
    readUB(n) {
      let v = 0
      for (let i = 0; i < n; i++) {
        const b = buf[pos]
        v = (v << 1) | ((b >> (7 - bit)) & 1)
        bit++
        if (bit === 8) { bit = 0; pos++ }
      }
      return v
    },
    get pos() { return pos },
    set pos(v) { pos = v; bit = 0 },
  }
}

function parseSwf(buf) {
  const body = readSwfBody(buf)
  const br = makeBitReader(body)
  const nbits = br.readUB(5)
  br.readUB(nbits); br.readUB(nbits)   // xMin, xMax
  br.readUB(nbits); br.readUB(nbits)   // yMin, yMax
  br.align()
  let p = br.pos
  const frameRate = body.readUInt16LE(p); p += 2
  const frameCount = body.readUInt16LE(p); p += 2

  const tags = []
  while (p + 2 <= body.length) {
    const codeLen = body.readUInt16LE(p); p += 2
    const code = codeLen >> 6
    let len = codeLen & 0x3f
    if (len === 0x3f) { len = body.readUInt32LE(p); p += 4 }
    if (p + len > body.length) break
    tags.push({ code, data: body.subarray(p, p + len) })
    p += len
    if (code === 0) break                 // End
  }
  return { frameRate, frameCount, tags }
}

// DefineBitsLossless / Lossless2 → RGBA
function decodeLossless(data, hasAlpha) {
  const charId = data.readUInt16LE(0)
  const format = data[data.readUInt16LE(2) === 3 ? 2 : 2]  // 占位，下面重读
  let p = 0
  const id = data.readUInt16LE(p); p += 2
  const fmt = data[p]; p += 1
  const w = data.readUInt16LE(p); p += 2
  const h = data.readUInt16LE(p); p += 2
  let palette = null
  if (fmt === 3) {
    const n = data[p] + 1; p += 1
    palette = []
    for (let i = 0; i < n; i++) {
      if (hasAlpha) { palette.push([data[p + 1], data[p + 2], data[p + 3], data[p]]); p += 4 }
      else { palette.push([data[p], data[p + 1], data[p + 2], 255]); p += 3 }
    }
  }
  const comp = zlib.inflateSync(data.subarray(p))
  const rgba = new Uint8Array(w * h * 4)
  let q = 0
  if (fmt === 5) {
    // 32bit：行按 ARGB 存，且每行 4 字节对齐（这里直接顺序读）
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = comp[q], r = comp[q + 1], g = comp[q + 2], b = comp[q + 3]
        q += 4
        const i = (y * w + x) * 4
        rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = hasAlpha ? a : 255
      }
    }
  } else if (fmt === 4) {
    // 15bit：每像素 2 字节，XRGB1555
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = comp[q] | (comp[q + 1] << 8); q += 2
        const r = ((v >> 10) & 31) * 255 / 31 | 0
        const g = ((v >> 5) & 31) * 255 / 31 | 0
        const b = (v & 31) * 255 / 31 | 0
        const i = (y * w + x) * 4
        rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255
      }
    }
  } else if (fmt === 3) {
    // 8bit 调色板：行按 4 字节对齐
    const rowBytes = Math.ceil(w / 4) * 4
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = comp[y * rowBytes + x]
        const c = palette[idx] || [0, 0, 0, 0]
        const i = (y * w + x) * 4
        rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = c[3]
      }
    }
  } else {
    return null
  }
  return { w, h, rgba }
}

function collectBitmaps(swfPath) {
  const buf = fs.readFileSync(swfPath)
  const { tags } = parseSwf(buf)
  const found = []
  for (const t of tags) {
    if (t.code === 36 || t.code === 20) {
      try {
        const bm = decodeLossless(t.data, t.code === 36)
        if (bm) found.push({ kind: 'lossless', ...bm })
      } catch (e) { /* 忽略坏标签 */ }
    } else if (t.code === 21 || t.code === 35) {
      // 内嵌 JPEG。
      // DefineBitsJPEG2(21)：characterId(2B) + JPEG
      // DefineBitsJPEG3(35)：characterId(2B) + alphaDataOffset(4B) + JPEG + zlib(alpha)
      //   —— 之前漏跳了那 4 字节，导致把 alphaDataOffset 当成 JPEG 数据，尺寸读成 0×0。
      const id = t.data.readUInt16LE(0)
      const hdr = t.code === 35 ? 6 : 2
      const jpg = t.data.subarray(hdr)
      // 必须是真正的 JPEG（SOI 开头）
      if (jpg.length > 4 && jpg[0] === 0xff && jpg[1] === 0xd8) {
        found.push({ kind: 'jpeg', charId: id, bytes: jpg })
      }
    }
  }
  return found
}

// ---- 处理所有 monster_*.swf ----
const swfs = []
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/^monster_.*\.swf$/i.test(e.name)) swfs.push(p)
  }
}
walk(path.join(ROOT, '多克多比专区资料素材'))
// 去重（同名的在 zzz/ 下有两份）
const uniq = new Map()
for (const p of swfs) {
  const base = path.basename(p)
  if (!uniq.has(base)) uniq.set(base, p)
}
console.log('monster_*.swf 去重后: ' + uniq.size + ' 个')

const index = {}
let okCount = 0
for (const [base, p] of uniq) {
  const m = base.match(/^monster_(\d+)_?([^.]*)\.swf$/i)
  if (!m) continue
  const atlasId = m[1]
  const name = (m[2] || '').trim()
  let bms
  try { bms = collectBitmaps(p) } catch (e) { console.log('  ✗ ' + base + ' 解析失败: ' + e.message); continue }
  if (!bms.length) { console.log('  ✗ ' + base + ' 没有位图'); continue }
  // 取面积最大的那张
  let best = null
  for (const b of bms) {
    if (b.kind === 'lossless') {
      const area = b.w * b.h
      if (!best || area > best.area) best = { kind: 'lossless', ...b, area }
    } else {
      // JPEG：从 SOF 段读尺寸
      let w = 0, h = 0
      for (let i = 2; i + 9 < b.bytes.length;) {
        if (b.bytes[i] !== 0xff) { i++; continue }
        const marker = b.bytes[i + 1]
        const len = b.bytes.readUInt16BE(i + 2)
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          h = b.bytes.readUInt16BE(i + 5); w = b.bytes.readUInt16BE(i + 7); break
        }
        i += 2 + len
      }
      const area = w * h
      if (!best || area > best.area) best = { kind: 'jpeg', bytes: b.bytes, w, h, area }
    }
  }
  if (!best) continue
  let file = null
  if (best.kind === 'lossless') {
    file = 'assets/monsters/fromswf/mon_' + atlasId + '.png'
    fs.writeFileSync(path.join(ROOT, file), encodePng(best.w, best.h, best.rgba))
  } else {
    file = 'assets/monsters/fromswf/mon_' + atlasId + '.jpg'
    fs.writeFileSync(path.join(ROOT, file), best.bytes)
  }
  index[atlasId] = { name, file, w: best.w, h: best.h, kind: best.kind, bitmapCount: bms.length }
  okCount++
  console.log('  ' + String(atlasId).padEnd(8) + (name || '(无名)').padEnd(12) + best.kind.padEnd(9) + best.w + '×' + best.h + '  共 ' + bms.length + ' 张位图')
}
console.log('\n提取成功 ' + okCount + '/' + uniq.size)
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1), 'utf8')
console.log('已写 assets/monsters/fromswf/index.json')
