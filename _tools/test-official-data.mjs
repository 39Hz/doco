// 覆盖「官方数据接入」与「索亚系统」——这两块此前完全没有测试覆盖：
// harness 的脚本清单是硬编码的，漏掉了 assets/soya.js 和官方技能表，
// 于是「全套测试通过」但这两块其实一行都没被加载过。
// 现在 harness 直接解析 game.html，本测试再从里到外验证数据真的生效。
import { T } from './game-harness.mjs'
import fs from 'node:fs'

const t = T
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const D = W.DKDbbData
let pass = 0, fail = 0
const check = (c, s) => { console.log((c ? '  ✓ ' : '  ✗ ') + s); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

// ---------- 0) harness 与 game.html 一致 ----------
section('0) 测试环境本身就加载了页面里的全部脚本')
const html = fs.readFileSync('game.html', 'utf8')
const pageScripts = [...html.matchAll(/<script\s+src=["']([^"']+)["']/g)].map((m) => m[1])
check(pageScripts.includes('assets/soya.js'), `game.html 含 assets/soya.js（共 ${pageScripts.length} 个脚本）`)
check(pageScripts.includes('game/tables/skills-official.js'), 'game.html 含 game/tables/skills-official.js')
check(pageScripts.includes('game/tables/form-skills-official.js'), 'game.html 含 game/tables/form-skills-official.js')
for (const rel of pageScripts) {
  if (!fs.existsSync(rel)) { check(false, `脚本文件不存在: ${rel}`); }
}
check(t.get('__soya') != null, '沙箱里能取到 __DKDbb_SOYA__（说明 soya.js 真的被加载了）')

// ---------- 1) 官方技能表 ----------
section('1) 官方技能表已生效')
const SK = D.SKILLS
const names = Object.keys(SK)
check(names.length >= 80, `技能总数 ${names.length} ≥ 80`)
const withIcon = names.filter((n) => SK[n].icon)
check(withIcon.length >= 17, `带官方图标的技能 ${withIcon.length} 个`)
const seals = names.filter((n) => SK[n].seal)
check(seals.length >= 11, `结印技 ${seals.length} 个`)
const badSp = seals.filter((n) => !(SK[n].sp === 1 || SK[n].sp === 2))
check(badSp.length === 0, `结印技 SP 消耗都在 1~2（异常: ${badSp.join('、') || '无'}）`)
const noDesc = names.filter((n) => !SK[n].desc || !String(SK[n].desc).trim())
check(noDesc.length === 0, `所有技能都有官方说明（缺: ${noDesc.slice(0, 5).join('、') || '无'}）`)
const badNum = names.filter((n) => typeof SK[n].cd !== 'number' || typeof SK[n].energy !== 'number' || typeof SK[n].power !== 'number')
check(badNum.length === 0, `cd/energy/power 都是数值（异常: ${badNum.slice(0, 5).join('、') || '无'}）`)
const mpRange = names.map((n) => SK[n].energy)
check(Math.min(...mpRange) === 0 && Math.max(...mpRange) >= 40, `MP 消耗跨度 ${Math.min(...mpRange)}~${Math.max(...mpRange)}`)
// energy 必须等于 mp（game.js 把 energy 当 MP 扣）
const mismatch = names.filter((n) => SK[n].mp != null && SK[n].energy !== SK[n].mp)
check(mismatch.length === 0, `energy 已统一映射为 MP（不一致: ${mismatch.slice(0, 5).join('、') || '无'}）`)

// ---------- 2) 每个多比的配招都在官方表里 ----------
section('2) 每只多比的配招全部来自官方技能表')
const forms = D.forms()
// 形态数从 11 涨到 52：第 30 轮把归档里两张官方表（多比一级属性.xlsx 39 只、新多比资料0711.xlsx 5 只）
// 接进了 gen-forms.mjs。**下限**才是这条断言要守的东西 —— 一旦有人把数据源改坏、形态掉回 11 只，
// 这里必须报出来；上限不写死，因为归档里还可能再挖出官方表。
check(forms.length >= 50, `形态数 ${forms.length}（≥50：11 只原表 + 归档两张官方表）`)
for (const n of ['费尔·凌', '沃特·空', '温德·冽', '厄斯·垒']) {
  check(forms.some((f) => f.name.includes(n)), `原表四小强仍在：${n}`)
}
check(forms.some((f) => f.name.includes('修罗·源')), '归档新表里的「修罗·源」也在')
let missing = [], noSeal = [], elemMismatch = []
for (const f of forms) {
  for (const n of f.skills || []) if (!SK[n]) missing.push(`${f.name}→${n}`)
  // 【第 30 轮改】原先要求"每只都必须有结印技"。
  // 但归档里只有 136 个官方技能，38 只新形态**没有官方专属技能依据** ——
  // 硬要求每只都配结印技，等于逼着我们去编（违反 R1）。
  // 现在只要求：**官方表里给了专属技能的形态，必须真的把它配进技能组**。
  if (f.skill && f.skill.name && SK[f.skill.name]) {
    if (!(f.skills || []).includes(f.skill.name)) missing.push(`${f.name} 没配专属技能 ${f.skill.name}`)
  } else {
    noSeal.push(f.name)
  }
  // 同属性检查：配招里非本属性的不该过半（无属性形态跳过）
  if (f.element && f.element !== '无') {
    const off = (f.skills || []).filter((n) => SK[n] && SK[n].element && SK[n].element !== f.element)
    if (off.length > (f.skills || []).length / 2) elemMismatch.push(`${f.name}(${f.element}) 跨界 ${off.length}/${f.skills.length}`)
  }
}
check(missing.length === 0, `没有引用不存在的技能、也没漏掉官方专属技能（坏引用: ${missing.slice(0, 5).join('、') || '无'}）`)
console.log(`     （${noSeal.length} 只没有官方专属技能依据 → 配招走本元素池，不编专属技）`)
check(elemMismatch.length === 0, `配招以本属性为主（异常: ${elemMismatch.join('；') || '无'}）`)
console.log('    配招抽样: ' + forms.slice(0, 3).map((f) => `${f.name}=[${f.skills.join('、')}]`).join('  '))

// ---------- 3) 战斗中 MP 真的会被扣 ----------
section('3) 技能真的消耗 MP（此前 energy 全是 0，MP 条是装饰）')
const S = () => W.__DKDbb_DEBUG__.state
const world = t.get('__world')
S().mode = 'title'
t.key(' '); t.step(3)
let entered = false
for (const island of world.islands) {
  for (const sid of island.scenes) {
    S().mode = 'worldmap'; t.step(1)
    S().mapSel = world.islands.indexOf(island); S().placeSel = 0; t.step(1)
    t.key(' '); t.step(3)
    if (S().mode !== 'places') continue
    S().placeSel = island.scenes.indexOf(sid); S().placePage = 0; t.step(1)
    t.key(' '); t.step(4)
    if (S().mode !== 'explore') continue
    const sp = W.__DKDbb_DEBUG__.spawns
    if (!sp || !sp.monsters.length) continue
    S().form = D.FORMS[0]
    const m = sp.monsters[0]
    W.__DKDbb_DEBUG__.startBattle({ mon: m.mon, level: m.level, stats: m.stats })
    for (let i = 0; i < 400 && S().battle && (S().battle.phase !== 'command' || S().battle.intro > 0); i++) t.step(1)
    if (S().battle) { entered = true; break }
  }
  if (entered) break
}
check(entered, '成功进入战斗')
if (entered) {
  const b = S().battle
  const form = S().form
  b.player.hp = b.player.maxHp = 99999
  // 找一个耗蓝 > 0 且非结印的技能
  const list = form.skills || []
  const idx = list.findIndex((n) => SK[n] && SK[n].energy > 0 && !SK[n].seal)
  check(idx >= 0, `配招里有耗蓝技能（${list.join('、')}）`)
  if (idx >= 0) {
    // 正确姿势（与 test-battle-bugs.mjs 一致）：菜单设成 skill，直接按空格释放。
    // 注意不是「先选目标再确认」——那样技能根本不会出手。
    b.menu = 'skill'; b.menuSel = 1; b.skillSel = idx
    b.cooldowns = {}
    b.player.mp = b.player.maxMp = 999
    t.step(1)
    const name = list[idx]
    const cost = SK[name].energy
    const before = b.player.mp
    t.key(' ')
    t.step(1)
    const started = b.phase === 'acting'
    check(started, `「${name}」成功进入释放状态（phase=acting）`)
    check(Math.abs(b.player.mp - (before - cost)) < 0.001,
      `释放「${name}」扣蓝 ${before} → ${b.player.mp}（应扣 ${cost}）`)
    for (let i = 0; i < 900 && S().battle && b.phase === 'acting'; i++) t.step(1)
    check(S().battle && Math.abs(b.player.mp - (before - cost)) < 0.001,
      `结算后 MP 仍为 ${S().battle ? b.player.mp : '-'}，没有被悄悄回满`)
  }
  // 结印技不该消耗 MP，且需要 SP
  const sealIdx = list.findIndex((n) => SK[n] && SK[n].seal)
  if (sealIdx >= 0) {
    const n = list[sealIdx]
    check(SK[n].energy === 0, `结印技「${n}」MP 消耗为 0（官方：结印技不消耗魔法）`)
    check(SK[n].sp >= 1, `结印技「${n}」消耗 SP ${SK[n].sp}（官方：每个多比最多积 3 SP）`)
  }
}

// ---------- 4) 索亚系统 ----------
section('4) 索亚系统数据完整')
const soya = D.soya()
check(soya.length === 6, `索亚 ${soya.length} 只`)
const ids = soya.map((s) => s.id)
check(ids.join(',') === '70001,70002,70003,70004,70005,70006', `编号连续: ${ids.join(',')}`)
let artMissing = []
for (const s of soya) {
  if (!s.art || !fs.existsSync(s.art)) artMissing.push(`${s.name}(${s.art})`)
  if (!s.effect || !s.effectLabel) artMissing.push(`${s.name} 缺效果字段`)
}
check(artMissing.length === 0, `索亚立绘与效果字段完整（缺: ${artMissing.slice(0, 4).join('、') || '无'}）`)
// 立绘文件要非空
const emptyArt = soya.filter((s) => s.art && fs.existsSync(s.art) && fs.statSync(s.art).size < 200)
check(emptyArt.length === 0, `索亚立绘文件非空（空文件: ${emptyArt.map((s) => s.name).join('、') || '无'}）`)
console.log('    索亚: ' + soya.map((s) => `${s.name}(${s.effectLabel})`).join('  '))

console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} 项，失败 ${fail} 项`)
if (fail) process.exit(1)
