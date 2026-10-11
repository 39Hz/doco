// 把技能面板截图里的可疑区域放大，看清那排中文到底是什么。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const src = path.join(ROOT, 'docs', 'shots', '15b-skillpanel.png')
const img = decodePng(fs.readFileSync(src))
// 右侧技能库第二排 + 底部翻页那一片
const X = 500, Y = 180, W = 460, H = 330
const S = 2
const out = new Uint8Array(W * S * H * S * 4)
for (let y = 0; y < H * S; y++) {
  for (let x = 0; x < W * S; x++) {
    const sx = Math.min(img.w - 1, X + Math.floor(x / S))
    const sy = Math.min(img.h - 1, Y + Math.floor(y / S))
    const si = (sy * img.w + sx) * 4, di = (y * W * S + x) * 4
    out[di] = img.data[si]; out[di + 1] = img.data[si + 1]; out[di + 2] = img.data[si + 2]; out[di + 3] = 255
  }
}
fs.writeFileSync(path.join(ROOT, 'docs', 'sheets', '_skp_zoom.png'), encodePng(W * S, H * S, out))
console.log(`放大 ${S}× -> docs/sheets/_skp_zoom.png（原图区域 x=${X} y=${Y} ${W}x${H}）`)
