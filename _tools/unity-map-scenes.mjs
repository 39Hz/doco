// 用「图像内容指纹」把 Unity 包里的原版场景图和我现有的场景图对上号。
//
// 为什么不能按编号对：Unity 工程里的 SceneNN 编号和我从归档里拿到的 scene_NN 不是同一套顺序
// （实测 Scene2 是风铃草林，我这边 scene_2 是海底）。按编号替换会把地图和场景名张冠李戴。
// 所以这里给每张图算一个抗缩放的指纹（缩到 24×24 灰度），再两两比距离取最近的配对，
// 并且要求"最近的那一对明显比第二近的更近"，否则判为不确定。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, '_unity_tex', 'index.json'), 'utf8'))
const jpgCache = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', 'imgcache', 'index.json'), 'utf8'))
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'))

function fp(img, n = 24) {
  const out = new Float32Array(n * n)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // 每个格子取一小块的平均亮度，抗压缩噪声
      const x0 = Math.floor(x * img.w / n), x1 = Math.max(x0 + 1, Math.floor((x + 1) * img.w / n))
      const y0 = Math.floor(y * img.h / n), y1 = Math.max(y0 + 1, Math.floor((y + 1) * img.h / n))
      let s = 0, c = 0
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * img.w + xx) * 4
        s += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
        c++
      }
      out[y * n + x] = c ? s / c : 0
    }
  }
  // 归一化（减去均值），这样亮度整体差异不影响
  let m = 0
  for (const v of out) m += v
  m /= out.length
  for (let i = 0; i < out.length; i++) out[i] -= m
  return out
}
const dist = (a, b) => {
  let s = 0
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d }
  return Math.sqrt(s / a.length)
}

// Unity 侧
const uni = []
for (const t of idx) {
  const m = /^Scene(\d+)$/.exec(t.name)
  if (!m) continue
  try {
    const img = decodePng(fs.readFileSync(path.join(ROOT, t.file)))
    uni.push({ n: Number(m[1]), file: t.file, img, fp: fp(img) })
  } catch { }
}
// 我这边
const mine = []
for (const s of man.scenes || []) {
  const m = /scene_0*(\d+)\./.exec(s.file || '')
  if (!m) continue
  const actual = jpgCache[s.file] || s.file
  const p = path.join(ROOT, actual)
  if (!fs.existsSync(p)) continue
  try {
    const img = decodePng(fs.readFileSync(p))
    mine.push({ n: Number(m[1]), name: s.name, file: s.file, img, fp: fp(img) })
  } catch { }
}
console.log(`Unity 场景 ${uni.length} 张，我的场景 ${mine.length} 张`)

// 两两距离
const pairs = []
for (const u of uni) {
  const ds = mine.map((m) => ({ m, d: dist(u.fp, m.fp) })).sort((a, b) => a.d - b.d)
  if (!ds.length) continue
  pairs.push({ u, best: ds[0], second: ds[1] || { d: 1e9 } })
}
// 判定：最近距离够小，且和第二名拉开差距
const GOOD = 6.0, RATIO = 0.62
const sure = pairs.filter((p) => p.best.d < GOOD && p.best.d < p.second.d * RATIO)
const unsure = pairs.filter((p) => !(p.best.d < GOOD && p.best.d < p.second.d * RATIO))

console.log(`\n可靠配对 ${sure.length} 对：`)
for (const p of sure.sort((a, b) => a.u.n - b.u.n)) {
  console.log(`  Unity Scene${String(p.u.n).padStart(3)}  ${String(p.u.img.w + 'x' + p.u.img.h).padEnd(10)}  ==  我的 scene_${String(p.best.m.n).padStart(3)} ` +
    `${p.best.m.name || ''}  距离 ${p.best.d.toFixed(2)}（第二近 ${p.second.d.toFixed(2)}）`)
}
console.log(`\n不确定 ${unsure.length} 张（可能是噪声解码，或我这边没有对应图）：`)
for (const p of unsure.sort((a, b) => a.best.d - b.best.d).slice(0, 25)) {
  console.log(`  Unity Scene${String(p.u.n).padStart(3)}  最近是 scene_${p.best.m.n} 距离 ${p.best.d.toFixed(2)} / 第二 ${p.second.d.toFixed(2)}` +
    (p.best.d > 20 ? '   ← 很可能解码坏了' : ''))
}
fs.writeFileSync(path.join(ROOT, '_tools', '_unity_scene_map.json'),
  JSON.stringify({
    sure: sure.map((p) => ({ unity: p.u.n, mine: p.best.m.n, name: p.best.m.name, d: +p.best.d.toFixed(2), file: p.u.file })),
    unsure: unsure.map((p) => ({ unity: p.u.n, near: p.best.m.n, d: +p.best.d.toFixed(2), file: p.u.file })),
  }, null, 1))
console.log('\n配对表 -> _tools/_unity_scene_map.json')
