// 从技能图标的 .fla 源文件里抠位图。
//
// 背景：短号长条（skill_icon_1001_1020.png 这种）只覆盖了 1001/2001/3001/5001 四组，
// 缺 2004（多重火球）和整个土系 4xxx。而这三组正好有对应的 .fla：
//   skill_icon_302001_302020.fla → 火系 302001~（= 短号 2001~）
//   skill_icon_304001_304020.fla → 土系 304001~（= 短号 4001~）
//
// FLA 是 zip（CS6+）或旧二进制格式。zip 的话里面就是一个个位图条目，直接取。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, '多克多比专区资料素材', '魔法道具ICON等', '多克多比技能')
const OUT = path.join(ROOT, 'assets', 'skills')

// FLA 里的位图没有 PNG 头，试几种常见容器：PNG / JPEG / 裸位图
function pngInfo(b, i) {
  if (b.readUInt32BE(i) !== 0x89504e47) return null
  try {
    const img = decodePng(b.subarray(i))
    return img
  } catch { return null }
}
function jpegRange(b, i) {
  if (b[i] !== 0xff || b[i + 1] !== 0xd8) return null
  for (let j = i + 2; j < b.length - 1; j++) {
    if (b[j] === 0xff && b[j + 1] === 0xd9) return { start: i, end: j + 2 }
    if (b[j] === 0xff && (b[j + 1] === 0xc0 || b[j + 1] === 0xc2)) {
      const h = b.readUInt16BE(j + 5), w = b.readUInt16BE(j + 7)
      if (w < 8 || h < 8 || w > 4096 || h > 4096) return null
    }
  }
  return null
}

function unzip(buf) {
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) return null
  const count = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)
  const out = new Map()
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break
    const method = buf.readUInt16LE(off + 10)
    const compSize = buf.readUInt32LE(off + 20)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const cmtLen = buf.readUInt16LE(off + 32)
    const localOff = buf.readUInt32LE(off + 42)
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen)
    const lNameLen = buf.readUInt16LE(localOff + 26)
    const lExtraLen = buf.readUInt16LE(localOff + 28)
    const ds = localOff + 30 + lNameLen + lExtraLen
    try {
      out.set(name, method === 0 ? buf.subarray(ds, ds + compSize) : zlib.inflateRawSync(buf.subarray(ds, ds + compSize)))
    } catch { }
    off += 46 + nameLen + extraLen + cmtLen
  }
  return out
}

const TARGETS = [
  ['skill_icon_302001_302020.fla', 2001],
  ['skill_icon_304001_304020.fla', 4001],
]

function toIcon(img, size = 64) {
  const s = Math.min(size / img.w, size / img.h)
  const dw = Math.max(1, Math.round(img.w * s)), dh = Math.max(1, Math.round(img.h * s))
  const out = new Uint8Array(size * size * 4)
  const ox = (size - dw) >> 1, oy = (size - dh) >> 1
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(img.w - 1, Math.round(x * img.w / dw))
      const sy = Math.min(img.h - 1, Math.round(y * img.h / dh))
      const si = (sy * img.w + sx) * 4, di = ((y + oy) * size + x + ox) * 4
      out[di] = img.data[si]; out[di + 1] = img.data[si + 1]; out[di + 2] = img.data[si + 2]; out[di + 3] = img.data[si + 3]
    }
  }
  return { w: size, h: size, data: out }
}

const report = []
for (const [file, startId] of TARGETS) {
  const p = path.join(SRC, file)
  if (!fs.existsSync(p)) { console.log('★ 缺 ' + file); continue }
  const buf = fs.readFileSync(p)
  const zip = unzip(buf)
  console.log(`\n${file}  ${(buf.length / 1024).toFixed(0)} KB  ${zip ? 'zip 容器，' + zip.size + ' 个条目' : '旧二进制格式'}`)
  const imgs = []
  if (zip) {
    for (const [name, data] of zip) {
      const img = pngInfo(data, 0)
      if (img && img.w >= 16 && img.h >= 16) { imgs.push({ name, img }); continue }
    }
  }
  if (!imgs.length) {
    // 兜底：整份文件里扫 PNG 头
    for (let i = 0; i + 8 < buf.length; i++) {
      if (buf.readUInt32BE(i) !== 0x89504e47) continue
      const img = pngInfo(buf, i)
      if (img && img.w >= 16 && img.h >= 16 && img.w <= 512 && img.h <= 512) imgs.push({ name: '@' + i, img })
      i += 3
    }
  }
  console.log(`  找到 ${imgs.length} 张位图`)
  // 按面积从大到小取前 20（图标都是 64×64 上下）
  imgs.sort((a, b) => b.img.w * b.img.h - a.img.w * a.img.h)
  for (const it of imgs.slice(0, 20)) {
    console.log(`    ${String(it.img.w).padStart(4)}x${String(it.img.h).padEnd(4)} ${it.name}`)
  }
  report.push({ file, startId, count: imgs.length })
}
