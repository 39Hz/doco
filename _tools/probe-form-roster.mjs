// 把「官方形态总表」整个列出来 —— 搞清楚原本到底有多少只多比。
//
// 起因：用户指出背包里「瑞比特·兔 多比」用错了形象，并要求"不止这一个，所有都要对应上"。
// 要做对所有形态，先得知道官方一共有哪些形态、它们的官方图在哪。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.resolve('.')
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
function sheetNames(p) {
  const zip = unzip(fs.readFileSync(p))
  if (!zip.has('xl/workbook.xml')) return []
  const x = zip.get('xl/workbook.xml').toString('utf8')
  return [...x.matchAll(/<sheet[^>]*name="([^"]*)"/g)].map((m) => dec(m[1]))
}
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
      if (type === 'inlineStr') val = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => dec(m[1])).join('')
      else { const vm = body.match(/<v>([\s\S]*?)<\/v>/); if (vm) val = type === 's' ? (shared[Number(vm[1])] ?? '') : dec(vm[1]) }
      let ci = 0
      for (const ch of ref) ci = ci * 26 + (ch.charCodeAt(0) - 64)
      cells[ci - 1 || cells.length] = val
    }
    rows.push(cells)
  }
  return rows
}
const norm = (s) => String(s === undefined ? '' : s).replace(/\s+/g, ' ').trim()

const FILES = [
  ['docs/游戏数据/多比名称和描述.xlsx', '名称和描述表'],
  ['docs/游戏数据/近期多比属性表.xlsx', '近期属性表'],
  ['多克多比专区资料素材/多比形态素材/多比一级属性.xlsx', '多比一级属性'],
  ['多克多比专区资料素材/多比形态素材/新多比资料0711.xlsx', '新多比资料0711'],
  ['多克多比专区资料素材/多比形态素材/技能及说明/近期多比属性表.xlsx', '技能目录里的近期表'],
]

const allNames = new Map()   // 归一化名 -> {name, sources:Set}
for (const [rel, label] of FILES) {
  const p = path.join(ROOT, rel)
  if (!fs.existsSync(p)) { console.log(`【${label}】缺失: ${rel}`); continue }
  const sn = sheetNames(p)
  const rows = readSheet(p, 0)
  const names = []
  for (const r of rows) {
    for (const cell of r) {
      const v = norm(cell)
      if (!v || v.length > 20) continue
      if (!/多比\s*$/.test(v) && !/多比/.test(v)) continue
      if (/属性|技能|名称|描述|介绍|形象|图|表|编号|等级|数量|合计/.test(v) && !/多比\s*$/.test(v)) continue
      names.push(v)
      break
    }
  }
  const uniq = [...new Set(names)]
  console.log(`\n【${label}】${rel}`)
  console.log(`  标签页: ${sn.join(' | ') || '(单页)'}   行数 ${rows.length}   识别到名称 ${uniq.length} 个`)
  console.log('  ' + uniq.join('、'))
  for (const n of uniq) {
    const k = n.replace(/多比|[\s·・]/g, '')
    if (!allNames.has(k)) allNames.set(k, { name: n, sources: new Set() })
    allNames.get(k).sources.add(label)
  }
}
console.log(`\n===== 全官方形态并集：${allNames.size} 种 =====`)
const list = [...allNames.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh'))
list.forEach((f, i) => console.log(`  ${String(i + 1).padStart(3)} ${f.name.padEnd(14)} ${[...f.sources].join('/')}`))
