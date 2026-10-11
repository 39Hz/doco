// 从素材文件名 `monster_<图鉴编号>_<名字>.fla/.swf` 提取权威的「图鉴编号 ↔ 怪物名」映射。
//
// 这条线索是破局关键：前面几版都在"看图鉴上的数字"上打转（数字与立绘粘连、
// 有些格子的编号被黑条涂掉、自动 OCR 不稳），而素材文件名本身就带着编号和名字，
// 且与图鉴编号同源（实测 110022=赛罗特、110025=武装采矿机，与图上立绘吻合）。
//
// 有了它，怪物立绘就可以按**名字**精确对应到「怪兽.xlsx」的 36 只怪，不再靠猜。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const found = []
function walk(d) {
  let ents
  try { ents = fs.readdirSync(d, { withFileTypes: true }) } catch (e) { return }
  for (const e of ents) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) { walk(p); continue }
    const m = e.name.match(/^monster_(\d+)_?([^.]*)\.(fla|swf|png|jpg)$/i)
    if (m) found.push({ id: m[1], name: m[2].trim(), ext: m[3].toLowerCase(), file: p.replace(ROOT + path.sep, '') })
  }
}
walk(path.join(ROOT, '多克多比专区资料素材'))

// 去重（同编号可能同时有 fla 与 swf；有的名字为空）
const byId = new Map()
for (const f of found) {
  const cur = byId.get(f.id)
  if (!cur || (!cur.name && f.name)) byId.set(f.id, f)
}
console.log('从文件名提取到 ' + byId.size + ' 条「图鉴编号 → 名字」')

// 读游戏怪物表
const gd = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'gamedata.json'), 'utf8'))
const monsters = gd.monsters.map((m) => ({ id: Number(m.id), name: (m.name || '').trim(), element: m.element || '无', size: Number(m.size) || 90 }))

// 按名字把游戏怪物对上图鉴编号
function norm(s) { return String(s).replace(/[\s·・\-_]/g, '').replace(/多比$/, '') }
const atlasByName = new Map()
for (const [id, f] of byId) if (f.name) atlasByName.set(norm(f.name), Number(id))

console.log('\n=== 逐个匹配（游戏怪物 ← 图鉴编号）===')
const matched = []
const unmatched = []
for (const mon of monsters) {
  const key = norm(mon.name)
  let aid = atlasByName.get(key)
  // 别名兜底
  if (!aid) {
    const ALIAS = {
      哈拉兽: 110001, 绿毒史莱姆: 110002, 绿毒粘液兽: 110003, 萨西怪: 110004, 粘壳虫: 110005,
      空灵树妖: 110006, 晶石树妖: 110007, 暗影孢子: 110008, 阴孩: 110009, 吞噬魔: 110010,
      克里奥佩特拉: 110011, 堕落天使: 110012, 莲蓬童子: 110013, 怨灵: 110014, 鲤鱼将军: 110015,
      熔岩怪: 110017, 火球怪: 110016, 妮可鼠: 110018, 八爪鱼: 110019, 大蘑菇: 110020,
      赛贝猪: 110021, 赛罗特: 110022, 托米拉: 110023,
      雷暴鲁巴: 119001, 大幽灵: 119002, 猎犬酥皮: 119003, 螳螂阿力: 119004, 贪食花: 119005,
      卢比兽: 119006, 翼纹喵: 119007, 拉乌比I型: 119008, 蛇面蝙蝠: 119009, 魔化多比: 119010,
      魔化河伯: 119011, 魔龙: 119012, 莎恩: 119013,
    }
    aid = ALIAS[mon.name]
  }
  if (aid) {
    const f = byId.get(String(aid))
    matched.push({ ...mon, atlasId: aid, atlasName: f ? f.name : '' })
    console.log('  ' + String(mon.id).padEnd(6) + mon.name.padEnd(11) + ' ← 图鉴' + aid + '  ' + (f ? f.name : '(文件名无名字)'))
  } else {
    unmatched.push(mon)
    const guess = [...byId.values()].filter((f) => f.name && (norm(f.name).includes(key) || key.includes(norm(f.name))))
    console.log('  ' + String(mon.id).padEnd(6) + mon.name.padEnd(11) + ' ✗ 没匹配上' + (guess.length ? '  候选: ' + guess.map((g) => g.id + '_' + g.name).join(',') : ''))
  }
}
console.log('\n匹配成功 ' + matched.length + '/' + monsters.length)
if (unmatched.length) console.log('未匹配: ' + unmatched.map((m) => m.name).join('、'))

fs.writeFileSync(path.join(ROOT, '_tools', '_atlas_names.json'), JSON.stringify({
  fromFilenames: Object.fromEntries([...byId].map(([k, v]) => [k, v.name])),
  matched,
  unmatched,
}, null, 1), 'utf8')
console.log('\n已写 _tools/_atlas_names.json')

console.log('\n=== 文件名里出现但游戏没用的怪（说明图鉴比怪兽表全）===')
const usedAtlas = new Set(matched.map((m) => m.atlasId))
const extra = [...byId.values()].filter((f) => !usedAtlas.has(Number(f.id)) && f.name)
console.log('共 ' + extra.length + ' 个: ' + extra.slice(0, 18).map((f) => f.id + '_' + f.name).join(', ') + (extra.length > 18 ? ' …' : ''))
