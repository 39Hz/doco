// 盘点「官方形态立绘」到底有哪些可用图。
//
// 用户反馈：背包里「瑞比特·兔 多比」显示成了龙多比的样子。
// 要求不只是改这一个，而是**所有形态都要对上官方形象**。
//
// 所以先摸清楚：归档里有多少张按形态名命名的官方图、尺寸多少、是不是透明切图。
// 只有 PNG 且带 alpha 的才是能直接当精灵用的切图；1920 之类的多半是壁纸。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.resolve('.')

// ---------- 图片头解析（只读头，不解全图） ----------
function pngInfo(buf) {
  if (buf.length < 26 || buf.readUInt32BE(0) !== 0x89504e47) return null
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20)
  const bitDepth = buf[24], colorType = buf[25]
  return { w, h, bitDepth, colorType, alpha: colorType === 4 || colorType === 6 }
}
function jpgInfo(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  let i = 2
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue }
    const m = buf[i + 1]
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue }
    const len = buf.readUInt16BE(i + 2)
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5), alpha: false }
    }
    i += 2 + len
  }
  return null
}
function info(p) {
  const buf = fs.readFileSync(p)
  return pngInfo(buf) || jpgInfo(buf)
}

// 真的算一下 alpha 覆盖率：只对 PNG 做，抽样解码太麻烦，这里用
// 「IDAT 解压后按 filter 还原」的简化版——只统计 alpha 通道非零像素。
function alphaStats(p) {
  const buf = fs.readFileSync(p)
  const i = pngInfo(buf)
  if (!i || !i.alpha) return null
  // 收集 IDAT
  let off = 8
  const chunks = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    if (type === 'IDAT') chunks.push(buf.subarray(off + 8, off + 8 + len))
    off += 12 + len
    if (type === 'IEND') break
  }
  let raw
  try { raw = zlib.inflateSync(Buffer.concat(chunks)) } catch { return null }
  const ch = i.colorType === 6 ? 4 : i.colorType === 4 ? 2 : 0
  if (!ch) return null
  const bpp = ch * (i.bitDepth / 8)
  const stride = i.w * bpp
  const prev = Buffer.alloc(stride)
  const cur = Buffer.alloc(stride)
  let pos = 0, opaque = 0, semi = 0, transparent = 0, total = 0
  for (let y = 0; y < i.h; y++) {
    const f = raw[pos++]
    raw.copy(cur, 0, pos, pos + stride); pos += stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0
      const b = prev[x]
      const c = x >= bpp ? prev[x - bpp] : 0
      let v = cur[x]
      if (f === 1) v = (v + a) & 255
      else if (f === 2) v = (v + b) & 255
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
        const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
        v = (v + pr) & 255
      }
      cur[x] = v
    }
    for (let x = 0; x < i.w; x++) {
      const al = cur[x * bpp + bpp - 1]
      total++
      if (al >= 250) opaque++
      else if (al > 8) semi++
      else transparent++
    }
    cur.copy(prev)
  }
  return { opaque, semi, transparent, total }
}

// ---------- 扫描 ----------
const ROOTS = [
  '多克多比专区资料素材/多比形态素材',
  '多克多比专区资料素材/图片资源/多克多比图片集/人物和索亚',
  '多克多比专区资料素材/多克多比VIP充值素材/多比形态',
  '多克多比专区资料素材/多克多比专区改版资料',
  '多克多比专区资料素材/副本',
]
const files = []
for (const r of ROOTS) {
  const abs = path.join(ROOT, r)
  if (!fs.existsSync(abs)) continue
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(png|jpg|jpeg)$/i.test(e.name)) files.push(p)
    }
  }
  walk(abs)
}

// 不按文件名去重：同名 .png/.jpg 往往是「透明切图 vs 宣传图」，
// 正是要找的那一对（例：兔多比.jpg 553KB 是宣传图，兔多比.png 28KB 才是切图）。
const cand = files.filter((p) => /多比|索亚/.test(path.basename(p)))

const rows = []
for (const p of cand) {
  const i = info(p)
  if (!i) continue
  if (i.w > 2600 || i.h > 1500) continue           // 壁纸/易拉宝，跳过
  const st = fs.statSync(p)
  const a = i.alpha ? alphaStats(p) : null
  const alphaPct = a ? +(100 * (a.opaque + a.semi) / a.total).toFixed(1) : null
  rows.push({
    base: path.basename(p), w: i.w, h: i.h, alpha: !!i.alpha,
    alphaPct, kb: Math.round(st.size / 1024),
    rel: path.relative(ROOT, p).replace(/\\/g, '/'),
  })
}
// 可当精灵的排前面：有 alpha 且覆盖率 5%~95%（太低=几乎全透明，太高=背景没抠）
const usable = (r) => r.alpha && r.alphaPct > 4 && r.alphaPct < 97
rows.sort((x, y) => (usable(y) - usable(x)) || (y.alpha - x.alpha) ||
  (y.w * y.h - x.w * x.h))
console.log('=== 官方形态立绘候选（★ = 可直接当精灵的透明切图） ===')
for (const r of rows) {
  console.log(`  ${usable(r) ? '★' : ' '} ${r.base.padEnd(26)} ${String(r.w).padStart(5)}x${String(r.h).padEnd(5)} ` +
    `${r.alpha ? 'alpha' : '  -  '} ${r.alphaPct === null ? '   -  ' : String(r.alphaPct).padStart(5) + '%'} ` +
    `${String(r.kb).padStart(6)}KB  ${r.rel}`)
}
console.log(`\n共 ${rows.length} 张候选，其中可直接用 ${rows.filter(usable).length} 张`)
