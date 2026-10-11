// 把 docs/shots 里的截图拼成一张总表，一眼过一遍所有画面。
// 用户要求"先停下核对画面"，这个工具就是核对用的。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer, PixelCtx } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const DIR = path.resolve(process.argv[2] || path.join(ROOT, 'docs', 'shots'))
const OUT = path.resolve(process.argv[3] || path.join(ROOT, 'docs', 'sheets', '_screens.png'))

const files = fs.readdirSync(DIR).filter((f) => /\.png$/i.test(f)).sort()
if (!files.length) { console.error('没有截图'); process.exit(1) }

const COLS = Number(process.argv[4] || 3)
const CW = 460, CH = Math.round(CW * 560 / 960), PAD = 8
const rows = Math.ceil(files.length / COLS)
const W = COLS * (CW + PAD) + PAD, H = rows * (CH + PAD) + PAD

const canvas = { width: W, height: H, _fb: makeFramebuffer(W, H), style: {} }
const ctx = new PixelCtx(canvas)
ctx.fillStyle = '#0c121c'; ctx.fillRect(0, 0, W, H)

const loaded = []
for (const f of files) {
  try {
    const img = decodePng(fs.readFileSync(path.join(DIR, f)))
    loaded.push({ f, img })
  } catch (e) { console.log('跳过 ' + f + '：' + e.message) }
}
loaded.forEach((it, i) => {
  const cx = PAD + (i % COLS) * (CW + PAD), cy = PAD + ((i / COLS) | 0) * (CH + PAD)
  ctx.fillStyle = '#1b2430'; ctx.fillRect(cx, cy, CW, CH)
  ctx.drawImage({ _pixels: it.img }, cx, cy, CW, CH)
})
fs.writeFileSync(OUT, encodePng(W, H, canvas._fb))
console.log(`拼了 ${loaded.length} 张 -> ${OUT}  ${W}x${H}`)
console.log('版面（' + COLS + ' 列，先左到右再上到下）：')
loaded.forEach((it, i) => console.log(`  第${((i / COLS) | 0) + 1}行 第${(i % COLS) + 1}列  ${it.f}`))
