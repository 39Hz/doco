// 核验内嵌图标：base64 → 反解成 PNG，与磁盘上的原图逐像素比对
//
// 这一步很关键：内嵌是"手工搬运"，如果不逐像素验，很可能出现"图被压扁/颜色错乱"
// 而看不出来（本项目踩过"形象用错"的坑，所以宁可多验一道）。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const GEN = path.join(ROOT, '多克多比-2026.2/decompiled/src/DkdbbForms.generated.cs')
const forms = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/forms.json'), 'utf8')).forms
const byName = new Map(forms.map((f) => [f.name, f]))

const t = fs.readFileSync(GEN, 'utf8')
// 逐条 FormDef 抓 name 与 iconB64
const re = /name = "((?:[^"\\]|\\.)*)"[\s\S]*?iconB64 = "([A-Za-z0-9+/=]+)"/g
const hits = []
let m
while ((m = re.exec(t)) !== null) hits.push({ name: JSON.parse('"' + m[1] + '"'), b64: m[2] })
console.log(`解析到带图标的形态：${hits.length} 个`)

let ok = 0, mismatch = 0, checked = 0
const SIZE = 96
for (const h of hits) {
  const f = byName.get(h.name)
  if (!f) { console.log(`  ⚠️ 形态表里没有 ${h.name}`); continue }
  const rel = f.artIcon
  if (!rel) { console.log(`  ⚠️ ${h.name} 有图标数据但表单里没有 artIcon`); continue }
  const src = decodePng(fs.readFileSync(path.join(ROOT, rel)))
  const raw = Buffer.from(h.b64, 'base64')
  if (raw.length !== SIZE * SIZE * 4) { console.log(`  ✗ ${h.name} 字节数不对：${raw.length}`); mismatch++; continue }
  // 与"按同规则缩放后的原图"逐像素比
  let diff = 0
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const sx = Math.min(src.w - 1, Math.floor(x * src.w / SIZE))
      const sy = Math.min(src.h - 1, Math.floor(y * src.h / SIZE))
      const s = (sy * src.w + sx) * 4, d = (y * SIZE + x) * 4
      if (raw[d] !== src.data[s] || raw[d + 1] !== src.data[s + 1] || raw[d + 2] !== src.data[s + 2] || raw[d + 3] !== src.data[s + 3]) diff++
    }
  }
  checked++
  if (diff === 0) ok++
  else { mismatch++; console.log(`  ✗ ${h.name} 有 ${diff} 个像素不一致`) }
  // 顺手把第一张内嵌图还原成 PNG，供肉眼复核
  if (checked === 1) {
    const out = path.join(ROOT, '_tmp_test_out/embedded-icon-sample.png')
    fs.writeFileSync(out, encodePng(SIZE, SIZE, new Uint8ClampedArray(raw)))
    console.log(`  首张已还原：${path.relative(ROOT, out)}（${h.name}）`)
  }
}
console.log(`\n逐像素比对：一致 ${ok} · 不一致 ${mismatch} · 共查 ${checked}`)
console.log(ok === checked && checked > 0 ? '✓ 内嵌图标与原图完全一致' : '✗ 有图标搬运出错')
process.exit(ok === checked && checked > 0 ? 0 : 1)
