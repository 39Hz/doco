// 检查立绘四角的背景透明度（判断"白底有没有被抠掉"）
import fs from 'node:fs'
import { decodePng } from './pixel-canvas.mjs'
const files = [
  ['改前(官方源直出)', '_tmp_test_out/art-before-sr/正义多比.png'],
  ['AI超分图', '_tmp_test_out/sr/正义多比_4x.png'],
  ['当前成品', 'assets/forms/art/正义多比.png'],
]
for (const [label, p] of files) {
  if (!fs.existsSync(p)) { console.log(`${label}: 缺文件`); continue }
  const img = decodePng(fs.readFileSync(p))
  const at = (x, y) => { const i = (y * img.w + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] }
  console.log(`${label}  ${img.w}×${img.h}`)
  console.log(`   左上 ${at(1, 1)}  右上 ${at(img.w - 2, 1)}  左下 ${at(1, img.h - 2)}  右下 ${at(img.w - 2, img.h - 2)}`)
  console.log(`   底边中点 ${at(img.w >> 1, img.h - 2)}`)
  let eo = 0, et = 0
  for (let x = 0; x < img.w; x++) for (const y of [0, img.h - 1]) { et++; if (img.data[(y * img.w + x) * 4 + 3] > 40) eo++ }
  for (let y = 0; y < img.h; y++) for (const x of [0, img.w - 1]) { et++; if (img.data[(y * img.w + x) * 4 + 3] > 40) eo++ }
  console.log(`   四边不透明占比 ${(eo / et * 100).toFixed(1)}%`)
}
