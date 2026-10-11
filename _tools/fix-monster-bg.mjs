// 检查并修掉怪物立绘里的"黑底"。
//
// 现象：战斗截图里「火球怪」整个套着一个黑方块。
// 根因：这些是从《怪物大全》图集里切出来的（map.json 里 source 标着 replace），
// 切片时保留了图集的黑背景。形态立绘当时做了两趟抠背景，怪物这条线漏了。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const DIR = path.join(ROOT, 'assets', 'monsters', 'labeled')

function cornerIsOpaque(img) {
  const { w, h, data } = img
  const at = (x, y) => data[(y * w + x) * 4 + 3]
  const pts = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [w >> 1, 0], [w >> 1, h - 1]]
  return pts.filter(([x, y]) => at(x, y) > 200).length >= 3
}

// 两趟泛洪：先吃与边界色接近的区域，再从中性灰/黑继续扩散
function removeBg(img) {
  const { w, h, data } = img
  const samples = []
  for (let x = 0; x < w; x += Math.max(1, (w / 48) | 0)) {
    samples.push([data[x * 4], data[x * 4 + 1], data[x * 4 + 2]])
    samples.push([data[((h - 1) * w + x) * 4], data[((h - 1) * w + x) * 4 + 1], data[((h - 1) * w + x) * 4 + 2]])
  }
  for (let y = 0; y < h; y += Math.max(1, (h / 48) | 0)) {
    samples.push([data[(y * w) * 4], data[(y * w) * 4 + 1], data[(y * w) * 4 + 2]])
    samples.push([data[(y * w + w - 1) * 4], data[(y * w + w - 1) * 4 + 1], data[(y * w + w - 1) * 4 + 2]])
  }
  const med = (i) => { const a = samples.map((s) => s[i]).sort((p, q) => p - q); return a[a.length >> 1] }
  const bg = [med(0), med(1), med(2)]
  const dist = (i) => Math.max(Math.abs(data[i] - bg[0]), Math.abs(data[i + 1] - bg[1]), Math.abs(data[i + 2] - bg[2]))
  const TOL = 46, SOFT = 120
  const isBg = new Uint8Array(w * h)
  const q = []
  const push = (p) => { if (!isBg[p]) { isBg[p] = 1; q.push(p) } }
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x) }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1) }
  let removed = 0
  while (q.length) {
    const p = q.pop(); removed++
    const x = p % w, y = (p / w) | 0
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const np = ny * w + nx
      if (isBg[np]) continue
      if (dist(np * 4) <= TOL) push(np)
    }
  }
  for (let p = 0; p < w * h; p++) {
    const i = p * 4
    if (isBg[p]) { data[i + 3] = 0; continue }
    const x = p % w, y = (p / w) | 0
    const near = (x > 0 && isBg[p - 1]) || (x < w - 1 && isBg[p + 1]) ||
      (y > 0 && isBg[p - w]) || (y < h - 1 && isBg[p + w])
    if (!near) continue
    const d = dist(i)
    if (d < SOFT) data[i + 3] = Math.min(data[i + 3], Math.round(255 * (d - TOL) / (SOFT - TOL)))
  }
  return { bg, pct: +(100 * removed / (w * h)).toFixed(1) }
}

const files = fs.readdirSync(DIR).filter((f) => /^mon_\d+\.png$/.test(f)).sort()
let fixed = 0
const still = []
for (const f of files) {
  const p = path.join(DIR, f)
  const img = decodePng(fs.readFileSync(p))
  if (!cornerIsOpaque(img)) continue
  const r = removeBg(img)
  fs.writeFileSync(p, encodePng(img.w, img.h, img.data))
  // 自检：抠完之后四角必须是透明的
  const after = decodePng(fs.readFileSync(p))
  const ok = !cornerIsOpaque(after)
  console.log(`  ${f.padEnd(16)} 底色 ${r.bg.join(',')}  抠掉 ${r.pct}%  四角已透明=${ok}`)
  if (ok) fixed++; else still.push(f)
}
console.log(`\n共 ${files.length} 张怪物立绘，其中 ${fixed} 张原本是黑底、已修好`)
if (still.length) console.log('★ 仍有问题的：' + still.join('、'))
