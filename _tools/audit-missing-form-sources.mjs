// 对"没有立绘"的 25 个形态，逐个搜归档里到底有没有素材
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const ARCH = path.join(ROOT, '多克多比专区资料素材')
const imgExt = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'])

// 建归档图片索引
const files = []
;(function walk(d, dep) {
  if (dep > 7) return
  let es
  try { es = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
  for (const e of es) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, dep + 1)
    else if (imgExt.has(path.extname(e.name).toLowerCase())) files.push(p)
  }
})(ARCH, 0)
console.log(`归档图片 ${files.length} 张\n`)

const norm = (s) => String(s).replace(/[\s·・]/g, '')
// 待查名单：形态名 + 可能的别名（去掉"多比"后缀等）
const names = ['德拉科·龙', '克罗娅', '草多比', '赤色多比', '电多比', '机械多比', '英雄多比', '炙热多比',
  '布雷泽 焰', '冷焰', '水多比', '风狼多比', '风灵多比', '斯拉希·刚', '温德·冽', '钢之多比', '晶石多比',
  '修罗·岚', '修罗·魔', '修罗·愈', '修罗·源', '岩石多比', 'VIP土多比', '阳多比', '阴多比']

let hit = 0
for (const n of names) {
  const key = norm(n).replace(/多比$/, '')
  const found = files.filter((f) => norm(path.basename(f)).includes(key))
  if (found.length) {
    hit++
    console.log(`✓ ${n}  →  ${found.length} 张`)
    for (const f of found.slice(0, 4)) {
      const sz = fs.statSync(f).size
      console.log(`     ${(sz / 1024).toFixed(0)}KB  ${f.replace(ARCH + path.sep, '')}`)
    }
  } else {
    console.log(`✗ ${n}  →  归档里没有`)
  }
}
console.log(`\n结果：${hit} / ${names.length} 个形态在归档里找到了素材`)
