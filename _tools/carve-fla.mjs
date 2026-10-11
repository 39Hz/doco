// 从 .fla / .swf 里抠出嵌入位图
//
// 原理：Flash 的位图在文件里是以原始 JPEG/PNG 数据块存放的
// （SWF 的 DefineBitsJPEG2/3 存 JPEG，DefineBitsLossless 存 zlib 压缩位图；
//  FLA 内部的 Media 段同样内嵌原始数据）。
// 所以可以直接按文件签名扫描并提取，不需要完整解析 SWF 结构。
//
// 用法: node carve-fla.mjs <目录或文件> <输出目录> [最小字节数]
import fs from 'node:fs'
import path from 'node:path'

const SRC = process.argv[2]
const OUT = process.argv[3]
const MIN = Number(process.argv[4] || 4096)

fs.mkdirSync(OUT, { recursive: true })

function walk(p, acc = []) {
  const st = fs.statSync(p)
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(p)) walk(path.join(p, e), acc)
  } else if (/\.(fla|swf)$/i.test(p)) acc.push(p)
  return acc
}

// ---------- 抠 JPEG ----------
// JPEG 以 FFD8FF 开头，以 FFD9 结尾。要小心内部出现 FFD9 的可能（罕见），
// 所以取「最后一个 FFD9」并校验尺寸合理性。
function carveJpeg(buf, start) {
  if (buf[start] !== 0xFF || buf[start + 1] !== 0xD8) return null
  // 找结束标记：扫描 FFD9，跳过 FF00（转义）与 FFD0-FFD7（RST）
  let i = start + 2
  let end = -1
  while (i < buf.length - 1) {
    if (buf[i] === 0xFF) {
      const m = buf[i + 1]
      if (m === 0xD9) { end = i + 2; }
      else if (m === 0xD8) return null      // 嵌套开始，说明前面的判断错了
      i += 2
      // 跳过带长度字段的段
      if (m >= 0xC0 && m <= 0xFE && m !== 0xD8 && m !== 0xD9 && (m < 0xD0 || m > 0xD7)) {
        const len = buf.readUInt16BE(i - 2 + 0)
        // i 现在指向长度字段之后；重新定位
      }
    } else i++
  }
  // 上面这种简化扫描不可靠，改用「从后往前找最后一个 FFD9」并用尺寸校验
  let last = -1
  for (let k = buf.length - 2; k > start; k--) {
    if (buf[k] === 0xFF && buf[k + 1] === 0xD9) { last = k + 2; break }
  }
  if (last < 0) return null
  return last - start
}

// 更稳的做法：按段解析 JPEG 结构，得到精确长度
function jpegLength(buf, start) {
  if (buf[start] !== 0xFF || buf[start + 1] !== 0xD8) return -1
  let i = start + 2
  while (i < buf.length - 1) {
    if (buf[i] !== 0xFF) return -1
    const m = buf[i + 1]
    if (m === 0xD8) return -1
    if (m === 0xD9) return i + 2 - start           // EOI
    if (m >= 0xD0 && m <= 0xD7) { i += 2; continue }  // RSTn 无长度
    if (m === 0x01) { i += 2; continue }              // TEM 无长度
    const len = buf.readUInt16BE(i + 2)
    if (len < 2) return -1
    if (m === 0xDA) {
      // SOS：之后是熵编码数据，直到下一个非转义的 FFD9
      let j = i + 2 + len
      while (j < buf.length - 1) {
        if (buf[j] === 0xFF) {
          const n = buf[j + 1]
          if (n === 0xD9) return j + 2 - start
          if (n !== 0x00 && (n < 0xD0 || n > 0xD7)) return j - start  // 遇到其他标记，截断
          j += 2
        } else j++
      }
      return -1
    }
    i += 2 + len
  }
  return -1
}

// ---------- 抠 PNG ----------
function pngLength(buf, start) {
  if (buf.readUInt32BE(start) !== 0x89504e47) return -1
  let i = start + 8
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i)
    const type = buf.toString('ascii', i + 4, i + 8)
    if (type === 'IEND') return i + 12 - start
    if (!/^[A-Za-z]{4}$/.test(type)) return -1
    i += 12 + len
  }
  return -1
}

// ---------- 读 PNG/JPEG 尺寸 ----------
function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { fmt: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  }
  if (buf.length > 4 && buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2
    while (i < buf.length - 9) {
      if (buf[i] !== 0xFF) { i++; continue }
      const m = buf[i + 1]
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        return { fmt: 'jpg', h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
      }
      const len = buf.readUInt16BE(i + 2)
      if (len <= 0) break
      i += 2 + len
    }
  }
  return null
}

const files = walk(SRC)
console.log(`扫描 ${files.length} 个 .fla/.swf`)
let total = 0
const manifest = []

for (const f of files) {
  const buf = fs.readFileSync(f)
  const base = path.basename(f, path.extname(f)).replace(/[\\/:*?"<>|]/g, '_')
  let n = 0
  // 扫描签名
  for (let i = 0; i < buf.length - 8; i++) {
    let len = -1, ext = null
    if (buf[i] === 0xFF && buf[i + 1] === 0xD8 && buf[i + 2] === 0xFF) {
      len = jpegLength(buf, i)
      ext = '.jpg'
    } else if (buf[i] === 0x89 && buf[i + 1] === 0x50 && buf[i + 2] === 0x4E && buf[i + 3] === 0x47) {
      len = pngLength(buf, i)
      ext = '.png'
    }
    if (len < MIN) continue
    const data = buf.subarray(i, i + len)
    const size = imageSize(data)
    // 过滤明显的垃圾：尺寸要合理
    if (!size || size.w < 24 || size.h < 24 || size.w > 4096 || size.h > 4096) { i += len; continue }
    const name = `${base}_${String(n).padStart(3, '0')}${ext}`
    fs.writeFileSync(path.join(OUT, name), data)
    manifest.push({ src: path.basename(f), file: name, w: size.w, h: size.h, bytes: len })
    n++
    total++
    i += len - 1     // 跳过这一块，避免重叠扫描
  }
  if (n) process.stdout.write(`\r  ${path.basename(f)}: 抠出 ${n} 张`)
}
console.log('')
console.log(`\n共抠出 ${total} 张位图 -> ${OUT}`)
const mbytes = manifest.reduce((a, m) => a + m.bytes, 0)
console.log(`  总体积 ${(mbytes / 1048576).toFixed(1)} MB`)
const bySrc = {}
for (const m of manifest) bySrc[m.src] = (bySrc[m.src] || 0) + 1
console.log('\n各源文件抠出数量：')
for (const [k, v] of Object.entries(bySrc).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`)
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ count: total, items: manifest }, null, 2))
