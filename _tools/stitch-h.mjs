// 横排拼接两张 PNG（走已验证的 decodePng / encodePng，只做"读→铺→写"）
// 用法: node _tools/stitch-h.mjs <左图> <右图> <输出> [间距]
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const [a, b, out, gapArg] = process.argv.slice(2)
if (!a || !b || !out) { console.error('用法: node _tools/stitch-h.mjs 左图 右图 输出 [间距]'); process.exit(2) }
const gap = Math.max(0, Number(gapArg || 0))
const A = decodePng(fs.readFileSync(a))
const B = decodePng(fs.readFileSync(b))
const H = Math.max(A.h, B.h)
const W = A.w + gap + B.w
const buf = new Uint8ClampedArray(W * H * 4)
// 底色：深蓝（与游戏界面同调），alpha 满
for (let i = 0; i < W * H; i++) {
  buf[i * 4] = 8; buf[i * 4 + 1] = 14; buf[i * 4 + 2] = 32; buf[i * 4 + 3] = 255
}
// 垂直居中铺放，带 alpha 混合
function place(img, ox) {
  const oy = Math.floor((H - img.h) / 2)
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const s = (y * img.w + x) * 4
      const al = img.data[s + 3] / 255
      if (al <= 0) continue
      const d = ((oy + y) * W + ox + x) * 4
      buf[d] = img.data[s] * al + buf[d] * (1 - al)
      buf[d + 1] = img.data[s + 1] * al + buf[d + 1] * (1 - al)
      buf[d + 2] = img.data[s + 2] * al + buf[d + 2] * (1 - al)
      buf[d + 3] = 255
    }
  }
}
place(A, 0)
place(B, A.w + gap)
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
fs.writeFileSync(path.resolve(out), encodePng(W, H, buf))
console.log(`已写出 ${out}  ${W}×${H}（左 ${A.w}×${A.h} + 间距 ${gap} + 右 ${B.w}×${B.h}）`)
