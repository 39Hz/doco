// 对比实验：同一形态的三种"放大到屏幕尺寸"效果并排 + 放大一块细节
//   ① 原图（源尺寸，屏幕上会被拉伸）
//   ② 双线性插值放大（= 现在游戏里看到的效果）
//   ③ Real-ESRGAN 4× 超分后再降采样（AI 重建）
//
// 用法: node _tools/cmp-sr.mjs <形态名> [细节区域 x0,y0,x1,y1（源图坐标）]
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const form = process.argv[2] || '毒多比'
const SRC = path.join(ROOT, 'assets', 'forms', 'art', form + '.png')
const TMP = path.join(ROOT, '_tmp_test_out', 'sr')
const EXE = path.join(ROOT, '_tools', 'ai', 'realesrgan', 'realesrgan-ncnn-vulkan.exe')
const MODELS = path.join(ROOT, '_tools', 'ai', 'realesrgan', 'models')
const SHOW = 560          // 最终展示高度
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
const bilinear = (src, dstH) => {
  const sc = dstH / src.h, dw = Math.max(1, Math.round(src.w * sc)), dh = dstH
  const out = new Uint8ClampedArray(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(src.h - 1, Math.max(0, (y + 0.5) / sc - 0.5))
    const y0 = Math.floor(sy), y1 = Math.min(src.h - 1, y0 + 1), fy = sy - y0
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(src.w - 1, Math.max(0, (x + 0.5) / sc - 0.5))
      const x0 = Math.floor(sx), x1 = Math.min(src.w - 1, x0 + 1), fx = sx - x0
      let r = 0, g = 0, b = 0, a = 0, ws = 0
      const P = [[x0, y0, (1 - fx) * (1 - fy)], [x1, y0, fx * (1 - fy)], [x0, y1, (1 - fx) * fy], [x1, y1, fx * fy]]
      for (const [px, py, w0] of P) {
        const i = (py * src.w + px) * 4, al = src.data[i + 3] / 255
        const w2 = w0 * al
        r += src.data[i] * w2; g += src.data[i + 1] * w2; b += src.data[i + 2] * w2
        a += src.data[i + 3] * w0; ws += w2
      }
      const o = (y * dw + x) * 4
      if (ws > 0) { out[o] = r / ws; out[o + 1] = g / ws; out[o + 2] = b / ws }
      out[o + 3] = a
    }
  }
  return { w: dw, h: dh, data: out }
}
const areaAvg = (src, dstH) => {
  const sc = dstH / src.h, dw = Math.max(1, Math.round(src.w * sc)), dh = dstH
  const out = new Uint8ClampedArray(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const sy0 = Math.floor(y / sc), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) / sc))
    for (let x = 0; x < dw; x++) {
      const sx0 = Math.floor(x / sc), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) / sc))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let sy = sy0; sy < sy1 && sy < src.h; sy++) for (let sx = sx0; sx < sx1 && sx < src.w; sx++) {
        const i = (sy * src.w + sx) * 4, al = src.data[i + 3] / 255
        r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al
        a += src.data[i + 3]; n++
      }
      if (!n) continue
      const wsum = a / 255 || 1, o = (y * dw + x) * 4
      out[o] = r / wsum; out[o + 1] = g / wsum; out[o + 2] = b / wsum; out[o + 3] = a / n
    }
  }
  return { w: dw, h: dh, data: out }
}

const img = decodePng(fs.readFileSync(SRC))
const bb = bbox(img)
const src = cropBox(img, bb)
console.log(`源：${SRC.replace(ROOT + path.sep, '')}  有效 ${src.w}×${src.h}`)

// AI 超分
const upP = path.join(TMP, form + '_4x.png')
if (!fs.existsSync(upP)) {
  console.log('跑 Real-ESRGAN 4×（首次较慢）…')
  execFileSync(EXE, ['-i', SRC, '-o', upP, '-s', '4', '-n', 'realesrgan-x4plus-anime', '-m', MODELS], { stdio: 'ignore' })
}
const up = decodePng(fs.readFileSync(upP))
const upC = cropBox(up, bbox(up))

const A = bilinear(src, SHOW)            // ② 插值放大
const B = areaAvg(upC, SHOW)             // ③ AI 超分后降采样
const C = src                            // ① 原图（源尺寸）

// 细节区域：默认取"上 1/3、中间偏左"（通常是眼睛/脸）
const reg = (process.argv[3] || '').split(',').map(Number)
const rx0 = reg.length === 4 ? reg[0] : Math.round(src.w * 0.15)
const ry0 = reg.length === 4 ? reg[1] : Math.round(src.h * 0.18)
const rx1 = reg.length === 4 ? reg[2] : Math.round(src.w * 0.85)
const ry1 = reg.length === 4 ? reg[3] : Math.round(src.h * 0.45)

// 细节放大：把源区域放大到 4 倍显示（最近邻，看清像素本身）
const detail = (im, box) => {
  const sx = im.w / src.w, sy = im.h / src.h
  const b = { x0: Math.round(box[0] * sx), y0: Math.round(box[1] * sy), x1: Math.round(box[2] * sx), y1: Math.round(box[3] * sy) }
  const c = cropBox(im, b)
  const Z = 4
  const out = new Uint8ClampedArray(c.w * Z * c.h * Z * 4)
  for (let y = 0; y < c.h * Z; y++) for (let x = 0; x < c.w * Z; x++) {
    const s = (Math.floor(y / Z) * c.w + Math.floor(x / Z)) * 4
    const d = (y * c.w * Z + x) * 4
    out[d] = c.data[s]; out[d + 1] = c.data[s + 1]; out[d + 2] = c.data[s + 2]; out[d + 3] = c.data[s + 3]
  }
  return { w: c.w * Z, h: c.h * Z, data: out }
}
const dA = detail(A, [rx0, ry0, rx1, ry1])
const dB = detail(B, [rx0, ry0, rx1, ry1])
const dC = detail(C, [rx0, ry0, rx1, ry1])

// 拼图：上排三张全身，下排三张细节
const GAP = 14, PAD = 12
const cols = [A, B, C].map((im) => Math.min(im.w, 300))
const rowW = cols.reduce((a, b) => a + b, 0) + GAP * 2
const dCols = [dA, dB, dC]
const dW = dCols.reduce((a, b) => a + b.w, 0) + GAP * 2
const W = Math.max(rowW, dW) + PAD * 2
const H = SHOW + Math.max(...dCols.map((d) => d.h)) + GAP * 2 + PAD * 2
const fb = new Uint8ClampedArray(W * H * 4)
for (let i = 0; i < W * H; i++) { fb[i * 4] = 10; fb[i * 4 + 1] = 16; fb[i * 4 + 2] = 34; fb[i * 4 + 3] = 255 }
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
let cx = PAD
for (const im of [A, B, C]) { place(im, cx, PAD); cx += Math.min(im.w, 300) + GAP }
let dx = PAD
for (const im of dCols) { place(im, dx, PAD + SHOW + GAP); dx += im.w + GAP }

const outP = path.join(TMP, `${form}_对比.png`)
fs.writeFileSync(outP, encodePng(W, H, fb))
console.log(`对比图：${outP.replace(ROOT + path.sep, '')}  ${W}×${H}`)
console.log('顺序：① 原图（源尺寸）② 插值放大（现在游戏里的效果）③ AI 超分后降采样')
