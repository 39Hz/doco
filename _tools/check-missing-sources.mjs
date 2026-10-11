// 逐个检查"我缺的 22 只怪"在各素材源里到底存不存在。
// 三个来源：图鉴（73 格编号可读） / monster_*.swf / monster_*.fla / 文件名权威表。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const gd = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'gamedata.json'), 'utf8'))
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'monsters', 'map.json'), 'utf8'))

// 已经用图鉴精确对上的（slice 脚本里那张表）
const DONE = new Set([10002, 10003, 10005, 10006, 10007, 10009, 10010, 10011, 10013, 10015, 10022, 10023, 19008, 19012])
const missing = gd.monsters.filter((m) => !DONE.has(Number(m.id))).map((m) => ({
  id: Number(m.id), name: m.name, element: m.element || '无', size: Number(m.size) || 90,
}))
console.log('我缺的怪: ' + missing.length + ' 只')

// 收集素材文件名里的名字
const allFiles = []
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else allFiles.push(path.basename(p))
  }
}
walk(path.join(ROOT, '多克多比专区资料素材'))

const norm = (s) => String(s).replace(/[\s·・\-_()（）]/g, '')
const flaNames = new Map(), swfNames = new Map()
for (const f of allFiles) {
  const m = f.match(/^monster_(\d+)_?([^.]*)\.(fla|swf)$/i)
  if (!m) continue
  const key = norm(m[2])
  if (!key) continue
  if (m[3].toLowerCase() === 'fla') flaNames.set(key, m[1] + '_' + m[2])
  else swfNames.set(key, m[1] + '_' + m[2])
}
console.log('素材文件名里有名字的: FLA ' + flaNames.size + ' 个，SWF ' + swfNames.size + ' 个\n')

// 图鉴里我尚未使用、且是真实立绘的格子（按 _atlas_slots.json 的饱和度判定）
const slots = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', '_atlas_slots.json'), 'utf8'))
const ATLAS_NAME = {
  110002: '绿毒史莱姆', 110003: '绿毒粘液兽', 110005: '粘壳虫', 110006: '空灵树妖',
  110007: '晶石树妖', 110009: '阴孩', 110010: '吞噬魔', 110011: '克里奥佩特拉',
  110013: '莲蓬童子', 110015: '鲤鱼将军', 110022: '赛罗特', 110023: '托米拉',
  119008: '拉乌比I型', 119012: '魔龙',
}
const freeSlots = slots.filter((s) => !s.ghost && !ATLAS_NAME[s.atlas])
console.log('图鉴里尚未使用、且是真实立绘的格子: ' + freeSlots.length + ' 个')
console.log('  ' + freeSlots.map((s) => s.atlas + '(' + s.w + 'x' + s.h + ')').join(' '))

console.log('\n=== 缺的 22 只：各来源有无 ===')
console.log('ID      名字        尺寸  图鉴   FLA           SWF')
for (const m of missing.sort((a, b) => b.size - a.size)) {
  const k = norm(m.name)
  const inAtlas = Object.entries(ATLAS_NAME).find(([, n]) => norm(n) === k)
  const fla = flaNames.get(k) || (k.length >= 2 ? [...flaNames].find(([kk]) => kk.includes(k)) : null)
  const swf = swfNames.get(k) || (k.length >= 2 ? [...swfNames].find(([kk]) => kk.includes(k)) : null)
  console.log(
    String(m.id).padEnd(7) + m.name.padEnd(12) + String(m.size).padStart(4) + '  ' +
    (inAtlas ? inAtlas[0] : ' ✗ ').padEnd(9) +
    (fla ? fla[1].padEnd(14) : '✗'.padEnd(14)) +
    (swf ? swf[1] : '✗')
  )
}
