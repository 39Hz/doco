// M3-1 的成果落地：解析从 rar 里解出的**原版技能表**（多克多比技能.xlsx）。
//
// 这份表的来历：`多克多比专区资料素材\多比形态素材\技能及说明\VIP技能.rar`
//   → `VIP技能\多克多比技能.xlsx`
// 表头是**游戏数据导出格式**（三行：中文名 / 英文字段名 / 类型），不是玩家手写的攻略：
//     名称 | 描述 | 冷却时间 | 是否结印 | 消耗生命 | 消耗魔法
//     name | description | cd | singing | change_hp | change_mp
//     string | string | int | int | int | int
// 所以依据等级是 **official**（原版数据文件），比之前从 7k7k 网页抓的更权威。
//
// 它比 7k7k 多的东西：
//   · 描述里**每条都写明了技能类型**（力量型/精神力/魔武混合/辅助/恢复类）
//     —— 这正好解开 M1-3「不许给未声明的技能假声明类型」那个约束：
//        以前 85 个里只有 15 个能定类型，现在有官方依据的多了。
//   · 官方 CD、官方**是否结印**、官方**消耗生命/消耗魔法**
// 它没有的东西：属性（元素）、范围、掉落 —— 那些仍然取 7k7k。
//
// 输出：_web/official_skills.json
// 用法： node _tools/parse-official-table.mjs
import fs from 'node:fs'
import { readXlsx } from './xlsx.mjs'

const SRC = '_rar_extracted/VIP技能/VIP技能/多克多比技能.xlsx'
const OUT = '_web/official_skills.json'
if (!fs.existsSync(SRC)) { console.error('找不到原版技能表：' + SRC + '\n（先跑 node _tools/extract-rars.mjs）'); process.exit(2) }

const { sheets } = readXlsx(SRC)
const sh = sheets[0]
if (!sh) { console.error('xlsx 里没有工作表'); process.exit(2) }
console.log(`读入 ${SRC}`)
console.log(`工作表「${sh.name}」共 ${sh.rows.length} 行`)

// 前三行是表头（中文名 / 英文字段名 / 类型），从第 4 行开始是数据
const HEAD = 3
const rows = sh.rows.slice(HEAD)
const KIND_PATTERNS = [
  [/力量型技能/, 'physical'],
  [/精神力技能/, 'magic'],
  [/魔武混合技能/, 'hybrid'],
  [/辅助技能/, 'support'],
  [/恢复类技能/, 'support'],
]
function kindOf(desc) {
  for (const [re, k] of KIND_PATTERNS) if (re.test(desc)) return k
  return 'attack'          // 官方没写类型 → 保持中性，不假设
}
const num = (s) => {
  const m = String(s == null ? '' : s).match(/-?\d+/)
  return m ? Number(m[0]) : null
}

const skills = []
const problems = []
for (const r of rows) {
  const name = (r[0] || '').trim()
  if (!name) continue
  const desc = (r[1] || '').trim()
  const cd = num(r[2])
  const seal = num(r[3])
  const hpCost = num(r[4])
  const mpCost = num(r[5])
  if (cd == null || seal == null) { problems.push({ name, why: 'cd/结印 缺失' }); continue }
  skills.push({
    name, desc,
    cd: cd || 0,
    seal: seal ? 1 : 0,
    // 表里 change_hp / change_mp 是**负增量**（-10 = 扣 10 点）。
    // 统一存成"消耗多少"的正数，免得下游每处都要记得取负。
    hpCost: Math.abs(hpCost || 0),
    mpCost: Math.abs(mpCost || 0),
    kind: kindOf(desc),
    kindEvidence: (desc.match(/力量型技能|精神力技能|魔武混合技能|辅助技能|恢复类技能/) || [''])[0],
    src: SRC,
    conf: 'official',
  })
}

fs.mkdirSync('_web', { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(skills, null, 1), 'utf8')

// ---------- 汇总 ----------
const byKind = {}
for (const s of skills) byKind[s.kind] = (byKind[s.kind] || 0) + 1
const declared = skills.filter((s) => s.kind !== 'attack').length
console.log(`\n解析出技能 ${skills.length} 个（跳过 ${problems.length} 行）`)
console.log('类型分布：' + JSON.stringify(byKind))
console.log(`其中**官方在描述里声明了类型**的：${declared} 个（${(declared / skills.length * 100).toFixed(0)}%）`)
console.log(`结印技（是否结印=1）：${skills.filter((s) => s.seal).length} 个 → ${skills.filter((s) => s.seal).map((s) => s.name).join('、')}`)
const mps = skills.map((s) => s.mpCost).filter((v) => v > 0)
console.log(`消耗魔法区间：${Math.min(...mps)} ~ ${Math.max(...mps)}（0 消耗 ${skills.filter((s) => s.mpCost === 0).length} 个）`)
const cds = skills.map((s) => s.cd)
console.log(`冷却区间：${Math.min(...cds)} ~ ${Math.max(...cds)}`)
const hpCosted = skills.filter((s) => s.hpCost > 0)
console.log(`消耗生命的技能：${hpCosted.length} 个${hpCosted.length ? ' → ' + hpCosted.map((s) => `${s.name}(${s.hpCost})`).join('、') : ''}`)

// ---------- 与现有来源对比 ----------
const mine = JSON.parse(fs.readFileSync('_web/skills.json', 'utf8'))       // 7k7k（85 个）
const mineNames = new Set(mine.map((s) => s.name.replace(/（超级技能）$/, '')))
const officialNames = new Set(skills.map((s) => s.name))
const onlyOfficial = skills.filter((s) => !mineNames.has(s.name)).map((s) => s.name)
const onlyMine = [...mineNames].filter((n) => !officialNames.has(n))
console.log(`\n与 7k7k 那 85 个对比：`)
console.log(`  两来源都有：${skills.filter((s) => mineNames.has(s.name)).length} 个`)
console.log(`  只有原版表有（**新增 ${onlyOfficial.length} 个**）：${onlyOfficial.join('、')}`)
console.log(`  只有 7k7k 有：${onlyMine.join('、') || '（无）'}`)

// 官方表能给出类型、而 7k7k 给不出的那些（M1-3 的关键收益）
const kindGain = skills.filter((s) => s.kind !== 'attack' && mineNames.has(s.name)).map((s) => s.name)
console.log(`\n★ 原版表能给类型、7k7k 给不出的技能：${kindGain.length} 个`)
console.log(`  ${kindGain.slice(0, 24).join('、')}${kindGain.length > 24 ? ' …' : ''}`)

// ---------- 自检（R5）----------
console.log('\n自检：')
const ok1 = skills.length >= 120
console.log(`  ${ok1 ? '✓' : '✗'} 解析出 ${skills.length} 个技能（应 ≥120）`)
const ok2 = declared / skills.length > 0.6
console.log(`  ${ok2 ? '✓' : '✗'} 声明类型的比例 ${(declared / skills.length * 100).toFixed(0)}%（应 >60%）`)
const ok3 = skills.filter((s) => s.seal).length >= 8
console.log(`  ${ok3 ? '✓' : '✗'} 结印技 ${skills.filter((s) => s.seal).length} 个（应 ≥8）`)
// 正例：一定存在的几个技能必须在表里（重击/火球 是新手技能，不可能没有）
const probe = ['重击', '火球'].filter((n) => officialNames.has(n))
console.log(`  ${probe.length === 2 ? '✓' : '✗'} 正例命中：${probe.join('、')}（构造必然为真的用例）`)
if (!(ok1 && ok2 && ok3 && probe.length === 2)) process.exit(1)
