// 逐行打印官方形态表（含"动作组"列）—— 这是判断每个形态该用哪套素材的原始依据。
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
function sheets(p) {
  const zip = unzip(fs.readFileSync(p))
  const out = []
  for (const k of [...zip.keys()].filter((x) => /^xl\/worksheets\/sheet\d+\.xml$/.test(x)).sort()) {
    const shared = []
    if (zip.has('xl/sharedStrings.xml')) {
      const x = zip.get('xl/sharedStrings.xml').toString('utf8')
      for (const si of x.match(/<si>[\s\S]*?<\/si>/g) || []) shared.push([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => dec(m[1])).join(''))
    }
    const sx = zip.get(k).toString('utf8'), rows = []
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
    out.push({ file: k, rows })
  }
  return out
}
const norm = (s) => String(s === undefined ? '' : s).replace(/\s+/g, ' ').trim()

for (const rel of process.argv.slice(2)) {
  const p = path.join(ROOT, rel)
  if (!fs.existsSync(p)) { console.log('缺失 ' + rel); continue }
  console.log('\n############ ' + rel + ' ############')
  for (const s of sheets(p)) {
    console.log(`\n--- ${s.file}（${s.rows.length} 行）---`)
    s.rows.forEach((r, i) => {
      const cells = r.map((c, j) => norm(c) ? `[${j}]${norm(c)}` : null).filter(Boolean)
      if (cells.length) console.log(`  r${String(i).padStart(2)} ${cells.join('  ')}`)
    })
  }
}
