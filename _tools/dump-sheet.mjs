// 调试：打印 xlsx 指定工作表的原始单元格（列号 -> 值）
// 用法: node dump-sheet.mjs <文件.xlsx> [工作表序号=0] [起始行=0] [行数=8]
import fs from 'node:fs'
import zlib from 'node:zlib'

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

const file = process.argv[2]
const sheetIdx = Number(process.argv[3] || 0)
const from = Number(process.argv[4] || 0)
const count = Number(process.argv[5] || 8)

const zip = unzip(fs.readFileSync(file))
const shared = []
if (zip.has('xl/sharedStrings.xml')) {
  const x = zip.get('xl/sharedStrings.xml').toString('utf8')
  for (const si of x.match(/<si>[\s\S]*?<\/si>/g) || []) {
    shared.push([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''))
  }
}
const sheets = [...zip.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()
const target = sheets[sheetIdx]
const sx = zip.get(target).toString('utf8')
const rows = sx.match(/<row[^>]*>[\s\S]*?<\/row>/g) || []
console.log(`文件: ${file}`)
console.log(`工作表 ${sheetIdx}: ${target}   共 ${rows.length} 行`)
console.log('')

for (let ri = from; ri < Math.min(rows.length, from + count); ri++) {
  const cells = []
  for (const c of rows[ri].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
    const attrs = c[1]
    const body = c[2]
    const ref = (attrs.match(/r="([A-Z]+)\d+"/) || [])[1] || ''
    const type = (attrs.match(/t="([^"]*)"/) || [])[1] || ''
    let val = ''
    if (type !== 'inlineStr') {
      const vm = body.match(/<v>([\s\S]*?)<\/v>/)
      if (vm) val = type === 's' ? (shared[Number(vm[1])] ?? '') : vm[1]
    } else {
      val = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('')
    }
    let ci = 0
    for (const ch of ref) ci = ci * 26 + (ch.charCodeAt(0) - 64)
    cells[ci - 1 || cells.length] = val
  }
  console.log(`行 ${ri}:`)
  cells.forEach((v, i) => {
    if (v !== undefined && v !== '') {
      console.log(`   列${String.fromCharCode(65 + i)}(${i}) = ${String(v).slice(0, 40)}`)
    }
  })
}
