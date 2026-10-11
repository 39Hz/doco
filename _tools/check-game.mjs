// 校验游戏数据层：检查引用完整性，避免运行时报错
// 用法: node _tools/check-game.mjs <项目根>
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const ROOT = path.resolve(process.argv[2] || '.')
const ctx = { window: {}, console, Math, Object, Array, JSON, Number, String }
vm.createContext(ctx)

const load = (rel) => {
  const p = path.join(ROOT, rel)
  if (!fs.existsSync(p)) { console.error(`✗ 缺少 ${rel}`); process.exit(1) }
  vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: rel })
}
// 先加载数据资源（形态表/怪物表/动画索引），再加载代码。
// 顺序很重要：data.js 是惰性解析的，如果先加载它再加载数据，会读到兜底数据。
load('assets/forms.js')
load('assets/gamedata.js')
load('assets/anim/index.js')
load('assets/monsters/map.js')
load('assets/manifest.js')
load('game/tables/data.js')
load('world.js')

const D = ctx.window.DKDbbData
const W = ctx.window.__DKDbb_WORLD__
const A = ctx.window.__DKDbb_ANIM__
const M = ctx.window.__DKDbb_MANIFEST__

let fail = 0
const bad = (s) => { console.log('  ✗ ' + s); fail++ }
const ok = (s) => console.log('  ✓ ' + s)

console.log('=== 基础数据 ===')
console.log(`  形态 ${D.FORMS.length} · 技能 ${Object.keys(D.SKILLS).length} · 怪物 ${D.MONSTERS.length}`)
console.log(`  岛屿 ${W.islands.length} · 场景 ${M ? M.scenes.length : '?'} · 动画动作 ${A ? Object.keys(A.actions).length : '?'}`)

console.log('\n=== 形态引用的技能是否存在 ===')
for (const f of D.FORMS) {
  const missing = f.skills.filter((s) => !D.SKILLS[s])
  if (missing.length) bad(`${f.name} 引用了未定义的技能: ${missing.join(', ')}`)
  else ok(`${f.name} 的 ${f.skills.length} 个技能都有定义`)
}

console.log('\n=== 形态引用的动画动作是否存在 ===')
// 形态的动作名是运行时由 resolveFormActions 从动画索引里解析的，
// 这里要先调一次，否则每个形态的动作都是空的（校验会变成假通过）。
{
  const animIdx = ctx.window.__DKDbb_ANIM__
  for (const f of D.FORMS) D.resolveFormActions(f, animIdx)
}
const actionNames = new Set(Object.values(A ? A.actions : {}).map((a) => a.action))
if (A) {
  for (const f of D.FORMS) {
    const need = [f.actionIdle, f.actionBattle, f.actionWin, ...(f.actionSkills || [])].filter(Boolean)
    if (!need.length) { bad(`${f.name} 没有解析出任何动作（精灵目录 ${f.spriteDir}）`); continue }
    const missing = need.filter((n) => !actionNames.has(n))
    if (missing.length) bad(`${f.name} 缺少动作: ${missing.join(', ')}`)
    else ok(`${f.name} 的 ${need.length} 个动作都在索引里（待机=${f.actionIdle}）`)
  }
} else {
  console.log('  （未加载动画索引，跳过）')
}

console.log('\n=== 岛引用的场景编号是否存在 ===')
const sceneIds = new Set((M ? M.scenes : []).map((s) => s.id))
if (M) {
  const all = new Set()
  let dup = 0
  for (const isl of W.islands) {
    for (const id of isl.scenes) {
      if (!sceneIds.has(id)) bad(`${isl.name} 引用了不存在的场景 ${id}`)
      if (all.has(id)) { bad(`场景 ${id} 被多个岛重复引用`); dup++ }
      all.add(id)
    }
  }
  if (!dup) ok('无重复引用')
  console.log(`  88 个场景中已归属: ${all.size}`)
}

console.log('\n=== 岛屿怪表引用的怪物是否存在 ===')
for (const [island, ids] of Object.entries(D.ISLAND_MONSTERS)) {
  const isl = W.islands.find((i) => i.id === island)
  if (!isl) { bad(`怪表里的岛 "${island}" 在世界地图里不存在`); continue }
  const missing = ids.filter((id) => !D.monster(id))
  if (missing.length) bad(`${isl.name} 引用了不存在的怪物: ${missing.join(', ')}`)
}
{
  const used = new Set(Object.values(D.ISLAND_MONSTERS).flat())
  const all = D.MONSTERS.map((m) => m.id)
  const unused = all.filter((id) => !used.has(id))
  if (unused.length) console.log(`  ! ${unused.length} 只怪物没被任何岛引用: ${unused.map((id) => D.monster(id).name).join('、')}`)
  if (fail === 0) ok(`全部岛的怪表引用有效（覆盖 ${used.size}/${all.length} 只怪物）`)
}

console.log('\n=== 怪物立绘覆盖 ===')
{
  const noSprite = D.MONSTERS.filter((m) => !m.sprite)
  if (noSprite.length) bad(`${noSprite.length} 只怪物没有立绘: ${noSprite.map((m) => m.name).join('、')}`)
  else ok(`全部 ${D.MONSTERS.length} 只怪物都有立绘`)
}

console.log('\n=== 旅行连通性 ===')
{ // 从 castle 出发能否到达所有岛
  const seen = new Set(['castle'])
  const q = ['castle']
  while (q.length) {
    const cur = q.shift()
    for (const nx of (D.ISLAND_LINKS[cur] || [])) {
      if (!seen.has(nx)) { seen.add(nx); q.push(nx) }
    }
  }
  const unreachable = W.islands.filter((i) => !seen.has(i.id)).map((i) => i.name)
  if (unreachable.length) bad(`从王城到不了: ${unreachable.join(', ')}`)
  else ok(`从王城可到达全部 ${W.islands.length} 座岛`)
}

console.log('\n=== 数值合理性 ===')
for (const f of D.FORMS) {
  const st = D.statsAtLevel(f.stats, 1)
  if (st.life <= 0 || st.atk <= 0) bad(`${f.name} 1 级数值异常`)
}
const m0 = D.MONSTERS[0]
if (m0.stats.life <= 0) bad('怪物数值异常')
else ok(`1 级怪物 ${m0.name} 生命 ${m0.stats.life}，玩家 1 级生命 ${D.statsAtLevel(D.FORMS[0].stats, 1).life}`)

console.log(fail === 0 ? '\n✅ 游戏数据校验通过' : `\n❌ ${fail} 项问题`)
process.exit(fail === 0 ? 0 : 1)
