// 量出每只怪**素材朝哪边**，从而决定战斗里要不要翻。
//
// 【判据：眼睛】怪物的脸/眼是最可靠的朝向信号：
//   把头部区域里"**亮且低饱和**"（眼白）的像素聚类，取重心；
//   重心偏左 = 眼睛在左 = 朝**右**看（面向观众右侧）；偏右 = 朝左。等等 ——
//   ⚠️ 这里别绕晕：我们只要一个**稳定且可复核**的量。真正判定用的是
//   **"眼白重心"相对"整头重心"的偏移**：
//     眼睛长在脸的**正面**，所以「眼睛偏向哪一侧」= 角色**面朝哪一侧**。
//   为什么不用"亮部重心"（上一版）：整张脸都白的立绘（龙多比）会失效；
//   而**先定位眼睛（小而亮的圆点）再看它偏哪边**更稳。
//
// 用法: node _tools/probe-monster-facing.mjs      → 输出逐只结论 + 汇总
import fs from 'node:fs'
import path from 'node:path'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const raw = fs.readFileSync(path.join(ROOT, 'assets/monsters/map.js'), 'utf8')
const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
const det = j.detail || []

const rows = []
for (const d of det) {
  const p = path.join(ROOT, d.sprite)
  if (!fs.existsSync(p)) { rows.push({ name: d.name, dir: '?', why: '缺文件' }); continue }
  const img = decodePng(fs.readFileSync(p))
  // 主体包围盒
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.data[(y * img.w + x) * 4 + 3] > 40) {
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
  if (x1 < 0) { rows.push({ name: d.name, dir: '?', why: '全透明' }); continue }
  // 头部 = 上 50%
  const hy = y0 + Math.round((y1 - y0) * 0.5)
  const mid = (x0 + x1) / 2
  // 整头重心（所有不透明像素）
  let hx = 0, hn = 0
  // 眼白候选：亮(>205) 且 低饱和(<=40)，以连通块聚类，取"块数>=1 且块面积适中"的中心
  const seen = new Uint8Array(img.w * img.h)
  const blobs = []
  for (let y = y0; y <= hy; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * img.w + x) * 4
    if (img.data[i + 3] > 60) { hx += x; hn++ }
  }
  for (let y = y0; y <= hy; y++) {
    for (let x = x0; x <= x1; x++) {
      const p2 = y * img.w + x
      if (seen[p2]) continue
      const i = p2 * 4
      const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2]
      const lum = (r + g + b) / 3, sat = Math.max(r, g, b) - Math.min(r, g, b)
      if (img.data[i + 3] < 60 || lum < 205 || sat > 40) continue
      // 洪水填这一段亮块
      const q = [p2]; seen[p2] = 1
      let sx = 0, n = 0, bx0 = x, bx1 = x, by0 = y, by1 = y
      while (q.length) {
        const c = q.pop()
        const cx2 = c % img.w, cy2 = (c / img.w) | 0
        const ci = c * 4
        const cr = img.data[ci], cg = img.data[ci + 1], cb = img.data[ci + 2]
        const cl = (cr + cg + cb) / 3, cs = Math.max(cr, cg, cb) - Math.min(cr, cg, cb)
        if (img.data[ci + 3] < 60 || cl < 205 || cs > 40) continue
        sx += cx2; n++
        if (cx2 < bx0) bx0 = cx2; if (cx2 > bx1) bx1 = cx2
        if (cy2 < by0) by0 = cy2; if (cy2 > by1) by1 = cy2
        for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx2 + ddx, ny = cy2 + ddy
          if (nx < x0 || nx > x1 || ny < y0 || ny > hy) continue
          const np = ny * img.w + nx
          if (!seen[np]) { seen[np] = 1; q.push(np) }
        }
      }
      if (n >= 8) blobs.push({ cx: sx / n, n, w: bx1 - bx0 + 1, h: by1 - by0 + 1 })
    }
  }
  const headCx = hn ? hx / hn : mid
  // 眼睛 = 最靠上的 1~2 个亮块（脸在头上部）
  blobs.sort((a, b) => a.n - b.n)
  const eyes = blobs.slice(-2)
  const eyeCx = eyes.length ? eyes.reduce((s, e) => s + e.cx, 0) / eyes.length : null
  let dir = '?', why = ''
  if (eyeCx !== null && hn) {
    const off = eyeCx - headCx
    dir = off < 0 ? '左' : '右'
    why = `眼白块 ${blobs.length} 个，眼重心偏移 ${off > 0 ? '+' : ''}${off.toFixed(1)}px`
  } else if (hn) {
    const off = headCx - mid
    dir = off < 0 ? '左' : '右'
    why = `没找到眼白，退回整头重心偏移 ${off > 0 ? '+' : ''}${off.toFixed(1)}px`
  }
  rows.push({ name: d.name, dir, why, precise: String(d.source || '').startsWith('atlas') })
}

const L = rows.filter((r) => r.dir === '左').length
const R = rows.filter((r) => r.dir === '右').length
const Q = rows.filter((r) => r.dir === '?').length
console.log(`素材朝向（眼白重心判据）：朝左 ${L} / 朝右 ${R} / 判不出 ${Q}\n`)
console.log('逐只：')
for (const r of rows) {
  console.log(`  ${r.precise ? '✓' : ' '} ${String(r.name).padEnd(9)} → 素材朝**${r.dir}**   ${r.why}`)
}
console.log(`\n★ 战斗规则：玩家在左、怪物在右 → 怪物要**朝左**对着玩家。`)
console.log(`  素材已朝左的 ${L} 只 → **不用翻**；素材朝右的 ${R} 只要翻。`)
