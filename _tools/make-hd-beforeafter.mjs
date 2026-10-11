// 生成"改前 vs 改后"并排效果图（给用户看成品）
//
// 左 = 改前（`_tmp_test_out/art-before-sr/`，官方源直出的小图）
// 右 = 改后（`assets/forms/art/` 当前在用的图）
// 两边都按**同一显示高度**渲染，这样"清晰度差别"才是公平对比。
//
// 用法: node _tools/make-hd-beforeafter.mjs 龙多比 毒多比 正义多比 [输出名]
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const BEFORE = path.join(ROOT, '_tmp_test_out', 'art-before-sr')
const AFTER = path.join(ROOT, 'assets', 'forms', 'art')
const OUT = path.join(ROOT, 'docs', 'shots', process.argv[process.argv.length - 1].endsWith('.png')
  ? process.argv[process.argv.length - 1] : 'hd-before-after.png')
const FORMS = process.argv.slice(2).filter((a) => !a.endsWith('.png'))
const SHOW_H = 460

const bbox = (img) => {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.data[(y * img.w + x) * 4 + 3] > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
  return x1 < 0 ? { x0: 0, y0: 0, x1: img.w - 1, y1: img.h - 1 } : { x0, y0, x1, y1 }
}
const crop = (img, b) => {
  const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((b.y0 + y) * img.w + (b.x0 + x)) * 4, d = (y * w + x) * 4
    out[d] = img.data[s]; out[d + 1] = img.data[s + 1]; out[d + 2] = img.data[s + 2]; out[d + 3] = img.data[s + 3]
  }
  return { w, h, data: out }
}
// 面积平均（alpha 加权）—— 与生成器同一套，避免透明边发黑
const fit = (img, dstH) => {
  const sc = dstH / img.h, dw = Math.max(1, Math.round(img.w * sc)), dh = dstH
  const out = new Uint8ClampedArray(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const sy0 = Math.floor(y / sc), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) / sc))
    for (let x = 0; x < dw; x++) {
      const sx0 = Math.floor(x / sc), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) / sc))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let sy = sy0; sy < sy1 && sy < img.h; sy++) for (let sx = sx0; sx < sx1 && sx < img.w; sx++) {
        const i = (sy * img.w + sx) * 4, al = img.data[i + 3] / 255
        r += img.data[i] * al; g += img.data[i + 1] * al; b += img.data[i + 2] * al
        a += img.data[i + 3]; n++
      }
      if (!n) continue
      const ws = a / 255 || 1, o = (y * dw + x) * 4
      out[o] = r / ws; out[o + 1] = g / ws; out[o + 2] = b / ws; out[o + 3] = a / n
    }
  }
  return { w: dw, h: dh, data: out }
}
const sharpness = (img) => {
  const lum = (i) => 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
  let s = 0, s2 = 0, n = 0
  for (let y = 1; y < img.h - 1; y++) for (let x = 1; x < img.w - 1; x++) {
    const i = (y * img.w + x) * 4
    if (img.data[i + 3] < 200) continue
    const v = 4 * lum(i) - lum(i - 4) - lum(i + 4) - lum(i - img.w * 4) - lum(i + img.w * 4)
    s += v; s2 += v * v; n++
  }
  return n ? s2 / n - (s / n) ** 2 : 0
}

const rows = []
for (const form of FORMS) {
  const bP = path.join(BEFORE, form + '.png')
  const aP = path.join(AFTER, form + '.png')
  if (!fs.existsSync(bP) || !fs.existsSync(aP)) { console.log(`跳过 ${form}（缺改前或改后图）`); continue }
  const bImg = decodePng(fs.readFileSync(bP))
  const aImg = decodePng(fs.readFileSync(aP))
  const b = fit(crop(bImg, bbox(bImg)), SHOW_H)
  const a = fit(crop(aImg, bbox(aImg)), SHOW_H)
  rows.push({ form, b, a, bSrc: `${bImg.w}×${bImg.h}`, aSrc: `${aImg.w}×${aImg.h}`, sb: sharpness(b), sa: sharpness(a) })
  console.log(`${form}: 改前 ${bImg.w}×${bImg.h} 锐度 ${sharpness(b).toFixed(0)} → 改后 ${aImg.w}×${aImg.h} 锐度 ${sharpness(a).toFixed(0)}（×${(sharpness(a) / sharpness(b)).toFixed(2)}）`)
}
if (!rows.length) { console.log('没有可对比的形态'); process.exit(1) }

// 拼图：每行 [改前 | 改后]，列宽按最宽的取
const GAP = 20, PAD = 20, LABEL = 34
const colW = Math.max(...rows.map((r) => Math.max(r.b.w, r.a.w)))
const W = PAD * 2 + colW * 2 + GAP
const H = PAD * 2 + LABEL + rows.length * (SHOW_H + GAP + LABEL)
const fb = new Uint8ClampedArray(W * H * 4)
for (let i = 0; i < W * H; i++) { fb[i * 4] = 12; fb[i * 4 + 1] = 18; fb[i * 4 + 2] = 38; fb[i * 4 + 3] = 255 }
const place = (im, ox, oy) => {
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const s = (y * im.w + x) * 4, al = im.data[s + 3] / 255
    if (al <= 0) continue
    const tx = ox + x, ty = oy + y
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue
    const d = (ty * W + tx) * 4
    fb[d] = im.data[s] * al + fb[d] * (1 - al)
    fb[d + 1] = im.data[s + 1] * al + fb[d + 1] * (1 - al)
    fb[d + 2] = im.data[s + 2] * al + fb[d + 2] * (1 - al)
    fb[d + 3] = 255
  }
}
let y = PAD
for (const r of rows) {
  place(r.b, PAD + (colW - r.b.w) / 2, y + LABEL)
  place(r.a, PAD + colW + GAP + (colW - r.a.w) / 2, y + LABEL)
  y += SHOW_H + GAP + LABEL
}
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, encodePng(W, H, fb))
console.log(`\n已写出 ${path.relative(ROOT, OUT)}  ${W}×${H}`)
console.log('版式：每行 [改前 | 改后]（同一显示高度，公平对比）')
