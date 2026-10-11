// 反方向再找一次：我这边每张场景图，在 Unity 包里最近的邻居是谁？
// 如果两套图确实是同一批地图、只是编号不同，这里应该出现一批「距离很小」的配对。
// 若最小距离仍然很大，就说明两套图内容本身不同（不能按编号替换）。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer, PixelCtx } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, '_unity_tex', 'index.json'), 'utf8'))
const jpgCache = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', 'imgcache', 'index.json'), 'utf8'))
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'))

function fp(img, n = 32) {
  const out = new Float32Array(n * n)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const x0 = Math.floor(x * img.w / n), x1 = Math.max(x0 + 1, Math.floor((x + 1) * img.w / n))
    const y0 = Math.floor(y * img.h / n), y1 = Math.max(y0 + 1, Math.floor((y + 1) * img.h / n))
    let s = 0, c = 0
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      const i = (yy * img.w + xx) * 4
      s += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]; c++
    }
    out[y * n + x] = c ? s / c : 0
  }
  let m = 0; for (const v of out) m += v; m /= out.length
  for (let i = 0; i < out.length; i++) out[i] -= m
  return out
}
const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d } return Math.sqrt(s / a.length) }

const uni = []
for (const t of idx) {
  const m = /^Scene(\d+)$/.exec(t.name)
  if (!m) continue
  try { uni.push({ n: Number(m[1]), file: t.file, img: decodePng(fs.readFileSync(path.join(ROOT, t.file))) }) } catch { }
}
for (const u of uni) u.fp = fp(u.img)

const mine = []
for (const s of man.scenes || []) {
  const m = /scene_0*(\d+)\./.exec(s.file || '')
  if (!m) continue
  const p = path.join(ROOT, jpgCache[s.file] || s.file)
  if (!fs.existsSync(p)) continue
  try { mine.push({ n: Number(m[1]), name: s.title, file: s.file, img: decodePng(fs.readFileSync(p)) }) } catch { }
}
for (const m of mine) m.fp = fp(m.img)

// 自检：把某张图和自己比，距离必须是 0；再和轻微降采样版比，应该很小
{
  const a = mine[0]
  console.log(`自检：scene_${a.n} 与自己 距离 = ${dist(a.fp, a.fp).toFixed(3)}（应为 0）`)
  const small = { w: a.img.w >> 1, h: a.img.h >> 1, data: new Uint8Array((a.img.w >> 1) * (a.img.h >> 1) * 4) }
  for (let y = 0; y < small.h; y++) for (let x = 0; x < small.w; x++) {
    const si = ((y * 2) * a.img.w + x * 2) * 4, di = (y * small.w + x) * 4
    small.data[di] = a.img.data[si]; small.data[di + 1] = a.img.data[si + 1]
    small.data[di + 2] = a.img.data[si + 2]; small.data[di + 3] = a.img.data[si + 3]
  }
  console.log(`自检：scene_${a.n} 与「自己缩一半」距离 = ${dist(a.fp, fp(small)).toFixed(3)}（应该也很小）`)
}

const rows = []
for (const m of mine) {
  let best = null, second = null
  for (const u of uni) {
    const d = dist(m.fp, u.fp)
    if (!best || d < best.d) { second = best; best = { u, d } }
    else if (!second || d < second.d) second = { u, d }
  }
  if (best) rows.push({ m, best, second })
}
rows.sort((a, b) => a.best.d - b.best.d)
console.log('\n最像的 15 对（我的 -> Unity）：')
for (const r of rows.slice(0, 15)) {
  console.log(`  scene_${String(r.m.n).padStart(3)}「${String(r.m.name || '').slice(0, 8)}」 -> Unity Scene${String(r.best.u.n).padStart(3)}  ` +
    `距离 ${r.best.d.toFixed(2)}（次近 Scene${r.second.u.n} ${r.second.d.toFixed(2)}）`)
}
const min = rows[0].best.d
console.log(`\n全局最小距离 ${min.toFixed(2)}。` +
  (min < 4 ? '说明存在同图配对，只是编号不同。' : '距离偏大 —— 两套图内容并不相同（不是同一批地图文件的重新编号）。'))

// 前 3 对拼图看个究竟
const pick = rows.slice(0, 3)
if (pick.length) {
  const CW = 420, CH = Math.round(CW * 840 / 1440), PAD = 6
  const W = pick.length * (CW + PAD) + PAD, H = 2 * (CH + PAD) + PAD
  const c = { width: W, height: H, _fb: makeFramebuffer(W, H), style: {} }
  const ctx = new PixelCtx(c)
  ctx.fillStyle = '#0c121c'; ctx.fillRect(0, 0, W, H)
  pick.forEach((r, i) => {
    const cx = PAD + i * (CW + PAD)
    ctx.drawImage({ _pixels: r.m.img }, cx, PAD, CW, CH)
    ctx.drawImage({ _pixels: r.best.u.img }, cx, PAD * 2 + CH, CW, CH)
  })
  fs.writeFileSync(path.join(ROOT, 'docs', 'sheets', '_mine_vs_unity_top3.png'), encodePng(W, H, c._fb))
  console.log('前 3 对拼图 -> docs/sheets/_mine_vs_unity_top3.png（上=我的，下=Unity 最近的）')
  console.log('  我的编号: ' + pick.map((r) => r.m.n).join(', ') + '   Unity 编号: ' + pick.map((r) => r.best.u.n).join(', '))
}
