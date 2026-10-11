// 在导出的 Unity 贴图里找"多比形象"，并与缺图的 25 只形态对上
import fs from 'node:fs'
import path from 'node:path'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const DIR = path.join(ROOT, '_tmp_test_out/unity-textures')
const cat = JSON.parse(fs.readFileSync(path.join(ROOT, '_tmp_test_out/unity-catalog.json'), 'utf8'))
console.log(`共 ${cat.textures.length} 张贴图`)

// 缺图的形态名（与清单一致）
const MISSING = ['德拉科·龙', '克罗娅', '草多比', '赤色多比', '电多比', '机械多比', '英雄多比', '炙热多比',
  '布雷泽 焰', '冷焰', '水多比', '风狼多比', '风灵多比', '斯拉希·刚', '温德·冽', '钢之多比', '晶石多比',
  '修罗·岚', '修罗·魔', '修罗·愈', '修罗·源', '岩石多比', 'VIP土多比', '阳多比', '阴多比']
const norm = (s) => String(s).replace(/[\s·・_]/g, '')
const missSet = MISSING.map(norm)

console.log('\n=== 名字里直接含缺失形态名的贴图 ===')
let hit = 0
for (const t of cat.textures) {
  const n = norm(t.name)
  const m = missSet.find((k) => n.includes(k))
  if (m) { hit++; console.log(`  ✓ ${t.w}×${t.h}  ${t.name}   (匹配「${m}」)`) }
}
console.log(`  → ${hit} 张直接命中`)

// 找"可能是多比立绘"的：竖长比例 + 尺寸够大
console.log('\n=== 可能是多比立绘的（高>=200 且 高/宽 >= 1.1）===')
const cand = cat.textures.filter((t) => t.h >= 200 && t.h / t.w >= 1.1 && !/logo|Splash|Unity|Inline|font/i.test(t.name))
  .sort((a, b) => b.h - a.h)
for (const t of cand.slice(0, 30)) console.log(`  ${String(t.w).padStart(4)}×${String(t.h).padStart(4)}  ${t.name}  [${t.type}]`)
console.log(`  → 共 ${cand.length} 张候选`)

// 按名字分组，看有哪些"成组"的资源（多比常按形态成组）
console.log('\n=== 名字前缀出现最多的（>=3 次）===')
const pref = {}
for (const t of cat.textures) {
  const p = String(t.name).replace(/[_\s].*$/, '').slice(0, 12)
  pref[p] = (pref[p] || 0) + 1
}
for (const [p, n] of Object.entries(pref).sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${String(n).padStart(3)}  ${p}`)
