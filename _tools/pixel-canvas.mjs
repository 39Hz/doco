// 像素级 Canvas：给无头测试台的假 canvas 加一块真正的帧缓冲，
// 把游戏里的绘制调用光栅化成像素，再编码成 PNG —— 这样我才能"看到"画面。
//
// 支持范围（按游戏实际用到的调用裁剪）：
//   矩形 / 圆 / 椭圆 / 多边形路径（填充与描边）、变换矩阵、裁剪、
//   线性与径向渐变、drawImage（含 9 参数版本）、globalAlpha、
//   文字（用 _tools/glyph-atlas 生成的字形图集，见 text.js）
import zlib from 'node:zlib'

// ================= PNG 解码 =================
export function decodePng(buf) {
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
  if (bitDepth !== 8) throw new Error('bitDepth ' + bitDepth + ' unsupported')
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  if (!ch) throw new Error('colorType ' + colorType)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = Buffer.alloc(h * stride)

  // 行反滤波（PNG filter type 0~4）。返回处理完的一行。
  function unfilter(cur, prev, ft) {
    for (let x = 0; x < cur.length; x++) {
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
    return cur
  }

  if (!interlace) {
    let prev = Buffer.alloc(stride)
    for (let y = 0; y < h; y++) {
      const ft = raw[y * (stride + 1)]
      const cur = unfilter(Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)), prev, ft)
      cur.copy(out, y * stride); prev = cur
    }
  } else {
    // Adam7 隔行：分 7 趟，每趟是独立的小图。
    // 归档里好几张图集（消费道具、items_icon）都是隔行的，
    // 早先这里直接抛错，导致这些素材完全用不了。
    const PASSES = [
      [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4],
      [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
    ]
    let off = 0
    for (const [xoff, yoff, xstep, ystep] of PASSES) {
      const pw = Math.ceil((w - xoff) / xstep)
      const ph = Math.ceil((h - yoff) / ystep)
      if (pw <= 0 || ph <= 0) continue
      const pstride = pw * ch
      let prev = Buffer.alloc(pstride)
      for (let py = 0; py < ph; py++) {
        const ft = raw[off]
        const cur = unfilter(Buffer.from(raw.subarray(off + 1, off + 1 + pstride)), prev, ft)
        off += 1 + pstride
        prev = cur
        const y = yoff + py * ystep
        for (let px = 0; px < pw; px++) {
          const x = xoff + px * xstep
          cur.copy(out, y * stride + x * ch, px * ch, px * ch + ch)
        }
      }
    }
  }
  const data = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const s = i * ch, d = i * 4
    // 注意：这里必须按 **colorType** 分支，不能按 ch（通道数）。
    // 索引色的 ch 也是 1，早先误写成 `ch === 3`，于是索引色图片全走了灰度分支，
    // 把调色板索引当成了亮度值 —— 表现就是所有精灵图变成黑乎乎的剪影。
    if (colorType === 6 || colorType === 4) {
      data[d] = out[s]; data[d + 1] = out[s + 1]; data[d + 2] = out[s + 2]; data[d + 3] = out[s + 3]
    } else if (colorType === 3) {
      const pi = out[s]
      data[d] = palette[pi * 3]; data[d + 1] = palette[pi * 3 + 1]; data[d + 2] = palette[pi * 3 + 2]
      data[d + 3] = trns && pi < trns.length ? trns[pi] : 255
    } else if (colorType === 2) {
      data[d] = out[s]; data[d + 1] = out[s + 1]; data[d + 2] = out[s + 2]; data[d + 3] = 255
    } else if (colorType === 0) {
      data[d] = data[d + 1] = data[d + 2] = out[s]; data[d + 3] = 255
    } else {
      data[d] = data[d + 1] = data[d + 2] = out[s]; data[d + 3] = out[s + 1]
    }
  }
  return { w, h, data }
}

// ================= PNG 编码（真彩色 + alpha）=================
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
export function encodePng(w, h, rgba) {
  const raw = Buffer.alloc(h * (w * 4 + 1))
  // ⚠️ 源长度必须是**一行**的字节数 `w * 4`，不是整张图的 `w * h * 4`。
  // 【第 51 轮修掉的真 bug】原来写的是 `w * h * 4`：源范围给了 [y*w*4, (y+1)*w*4)（只占前 1/h），
  //   而 `Buffer.copy` 会**一直拷到源耗尽或目标写满** —— 于是每行都往后多写，
  //   整张图**逐字节错位**（实测：源像素 242,166,18,255 出来变成 18,255,242,166，
  //   于是橙色人物被画成了青色）。所有用这个编码器写出来的图都受影响。
  const src = Buffer.from(rgba.buffer || rgba, rgba.byteOffset || 0, w * h * 4)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0                                  // filter: None
    src.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6                                   // 8bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ================= 颜色解析 =================
const NAMED = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0],
  blue: [0, 0, 255], yellow: [255, 255, 0], gray: [128, 128, 128], grey: [128, 128, 128],
  transparent: [0, 0, 0, 0], orange: [255, 165, 0], purple: [128, 0, 128], cyan: [0, 255, 255],
  magenta: [255, 0, 255], silver: [192, 192, 192], maroon: [128, 0, 0], navy: [0, 0, 128],
  lime: [0, 255, 0], teal: [0, 128, 128], olive: [128, 128, 0], aqua: [0, 255, 255],
  fuchsia: [255, 0, 255],
}
export function parseColor(s) {
  if (!s) return [0, 0, 0, 255]
  if (typeof s !== 'string') {
    if (s._rgba) return s._rgba
    return [0, 0, 0, 255]
  }
  s = s.trim()
  if (s[0] === '#') {
    const hex = s.slice(1)
    if (hex.length === 3) return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16), 255]
    if (hex.length === 6) return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 255]
    if (hex.length === 8) return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), parseInt(hex.slice(6, 8), 16)]
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/)
  if (m) {
    const p = m[1].split(',').map((v) => parseFloat(v))
    return [p[0] | 0, p[1] | 0, p[2] | 0, p.length > 3 ? Math.round(p[3] * 255) : 255]
  }
  if (NAMED[s.toLowerCase()]) return [...NAMED[s.toLowerCase()], 255]
  return [0, 0, 0, 255]
}

// ================= 渐变 =================
class Gradient {
  constructor(kind, args) { this.kind = kind; this.args = args; this.stops = [] }
  addColorStop(t, c) { this.stops.push([t, parseColor(c)]); this.stops.sort((a, b) => a[0] - b[0]) }
  colorAt(t) {
    const s = this.stops
    if (!s.length) return [0, 0, 0, 255]
    if (t <= s[0][0]) return s[0][1]
    if (t >= s[s.length - 1][0]) return s[s.length - 1][1]
    for (let i = 1; i < s.length; i++) {
      if (t <= s[i][0]) {
        const [t0, c0] = s[i - 1], [t1, c1] = s[i]
        const k = t1 === t0 ? 0 : (t - t0) / (t1 - t0)
        return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k, c0[3] + (c1[3] - c0[3]) * k]
      }
    }
    return s[s.length - 1][1]
  }
}

// ================= 变换 =================
const mul = (a, b) => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
]
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

// ================= 画布 Context =================
export class PixelCtx {
  constructor(cvs) {
    this.canvas = cvs
    this.W = cvs.width; this.H = cvs.height
    this.buf = cvs._fb
    this.m = [1, 0, 0, 1, 0, 0]
    this._stack = []
    this.calls = Object.create(null)
    this.font = '16px sans-serif'
    this.textAlign = 'left'; this.textBaseline = 'alphabetic'
    this.lineWidth = 1; this.lineJoin = 'miter'; this.lineCap = 'butt'
    this._dash = []
    this.strokeStyle = '#000'; this.fillStyle = '#000'
    this.globalAlpha = 1
    this._path = []
    this._clip = null
    this.textRenderer = cvs._textRenderer || null
    this.onCall = cvs._onCall || null
    this._t = [1, 0, 0, 1, 0, 0]        // 文字变换（需要临时复位以便位图对齐）
  }
  _c(n, a) { this.calls[n] = (this.calls[n] || 0) + 1; if (this.onCall) this.onCall(n, a) }
  save() { this._c('save'); this._stack.push([this.m.slice(), this.fillStyle, this.strokeStyle, this.lineWidth, this.globalAlpha, this.font, this.textAlign, this.textBaseline, this._clip]) }
  restore() {
    this._c('restore')
    const s = this._stack.pop(); if (!s) return
    this.m = s[0]; this.fillStyle = s[1]; this.strokeStyle = s[2]; this.lineWidth = s[3]
    this.globalAlpha = s[4]; this.font = s[5]; this.textAlign = s[6]; this.textBaseline = s[7]; this._clip = s[8]
  }
  translate(x, y) { this._c('translate'); this.m = mul(this.m, [1, 0, 0, 1, x, y]) }
  scale(x, y) { this._c('scale'); this.m = mul(this.m, [x, 0, 0, y, 0, 0]) }
  rotate(a) { this._c('rotate'); const c = Math.cos(a), s = Math.sin(a); this.m = mul(this.m, [c, s, -s, c, 0, 0]) }
  setTransform(a, b, c, d, e, f) { this._c('setTransform'); this.m = [a, b, c, d, e, f] }
  // 虚线的"记录版"实现：只记住设置，画出来仍是实线。
  // 为什么不做真正的虚线：这个渲染器是给**截图核对**用的，虚线会让人分不清
  // "线真的画出来了"和"只是缝太密"。游戏里凡是需要"虚线观感"的地方都改成实线+图形表达
  //（第 44 轮「飞翔的衣服」的网子就是这么画的）。这里提供方法是为了别让绘制直接抛异常。
  setLineDash(a) { this._c('setLineDash'); this._dash = Array.isArray(a) ? a.slice() : [] }
  getLineDash() { return this._dash.slice() }
  resetTransform() { this.m = [1, 0, 0, 1, 0, 0] }
  getTransform() { const m = this.m; return { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] } }

  beginPath() { this._c('beginPath'); this._path = [] }
  closePath() { this._c('closePath'); if (this._path.length) this._path.push(['close']) }
  moveTo(x, y) { this._c('moveTo'); this._path.push(['move', ...apply(this.m, x, y)]) }
  lineTo(x, y) { this._c('lineTo'); this._path.push(['line', ...apply(this.m, x, y)]) }
  rect(x, y, w, h) {
    this._c('rect')
    const p = [apply(this.m, x, y), apply(this.m, x + w, y), apply(this.m, x + w, y + h), apply(this.m, x, y + h)]
    this._path.push(['move', ...p[0]], ['line', ...p[1]], ['line', ...p[2]], ['line', ...p[3]], ['close'])
  }
  arc(cx, cy, r, a0 = 0, a1 = Math.PI * 2, ccw = false) {
    this._c('arc')
    // 用折线近似（每 5 度一段）
    let span = a1 - a0
    if (!ccw && span < 0) span += Math.PI * 2
    if (ccw && span > 0) span -= Math.PI * 2
    const steps = Math.max(8, Math.ceil(Math.abs(span) / (Math.PI / 36)))
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (span * i) / steps
      const p = apply(this.m, cx + Math.cos(a) * r, cy + Math.sin(a) * r)
      this._path.push([i === 0 ? 'move' : 'line', ...p])
    }
  }
  ellipse(cx, cy, rx, ry, rot = 0, a0 = 0, a1 = Math.PI * 2, ccw = false) {
    this._c('ellipse')
    let span = a1 - a0
    if (!ccw && span < 0) span += Math.PI * 2
    const steps = Math.max(12, Math.ceil(Math.abs(span) / (Math.PI / 36)))
    const cr = Math.cos(rot), sr = Math.sin(rot)
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (span * i) / steps
      const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry
      const p = apply(this.m, cx + ex * cr - ey * sr, cy + ex * sr + ey * cr)
      this._path.push([i === 0 ? 'move' : 'line', ...p])
    }
  }
  clip() {
    this._c('clip')
    const poly = this._path.filter((s) => s[0] === 'move' || s[0] === 'line').map((s) => [s[1], s[2]])
    if (poly.length >= 3) this._clip = { poly, prev: this._clip }
  }
  fill() { this._c('fill'); this._fillPoly(this._path.filter((s) => s[0] !== 'close').map((s) => [s[1], s[2]]), this.fillStyle) }
  stroke() { this._c('stroke'); this._strokePoly(this._path, this.strokeStyle, this.lineWidth) }

  fillRect(x, y, w, h) {
    this._c('fillRect')
    const p = [apply(this.m, x, y), apply(this.m, x + w, y), apply(this.m, x + w, y + h), apply(this.m, x, y + h)]
    this._fillPoly(p, this.fillStyle)
  }
  strokeRect(x, y, w, h) {
    this._c('strokeRect')
    const c = [apply(this.m, x, y), apply(this.m, x + w, y), apply(this.m, x + w, y + h), apply(this.m, x, y + h)]
    this._strokePoly([['move', ...c[0]], ['line', ...c[1]], ['line', ...c[2]], ['line', ...c[3]], ['close']], this.strokeStyle, this.lineWidth)
  }
  clearRect(x, y, w, h) {
    this._c('clearRect')
    const sv = this.fillStyle
    this.fillStyle = 'rgba(0,0,0,0)'
    this.fillRect(x, y, w, h)
    this.fillStyle = sv
  }
  createLinearGradient(x0, y0, x1, y1) { return new Gradient('linear', [x0, y0, x1, y1]) }
  createRadialGradient(x0, y0, r0, x1, y1, r1) { return new Gradient('radial', [x0, y0, r0, x1, y1, r1]) }
  measureText(s) {
    if (this.textRenderer) return { width: this.textRenderer.measure(String(s), this.font) }
    return { width: String(s).length * 8 }
  }
  fillText(s, x, y, maxW) { this._c('fillText'); this._text(s, x, y, this.fillStyle, null, maxW) }
  strokeText(s, x, y, maxW) { this._c('strokeText'); this._text(s, x, y, this.strokeStyle, this.strokeStyle, maxW) }

  _text(s, x, y, color, _ignored, maxW) {
    if (!this.textRenderer) return
    const col = parseColor(color)
    this.textRenderer.draw(this, String(s), x, y, col, this.globalAlpha, this.font, this.textAlign, this.textBaseline, maxW)
  }

  // ---------- 光栅化基元 ----------
  _blend(x, y, r, g, b, a) {
    // 注意 a 是 0~1 的**比例**（调用方负责除以 255）。
    // 早先这里写成 `buf[i] = (r*a + buf[i]*da*(1-a)) / oa` 而 a 传的是 0~255 的原始 alpha，
    // 于是半透明像素的 r/g/b 被放大 182 倍，再写回 Uint8Array 时按位截断成 0 —— 整个角色变黑。
    if (a <= 0) return
    x |= 0; y |= 0
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return
    if (this._clip && !this._inClip(x + 0.5, y + 0.5)) return
    const i = (y * this.W + x) * 4
    const buf = this.buf
    if (a >= 1) { buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255; return }
    const da = buf[i + 3] / 255
    const oa = a + da * (1 - a)
    if (oa <= 0) { buf[i + 3] = 0; return }
    buf[i] = (r * a + buf[i] * da * (1 - a)) / oa
    buf[i + 1] = (g * a + buf[i + 1] * da * (1 - a)) / oa
    buf[i + 2] = (b * a + buf[i + 2] * da * (1 - a)) / oa
    buf[i + 3] = oa * 255
  }
  _inClip(px, py) {
    let c = this._clip
    while (c) {
      if (!pointInPoly(px, py, c.poly)) return false
      c = c.prev
    }
    return true
  }
  _paintAt(x, y, style) {
    let col
    if (style instanceof Gradient) {
      const [a, b, c, d, e, f] = style.kind === 'linear' ? style.args : [style.args[0], style.args[1], style.args[3], style.args[4], 0, 0]
      let t
      if (style.kind === 'linear') {
        const dx = c - a, dy = d - b
        const len2 = dx * dx + dy * dy || 1
        t = ((x - a) * dx + (y - b) * dy) / len2
      } else {
        const dist = Math.hypot(x - a, y - b)
        const r0 = style.args[2], r1 = style.args[5]
        t = (dist - r0) / ((r1 - r0) || 1)
      }
      col = style.colorAt(Math.max(0, Math.min(1, t)))
    } else col = parseColor(style)
    const ga = this.globalAlpha
    this._blend(x, y, col[0], col[1], col[2], (col[3] / 255) * ga)
  }
  _fillPoly(pts, style) {
    const poly = pts.map((p) => Array.isArray(p) ? p : [p.x, p.y])
    if (poly.length < 3) {
      if (poly.length === 2) this._strokePoly([['move', ...poly[0]], ['line', ...poly[1]]], style, this.lineWidth)
      return
    }
    let minY = Infinity, maxY = -Infinity
    for (const p of poly) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1] }
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(this.H - 1, Math.ceil(maxY))
    const xs = []
    for (let y = y0; y <= y1; y++) {
      xs.length = 0
      const cy = y + 0.5
      for (let i = 0, n = poly.length; i < n; i++) {
        const a = poly[i], b = poly[(i + 1) % n]
        if ((a[1] <= cy && b[1] > cy) || (b[1] <= cy && a[1] > cy)) {
          xs.push(a[0] + ((cy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]))
        }
      }
      if (xs.length < 2) continue
      xs.sort((p, q) => p - q)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.round(xs[k])), xb = Math.min(this.W - 1, Math.round(xs[k + 1]) - 1)
        for (let x = xa; x <= xb; x++) this._paintAt(x, y, style)
      }
    }
  }
  _strokePoly(segs, style, lw) {
    let cur = null
    const pts = []
    const flush = () => { if (pts.length > 1) this._strokeLine(pts, style, lw); pts.length = 0 }
    for (const s of segs) {
      if (s[0] === 'move') { flush(); pts.push([s[1], s[2]]) }
      else if (s[0] === 'line') pts.push([s[1], s[2]])
      else if (s[0] === 'close') { if (pts.length) { pts.push(pts[0]); flush() } }
    }
    flush()
  }
  _strokeLine(pts, style, lw) {
    const w = Math.max(1, lw * Math.abs(this.m[0]) || lw)
    const half = w / 2
    for (let i = 0; i + 1 < pts.length; i++) {
      let [x0, y0] = pts[i], [x1, y1] = pts[i + 1]
      const dx = x1 - x0, dy = y1 - y0
      const len = Math.hypot(dx, dy)
      if (len < 0.01) continue
      const nx = -dy / len * half, ny = dx / len * half
      this._fillPoly([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], style)
    }
    // 方头连接：在每个折点补一个小方块，避免拐角缺口
    if (w > 2) {
      for (const [px, py] of pts) {
        this._fillPoly([[px - half, py - half], [px + half, py - half], [px + half, py + half], [px - half, py + half]], style)
      }
    }
  }

  // ---------- drawImage ----------
  drawImage(img, ...a) {
    this._c('drawImage')
    if (!img || !img._pixels) return
    const src = img._pixels
    let sx = 0, sy = 0, sw = src.w, sh = src.h, dx, dy, dw, dh
    if (a.length === 2) { dx = a[0]; dy = a[1]; dw = src.w; dh = src.h }
    else if (a.length === 4) { dx = a[0]; dy = a[1]; dw = a[2]; dh = a[3] }
    else { sx = a[0]; sy = a[1]; sw = a[2]; sh = a[3]; dx = a[4]; dy = a[5]; dw = a[6]; dh = a[7] }
    if (dw === 0 || dh === 0 || sw === 0 || sh === 0) return
    // 变换后的四个角 → 用两段仿射近似（这里只处理轴对齐或小角度，游戏里都是轴对齐）
    const c0 = apply(this.m, dx, dy), c1 = apply(this.m, dx + dw, dy)
    const c2 = apply(this.m, dx + dw, dy + dh), c3 = apply(this.m, dx, dy + dh)
    const x0 = Math.min(c0[0], c1[0], c2[0], c3[0]), x1 = Math.max(c0[0], c1[0], c2[0], c3[0])
    const y0 = Math.min(c0[1], c1[1], c2[1], c3[1]), y1 = Math.max(c0[1], c1[1], c2[1], c3[1])
    const outW = x1 - x0, outH = y1 - y0
    if (outW <= 0 || outH <= 0) return
    const rot = Math.abs(c1[1] - c0[1]) > 0.5 || Math.abs(c3[0] - c0[0]) > 0.5
    const ga = this.globalAlpha
    if (!rot) {
      // 轴对齐：整数最近邻采样。
      // 说明：早先用的是"面积平均"（每输出像素遍历源矩形），观感更好但慢 20 倍 ——
      // 一个 320×320 的精灵缩到 170 要算 9 万次内层循环，整屏角色一多就卡到截图超时。
      // 现在的做法是：缩小时按步长抽样，放大时复制。对 2~4 倍的缩放，肉眼几乎无差别。
      const stepX = sw / outW, stepY = sh / outH
      for (let oy = Math.max(0, Math.floor(y0)); oy < Math.min(this.H, Math.ceil(y1)); oy++) {
        const syy = sy + Math.min(sh - 1, Math.floor((oy + 0.5 - y0) * stepY)) | 0
        const rowOff = (syy | 0) * src.w
        const di = oy * this.W
        for (let ox = Math.max(0, Math.floor(x0)); ox < Math.min(this.W, Math.ceil(x1)); ox++) {
          const sxx = sx + Math.min(sw - 1, Math.floor((ox + 0.5 - x0) * stepX)) | 0
          const i = (rowOff + (sxx | 0)) * 4
          const al = src.data[i + 3]
          if (al === 0) continue
          this._blend(ox, oy, src.data[i], src.data[i + 1], src.data[i + 2], (al / 255) * ga)
        }
      }
    } else {
      // 有旋转：逐输出像素反算源坐标
      const det = (c1[0] - c0[0]) * (c3[1] - c0[1]) - (c3[0] - c0[0]) * (c1[1] - c0[1])
      if (Math.abs(det) < 1e-6) return
      for (let oy = Math.max(0, Math.floor(y0)); oy < Math.min(this.H, Math.ceil(y1)); oy++) {
        for (let ox = Math.max(0, Math.floor(x0)); ox < Math.min(this.W, Math.ceil(x1)); ox++) {
          const rx = ox + 0.5 - c0[0], ry = oy + 0.5 - c0[1]
          const u = (rx * (c3[1] - c0[1]) - (c3[0] - c0[0]) * ry) / det
          const v = ((c1[0] - c0[0]) * ry - rx * (c1[1] - c0[1])) / det
          if (u < 0 || u >= 1 || v < 0 || v >= 1) continue
          const sxx = (sx + u * sw) | 0, syy = (sy + v * sh) | 0
          const i = (syy * src.w + sxx) * 4
          if (!src.data[i + 3]) continue
          this._blend(ox, oy, src.data[i], src.data[i + 1], src.data[i + 2], (src.data[i + 3] / 255) * ga)
        }
      }
    }
  }

  getImageData(x, y, w, h) {
    const out = new Uint8ClampedArray(w * h * 4)
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const sx = x + xx, sy = y + yy
        if (sx < 0 || sy < 0 || sx >= this.W || sy >= this.H) continue
        const i = (sy * this.W + sx) * 4, o = (yy * w + xx) * 4
        out[o] = this.buf[i]; out[o + 1] = this.buf[i + 1]; out[o + 2] = this.buf[i + 2]; out[o + 3] = this.buf[i + 3]
      }
    }
    return { data: out, width: w, height: h }
  }
}

function pointInPoly(px, py, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function makeFramebuffer(w, h) {
  const b = new Uint8Array(w * h * 4)
  for (let i = 3; i < b.length; i += 4) b[i] = 255
  return b
}
