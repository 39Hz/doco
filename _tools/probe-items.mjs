// 把「战斗内道具」官方表整个挖出来。
//
// 来源：docs/游戏数据/资源需求文档_魔法技能及道具.xlsx
//   · 一个标签页标题写着「战斗内道具列表及icon」
//   · 行格式：ID | 名称 | 类型 | 描述 | ? | icon图集 | 单个icon名
//   · ID 段：291xxx（恢复型/投掷型）
// 用户要的「金币买道具、战斗里回血回蓝、也能造成伤害」正好对应这张表。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.resolve('.')
function unzip(buf) {
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
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
const dec = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&')
const norm = (s) => String(s === undefined ? '' : s).replace(/\s+/g, ' ').trim()

const p = path.join(ROOT, 'docs', '游戏数据', '资源需求文档_魔法技能及道具.xlsx')
const zip = unzip(fs.readFileSync(p))
const shared = []
{
  const x = zip.get('xl/sharedStrings.xml').toString('utf8')
  for (const si of x.match(/<si>[\s\S]*?<\/si>/g) || []) {
    shared.push([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => dec(m[1])).join(''))
  }
}
const files = [...zip.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()
for (const f of files) {
  const sx = zip.get(f).toString('utf8')
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
  const hits = rows.filter((r) => /^29\d{4}$/.test(norm(r[0])))
  if (!hits.length) continue
  console.log(`\n### ${f}  共 ${rows.length} 行，其中道具行 ${hits.length}`)
  // 打印表头附近的提示行
  rows.slice(0, 3).forEach((r, i) => {
    const c = r.map((v, j) => norm(v) ? `[${j}]${norm(v)}` : null).filter(Boolean)
    if (c.length) console.log(`  表头 r${i}: ${c.join('  ')}`)
  })
  for (const r of hits) {
    console.log('  ' + r.map((v, j) => norm(v) ? `[${j}]${norm(v)}` : null).filter(Boolean).join('  '))
  }
}
