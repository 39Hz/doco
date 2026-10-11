// 建立「游戏怪物 -> 图鉴立绘」映射，写入 assets/monsters/map.json
//
// 图鉴立绘没有可靠的 ID 标注（编号文字与立绘粘连、自动识别不稳定），
// 所以这里按「原表记录的美术尺寸」排序做确定性映射：
//   怪兽.xlsx 的「参考图」列给的是每只怪物的美术尺寸，与图鉴里立绘的相对大小一致。
// 因此在同一分组内按尺寸排序后一一对应，得到一份**一致且可复核**的映射。
// 结果会写进 JSON 并附上双方尺寸，便于人工核对与替换。
//
// 用法: node map-monsters.mjs <项目根>
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.resolve(process.argv[2] || '.')
const MDIR = path.join(ROOT, 'assets', 'monsters')

// 读立绘实际尺寸（用 PNG 头，不用解码）
function pngSize(p) {
  const b = fs.readFileSync(p)
  let off = 8, w = 0, h = 0
  while (off + 8 <= b.length) {
    const len = b.readUInt32BE(off)
    const t = b.toString('ascii', off + 4, off + 8)
    if (t === 'IHDR') { w = b.readUInt32BE(off + 8); h = b.readUInt32BE(off + 12); break }
    off += 12 + len
  }
  return { w, h }
}

// 立绘：直接扫描目录里实际存在的 m_*.png，
// 不从 index.json 读 —— 那个文件是切片时写的，过滤脚本重编号后就过期了
// （之前就是这么错位的：映射引用了 8 个已被删掉的文件）。
const spriteFiles = fs.readdirSync(MDIR)
  .filter((f) => /^m_\d+\.png$/.test(f))
  .sort()
const sprites = spriteFiles.map((f) => {
  const p = path.join(MDIR, f)
  const size = pngSize(p)
  return { file: `assets/monsters/${f}`, area: size.w * size.h, w: size.w, h: size.h }
}).sort((a, b) => b.area - a.area)

// 游戏怪物表：ID / 名字 / 原表记录的美术尺寸
const gd = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'gamedata.json'), 'utf8'))
const monsters = gd.monsters.filter((m) => m.type !== 'BOSS' || true)

// 立绘：按内容框面积排序（大 -> 小）
// （sprites 已在上面按实际文件构建好）

// 怪物：按原表美术尺寸排序（大 -> 小）
const rows = monsters
  .map((m) => ({ id: m.id, name: m.name, element: m.element, size: Number(m.size) || 90 }))
  .sort((a, b) => b.size - a.size)

console.log(`立绘 ${sprites.length} 个，游戏怪物 ${rows.length} 只`)
if (sprites.length < rows.length) {
  console.log(`  ⚠ 立绘不足，缺口 ${rows.length - sprites.length} 只（这些怪会用色块兜底）`)
}

// 按排名比例对应：第 i 只怪物 -> 第 round(i * (sprites-1)/(rows-1)) 个立绘
const map = {}
rows.forEach((m, i) => {
  const k = rows.length === 1 ? 0 : Math.round(i * (sprites.length - 1) / (rows.length - 1))
  const s = sprites[Math.min(sprites.length - 1, k)]
  map[m.id] = s.file
})

const out = {
  generated: new Date().toISOString(),
  method: 'size-rank matching（按原表美术尺寸与立绘面积各自排序后一一对应）',
  note: '图鉴立绘的编号无法可靠自动识别，此映射为一致性近似；可用同名替换人工校正。',
  sprites: sprites.length,
  monsters: rows.length,
  map,
  detail: rows.map((m, i) => {
    const k = rows.length === 1 ? 0 : Math.round(i * (sprites.length - 1) / (rows.length - 1))
    const s = sprites[Math.min(sprites.length - 1, k)]
    return { id: m.id, name: m.name, size: m.size, sprite: s.file, artSize: `${s.w}x${s.h}` }
  }),
}
fs.writeFileSync(path.join(MDIR, 'map.json'), JSON.stringify(out, null, 2))
// 供 file:// 直接加载
fs.writeFileSync(path.join(MDIR, 'map.js'),
  '/* 自动生成，勿手改。重跑 _tools/map-monsters.mjs */\n' +
  'window.__DKDbb_MONSTER_SPRITES__ = ' + JSON.stringify(out) + ';\n')

console.log('\n映射（怪物 -> 立绘）：')
for (const d of out.detail) console.log(`  ${String(d.id).padStart(6)} ${d.name.padEnd(10)} 原表尺寸${String(d.size).padStart(4)}  ->  ${d.sprite} (${d.artSize})`)
console.log(`\n已写出 assets/monsters/map.json + map.js`)
