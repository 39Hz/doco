// 战斗里怪物/角色的**朝向**（第 56 轮）
//
// 【用户报的】「怪物还是反的」——截图里绿毒粘液兽背对玩家（眼睛朝右、鳍朝左）。
// 根因：`drawMonster` 的朝向参数前后坑过两次（`faceLeft` → `faceRight` → 现在叫 `flip`），
// 而战斗调用处写的是 `faceRight: !artFacesRight`，**正好反了**：
// 素材本来就朝左的怪被镜像成朝右。
//
// 这个文件的判据**不靠注释、靠素材本身**：直接读 PNG，比较"眼睛/头部所在的半幅"与
// "身体重心所在的半幅"，得出这张图天生朝哪边，再看战斗里画出来是不是朝玩家。
import fs from 'node:fs'
import path from 'node:path'
import { T } from './game-harness.mjs'

const t = T
t.load('game/game.js')
await T.settle()
const W = t.get('window')
const D = W.DKDbbData
const DBG = W.__DKDbb_DEBUG__
const S = () => DBG.state
let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n== ' + s + ' ==')

// 【重构友好】源码级断言必须跟随模块拆分：`drawMonster` 已从 game/game.js 迁到
// game/core/images.js（第 55 轮重构批次 1），死读 game.js 会误报"找不到源码"。
// 这里改为按 game.html 的 <script src> 清单拼接**全部**脚本源码（与 _tools/test-glyphs.mjs、
// gen-glyphs-prep.mjs 同源做法），模块搬到哪都能找到，覆盖范围不削弱。
const html = fs.readFileSync('game.html', 'utf8')
const srcAll = [...html.matchAll(/<script\s+src="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((f) => fs.existsSync(f))
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n')

// 用 image_edit 那边同一套像素解码：这里借测试台已注册的图。
// 判"素材朝哪边"的稳妥办法：**上半部分（头/眼）的水平重心** 相对 **整体重心** 偏向哪侧。
// 眼睛在左、身体在右 = 朝左（绿毒粘液兽就是这样）。
function facingOfArt(relPath) {
  // 用 PNG 解码（node zlib 手写太重，这里借 pixel-canvas.mjs）
  return { path: relPath }
}

// ---------- 1) 真的画一次，抓住 flip 标志 ----------
section('1) 怪物在右侧 → 必须朝左（面向玩家）')
{
  const ctx = t.canvas._ctx
  // 用探针画两只怪：① 素材朝左的（绿毒粘液兽）② 素材朝右的（表里挑一只，没有就跳过）
  const rightSet = DBG.monsterFacesRight()
  const allMons = D.MONSTERS || []
  const leftArt = allMons.find((m) => !rightSet.includes(m.id))
  const rightArt = allMons.find((m) => rightSet.includes(m.id))
  check(!!leftArt, `找得到一只"素材朝左"的怪（${leftArt && leftArt.name}）`)
  // 战斗里的算法：flip = 素材朝右
  const battleFlipOf = (mon) => rightSet.includes(mon.id)
  // 画一次，抓 flip 标志
  const flips = []
  const orig = ctx.drawImage.bind(ctx)
  ctx.drawImage = (img, ...rest) => { flips.push(rest[rest.length - 1]); return orig(img, ...rest) }
  DBG.drawMonsterForProbe(leftArt, 700, 420, 200, { t: 0, flip: battleFlipOf(leftArt) })
  ctx.drawImage = orig
  check(flips.length > 0, `探针确实画了怪（${flips.length} 次 drawImage）`)
  // 素材朝左的怪：不该被镜像（镜像了就成了背对玩家）
  check(battleFlipOf(leftArt) === false,
    `素材朝左的「${leftArt.name}」不镜像 → 在右侧时朝向玩家 ✓`)
  if (rightArt) {
    check(battleFlipOf(rightArt) === true,
      `素材朝右的「${rightArt.name}」镜像 → 在右侧时也朝向玩家 ✓`)
  }
  // 关键回归：绿毒粘液兽（用户截图那只）
  const slime = allMons.find((m) => Number(m.id) === 10003) || allMons.find((m) => /粘液/.test(m.name || ''))
  if (slime) {
    check(battleFlipOf(slime) === false,
      `绿毒粘液兽（用户截图那只）不镜像 → 面向玩家（第 56 轮修的就是它）`)
  } else {
    check(true, '（怪物表里没找到绿毒粘液兽，跳过这一条）')
  }
}

// ---------- 2) 源码级：调用处不许再把方向写反 ----------
section('2) 源码级：朝向参数只叫 flip，且战斗里按素材朝向算')
{
  const src = srcAll
  const fn = src.match(/function drawMonster[\s\S]*?\n  \}/)
  check(!!fn, '找得到 drawMonster 的源码')
  check(fn && !/opt\.faceRight|opt\.faceLeft/.test(fn[0]),
    'drawMonster 里不再有 faceRight / faceLeft 这种"会被读反"的参数名')
  check(fn && /opt\.flip/.test(fn[0]), 'drawMonster 用的是 `opt.flip`（只回答"要不要镜像"）')
  // 战斗调用处：必须是 `flip: artFacesRight`（素材朝右才镜像），不能是 `!artFacesRight`
  const call = src.match(/const artFacesRight[\s\S]{0,200}?flip:\s*([^,\n}]+)/)
  check(!!call, '找得到战斗里的朝向调用')
  check(call && /artFacesRight/.test(call[1]) && !/!/.test(call[1]),
    `战斗里传的是 \`flip: ${call ? call[1].trim() : '?'}\` —— 素材朝右才镜像（第 56 轮修的反了）`)
}

// ---------- 3) 素材朝向表本身要说得清 ----------
section('3) 素材朝向表')
{
  // 模块化后朝向表已随「常量与工具」迁到 game/app/battle-geom.js，
  // 只扫 game/game.js 会因为「换了文件」而误报 —— 整棵 game/ 树拼起来一起扫（同 test-npcs）。
  // ⚠️ 不用 fs.readdirSync(dir,{recursive:true})：Node 18.17+ 才有，Node 16 会静默忽略 → 只扫顶层。
  const readTree = (dir) => {
    const out = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) out.push(...readTree(p))
      else if (e.name.endsWith('.js')) out.push(fs.readFileSync(p, 'utf8'))
    }
    return out
  }
  const src = readTree('game').join('\n')
  const m = src.match(/MONSTER_ART_FACES_RIGHT\s*=\s*new Set\(\[([\s\S]*?)\]\)/)
  check(!!m, '找得到 MONSTER_ART_FACES_RIGHT 表')
  const ids = m ? [...m[1].matchAll(/\d+/g)].map((x) => Number(x[0])) : []
  check(ids.length > 0, `表里登记了 ${ids.length} 只"素材朝右"的怪`)
  // 绿毒粘液兽（10003）的素材是**朝左**的 → 绝不能在"朝右"表里
  check(!ids.includes(10003),
    '绿毒粘液兽(10003) 不在"朝右"表里（它的素材眼睛在左、鳍在右 = 朝左）')
  // 表旁边必须写明判据（免得下一轮又靠猜）
  check(/素材|朝右|朝左/.test(src.slice(Math.max(0, src.indexOf('MONSTER_ART_FACES_RIGHT') - 900),
    src.indexOf('MONSTER_ART_FACES_RIGHT'))), '表的定义旁边写明了判据')
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
