import fs from 'node:fs'
import path from 'node:path'
// 用"亮部重心 vs 包围盒中心"量素材朝向：偏右 = 脸朝右
function facing(p) {
  const { decodePng } = await import('./pixel-canvas.mjs')
  const img = decodePng(fs.readFileSync(p))
  let x0 = img.w, x1 = -1, y0 = img.h, y1 = -1
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.data[(y * img.w + x) * 4 + 3] > 40) {
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
  const hy = y0 + Math.round((y1 - y0) * 0.45)
  let sx = 0, n = 0
  for (let y = y0; y <= hy; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * img.w + x) * 4
    if (img.data[i + 3] < 40) continue
    const lum = (img.data[i] + img.data[i+1] + img.data[i+2]) / 3
    if (lum < 200) continue
    sx += x; n++
  }
  return { bias: n ? (sx / n < (x0 + x1) / 2 ? '左' : '右') : '?', bbox: [x0, y0, x1, y1], bright: n }
}
export { facing }
