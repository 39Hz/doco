// 从策划表抽取游戏数据，生成 assets/gamedata.json
// 数据源：docs/游戏数据/ 下的原始 xlsx 与 txt（原版策划文档）
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.resolve(process.argv[2] || '.')
const DATA = path.join(ROOT, 'docs', '游戏数据')

// ---------- 最小 XLSX 读取 ----------
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
    const dataStart = localOff + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(dataStart, dataStart + compSize)
    try { out.set(name, method === 0 ? raw : zlib.inflateRawSync(raw)) } catch {}
    off += 46 + nameLen + extraLen + cmtLen
  }
  return out
}
const dec = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&')

function sheetNames(zip) {
  if (!zip.has('xl/workbook.xml')) return []
  const wb = zip.get('xl/workbook.xml').toString('utf8')
  return [...wb.matchAll(/<sheet[^>]*name="([^"]*)"/g)].map((m) => dec(m[1]))
}

function readSheet(zip, idx) {
  const files = [...zip.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()
  const target = files[idx]
  if (!target) return []
  const shared = []
  if (zip.has('xl/sharedStrings.xml')) {
    const xml = zip.get('xl/sharedStrings.xml').toString('utf8')
    for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) || []) {
      shared.push([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => dec(m[1])).join(''))
    }
  }
  const sx = zip.get(target).toString('utf8')
  const rows = []
  for (const r of sx.match(/<row[^>]*>[\s\S]*?<\/row>/g) || []) {
    const cells = []
    for (const c of r.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = c[1], body = c[2]
      const ref = (attrs.match(/r="([A-Z]+)\d+"/) || [])[1] || ''
      const type = (attrs.match(/t="([^"]*)"/) || [])[1] || ''
      let val = ''
      if (type === 'inlineStr') val = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => dec(m[1])).join('')
      else {
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

function loadXlsx(p) { return unzip(fs.readFileSync(p)) }

// ---------- GBK 文本读取 ----------
function readTextAuto(p) {
  const buf = fs.readFileSync(p)
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf)
    return buf.subarray(3).toString('utf8')
  const u = buf.toString('utf8')
  if (!u.includes('\uFFFD')) return u
  try { return new TextDecoder('gbk').decode(buf) } catch { return u }
}

// ================= 属性体系 =================
const ELEMENTS = ['火', '水', '风', '土', '光', '暗', '毒', '无']
// 相克关系：原版八系，按常见设定 + 素材中「火水土风」四系并列推得
const ELEMENT_CHART = {
  火: { 风: 1.5, 水: 0.5, 火: 0.5 },
  水: { 火: 2.0, 土: 0.5, 水: 0.5 },
  风: { 土: 1.5, 火: 0.5, 风: 0.5 },
  土: { 水: 2.0, 风: 0.5, 土: 0.5 },
  光: { 暗: 2.0, 光: 0.5 },
  暗: { 光: 2.0, 暗: 0.5 },
  毒: { 水: 1.5, 土: 1.5, 毒: 0.5 },
  无: {},
}

const out = { generated: new Date().toISOString(), elements: ELEMENTS, elementChart: ELEMENT_CHART }

// ================= 技能表 =================
console.log('=== 技能表 ===')
try {
  const zip = loadXlsx(path.join(DATA, '多比技能列表.xlsx'))
  const rows = readSheet(zip, 0)
  // 第 1-3 行是表头（中文名/英文名/类型），数据从第 4 行起
  const skills = []
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i]
    const name = (r[2] || '').trim()
    if (!name) continue
    const icon = (r[4] || '').trim()
    // 从图标名推系别：skill_icon_1001 -> 1xxx 物理/重击系，2xxx 火，3xxx 水，4xxx 土，5xxx 风
    const m = icon.match(/skill_icon_(\d)(\d{3})/)
    const family = m ? Number(m[1]) : 0
    skills.push({
      id: icon || ('skill_' + i),
      name,
      desc: (r[3] || '').trim(),
      icon,
      cd: Number(r[5]) || 0,
      seal: Number(r[6]) || 0,
      energy: Number(r[7]) || 0,
      range: Number(r[8]) || 0,
      family,
      rangeName: ['单体', '范围', '群体'][Number(r[8]) || 0] || '单体',
    })
  }
  out.skills = skills
  console.log(`  ${skills.length} 个技能`)
} catch (e) { console.log('  ✗ ' + e.message); out.skills = [] }

// ================= 怪兽表 =================
// 表结构（25 列，已核对原始单元格）：
//   A ID | B 美术资源名 | C 名称 | D 描述 | E 类型 | F 向性
//   G 尺寸（数值）| H 备注
//   I 待机 | J 准备行动 | K 移动 | L 攻击 | M 防御 | N 蓄力
//   O 技能1 | P 技能2 | Q 技能3 | R 使用道具
//   S 挨打 | T 胜利 | U 死亡 | V 归位 | W 登场 | X 闪避 | Y 准备前动
console.log('=== 怪兽表 ===')
try {
  const zip = loadXlsx(path.join(DATA, '怪兽.xlsx'))
  const names = sheetNames(zip)
  const rows = readSheet(zip, 0)
  const g = (r, i) => (r[i] === undefined ? '' : String(r[i]).trim())
  const monsters = []
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i]
    const id = g(r, 0)
    if (!id || !/^\d+$/.test(id)) continue
    monsters.push({
      id,
      res: g(r, 1),
      name: g(r, 2),
      desc: g(r, 3),
      type: g(r, 4),                       // 怪物 / 副本怪物
      element: g(r, 5),                    // 向性（八系）
      size: g(r, 6),                       // 尺寸数值
      sizeNote: g(r, 7),
      // 战斗动作状态（原版给的是动作描述或帧数）
      anim: {
        idle: g(r, 8), ready: g(r, 9), move: g(r, 10), attack: g(r, 11),
        defend: g(r, 12), charge: g(r, 13),
        skill1: g(r, 14), skill2: g(r, 15), skill3: g(r, 16), item: g(r, 17),
        hurt: g(r, 18), win: g(r, 19), die: g(r, 20), reset: g(r, 21),
        enter: g(r, 22), dodge: g(r, 23), beforeReady: g(r, 24),
      },
    })
  }
  // 数据体检：向性必须是八系之一，否则说明列串位或原表有错字
  const valid = new Set(ELEMENTS)
  // 原表已知笔误：魔龙（火山中的黑龙）向性列写成了「或」，按描述修正为火
  const KNOWN_FIX = { 魔龙: '火' }
  for (const m of monsters) {
    if (m.element && !valid.has(m.element)) {
      const fixed = KNOWN_FIX[m.name]
      if (fixed) {
        console.log(`  · 修正原表笔误: ${m.name} 向性 "${m.element}" -> "${fixed}"`)
        m.elementRaw = m.element
        m.element = fixed
      }
    }
  }
  const badElement = monsters.filter((m) => m.element && !valid.has(m.element))
  out.monsters = monsters
  console.log(`  ${monsters.length} 个怪物（工作表: ${names.join(' / ')}）`)
  if (badElement.length) {
    console.log(`  ⚠ ${badElement.length} 个怪物向性仍异常: ` +
      badElement.map((m) => `${m.name}="${m.element}"`).join(', '))
  } else {
    console.log('  ✓ 全部向性合法（八系之内）')
  }
  // 类型分布
  const types = {}
  for (const m of monsters) types[m.type || '未标注'] = (types[m.type || '未标注'] || 0) + 1
  console.log('  类型分布: ' + Object.entries(types).map(([k, v]) => `${k} ${v}`).join(' · '))
} catch (e) { console.log('  ✗ ' + e.message); out.monsters = [] }

// ================= 多比属性（从 txt 解析十维数值）=================
console.log('=== 多比属性 ===')
const STAT_KEYS = ['生命', '魔力', '攻击', '防御', '魔攻', '魔防', '命中', '回避', '爆击', '免爆', '速度']
const dobby = []
try {
  const files = fs.readdirSync(DATA).filter((f) => f.endsWith('.txt'))
  for (const f of files) {
    const text = readTextAuto(path.join(DATA, f))
    const lines = text.split(/\r?\n/)
    // 以「名字行」为锚点：形如 "哈瑞·肯 多比，风属性。"
    // GBK 解码可能把中点 · 变成 ?，所以分隔符用 [·・?？\s]* 宽松匹配
    const NAMELINE = /^\s*([^\s][^\n]{0,24}?)\s*多比\s*[，,]\s*([^\n，,。]{1,8}?)\s*属性[。.]?\s*$/
    const starts = []
    lines.forEach((l, i) => { if (NAMELINE.test(l)) starts.push(i) })
    for (let k = 0; k < starts.length; k++) {
      const s = starts[k]
      const e = k + 1 < starts.length ? starts[k + 1] : lines.length
      const block = lines.slice(s, e).join('\n')
      const nm = lines[s].match(NAMELINE)
      const statM = block.match(/1级属性[：:]\s*([^\n]+)/)
      if (!statM) continue
      const stats = {}
      for (const key of STAT_KEYS) {
        const m = statM[1].match(new RegExp(key + '\\s*(\\d+)'))
        if (m) stats[key] = Number(m[1])
      }
      if (Object.keys(stats).length < 5) continue
      let element = nm[2].replace(/[，,。\s]/g, '')
      if (element === '物理') element = '无'
      dobby.push({
        name: nm[1].replace(/[?？]/g, '·').trim() + ' 多比',
        element,
        desc: (block.match(/描述[：:]\s*([^\n]+)/) || [])[1]?.trim() || '',
        skillName: (block.match(/专属技能\s*([^：:\n]+)/) || [])[1]?.trim() || '',
        skillDesc: (block.match(/专属技能[^：:]*[：:]\s*([^\n]+)/) || [])[1]?.trim() || '',
        obtain: (block.match(/获得方式[：:]\s*([^\n]+)/) || [])[1]?.trim() || '',
        stats,
        source: f,
      })
    }
  }
  out.dobby = dobby
  console.log(`  ${dobby.length} 个多比`)
  for (const p of dobby) {
    console.log(`    ${p.name.padEnd(16)} [${p.element}] 生命${p.stats['生命']} 速度${p.stats['速度']}`)
  }
} catch (e) { console.log('  ✗ ' + e.message); out.dobby = [] }

// ================= 刷怪分布（从场景 txt 解析）=================
console.log('=== 刷怪分布 ===')
try {
  const text = readTextAuto(path.join(DATA, '光暗场景.txt'))
  const lines = text.split(/\r?\n/)
  const maps = []
  const spawns = []
  const monsterLore = []
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (!t) continue
    // 刷怪行：名字(Lv 80)   地图名
    const m = t.match(/^(.+?)\(Lv\s*(\d+)\)\s+(.+)$/)
    if (m) { spawns.push({ monster: m[1].trim(), level: Number(m[2]), map: m[3].trim() }); continue }
  }
  // 地图名：文件开头的「场景：」行 + 其后缩进的若干行
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (/^场景[：:]/.test(t)) {
      const first = t.replace(/^场景[：:]\s*/, '').trim()
      if (first) maps.push(first)
      // 后续缩进行，直到空行
      for (let j = i + 1; j < lines.length; j++) {
        const nxt = lines[j]
        if (!nxt.trim()) break
        if (/^\s+\S/.test(nxt)) maps.push(nxt.trim())
        else break
      }
      break
    }
  }
  // 怪物图鉴文字：单行名字 + 下一段描述（用于填充怪兽表缺失的描述）
  for (let i = 0; i < lines.length - 1; i++) {
    const t = lines[i].trim()
    if (!t || t.length > 12) continue
    if (/[（(]Lv|^场景[：:]/.test(t)) continue
    const next = lines[i + 1].trim()
    if (next.length > 20 && !/^[\u4e00-\u9fa5]{2,12}$/.test(next)) {
      monsterLore.push({ name: t.replace(/\t/g, ''), desc: next })
    }
  }
  out.maps = [...new Set(maps)]
  out.spawns = spawns
  out.monsterLore = monsterLore
  console.log(`  地图 ${out.maps.length} 个（${out.maps.join('、')}）`)
  console.log(`  刷怪点 ${spawns.length} 条`)
  console.log(`  图鉴描述 ${monsterLore.length} 条`)
} catch (e) { console.log('  ✗ ' + e.message); out.maps = []; out.spawns = []; out.monsterLore = [] }

// ---------- 输出 ----------
const dst = path.join(ROOT, 'assets', 'gamedata.json')
fs.writeFileSync(dst, JSON.stringify(out, null, 2))
fs.writeFileSync(
  path.join(ROOT, 'assets', 'gamedata.js'),
  '/* 自动生成，勿手改。改完请重跑 _tools/gen-gamedata.mjs */\n' +
  'window.__DKDbb_DATA__ = ' + JSON.stringify(out) + ';\n'
)
console.log(`\n已生成 assets/gamedata.json + gamedata.js`)
console.log(`  技能 ${out.skills.length} · 怪物 ${out.monsters.length} · 多比 ${out.dobby.length} · 地图 ${out.maps.length} · 刷怪 ${out.spawns.length}`)
