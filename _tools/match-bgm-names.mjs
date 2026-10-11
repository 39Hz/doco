// 把原版音乐目录里"带场景名"的曲子，按文件大小对到我 assets/bgm 里的 musicXXX.mp3。
// 这样就能知道哪首是战斗音乐、哪首是城堡/大街/索亚城……
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const NAMED = path.join(ROOT, '多克多比专区资料素材', '多克多比素材fla', '多克多比电广素材', '多克多比音乐')
const MINE = path.join(ROOT, 'assets', 'bgm')

const named = fs.readdirSync(NAMED).filter((f) => /\.mp3$/i.test(f)).map((f) => ({
  name: f.replace(/\.mp3$/i, ''),
  size: fs.statSync(path.join(NAMED, f)).size,
  file: f,
}))
const mine = fs.readdirSync(MINE).filter((f) => /\.mp3$/i.test(f)).map((f) => ({
  name: f.replace(/\.mp3$/i, ''),
  size: fs.statSync(path.join(MINE, f)).size,
  file: f,
}))

console.log('原版带名字的曲子 ' + named.length + ' 个，我的 music*.mp3 ' + mine.length + ' 个\n')

// 按大小精确匹配
console.log('=== 按文件大小精确匹配 ===')
const matched = []
const usedMine = new Set()
for (const n of named.sort((a, b) => b.size - a.size)) {
  const hit = mine.find((m) => !usedMine.has(m.name) && m.size === n.size)
  if (hit) {
    usedMine.add(hit.name)
    matched.push({ alias: n.name, mine: hit.name, size: n.size })
    console.log('  ' + n.name.padEnd(20) + ' = ' + hit.name.padEnd(12) + n.size + ' B')
  } else {
    // 找不到完全相等的，找最接近的（差 < 2%）
    const near = mine.filter((m) => !usedMine.has(m.name) && Math.abs(m.size - n.size) / n.size < 0.02)
      .sort((a, b) => Math.abs(a.size - n.size) - Math.abs(b.size - n.size))[0]
    if (near) {
      usedMine.add(near.name)
      matched.push({ alias: n.name, mine: near.name, size: n.size, near: true })
      console.log('  ' + n.name.padEnd(20) + ' ≈ ' + near.name.padEnd(12) + n.size + ' vs ' + near.size + ' （近似）')
    } else {
      console.log('  ' + n.name.padEnd(20) + ' ✗ 没有对应（' + n.size + ' B）')
    }
  }
}
console.log('\n匹配上 ' + matched.length + '/' + named.length)
const unmatchedMine = mine.filter((m) => !usedMine.has(m.name))
if (unmatchedMine.length) {
  console.log('\n我没被匹配到的曲子（' + unmatchedMine.length + ' 个）: ' + unmatchedMine.map((m) => m.name + '(' + Math.round(m.size / 1024) + 'KB)').join(' '))
}

// 写出一张别名表，供游戏引用
const alias = {}
for (const m of matched) alias[m.mine] = m.alias
fs.writeFileSync(path.join(ROOT, 'assets', 'bgm', 'aliases.json'), JSON.stringify(alias, null, 1), 'utf8')
console.log('\n已写 assets/bgm/aliases.json（' + Object.keys(alias).length + ' 条）')

// 找战斗音乐
const battle = matched.find((m) => /战斗/.test(m.alias))
console.log('\n★ 战斗音乐: ' + (battle ? battle.mine + ' (' + battle.alias + ')' : '没匹配到'))
const title = matched.find((m) => /轻松|热闹/.test(m.alias))
console.log('★ 适合标题/城镇: ' + (title ? title.mine + ' (' + title.alias + ')' : '没匹配到'))
