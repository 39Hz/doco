// 实验：对"源已接近目标"的形态，用 ×2 超分（而不是 ×4 再缩回）会不会真的更锐
//
// 【为什么怀疑 ×4】源 541px、目标 640px（只要 ×1.18 倍）。走 ×4 → 2164px，再缩回 640 ——
//   缩减比 3.4:1，**AI 重建出来的细节会被这次缩小重新抹平**，所以锐度指标看着没涨。
//   ×2 → 1082px → 缩到 640（1.7:1），理论上能留住更多。
//
// 用法: node _tools/sr-compare-scale.mjs 冰多比
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const form = process.argv[2] || '冰多比'
const ART = path.join(ROOT, 'assets', 'forms', 'art')
const TMP = path.join(ROOT, '_tmp_test_out', 'sr')
const EXE = path.join(ROOT, '_tools', 'ai', 'realesrgan', 'realesrgan-ncnn-vulkan.exe')
const MODELS = path.join(ROOT, '_tools', 'ai', 'realesrgan', 'models')
const TARGET_H = 640
fs.mkdirSync(TMP, { recursive: true })

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
const cropBox = (img, b) => {
  const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((b.y0 + y) * img.w + (b.x0 + x)) * 4, d = (y * w + x) * 4
    out[d] = img.data[s]; out[d + 1] = img.data[s + 1]; out[d + 2] = img.data[s + 2]; out[d + 3] = img.data[s + 3]
  }
  return { w, h, data: out }
}
const resample = (img, dstH) => {
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
  let n = 0, s = 0, s2 = 0
  for (let y = 1; y < img.h - 1; y++) for (let x = 1; x < img.w - 1; x++) {
    const i = (y * img.w + x) * 4
    if (img.data[i + 3] < 200) continue
    const v = 4 * lum(i) - lum(i - 4) - lum(i + 4) - lum(i - img.w * 4) - lum(i + img.w * 4)
    s += v; s2 += v * v; n++
  }
  return n ? s2 / n - (s / n) ** 2 : 0
}

const src = path.join(ART, form + '.png')
const img = decodePng(fs.readFileSync(src))
const bb = bbox(img)
const cropped = cropBox(img, bb)
console.log(`${form}：源有效 ${cropped.w}×${cropped.h}，目标高 ${TARGET_H}（需 ×${(TARGET_H / cropped.h).toFixed(2)}）`)
console.log('')

// 基准：直接插值到目标（= 现在游戏里看到的）
const plain = resample(cropped, TARGET_H)
console.log(`  插值放大           锐度 ${sharpness(plain).toFixed(0)}`)

// ×2 / ×3 / ×4 各来一次
for (const s of [2, 3, 4]) {
  const up = path.join(TMP, `${form}_x${s}.png`)
  if (!fs.existsSync(up)) {
    execFileSync(EXE, ['-i', src, '-o', up, '-s', String(s), '-n', 'realesrgan-x4plus-anime', '-m', MODELS], { stdio: 'ignore' })
  }
  const big = decodePng(fs.readFileSync(up))
  const bigC = cropBox(big, bbox(big))
  const out = resample(bigC, TARGET_H)
  console.log(`  AI ×${s} → 缩到 640  锐度 ${sharpness(out).toFixed(0)}   （超分后 ${bigC.w}×${bigC.h}，缩减比 ${(bigC.h / TARGET_H).toFixed(1)}:1）`)
}
