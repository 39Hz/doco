// 穷举匹配：17 个已知图标（已核对过）在 74 个图鉴裁图里各找最像的
// 结果能一次性回答：① 两张图鉴是不是同一批图 ② 我的行列对应对不对
import fs from 'node:fs'
import path from 'node:path'
import { decodePng } from './pixel-canvas.mjs'
import vm from 'node:vm'

const ROOT = path.resolve('.')
const DIR = path.join(ROOT, 'assets/skills')
const ATLAS = path.join(ROOT, '_tmp_test_out/skill-atlas-icons')
const man = JSON.parse(fs.readFileSync(path.join(ATLAS, 'manifest.json'), 'utf8'))

// 已知图标（游戏里已核对过的 17 个）
const ctx = { window: {} }
vm.createContext(ctx)
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/forms.js'), 'utf8'), ctx)
const sk = ctx.window.__DKDbb_FORMS__.skills || {}

const norm = (img, S = 64) => {
  const out = new Float32Array(S * S * 4)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const sx = Math.min(img.w - 1, Math.floor(x * img.w / S)), sy = Math.min(img.h - 1, Math.floor(y * img.h / S))
    const si = (sy * img.w + sx) * 4, di = (y * S + x) * 4
    out[di] = img.data[si]; out[di + 1] = img.data[si + 1]; out[di + 2] = img.data[si + 2]; out[di + 3] = img.data[si + 3]
  }
  return out
}
const dist = (a, b) => {
  let s = 0, n = 0
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] < 40 && b[i + 3] < 40) continue
    s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n++
  }
  return n ? s / n / 3 : 999
}

const atlas = []
for (const r of man.rows) {
  for (let k = 0; k < r.files.length; k++) {
    const p = path.join(ATLAS, r.files[k])
    if (!fs.existsSync(p)) continue
    atlas.push({ row: r.row, col: k, el: r.suggest, n: norm(decodePng(fs.readFileSync(p))) })
  }
}
console.log(`图鉴裁图 ${atlas.length} 个 · 已知图标 ${Object.keys(sk).length} 个\n`)

console.log('已知技能 → 最像的图鉴位置')
const rows = []
for (const [name, rec] of Object.entries(sk)) {
  const p = path.join(DIR, rec.icon + '.png')
  if (!fs.existsSync(p)) continue
  const A = norm(decodePng(fs.readFileSync(p)))
  const scored = atlas.map((a) => ({ a, d: dist(A, a.n) })).sort((x, y) => x.d - y.d)
  const b = scored[0], s2 = scored[1]
  rows.push({ name, icon: rec.icon, row: b.a.row, col: b.a.col, el: b.a.el, d: b.d, d2: s2.d })
  console.log(`  ${name.padEnd(9)} (${rec.icon})  →  行${String(b.a.row).padStart(2)}列${b.a.col} [${b.a.el}]  色差 ${b.d.toFixed(1)}（次近 ${s2.d.toFixed(1)} 行${s2.a.row}列${s2.a.col}）`)
}

const good = rows.filter((r) => r.d < 12 && (r.d2 - r.d) > 3)
console.log(`\n可信匹配（色差<12 且与次近差距>3）：${good.length} / ${rows.length}`)
if (good.length) {
  console.log('\n=== 可信匹配 ===')
  for (const g of good) console.log(`  ${g.name}  =  行${g.row} 列${g.col}（${g.el}）色差 ${g.d.toFixed(1)}`)
  // 按行分组看是否自洽
  const byRow = {}
  for (const g of good) (byRow[g.row] = byRow[g.row] || []).push(g)
  console.log('\n按行分组（若自洽，同一元素的技能应落在同一/相邻行）：')
  for (const [r, list] of Object.entries(byRow).sort((a, b) => a[0] - b[0])) {
    console.log(`  行${r}: ${list.map((x) => `${x.name}@col${x.col}`).join('  ')}`)
  }
} else {
  console.log('\n→ 没有可信匹配：说明这张图鉴与已有 17 个图标**不是同一批图**（不同画法/不同版本）')
}
