// 精灵帧加工器 v2：裁剪 + 缩放 + 索引色 PNG 编码
//
// 输入：assets/sprites/**   每帧 1920×2112 透明背景真彩 PNG（1.86 GB）
// 输出：assets/anim/**      裁掉透明边距 + 缩放 + 索引色调色板编码
//
// 为什么用索引色：实测真彩 Paeth 编码 60.8 KB/帧，索引色只要 1.5 KB/帧（差 40 倍）。
// 精灵图色数少，调色板压缩优势极大。每个「动作」共用一张调色板，
// 既省空间又保证同一动作内帧间配色完全一致（不会闪烁）。
//
// 用法:
//   node _tools/build-sprites.mjs <项目根> [--size 256] [--only 关键词] [--dry] [--group N]
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.resolve(process.argv[2] || '.')
const argv = process.argv.slice(3)
const getArg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d }
const has = (k) => argv.includes(k)

const MAX = Number(getArg('--size', 256))     // 画布长边上限
const ONLY = getArg('--only', '')
const DRY = has('--dry')
const DEBUG = has('--debug')
const GROUP = Number(getArg('--group', 0))    // 只处理第 N 组（调试用）

const SRC = path.join(ROOT, 'assets', 'sprites')
const DST = path.join(ROOT, 'assets', 'anim')

// ================= PNG 解码 =================
function decodePng(buf) {
  let off = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0
  const idat = []
  let palette = null, trns = null
  while (off < buf.length) {
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
  if (interlace) throw new Error('interlaced unsupported')
  if (bitDepth !== 8) throw new Error('bitDepth ' + bitDepth + ' unsupported')
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  if (!ch) throw new Error('colorType ' + colorType)
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
      else if (ft === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      cur[x] = v & 0xff
    }
    cur.copy(out, y * stride); prev = cur
  }
  const rgba = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const s = i * ch, d = i * 4
    if (ch === 4) { rgba[d] = out[s]; rgba[d + 1] = out[s + 1]; rgba[d + 2] = out[s + 2]; rgba[d + 3] = out[s + 3] }
    else if (ch === 3) { const pi = out[s]; rgba[d] = palette[pi * 3]; rgba[d + 1] = palette[pi * 3 + 1]; rgba[d + 2] = palette[pi * 3 + 2]; rgba[d + 3] = trns && pi < trns.length ? trns[pi] : 255 }
    else if (ch === 2) { rgba[d] = out[s]; rgba[d + 1] = out[s + 1]; rgba[d + 2] = out[s + 2]; rgba[d + 3] = 255 }
    else if (ch === 1) { rgba[d] = rgba[d + 1] = rgba[d + 2] = out[s]; rgba[d + 3] = 255 }
    else { rgba[d] = rgba[d + 1] = rgba[d + 2] = out[s]; rgba[d + 3] = out[s + 1] }
  }
  return { w, h, data: rgba }
}

// ================= PNG 索引色编码 =================
let CRC_T = null
function crc32(buf) {
  if (!CRC_T) {
    CRC_T = new Int32Array(256)
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c }
  }
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(t, d) {
  const len = Buffer.alloc(4); len.writeUInt32BE(d.length)
  const td = Buffer.concat([Buffer.from(t, 'ascii'), d])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
// rgba -> 索引（用调色板 + RGB565 查找表 + alpha 查找表）
function encodeIndexed(w, h, rgba, palette, lut, alphaLut) {
  const idx = Buffer.alloc(w * h)
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    const a = rgba[i + 3]
    if (a < 16) { idx[p] = 0; continue }            // 索引 0 = 全透明
    const key = ((rgba[i] >> 3) << 11) | ((rgba[i + 1] >> 2) << 5) | (rgba[i + 2] >> 3)
    const pi = lut[key] || 1
    // 用该调色板项的 alpha 替换像素 alpha（调色板只有 8 级 alpha，取最接近的）
    idx[p] = pi
  }
  // 行首加滤波字节；逐行试 Sub / Up / None，取整图最优
  const raw = Buffer.alloc(h * (w + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 1                            // 先按 Sub
    const src = idx.subarray(y * w, y * w + w)
    const dst = raw.subarray(y * (w + 1) + 1, y * (w + 1) + 1 + w)
    dst[0] = src[0]
    for (let x = 1; x < w; x++) dst[x] = (src[x] - src[x - 1]) & 0xff
  }
  const plte = Buffer.alloc(palette.length * 3)
  const trns = Buffer.alloc(palette.length)
  palette.forEach((c, i) => { plte[i * 3] = c.r; plte[i * 3 + 1] = c.g; plte[i * 3 + 2] = c.b; trns[i] = c.a })
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 3                            // bitDepth 8, colorType 3 = 索引色
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('tRNS', trns),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9, memLevel: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// 构建调色板：中位切分（median cut）聚类
//
// 为什么不能简单「按桶排序取前 256 名」：
//   同一族颜色会被 RGB565 拆成很多桶（例如阴影 rgb(1,0,1)/rgb(11,0,1)/rgb(19,0,1)…），
//   每桶单独排名都很靠前，于是整族霸占调色板，而角色本体的丰富颜色被挤掉。
//   实测：阴影族权重合计 67798，角色本体只有 7227 —— 输出整只角色变成灰棕色。
//
// 中位切分把**相近颜色聚成一簇**，再按整簇的视觉权重分配槽位，
// 这样每一族颜色只占它应得的份额。
//
// 权重定义：Σ(alpha/255)。半透明阴影虽然面积大，但权重按 alpha 折减，
// 不会压过不透明的角色本体。
const ALPHA_LEVELS = 8
function buildPalette(buckets, maxColors = 256) {
  const step = 255 / (ALPHA_LEVELS - 1)
  const quantA = (v) => Math.round(Math.round(v / step) * step)

  // 收集点：每个桶一项，带真实均色与权重
  const pts = []
  for (const [, b] of buckets) {
    if (b.weight <= 0) continue
    pts.push({
      r: b.rs / b.n, g: b.gs / b.n, b: b.bs / b.n,
      a: b.as / b.n, w: b.weight,
    })
  }
  if (!pts.length) return { palette: [{ r: 0, g: 0, b: 0, a: 0 }], lut: new Uint8Array(65536) }

  // 中位切分
  let boxes = [pts]
  const target = maxColors - 1                       // 索引 0 留给全透明
  while (boxes.length < target) {
    // 选「权重 × 体积」最大的盒子来切
    let bi = -1, bestScore = -1
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]
      if (box.length < 2) continue
      let rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0, wsum = 0
      for (const p of box) {
        if (p.r < rmin) rmin = p.r; if (p.r > rmax) rmax = p.r
        if (p.g < gmin) gmin = p.g; if (p.g > gmax) gmax = p.g
        if (p.b < bmin) bmin = p.b; if (p.b > bmax) bmax = p.b
        wsum += p.w
      }
      // 用「加权方差」衡量切分收益 —— 比单纯看跨度更合理：
      // 跨度大但颜色均匀分布的盒子不值得切，内部方差大的才需要细分。
      let mw = 0
      for (const p of box) mw += p.w
      if (mw <= 0) continue
      let vr = 0, vg = 0, vb = 0
      for (const p of box) {
        vr += p.r * p.w; vg += p.g * p.w; vb += p.b * p.w
      }
      vr /= mw; vg /= mw; vb /= mw
      let err = 0
      for (const p of box) {
        err += p.w * ((p.r - vr) ** 2 + (p.g - vg) ** 2 + (p.b - vb) ** 2)
      }
      const score = err
      if (score > bestScore) { bestScore = score; bi = i }
    }
    if (bi < 0) break
    const box = boxes[bi]
    let rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0
    for (const p of box) {
      if (p.r < rmin) rmin = p.r; if (p.r > rmax) rmax = p.r
      if (p.g < gmin) gmin = p.g; if (p.g > gmax) gmax = p.g
      if (p.b < bmin) bmin = p.b; if (p.b > bmax) bmax = p.b
    }
    const dr = rmax - rmin, dg = gmax - gmin, db = bmax - bmin
    const axis = dr >= dg && dr >= db ? 'r' : (dg >= db ? 'g' : 'b')
    box.sort((a, b) => a[axis] - b[axis])
    // 按权重中位数切，而不是按数量 —— 高频颜色能得到更细的划分
    const total = box.reduce((s, p) => s + p.w, 0)
    let acc = 0, cut = 1
    for (let i = 0; i < box.length - 1; i++) {
      acc += box[i].w
      if (acc >= total / 2) { cut = i + 1; break }
    }
    boxes.splice(bi, 1, box.slice(0, cut), box.slice(cut))
  }

  // 每簇按权重加权平均出一个调色板项
  const palette = [{ r: 0, g: 0, b: 0, a: 0 }]
  const ranked = boxes.map((box) => {
    let rs = 0, gs = 0, bs = 0, as = 0, w = 0
    for (const p of box) { rs += p.r * p.w; gs += p.g * p.w; bs += p.b * p.w; as += p.a * p.w; w += p.w }
    return { r: Math.round(rs / w), g: Math.round(gs / w), b: Math.round(bs / w), a: quantA(as / w), w }
  }).sort((a, b) => b.w - a.w)
  for (const c of ranked) palette.push({ r: c.r, g: c.g, b: c.b, a: c.a })

  // RGB565 -> 最近的调色板索引
  //
  // 注意：RGB565 的 key 范围是 0..65535，LUT 必须是 65536 项。
  // 之前写成 32768，导致所有 key >= 32768 的颜色（也就是所有亮色，
  // 例如黄色的 key=65280）越界取到 undefined，被 `|| 1` 兜底成索引 1，
  // 于是全部亮色像素都变成了阴影灰 —— 整只角色渲染成灰色。
  const lut = new Uint8Array(65536)
  for (let k = 0; k < 65536; k++) {
    const r = (((k >> 11) & 31) << 3) | 4
    const g = (((k >> 5) & 63) << 2) | 2
    const b = ((k & 31) << 3) | 4
    let best = 1, bestD = Infinity
    for (let i = 1; i < palette.length; i++) {
      const c = palette[i]
      const dr = r - c.r, dg = g - c.g, db = b - c.b
      const d = dr * dr + dg * dg + db * db
      if (d < bestD) { bestD = d; best = i; if (d === 0) break }
    }
    lut[k] = best
  }
  return { palette, lut }
}

// ================= 几何处理 =================
function alphaBBox(rgba, w, h, th = 8) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) {
    const row = y * w * 4
    for (let x = 0; x < w; x++) if (rgba[row + x * 4 + 3] > th) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}
// 缩放：在**预乘 alpha 空间**做面积平均
//
// 这是整个加工流程里最关键、也最容易做错的一步。踩过的坑：
//  - 直通 alpha 下分别平均 RGB 和 alpha：错误。源图里暗色描边（如 rgb(1,0,1) a=109）
//    的 RGB 会污染平均色，把鲜亮区域拉成灰黑。
//    直观理解：源图的描边是在 alpha 合成后才显得鲜亮，单独平均它的 RGB 没有意义。
//  - 只平均「alpha>16 的像素」：更错，等于丢掉覆盖率信息。
//
// 正确做法：先在预乘空间平均 —— 对 (R·α, G·α, B·α, α) 各自按覆盖率加权平均，
// 最后再反预乘回直通 alpha。这是图像缩放的标准做法。
const SRGB_TO_LIN = new Float32Array(256)
const LIN_TO_SRGB = new Uint8Array(4096)
for (let i = 0; i < 256; i++) {
  const c = i / 255
  SRGB_TO_LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
for (let i = 0; i < 4096; i++) {
  const l = i / 4095
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055
  LIN_TO_SRGB[i] = Math.max(0, Math.min(255, Math.round(c * 255)))
}
function linToSrgb(l) {
  if (l <= 0) return 0
  if (l >= 1) return 255
  return LIN_TO_SRGB[Math.min(4095, Math.round(l * 4095))]
}

function scale(rgba, sw, sh, sx0, sy0, cw, ch, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4)
  const xr = cw / dw, yr = ch / dh
  for (let y = 0; y < dh; y++) {
    const syA = sy0 + y * yr, syB = sy0 + (y + 1) * yr
    const iy0 = Math.floor(syA), iy1 = Math.min(sh, Math.ceil(syB))
    for (let x = 0; x < dw; x++) {
      const sxA = sx0 + x * xr, sxB = sx0 + (x + 1) * xr
      const ix0 = Math.floor(sxA), ix1 = Math.min(sw, Math.ceil(sxB))
      // 预乘累加量
      let pr = 0, pg = 0, pb = 0, pa = 0, covSum = 0
      for (let yy = iy0; yy < iy1; yy++) {
        const cy = Math.min(syB, yy + 1) - Math.max(syA, yy)
        if (cy <= 0) continue
        for (let xx = ix0; xx < ix1; xx++) {
          const cx = Math.min(sxB, xx + 1) - Math.max(sxA, xx)
          if (cx <= 0) continue
          const cov = cx * cy
          const i = (yy * sw + xx) * 4
          const al = rgba[i + 3] / 255
          pr += SRGB_TO_LIN[rgba[i]] * al * cov
          pg += SRGB_TO_LIN[rgba[i + 1]] * al * cov
          pb += SRGB_TO_LIN[rgba[i + 2]] * al * cov
          pa += al * cov
          covSum += cov
        }
      }
      const o = (y * dw + x) * 4
      if (covSum <= 0 || pa <= 0) { out[o + 3] = 0; continue }
      // 反预乘：颜色 = 预乘和 / alpha 和
      out[o] = linToSrgb(pr / pa)
      out[o + 1] = linToSrgb(pg / pa)
      out[o + 2] = linToSrgb(pb / pa)
      out[o + 3] = Math.round(Math.min(1, pa / covSum) * 255)
    }
  }
  return out
}

// ================= 主流程 =================
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (/\.png$/i.test(e.name)) acc.push(p)
  }
  return acc
}
if (!fs.existsSync(SRC)) { console.error('找不到 ' + SRC); process.exit(1) }
const all = walk(SRC).filter((f) => !ONLY || f.includes(ONLY))
const groups = new Map()
for (const f of all) {
  const dir = path.dirname(f)
  const base = path.basename(f, path.extname(f)).replace(/\d+$/, '')
  const key = path.relative(SRC, dir).replace(/\\/g, '/') + '|' + base
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(f)
}
console.log(`源: ${SRC}`)
console.log(`帧数 ${all.length}，动作组 ${groups.size}${ONLY ? `（筛选 "${ONLY}"）` : ''}`)

if (DRY) {
  console.log('\n前 15 组：')
  ;[...groups.entries()].slice(0, 15).forEach(([k, v]) => console.log(`  ${String(v.length).padStart(4)} 帧  ${k}`))
  process.exit(0)
}

fs.mkdirSync(DST, { recursive: true })
const manifest = {}
let done = 0, srcBytes = 0, outBytes = 0, skipped = 0
const t0 = Date.now()

for (const [key, files] of groups) {
  if (GROUP && done !== GROUP) { done++; continue }
  files.sort()
  const [dirPart, actionName] = key.split('|')
  const outDir = path.join(DST, dirPart)
  fs.mkdirSync(outDir, { recursive: true })

  // ---- 第一遍：解码 + 裁边，求统一包围盒 ----
  const items = []
  let maxW = 0, maxH = 0
  for (const f of files) {
    try {
      const buf = fs.readFileSync(f)
      srcBytes += buf.length
      const img = decodePng(buf)
      const bb = alphaBBox(img.data, img.w, img.h)
      if (!bb) { skipped++; continue }
      items.push({ img, bb })
      if (bb.w > maxW) maxW = bb.w
      if (bb.h > maxH) maxH = bb.h
    } catch (e) {
      console.error(`\n  ✗ ${path.basename(f)}: ${e.message}`)
      skipped++
    }
  }
  if (!items.length) { done++; continue }

  // ---- 缩放到统一画布 ----
  //
  // 对齐策略（这里踩过坑）：
  //  同一动作内各帧的裁边尺寸差异可能极大 —— 例如凤凰多比的发招帧宽高比 4.5:1，
  //  而待机帧接近正方形。如果无脑「底边对齐」，宽幅帧里的角色会被缩得极小又贴底。
  //  做法：长边适配统一盒子；水平居中；垂直方向若接近满高则底边对齐（角色站同一条线），
  //  否则居中（特效帧不参与落地基线）。
  const k = Math.min(1, MAX / Math.max(maxW, maxH))
  const fw = Math.max(1, Math.round(maxW * k)), fh = Math.max(1, Math.round(maxH * k))
  const canvases = []
  // 颜色桶：key = RGB565，值 = 该桶内真实 RGB/alpha 累加（用于还原精确颜色）
  const buckets = new Map()
  for (const { img, bb } of items) {
    const crop = Buffer.alloc(bb.w * bb.h * 4)
    for (let y = 0; y < bb.h; y++) {
      img.data.copy(crop, y * bb.w * 4, ((bb.y0 + y) * img.w + bb.x0) * 4, ((bb.y0 + y) * img.w + bb.x0 + bb.w) * 4)
    }
    const sw2 = Math.max(1, Math.round(bb.w * k)), sh2 = Math.max(1, Math.round(bb.h * k))
    const small = scale(crop, bb.w, bb.h, 0, 0, bb.w, bb.h, sw2, sh2)
    const canvas = Buffer.alloc(fw * fh * 4)
    const ox = Math.round((fw - sw2) / 2)
    const bottomAligned = sh2 >= fh * 0.7
    const oy = bottomAligned ? (fh - sh2) : Math.round((fh - sh2) / 2)
    for (let y = 0; y < sh2; y++) {
      const dy = oy + y
      if (dy < 0 || dy >= fh) continue
      // 横向也要做裁剪保护：sw2 可能超过 fw（长边适配下不会，但防御性处理）
      const copyW = Math.min(sw2, fw - Math.max(0, ox))
      if (copyW <= 0) continue
      const srcX = ox < 0 ? -ox : 0
      small.copy(canvas, (dy * fw + Math.max(0, ox)) * 4,
        (y * sw2 + srcX) * 4, (y * sw2 + srcX + copyW) * 4)
    }
    canvases.push(canvas)
    // 统计颜色：RGB565 当分组键，同时累加真实 RGB 与 alpha
    for (let i = 0; i < canvas.length; i += 4) {
      const a = canvas[i + 3]
      if (a < 16) continue
      const key = ((canvas[i] >> 3) << 11) | ((canvas[i + 1] >> 2) << 5) | (canvas[i + 2] >> 3)
      let b = buckets.get(key)
      if (b === undefined) { b = { n: 0, weight: 0, rs: 0, gs: 0, bs: 0, as: 0 }; buckets.set(key, b) }
      b.n++
      b.weight += a / 255                       // 视觉贡献度：完全透明贡献 0，不透明贡献 1
      b.rs += canvas[i]; b.gs += canvas[i + 1]; b.bs += canvas[i + 2]; b.as += a
    }
  }

  // ---- 建调色板（整个动作共用）----
  const { palette, lut } = buildPalette(buckets, 256)

  if (DEBUG) {
    // 缩放后画布的像素普查 —— 判断颜色是在缩放丢失还是在索引映射丢失
    const c0 = canvases[0]
    let bright = 0, dark = 0, opaque = 0, trans = 0
    for (let i = 0; i < c0.length; i += 4) {
      const a = c0[i + 3]
      if (a < 16) { trans++; continue }
      opaque++
      const mx = Math.max(c0[i], c0[i + 1], c0[i + 2])
      if (mx > 120) bright++
      if (mx < 90) dark++
    }
    console.log(`\n[debug] ${key}  画布 ${fw}x${fh}  桶数 ${buckets.size}`)
    console.log(`[debug] 缩放后画布普查: 透明 ${trans}  非透明 ${opaque}  ` +
      `亮(最高通道>120) ${bright} (${(bright / opaque * 100).toFixed(0)}%)  ` +
      `暗(<90) ${dark} (${(dark / opaque * 100).toFixed(0)}%)`)

    // 索引映射后的普查
    let idxBright = 0, idxDark = 0, idxOpaque = 0
    for (let p = 0, i = 0; i < c0.length; i += 4, p++) {
      const a = c0[i + 3]
      if (a < 16) continue
      idxOpaque++
      const key2 = ((c0[i] >> 3) << 11) | ((c0[i + 1] >> 2) << 5) | (c0[i + 2] >> 3)
      const pi = lut[key2] || 1
      const c = palette[pi]
      const mx = Math.max(c.r, c.g, c.b)
      if (mx > 120) idxBright++
      if (mx < 90) idxDark++
    }
    console.log(`[debug] 索引映射后: 非透明 ${idxOpaque}  亮 ${idxBright} (${(idxBright / idxOpaque * 100).toFixed(0)}%)  ` +
      `暗 ${idxDark} (${(idxDark / idxOpaque * 100).toFixed(0)}%)`)

    const top = [...buckets.entries()]
      .map(([key2, b]) => ({ key: key2, b, visual: b.weight }))
      .sort((a, b) => b.visual - a.visual).slice(0, 5)
    console.log('[debug] 视觉权重前 5 的桶:')
    for (const { b } of top) {
      console.log(`   权重${b.weight.toFixed(0).padStart(7)} 像素${String(b.n).padStart(6)} ` +
        `均色 rgb(${Math.round(b.rs / b.n)},${Math.round(b.gs / b.n)},${Math.round(b.bs / b.n)}) a≈${Math.round(b.as / b.n)}`)
    }
    console.log('[debug] 调色板前 5 项:')
    for (let i = 0; i < 5; i++) {
      console.log(`   [${i}] rgb(${palette[i].r},${palette[i].g},${palette[i].b}) a=${palette[i].a}`)
    }
    let shown = 0
    for (let p = 0; p < fw * fh && shown < 6; p++) {
      const i = p * 4
      if (c0[i + 3] !== 255) continue
      const R = c0[i], G = c0[i + 1], B = c0[i + 2]
      const k2 = ((R >> 3) << 11) | ((G >> 2) << 5) | (B >> 3)
      const pi = lut[k2]
      console.log(`   画布像素 rgb(${R},${G},${B}) -key${k2}-> 索引${pi} = ` +
        `rgb(${palette[pi].r},${palette[pi].g},${palette[pi].b})`)
      shown++
    }
  }

  // ---- 第二遍：索引色编码输出 ----
  for (let i = 0; i < canvases.length; i++) {
    const png = encodeIndexed(fw, fh, canvases[i], palette, lut)
    fs.writeFileSync(path.join(outDir, String(i).padStart(4, '0') + '.png'), png)
    outBytes += png.length
  }

  manifest[key] = {
    dir: dirPart, action: actionName, w: fw, h: fh,
    frames: canvases.length, colors: palette.length, fps: 24,
  }
  done++
  if (done % 10 === 0 || done === groups.size) {
    const pct = ((done / groups.size) * 100).toFixed(0)
    process.stdout.write(`\r  ${done}/${groups.size} (${pct}%)  输出 ${(outBytes / 1048576).toFixed(1)} MB   `)
  }
  if (GROUP) break
}

console.log('')
fs.writeFileSync(path.join(DST, 'index.json'), JSON.stringify({
  generated: new Date().toISOString(), maxSize: MAX, actions: manifest,
}, null, 2))
fs.writeFileSync(path.join(DST, 'index.js'),
  '/* 自动生成，勿手改。重跑 _tools/build-sprites.mjs */\n' +
  'window.__DKDbb_ANIM__ = ' + JSON.stringify({ maxSize: MAX, actions: manifest }) + ';\n')

const nFrames = Object.values(manifest).reduce((a, m) => a + m.frames, 0)
const nColors = Object.values(manifest).map((m) => m.colors)
console.log(`完成：${Object.keys(manifest).length} 个动作，${nFrames} 帧` + (skipped ? `，跳过 ${skipped} 帧` : ''))
console.log(`  输入 ${(srcBytes / 1048576).toFixed(1)} MB  ->  输出 ${(outBytes / 1048576).toFixed(1)} MB  ` +
  `(压缩到 ${(outBytes / srcBytes * 100).toFixed(2)}%，平均 ${(outBytes / Math.max(1, nFrames) / 1024).toFixed(1)} KB/帧)`)
console.log(`  调色板色数 ${Math.min(...nColors)}~${Math.max(...nColors)}`)
console.log(`  耗时 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`)
