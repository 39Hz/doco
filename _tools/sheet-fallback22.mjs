// 只渲染"当前用兜底立绘"的那 22 只怪，看看在游戏里到底是什么样子。
// 用与 drawMonster 相同的缩放逻辑（按目标高度等比缩放），这样看到的就是玩家看到的。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer } from './pixel-canvas.mjs'
import { loadGlyphAtlas, TextRenderer } from './text-render.mjs'

const ROOT = path.resolve('.')
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'monsters', 'map.json'), 'utf8'))
const fallback = map.detail.filter((d) => /m_\*\.png/.test(d.source))
console.log('用兜底立绘的怪: ' + fallback.length + ' 只')

const COLS = 6, CW = 220, CH = 250
const ROWS = Math.ceil(fallback.length / COLS)
const W = COLS * CW, H = ROWS * CH
const fb = makeFramebuffer(W, H)
for (let i = 0; i < fb.length; i += 4) { fb[i] = 40; fb[i + 1] = 44; fb[i + 2] = 54; fb[i + 3] = 255 }
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

fallback.forEach((d, k) => {
  const c = k % COLS, r = Math.floor(k / COLS)
  const x0 = c * CW, y0 = r * CH
  // 场景地台
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const i = ((y0 + y) * W + x0 + x) * 4
    const v = 40 + Math.round(24 * (y / CH))
    fb[i] = v; fb[i + 1] = v + 4; fb[i + 2] = v + 12
  }
  let png = null
  try { png = decodePng(fs.readFileSync(path.join(ROOT, d.sprite))) } catch (e) { }
  if (png) {
    // 与游戏一致：按目标高度（这里取 170，接近战斗里的显示高度）等比缩放
    const targetH = 170
    const sc = targetH / png.h
    const dw = Math.round(png.w * sc), dh = targetH
    const ox = x0 + Math.floor((CW - dw) / 2), oy = y0 + 30
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(png.w - 1, Math.floor(x / sc)), sy = Math.min(png.h - 1, Math.floor(y / sc))
        const si = (sy * png.w + sx) * 4
        const a = png.data[si + 3] / 255
        if (a <= 0.02) continue
        const px = ox + x, py = oy + y
        if (px < 0 || py < 0 || px >= W || py >= H) continue
        const di = (py * W + px) * 4
        fb[di] = fb[di] * (1 - a) + png.data[si] * a
        fb[di + 1] = fb[di + 1] * (1 - a) + png.data[si + 1] * a
        fb[di + 2] = fb[di + 2] * (1 - a) + png.data[si + 2] * a
      }
    }
  }
  tr.draw(fake, d.id + ' ' + d.name, x0 + 6, y0 + 4, [255, 225, 120, 255], 1, '15px sans-serif', 'left', 'top')
  tr.draw(fake, d.sprite.replace('assets/monsters/', ''), x0 + 6, y0 + CH - 18, [160, 170, 190, 255], 1, '12px sans-serif', 'left', 'top')
  for (let x = x0; x < x0 + CW; x++) { const i = (y0 * W + x) * 4; fb[i] = 90; fb[i + 1] = 96; fb[i + 2] = 110 }
  for (let y = y0; y < y0 + CH; y++) { const i = (y * W + x0) * 4; fb[i] = 90; fb[i + 1] = 96; fb[i + 2] = 110 }
})

const out = path.join(ROOT, 'docs', 'sheets', '_fallback22.png')
fs.writeFileSync(out, encodePng(W, H, fb))
console.log('已输出 ' + out + '（' + W + '×' + H + '）— 深色底 + 与游戏一致的缩放')
