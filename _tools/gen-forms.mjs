// 抽取「多比形态」全表 -> assets/forms.json
//
// 数据源：
//   docs/游戏数据/多比名称和描述.xlsx    名称/描述/动作组/七维属性/专属技能/宝石/解锁需求
//   docs/游戏数据/近期多比属性表.xlsx    名称/描述/向性/专属技能/技能槽/力敏体技（更全）
//   docs/游戏数据/多比技能列表.xlsx      技能 CD/耗能/范围
//   docs/游戏数据/多比属性介绍.txt 等    十维战斗数值（生命/攻击/防御…）
//   assets/anim/index.json             已导出的精灵动作组（判断能否直接出画面）
//
// 「标签页」列是关键：它对应归档里的 .fla 素材名（dobi_191006 等），
// 也是判断某个形态是否有导出帧/只有源工程的依据。
//
// 用法: node gen-forms.mjs <项目根>
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.resolve(process.argv[2] || '.')
const DATA = path.join(ROOT, 'docs', '游戏数据')

// ---------------- XLSX ----------------
function unzip(buf) {
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('not zip')
  const count = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)
  const out = new Map()
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break
    const method = buf.readUInt16LE(off + 10)
    const compSize = buf.readUInt32LE(off + 20)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const cmtLen = buf.readUInt16LE(off + 32)
    const localOff = buf.readUInt32LE(off + 42)
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen)
    const lNameLen = buf.readUInt16LE(localOff + 26)
    const lExtraLen = buf.readUInt16LE(localOff + 28)
    const ds = localOff + 30 + lNameLen + lExtraLen
    try { out.set(name, method === 0 ? buf.subarray(ds, ds + compSize) : zlib.inflateRawSync(buf.subarray(ds, ds + compSize))) } catch { }
    off += 46 + nameLen + extraLen + cmtLen
  }
  return out
}
const dec = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&')

function readSheet(p, idx = 0) {
  const zip = unzip(fs.readFileSync(p))
  const shared = []
  if (zip.has('xl/sharedStrings.xml')) {
    const x = zip.get('xl/sharedStrings.xml').toString('utf8')
    for (const si of x.match(/<si>[\s\S]*?<\/si>/g) || []) {
      shared.push([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => dec(m[1])).join(''))
    }
  }
  const files = [...zip.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()
  if (!files[idx]) return []
  const sx = zip.get(files[idx]).toString('utf8')
  const rows = []
  for (const r of sx.match(/<row[^>]*>[\s\S]*?<\/row>/g) || []) {
    const cells = []
    for (const c of r.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = c[1], body = c[2]
      const ref = (attrs.match(/r="([A-Z]+)\d+"/) || [])[1] || ''
      const type = (attrs.match(/t="([^"]*)"/) || [])[1] || ''
      let val = ''
      if (type === 'inlineStr') {
        val = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => dec(m[1])).join('')
      } else {
        const vm = body.match(/<v>([\s\S]*?)<\/v>/)
        if (vm) val = type === 's' ? (shared[Number(vm[1])] ?? '') : dec(vm[1])
      }
      let ci = 0
      for (const ch of ref) ci = ci * 26 + (ch.charCodeAt(0) - 64)
      cells[ci - 1 || cells.length] = val
    }
    rows.push(cells)
  }
  return rows
}
function readTextAuto(p) {
  const buf = fs.readFileSync(p)
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8')
  const u = buf.toString('utf8')
  if (!u.includes('\uFFFD')) return u
  try { return new TextDecoder('gbk').decode(buf) } catch { return u }
}
// 格子里的文字可能含换行，统一成一行
const norm = (s) => String(s === undefined ? '' : s).replace(/\s+/g, ' ').trim()
const numOr = (s, d = null) => {
  const t = norm(s)
  if (t === '' || t === '？' || t === '?') return d
  const n = Number(t)
  return isNaN(n) ? d : n
}

// ---------------- 1) 技能表 ----------------
const skillRows = readSheet(path.join(DATA, '多比技能列表.xlsx'), 0)
const SKILLS = {}
for (let i = 3; i < skillRows.length; i++) {
  const r = skillRows[i]
  const n = norm(r[2])
  if (!n) continue
  SKILLS[n] = {
    desc: norm(r[3]), icon: norm(r[4]),
    cd: numOr(r[5], 1), seal: numOr(r[6], 0),
    energy: numOr(r[7], 0), range: numOr(r[8], 0),
  }
}
console.log(`技能表 ${Object.keys(SKILLS).length} 个`)

// ---------------- 2) 十维战斗数值 ----------------
const STAT_KEYS = ['生命', '魔力', '攻击', '防御', '魔攻', '魔防', '命中', '回避', '爆击', '免爆', '速度']
const tenDim = []
for (const f of fs.readdirSync(DATA).filter((x) => x.endsWith('.txt'))) {
  const text = readTextAuto(path.join(DATA, f))
  const lines = text.split(/\r?\n/)
  const NAMELINE = /^\s*([^\s][^\n]{0,24}?)\s*多比\s*[，,]\s*([^\n，,。]{1,8}?)\s*属性[。.]?\s*$/
  const starts = []
  lines.forEach((l, i) => { if (NAMELINE.test(l)) starts.push(i) })
  for (let k = 0; k < starts.length; k++) {
    const s = starts[k], e = k + 1 < starts.length ? starts[k + 1] : lines.length
    const block = lines.slice(s, e).join('\n')
    const nm = lines[s].match(NAMELINE)
    const statM = block.match(/1级属性[：:]\s*([^\n]+)/)
    if (!statM) continue
    const st = {}
    for (const key of STAT_KEYS) {
      const m = statM[1].match(new RegExp(key + '\\s*(\\d+)'))
      if (m) st[key] = Number(m[1])
    }
    if (Object.keys(st).length < 5) continue
    let element = nm[2].replace(/[，,。\s]/g, '')
    if (element === '物理') element = '无'
    tenDim.push({ name: nm[1].replace(/[?？]/g, '·').trim(), element, stats: st })
  }
}
console.log(`十维数值 ${tenDim.length} 条`)

// ---------------- 3) 形态表（两张合并，按名称去重） ----------------
const byName = new Map()
function addForm(f) {
  const key = norm(f.name).replace(/多比/g, '')
  if (!key) return
  const prev = byName.get(key)
  if (prev) {
    // 合并：新表有的字段补进来
    for (const [k, v] of Object.entries(f)) {
      if (v === null || v === undefined || v === '') continue
      if (prev[k] === null || prev[k] === undefined || prev[k] === '') prev[k] = v
      else if (k === 'desc' && String(v).length > String(prev[k]).length) prev[k] = v
    }
    prev.sources = [...new Set([...(prev.sources || []), ...(f.sources || [])])]
  } else {
    byName.set(key, f)
  }
}

// 3a) 近期多比属性表
// 实测列布局（第 0 行是表头，第 1 行是英文名，第 2 行是类型）：
//   A 技能描述 | C 名称 | D 描述 | E 向性(0-7 整数) | F 等级 | G 专属技能 | H 技能槽数
//   I 力量 | J 敏捷 | K 体质 | L 技巧 | M 魔力 | N 幸运 | O 精神
//   P~ 解锁需求
const ELEM_BY_INDEX = ['火', '水', '风', '土', '光', '暗', '毒', '无']
const recent = readSheet(path.join(DATA, '近期多比属性表.xlsx'), 0)
let nRecent = 0
for (const r of recent) {
  const name = norm(r[2])
  if (!/多比/.test(name)) continue          // 表头/英文名/类型行都不含「多比」
  nRecent++
  const ei = numOr(r[4], 7)
  addForm({
    name,
    desc: norm(r[3]),
    element: (ei >= 0 && ei <= 7) ? ELEM_BY_INDEX[ei] : null,
    initLevel: numOr(r[5], 1),
    actionGroup: null,
    attrs: {
      pow: numOr(r[8]), agi: numOr(r[9]), vit: numOr(r[10]), dex: numOr(r[11]),
      mag: numOr(r[12]), luk: numOr(r[13]), spi: numOr(r[14]),
    },
    // A 列是该形态专属技能的说明，G 列是技能名（可能是占位 id）
    skill: { name: /^\d+$/.test(norm(r[6])) ? '' : norm(r[6]), desc: norm(r[0]) },
    skillSlots: numOr(r[7]),
    gems: null, require: { courage: 0 },
    sources: ['近期多比属性表'],
  })
}

// 3b) 多比名称和描述：名称 | 描述 | 动作组 | 力 | 敏 | 体 | 技 | 魔 | 幸 | 精 | 专属技能 | 槽 | 宝石 | 勇气
const named = readSheet(path.join(DATA, '多比名称和描述.xlsx'), 0)
let nNamed = 0
for (let i = 0; i < named.length; i++) {
  const r = named[i]
  const name = norm(r[0])
  if (!/多比/.test(name)) continue
  const skillRaw = norm(r[10])
  const sp = skillRaw.match(/^(\S+)\s*(.*)$/)
  nNamed++
  addForm({
    name,
    desc: norm(r[1]),
    element: null,
    actionGroup: norm(r[2]) || null,
    attrs: {
      pow: numOr(r[3]), agi: numOr(r[4]), vit: numOr(r[5]), dex: numOr(r[6]),
      mag: numOr(r[7]), luk: numOr(r[8]), spi: numOr(r[9]),
    },
    skill: { name: sp ? sp[1] : '', desc: sp ? sp[2] : '' },
    skillSlots: numOr(r[11]),
    gems: numOr(r[12]),
    require: { courage: numOr(r[13], 0), wisdom: numOr(r[14], 0), charm: numOr(r[15], 0) },
    sources: ['多比名称和描述'],
  })
}
console.log(`形态来源：近期表 ${nRecent} 行、名称描述表 ${nNamed} 行，合并去重后 ${byName.size} 种`)

// ---------------- 3c) 归档里的官方形态表（第 30 轮新增）----------------
// 【为什么此前只有 11 只】前两张表（docs/游戏数据）里只写了 11 只形态。
// 而归档 `多克多比专区资料素材\多比形态素材\` 里还有两张**官方表**：
//   · 多比一级属性.xlsx   —— 39 只形态的**官方一级七维**（力量/敏捷/体质/技巧/魔力/运气/精神）
//   · 新多比资料0711.xlsx —— 5 只的官方短/长描述、专属技能与技能效果
// 这两张表以前没人接进来，于是"以为素材只有 11 只"。
// 教训与"嵌套子目录漏了 6 个小游戏"同源：**以为素材不够之前，先把归档翻一遍。**
const ARCH_FORMS = path.join(ROOT, '多克多比专区资料素材', '多比形态素材')

// 3c-1) 多比一级属性：实测列布局（第 0/1/2 行是三层表头，数据从第 3 行起）
//   A 多比ID | D 多比名称 | E 力量 | F 敏捷 | G 体质 | H 技巧 | I 魔力 | J 运气 | K 精神
//   每个形态占两行：第一行有 ID + 名称 + 一级数值，第二行是另一组（无名称）
let nArchAttr = 0
{
  const p = path.join(ARCH_FORMS, '多比一级属性.xlsx')
  if (fs.existsSync(p)) {
    for (const r of readSheet(p, 0)) {
      const name = norm(r[3])
      if (!/多比\s*$/.test(name) || /^(多比|超级多比|多比名称)$/.test(name)) continue
      if (r[4] === undefined || r[4] === '') continue
      nArchAttr++
      addForm({
        name,
        desc: '',
        element: null,
        actionGroup: null,
        attrs: {
          pow: numOr(r[4]), agi: numOr(r[5]), vit: numOr(r[6]), dex: numOr(r[7]),
          mag: numOr(r[8]), luk: numOr(r[9]), spi: numOr(r[10]),
        },
        skill: { name: '', desc: '' },
        skillSlots: null,
        gems: null, require: { courage: 0 },
        officialId: norm(r[0]) || null,
        sources: ['多比一级属性（归档官方表）'],
      })
    }
  } else console.log('  ⚠️ 归档里没有 多比一级属性.xlsx')
}

// 3c-2) 新多比资料0711：编号 | 名称 | 姓名 | 短描述 | 长描述 | 专属技能 | 技能效果 | 图示
let nArchNew = 0
{
  const p = path.join(ARCH_FORMS, '新多比资料0711.xlsx')
  if (fs.existsSync(p)) {
    for (const r of readSheet(p, 0)) {
      const nm = norm(r[1])
      const full = norm(r[2])
      if (!nm || !/多比/.test(full)) continue
      nArchNew++
      addForm({
        name: full,                       // 用「姓名」列（带"多比"后缀的官方全名）
        desc: norm(r[4]) || norm(r[3]),   // 优先长描述
        element: null,
        actionGroup: null,
        attrs: null,
        skill: { name: norm(r[5]), desc: norm(r[6]) },
        skillSlots: null,
        gems: null, require: { courage: 0 },
        sources: ['新多比资料0711（归档官方表）'],
      })
    }
  }
}
console.log(`归档官方表：一级属性 ${nArchAttr} 行、新多比资料 ${nArchNew} 行`)

// ---------------- 4) 合并十维数值 + 技能定义 ----------------
function keyOf(s) { return norm(s).replace(/多比|[\s·・]/g, '') }

// 官方技能表的「技能 -> 元素」与「结印技」集合（从 game/tables/skills-official.js 现读）。
// 为什么要读它：形态的配招要"以本属性为主"，而元素归属只有官方技能表说了算。
const OFFICIAL_ELEMENT = (() => {
  const p = path.join(ROOT, 'game', 'tables', 'skills-official.js')
  if (!fs.existsSync(p)) return null
  const s = fs.readFileSync(p, 'utf8')
  const m = new Map()
  // 注意：**元素为 null 的也要收**（官方 136 个技能里有 18 个没有元素，
  // 例如「费尔·凌 多比」的招牌技「嗜血」）。早先只收有元素的 118 个，
  // 于是招牌技被判成"不存在"，配招里就少了它。
  for (const mm of s.matchAll(/"([^"]+)":\s*\{[^{]*?"element":\s*("[^"]*"|null)/g)) {
    m.set(mm[1], mm[2] === 'null' ? null : mm[2].slice(1, -1))
  }
  return m.size ? m : null
})()
const OFFICIAL_SKILLS = new Set(OFFICIAL_ELEMENT ? OFFICIAL_ELEMENT.keys() : [])
const SEAL_SKILLS = new Set(Object.entries(SKILLS).filter(([, v]) => v.seal).map(([n]) => n))
if (OFFICIAL_ELEMENT) {
  const withElem = [...OFFICIAL_ELEMENT.values()].filter(Boolean).length
  console.log(`官方技能元素表：${OFFICIAL_ELEMENT.size} 个技能（其中 ${withElem} 个有元素；配招按它挑同元素技能）`)
} else console.log('⚠️ 读不到 game/tables/skills-official.js —— 配招退回内建池，可能跨元素')

// 七维 -> 十维战斗数值的换算（derived）
//
// 原版有两套数值体系：形态表的「七维」与属性介绍里的「十维」。
// 只有少数形态同时有两者，无法直接照搬。这里以已知的 4 只（有十维的）为锚点
// 校准系数，再套用到其余形态，保证量级一致。
// 锚点：加斯特·正义(无) 生命257/攻32/防15/魔攻31/速130，七维缺失的部分取形态表同名项。
const DERIVE = (a, lv = 1) => {
  const pow = a.pow || 22, agi = a.agi || 19, vit = a.vit || 24
  const dex = a.dex || 18, mag = a.mag || 21, luk = a.luk || 16, spi = a.spi || 28
  const k = 1 + 0.06 * (lv - 1)
  return {
    生命: Math.round((70 + vit * 7.8) * k),
    魔力: Math.round((30 + mag * 1.9) * k),
    攻击: Math.round(pow * 1.45),
    防御: Math.round(vit * 0.62),
    魔攻: Math.round(mag * 1.48),
    魔防: Math.round(spi * 0.15 + 1),
    命中: Math.round(dex * 2.4),
    回避: Math.round(agi * 1.9),
    爆击: Math.round(2 + luk * 0.16),
    免爆: 1,
    速度: Math.round(80 + agi * 2.6 + spi * 0.8),
  }
}

for (const f of byName.values()) {
  const fk = keyOf(f.name)
  let hit = tenDim.find((t) => keyOf(t.name) === fk)
  if (!hit) hit = tenDim.find((t) => fk.length >= 2 && (keyOf(t.name).includes(fk) || fk.includes(keyOf(t.name))))
  if (hit) { f.stats = hit.stats; if (!f.element) f.element = hit.element; f.statSource = '原表' }
  if (f.skill && f.skill.name && SKILLS[f.skill.name]) {
    f.skill = { ...f.skill, ...SKILLS[f.skill.name] }
    f.skill.defined = true
  }
  if (!f.element) {
    const d = (f.desc || '') + f.name
    const m = d.match(/(火|水|风|土|光|暗|毒)系/)
    f.element = m ? m[1]
      : /风/.test(d) ? '风' : /火|炎|焰|龙/.test(d) ? '火'
        : /水|冰|雪|海|浪|兔/.test(d) ? '水' : /土|岩|石|钢|铁|垒/.test(d) ? '土'
          : /光|阳|圣|花/.test(d) ? '光' : /暗|阴|夜|影|魔|蝎/.test(d) ? '暗'
            : /毒|蛛/.test(d) ? '毒' : '无'
  }
  // 没有原表十维数值的，用七维换算补上（标注为 derived）
  if (!f.stats) {
    f.stats = DERIVE(f.attrs || {}, f.initLevel || 1)
    f.statSource = 'derived（由七维换算）'
  }
  // 技能槽数决定可带几个技能
  f.skillSlots = f.skillSlots || 5
  // 给每个形态定一个可用的技能组（专属技能优先，其余从技能表按元素挑）
  const pool = []
  // 官方专属技能**必须**进配招（那是这只的招牌技）。判定要同时看两张表：
  // 形态表引用的技能名可能只出现在官方技能表（136 个）里、而不在 17 个的小表里 ——
  // 早先只查小表，结果「费尔·凌 多比」的招牌技「嗜血」被漏掉，测试报了出来。
  if (f.skill && f.skill.name && (SKILLS[f.skill.name] || OFFICIAL_SKILLS.has(f.skill.name))) pool.push(f.skill.name)
  // 【第 30 轮改】元素→技能池**从官方技能表里按元素现取**，不再手写。
  // 手写那份把光/暗/毒写错了元素（光池里放「重击」、暗池里放「闪电」），
  // 于是 6 只形态的配招有一半以上是跨界技能 —— 被 test-official-data 抓出来了。
  // 这正是本仓库反复踩的那类坑：**手写的对照表一定会跟真数据脱节。**
  const cand = OFFICIAL_ELEMENT
    ? [...OFFICIAL_ELEMENT.entries()].filter(([n, e]) => e === f.element && OFFICIAL_SKILLS.has(n)).map(([n]) => n)
    : (byElem[f.element] || byElem['无'])
  // 结印技优先（原版技能树里结印技是稀有的那一档），其余按名字稳定排序，保证每次生成结果一致
  const ranked = cand.slice().sort((a, b) =>
    (SEAL_SKILLS.has(b) ? 1 : 0) - (SEAL_SKILLS.has(a) ? 1 : 0) || a.localeCompare(b, 'zh'))
  for (const s of ranked) {
    if (pool.length >= f.skillSlots) break
    if (!pool.includes(s)) pool.push(s)
  }
  for (const s of ['重击', '破甲', '恢复']) {
    if (pool.length >= f.skillSlots) break
    if (!pool.includes(s)) pool.push(s)
  }
  f.skills = pool
}

// 元素修正表：原表 E 列的数字与描述有时对不上（例如「内测限定版炙热多比」
// 的 E 列是 1，但按八系索引 1=水，明显不符）。这里以描述为准覆盖。
const ELEM_FIX = {
  '德拉科·龙': '无',
  '费尔·诺': '火',
  '艾斯·林': '水',
  '艾隆·垒': '土',
  '瑞比特·兔': '风',
}
for (const f of byName.values()) {
  const k = keyOf(f.name)
  for (const [name, el] of Object.entries(ELEM_FIX)) {
    if (k.includes(keyOf(name))) { f.element = el; f.elementFixed = true; break }
  }
  if (!f.elementFixed && f.element) f.elementFromTable = true
}

// ---------------- 5) 素材可得性 ----------------
const animIdxPath = path.join(ROOT, 'assets', 'anim', 'index.json')
let animDirs = []
if (fs.existsSync(animIdxPath)) {
  const idx = JSON.parse(fs.readFileSync(animIdxPath, 'utf8'))
  animDirs = [...new Set(Object.values(idx.actions).map((a) => a.dir.split('/')[0]))]
}
// 手动标注：已知有导出帧的形态 <-> 形态名
const SPRITE_FOR = {
  '克罗': '超级克罗多比形态序列',
  '超级克罗': '超级克罗多比形态序列',
  '德拉科·龙': '龙多比形态序列',
  '龙': '龙多比形态序列',
  '凤凰': '凤凰多比形态序列',
  '光': '光多比形态序列',
  '暗': '暗多比形态序列',
  '蝎': '蝎多比形态序列',
}
// 元素 -> 兜底精灵目录（没有专属导出帧的形态，用同元素的多比帧代替）
const SPRITE_BY_ELEMENT = {
  火: '凤凰多比形态序列',
  水: '光多比形态序列',
  风: '龙多比形态序列',
  土: '蝎多比形态序列',
  光: '光多比形态序列',
  暗: '暗多比形态序列',
  毒: '蝎多比形态序列',
  无: '超级克罗多比形态序列',
}
for (const f of byName.values()) {
  const k = keyOf(f.name)
  let dir = null
  for (const [key, val] of Object.entries(SPRITE_FOR)) {
    if (k.includes(keyOf(key))) { dir = val; break }
  }
  f.ownSprite = !!(dir && animDirs.includes(dir))   // 是否有专属导出帧
  if (!f.ownSprite) dir = SPRITE_BY_ELEMENT[f.element] || '超级克罗多比形态序列'
  f.spriteDir = animDirs.includes(dir) ? dir : (animDirs[0] || null)
  // 用色调区分「借用帧」的形态，避免多只看起来一模一样
  f.tint = f.ownSprite ? null : (f.element || '无')
}

const forms = [...byName.values()]
// 排序：基础形态「克罗多比」放首位（游戏里的初始形态），
// 其余按「有专属帧的优先、元素分组」排列，便于背包浏览
const STARTER = '克罗'
forms.sort((a, b) => {
  const ka = keyOf(a.name), kb = keyOf(b.name)
  if (ka === keyOf(STARTER)) return -1
  if (kb === keyOf(STARTER)) return 1
  if (a.ownSprite !== b.ownSprite) return a.ownSprite ? -1 : 1
  const ea = ['无', '火', '水', '风', '土', '光', '暗', '毒'].indexOf(a.element)
  const eb = ['无', '火', '水', '风', '土', '光', '暗', '毒'].indexOf(b.element)
  if (ea !== eb) return ea - eb
  return a.name.localeCompare(b.name)
})
const withSprite = forms.filter((f) => f.spriteDir).length
const withStats = forms.filter((f) => f.stats).length
console.log(`  基础形态: ${forms[0].name}`)

const out = {
  generated: new Date().toISOString(),
  note: '七维(力/敏/体/技/魔/幸/精)来自形态表；十维(生命/攻击/…)来自属性介绍文本。spriteDir 为 null 表示该形态只有 .fla 源工程、没有导出帧。',
  counts: { forms: forms.length, withSprite, withStats },
  skills: SKILLS,
  forms,
}
fs.writeFileSync(path.join(ROOT, 'assets', 'forms.json'), JSON.stringify(out, null, 2))
fs.writeFileSync(path.join(ROOT, 'assets', 'forms.js'),
  '/* 自动生成，勿手改。重跑 _tools/gen-forms.mjs */\n' +
  'window.__DKDbb_FORMS__ = ' + JSON.stringify(out) + ';\n')

console.log(`\n已生成 assets/forms.json + forms.js`)
console.log(`  形态 ${forms.length} 种，其中 ${withSprite} 种有导出帧、${withStats} 种有十维数值`)
console.log('')
console.log('  #  名称              元素  动作组          精灵目录                专属技能')
forms.forEach((f, i) => {
  console.log(`  ${String(i + 1).padStart(2)} ${f.name.padEnd(16)} ${String(f.element || '?').padEnd(4)} ` +
    `${String(f.actionGroup || '-').padEnd(14)} ${String(f.spriteDir || '（无导出帧）').padEnd(22)} ${(f.skill && f.skill.name) || '-'}`)
})
