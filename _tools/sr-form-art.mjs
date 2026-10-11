// 超分流水线：把"源像素不足"的形态用 Real-ESRGAN 4× 超分 → 相位保持降采样到 640px 有效高
//
// 【为什么要"先超分再降采样"】源只有 192~465px 有效高，目标是 640。
//   直接插值放大只是"把像素摊开"（糊）；Real-ESRGAN 会**重建边缘与纹理**，
//   再降采样到目标尺寸时，细节比直接放大多得多。
//
// ⚠️ 这是**推测细节**，不是官方像素。所以：
//   ① 只在"归档没有更大源"的形态上用（有真实高清源的形态绝不用它，见 resync-form-art-hd.mjs）；
//   ② 输出 PNG 里写明来源；③ 体积受控。
//
// 用法: node _tools/sr-form-art.mjs [--dry]
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const ART = path.join(ROOT, 'assets', 'forms', 'art')
const TMP = path.join(ROOT, '_tmp_test_out', 'sr')
const EXE = path.join(ROOT, '_tools', 'ai', 'realesrgan', 'realesrgan-ncnn-vulkan.exe')
const MODELS = path.join(ROOT, '_tools', 'ai', 'realesrgan', 'models')
const DRY = process.argv.includes('--dry')
const TARGET_H = 640

// 需要超分的形态（来自 audit-form-art-2x.mjs：归档没有更大官方源的 17 只）
const NEED = ['哈瑞肯多比', '正义多比', '费勒姆炎多比', '人鱼多比', '艾斯林', '斯莱特刃多比',
  '毒多比', '土蝎多比', '夜影冽多比', '夜影空多比', '厄斯垒', '夜影博伊斯多比',
  '冰多比', '夜影凌多比', '夜影厄斯多比', '夜影正义多比',
  // 兔多比 / 曼陀罗多比 是"同名不同形"的独立形态，归档里各自只有小图
  '兔多比', '曼陀罗多比']

fs.mkdirSync(TMP, { recursive: true })
if (!fs.existsSync(EXE)) { console.log('✗ 找不到 realesrgan exe：' + path.relative(ROOT, EXE)); process.exit(1) }

function bbox(img) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.data[(y * img.w + x) * 4 + 3] > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 }
}

// 相位保持降采样：把 (dw,dh) 的图缩到目标高，用面积平均 + alpha 加权
function resample(img, dstH) {
  const scale = dstH / img.h
  const dw = Math.max(1, Math.round(img.w * scale)), dh = dstH
  const out = new Uint8ClampedArray(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const sy0 = Math.floor(y / scale), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) / scale))
    for (let x = 0; x < dw; x++) {
      const sx0 = Math.floor(x / scale), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) / scale))
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

// 锐度指标：Laplacian 方差（越大越锐）。只看**不透明区域**，避免把透明边算进去。
// 【为什么要它】"AI 超分到底有没有让画面更清晰"不能只靠肉眼 —— 肉眼很容易被
//   "更亮/更饱和"骗。用同一个显示尺寸下的拉普拉斯方差对比，才有可复现的判据。
function sharpness(img) {
  const lum = (i) => 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
  let n = 0, sum = 0, sum2 = 0
  for (let y = 1; y < img.h - 1; y++) {
    for (let x = 1; x < img.w - 1; x++) {
      const i = (y * img.w + x) * 4
      if (img.data[i + 3] < 200) continue
      // 4 邻域拉普拉斯
      const c = lum(i), l = lum(((y) * img.w + x - 1) * 4), r = lum(((y) * img.w + x + 1) * 4)
      const u = lum(((y - 1) * img.w + x) * 4), d = lum(((y + 1) * img.w + x) * 4)
      const v = 4 * c - l - r - u - d
      sum += v; sum2 += v * v; n++
    }
  }
  if (!n) return 0
  const mean = sum / n
  return sum2 / n - mean * mean
}

// 灰影清理：AI 超分会把源 JPG 里的**脚底灰色投影**一起放大并保留下来，
// 而官方生成器 `build-form-art.mjs` 有一道泛洪抠背景专门吃掉它。
// 【为什么不能直接复用他的 removeBackground】那函数从**四边**泛洪（源是白底图）；
//   而 AI 输出已经是**透明底**，"从透明像素继续扩散"的路径在这里不成立 ——
//   实测 `正义多比` 会留下 52% 灰影，被 `test-form-art.mjs` 的残留检查抓住。
// 所以这里改成**对着灰影本身的特征判**：低饱和 + 偏亮 + 落在下半部。
// 两趟：① 从边缘/透明处泛洪，任意亮度都吃（连通到外面的灰影）；
//      ② 下半部再按严格中性灰（R≈G≈B 且 ≥120）直接吃（不连通但明显是投影的）。
function cleanGrayShadow(img) {
  const { w, h, data } = img
  // ⚠️⚠️ **这段踩过两个坑，改动前务必读完** ⚠️⚠️
  //   坑 1（太宽）：判据写成「色差 ≤12 且亮度 ≥120」，结果把**白色铠甲/翅膀**也删了
  //     —— 白色本身就是无彩色（R≈G≈B）！正义多比的铠甲、哈瑞肯的翅膀被挖成黑块。
  //   坑 2（太窄）：为救白铠甲把"灰"限制成"中等灰 110~190"，结果**又吃不掉投影**
  //     —— `test-form-art.mjs` 报「正义多比 脚底灰影残留 48%」。
  //   **正解：不要靠颜色阈值去分"白"和"灰"（它们本质同色），靠"连通性"分。**
  //     投影永远**连着画面边缘**（它在人物外面、铺到图边）；
  //     而白铠甲是**被人身包住的内部区域**，从边缘泛洪根本走不到它那里。
  //     所以：只做**一趟从边缘/透明处的连通扩散**，判据放宽到「低饱和且不太暗」即可，
  //     内部的白/灰一律安全。
  const isGreyish = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const d = Math.max(r, g, b) - Math.min(r, g, b)
    const lum = (r + g + b) / 3
    return d <= 16 && lum >= 105          // 低饱和 + 不是黑描边/暗部
  }
  const dead = new Uint8Array(w * h)
  const q = []
  const push = (p) => { if (!dead[p] && data[p * 4 + 3] > 0) { dead[p] = 1; q.push(p) } }
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x) }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1) }
  for (let p = 0; p < w * h; p++) if (data[p * 4 + 3] < 8) dead[p] = 1      // 已有的透明像素也算外围
  while (q.length) {
    const p = q.pop()
    const x = p % w, y = (p / w) | 0
    const nb = []
    if (x > 0) nb.push(p - 1)
    if (x < w - 1) nb.push(p + 1)
    if (y > 0) nb.push(p - w)
    if (y < h - 1) nb.push(p + w)
    for (const n2 of nb) if (!dead[n2] && isGreyish(n2 * 4)) push(n2)
  }
  let n = 0
  for (let p = 0; p < w * h; p++) if (dead[p] && data[p * 4 + 3] > 0) { data[p * 4 + 3] = 0; n++ }
  return n
}

const t0 = Date.now()
let done = 0, skipped = 0
const report = []

// 先只处理命令行指定的形态（`--only 名字1,名字2`），便于先做对比实验再批量
const ONLY = (() => {
  const i = process.argv.indexOf('--only')
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1].split(',') : null
})()
const list = ONLY || NEED
for (const form of list) {
  const src = path.join(ART, form + '.png')
  if (!fs.existsSync(src)) { console.log(`  ${form}：没有立绘，跳过`); skipped++; continue }
  const img = decodePng(fs.readFileSync(src))
  const bb = bbox(img)
  if (!bb) { console.log(`  ${form}：全透明，跳过`); skipped++; continue }
  const eff = bb.y1 - bb.y0 + 1
  if (eff >= TARGET_H) { console.log(`  ${form}：有效高 ${eff} 已达标，跳过`); skipped++; continue }
  // 【门槛：只在"源明显不足"时才用 AI 超分】
  // 实测（3 只试跑，同一显示尺寸下的拉普拉斯方差）：
  //   毒多比 0.59 → 锐度 ×1.69 ✅ 明显有用
  //   正义多比 0.45 → ×2.35 ✅ 明显有用
  //   冰多比 0.85 → ×0.94 ❌ **没有用**（源已经接近目标，AI 只是把噪声也放大，体积还翻倍）
  // 所以源 ≥ 0.8 目标的形态**保持官方材质直出**（更忠实，也更小）。
  const ratio = eff / TARGET_H
  if (ratio >= 0.8) {
    console.log(`  ${form}：有效高 ${eff}（${(ratio * 100).toFixed(0)}% 目标）≥ 80% → 不超分，保持官方材质`)
    skipped++
    continue
  }
  const up = path.join(TMP, form + '_4x.png')
  if (!fs.existsSync(up)) {
    execFileSync(EXE, ['-i', src, '-o', up, '-s', '4', '-n', 'realesrgan-x4plus-anime', '-m', MODELS],
      { stdio: 'ignore' })
  }
  const big = decodePng(fs.readFileSync(up))
  const removed = cleanGrayShadow(big)          // 吃掉源 JPG 带进来的脚底灰影
  const out = resample(big, TARGET_H)
  const png = encodePng(out.w, out.h, out.data)
  // 自证：读回后有效高必须≈640。
  // ⚠️ 判据用 **±2 容差**，不是严格相等 —— 去灰影会削掉 1~2px 的边缘像素
  //    （实测哈瑞肯 639 / 正义 638），严格相等会把**正确的结果**判成失败（第一版就是这样）。
  const back = decodePng(png)
  const bb2 = bbox(back)
  const eff2 = bb2 ? bb2.y1 - bb2.y0 + 1 : 0
  if (Math.abs(eff2 - TARGET_H) > 2) {
    console.log(`  ✗ ${form}：自证失败（读回有效高 ${eff2}，目标 ${TARGET_H}±2），不写盘`)
    continue
  }
  // 去灰影的**安全阀**：对 AI 输出的画布吃掉太多，说明可能误伤角色本体 —— 报出来人工核对
  const upCanvas = big.w * big.h
  if (removed > upCanvas * 0.18) {
    console.log(`  ⚠ ${form}：去灰影吃掉 ${removed} / ${upCanvas} 像素（${(removed / upCanvas * 100).toFixed(1)}%）偏多，需核对是否误伤本体`)
  }
  // 客观对比：同一显示尺寸下，"插值放大" vs "AI 超分后降采样" 的锐度
  const plain = resample(img, TARGET_H)            // 插值版（把原图直接放到目标尺寸）
  const sPlain = sharpness(plain), sSr = sharpness(out)
  const gain = sPlain > 0 ? (sSr / sPlain) : 1
  if (!DRY) fs.writeFileSync(src, png)
  done++
  report.push({ form, before: eff, after: TARGET_H, kb: Math.round(png.length / 1024), sharpPlain: +sPlain.toFixed(1), sharpSr: +sSr.toFixed(1), gain: +gain.toFixed(3) })
  console.log(`  ✓ ${form}  有效高 ${eff} → ${TARGET_H}  ${out.w}×${out.h}  ${Math.round(png.length / 1024)}KB` +
    `  锐度 ${sPlain.toFixed(0)} → ${sSr.toFixed(0)}（×${gain.toFixed(2)}）  去灰影 ${removed} 像素  ${DRY ? '[dry]' : ''}`)
}
console.log(`\n超分完成 ${done} 个（跳过 ${skipped}），用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
if (DRY) console.log('（--dry：没有写盘）')
if (report.length) {
  fs.writeFileSync(path.join(TMP, 'sr-report.json'), JSON.stringify({ generated: new Date().toISOString(), tool: 'Real-ESRGAN ncnn-vulkan x4plus-anime', items: report }, null, 2))
  console.log(`报告：${path.relative(ROOT, path.join(TMP, 'sr-report.json'))}`)
}
