// 量出战斗画面左上角"队伍卡 + 名字文字"的精确范围（用来给名牌让位）
// 用法: node _tools/probe-battle-ui.mjs 改成量我们自己的截图
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = process.argv[2]
const buf = fs.readFileSync(path.resolve(ROOT, file))

function decodePng(buf) {
  let off = 8, w = 0, h = 0, colorType = 0
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = Buffer.alloc(w * h * 3)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride))
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0
      let v = line[i]
      if (ft === 1) v += a; else if (ft === 2) v += b
      else if (ft === 3) v += (a + b) >> 1
      else if (ft === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      line[i] = v & 0xFF
    }
    for (let x = 0; x < w; x++) {
      const s = x * ch, d = (y * w + x) * 3
      out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]
    }
    prev = line
  }
  return { w, h, px: out }
}

const { w, h, px } = decodePng(buf)
const at = (x, y) => { const i = (y * w + x) * 3; return [px[i], px[i + 1], px[i + 2]] }
const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b
// "文字像素" = 亮且低饱和（白/浅色字）—— 左上角那块"龙多比"是浅色小字
const isText = ([r, g, b]) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  return lum([r, g, b]) > 120 && (mx - mn) < 60
}

console.log(`图: ${file}  ${w}×${h}`)
console.log('\n=== x 0~380 / y 0~110 区域逐行统计"浅色文字像素"的横向范围 ===')
for (let y = 0; y < 110; y += 2) {
  let n = 0, minX = -1, maxX = -1
  for (let x = 0; x < 380; x++) {
    if (isText(at(x, y))) { n++; if (minX < 0) minX = x; maxX = x }
  }
  if (n < 3) continue
  console.log(`  y=${String(y).padStart(3)}  文字像素 ${String(n).padStart(3)}  x ${minX}~${maxX}`)
}
