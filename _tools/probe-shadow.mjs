// 看看官方立绘脚底那圈「灰色投影」到底是什么颜色，好写一个安全的去除规则。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const FILES = process.argv.slice(2)
for (const rel of FILES) {
  const p = path.join(ROOT, '多克多比专区资料素材', rel)
  if (!fs.existsSync(p)) { console.log('缺 ' + rel); continue }
  const img = decodePng(fs.readFileSync(p))
  const { w, h, data } = img
  const hist = new Map()
  let opaque = 0
  const y0 = Math.floor(h * 0.82)
  for (let y = y0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (data[i + 3] < 200) continue
      opaque++
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const key = `${r >> 4},${g >> 4},${b >> 4}`
      const e = hist.get(key) || { n: 0, r: 0, g: 0, b: 0, sat: 0 }
      e.n++; e.r += r; e.g += g; e.b += b
      e.sat += Math.max(r, g, b) - Math.min(r, g, b)
      hist.set(key, e)
    }
  }
  const top = [...hist.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6)
  console.log(`\n${rel}  ${w}x${h}  底部 18% 不透明像素 ${opaque}`)
  for (const [k, e] of top) {
    console.log(`   色块 ${k.padEnd(10)} 占 ${String(Math.round(100 * e.n / opaque)).padStart(3)}%  ` +
      `平均 RGB(${Math.round(e.r / e.n)},${Math.round(e.g / e.n)},${Math.round(e.b / e.n)})  ` +
      `平均饱和度 ${(e.sat / e.n).toFixed(1)}`)
  }
}
