// 模型对比：哪个超分模型**最不改配色**（颜色保真优先）
//
// 用户口径：「变高清之后配色变化了」→ 那"保色"就是硬指标。
// 判据（都对同一显示尺寸算）：
//   · 平均色差（vs 官方源直出的放大版）—— 越小越保色
//   · 平均饱和度差 —— 正数=AI 更艳
//   · 平均亮度差 —— 正数=AI 更亮
//   · 锐度增益 —— 越大越清晰
//
// 用法: node _tools/cmp-sr-models.mjs 正义多比
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const form = process.argv[2] || '正义多比'
const SRC = path.join(ROOT, '_tmp_test_out', 'art-before-sr', form + '.png')
const TMP = path.join(ROOT, '_tmp_test_out', 'sr')
const EXE = path.join(ROOT, '_tools', 'ai', 'realesrgan', 'realesrgan-ncnn-vulkan.exe')
const MODELS = path.join(ROOT, '_tools', 'ai', 'realesrgan', 'models')
const SHOW = 256          // 比较用的统一高度

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
// 只统计两边都不透明的像素，才算"同一块区域"
function compare(A, B) {
  const w = Math.min(A.w, B.w), h = Math.min(A.h, B.h)
  let n = 0, dSum = 0, satA = 0, satB = 0, lumA = 0, lumB = 0
  let s = 0, s2 = 0
  const L = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    if (A.data[i + 3] < 200 || B.data[i + 3] < 200) continue
    n++
    dSum += Math.hypot(A.data[i] - B.data[i], A.data[i + 1] - B.data[i + 1], A.data[i + 2] - B.data[i + 2])
    const sa = Math.max(A.data[i], A.data[i + 1], A.data[i + 2]) - Math.min(A.data[i], A.data[i + 1], A.data[i + 2])
    const sb = Math.max(B.data[i], B.data[i + 1], B.data[i + 2]) - Math.min(B.data[i], B.data[i + 1], B.data[i + 2])
    satA += sa; satB += sb
    lumA += L(A.data, i); lumB += L(B.data, i)
    const v = 4 * L(B.data, i) - L(B.data, i - 4) - L(B.data, i + 4) - L(B.data, i - w * 4) - L(B.data, i + w * 4)
    s += v; s2 += v * v
  }
  return {
    n,
    colorDist: dSum / n,
    satDelta: (satB - satA) / n,
    lumDelta: (lumB - lumA) / n,
    sharp: s2 / n - (s / n) ** 2,
  }
}

const base = norm(decodePng(fs.readFileSync(SRC)), SHOW)
console.log(`${form}：源 ${bbox(decodePng(fs.readFileSync(SRC))).x1 + 1}px 宽 → 统一放大到高 ${SHOW}\n`)
console.log('  模型                        色差↓   饱和差↓   亮度差↓   锐度↑')
console.log(`  面积平均放大（基准）         —        —         —        ${compare(base, base).sharp.toFixed(0)}`)
for (const model of ['realesrgan-x4plus-anime', 'realesrgan-x4plus']) {
  const up = path.join(TMP, `${form}_${model}.png`)
  if (!fs.existsSync(up)) {
    execFileSync(EXE, ['-i', SRC, '-o', up, '-s', '4', '-n', model, '-m', MODELS], { stdio: 'ignore' })
  }
  const r = compare(base, norm(decodePng(fs.readFileSync(up)), SHOW))
  console.log(`  ${model.padEnd(26)} ${r.colorDist.toFixed(1).padStart(6)}  ${r.satDelta.toFixed(1).padStart(7)}  ${r.lumDelta.toFixed(1).padStart(7)}  ${r.sharp.toFixed(0).padStart(7)}`)
}
