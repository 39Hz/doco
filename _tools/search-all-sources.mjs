// 彻底搜一遍：19 只"没有立绘"的怪，到底哪都没画，还是我漏了目录。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const TARGETS = ['哈拉兽', '萨西怪', '暗影孢子', '妮可鼠', '八爪鱼', '大蘑菇', '赛贝猪', '雷暴鲁巴',
  '大幽灵', '贪食花', '卢比兽', '翼纹喵', '蛇面蝙蝠', '魔化多比', '魔化河伯', '莎恩',
  '火球怪', '熔岩怪', '怨灵', '堕落天使', '猎犬酥皮', '螳螂阿力']

// 收集全盘文件名（排除我自己的产出目录）
const files = []
function walk(d, depth) {
  if (depth > 8) return
  let ents
  try { ents = fs.readdirSync(d, { withFileTypes: true }) } catch (e) { return }
  for (const e of ents) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) {
      if (/^(dist|_apk|_swf|_tools|_stage|docs|\.git|node_modules)$/.test(e.name)) continue
      walk(p, depth + 1)
    } else files.push(p)
  }
}
walk(ROOT, 0)
console.log('扫描文件数: ' + files.length)

// 按文件名匹配
console.log('\n=== 文件名里直接带怪物名的 ===')
let hitFile = 0
for (const t of TARGETS) {
  const hits = files.filter((f) => path.basename(f).includes(t))
  if (hits.length) {
    hitFile++
    console.log('  ' + t + ': ' + hits.length + ' 个')
    hits.slice(0, 4).forEach((h) => console.log('      ' + h.replace(ROOT + path.sep, '')))
  }
}
if (!hitFile) console.log('  （一个都没有）')

// 按图鉴编号匹配（110xxx / 119xxx）
console.log('\n=== 文件名里带图鉴编号的（110xxx/119xxx/100xx/190xx）===')
const idMap = {}
for (const t of TARGETS) idMap[t] = true
// 怪兽表 → 这些怪的名字对应哪个图鉴编号（用文件名权威表）
const nameMap = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', '_atlas_names.json'), 'utf8')).fromFilenames } catch (e) { return {} }
})()
const atlasIds = []
for (const [aid, nm] of Object.entries(nameMap)) {
  if (nm && TARGETS.includes(nm)) atlasIds.push({ aid, nm })
}
console.log('  权威表里能对上的: ' + (atlasIds.length ? atlasIds.map((x) => x.aid + '_' + x.nm).join(', ') : '无'))
const wantIds = atlasIds.map((x) => x.aid)
for (const w of wantIds) {
  const hits = files.filter((f) => path.basename(f).includes(w))
  console.log('  ' + w + ': ' + hits.length + ' 个' + (hits.length ? '  ' + hits.slice(0, 3).map((h) => path.basename(h)).join(', ') : ''))
}

// 所有资源目录概况（帮我确认没漏）
console.log('\n=== 顶层目录概况（有没有我没看过的资源目录）===')
for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!e.isDirectory()) continue
  if (/^(dist|_apk|_swf|_tools|_stage|docs|\.git|node_modules)$/.test(e.name)) continue
  let n = 0
  const count = (d) => {
    try { for (const x of fs.readdirSync(d, { withFileTypes: true })) { if (x.isDirectory()) count(path.join(d, x.name)); else n++ } } catch (e2) { }
  }
  count(path.join(ROOT, e.name))
  console.log('  ' + e.name.padEnd(34) + n + ' 文件')
}
