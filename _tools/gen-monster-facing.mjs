// 生成「怪物素材朝向表」：哪些怪的立绘**天然朝右**（战斗里必须翻才能面对玩家）
//
// 【为什么落成数据文件】战斗里"怪物必须朝向玩家"，但素材朝向并不统一：
//   实测 36 只里 **27 只朝左、9 只朝右**（判据：眼白重心相对整头重心的偏移，
//   见 `_tools/probe-monster-facing.mjs`）。用一个全局开关必然让其中一批背对玩家
//   （第 55 轮就是这么错的：给所有怪加翻转 → 本来朝左的 27 只反而朝右了）。
//   所以把"朝右的那 9 只"落成清单，运行时按 id 查。
//
// 产出：assets/monsters/facing-right.json（+ 打印成可直接粘进 game.js 的数组）
// 用法: node _tools/gen-monster-facing.mjs
import fs from 'node:fs'
import path from 'node:path'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const raw = fs.readFileSync(path.join(ROOT, 'assets/monsters/map.js'), 'utf8')
const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
const det = j.detail || []

// 与 probe-monster-facing.mjs 同一套判据（这里内联，避免两个脚本各写一份会漂）
function facing(p) {
  const img = decodePng(fs.readFileSync(p))
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.data[(y * img.w + x) * 4 + 3] > 40) {
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return { dir: '?', off: 0, eyes: 0 }
  const hy = y0 + Math.round((y1 - y0) * 0.5)
  const mid = (x0 + x1) / 2
  let hx = 0, hn = 0
  for (let y = y0; y <= hy; y++) for (let x = x0; x <= x1; x++) {
    if (img.data[(y * img.w + x) * 4 + 3] > 60) { hx += x; hn++ }
  }
  const seen = new Uint8Array(img.w * img.h)
  const blobs = []
  for (let y = y0; y <= hy; y++) for (let x = x0; x <= x1; x++) {
    const p2 = y * img.w + x
    if (seen[p2]) continue
    const i = p2 * 4
    const lum = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3
    const sat = Math.max(img.data[i], img.data[i + 1], img.data[i + 2]) - Math.min(img.data[i], img.data[i + 1], img.data[i + 2])
    if (img.data[i + 3] < 60 || lum < 205 || sat > 40) continue
    const q = [p2]; seen[p2] = 1
    let sx = 0, n = 0
    while (q.length) {
      const c = q.pop()
      const cx2 = c % img.w, cy2 = (c / img.w) | 0
      const ci = c * 4
      const cl = (img.data[ci] + img.data[ci + 1] + img.data[ci + 2]) / 3
      const cs = Math.max(img.data[ci], img.data[ci + 1], img.data[ci + 2]) - Math.min(img.data[ci], img.data[ci + 1], img.data[ci + 2])
      if (img.data[ci + 3] < 60 || cl < 205 || cs > 40) continue
      sx += cx2; n++
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx2 + ddx, ny = cy2 + ddy
        if (nx < x0 || nx > x1 || ny < y0 || ny > hy) continue
        const np = ny * img.w + nx
        if (!seen[np]) { seen[np] = 1; q.push(np) }
      }
    }
    if (n >= 8) blobs.push({ cx: sx / n, n })
  }
  const headCx = hn ? hx / hn : mid
  blobs.sort((a, b) => a.n - b.n)
  const eyes = blobs.slice(-2)
  if (eyes.length && hn) {
    const eyeCx = eyes.reduce((s, e) => s + e.cx, 0) / eyes.length
    const off = eyeCx - headCx
    return { dir: off < 0 ? '左' : '右', off, eyes: blobs.length, by: '眼白' }
  }
  const off = headCx - mid
  return { dir: off < 0 ? '左' : '右', off, eyes: 0, by: '整头重心' }
}

const out = []
for (const d of det) {
  const p = path.join(ROOT, d.sprite)
  if (!fs.existsSync(p)) continue
  const f = facing(p)
  out.push({ id: d.id, name: d.name, dir: f.dir, off: +f.off.toFixed(1), by: f.by, precise: String(d.source || '').startsWith('atlas') })
}
const right = out.filter((r) => r.dir === '右')
console.log(`共 ${out.length} 只：朝左 ${out.filter((r) => r.dir === '左').length} / 朝右 ${right.length}`)
console.log(`\n★ 战斗里需要翻转（素材朝右）的 ${right.length} 只：`)
for (const r of right) console.log(`  ${r.id}  ${r.name.padEnd(9)} 偏移 +${r.off}  判据=${r.by}  ${r.precise ? '(精确立绘)' : '(替身)'}`)

const data = { generated: new Date().toISOString(), method: '眼白重心相对整头重心的偏移；偏右=素材朝右', needFlipInBattle: right.map((r) => r.id), all: out }
fs.writeFileSync(path.join(ROOT, 'assets/monsters/facing-right.json'), JSON.stringify(data, null, 1))
console.log(`\n已写出 assets/monsters/facing-right.json`)
console.log(`\n可直接粘进 game.js 的数组：\n[${right.map((r) => r.id).join(', ')}]`)
