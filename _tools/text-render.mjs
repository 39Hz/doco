// 文字渲染：用 48px 母版字形图集 + 面积平均降采样，把 canvas 的 fillText/strokeText
// 变成真实的像素输出。这样无头截图里的中文是可读的，才能看出画面问题。
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const GLYPH_DIR = path.join(path.resolve('.'), '_tools', 'glyphs')

export function loadGlyphAtlas() {
  const idxPath = path.join(GLYPH_DIR, 'index.json')
  if (!existsSync(idxPath)) throw new Error('缺少字形图集，请先运行 _tools/gen-glyphs-prep.mjs + _shell 渲染 + gen-glyphs-post.mjs')
  const idx = JSON.parse(readFileSync(idxPath, 'utf8'))
  const atlases = {}
  for (const [id, a] of Object.entries(idx.atlas)) {
    const p = path.join(GLYPH_DIR, a.file)
    const buf = readFileSync(p)
    atlases[id] = { w: a.w, h: a.h, data: new Uint8Array(buf.buffer, buf.byteOffset, buf.length) }
  }
  return { idx, atlases, base: Number(Object.keys(idx.atlas).map((s) => Number(s.split('_')[0]))[0]) }
}

// 解析 "bold 14px ..." / "14px sans-serif" → { size, bold, italic }
function parseFont(font) {
  const m = String(font).match(/(\d+(?:\.\d+)?)px/)
  const size = m ? parseFloat(m[1]) : 16
  const bold = /bold|(?:^|\s)[6-9]00(?:\s|$)/.test(String(font))
  const italic = /italic|oblique/.test(String(font))
  return { size, bold, italic }
}

// 面积平均降采样：从母版里取 srcW×srcH 区域，缩放到 dstW×dstH
function resample(src, srcX, srcY, srcW, srcH, dstW, dstH) {
  const out = new Uint8Array(Math.max(1, dstW) * Math.max(1, dstH) * 4)
  if (dstW <= 0 || dstH <= 0) return out
  for (let y = 0; y < dstH; y++) {
    const sy0 = srcY + (y * srcH) / dstH
    const sy1 = srcY + ((y + 1) * srcH) / dstH
    const iy0 = Math.floor(sy0), iy1 = Math.min(src.h, Math.ceil(sy1))
    for (let x = 0; x < dstW; x++) {
      const sx0 = srcX + (x * srcW) / dstW
      const sx1 = srcX + ((x + 1) * srcW) / dstW
      const ix0 = Math.floor(sx0), ix1 = Math.min(src.w, Math.ceil(sx1))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let iy = iy0; iy < iy1; iy++) {
        if (iy < 0 || iy >= src.h) continue
        for (let ix = ix0; ix < ix1; ix++) {
          if (ix < 0 || ix >= src.w) continue
          const i = (iy * src.w + ix) * 4
          // 预乘 alpha 再平均，避免边缘出现黑边
          const al = src.data[i + 3] / 255
          r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al; a += al
          n++
        }
      }
      if (!n) continue
      const o = (y * dstW + x) * 4
      const aa = a / n
      if (aa <= 0) continue
      out[o] = Math.round(r / n / aa)
      out[o + 1] = Math.round(g / n / aa)
      out[o + 2] = Math.round(b / n / aa)
      out[o + 3] = Math.round(aa * 255)
    }
  }
  return out
}

export class TextRenderer {
  constructor(loaded) {
    this.loaded = loaded
    this.base = loaded.base
    this.cache = new Map()          // key -> { w, h, px }  已缩放的字形
    this._widthCache = new Map()
  }
  _pick(bold) {
    const styles = this.loaded.idx.sizes[this.base]
    return styles[bold ? 'bold' : 'regular'] || styles.regular
  }
  // 基准线偏移：用 'H' 字形的 ink top 估算
  ascent(size, bold) {
    const key = 'asc' + size + (bold ? 'b' : '')
    if (this._widthCache.has(key)) return this._widthCache.get(key)
    const set = this._pick(bold)
    const g = set.glyphs[72] || set.glyphs[65] || set.glyphs[48]
    const scale = size / this.base
    const v = g && !g.empty ? (g.by + g.h * 0.0) * scale : size * 0.8
    // 中文字形顶到格子上沿，用 h 的 82% 作为 ascent 更接近浏览器
    const adv = g && !g.empty ? (g.by + g.h) * scale : size
    this._widthCache.set(key, adv * 0.86)
    return v
  }
  _glyph(code, size, bold) {
    const key = code + '_' + size + '_' + (bold ? 1 : 0)
    if (this.cache.has(key)) return this.cache.get(key)
    const set = this._pick(bold)
    const g = set.glyphs[code]
    if (!g || g.empty) { this.cache.set(key, null); return null }
    const scale = size / this.base
    const dstW = Math.max(1, Math.round(g.w * scale))
    const dstH = Math.max(1, Math.round(g.h * scale))
    const atlas = this.loaded.atlases[set.atlas]
    const px = resample(atlas, g.x, g.y, g.w, g.h, dstW, dstH)
    const out = { w: dstW, h: dstH, bx: g.bx * scale, by: g.by * scale, adv: g.adv * scale, px }
    this.cache.set(key, out)
    return out
  }
  measure(str, font) {
    const { size, bold } = parseFont(font)
    const key = str + '|' + size + (bold ? 'b' : '')
    if (this._widthCache.has(key)) return this._widthCache.get(key)
    let w = 0
    for (const ch of str) {
      const g = this._glyph(ch.codePointAt(0), size, bold)
      w += g ? g.adv : size * 0.5
    }
    this._widthCache.set(key, w)
    return w
  }
  // 把文字画到 ctx 上（ctx 是 PixelCtx）
  draw(ctx, str, x, y, color, alpha, font, align, baseline, maxW) {
    const { size, bold } = parseFont(font)
    let total = 0
    const items = []
    for (const ch of str) {
      const g = this._glyph(ch.codePointAt(0), size, bold)
      items.push({ g, code: ch.codePointAt(0) })
      total += g ? g.adv : size * 0.5
    }
    if (total <= 0) return
    let sx = x
    if (align === 'center') sx = x - total / 2
    else if (align === 'right' || align === 'end') sx = x - total
    // 基线：canvas 的默认 alphabetic/中文字形底边；游戏里 main 用 alphabetic + top 混用
    let baseOff
    if (baseline === 'top') baseOff = 0
    else if (baseline === 'middle') baseOff = -size * 0.35
    else if (baseline === 'bottom') baseOff = -size * 0.9
    else baseOff = -size * 0.82          // alphabetic
    const scaleW = maxW && total > maxW ? maxW / total : 1
    let cx = sx
    // 记录文字包围盒，供后续检查"文字溢出画面"
    if (ctx._textBoxes) {
      ctx._textBoxes.push({ str, x: sx, y: y + baseOff, w: total * scaleW, h: size, size, color })
    }
    for (const { g } of items) {
      if (!g) { cx += size * 0.5 * scaleW; continue }
      const gw = Math.max(1, Math.round(g.w * scaleW))
      const gx = cx + g.bx * scaleW
      const gy = y + baseOff + g.by
      this._blit(ctx, g.px, gw, g.h, gx, gy, color, alpha)
      cx += g.adv * scaleW
    }
  }
  _blit(ctx, px, w, h, x0, y0, color, alpha) {
    const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h))
    const xi = Math.round(x0), yi = Math.round(y0)
    const ga = alpha === undefined ? 1 : alpha
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        const a = (px[i + 3] / 255) * ga
        if (a <= 0.004) continue
        // 文字用纯色（浏览器里也是这样），只是按覆盖度混合
        ctx._blend(xi + x, yi + y, color[0], color[1], color[2], a)
      }
    }
  }
}
