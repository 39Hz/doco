// 过滤怪物精灵：剔除接近纯灰的产出（文字块、轮廓、阴影），只留下彩色立绘
// 用法: node filter-monsters.mjs <monsters目录>
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const DIR = process.argv[2]

function decodePng(buf) {
  let off = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0
  const idat = []
  let palette = null, trns = null
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12] }
    else if (type === 'PLTE') palette = Buffer.from(data)
    else if (type === 'tRNS') trns = Buffer.from(data)
    else if (type === 'IDAT') idat.push(Buffer.from(data))
    else if (type === 'IEND') break
    off += 12 + len
  }
  const chMap = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
  const ch = chMap[colorType]
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * ch
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
      else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c) }
      cur[x] = v & 0xff
    }
    cur.copy(out, y * stride); prev = cur
  }
  const rgba = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const s = i * ch, d = i * 4
    if (colorType === 6) { rgba[d] = out[s]; rgba[d + 1] = out[s + 1]; rgba[d + 2] = out[s + 2]; rgba[d + 3] = out[s + 3] }
    else if (colorType === 2) { rgba[d] = out[s]; rgba[d + 1] = out[s + 1]; rgba[d + 2] = out[s + 2]; rgba[d + 3] = 255 }
    else if (colorType === 3) { const pi = out[s]; rgba[d] = palette[pi * 3]; rgba[d + 1] = palette[pi * 3 + 1]; rgba[d + 2] = palette[pi * 3 + 2]; rgba[d + 3] = trns && pi < trns.length ? trns[pi] : 255 }
    else if (colorType === 4) { rgba[d] = rgba[d + 1] = rgba[d + 2] = out[s]; rgba[d + 3] = out[s + 1] }
    else { rgba[d] = rgba[d + 1] = rgba[d + 2] = out[s]; rgba[d + 3] = 255 }
  }
  return { w, h, data: rgba }
}

const files = fs.readdirSync(DIR).filter((f) => /^m_\d+\.png$/.test(f)).sort()
console.log(`检查 ${files.length} 个文件`)

const keep = [], drop = []
for (const f of files) {
  const img = decodePng(fs.readFileSync(path.join(DIR, f)))
  let colorN = 0, inkN = 0
  const hues = new Set()
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 40) continue
    inkN++
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2]
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    if (mx - mn > 30) {
      colorN++
      // 粗略色调分桶（30 度一格）
      let hDeg = 0
      if (mx === r) hDeg = 60 * (((g - b) / (mx - mn)) % 6)
      else if (mx === g) hDeg = 60 * ((b - r) / (mx - mn) + 2)
      else hDeg = 60 * ((r - g) / (mx - mn) + 4)
      if (hDeg < 0) hDeg += 360
      hues.add(Math.floor(hDeg / 30))
    }
  }
  const colorRatio = inkN ? colorN / inkN : 0
  // 中位亮度：黑色轮廓块的中位亮度接近 0，正常立绘在中间
  let sumLum = 0, lumSamples = []
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 40) continue
    const L = (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000
    lumSamples.push(L)
  }
  lumSamples.sort((a, b) => a - b)
  const medLum = lumSamples.length ? lumSamples[Math.floor(lumSamples.length / 2)] : 0
  const darkRatio = lumSamples.length ? lumSamples.filter((v) => v < 60).length / lumSamples.length : 0

  // 判据：
  //  · 彩色像素占比够高
  //  · 色调种类 >= 3（黑块只有黑/白两种）
  //  · 中位亮度不能太暗，且暗像素占比不能过高（黑色轮廓块会全暗）
  const isMonster = colorRatio > 0.28 && hues.size >= 3 && inkN > 400 && medLum > 70 && darkRatio < 0.42
  ;(isMonster ? keep : drop).push({ f, colorRatio: +colorRatio.toFixed(2), hues: hues.size, inkN, medLum: Math.round(medLum), darkRatio: +darkRatio.toFixed(2) })
}

console.log(`保留 ${keep.length} 个，剔除 ${drop.length} 个`)
console.log('\n剔除明细（彩色占比 / 色调数 / 墨迹 / 中位亮度 / 暗像素占比）：')
for (const d of drop.slice(0, 30)) {
  console.log(`  ${d.f}  彩 ${String(d.colorRatio).padEnd(4)} 色 ${String(d.hues).padStart(2)}  墨 ${String(d.inkN).padStart(6)}  亮 ${String(d.medLum).padStart(3)}  暗 ${d.darkRatio}`)
}
console.log('\n保留的彩色占比范围：',
  Math.min(...keep.map((k) => k.colorRatio)).toFixed(2), '~',
  Math.max(...keep.map((k) => k.colorRatio)).toFixed(2))

// 重命名：保留项重新编号，保持连续
for (const d of drop) {
  const p = path.join(DIR, d.f)
  if (fs.existsSync(p)) fs.unlinkSync(p)
  const lp = path.join(DIR, d.f.replace('m_', 'label_'))
  if (fs.existsSync(lp)) fs.unlinkSync(lp)
}
keep.forEach((k, i) => {
  const newName = `m_${String(i).padStart(3, '0')}.png`
  if (newName !== k.f) fs.renameSync(path.join(DIR, k.f), path.join(DIR, newName))
  const oldLabel = path.join(DIR, k.f.replace('m_', 'label_'))
  if (fs.existsSync(oldLabel)) fs.renameSync(oldLabel, path.join(DIR, newName.replace('m_', 'label_')))
})
console.log(`\n已重命名为连续编号，剩余 ${keep.length} 只`)
