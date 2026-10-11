// 分析 26 个 monster_*.swf：各自是矢量还是位图、有没有"完整立绘"尺寸的位图。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/^monster_.*\.swf$/i.test(e.name)) out.push(p)
  }
  return out
}
const uniq = new Map()
for (const p of walk('多克多比专区资料素材')) if (!uniq.has(path.basename(p))) uniq.set(path.basename(p), p)

function jpegDims(j) {
  for (let k = 2; k + 9 < j.length;) {
    if (j[k] !== 0xff) { k++; continue }
    const mk = j[k + 1]
    if (mk === 0xd8 || mk === 1 || (mk >= 0xd0 && mk <= 0xd7)) { k += 2; continue }
    const L = j.readUInt16BE(k + 2)
    if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) {
      return { w: j.readUInt16BE(k + 7), h: j.readUInt16BE(k + 5) }
    }
    if (L < 2) break
    k += 2 + L
  }
  return { w: 0, h: 0 }
}

function analyze(p) {
  const buf = fs.readFileSync(p)
  const sig = buf.toString('ascii', 0, 3)
  const body = sig === 'CWS' ? zlib.inflateSync(buf.subarray(8)) : buf.subarray(8)
  const nb = body[8] >> 3
  let pos = 8 + Math.ceil((5 + nb * 4) / 8) + 4
  const stat = { shapes: 0, sprites: 0, jpegs: 0, lossless: 0, dims: [], texts: 0 }
  while (pos + 2 <= body.length) {
    const cl = body.readUInt16LE(pos); pos += 2
    const code = cl >> 6
    let len = cl & 0x3f
    if (len === 0x3f) { len = body.readUInt32LE(pos); pos += 4 }
    if (pos + len > body.length) break
    const d = body.subarray(pos, pos + len)
    if (code === 32 || code === 83 || code === 2 || code === 22 || code === 11) stat.shapes++
    if (code === 39) stat.sprites++
    if (code === 11 || code === 33 || code === 37) stat.texts++
    if (code === 21 || code === 35) {
      stat.jpegs++
      const hdr = code === 35 ? 6 : 2
      const j = d.subarray(hdr)
      if (j.length > 4 && j[0] === 0xff && j[1] === 0xd8) stat.dims.push(jpegDims(j))
    }
    if (code === 20 || code === 36) {
      stat.lossless++
      stat.dims.push({ w: d.readUInt16LE(3), h: d.readUInt16LE(5) })
    }
    pos += len
    if (code === 0) break
  }
  return stat
}

const rows = []
for (const [b, p] of uniq) {
  const a = analyze(p)
  const good = a.dims.filter((x) => x.w > 120 && x.h > 120).sort((x, y) => y.w * y.h - x.w * x.h)[0]
  rows.push({
    file: b.replace(/^monster_/, '').replace(/\.swf$/, ''),
    kb: Math.round(fs.statSync(p).size / 1024),
    shapes: a.shapes, sprites: a.sprites, jpegs: a.jpegs, lossless: a.lossless,
    biggest: good ? good.w + 'x' + good.h : '（无)',
    allDims: a.dims.map((x) => x.w + 'x' + x.h).join(' '),
  })
}
const pad = (s, n) => String(s).padEnd(n)
console.log(pad('文件', 26) + pad('KB', 7) + pad('形状', 6) + pad('精灵', 6) + pad('JPEG', 6) + pad('无损', 6) + '最大完整位图')
for (const r of rows.sort((a, b) => (b.biggest.includes('无') ? 0 : 1) - (a.biggest.includes('无') ? 0 : 1))) {
  console.log(pad(r.file, 26) + pad(r.kb, 7) + pad(r.shapes, 6) + pad(r.sprites, 6) + pad(r.jpegs, 6) + pad(r.lossless, 6) + r.biggest)
}
console.log('\n有"完整立绘尺寸位图"的: ' + rows.filter((r) => !r.biggest.includes('无')).length + '/' + rows.length)
console.log('\n=== 各文件的所有位图尺寸（看是不是碎片）===')
for (const r of rows) {
  if (r.allDims) console.log('  ' + pad(r.file, 26) + r.allDims.slice(0, 150))
}
