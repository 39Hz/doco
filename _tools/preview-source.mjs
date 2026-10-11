// 源帧预览：裁到角色包围盒后缩放输出，用于和加工结果并排比对
// 用法: node preview-source.mjs <项目根> <动作名> <输出png> [每帧宽]
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

function dec(buf) {
  let o = 8, w = 0, h = 0, ct = 0
  const id = []
  let pl = null, tr = null
  while (o < buf.length) {
    const L = buf.readUInt32BE(o), T = buf.toString('ascii', o + 4, o + 8), D = buf.subarray(o + 8, o + 8 + L)
    if (T === 'IHDR') { w = D.readUInt32BE(0); h = D.readUInt32BE(4); ct = D[9] }
    else if (T === 'PLTE') pl = Buffer.from(D)
    else if (T === 'tRNS') tr = Buffer.from(D)
    else if (T === 'IDAT') id.push(Buffer.from(D))
    else if (T === 'IEND') break
    o += 12 + L
  }
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct]
  const raw = zlib.inflateSync(Buffer.concat(id))
  const st = w * ch
  const out = Buffer.alloc(h * st)
  let pv = Buffer.alloc(st)
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (st + 1)]
    const cu = Buffer.from(raw.subarray(y * (st + 1) + 1, y * (st + 1) + 1 + st))
    for (let x = 0; x < st; x++) {
      const a = x >= ch ? cu[x - ch] : 0, b = pv[x], c = x >= ch ? pv[x - ch] : 0
      let v = cu[x]
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1
      else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c) }
      cu[x] = v & 255
    }
    cu.copy(out, y * st); pv = cu
  }
  const rg = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const s = i * ch, d2 = i * 4
    if (ch === 4) { rg[d2] = out[s]; rg[d2 + 1] = out[s + 1]; rg[d2 + 2] = out[s + 2]; rg[d2 + 3] = out[s + 3] }
    else if (ch === 3) { const pi = out[s]; rg[d2] = pl[pi * 3]; rg[d2 + 1] = pl[pi * 3 + 1]; rg[d2 + 2] = pl[pi * 3 + 2]; rg[d2 + 3] = tr && pi < tr.length ? tr[pi] : 255 }
    else if (ch === 2) { rg[d2] = out[s]; rg[d2 + 1] = out[s + 1]; rg[d2 + 2] = out[s + 2]; rg[d2 + 3] = 255 }
    else { rg[d2] = rg[d2 + 1] = rg[d2 + 2] = out[s]; rg[d2 + 3] = ch === 4 ? out[s + 1] : 255 }
  }
  return { w, h, data: rg }
}
function bbox(rgba, w, h, th = 8) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgba[(y * w + x) * 4 + 3] > th) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}
// 直通 alpha 盒式降采样
function shrink(rgba, sw, sh, sx, sy, cw, chh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4)
  const xr = cw / dw, yr = chh / dh
  for (let y = 0; y < dh; y++) {
    const iy0 = Math.floor(sy + y * yr), iy1 = Math.min(sh, Math.ceil(sy + (y + 1) * yr))
    for (let x = 0; x < dw; x++) {
      const ix0 = Math.floor(sx + x * xr), ix1 = Math.min(sw, Math.ceil(sx + (x + 1) * xr))
      let r = 0, g = 0, b = 0, a = 0, n = 0, ws = 0
      for (let yy = iy0; yy < iy1; yy++) for (let xx = ix0; xx < ix1; xx++) {
        const i = (yy * sw + xx) * 4, al = rgba[i + 3]
        if (al > 16) { r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; ws++ }
        a += al; n++
      }
      const o = (y * dw + x) * 4
      if (!n || a === 0) { out[o + 3] = 0; continue }
      if (!ws) { out[o + 3] = Math.round(a / n); continue }
      out[o] = Math.round(r / ws); out[o + 1] = Math.round(g / ws); out[o + 2] = Math.round(b / ws)
      out[o + 3] = Math.round(a / n)
    }
  }
  return out
}
let CRC = null
function crc32(buf) {
  if (!CRC) { CRC = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c } }
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(t, d) {
  const L = Buffer.alloc(4); L.writeUInt32BE(d.length)
  const td = Buffer.concat([Buffer.from(t, 'ascii'), d])
  const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(td))
  return Buffer.concat([L, td, cr])
}
function enc(w, h, rgba) {
  const st = w * 4
  const raw = Buffer.alloc(h * (st + 1))
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (st + 1) + 1, y * st, y * st + st)
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ])
}
function findDir(d, name) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    const p = path.join(d, e.name)
    if (e.name === name) return p
    const r = findDir(p, name); if (r) return r
  }
  return null
}

const ROOT = process.argv[2]
const ACTION = process.argv[3]
const OUT = process.argv[4]
const CELL = Number(process.argv[5] || 120)
const LIMIT = Number(process.argv[6] || 12)

const dir = findDir(path.join(ROOT, 'assets', 'sprites'), ACTION)
const files = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort().slice(0, LIMIT)

// 统一画布 = 所有帧包围盒的最大值，按 CELL 宽缩放
const imgs = files.map((f) => dec(fs.readFileSync(path.join(dir, f))))
const boxes = imgs.map((im) => bbox(im.data, im.w, im.h))
const maxW = Math.max(...boxes.map((b) => b.w))
const maxH = Math.max(...boxes.map((b) => b.h))
const k = CELL / maxW
const fw = CELL, fh = Math.round(maxH * k)
const COLS = 6
const rows = Math.ceil(imgs.length / COLS)
const W = COLS * fw, H = rows * fh
const canvas = Buffer.alloc(W * H * 4)
for (let i = 0; i < W * H; i++) { canvas[i * 4] = 24; canvas[i * 4 + 1] = 26; canvas[i * 4 + 2] = 34; canvas[i * 4 + 3] = 255 }

imgs.forEach((im, i) => {
  const b = boxes[i]
  const sw = Math.max(1, Math.round(b.w * k)), sh = Math.max(1, Math.round(b.h * k))
  const small = shrink(im.data, im.w, im.h, b.x0, b.y0, b.w, b.h, sw, sh)
  const cx = (i % COLS) * fw, cy = Math.floor(i / COLS) * fh
  const ox = Math.round((fw - sw) / 2), oy = fh - sh
  for (let y = 0; y < sh; y++) {
    const dy = cy + oy + y
    if (dy < 0 || dy >= H) continue
    small.copy(canvas, (dy * W + cx + ox) * 4, y * sw * 4, y * sw * 4 + sw * 4)
  }
})
fs.writeFileSync(OUT, enc(W, H, canvas))
console.log(`源帧预览: ${OUT}  ${W}x${H}  每格 ${fw}x${fh}  ${imgs.length} 帧`)
console.log(`  最大包围盒 ${maxW}x${maxH}，缩放比 ${k.toFixed(3)}`)
