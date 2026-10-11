// 比对 Unity 包里的原版场景图（SceneNN.png）和我现有的场景图（assets/scenes/scene_NN.jpg）。
// 用户说这份包"符合原版地图"，如果它分辨率更高、没有 JPEG 压缩痕迹，就值得替换。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer, PixelCtx } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, '_unity_tex', 'index.json'), 'utf8'))
const jpgCache = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', 'imgcache', 'index.json'), 'utf8'))

// Unity 侧：SceneNN -> 文件
const uni = new Map()
for (const t of idx) {
  const m = /^Scene(\d+)$/.exec(t.name)
  if (m) uni.set(Number(m[1]), t)
}
console.log(`Unity 包里的场景图：${uni.size} 张`)

// 我这边：manifest 的 88 个场景
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'))
const mine = new Map()
for (const s of man.scenes || []) {
  const m = /scene_0*(\d+)\./.exec(s.file || '')
  if (m) mine.set(Number(m[1]), s)
}
console.log(`我这边：${mine.size} 张`)

const both = [...uni.keys()].filter((k) => mine.has(k)).sort((a, b) => a - b)
const onlyUni = [...uni.keys()].filter((k) => !mine.has(k)).sort((a, b) => a - b)
const onlyMine = [...mine.keys()].filter((k) => !uni.has(k)).sort((a, b) => a - b)
console.log(`两边都有 ${both.length} 张；只有 Unity 有 ${onlyUni.length} 张；只有我有 ${onlyMine.length} 张`)

function mineInfo(id) {
  const rel = mine.get(id).file
  const actual = jpgCache[rel] || rel
  const p = path.join(ROOT, actual)
  if (!fs.existsSync(p)) return null
  try {
    const img = decodePng(fs.readFileSync(p))
    return { img, bytes: fs.statSync(path.join(ROOT, rel)).size, rel }
  } catch { return null }
}

console.log('\n逐张比对（前 30 张两边都有的）：')
console.log('  编号  我这边             Unity 包            大图字节')
let better = 0
for (const id of both.slice(0, 30)) {
  const u = uni.get(id)
  const m = mineInfo(id)
  if (!m) { console.log(`  ${String(id).padStart(3)}   （我的缺图）        ${u.w}x${u.h}`); continue }
  const uBigger = u.w * u.h > m.img.w * m.img.h
  if (uBigger) better++
  console.log(`  ${String(id).padStart(3)}   ${String(m.img.w + 'x' + m.img.h).padEnd(12)} -> ${String(u.w + 'x' + u.h).padEnd(12)} ${uBigger ? '★ Unity 更大' : '  我这边更大'}` +
    `   ${(fs.statSync(path.join(ROOT, u.file)).size / 1024).toFixed(0)}KB (Unity) / ${(m.bytes / 1024).toFixed(0)}KB (我)`)
}
console.log(`\n前 30 张里 Unity 分辨率更高的有 ${better} 张`)

// 拼一张对照：挑 3 张并排（上=我的，下=Unity 的）
const pick = both.filter((id) => mineInfo(id) && uni.get(id)).slice(0, 3)
if (pick.length) {
  const CW = 440, CH = Math.round(CW * 560 / 960), PAD = 8
  const W = pick.length * (CW + PAD) + PAD, H = 2 * (CH + PAD) + PAD
  const canvas = { width: W, height: H, _fb: makeFramebuffer(W, H), style: {} }
  const ctx = new PixelCtx(canvas)
  ctx.fillStyle = '#0c121c'; ctx.fillRect(0, 0, W, H)
  pick.forEach((id, i) => {
    const cx = PAD + i * (CW + PAD)
    const m = mineInfo(id)
    ctx.drawImage({ _pixels: m.img }, cx, PAD, CW, CH)
    const u = decodePng(fs.readFileSync(path.join(ROOT, uni.get(id).file)))
    ctx.drawImage({ _pixels: u }, cx, PAD * 2 + CH, CW, CH)
  })
  fs.writeFileSync(path.join(ROOT, 'docs', 'sheets', '_scenes_compare.png'), encodePng(W, H, canvas._fb))
  console.log('对照图 -> docs/sheets/_scenes_compare.png（上排=我的 960×560，下排=Unity 包 1440×840）')
  console.log('  参与对比的场景编号: ' + pick.join(', '))
}

fs.writeFileSync(path.join(ROOT, '_tools', '_unity_scenes.json'), JSON.stringify({
  both, onlyUni, onlyMine,
  unity: [...uni].map(([id, t]) => ({ id, file: t.file, w: t.w, h: t.h })),
}, null, 1))
