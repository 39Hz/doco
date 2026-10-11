// 朝向对照图：把"原始立绘"和"战斗画面里那一帧"并排，人眼一看就知道谁反了
//
// 【为什么需要】用户报「多比朝向有问题，应该全部朝向敌人」。
//   眼睛位置这类自动判据在"整张脸都是白的"（如龙多比）立绘上会失效，
//   所以最终必须**并排给人看**。这张图就是那个证据。
// 用法: node _tools/make-facing-compare.mjs <战斗截图.png>
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SHOT = path.join(ROOT, process.argv[2] || '_tmp_test_out/shots-icon/10-battle-command.png')
const OUT = path.join(ROOT, 'docs', 'shots', 'facing-compare.png')

const shot = decodePng(fs.readFileSync(SHOT))
const W = shot.w, H = shot.h

// 从截图里裁一块（按比例），并放大到指定高度（最近邻，保持像素锐利）
function cut(img, box, dstH) {
  const x0 = Math.round(box[0] * img.w), y0 = Math.round(box[1] * img.h)
  const x1 = Math.round(box[2] * img.w), y1 = Math.round(box[3] * img.h)
  const sw = x1 - x0, sh = y1 - y0
  const sc = dstH / sh, dw = Math.round(sw * sc), dh = dstH
  const out = new Uint8ClampedArray(dw * dh * 4)
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sx = x0 + Math.min(sw - 1, Math.floor(x / sc)), sy = y0 + Math.min(sh - 1, Math.floor(y / sc))
    const s = (sy * img.w + sx) * 4, d = (y * dw + x) * 4
    out[d] = img.data[s]; out[d + 1] = img.data[s + 1]; out[d + 2] = img.data[s + 2]; out[d + 3] = img.data[s + 3]
  }
  return { w: dw, h: dh, data: out }
}
// 立绘：按内容裁紧再等比放到 dstH
function fitArt(img, dstH) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.data[(y * img.w + x) * 4 + 3] > 40) {
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
  const sw = x1 - x0 + 1, sh = y1 - y0 + 1
  const sc = dstH / sh, dw = Math.max(1, Math.round(sw * sc)), dh = dstH
  const out = new Uint8ClampedArray(dw * dh * 4)
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sx = x0 + Math.min(sw - 1, Math.floor(x / sc)), sy = y0 + Math.min(sh - 1, Math.floor(y / sc))
    const s = (sy * img.w + sx) * 4, d = (y * dw + x) * 4
    out[d] = img.data[s]; out[d + 1] = img.data[s + 1]; out[d + 2] = img.data[s + 2]; out[d + 3] = img.data[s + 3]
  }
  return { w: dw, h: dh, data: out }
}
const mirror = (img) => {
  const out = { w: img.w, h: img.h, data: new Uint8ClampedArray(img.w * img.h * 4) }
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const s = (y * img.w + x) * 4, d = (y * img.w + (img.w - 1 - x)) * 4
    out.data[d] = img.data[s]; out.data[d + 1] = img.data[s + 1]; out.data[d + 2] = img.data[s + 2]; out.data[d + 3] = img.data[s + 3]
  }
  return out
}

const H2 = 300
const playerArt = fitArt(decodePng(fs.readFileSync(path.join(ROOT, 'assets/forms/art/龙多比.png'))), H2)
const enemyArt = fitArt(decodePng(fs.readFileSync(path.join(ROOT, 'assets/monsters/labeled/mon_10020.png'))), H2)
const playerShot = cut(shot, [0.19, 0.5, 0.32, 0.79], H2)     // 玩家在画面里
const enemyShot = cut(shot, [0.60, 0.17, 0.78, 0.53], H2)     // 敌人在画面里

const cells = [
  { img: playerArt, label: '① 龙多比 原始立绘' },
  { img: playerShot, label: '② 龙多比 游戏里（现在）' },
  { img: mirror(playerShot), label: '③ 龙多比 镜像后（方案A）' },
  { img: enemyArt, label: '④ 大蘑菇 原始立绘' },
  { img: enemyShot, label: '⑤ 大蘑菇 游戏里（现在）' },
]
const PAD = 14, LABEL = 26
const colW = Math.max(...cells.map((c) => c.img.w))
const totW = PAD * 2 + cells.length * colW + (cells.length - 1) * PAD
const totH = PAD * 2 + LABEL + H2
const fb = new Uint8ClampedArray(totW * totH * 4)
for (let i = 0; i < totW * totH; i++) { fb[i * 4] = 14; fb[i * 4 + 1] = 18; fb[i * 4 + 2] = 34; fb[i * 4 + 3] = 255 }
const place = (im, ox, oy) => {
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const s = (y * im.w + x) * 4, al = im.data[s + 3] / 255
    if (al <= 0) continue
    const tx = ox + x, ty = oy + y
    if (tx < 0 || ty < 0 || tx >= totW || ty >= totH) continue
    const d = (ty * totW + tx) * 4
    fb[d] = im.data[s] * al + fb[d] * (1 - al)
    fb[d + 1] = im.data[s + 1] * al + fb[d + 1] * (1 - al)
    fb[d + 2] = im.data[s + 2] * al + fb[d + 2] * (1 - al)
    fb[d + 3] = 255
  }
}
cells.forEach((c, i) => place(c.img, PAD + i * (colW + PAD) + ((colW - c.img.w) >> 1), PAD + LABEL))
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, encodePng(totW, totH, fb))
console.log(`已写出 ${path.relative(ROOT, OUT)}  ${totW}×${totH}`)
console.log('列顺序：' + cells.map((c) => c.label).join(' | '))
