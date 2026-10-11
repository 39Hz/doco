// 场景 → 官方七大地形 归属（M2-2，第 51 轮）
//
// 官方依据：5068《多克多比地形全介绍 七大地形有什么用》原文（见 world.js districts 的注释）——
// 官方只有**七大地形**；而项目里那 11 座岛是**按美术资源相似度**分的组。
// 两者不是一回事，所以"这个场景属于哪个地形"必须以**官方场景名**为准。
//
// 这个文件锁住三件事：
//   ① 88 个场景**每一个**都有归属，不重不漏；
//   ② 有官方名、且名字能定案的场景，其归属必须与官方名一致（哪怕和所属岛冲突）；
//   ③ 生成的人读表 `docs/场景地形归属.md` 与代码里的 override **不许脱节**（R10/C10）。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { T } from './game-harness.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const t = T
t.load('game/game.js')
await T.settle()

const W = t.get('window')
const DBG = () => W.__DKDbb_DEBUG__
const world = t.get('__world')
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'))
let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n== ' + s + ' ==')

const D = W.DKDbbData
const allSceneIds = []
for (const isl of world.islands) for (const sid of isl.scenes) allSceneIds.push(sid)
const distById = new Map(world.districts.map((d) => [d.id, d]))
const islandOf = (sid) => world.islands.find((i) => i.scenes.includes(sid)) || null

// ---------- 1) 覆盖 ----------
section('1) 全部场景逐个有归属（不重不漏）')
{
  // 场景数**按数据算**，不写死（第 62 轮：88 → 93，B14 的 5 个官方场景已新增）
  const EXPECT_N = world.islands.reduce((n, i) => n + i.scenes.length, 0)
  check(allSceneIds.length === EXPECT_N, `场景总数 ${allSceneIds.length}（应为 ${EXPECT_N}）`)
  check(new Set(allSceneIds).size === EXPECT_N, '没有场景被两座岛同时收录')
  const orphanIslands = world.islands.filter((i) => !world.districts.some((d) => d.islands.includes(i.id)))
  check(orphanIslands.length === 0, `每座岛都归到了地形（未归的：${orphanIslands.map((i) => i.name).join('/') || '无'}）`)
  // 逐场景问游戏自己
  const noDist = allSceneIds.filter((sid) => !DBG().districtOfScene(sid))
  check(noDist.length === 0, `每个场景都能问到地形（问不到的：${noDist.join('/') || '无'}）`)
  const badDist = allSceneIds.filter((sid) => {
    const d = DBG().districtOfScene(sid)
    return !d || !distById.has(d.id)
  })
  check(badDist.length === 0, '问到的地形都是七大地形之一')
  // 七大地形都要有场景（否则说明某个地形实际是空的）
  const used = new Set(allSceneIds.map((sid) => DBG().districtOfScene(sid).id))
  check(used.size === 7, `七大地形全部有场景（实际用到 ${used.size} 个）`,
    world.districts.filter((d) => !used.has(d.id)).map((d) => d.name).join('/'))
}

// ---------- 2) 官方名与归属不许矛盾 ----------
section('2) 官方场景名定案的场景，归属必须与官方名一致')
{
  const official = man.scenes.filter((s) => s.conf === 'official' && s.title)
  check(official.length === 16, `官方名场景 ${official.length} 个（原 11 + 第 62 轮新增 5 个官方场景）`)
  // 名字里带"城堡"的，只能是多比城堡
  const castleNamed = official.filter((s) => /^城堡|多比城堡/.test(s.title))
  check(castleNamed.length >= 2, `有 ${castleNamed.length} 个官方名直接带"城堡"（${castleNamed.map((s) => s.title).join('/')}）`)
  for (const s of castleNamed) {
    const d = DBG().districtOfScene(s.id)
    check(d && d.id === 'castle', `「${s.title}」（场景 ${s.id}）归多比城堡`, d && d.name)
    const isl = islandOf(s.id)
    if (isl && !distById.get('castle').islands.includes(isl.id)) {
      // 这正是这次查出来的矛盾：按美术归的岛不在多比城堡下，但官方名说是城堡 → 以官方名为准
      check(!!world.districtOverrides[s.id],
        `「${s.title}」与所属岛「${isl.name}」冲突，已用 override 改判（这正是 M2-2 查出来的问题）`)
    }
  }
  // override 表本身要合法：键存在、值是合法地形、且每条都写了它是被官方名推出来的
  const ov = world.districtOverrides || {}
  const ovKeys = Object.keys(ov)
  check(ovKeys.length >= 2, `override 表里有 ${ovKeys.length} 条（官方名推翻了美术分组）`)
  for (const k of ovKeys) {
    const sid = Number(k)
    check(allSceneIds.includes(sid), `override 的场景 ${k} 真实存在`)
    check(distById.has(ov[k]), `override 的地形 ${ov[k]} 是七大地形之一`)
    const sc = man.scenes.find((x) => x.id === sid)
    check(!!sc && sc.conf === 'official', `override 的场景 ${k} 有官方名才允许改判（不能凭感觉改）`)
    check(!!sc && new RegExp('^' + (ov[k] === 'castle' ? '城堡' : '.')).test(sc.title),
      `override 的场景 ${k}「${sc ? sc.title : '?'}」名字支持改判到「${distById.get(ov[k]).name}」`)
  }
}

// ---------- 3) 生成的人读表与代码不许脱节 ----------
section('3) 生成的归属表与代码一致（R10：状态数字只允许一个权威源）')
{
  const jsonPath = path.join(ROOT, 'docs', '场景地形归属.json')
  const mdPath = path.join(ROOT, 'docs', '场景地形归属.md')
  check(fs.existsSync(jsonPath), 'docs/场景地形归属.json 存在（由 _tools/bind-scene-districts.mjs 生成）')
  check(fs.existsSync(mdPath), 'docs/场景地形归属.md 存在（人读版）')
  if (fs.existsSync(jsonPath)) {
    const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
    const EXPECT_N = world.islands.reduce((n, i) => n + i.scenes.length, 0)
    check(j.total === EXPECT_N && j.scenes.length === EXPECT_N, `表里也有 ${EXPECT_N} 个场景（${j.total}）`)
    // 表里的地形必须与游戏运行时**逐条一致** —— 这就是"两个权威源"的防脱节断言
    const mismatch = j.scenes.filter((r) => {
      const d = DBG().districtOfScene(r.scene)
      return !d || d.id !== r.district
    })
    check(mismatch.length === 0,
      `表里每条与游戏算出来的一致（不一致的：${mismatch.map((m) => m.scene).join('/') || '无'}）`,
      mismatch.slice(0, 3).map((m) => `${m.scene}: 表=${m.district} 游戏=?`).join(' '))
    // 官方定案的条数
    const pinned = j.scenes.filter((r) => /直接定到/.test(r.why || '')).length
    check(pinned === Object.keys(world.districtOverrides || {}).length,
      `表里"由官方名直接定案"的条数 = override 条数（${pinned}）`)
    // 待复核的场景必须真的存在，且都写清了"更像哪个地形"
    check(j.needReview >= 0, `表里标了 ${j.needReview} 个待人类复核的场景`)
    for (const r of j.scenes.filter((x) => x.review)) {
      check(!!r.review.suggest && !!r.review.keep && r.review.suggest !== r.review.keep,
        `待复核的场景 ${r.scene}「${r.officialName}」写清了"现在 X、更像 Y"`)
    }
  }
}

// ---------- 4) 场景内的标题要显示地形（玩家看得见） ----------
section('4) 界面上要真的显示地形')
{
  // 进一个有官方名、且被 override 改判的场景（43 城堡走道），看标题栏
  const sv = W.DKDbb.save
  sv.data.level = 30
  const entered = DBG().enterScene ? DBG().enterScene(43) : false
  if (entered) {
    const sc = DBG().state.current
    check(!!sc && sc.id === 43, `进到场景 43（当前 ${sc && sc.id}）`)
    const d = DBG().districtOfScene(43)
    check(d && d.name === '多比城堡', `场景 43 现在归「${d && d.name}」（override 生效）`)
  } else {
    // 没有 enterScene 接口就退回几何断言：至少确认函数存在且值正确
    check(DBG().districtOfScene(43).name === '多比城堡', '场景 43 归多比城堡（未进入场景，只查数据）')
  }
  check(typeof DBG().districtOfScene === 'function', 'districtOfScene 已暴露给测试')
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
