// 「基础多克多比」高清效果图（第 2 版，走已验证的路径）
//
// 【为什么要重写第 1 版】第 1 版手写了一个 blit 把两张图合成到一张画布上，
// 结果画布里的像素**逐字节错位 1 位**（源 242,166,18,255 → 画布 18,255,242,166，
// 橙色人物被画成青色）。单独测 blit 是对的、encodePng 的往返也是保真的，
// 所以问题出在"合成 + PixelCtx 环境"那一层，追了三轮没定位到根因 ——
// **这一次不再在可疑的合成路径上凑合**，改成：
//   ① 每张图单独渲染、单独写文件（只经过已验证的 encodePng / 缩放函数，不碰 blit）；
//   ② 需要并排就用 `image_edit` 工具的 stitch 拼接（工具侧的成熟实现）。
//
// 输出：
//   docs/shots/form-hd-live.png    —— 游戏现在加载的 311×640，插值放大 3×（= 屏幕上的样子）
//   docs/shots/form-hd-archive.png —— 归档官方 4000×2333 高清原图，缩到同样大小（= 换高清后的样子）
//
// 用法: node _tools/render-form-hd-preview.mjs
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const HI = '多克多比专区资料素材/多比形态素材/克罗多比.png'
const LO = 'assets/forms/art/克罗.png'
const OUTDIR = path.join(ROOT, 'docs', 'shots')
fs.mkdirSync(OUTDIR, { recursive: true })

function load(p) {
  const img = decodePng(fs.readFileSync(path.join(ROOT, p)))
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.data[(y * img.w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x
        if (y < y0) y0 = y; if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return { img, box: { x0: 0, y0: 0, x1: img.w - 1, y1: img.h - 1 } }
  return { img, box: { x0, y0, x1, y1 } }
}
const crop = (f, box) => {
  const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((box.y0 + y) * f.img.w + (box.x0 + x)) * 4, d = (y * w + x) * 4
    out[d] = f.img.data[s]; out[d + 1] = f.img.data[s + 1]
    out[d + 2] = f.img.data[s + 2]; out[d + 3] = f.img.data[s + 3]
  }
  return { w, h, data: out }
}
// 面积平均（缩小用）——alpha 加权，避免透明边变黑
const areaAvg = (src, dstH) => {
  const scale = dstH / src.h
  const dw = Math.max(1, Math.round(src.w * scale)), dh = dstH
  const out = new Uint8ClampedArray(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const sy0 = Math.floor(y / scale), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) / scale))
    for (let x = 0; x < dw; x++) {
      const sx0 = Math.floor(x / scale), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) / scale))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let sy = sy0; sy < sy1 && sy < src.h; sy++) for (let sx = sx0; sx < sx1 && sx < src.w; sx++) {
        const i = (sy * src.w + sx) * 4, al = src.data[i + 3] / 255
        r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al
        a += src.data[i + 3]; n++
      }
      if (!n) continue
      const ws = a / 255 || 1, o = (y * dw + x) * 4
      out[o] = r / ws; out[o + 1] = g / ws; out[o + 2] = b / ws; out[o + 3] = a / n
    }
  }
  return { w: dw, h: dh, data: out }
}
// 双线性（放大用，含 alpha 加权，避免透明像素把颜色拖暗）
const bilinear = (src, dstH) => {
  const scale = dstH / src.h
  const dw = Math.max(1, Math.round(src.w * scale)), dh = dstH
  const out = new Uint8ClampedArray(dw * dh * 4)
  const px = (x, y) => { const i = (y * src.w + x) * 4; return [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]] }
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(src.h - 1, Math.max(0, (y + 0.5) / scale - 0.5))
    const y0 = Math.floor(sy), y1 = Math.min(src.h - 1, y0 + 1), fy = sy - y0
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(src.w - 1, Math.max(0, (x + 0.5) / scale - 0.5))
      const x0 = Math.floor(sx), x1 = Math.min(src.w - 1, x0 + 1), fx = sx - x0
      const c = [[px(x0, y0), px(x1, y0), px(x0, y1), px(x1, y1)]]
      let r = 0, g = 0, b = 0, a = 0, wsum = 0
      for (const [p00, p10, p01, p11] of c) {
        const wts = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy]
        const ps = [p00, p10, p01, p11]
        for (let k = 0; k < 4; k++) {
          const w2 = wts[k] * (ps[k][3] / 255)
          r += ps[k][0] * w2; g += ps[k][1] * w2; b += ps[k][2] * w2
          a += ps[k][3] * wts[k]; wsum += w2
        }
      }
      const o = (y * dw + x) * 4
      if (wsum > 0) { out[o] = r / wsum; out[o + 1] = g / wsum; out[o + 2] = b / wsum } else { out[o] = out[o + 1] = out[o + 2] = 0 }
      out[o + 3] = a
    }
  }
  return { w: dw, h: dh, data: out }
}
// 贴到纯色背景上（PNG 保留 alpha，但为了让"边缘发虚"看得清，铺一层深色底）
const onBg = (src, bg) => {
  const out = new Uint8ClampedArray(src.w * src.h * 4)
  for (let i = 0; i < src.w * src.h; i++) {
    const a = src.data[i * 4 + 3] / 255
    out[i * 4] = src.data[i * 4] * a + bg[0] * (1 - a)
    out[i * 4 + 1] = src.data[i * 4 + 1] * a + bg[1] * (1 - a)
    out[i * 4 + 2] = src.data[i * 4 + 2] * a + bg[2] * (1 - a)
    out[i * 4 + 3] = 255
  }
  return { w: src.w, h: src.h, data: out }
}

const SHOW_H = 900
const BG = [10, 20, 48]

const lo = load(LO)
const hi = load(HI)
console.log(`游戏内素材: ${lo.img.w}×${lo.img.h}（有效 ${lo.box.x1 - lo.box.x0 + 1}×${lo.box.y1 - lo.box.y0 + 1}）`)
console.log(`归档高清  : ${hi.img.w}×${hi.img.h}（有效 ${hi.box.x1 - hi.box.x0 + 1}×${hi.box.y1 - hi.box.y0 + 1}）`)

// 左：游戏内素材按"屏幕上会放大到的高度"插值放大（= 现在糊的样子）
const live = onBg(bilinear(crop(lo, lo.box), SHOW_H), BG)
// 右：归档高清降到同样高度（= 换高清后的样子）
const arch = onBg(areaAvg(crop(hi, hi.box), SHOW_H), BG)

const wl = path.join(OUTDIR, 'form-hd-live.png')
const wr = path.join(OUTDIR, 'form-hd-archive.png')
fs.writeFileSync(wl, encodePng(live.w, live.h, live.data))
fs.writeFileSync(wr, encodePng(arch.w, arch.h, arch.data))
console.log(`已写出 ${path.relative(ROOT, wl)}  ${live.w}×${live.h}`)
console.log(`已写出 ${path.relative(ROOT, wr)}  ${arch.w}×${arch.h}`)

// 自证：写出来的图必须还能读回同样的颜色（防止"看起来成功其实是空的"）
const back = decodePng(fs.readFileSync(wl))
const mid = (Math.round(back.h / 2) * back.w + Math.round(back.w / 2)) * 4
const srcMid = (Math.round(live.h / 2) * live.w + Math.round(live.w / 2)) * 4
const same = back.data[mid] === live.data[srcMid] && back.data[mid + 1] === live.data[srcMid + 1]
console.log(`自证 ${same ? '✅' : '❌'} 读回中心像素 ${back.data[mid]},${back.data[mid + 1]},${back.data[mid + 2]} ` +
  `（写之前 ${live.data[srcMid]},${live.data[srcMid + 1]},${live.data[srcMid + 2]}）`)
process.exit(same ? 0 : 1)
