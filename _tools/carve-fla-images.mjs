// 从 FLA / SWF 里抠出嵌入的 JPEG / PNG（按格式自身的结构找结尾，不是找第一个 FFD9）
//   FLA（老式二进制）结构读不了，但里面的位图是原样嵌的。
import fs from 'node:fs'
import path from 'node:path'

function jpegEnd(buf, start) {
  let i = start + 2
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) { i++; continue }
    const m = buf[i + 1]
    if (m === 0xff) { i++; continue }              // 填充字节
    if (m === 0xd8) return -1                       // 又一个 SOI → 不完整
    if (m === 0xd9) return i + 2                    // EOI
    if (m === 0xda) {                               // SOS：之后是熵编码数据
      let j = i + 2 + buf.readUInt16BE(i + 2)
      while (j < buf.length - 1) {
        if (buf[j] === 0xff && buf[j + 1] === 0xd9) return j + 2
        if (buf[j] === 0xff && buf[j + 1] === 0xd8) return -1
        j++
      }
      return -1
    }
    if (m >= 0xd0 && m <= 0xd7) { i += 2; continue }  // RSTn
    if (m === 0x01) { i += 2; continue }              // TEM
    const segLen = buf.readUInt16BE(i + 2)
    if (segLen < 2 || i + 2 + segLen > buf.length) return -1
    i += 2 + segLen
  }
  return -1
}

function pngEnd(buf, start) {
  let i = start + 8
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i)
    const type = buf.toString('latin1', i + 4, i + 8)
    if (type === 'IEND') return i + 12
    if (len > buf.length) return -1
    i += 12 + len
  }
  return -1
}

const outDir = path.join(process.cwd(), '_tools', '_carve')
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

let total = 0
for (const f of process.argv.slice(2)) {
  if (!fs.existsSync(f)) { console.log('(missing) ' + f); continue }
  const buf = fs.readFileSync(f)
  const base = path.basename(f, path.extname(f)).replace(/[^\w\u4e00-\u9fa5-]/g, '_')
  let n = 0
  let i = 0
  while ((i = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]), i)) >= 0) {
    const end = jpegEnd(buf, i)
    if (end > i + 400) {
      fs.writeFileSync(path.join(outDir, `${base}_${String(n).padStart(3, '0')}.jpg`), buf.subarray(i, end))
      n++; i = end
    } else i += 3
  }
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  let j = 0
  while ((j = buf.indexOf(pngSig, j)) >= 0) {
    const end = pngEnd(buf, j)
    if (end > j + 400) {
      fs.writeFileSync(path.join(outDir, `${base}_${String(n).padStart(3, '0')}.png`), buf.subarray(j, end))
      n++; j = end
    } else j += 8
  }
  console.log(`[${path.basename(f)}] ${(buf.length / 1048576).toFixed(1)}MB -> carved ${n}`)
  total += n
}
console.log(`\ntotal carved ${total} -> _tools/_carve/`)
