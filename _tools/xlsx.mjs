// 零依赖 XLSX 读取器：xlsx = zip + XML，用 Node 内置能力解析
//
// 两种用法：
//   1) 命令行看表：  node xlsx.mjs <文件.xlsx> [sheet序号=0] [最多行数=40] [最多列数=14]
//   2) 当模块用：    import { readXlsx } from './xlsx.mjs'
//                    const { sheets } = readXlsx('x.xlsx')   // sheets[i].rows = 二维字符串数组
// 之所以做成两用：解析逻辑只此一份，别的脚本要用时不必再抄一遍解压代码。
import fs from 'node:fs'
import zlib from 'node:zlib'
import { pathToFileURL } from 'node:url'

export function unzip(buf) {
  // 定位 EOCD
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('不是 zip：找不到 EOCD')
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
    // 读 local header 得到真实数据起点
    const lNameLen = buf.readUInt16LE(localOff + 26)
    const lExtraLen = buf.readUInt16LE(localOff + 28)
    const dataStart = localOff + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(dataStart, dataStart + compSize)
    try {
      out.set(name, method === 0 ? raw : zlib.inflateRawSync(raw))
    } catch { /* 跳过读不出的条目 */ }
    off += 46 + nameLen + extraLen + cmtLen
  }
  return out
}

export const decodeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&')

// 读整个工作簿：{ sheetNames: [...], sheets: [{ name, rows }] }
// rows 是二维字符串数组，按单元格的列号对齐（空单元格补 undefined）
export function readXlsx(file) {
  const zip = unzip(fs.readFileSync(file))
  // 共享字符串表
  const shared = []
  if (zip.has('xl/sharedStrings.xml')) {
    const xml = zip.get('xl/sharedStrings.xml').toString('utf8')
    for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) || []) {
      const parts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]))
      shared.push(parts.join(''))
    }
  }
  // 工作表名
  const names = []
  if (zip.has('xl/workbook.xml')) {
    const wb = zip.get('xl/workbook.xml').toString('utf8')
    for (const m of wb.matchAll(/<sheet[^>]*name="([^"]*)"/g)) names.push(decodeXml(m[1]))
  }
  const sheetFiles = [...zip.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()
  const sheets = sheetFiles.map((target, i) => {
    const sx = zip.get(target).toString('utf8')
    const rowXml = sx.match(/<row[^>]*>[\s\S]*?<\/row>/g) || []
    const rows = rowXml.map((r) => {
      const cells = []
      for (const c of r.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = c[1]
        const body = c[2]
        const ref = (attrs.match(/r="([A-Z]+)\d+"/) || [])[1] || ''
        const type = (attrs.match(/t="([^"]*)"/) || [])[1] || ''
        let val = ''
        if (type === 'inlineStr') {
          val = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('')
        } else {
          const vm = body.match(/<v>([\s\S]*?)<\/v>/)
          if (vm) val = type === 's' ? (shared[Number(vm[1])] ?? '') : decodeXml(vm[1])
        }
        let idx = 0
        for (const ch of ref) idx = idx * 26 + (ch.charCodeAt(0) - 64)
        cells[idx - 1 || cells.length] = val
      }
      return cells.map((v) => (v === undefined ? '' : String(v)))
    })
    return { name: names[i] || ('Sheet' + (i + 1)), rows }
  })
  return { sheetNames: names, sheets }
}

// ---------- 命令行（只在直接运行时执行）----------
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
const file = process.argv[2]
const wantSheet = Number(process.argv[3] || 0)
const maxRows = Number(process.argv[4] || 40)
const maxCols = Number(process.argv[5] || 14)

const { sheets } = readXlsx(file)
console.log(`文件: ${file}`)
console.log(`工作表 ${sheets.length} 个: ` + sheets.map((s, i) => `[${i}]${s.name}`).join('  '))
const sh = sheets[wantSheet]
if (!sh) { console.error('找不到工作表，可用: ' + sheets.map((s, i) => i + ':' + s.name).join(', ')); process.exit(1) }
console.log(`正在读取: ${sh.name}（第 ${wantSheet} 个）`)
console.log('─'.repeat(70))
let shown = 0
for (const cells of sh.rows) {
  if (shown >= maxRows) { console.log(`  … 还有 ${sh.rows.length - maxRows} 行`); break }
  const line = cells.slice(0, maxCols).map((v) => String(v == null ? '' : v).replace(/\s+/g, ' ')).join(' | ')
  if (line.trim()) { console.log(`  ${shown + 1}: ${line}`); shown++ }
}
console.log('─'.repeat(70))
console.log(`该表共 ${sh.rows.length} 行`)
}

