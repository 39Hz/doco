// 逐点比色：把"改前"和"改后"归一化到同一尺寸，找出**颜色变化最大的区域**
// 用法: node _tools/diag-color-shift.mjs 正义多比
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const form = process.argv[2] || '正义多比'
const BEF = path.join(ROOT, '_tmp_test_out', 'art-before-sr', form + '.png')
const NOW = path.join(ROOT, 'assets', 'forms', 'art', form + '.png')
const N = 128                       // 归一化到 128 高做逐点比较

const bbox = (img) => {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.data[(y * img.w + x) * 4 + 3] > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
  return { x0, y0, x1, y1 }
}
const norm = (img, dstH) => {
  const b = bbox(img)
  const sw = b.x1 - b.x0 + 1, sh = b.y1 - b.y0 + 1
  const sc = dstH / sh, dw = Math.max(1, Math.round(sw * sc)), dh = dstH
  const out = new Uint8ClampedArray(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const sy0 = b.y0 + Math.floor(y / sc), sy1 = Math.max(sy0 + 1, b.y0 + Math.floor((y + 1) / sc))
    for (let x = 0; x < dw; x++) {
      const sx0 = b.x0 + Math.floor(x / sc), sx1 = Math.max(sx0 + 1, b.x0 + Math.floor((x + 1) / sc))
      let r = 0, g = 0, b2 = 0, a = 0, n = 0
      for (let sy = sy0; sy < sy1 && sy <= b.y1; sy++) for (let sx = sx0; sx < sx1 && sx <= b.x1; sx++) {
        const i = (sy * img.w + sx) * 4, al = img.data[i + 3] / 255
        r += img.data[i] * al; g += img.data[i + 1] * al; b2 += img.data[i + 2] * al
        a += img.data[i + 3]; n++
      }
      if (!n) continue
      const ws = a / 255 || 1, o = (y * dw + x) * 4
      out[o] = r / ws; out[o + 1] = g / ws; out[o + 2] = b2 / ws; out[o + 3] = a / n
    }
  }
  return { w: dw, h: dh, data: out }
}

const A = norm(decodePng(fs.readFileSync(BEF)), N)
const B = norm(decodePng(fs.readFileSync(NOW)), N)
const w = Math.min(A.w, B.w), h = Math.min(A.h, B.h)

// 逐点色差，并统计"改前是浅色、改后变深色"的像素（那才是用户说的"配色变了"）
let n = 0, sum = 0, maxD = 0, maxAt = null
let lightToDark = 0, darkToLight = 0, opaqueA = 0
const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = (y * w + x) * 4
  if (A.data[i + 3] < 128) continue
  opaqueA++
  const d = Math.hypot(A.data[i] - B.data[i], A.data[i + 1] - B.data[i + 1], A.data[i + 2] - B.data[i + 2])
  sum += d; n++
  if (d > maxD) { maxD = d; maxAt = [x, y] }
  const la = lum(A.data, i), lb = lum(B.data, i)
  if (la > 170 && lb < 110) lightToDark++
  else if (la < 110 && lb > 170) darkToLight++
}
console.log(`=== ${form}：改前 vs 改后 逐点比色（归一化到 ${w}×${h}）===`)
console.log(`  不透明像素 ${opaqueA}  平均色差 ${(sum / n).toFixed(1)}（0~441）  最大色差 ${maxD.toFixed(0)} @(${maxAt})`)
console.log(`  ⚠️ "浅色变深色" 的像素：${lightToDark}（占 ${(lightToDark / n * 100).toFixed(1)}%）`)
console.log(`     "深色变浅色" 的像素：${darkToLight}（占 ${(darkToLight / n * 100).toFixed(1)}%）`)
console.log(lightToDark / n > 0.05
  ? '  → 结论：**确有整片浅色被变深**（用户的感觉是对的）'
  : '  → 结论：没有成片的浅色变深（差异主要是抗锯齿/缩放级别不同）')
