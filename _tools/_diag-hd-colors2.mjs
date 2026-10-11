// 诊断：HD 之后到底哪一步改了配色 —— 分步量"主体平均色"与亮度分布
// 用法: node _tools/diag-hd-colors2.mjs 正义多比
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const form = process.argv[2] || '正义多比'
const BEF = path.join(ROOT, '_tmp_test_out', 'art-before-sr', form + '.png')
const NOW = path.join(ROOT, 'assets', 'forms', 'art', form + '.png')
const TMP = path.join(ROOT, '_tmp_test_out', 'sr')
const EXE = path.join(ROOT, '_tools', 'ai', 'realesrgan', 'realesrgan-ncnn-vulkan.exe')
const MODELS = path.join(ROOT, '_tools', 'ai', 'realesrgan', 'models')

function stats(p, label) {
  if (!fs.existsSync(p)) { console.log(`${label}: 文件不存在`); return null }
  const img = decodePng(fs.readFileSync(p))
  let n = 0, r = 0, g = 0, b = 0
  const bk = { 白: 0, 亮: 0, 中: 0, 暗: 0, 黑: 0 }
  for (let i = 0; i < img.w * img.h; i++) {
    if (img.data[i * 4 + 3] < 250) continue
    const R = img.data[i * 4], G = img.data[i * 4 + 1], B = img.data[i * 4 + 2]
    r += R; g += G; b += B; n++
    const lum = (R + G + B) / 3
    if (lum >= 230) bk.白++
    else if (lum >= 180) bk.亮++
    else if (lum >= 110) bk.中++
    else if (lum >= 50) bk.暗++
    else bk.黑++
  }
  const pct = (v) => (n ? (v / n * 100).toFixed(1) + '%' : '-')
  console.log(`${label}`)
  console.log(`   ${img.w}×${img.h}  平均色 rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`)
  console.log(`   亮度分布  白${pct(bk.白)} 亮${pct(bk.亮)} 中${pct(bk.中)} 暗${pct(bk.暗)} 黑${pct(bk.黑)}`)
  return { bk, n }
}

console.log(`=== ${form} 分步配色对比 ===\n`)
const a = stats(BEF, '① 官方源直出（改前）')
const up = path.join(TMP, form + '_4x.png')
if (!fs.existsSync(up)) {
  execFileSync(EXE, ['-i', BEF, '-o', up, '-s', '4', '-n', 'realesrgan-x4plus-anime', '-m', MODELS], { stdio: 'ignore' })
}
const b = stats(up, '② AI 4× 超分（还没做任何后处理）')
const c = stats(NOW, '③ 最终成品（含去灰影 + 降采样）')
console.log('\n判读：② 的白/亮占比就崩了 → AI 改的色；② 正常而 ③ 崩了 → 我的后处理改的')
