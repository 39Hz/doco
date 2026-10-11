// 只读侦察：不依赖任何第三方库，从文件头解析图片尺寸 / 音频参数
import fs from 'node:fs'
import path from 'node:path'

function imageSize(buf) {
  // PNG
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { fmt: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  }
  // GIF
  if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'GIF') {
    return { fmt: 'gif', w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) }
  }
  // JPEG
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue }
      const m = buf[i + 1]
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { fmt: 'jpg', h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
      }
      const len = buf.readUInt16BE(i + 2)
      if (len <= 0) break
      i += 2 + len
    }
    return { fmt: 'jpg', w: 0, h: 0 }
  }
  // BMP
  if (buf.length > 26 && buf[0] === 0x42 && buf[1] === 0x4d) {
    return { fmt: 'bmp', w: buf.readInt32LE(18), h: buf.readInt32LE(22) }
  }
  // SWF (未压缩 FWS / 压缩 CWS / LZMA ZWS)
  const sig = buf.toString('ascii', 0, 3)
  if (sig === 'FWS' || sig === 'CWS' || sig === 'ZWS') {
    return { fmt: 'swf-' + sig, w: 0, h: 0, version: buf[3] }
  }
  return null
}

// 粗略估算 mp3 时长（按首帧比特率）
function mp3Info(buf) {
  let i = 0
  if (buf.toString('ascii', 0, 3) === 'ID3') {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f)
    i = 10 + size
  }
  const BR = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
  const SR = [44100, 48000, 32000, 0]
  for (; i < buf.length - 4 && i < 200000; i++) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
      const verBits = (buf[i + 1] >> 3) & 3
      const brIdx = (buf[i + 2] >> 4) & 15
      const srIdx = (buf[i + 2] >> 2) & 3
      if (verBits === 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) continue
      const rate = BR[brIdx] * 1000
      const sr = SR[srIdx] / (verBits === 3 ? 1 : verBits === 2 ? 2 : 4)
      const secs = (buf.length - i) * 8 / rate
      return { fmt: 'mp3', kbps: BR[brIdx], hz: Math.round(sr), secs: Math.round(secs) }
    }
  }
  return { fmt: 'mp3/unknown' }
}

function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

const target = process.argv[2]
const files = walk(target)
const rows = []
for (const f of files) {
  const buf = fs.readFileSync(f)
  const ext = path.extname(f).toLowerCase()
  let info = null
  if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.swf'].includes(ext)) info = imageSize(buf)
  else if (ext === '.mp3') info = mp3Info(buf)
  rows.push({ rel: path.relative(target, f), bytes: buf.length, ...(info || { fmt: '?' }) })
}

const byFmt = {}
for (const r of rows) byFmt[r.fmt] = (byFmt[r.fmt] || 0) + 1
console.log('=== 格式分布 ===')
for (const [k, v] of Object.entries(byFmt).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(12)} ${v}`)

console.log('\n=== 最大 15 个文件 ===')
rows.sort((a, b) => b.bytes - a.bytes).slice(0, 15).forEach(r =>
  console.log(`  ${(r.bytes / 1024).toFixed(0).padStart(7)} KB  ${String(r.w || '')}x${String(r.h || '')}${r.secs ? '  ' + r.secs + 's' : ''}  ${r.rel}`))

console.log('\n=== 尺寸聚合（图片）===')
const dims = {}
for (const r of rows) if (r.w) { const k = `${r.w}x${r.h}`; dims[k] = (dims[k] || 0) + 1 }
Object.entries(dims).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => console.log(`  ${k.padEnd(14)} ${v}`))
