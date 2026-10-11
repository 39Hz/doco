// 从原版任务表抽取剧情脚本，生成 assets/quests.json
// 数据源：docs/剧情/**/*.xlsx（原版策划表）
// 表结构：名称 | 步骤 | 表现内容 | 内容 | 备注 | 相关ID
//   内容列的格式是「角色：台词 玩家：台词 玩家选择回答1：xxx 玩家选择回答2：yyy」串联
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.resolve(process.argv[2] || '.')
const SRC = path.join(ROOT, 'docs', '剧情')

// ---------- XLSX 读取 ----------
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
    try { out.set(name, method === 0 ? raw : zlib.inflateRawSync(raw)) } catch { }
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
  const target = files[idx]
  if (!target) return []
  const sx = zip.get(target).toString('utf8')
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

// ---------- 台词解析 ----------
// 把「角色：台词 玩家：台词 …」拆成一句句
const SPEAKERS = ['玩家选择回答1', '玩家选择回答2', '玩家选择回答3', '玩家', '玩家选择']
function parseLines(raw) {
  if (!raw) return []
  let s = String(raw).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) return []
  // 在「说话人：」前插分隔符
  const names = ['克里文', '拉鲁', '玩家选择回答1', '玩家选择回答2', '玩家选择回答3',
    '玩家选择', '玩家', '乌卡', '国王', '米萨', '迪莫', '查理', '若水', '布鲁莫',
    '卡古宙斯', '布雷姆赫拉', '菲尔凯特', '海尼斯', '杰尔', '囧囧', '西多', '渡渡龙',
    '哈卡卡', '多克队长', '索亚', '小丑', '助手', '旁白', '系统', '提示']
  // 长名字优先，避免「玩家」抢先匹配「玩家选择回答1」
  names.sort((a, b) => b.length - a.length)
  const esc = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp('(' + esc.join('|') + ')\\s*[：:]', 'g')
  const marks = []
  let m
  while ((m = re.exec(s)) !== null) marks.push({ name: m[1], at: m.index, end: re.lastIndex })
  if (!marks.length) return [{ who: '旁白', text: s }]

  const out = []
  // 开头若有不属于任何人的文字，作为旁白
  if (marks[0].at > 0) {
    const pre = s.slice(0, marks[0].at).trim()
    if (pre) out.push({ who: '旁白', text: pre })
  }
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].end
    const stop = i + 1 < marks.length ? marks[i + 1].at : s.length
    let text = s.slice(start, stop).trim()
    if (!text) continue
    let who = marks[i].name
    let kind = 'say'
    if (who.startsWith('玩家选择')) {
      kind = 'choice'
      who = '选项'
    } else if (who === '玩家') who = '@player'
    // 去掉紧跟在句子后的括号提示？保留，信息有用
    out.push({ who, text, kind })
  }
  return out
}

// ---------- 提取奖励等元信息 ----------
function parseMeta(remark, related, content) {
  const meta = { scenes: [], npcs: [], rewards: [], dungeon: null, animation: null }
  const blob = [remark, related, content].filter(Boolean).join(' ')
  for (const m of blob.matchAll(/场景ID\s*[：:]\s*([A-Za-z0-9_]+)/g)) meta.scenes.push(m[1])
  for (const m of blob.matchAll(/角色ID\s*[：:]\s*(\d+)/g)) meta.npcs.push(m[1])
  for (const m of blob.matchAll(/副本ID\s*[：:]\s*(\d+)/g)) meta.dungeon = m[1]
  for (const m of blob.matchAll(/动画ID\s*[：:]\s*([A-Za-z0-9_]+)/g)) meta.animation = m[1]
  for (const m of blob.matchAll(/([^，,。\s]+)\+(\d+)/g)) meta.rewards.push(m[1] + '+' + m[2])
  for (const m of blob.matchAll(/(\d+)\s*个(彩晶石|金币|木头人|经验)/g)) meta.rewards.push(m[2] + '×' + m[1])
  return meta
}

// ---------- 主流程 ----------
if (!fs.existsSync(SRC)) { console.error('找不到 ' + SRC); process.exit(1) }

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (/\.xlsx$/i.test(e.name) && !e.name.startsWith('~$')) acc.push(p)
  }
  return acc
}

const files = walk(SRC)
console.log(`任务表文件: ${files.length} 个`)

const quests = []
let parsed = 0, skipped = 0
for (const f of files) {
  const base = path.basename(f, '.xlsx')
  // 类型判定
  let type = 'other'
  if (/主线/.test(base)) type = 'main'
  else if (/支线/.test(base)) type = 'side'
  else if (/热点/.test(base)) type = 'event'
  // 任务名：去掉前缀与后缀标记
  let title = base
    .replace(/^主线任务\s*\d+\s*[_-]?/, '')
    .replace(/^支线任务\s*\d+\s*[_-]?/, '')
    .replace(/热点任务\s*[_-]?/, '')
    .replace(/^[\d.]+\s*热点任务\s*[_-]?/, '')
    .replace(/[（(](改|定稿)[）)]/g, '')
    .replace(/\.xlsx$/i, '')
    .trim()
  let order = 0
  const om = base.match(/(\d+)/)
  if (om) order = Number(om[1])

  let rows
  try { rows = readSheet(f, 0) } catch (e) { skipped++; continue }
  if (!rows.length) { skipped++; continue }

  // 找表头行（含「内容」）
  let hi = rows.findIndex((r) => r.some((c) => String(c || '').includes('内容')))
  if (hi < 0) hi = 0

  const steps = []
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i]
    const g = (n) => (r[n] === undefined ? '' : String(r[n]).trim())
    const step = g(1) || g(0)
    const content = g(3)
    if (!content && !step) continue
    if (/^完成任务/.test(content) || /^得到奖励/.test(content)) {
      steps.push({ id: step || 'END', kind: 'end', text: content, lines: [] })
      continue
    }
    const lines = parseLines(content)
    if (!lines.length) continue
    steps.push({
      id: step || ('S' + (i - hi)),
      kind: 'dialog',
      show: g(2),
      lines,
      meta: parseMeta(g(4), g(5), content),
    })
  }
  if (!steps.length) { skipped++; continue }

  quests.push({ id: base, type, order, title, file: path.relative(ROOT, f).replace(/\\/g, '/'), steps })
  parsed++
}

// 排序：主线按编号，支线按编号，热点按文件名
const rank = { main: 0, side: 1, event: 2, other: 3 }
quests.sort((a, b) => (rank[a.type] - rank[b.type]) || (a.order - b.order) || a.title.localeCompare(b.title))

const totalLines = quests.reduce((a, q) => a + q.steps.reduce((b, s) => b + s.lines.length, 0), 0)
const out = {
  generated: new Date().toISOString(),
  source: 'docs/剧情/**/*.xlsx（原版任务策划表）',
  stats: { quests: quests.length, steps: quests.reduce((a, q) => a + q.steps.length, 0), lines: totalLines },
  quests,
}
fs.writeFileSync(path.join(ROOT, 'assets', 'quests.json'), JSON.stringify(out, null, 2))
fs.writeFileSync(path.join(ROOT, 'assets', 'quests.js'),
  '/* 自动生成，勿手改。重跑 _tools/gen-quests.mjs */\n' +
  'window.__DKDbb_QUESTS__ = ' + JSON.stringify(out) + ';\n')

console.log(`\n已生成 assets/quests.json + quests.js`)
console.log(`  任务 ${quests.length} 个 · 步骤 ${out.stats.steps} · 台词 ${totalLines} 句`)
console.log(`  跳过 ${skipped} 个（无有效内容）`)
const byType = {}
for (const q of quests) byType[q.type] = (byType[q.type] || 0) + 1
console.log('  类型分布: ' + Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(' · '))
console.log('\n前 8 个任务:')
quests.slice(0, 8).forEach((q) => console.log(`  [${q.type}] ${q.title}  ${q.steps.length} 步`))
