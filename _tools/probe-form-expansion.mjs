// 多比形态扩展清单：把归档里**所有**官方形态名、官方一级属性、原版立绘三者对起来，
// 算出"还能补多少只、每只缺什么"。
//
// 【为什么要有这份东西】
// 第 29 轮偶然发现 `多克多比专区资料素材\多比形态素材\` 里躺着约 40+ 张**带官方名的原版立绘**
// 和 8 个官方 xlsx（其中 `多比一级属性.xlsx` 有 39 只形态的一级属性）。
// 而项目当时只实现了 11 只 —— 也就是说**旧版真图一直在归档里，只是没被挖**。
// 这类"偶然发现"不能靠运气复现，所以做成脚本：数据源写死成"归档里所有可能装形态资料的地方"，
// 每次跑一遍就知道还差什么。
//
// 用法：node _tools/probe-form-expansion.mjs   → docs/多比形态扩展清单.md
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readXlsx } from './xlsx.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ARCH = path.join(ROOT, '多克多比专区资料素材', '多比形态素材')

// ---------- 1. 官方形态名（并集，逐条记来源）----------
const sheets = [
  ['多比一级属性.xlsx', '多比一级属性（归档）', path.join(ARCH, '多比一级属性.xlsx')],
  ['新多比资料0711.xlsx', '新多比资料0711（归档）', path.join(ARCH, '新多比资料0711.xlsx')],
  ['旋风巨岩多比资料.xlsx', '旋风巨岩多比资料（归档）', path.join(ARCH, '旋风巨岩多比资料.xlsx')],
  ['多比名称和描述.xlsx', '原版策划表·名称和描述', path.join(ROOT, 'docs', '游戏数据', '多比名称和描述.xlsx')],
  ['近期多比属性表.xlsx', '近期多比属性表', path.join(ROOT, 'docs', '游戏数据', '近期多比属性表.xlsx')],
  ['技能及说明/近期多比属性表.xlsx', '技能目录里的近期属性表（归档）', path.join(ARCH, '技能及说明', '近期多比属性表.xlsx')],
]

const official = new Map()   // 规范名 -> { sources:Set, attrs:boolean }
const normName = (s) => String(s || '').replace(/\s+/g, '').replace(/多比$/, '')
const isFormName = (s) => /多比\s*$/.test(String(s || '').trim()) && String(s).trim().length <= 14
  && !/^(多比|多比ID|超级多比)$/.test(String(s).trim())

// 【第 31 轮修】只在**名称列**里收形态名，不能"任何单元格只要以「多比」结尾就算"。
// 上一版就是这么写的，结果把 `近期多比属性表` 描述列里的「圣诞节限定版多比」
// （那一行的描述，属于「艾斯·林 多比」）当成了一只独立形态，清单里多出一条**不存在的形态**。
// 判据（两条取或）：
//   ① 该列里"以多比结尾"的单元格占比够高（≥ 0.34）；或
//   ② 该列的单元格**都很短**（≤12 字）且至少命中一个 —— 名称/昵称列天然短，
//      而描述列的单元格必然长。加这条是因为 `旋风巨岩多比资料.xlsx` 只有两行数据，
//      昵称列占比恰好 1/3 = 0.33，卡在阈值下面被漏掉（一张表就这么丢了）。
const NAME_COL_RATIO = 0.34
const NAME_CELL_MAX = 12
for (const [file, label, full] of sheets) {
  if (!fs.existsSync(full)) { console.log(`  跳过（不存在）: ${file}`); continue }
  const { sheets: sh } = readXlsx(full)
  let n = 0
  for (const sheet of sh) {
    const rows = sheet.rows || []
    const width = rows.reduce((m, r) => Math.max(m, r.length), 0)
    const nameCol = new Set()
    for (let c = 0; c < width; c++) {
      let cells = 0, hits = 0, maxLen = 0
      for (const row of rows) {
        const v = String(row[c] ?? '').trim()
        if (!v) continue
        cells++
        maxLen = Math.max(maxLen, v.length)
        if (isFormName(v)) hits++
      }
      if (!hits) continue
      if (hits / cells >= NAME_COL_RATIO || maxLen <= NAME_CELL_MAX) nameCol.add(c)
    }
    for (const row of rows) {
      for (let c = 0; c < width; c++) {
        if (!nameCol.has(c)) continue
        const cell = row[c]
        if (!isFormName(cell)) continue
        const key = normName(cell)
        if (!key) continue
        const e = official.get(key) || { name: String(cell).trim(), sources: new Set(), attrs: false }
        e.sources.add(label)
        // 「多比一级属性」这一份就是官方一级属性表 → 标 attrs
        if (/一级属性/.test(label)) e.attrs = true
        official.set(key, e)
        n++
      }
    }
  }
  console.log(`  ${file}：名称列命中 ${n} 个形态名`)
}

// ---------- 2. 归档里的原版立绘 ----------
const art = []
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(png|jpg|jpeg|bmp)$/i.test(e.name)) art.push(p)
  }
}
if (fs.existsSync(ARCH)) walk(ARCH)
console.log(`  归档立绘：${art.length} 张`)

// 名字对不上时的人工别名（**只写确有把握的**，宁可不匹配也不硬凑）
const ALIAS = {
  '土蝎多比': ['摩撒·蝎多比'],
  '蜘蛛多比': ['普伊斯·蛛多比'],
  '英雄多比': ['依斯特·英雄多比'],
  '天使多比': ['安吉尔多比', '安吉尔'],
  '龙多比': ['龙多比', '德拉科·龙多比'],
  '光多比': ['光多比'],
  '暗多比': ['暗多比', '布莱克暗夜多比'],
  '兔多比': ['兔多比', '瑞比特·兔多比'],
  '曼陀罗多比': ['曼陀罗多比', '曼陀罗·花多比', '曼陀罗'],
  '毒多比': ['毒多比'],
  '正义多比': ['正义多比'],
  '悟空多比': ['悟空', '行者孙多比'],
  '吕布多比': ['吕布多比'],
  '貂蝉多比': ['貂蝉多比'],
  '乔纳·华多比': ['乔纳·华多比'],
  '凤凰多比': ['凤凰多比'],
  '冰多比': ['弗瑞斯冰多比', '弗瑞斯·冰多比'],
  '人鱼多比': ['人鱼多比'],
  '利刃多比': ['利刃多比'],
  '机械多比': ['机械'],
  '超级克罗多比': ['超级克罗多比'],
  '克罗多比': ['克罗多比'],
  '风多比': ['风多比'],
  '钢之多比': ['钢铁多比'],
  '圣诞多比': ['圣诞多比'],
  '炫彩多比': ['炫彩多比'],
  '大时多比': ['大时多比'],
}
const findArt = (key) => {
  const keys = new Set([key, ...(ALIAS[key] || [])])
  return art.filter((p) => {
    const b = normName(path.basename(p).replace(/\.[^.]+$/, ''))
    for (const k of keys) {
      const kk = normName(k)
      if (!kk) continue
      // 只允许**文件名以形态名开头或完全相等**这一个方向。
      // 反向包含（kk.includes(b)）会把「风多比.png」算给「旋风多比」——
      // 因为「旋风」里含「风」。第一版就是这么写的，清单里因此多出一条假的候选立绘。
      if (b === kk || b.startsWith(kk)) return true
    }
    return false
  })
}

// 已知冲突：这些形态"看起来可以加"，但**不能直接加**，原因写在这里（第 31 轮登记）。
const BLOCKED_ADD = {
  '旋风多比': '归档里确实有它的独立资料页（昵称/长描述/专属技能），`旋风多比.png` 却在**温德·冽**名下 —— ' +
    '温德·冽 的原表动作组写着「用未知图案代替」（官方自己没给专属图），当初按描述「随心所欲的控制旋风」借了这张。' +
    '两者不能同时成立（会同图双挂）。**在裁定之前不擅自加**，否则立刻产生两只长得一模一样的形态。',
}

// ---------- 3. 项目现状 ----------
// 注意：assets/forms.js 是 **gen-forms.mjs 生成的 JSON**（`window.__DKDbb_FORMS__ = {...}`），
// 不是对象字面量 —— 一开始拿 /name:\s*'…'/ 去扫，得到"已实现 0 只"，
// 差点就把 31 只已实现的算成"待补"。（所以本脚本下面会自检这一项不许为 0。）
const formsSrc = fs.readFileSync(path.join(ROOT, 'assets', 'forms.js'), 'utf8')
let FORMS_DATA = null
try {
  const json = formsSrc.slice(formsSrc.indexOf('=') + 1).trim().replace(/;\s*$/, '')
  FORMS_DATA = JSON.parse(json)
} catch (e) { console.log('  ⚠️ 解析 forms.js 失败：' + e.message) }
const implemented = new Set(
  ((FORMS_DATA && FORMS_DATA.forms) || []).map((f) => normName(f.name))
)
if (!implemented.size) { console.log('  ⚠️ 自检失败：已实现形态数解析为 0，说明读法又过时了'); process.exitCode = 1 }
const artDir = path.join(ROOT, 'assets', 'forms', 'art')
const artFiles = fs.existsSync(artDir) ? fs.readdirSync(artDir) : []

// ---------- 4. 出清单 ----------
// 立绘列**以构建产物为准**（assets/forms.js 的 art / artMissing / artOnly），
// 不再自己维护一份"别名表"去猜 —— 那份表跟 build-form-art 的真实映射脱节过：
// 明明已经挂上图的形态（冰多比 ← 弗瑞斯冰多比.jpg）被列成"归档里没有立绘"。
// 自己维护的第二份对照表一定会错，这是本仓库反复踩的坑。
const implementedArt = new Map(
  ((FORMS_DATA && FORMS_DATA.forms) || []).map((f) => [normName(f.name), { art: f.art, name: f.name }])
)
const rows = [...official.entries()].map(([key, e]) => {
  const impl = implementedArt.get(key)
  const hit = impl ? (impl.art ? [path.basename(impl.art)] : []) : findArt(key)
  return {
    name: e.name, key, sources: [...e.sources], attrs: e.attrs,
    art: hit, done: !!impl, artMissing: !!(impl && !impl.art),
  }
}).sort((a, b) => (b.art.length ? 1 : 0) - (a.art.length ? 1 : 0) || a.key.localeCompare(b.key, 'zh'))

const withArt = rows.filter((r) => r.art.length)
const done = rows.filter((r) => r.done)
// 已经作为「仅形象」收录的（有官方图、不在形态表里、只进图鉴）也算"已处置"，
// 否则清单会把它们一直列成"可补"，看起来像还没做（第 32 轮踩到）。
const artOnlyNames = new Set(
  ((FORMS_DATA && FORMS_DATA.artOnly) || []).map((a) => normName(a.name))
)
const canAdd = rows.filter((r) => !r.done && !artOnlyNames.has(r.key) && r.art.length)
const artOnlyRows = rows.filter((r) => !r.done && artOnlyNames.has(r.key))

const out = []
out.push('# 多比形态扩展清单（官方名 / 官方属性 / 原版立绘 三者对齐）')
out.push('')
out.push('> **由 `_tools/probe-form-expansion.mjs` 生成，不要手改。**')
out.push('>')
out.push('> 起因：第 29 轮偶然发现归档 `多克多比专区资料素材\\多比形态素材\\` 里有约 40+ 张')
out.push('> **带官方名的原版立绘**与 8 个官方 xlsx，而项目当时只实现了 11 只。')
out.push('> 也就是说 —— **"和原版一样的图片素材"这件事，答案在归档里，不在生成器里。**')
out.push('')
out.push('## 1. 总数')
out.push('')
out.push('| 项 | 数量 |')
out.push('|---|---|')
out.push(`| 官方表里出现过的形态名（并集） | **${rows.length}** |`)
out.push(`| 归档里找得到原版立绘的 | **${withArt.length}** |`)
out.push(`| 有一级属性数据的 | **${rows.filter((r) => r.attrs).length}** |`)
out.push(`| 项目**已实现**的 | **${done.length}** |`)
out.push(`| **可以补、且已有原版立绘** | **${canAdd.length}** |`)
out.push('')
out.push('## 2. 还能补的形态（有原版立绘，尚未实现）')
out.push('')
out.push('| 形态 | 立绘文件 | 官方一级属性 | 名字来源 | 能否直接加 |')
out.push('|---|---|---|---|---|')
for (const r of canAdd) {
  const block = BLOCKED_ADD[r.key] || BLOCKED_ADD[r.name]
  out.push(`| **${r.name}** | ${r.art.length} 张：${r.art.slice(0, 3).join('、')}${r.art.length > 3 ? ' …' : ''} | ${r.attrs ? '有' : '—'} | ${r.sources.join(' / ')} | ${block ? '⚠️ **不能**（见下）' : '可以'} |`)
}
out.push('')
for (const r of canAdd) {
  const block = BLOCKED_ADD[r.key] || BLOCKED_ADD[r.name]
  if (block) out.push(`- ⚠️ **${r.name}**：${block}`)
}
if (!canAdd.length) out.push('（已无：归档里有官方立绘的形态都已处置完毕）')
out.push('')
out.push('### 2b. 已收进「仅形象」的（有官方图、**不在形态表里**、只进图鉴）')
out.push('')
out.push('这一类的规矩（V55）：**形象是官方的、数值没有任何依据** → 不进形态表，')
out.push('不会被掉落抽到、不能变身、不参与战斗；只在图鉴里以「仅形象 · 无官方数值」展示。')
out.push('')
if (artOnlyRows.length) {
  out.push('| 形态 | 立绘文件 | 名字来源 |')
  out.push('|---|---|---|')
  for (const r of artOnlyRows) {
    out.push(`| **${r.name}** | ${r.art.slice(0, 2).join('、')}${r.art.length > 2 ? ' …' : ''} | ${r.sources.join(' / ')} |`)
  }
} else out.push('（无）')
out.push('')
out.push('## 3. 有官方名但归档里没有立绘（只能标 missing，不许编）')
out.push('')
const noArt = rows.filter((r) => !r.art.length)
out.push(noArt.length ? noArt.map((r) => r.name).join(' · ') : '（无）')
out.push('')
out.push('## 4. 已实现的形态（对照）')
out.push('')
out.push([...implemented].join(' · ') || '（无）')
out.push('')
out.push('## 5. 数据源')
out.push('')
out.push('| 表 | 位置 |')
out.push('|---|---|')
for (const [file, label, full] of sheets) {
  out.push(`| ${label} | ${fs.existsSync(full) ? '`' + path.relative(ROOT, full) + '`' : '**缺失**'} |`)
}
out.push('')
out.push('## 6. 下一步（要真正做到"和原版一样"）')
out.push('')
out.push('1. 把上表第 2 节的立绘**原样拷进** `assets/forms/art/`（原版文件，不改不重绘）；')
out.push('2. 用 `多比一级属性.xlsx` 的官方数值填 `assets/forms.js` 的属性字段（**不要推算**）；')
out.push('3. 唤醒条件（勇气/智慧/魅力）只有 4 只有官方值 → 其余标 `missing`，不编；')
out.push('4. 每加一只都要过 `test-official-data.mjs`，并更新 `docs/官方资料库.md` 第 8 章。')
out.push('')

const dest = path.join(ROOT, 'docs', '多比形态扩展清单.md')
fs.writeFileSync(dest, out.join('\n'), 'utf8')
console.log(`\n多比形态扩展清单 → docs/多比形态扩展清单.md`)
console.log(`  官方形态名 ${rows.length} / 有立绘 ${withArt.length} / 有属性 ${rows.filter((r) => r.attrs).length} / 已实现 ${done.length} / 可补 ${canAdd.length}`)
