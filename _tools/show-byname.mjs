// 把「幽灵 / 魔化多比 / 河伯」这几张 byname 提取图渲出来看看质量，
// 决定是直接用还是仍要换素材。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer } from './pixel-canvas.mjs'
import { loadGlyphAtlas, TextRenderer } from './text-render.mjs'

const ROOT = path.resolve('.')
const files = ['幽灵.jpg', '魔化多比.jpg', '河伯形态动画-位图.jpg']
const CW = 380, CH = 380
const W = CW * files.length, H = CH + 30
const fb = makeFramebuffer(W, H)
for (let i = 0; i < fb.length; i += 4) { fb[i] = 45; fb[i + 1] = 48; fb[i + 2] = 58; fb[i + 3] = 255 }
const tr = new TextRenderer(loadGlyphAtlas())
const fake = {
  W, H, buf: fb, _clip: null, globalAlpha: 1,
  _blend(px, py, R, G, B, a) {
    px |= 0; py |= 0
    if (px < 0 || py < 0 || px >= W || py >= H) return
    const d = (py * W + px) * 4
    fb[d] = fb[d] * (1 - a) + R * a; fb[d + 1] = fb[d + 1] * (1 - a) + G * a; fb[d + 2] = fb[d + 2] * (1 - a) + B * a
  },
  _inClip() { return true },
}
files.forEach((f, i) => {
  const p = path.join(ROOT, 'assets', 'monsters', 'byname', f)
  if (!fs.existsSync(p)) { console.log('缺 ' + f); return }
  const b = fs.readFileSync(p)
  // 这些是 JPEG，我的解码器只认 PNG。用 SOF 读尺寸，然后把原始字节塞进一个"伪 PNG"是行不通的 ——
  // 所以这里只报告尺寸，实际渲染留给 convert-jpg 转好的缓存。
  let w = 0, h = 0
  for (let k = 2; k + 9 < b.length;) {
    if (b[k] !== 0xff) { k++; continue }
    const mk = b[k + 1]
    if (mk === 0xd8 || mk === 1 || (mk >= 0xd0 && mk <= 0xd7)) { k += 2; continue }
    const L = b.readUInt16BE(k + 2)
    if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) {
      h = b.readUInt16BE(k + 5); w = b.readUInt16BE(k + 7); break
    }
    if (L < 2) break
    k += 2 + L
  }
  tr.draw(fake, f.replace('.jpg', ''), i * CW + 10, 6, [255, 225, 120, 255], 1, '18px sans-serif', 'left', 'top')
  tr.draw(fake, w + '×' + h + '  JPEG ' + Math.round(b.length / 1024) + ' KB', i * CW + 10, CH + 10,
    [170, 180, 200, 255], 1, '14px sans-serif', 'left', 'top')
  for (let y = 0; y < CH; y++) { const d = (y * W + i * CW) * 4; fb[d] = 90; fb[d + 1] = 96; fb[d + 2] = 110 }
})
fs.writeFileSync(path.join(ROOT, 'docs', 'sheets', '_byname_info.png'), encodePng(W, H, fb))
console.log('已输出 docs/sheets/_byname_info.png（只有文字信息，JPEG 需要先转 PNG 才能渲染）')
console.log('提示：把这几张 jpg 转成 png 后就能纳入截图流程。')
