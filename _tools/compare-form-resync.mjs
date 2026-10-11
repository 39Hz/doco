// 并排对比：归档源图 vs 同步后的立绘（确认没串图）
// 用法: node _tools/compare-form-resync.mjs <源图路径> <立绘路径> <输出png> [展示高]
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const [srcP, dstP, outP, hArg] = process.argv.slice(2)
const SHOW = Number(hArg || 420)
const ROOT = path.resolve('.')

function load(p) {
  const img = decodePng(fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p)))
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.data[(y * img.w + x) * 4 + 3] > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
  return { img, box: x1 < 0 ? { x0: 0, y0: 0, x1: img.w - 1, y1: img.h - 1 } : { x0, y0, x1, y1 } }
}
function areaAvg(img, box, dstH) {
  const sw = box.x1 - box.x0 + 1, sh = box.y1 - box.y0 + 1
  const sc = dstH / sh, dw = Math.max(1, Math.round(sw * sc)), dh = dstH
  const out = new Uint8ClampedArray(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const sy0 = box.y0 + Math.floor(y / sc), sy1 = Math.max(sy0 + 1, box.y0 + Math.floor((y + 1) / sc))
    for (let x = 0; x < dw; x++) {
      const sx0 = box.x0 + Math.floor(x / sc), sx1 = Math.max(sx0 + 1, box.x0 + Math.floor((x + 1) / sc))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let sy = sy0; sy < sy1 && sy <= box.y1; sy++) for (let sx = sx0; sx < sx1 && sx <= box.x1; sx++) {
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
const A = load(srcP), B = load(dstP)
const a = areaAvg(A.img, A.box, SHOW), b = areaAvg(B.img, B.box, SHOW)
const GAP = 16
const W = a.w + GAP + b.w, H = SHOW
const buf = new Uint8ClampedArray(W * H * 4)
for (let i = 0; i < W * H; i++) { buf[i * 4] = 8; buf[i * 4 + 1] = 14; buf[i * 4 + 2] = 32; buf[i * 4 + 3] = 255 }
const place = (im, ox) => {
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const s = (y * im.w + x) * 4, al = im.data[s + 3] / 255
    if (al <= 0) continue
    const d = (y * W + ox + x) * 4
    buf[d] = im.data[s] * al + buf[d] * (1 - al)
    buf[d + 1] = im.data[s + 1] * al + buf[d + 1] * (1 - al)
    buf[d + 2] = im.data[s + 2] * al + buf[d + 2] * (1 - al)
    buf[d + 3] = 255
  }
}
place(a, 0); place(b, a.w + GAP)
fs.writeFileSync(path.isAbsolute(outP) ? outP : path.join(ROOT, outP), encodePng(W, H, buf))
// 自证：两边的"主体平均色"必须接近（同源同色），否则说明串图了
const avg = (im) => {
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < im.w * im.h; i++) { if (im.data[i * 4 + 3] < 200) continue; r += im.data[i * 4]; g += im.data[i * 4 + 1]; b += im.data[i * 4 + 2]; n++ }
  return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [0, 0, 0]
}
const ca = avg(a), cb = avg(b)
const dist = Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2])
console.log(`源 ${a.w}×${a.h} 平均色 rgb(${ca})   |   立绘 ${b.w}×${b.h} 平均色 rgb(${cb})   色距 ${dist.toFixed(1)}`)
console.log(dist < 60 ? '✅ 同色系（没串图）' : '❌ 色距过大 —— 可能串图了，必须人工核对')
console.log(`已写出 ${outP}  ${W}×${H}`)
process.exit(dist < 60 ? 0 : 1)
