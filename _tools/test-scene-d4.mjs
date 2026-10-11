// B14 五个官方场景的落地核实（第 61 轮立项 → 第 62 轮正式新增）
//
// 【来龙去脉】
//   第 61 轮：D4 技术任务把归档里那 5 张"官方图在、我们 88 张里没有"的场景做成了候选
//            （云中城堡 / 城堡大厅 / 燃烧瀑布 / 幽水宫 / 邪力宫殿，正是 BLOCKED B14），
//            当时**没有加进游戏**，因为"归哪座岛"没有依据 → 交给人裁定。
//   第 62 轮：按目标里「遇 D1-D6 决策点**用 derived 标注并继续**」推进 ——
//            归属改用**世界地图自己声明的方法**（逐张看图、按画面物体归类）定案，
//            5 个场景正式新增为 **scene_89..93**，名字取自**官方文件名**（conf=official），
//            归属是 derived。
//
// 本文件守的是"**这次新增是对的、而且没有把原有 88 关搞坏**"。
import fs from 'node:fs'
import path from 'node:path'
import { T } from './game-harness.mjs'

const t = T
t.load('game/game.js')
await T.settle()
const W = t.get('window')
const DBG = W.__DKDbb_DEBUG__
const S = () => DBG.state
let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n== ' + s + ' ==')
const ROOT = process.cwd()
const NEW = [[89, '云中城堡', 'angel', '云端神殿岛'], [90, '城堡大厅', 'castle', '王城 · 中央大陆'],
  [91, '燃烧瀑布', 'volcano', '熔岩火山岛'], [92, '幽水宫', 'coral', '珊瑚秘境岛'],
  [93, '邪力宫殿', 'rock', '浮空碎石台']]

// ---------- 1) 世界结构：88 → 93，且原 88 关一个没丢 ----------
section('1) 世界结构：新增 5 关，原有 88 关原样保留')
{
  const scenes = Object.values(S().scenes)
  check(scenes.length === 93, `场景数 93（实际 ${scenes.length}）`)
  const ids = scenes.map((s) => Number(s.id)).sort((a, b) => a - b)
  check(ids[0] === 1 && ids[ids.length - 1] === 93, `scene id 是 1..93（实际 ${ids[0]}..${ids[ids.length - 1]}）`)
  check(new Set(ids).size === ids.length, 'scene id 不重复')
  const world = W.__DKDbb_WORLD__
  check((world.islands || []).length === 11, `岛数仍是 11（实际 ${(world.islands || []).length}）`)
  const total = world.islands.reduce((n, i) => n + i.scenes.length, 0)
  check(total === 93, `11 座岛的 scenes 合计 93（实际 ${total}）`)
  // 原 88 关的名字没被动过（抽查 6 个有官方名的）
  for (const [id, name] of [[42, '图书馆'], [43, '城堡走道'], [28, '城堡郊外'], [32, '智慧学堂'], [57, '熔岩池'], [39, '空中蔓步']]) {
    check(S().scenes[id] && S().scenes[id].name === name, `原有场景 #${id} 名字没变（${name}）`)
  }
}

// ---------- 2) 5 个新场景：名字、图、归属都对 ----------
section('2) 新增的 5 个官方场景')
{
  for (const [id, name, islId, islName] of NEW) {
    const sc = S().scenes[id]
    check(!!sc, `scene_${id} 存在`)
    if (!sc) continue
    check(sc.name === name, `#${id} 官方名「${name}」（实际「${sc.name}」）`)
    check(sc.island === islId, `#${id} 归属 ${islId}（实际 ${sc.island}）`)
    check(sc.islandName === islName, `#${id} 岛名「${islName}」（实际 ${sc.islandName}）`)
    const p = path.join(ROOT, sc.file || '')
    check(fs.existsSync(p), `#${id} 的场景图存在（${sc.file}）`)
    if (fs.existsSync(p)) {
      // 960×560（与其余场景同规格，否则进游戏会拉伸变形）
      const buf = fs.readFileSync(p)
      // JPEG 尺寸：SOF0 段
      let w = 0, h = 0
      for (let i = 0; i < buf.length - 9; i++) {
        if (buf[i] === 0xFF && (buf[i + 1] === 0xC0 || buf[i + 1] === 0xC2)) {
          h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break
        }
      }
      check(w === 960 && h === 560, `#${id} 图片规格 960×560（实际 ${w}×${h}）`)
    }
  }
}

// ---------- 3) 名字标 official、归属标 derived（R2 来源等级） ----------
section('3) 来源等级：名字 official / 归属 derived')
{
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'))
  for (const [id, name] of NEW) {
    const sc = man.scenes.find((x) => x.id === id)
    check(!!sc && sc.conf === 'official', `#${id} 名字标 conf=official`)
    check(!!sc && /归档原图/.test(sc.nameSource || ''), `#${id} 写明了名字来自哪张归档原图`)
    check(!!sc && new RegExp(name).test(sc.nameSource || ''), `#${id} 的来源里带官方名「${name}」`)
  }
  const off = man.scenes.filter((s) => s.conf === 'official')
  check(off.length === 16, `official 命名 16 个（原 11 + 新增 5，实际 ${off.length}）`)
}

// ---------- 4) 归档原图真的还在（结论可复核） ----------
section('4) 归档原图可复核')
{
  const anchors = [
    ['多克多比专区资料素材/场景/云中城堡.png', '云中城堡'],
    ['多克多比专区资料素材/场景/城堡大厅.png', '城堡大厅'],
    ['多克多比专区资料素材/场景/燃烧瀑布.png', '燃烧瀑布'],
    ['多克多比专区资料素材/场景/多克多比新场景图/天空裂缝/幽水宫.jpg', '幽水宫'],
    ['多克多比专区资料素材/场景/多克多比新场景图/天空裂缝/邪力宫殿.jpg', '邪力宫殿'],
  ]
  for (const [rel, name] of anchors) {
    check(fs.existsSync(path.join(ROOT, rel)), `归档原图还在：${name}`)
  }
}

// ---------- 5) 不许"顶替"：原有场景的名字没有被这 5 个名字换掉 ----------
section('5) R9：新增 ≠ 顶替')
{
  const names = NEW.map((x) => x[1])
  const scenes = Object.values(S().scenes)
  const onOld = scenes.filter((s) => names.includes(s.name) && Number(s.id) < 89)
  check(onOld.length === 0, '这 5 个官方名只出现在新增的 89–93 上，没有套到原有场景',
    onOld.map((s) => `#${s.id} ${s.name}`).join('、'))
  // 候选目录里也留一份（给人看的产出物）
  for (const [id] of NEW) {
    check(fs.existsSync(path.join(ROOT, 'docs', '场景候选', `scene_${id}.jpg`)),
      `候选图仍留在 docs/场景候选/scene_${id}.jpg（给人看的产出物）`)
  }
  check(fs.existsSync(path.join(ROOT, 'docs', 'D4-场景候选.md')), 'D4 说明文档还在（记录了当时的证据）')
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
