// 公平的"放大质量"对比：同一张立绘（官方源直出）用两种方式放到同一显示尺寸
//   左 = 双线性/面积平均放大（= 以前游戏里看到的效果）
//   右 = Real-ESRGAN 超分后降采样（= 现在 HD 的效果）
// 两边**同尺寸、同背景**，只差"放大算法"这一个变量 —— 这样看到的差别才是算法造成的。
//
// 用法: node _tools/make-upscale-compare.mjs 正义多比 [输出.png]
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const form = process.argv[2] || '正义多比'
const OUT = path.join(ROOT, 'docs', 'shots',
  (process.argv[3] && process.argv[3].endsWith('.png')) ? process.argv[3] : 'upscale-compare.png')
const SRC = path.join(ROOT, '_tmp_test_out', 'art-before-sr', form + '.png')  // 官方源直出
const TMP = path.join(ROOT, '_tmp_test_out', 'sr')
const EXE = path.join(ROOT, '_tools', 'ai', 'realesrgan', 'realesrgan-ncnn-vulkan.exe')
const MODELS = path.join(ROOT, '_tools', 'ai', 'realesrgan', 'models')
const SHOW = 620

if (!fs.existsSync(SRC)) { console.log('找不到官方源直出版本：' + SRC); process.exit(1) }

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
const sharp = (img) => {
  const L = (i) => 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
  let s = 0, s2 = 0, n = 0
  for (let y = 1; y < img.h - 1; y++) for (let x = 1; x < img.w - 1; x++) {
    const i = (y * img.w + x) * 4
    if (img.data[i + 3] < 200) continue
    const v = 4 * L(i) - L(i - 4) - L(i + 4) - L(i - img.w * 4) - L(i + img.w * 4)
    s += v; s2 += v * v; n++
  }
  return n ? s2 / n - (s / n) ** 2 : 0
}

const plainImg = decodePng(fs.readFileSync(SRC))
const plain = fit(crop(plainImg, bbox(plainImg)), SHOW)

const up = path.join(TMP, form + '_4x.png')
if (!fs.existsSync(up)) {
  execFileSync(EXE, ['-i', SRC, '-o', up, '-s', '4', '-n', 'realesrgan-x4plus-anime', '-m', MODELS], { stdio: 'ignore' })
}
const upImg = decodePng(fs.readFileSync(up))
const hd = fit(crop(upImg, bbox(upImg)), SHOW)

console.log(`${form}：源 ${plainImg.w}×${plainImg.h} → 两边都放到高 ${SHOW}`)
console.log(`  左（面积平均放大） 锐度 ${sharp(plain).toFixed(0)}`)
console.log(`  右（AI 超分后缩放）锐度 ${sharp(hd).toFixed(0)}（×${(sharp(hd) / sharp(plain)).toFixed(2)}）`)

const GAP = 24, PAD = 20
const W = PAD * 2 + plain.w + GAP + hd.w
const H = PAD * 2 + SHOW
const fb = new Uint8ClampedArray(W * H * 4)
for (let i = 0; i < W * H; i++) { fb[i * 4] = 12; fb[i * 4 + 1] = 18; fb[i * 4 + 2] = 38; fb[i * 4 + 3] = 255 }
const place = (im, ox) => {
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const s = (y * im.w + x) * 4, al = im.data[s + 3] / 255
    if (al <= 0) continue
    const d = ((PAD + y) * W + ox + x) * 4
    fb[d] = im.data[s] * al + fb[d] * (1 - al)
    fb[d + 1] = im.data[s + 1] * al + fb[d + 1] * (1 - al)
    fb[d + 2] = im.data[s + 2] * al + fb[d + 2] * (1 - al)
    fb[d + 3] = 255
  }
}
place(plain, PAD)
place(hd, PAD + plain.w + GAP)
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, encodePng(W, H, fb))
console.log(`已写出 ${path.relative(ROOT, OUT)}  ${W}×${H}`)
