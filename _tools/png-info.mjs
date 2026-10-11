// 检查 PNG 的色彩类型与调色板，用于判断加工后为何变大
// 用法: node png-info.mjs <png 文件或目录>
import fs from 'node:fs'
import path from 'node:path'

function info(p) {
  const b = fs.readFileSync(p)
  let off = 8
  let ihdr = null, palette = 0, trns = 0
  const chunks = []
  while (off < b.length) {
    const len = b.readUInt32BE(off)
    const t = b.toString('ascii', off + 4, off + 8)
    chunks.push(t)
    if (t === 'IHDR') {
      ihdr = {
        w: b.readUInt32BE(off + 8), h: b.readUInt32BE(off + 12),
        bitDepth: b[off + 16], colorType: b[off + 17], interlace: b[off + 20],
      }
    } else if (t === 'PLTE') palette = len / 3
    else if (t === 'tRNS') trns = len
    else if (t === 'IEND') break
    off += 12 + len
  }
  const names = { 0: '灰度', 2: '真彩RGB', 3: '索引色', 4: '灰度+A', 6: '真彩RGBA' }
  return {
    file: path.basename(p), bytes: b.length, ...ihdr,
    colorName: names[ihdr.colorType] || ('?' + ihdr.colorType),
    palette, trns, chunks: [...new Set(chunks)].join(','),
  }
}

const target = process.argv[2]
const st = fs.statSync(target)
const files = st.isDirectory()
  ? fs.readdirSync(target).filter((f) => /\.png$/i.test(f)).sort().slice(0, 3).map((f) => path.join(target, f))
  : [target]

console.log('文件                     尺寸          bit 色彩类型      调色板  tRNS   KB')
for (const f of files) {
  const i = info(f)
  console.log(
    i.file.slice(0, 22).padEnd(24) +
    String(i.w + 'x' + i.h).padEnd(13) +
    String(i.bitDepth).padEnd(4) +
    i.colorName.padEnd(12) +
    String(i.palette).padStart(5) +
    String(i.trns).padStart(6) +
    (i.bytes / 1024).toFixed(0).padStart(6)
  )
}
