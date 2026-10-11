// 把「Unity 包里的场景图」和「我现有的场景图」各拼一张总表，肉眼比对到底是不是同一批地图。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer, PixelCtx } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, '_unity_tex', 'index.json'), 'utf8'))
const jpgCache = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', 'imgcache', 'index.json'), 'utf8'))
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'))

function sheet(items, cols, out, label) {
  const CW = 300, CH = Math.round(CW * 840 / 1440), PAD = 4
  const rows = Math.ceil(items.length / cols)
  const W = cols * (CW + PAD) + PAD, H = rows * (CH + PAD) + PAD
  const canvas = { width: W, height: H, _fb: makeFramebuffer(W, H), style: {} }
  const ctx = new PixelCtx(canvas)
  ctx.fillStyle = '#0c121c'; ctx.fillRect(0, 0, W, H)
  items.forEach((it, i) => {
    const cx = PAD + (i % cols) * (CW + PAD), cy = PAD + ((i / cols) | 0) * (CH + PAD)
    try { ctx.drawImage({ _pixels: it.img }, cx, cy, CW, CH) } catch { }
  })
  fs.writeFileSync(path.join(ROOT, 'docs', 'sheets', out), encodePng(W, H, canvas._fb))
  console.log(`${label}: ${items.length} 张 -> docs/sheets/${out}（${cols} 列，按编号升序，先左到右再上到下）`)
  console.log('   编号: ' + items.map((x) => x.n).join(' '))
}

const uni = []
for (const t of idx) {
  const m = /^Scene(\d+)$/.exec(t.name)
  if (!m) continue
  try { uni.push({ n: Number(m[1]), img: decodePng(fs.readFileSync(path.join(ROOT, t.file))) }) } catch { }
}
uni.sort((a, b) => a.n - b.n)
sheet(uni, 9, '_unity_scenes.png', 'Unity 包场景')

const mine = []
for (const s of man.scenes || []) {
  const m = /scene_0*(\d+)\./.exec(s.file || '')
  if (!m) continue
  const actual = jpgCache[s.file] || s.file
  const p = path.join(ROOT, actual)
  if (!fs.existsSync(p)) continue
  try { mine.push({ n: Number(m[1]), img: decodePng(fs.readFileSync(p)) }) } catch { }
}
mine.sort((a, b) => a.n - b.n)
sheet(mine, 9, '_my_scenes.png', '我的场景')
