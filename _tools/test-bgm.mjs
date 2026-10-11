// 验证音乐切换：进战斗放战斗曲、结束回场景曲、标题放轻快曲。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { T } from './game-harness.mjs'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
const world = t.get('__world')
const A = W.DKDbb.audio

let pass = 0, fail = 0
const check = (c, s) => { console.log((c ? '  ✓ ' : '  ✗ ') + s); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

const bgmOf = () => (A && A.__bgmSrc ? A.__bgmSrc() : (t.run('window.DKDbb.audio.__lastBgm || null')))

section('0) 原版曲子表是否加载')
const BGM = W.__DKDbb_BGM__
check(!!BGM, 'BGM 归属表已加载')
if (BGM) {
  check(!!BGM.pick.battle, '战斗曲: ' + BGM.pick.battle)
  check(!!BGM.pick.boss, 'BOSS 曲: ' + BGM.pick.boss)
  check(!!BGM.pick.town, '城镇曲: ' + BGM.pick.town)
  check(!!BGM.pick.title, '标题曲: ' + BGM.pick.title)
  check((BGM.tracks || []).length === 15, '原版带名曲子 ' + (BGM.tracks || []).length + ' 首')
}

section('1) 标题画面放标题曲')
t.step(5)
const titleBgm = t.run('(window.DKDbb.audio.__current && window.DKDbb.audio.__current()) || null')
check(!!titleBgm, '标题画面有 BGM 在放：' + titleBgm)

section('2) 进战斗切战斗曲')
// 进一个带怪的场景
const MW = world.mapW, MH = world.mapH
// 地图版式**向游戏查询**，不要在这里复刻公式（改了 game.js 的版式就会点空）
const _G = DBG().mapGeom(), r2 = _G.r, ox = _G.ox, oy = _G.oy
t.key(' '); t.step(3)
let mon = null
for (const isl of world.islands) {
  for (let k = 0; k < isl.scenes.length && !mon; k++) {
    S().mode = 'worldmap'; t.step(1)
    S().mapSel = world.islands.indexOf(isl)
    t.move(ox + isl.x * r2, oy + isl.y * r2)
    t.click(ox + isl.x * r2, oy + isl.y * r2); t.step(3)
    if (S().mode !== 'places') continue
    S().placeSel = k; S().placePage = Math.floor(k / 8)
    t.move(480, 520); t.step(1)
    t.key(' '); t.step(4)
    if (S().mode !== 'explore') continue
    const sp = DBG().spawns
    if (sp && sp.monsters.length) { mon = sp.monsters[0]; break }
  }
  if (mon) break
}
check(!!mon, mon ? '找到野怪 ' + mon.mon.name : '找不到野怪')
if (mon) {
  const before = t.run('(window.DKDbb.audio.__current && window.DKDbb.audio.__current()) || null')
  DBG().startBattle({ mon: mon.mon, level: mon.level, stats: mon.stats })
  t.step(3)
  const after = t.run('(window.DKDbb.audio.__current && window.DKDbb.audio.__current()) || null')
  check(after !== before, '进战斗后 BGM 变了（' + before + ' → ' + after + '）')
  const want = /^19/.test(String(mon.mon.id)) ? BGM.pick.boss : BGM.pick.battle
  check(after === want, '放的是战斗曲（期望 ' + want + '）')
}

section('3) 战斗结束切回场景曲')
{
  const b = S().battle
  // 注意：不能在每帧都按回车 —— 那样指令永远被吞掉，战斗打不完。
  // 正确节奏：等 phase 回到 command 且开场演出结束，才出一次手。
  let guard = 0
  while (S().mode === 'battle' && guard++ < 4000) {
    t.step(1)
    if (b && b.phase === 'command' && b.intro <= 0) { t.key('Enter'); t.step(1) }
    if (S().mode === 'result') break
  }
  if (S().mode === 'result') { t.key(' '); t.step(3) }
  const now = t.run('(window.DKDbb.audio.__current && window.DKDbb.audio.__current()) || null')
  check(S().mode === 'explore', '回到场景（mode=' + S().mode + '，用了 ' + guard + ' 帧）')
  check(!!now && now !== BGM.pick.battle && now !== BGM.pick.boss,
    'BGM 切回场景曲（' + now + '）')
}

section('4) 每座岛播的是「原版命名曲」而不是无名 music0NN.mp3')
{
  // 背景：assets/bgm/music001~021.mp3 是无名低码率的另一批文件；带官方中文名的曲子
  // 收在 assets/bgm/named/。world.js 原先 11 座岛全写 music0NN，而 game.js 是
  // `sc.bgm || sceneBgmFor(sc)` —— 所以官方曲在场景里从来没被播到。
  // 这里逐岛进场景，检查**运行时实际播放的地址**，而不是只看数据文件。
  const namedDir = path.join(ROOT, 'assets', 'bgm', 'named')
  const bad = []
  for (let i = 0; i < world.islands.length; i++) {
    const isl = world.islands[i]
    const dataOk = typeof isl.bgm === 'string' && isl.bgm.includes('/named/')
    S().mode = 'worldmap'; t.step(1)
    S().mapSel = i
    const _g = DBG().mapGeom()
    t.move(_g.ox + isl.x * _g.r, _g.oy + isl.y * _g.r)
    t.click(_g.ox + isl.x * _g.r, _g.oy + isl.y * _g.r); t.step(3)
    if (S().mode !== 'places') { bad.push(`${isl.id}: 进不去 places`); continue }
    S().placeSel = 0; S().placePage = 0
    t.move(480, 520); t.step(1)
    t.key(' '); t.step(4)
    if (S().mode !== 'explore') { bad.push(`${isl.id}: 进不去 explore`); continue }
    const playing = t.run('(window.DKDbb.audio.__current && window.DKDbb.audio.__current()) || null')
    const isNamed = typeof playing === 'string' && playing.includes('/named/')
    if (!dataOk) bad.push(`${isl.id}: 数据层 bgm=${isl.bgm}`)
    if (!isNamed) bad.push(`${isl.id}: 实际播放=${playing}`)
  }
  check(bad.length === 0, `11 座岛全部播放官方命名曲`, bad.join(' / '))

  // 绑定表本身要落地成文件，且每一条指向的曲都要真实存在
  const mapFile = path.join(ROOT, 'assets', 'bgm', 'island-bgm.json')
  check(fs.existsSync(mapFile), '绑定表 assets/bgm/island-bgm.json 存在')
  if (fs.existsSync(mapFile)) {
    const tbl = JSON.parse(fs.readFileSync(mapFile, 'utf8'))
    const ents = Object.entries(tbl.map || {})
    check(ents.length === 11, `绑定表覆盖 11 座岛（实际 ${ents.length}）`)
    check(tbl.level === 'derived', `绑定依据等级已标注：${tbl.level}（岛名是归纳的，不是官方原文）`)
    const miss = ents.filter(([, v]) => !fs.existsSync(path.join(ROOT, v.track)))
    check(miss.length === 0, '绑定表里每首曲子都真实存在', miss.map(([k]) => k).join(','))
  }
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' 通过 ' + pass + ' 项，失败 ' + fail + ' 项')
process.exit(fail === 0 ? 0 : 1)
