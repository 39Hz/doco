// 图鉴（多比 / 技能 / 索亚 / 怪物 / 骑士与魔王）。
//
// 这是 M4 的产物：把**有官方依据**的内容集中一页看全，每条都标来源等级。
// 特别要钉死的是"骑士与魔王"那一页 —— 它的素材来自官方资料包的 rar
// （`多克骑士乌卡将军.rar`，14 张以角色名命名的 JPG），
// 但**没有任何战斗数值依据**，所以只能展示、不能编造数值。
import { T } from './game-harness.mjs'
import fs from 'node:fs'

const t = T
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
const D = W.DKDbbData
let pass = 0, fail = 0
const check = (c, s) => { console.log((c ? '  ✓ ' : '  ✗ ') + s); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

// ---------- 1) 素材是否真的入库 ----------
section('1) 骑士与魔王素材已入库')
const KN = D.KNIGHTS
// 解包目录里 14 张 + 第 35 轮从官方素材归档补入的「巨岩骑士」= 15 张
check(KN.length === 15, `入库 ${KN.length} 张（解包 14 + 官方素材归档 1）`)
const knights = KN.filter((k) => k.kind === 'knight')
const lords = KN.filter((k) => k.kind === 'lord')
// 【第 35 轮改】原来这里断言"骑士 6 位"，并且要求巨岩骑士**必须登记在 missing 里**
//（当时的依据是"官方资源包里没有它的立绘"）。
// 但归档 `多克多比专区资料素材\多比形态素材\巨岩骑士.png` 里**有同名原图**，
// 官方表 `旋风巨岩多比资料.xlsx` 里还有它的长描述 —— 于是把它补了进来。
// 现在：骑士 7 位、missing 清空。**这两条断言跟着"证据变了"一起改**，不是放宽。
check(knights.length === 7, `骑士 ${knights.length} 位：${knights.map((k) => k.name).join('、')}`)
check(lords.length === 8, `魔王/BOSS ${lords.length} 位：${lords.map((k) => k.name).join('、')}`)
// 5068《八大骑士》点名过的六位必须一一对应
const OFFICIAL_SIX = ['赤炎骑士', '暗影骑士', '狂毒骑士', '圣力骑士', '驭风骑士', '水晶骑士']
check(OFFICIAL_SIX.every((n) => knights.some((k) => k.name === n)),
  '素材里的六位与 5068《八大骑士》点名的六位一致')
check(knights.some((k) => k.name === '巨岩骑士'),
  '第七位骑士「巨岩骑士」也在（立绘来自官方素材归档的同名 PNG）')
const missing = D.knightsMissing()
check(missing.length === 0, `缺失登记已清空（${missing.length} 个）`, missing.map((m) => m.name).join('、'))
// 巨岩骑士必须带官方描述（逐字来自 旋风巨岩多比资料.xlsx）
const jy = KN.find((k) => k.name === '巨岩骑士')
check(!!jy && /岩石铠甲/.test(jy.desc || ''), '巨岩骑士带官方描述（逐字取自官方表）', jy && jy.desc)
check(!!jy && /多比形态素材/.test(jy.src || ''), '巨岩骑士的立绘出处记的是官方素材归档路径', jy && jy.src)
// 文件必须真实存在且非空
const badFiles = KN.filter((k) => !k.art || !fs.existsSync(k.art) || fs.statSync(k.art).size < 1024)
check(badFiles.length === 0, `每张立绘文件都真实存在且非空（异常 ${badFiles.length}）`)
// 来源等级必须标出来
check(KN.every((k) => k.conf), '每条都带来源等级 conf')
check(KN.filter((k) => k.kind !== 'unknown').every((k) => k.conf === 'official'),
  '骑士与魔王的 conf 都是 official（名字取自官方资源包）')
// ★ R1：不许编造战斗数值 ★
const idx = JSON.parse(fs.readFileSync('assets/knights/index.json', 'utf8'))
check(/不含它们的战斗数值|只作为图鉴展示/.test(idx.note),
  'index.json 里明确写了"不含战斗数值、只作图鉴展示"')

// ---------- 2) 图鉴面板本身 ----------
section('2) 图鉴面板')
S().mode = 'title'; t.step(2)
t.key(' '); t.step(4)
check(S().mode === 'worldmap', `进入世界（mode=${S().mode}）`)
// 走正常流程进场景（图鉴在探索界面按 L 打开）
const world = t.get('__world')
let entered = false
for (const island of world.islands) {
  for (const sid of island.scenes) {
    S().mode = 'worldmap'; t.step(1)
    S().mapSel = world.islands.indexOf(island); S().placeSel = 0; t.step(1)
    t.key(' '); t.step(3)
    if (S().mode !== 'places') continue
    S().placeSel = island.scenes.indexOf(sid); S().placePage = 0; t.step(1)
    t.key(' '); t.step(4)
    if (S().mode === 'explore') { entered = true; break }
  }
  if (entered) break
}
check(entered, '进入场景')
t.key('l'); t.step(3)
check(S().mode === 'zukan', `按 L 打开图鉴（mode=${S().mode}）`)
check(!!S().zukan, '图鉴状态已建立')
check(DBG().zukanTabs().length === 5, `页签 ${DBG().zukanTabs().length} 个：${DBG().zukanTabs().join('/')}`)

// 每个页签都要有条目，且能翻页不报错
let empty = []
for (let i = 0; i < 5; i++) {
  const n = DBG().zukanEntries(i).length
  if (n === 0) empty.push(DBG().zukanTabs()[i])
}
check(empty.length === 0, `5 个页签都有内容（空页签：${empty.join('、') || '无'}）`)
console.log('    各页签条目数：' + DBG().zukanTabs().map((n, i) => `${n} ${DBG().zukanEntries(i).length}`).join('　'))

// 键盘：翻页 + 切页签 + 返回
const z = S().zukan
S().zukan.tab = 1; z.sel = 0; z.page = 0
t.step(1)
const pages = DBG().zukanLayout().pages
check(pages > 1, `技能页有多页（${pages} 页 × 16 格）`)
t.key('e'); t.step(2)
check(S().zukan.page === 1, `E 翻到第 ${S().zukan.page + 1} 页`)
t.key('q'); t.step(2)
check(S().zukan.page === 0, `Q 翻回第 ${S().zukan.page + 1} 页`)
t.key('Tab'); t.step(2)
check(S().zukan.tab === 2, `Tab 切到「${DBG().zukanTabs()[S().zukan.tab]}」页签`)
t.key('Escape'); t.step(2)
check(S().mode === 'explore', `Esc 返回场景（mode=${S().mode}）`)

// ---------- 3) 骑士页签的内容正确 ----------
section('3) 骑士与魔王页签')
{
  const list = DBG().zukanEntries(4)
  // 【第 35 轮改】补入巨岩骑士后：15 条全部有立绘、没有缺失登记。
  // 断言也随之从"14 张 + N 个缺失"改成"15 条全部有立绘"——
  // **要求从"如实登记缺失"变成了"不该再有缺失"**，这是收紧、不是放宽。
  check(list.length === KN.length, `共 ${list.length} 条，与骑士表一致（${KN.length}）`)
  const withArt = list.filter((x) => x.art).length
  check(withArt === list.length, `其中 ${withArt} 条有立绘（一条不缺）`)
  const noArt = list.filter((x) => !x.art)
  check(noArt.length === 0, '没有缺立绘的条目', noArt.map((x) => x.name).join('、'))
  check(list.every((x) => x.desc), '每条都有说明文字（含来源依据）')
  check(list.some((x) => x.name === '巨岩骑士'), '巨岩骑士出现在骑士页签里')
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} 项，失败 ${fail} 项`)
if (fail) process.exit(1)
