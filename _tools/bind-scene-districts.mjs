// 场景 → 官方七大地形 归属表（M2-2，第 51 轮）
//
// 【为什么要重做】原先只有"11 座岛 → 7 地形"这一层（world.js 的 districts），
// 88 个场景**没有逐一归属**。而"岛"是我们按**美术资源相似度**分的组，不是原版结构
//（world.js 自己的注释就写了这一点）。于是当某个场景有**官方名字**时，
// 它可能和我们按美术归的岛对不上 —— 这正是要查的东西。
//
// 规则（R9：不编）：
//   ① 默认继承 = 该场景所属岛的地形（conf: derived）
//   ② 官方场景名**明确指向**某个地形时，按官方名覆盖（conf: official），并写清推断理由
//   ③ 官方名**暗示**与继承值不同、但不足以下结论的 → 不覆盖，标 review 交人复核
//
// 输出：
//   docs/场景地形归属.json   机器可读（游戏与测试读它）
//   docs/场景地形归属.md     人读表（并进 D3 复核工作表）
//
// 用法: node _tools/bind-scene-districts.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { T } from './game-harness.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'))
const bgm = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'bgm', 'island-bgm.json'), 'utf8'))

// 不自己写 world.js 的解析器 —— **用测试台把它真正加载起来再读**。
// （第一版手写正则抠数组，字段顺序稍有变化就解析失败；而 world.js 是浏览器脚本，
//   测试台本来就是它的正规加载器。fidelity-report 等报告脚本也是这么做的。）
T.load('game/game.js')
await T.settle()
const world = T.get('__world')
if (!world || !world.islands || !world.districts) throw new Error('world.js 加载后拿不到 islands/districts')
const islands = world.islands.map((i) => ({ id: i.id, name: i.name, scenes: i.scenes.slice() }))
const districts = world.districts.map((d) => ({ id: d.id, name: d.name, islands: d.islands.slice() }))

const districtOfIsland = (iid) => districts.find((d) => d.islands.includes(iid)) || null
const islandOfScene = (sid) => islands.find((i) => i.scenes.includes(sid)) || null
// 场景总数**从数据算**，不写死（第 62 轮场景从 88 增到 93；写死的数字每加一关都要来改一次）
const EXPECT = islands.reduce((n, i) => n + i.scenes.length, 0)

// ---- 官方场景名 → 地形 的判读 ----
// ⚠️ 每一条都要能说清"名字里的哪个词指向哪个地形"，并引官方地形定义（5068《七大地形》原文）。
//    `pin` = 明确到可以直接定（城堡的郊外/走道只能是多比城堡的）
//    `hint` = 暗示但不足以下结论（学堂/图书馆/藤蔓 —— 学院·智慧城·索亚森林都可能）
const NAME_RULES = [
  { re: /^城堡/, pin: 'castle', why: '官方名含「城堡」—— 官方地形「多比城堡」' },
  { re: /^多比城堡/, pin: 'castle', why: '官方名就是地形名「多比城堡」' },
  { re: /^多比大街/, pin: 'market', why: '官方名就是地形名「多比大街」' },
  { re: /学堂|学院|魔法/, hint: 'academy', why: '官方地形「多比学院」＝了解魔法技能的地方，名字像学院' },
  { re: /图书馆/, hint: 'academy', why: '「图书馆」是学东西的地方，但也可能属多比城堡（王城里的设施）' },
  { re: /^智慧|比拼/, hint: 'wisdom', why: '官方地形「智慧城」＝参加智慧大比拼赢得奖品' },
  { re: /藤|蔓|林|树|叶/, hint: 'soya', why: '官方地形「索亚森林」＝索亚精灵生活的地方，名字带植物' },
  { re: /峡谷|平原|熔岩|矿坑|裂缝|火山|沙漠/, hint: 'canyon', why: '官方地形「勇气峡谷」＝接受任务挑战、培养勇气的地方（野外/险地）' },
  { re: /悬浮|空岛|神秘/, hint: 'float', why: '官方地形「未知悬浮岛」＝不定期出现的神秘悬浮岛' },
]

const rows = []
for (const isl of islands) {
  const dist = districtOfIsland(isl.id)
  for (const sid of isl.scenes) {
    const sc = man.scenes.find((x) => x.id === sid) || { id: sid, title: '', conf: 'derived' }
    const isOfficialName = sc.conf === 'official' && !!sc.title
    let finalDist = dist
    let conf = 'derived'
    let why = `继承所属岛「${isl.name}」的地形（岛→地形的映射见 world.js districts）`
    let review = null
    if (isOfficialName) {
      for (const r of NAME_RULES) {
        if (!r.re.test(sc.title)) continue
        if (r.pin) {
          if (r.pin !== dist.id) {
            finalDist = districts.find((d) => d.id === r.pin)
            conf = 'official'
            why = `${r.why}；官方场景名「${sc.title}」直接定到「${finalDist.name}」` +
              `（原先按美术分组落在「${dist.name}」，以官方名为准）`
          } else {
            conf = 'official'
            why = `${r.why}；与所属岛一致，互为印证`
          }
        } else if (r.hint && r.hint !== dist.id) {
          // 暗示不同但不足以下结论 → 不覆盖，交人复核
          review = {
            suggest: districts.find((d) => d.id === r.hint).name,
            keep: dist.name,
            why: r.why,
          }
          why = `继承「${dist.name}」；但官方名「${sc.title}」更像「${review.suggest}」→ 已标待复核`
        }
        break
      }
      if (conf === 'derived' && !review) {
        conf = 'official'
        why = `继承所属岛「${isl.name}」的地形；官方场景名「${sc.title}」与它一致，互为印证`
      }
    }
    rows.push({
      scene: sid, officialName: isOfficialName ? sc.title : null,
      island: isl.id, islandName: isl.name,
      district: finalDist.id, districtName: finalDist.name,
      conf, why, review,
      bgm: (bgm[isl.id] && (bgm[isl.id].track || bgm[isl.id])) || null,
    })
  }
}
rows.sort((a, b) => a.scene - b.scene)

// ---- 自检（R5：工具要能自证该找到的都找到了）----
const problems = []
if (rows.length !== EXPECT) problems.push(`场景数 ${rows.length} ≠ ${EXPECT}`)
const seen = new Set()
for (const r of rows) {
  if (seen.has(r.scene)) problems.push(`场景 ${r.scene} 出现两次`)
  seen.add(r.scene)
  if (!r.district) problems.push(`场景 ${r.scene} 没归到地形`)
}
for (let i = 1; i <= EXPECT; i++) if (!seen.has(i)) problems.push(`场景 ${i} 没有归属`)
if (problems.length) {
  console.error('✗ 自检失败：')
  for (const p of problems) console.error('   - ' + p)
  process.exit(1)
}

const pinCount = rows.filter((r) => r.conf === 'official' && /直接定到/.test(r.why)).length
const reviewRows = rows.filter((r) => r.review)
const byDist = {}
for (const r of rows) byDist[r.districtName] = (byDist[r.districtName] || 0) + 1

const out = {
  _note: '场景 → 官方七大地形 归属表（由 _tools/bind-scene-districts.mjs 生成，勿手改）。' +
    'M2-2：全部场景逐一归属。conf=official 表示官方场景名直接定案；derived 表示继承所属岛。',
  generatedBy: '_tools/bind-scene-districts.mjs',
  total: rows.length,
  districts: districts.map((d) => ({ id: d.id, name: d.name, scenes: byDist[d.name] || 0 })),
  pinned: pinCount,
  needReview: reviewRows.length,
  scenes: rows,
}
fs.writeFileSync(path.join(ROOT, 'docs', '场景地形归属.json'), JSON.stringify(out, null, 2) + '\n')

// ---- 人读表 ----
const md = []
md.push('# 场景 → 官方七大地形 归属表（M2-2，第 51 轮）')
md.push('')
md.push('> 本文件由 `_tools/bind-scene-districts.mjs` **生成**，勿手改。机器可读版：`docs/场景地形归属.json`。')
md.push('')
md.push(`**${EXPECT} 个场景全部有归属**；其中 **${pinCount} 个由官方场景名直接定案**（` + '`official`），' +
  `**${reviewRows.length} 个待你复核**（官方名暗示的地形与"按美术分组"的结果不一致）。`)
md.push('')
md.push('## 为什么要做这件事')
md.push('')
md.push('`world.js` 里那 11 座岛是**按美术资源相似度**分出来的组，不是原版结构（该文件注释自己写明了）。')
md.push('官方只有**七大地形**。当某个场景有**官方名字**时，它可能和我们按美术归的岛对不上 —— 这次就查出来了：')
md.push('')
md.push('| 官方名 | 所在岛 | 按美术分组得到的地形 | 按官方名判定 |')
md.push('|---|---|---|---|')
for (const r of rows.filter((x) => x.officialName && /直接定到/.test(x.why))) {
  md.push(`| **${r.officialName}** | ${r.islandName} | ${r.districtName === '多比城堡' ? '（不是城堡）' : r.districtName} | **${r.districtName}** |`)
}
md.push('')
md.push('> 结论：**"岛"只是美术分组，不能当地形用。** 官方场景名一出现，就要按官方名定。')
md.push('')
md.push('## 待你复核（' + reviewRows.length + ' 个）')
md.push('')
md.push('这些场景有官方名字，名字**像**另一个地形，但不足以直接定案。请在最后一列写"同意/改成 X"：')
md.push('')
md.push('| 场景 | 官方名 | 现在归 | 名字更像 | 理由 | 你的裁定 |')
md.push('|---|---|---|---|---|---|')
for (const r of reviewRows) {
  md.push(`| ${r.scene} | **${r.officialName}** | ${r.review.keep} | ${r.review.suggest} | ${r.review.why} |  |`)
}
md.push('')
md.push('## 全部 ' + EXPECT + ' 个场景')
md.push('')
md.push('| 场景 | 名字 | 官方名? | 岛 | 地形 | 依据等级 | 依据 |')
md.push('|---|---|---|---|---|---|---|')
for (const r of rows) {
  md.push(`| ${r.scene} | ${r.officialName || '（推算名）'} | ${r.officialName ? '✅' : ''} | ${r.islandName} | **${r.districtName}** | ${r.conf} | ${r.why} |`)
}
md.push('')
md.push('## 各地形场景数')
md.push('')
md.push('| 地形 | 场景数 |')
md.push('|---|---|')
for (const d of out.districts) md.push(`| ${d.name} | ${d.scenes} |`)
md.push('')
fs.writeFileSync(path.join(ROOT, 'docs', '场景地形归属.md'), md.join('\n'))

console.log(`✓ ${EXPECT} 个场景全部归属（official 定案 ${pinCount} 个，待复核 ${reviewRows.length} 个）`)
console.log('  地形分布:', out.districts.map((d) => `${d.name} ${d.scenes}`).join(' / '))
if (reviewRows.length) {
  console.log('  待复核：')
  for (const r of reviewRows) console.log(`    ${r.scene} 「${r.officialName}」 现在 ${r.review.keep} → 名字更像 ${r.review.suggest}`)
}
