// 把"按图鉴编号精确切出"的怪物立绘接进游戏。
//
// 背景：原来的 assets/monsters/m_*.png 是 map-monsters.mjs 按"美术尺寸排序"猜着对应的
// （那个脚本自己都写了"一致性近似"）。用户反馈"敌人的贴图和地图不一样"，
// 就是猜错导致的：战斗里出现的怪和场景/名字对不上。
//
// 现在这批是照图鉴上的编号标注切的，编号→ID 的规则也核对过
// （图鉴 110001 = 怪兽表 10001，图鉴 119003 = 怪兽表 19003）。
// 切出来 30 只，其余 6 只用旧的兜底，并在 map.json 里标出来源，便于以后替换。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const M = path.join(ROOT, 'assets', 'monsters')
const labeledPath = path.join(M, 'labeled', 'index.json')
if (!fs.existsSync(labeledPath)) throw new Error('缺少 assets/monsters/labeled/index.json，请先跑 slice-labeled-monsters.mjs')
const labeled = JSON.parse(fs.readFileSync(labeledPath, 'utf8'))

const gd = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'gamedata.json'), 'utf8'))
const oldMap = JSON.parse(fs.readFileSync(path.join(M, 'map.json'), 'utf8'))

const map = {}
const detail = []
let useNew = 0, useOld = 0
for (const mon of gd.monsters) {
  const id = String(mon.id)
  const hit = labeled[id]
  let sprite, source, w = 0, h = 0
  if (hit) {
    sprite = hit.file
    source = 'labeled（按图鉴编号精确切图）'
    w = hit.w; h = hit.h
    useNew++
  } else {
    sprite = (oldMap.map || {})[id] || ''
    source = 'fallback（按尺寸排序的近似映射，待替换）'
    if (sprite) {
      const p = path.join(ROOT, sprite)
      if (fs.existsSync(p)) {
        const b = fs.readFileSync(p)
        w = b.readUInt32BE(16); h = b.readUInt32BE(20)
      }
    }
    useOld++
  }
  if (!sprite) { console.log('  ✗ ' + id + ' ' + mon.name + ' 没有任何立绘'); continue }
  map[id] = sprite
  detail.push({ id: Number(mon.id), name: mon.name, element: mon.element || '无', size: Number(mon.size) || 90, sprite, artSize: w + 'x' + h, source })
}

const out = {
  generated: new Date().toISOString(),
  method: 'labeled-atlas-match（按怪物图鉴上的编号标注切图；编号规则 图鉴110xxx=怪兽10xxx、图鉴119xxx=怪兽19xxx）',
  note: `精确切图 ${useNew} 只，旧近似映射兜底 ${useOld} 只。fallback 的那些以后可以从图鉴上补切。`,
  sprites: useNew + useOld,
  monsters: gd.monsters.length,
  map,
  detail,
}
fs.writeFileSync(path.join(M, 'map.json'), JSON.stringify(out, null, 2))
fs.writeFileSync(path.join(M, 'map.js'),
  '/* 自动生成，勿手改。重跑 _tools/apply-monster-sprites.mjs */\n' +
  'window.__DKDbb_MONSTER_SPRITES__ = ' + JSON.stringify(out) + ';\n')

console.log('立绘来源：精确切图 ' + useNew + ' 只，兜底 ' + useOld + ' 只')
console.log('\n兜底的（还是近似映射，建议后续补切）：')
for (const d of detail) if (d.source.startsWith('fallback')) console.log('  ' + String(d.id).padEnd(6) + d.name.padEnd(10) + d.sprite)
console.log('\n已写 assets/monsters/map.json + map.js')
