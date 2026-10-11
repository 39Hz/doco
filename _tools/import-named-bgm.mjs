// 把原版「多克多比音乐」目录里 15 首**带场景名、高码率**的曲子收进 assets/bgm/named/，
// 并生成归属表。
//
// 为什么要这么做：我原来用的 assets/bgm/music001~021.mp3 每首只有 190~465 KB（短、低码率），
// 而原版目录里的曲子是 700 KB ~ 3.9 MB（完整版，且名字直接标明用途：
// 战斗场景 / 多比城堡 / 多比大街 / 勇气峡谷 / 索亚城 / 悬疑密室 / 乌卡前线 …）。
// 两者按大小对比只有 1 首勉强对上，说明**根本不是同一批文件**。
//
// 归属表依据名字直接判断，写进 assets/bgm/scene-bgm.json 供游戏读取。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, '多克多比专区资料素材', '多克多比素材fla', '多克多比电广素材', '多克多比音乐')
const OUT = path.join(ROOT, 'assets', 'bgm', 'named')
fs.mkdirSync(OUT, { recursive: true })

const files = fs.readdirSync(SRC).filter((f) => /\.mp3$/i.test(f))
console.log('原版曲子 ' + files.length + ' 首，开始复制…')
const list = []
const seenName = new Map()
for (const f of files) {
  // 归一化名字，并**处理撞名**：
  // 「悬疑密室 修改.mp3」和「悬疑密室 修改3.mp3」清掉"修改N"后会得到同一个名字，
  // 直接覆盖会丢一首（14/15）。撞名时补一个序号后缀。
  let clean = f.replace(/\.mp3$/i, '').trim()
  // 把尾部的"修改N"换成有意义的后缀，避免丢失
  const mod = clean.match(/\s*修改(\d*)\s*$/)
  if (mod) clean = clean.replace(/\s*修改(\d*)\s*$/, mod[1] ? '_v' + mod[1] : '')
  clean = clean.trim()
  let name = 'bgm_' + clean.replace(/[\\/:*?"<>|\s]/g, '_')
  if (seenName.has(name)) {
    let k = 2
    while (seenName.has(name + '_' + k)) k++
    name = name + '_' + k
  }
  seenName.set(name, f)
  const dst = path.join(OUT, name + '.mp3')
  fs.copyFileSync(path.join(SRC, f), dst)
  const kb = Math.round(fs.statSync(dst).size / 1024)
  list.push({ orig: f, name, file: 'assets/bgm/named/' + name + '.mp3', kb })
  console.log('  ' + f.padEnd(24) + ' → ' + name.padEnd(18) + kb + ' KB')
}

// 归属规则：按名字里的词判断用途
function usage(orig) {
  if (/战斗/.test(orig)) return 'battle'
  if (/城堡|大街|热闹室内/.test(orig)) return 'town'
  if (/索亚城/.test(orig)) return 'soya'
  if (/悬疑|密室/.test(orig)) return 'dungeon'
  if (/乌卡前线/.test(orig)) return 'boss'
  if (/勇气峡谷/.test(orig)) return 'wild'
  if (/空灵|圣地/.test(orig)) return 'holy'
  if (/潜伏|躲避/.test(orig)) return 'sneak'
  if (/速度/.test(orig)) return 'speed'
  if (/魔法室内/.test(orig)) return 'magic'
  if (/轻松有趣/.test(orig)) return 'light'
  return 'other'
}
const byUsage = {}
for (const it of list) {
  const u = usage(it.orig)
  it.usage = u
  ;(byUsage[u] = byUsage[u] || []).push(it)
}
console.log('\n=== 用途归类 ===')
for (const [u, arr] of Object.entries(byUsage)) {
  console.log('  ' + u.padEnd(10) + arr.map((x) => x.name).join(', '))
}

const table = {
  generated: new Date().toISOString(),
  note: '原版「多克多比音乐」目录里的曲子，按名字判断用途。' +
    '游戏里战斗用 battle、城镇用 town、副本用 dungeon/boss、野外用 wild。',
  tracks: list,
  byUsage,
  pick: {
    battle: (byUsage.battle || [])[0] ? (byUsage.battle[0].file) : null,
    boss: (byUsage.boss || [])[0] ? (byUsage.boss[0].file) : null,
    town: (byUsage.town || [])[0] ? (byUsage.town[0].file) : null,
    title: (byUsage.light || [])[0] ? (byUsage.light[0].file) : null,
    dungeon: (byUsage.dungeon || [])[0] ? (byUsage.dungeon[0].file) : null,
    wild: (byUsage.wild || [])[0] ? (byUsage.wild[0].file) : null,
    holy: (byUsage.holy || [])[0] ? (byUsage.holy[0].file) : null,
    magic: (byUsage.magic || [])[0] ? (byUsage.magic[0].file) : null,
    sneak: (byUsage.sneak || [])[0] ? (byUsage.sneak[0].file) : null,
  },
}
fs.writeFileSync(path.join(ROOT, 'assets', 'bgm', 'named', 'index.json'), JSON.stringify(table, null, 1), 'utf8')
fs.writeFileSync(path.join(ROOT, 'assets', 'bgm', 'scene-bgm.js'),
  '/* 自动生成，勿手改。重跑 _tools/import-named-bgm.mjs */\n' +
  'window.__DKDbb_BGM__ = ' + JSON.stringify(table) + ';\n')
console.log('\n★ 战斗音乐: ' + table.pick.battle)
console.log('★ BOSS 音乐: ' + table.pick.boss)
console.log('★ 城镇音乐: ' + table.pick.town)
console.log('★ 标题音乐: ' + table.pick.title)
console.log('\n已写 assets/bgm/named/index.json + assets/bgm/scene-bgm.js')
