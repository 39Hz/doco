// 把每座岛的 BGM 从「无名低码率 music0NN.mp3」换成**原版命名曲**（assets/bgm/named/）。
//
// 为什么要换（M2-4 场景 ↔ BGM 官方绑定）：
//   · 原版安装目录「多克多比音乐」里的曲子带**中文原名**（多比城堡1 / 多比大街 / 索亚城 /
//     勇气峡谷 / 乌卡前线2 / 战斗场景 2 …），这些名字本身就是官方场景/功能名。
//   · 而 assets/bgm/music001~021.mp3 是无名、低码率的另一批文件，用途只能靠猜。
//   · world.js 里 11 座岛原先都写着 music0NN.mp3，且 game.js 是 `sc.bgm || sceneBgmFor(sc)`，
//     所以真正带官方名的曲子**在场景里从来没被播到**（只有战斗/标题走 pick 表播到了）。
//
// 依据等级说明：岛名是我按画面物体归纳的（derived），所以下表全部标 derived；
// 只有「官方地形名 == 曲名」的对应关系本身是 official 证据（多比城堡/多比大街/索亚森林/勇气峡谷）。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NAMED = path.join(ROOT, 'assets', 'bgm', 'named')

// 岛 id → 官方曲。track 必须存在于 assets/bgm/named/。
const MAP = {
  castle: { track: '多比城堡1', why: '官方七大地形「多比城堡」；本岛场景注释全为「王城/城堡/内殿/图书馆/大厅」类室内' },
  market: { track: '多比大街', why: '官方七大地形「多比大街」；本岛为「集市/商店/工坊/厨房」类' },
  forest: { track: '索亚城', why: '官方七大地形「索亚森林」；本岛为森林场景' },
  desert: { track: '勇气峡谷', why: '官方七大地形「勇气峡谷」；本岛注释含「峡谷/岩壁」' },
  wilds: { track: '勇气峡谷', why: 'named 清单把「勇气峡谷」标为 wild 用途，本岛 tag=野外' },
  angel: { track: '圣地', why: 'named 清单把「圣地」标为 holy；本岛为云端神殿（天使/星纹/光系）' },
  islet: { track: '空灵', why: 'named 清单把「空灵」标为 holy；云海孤丘·霜原空寂' },
  coral: { track: '悬疑密室', why: 'named 清单把「悬疑密室」标为 dungeon；珊瑚秘境为探索型场景' },
  volcano: { track: '悬疑密室_v3', why: '熔岩火山岛为危险区域，用 dungeon 另一版本以免与珊瑚岛重复' },
  factory: { track: '热闹室内', why: 'named 清单把「热闹室内」标为 town；地精工坊为室内作业区' },
  rock: { track: '速度', why: '浮空碎石台为跳跃/移动型关卡，用节奏较快的曲子' },
}

const worldPath = path.join(ROOT, 'world.js')
let src = fs.readFileSync(worldPath, 'utf8')

// ---- 自检 1：目标曲必须真的在磁盘上，否则就是凭空写了一个不存在的路径 ----
const problems = []
for (const [id, m] of Object.entries(MAP)) {
  const f = path.join(NAMED, `bgm_${m.track}.mp3`)
  if (!fs.existsSync(f)) problems.push(`${id} → bgm_${m.track}.mp3 不存在`)
}
if (problems.length) {
  console.error('自检失败：以下目标曲文件不存在\n  ' + problems.join('\n  '))
  process.exit(1)
}

// ---- 按岛屿块替换 ----
const lines = src.split('\n')
const found = []
let curIsland = null
const before = []
for (let i = 0; i < lines.length; i++) {
  const idm = lines[i].match(/^\s*id:\s*'([a-z]+)',/)
  if (idm) { curIsland = idm[1]; found.push(curIsland) }
  const bm = lines[i].match(/^(\s*bgm:\s*')([^']+)('.*)$/)
  if (bm && curIsland && MAP[curIsland]) {
    const m = MAP[curIsland]
    before.push(`${curIsland}: ${bm[2]} → assets/bgm/named/bgm_${m.track}.mp3`)
    lines[i] = `${bm[1]}assets/bgm/named/bgm_${m.track}.mp3${bm[3]}`
    curIsland = null // 一座岛只换一次
  }
}

// ---- 自检 2：11 座岛必须全部命中，少一座就说明 world.js 结构变了 ----
const expect = Object.keys(MAP)
const missed = expect.filter((id) => !found.includes(id))
if (missed.length) {
  console.error('自检失败：world.js 里没找到这些岛 → ' + missed.join(', '))
  process.exit(1)
}
if (before.length !== expect.length) {
  console.error(`自检失败：应替换 ${expect.length} 处，实际 ${before.length} 处`)
  process.exit(1)
}

fs.writeFileSync(worldPath, lines.join('\n'), 'utf8')

// ---- 产出映射表（带依据），供文档与回归使用 ----
const table = {
  generated: new Date().toISOString(),
  note: '岛屿 → 原版命名曲绑定表。岛名为本项目按画面物体归纳（derived）；' +
    '「官方地形名 == 曲名」本身是 official 证据。重跑 _tools/bind-island-bgm.mjs',
  level: 'derived',
  map: Object.fromEntries(Object.entries(MAP).map(([id, m]) => [id, {
    track: `assets/bgm/named/bgm_${m.track}.mp3`, why: m.why,
  }])),
}
fs.writeFileSync(path.join(ROOT, 'assets', 'bgm', 'island-bgm.json'), JSON.stringify(table, null, 1), 'utf8')

console.log(`已替换 ${before.length} 座岛的 BGM：`)
for (const b of before) console.log('  ' + b)
console.log('映射表 → assets/bgm/island-bgm.json')
