// 读 .fla（Flash CS5+ 的 FLA = ZIP）里的时间轴文字标签 —— 用来找小游戏玩法证据
// 纯 Node 实现（zlib 解 zip），不依赖任何外部工具。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

// 极简 ZIP 读取：只处理 stored(0) 与 deflate(8)
function readZip(buf) {
  const out = new Map()
  // 从尾部找 End of Central Directory
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) return null
  const n = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break
    const method = buf.readUInt16LE(off + 10)
    const csize = buf.readUInt32LE(off + 20)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const cmtLen = buf.readUInt16LE(off + 32)
    const lho = buf.readUInt32LE(off + 42)
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen)
    // 本地头
    if (buf.readUInt32LE(lho) === 0x04034b50) {
      const ln = buf.readUInt16LE(lho + 26)
      const le = buf.readUInt16LE(lho + 28)
      const start = lho + 30 + ln + le
      const raw = buf.subarray(start, start + csize)
      try {
        out.set(name, method === 0 ? raw : zlib.inflateRawSync(raw))
      } catch { /* 跳过读不出来的 */ }
    }
    off += 46 + nameLen + extraLen + cmtLen
  }
  return out
}

const fla = process.argv[2]
if (!fla) { console.error('用法: node _tools/read-fla.mjs <file.fla> [关键字]'); process.exit(1) }
const buf = fs.readFileSync(fla)
console.log(`文件 ${path.basename(fla)}  ${(buf.length / 1048576).toFixed(1)}MB  ` +
  `头部 ${buf.subarray(0, 2).toString('latin1') === 'PK' ? '是 ZIP（可读）' : '不是 ZIP（老式 FLA，读不了）'}`)
if (buf.subarray(0, 2).toString('latin1') !== 'PK') process.exit(0)
const files = readZip(buf)
if (!files) { console.log('没读到 ZIP 目录'); process.exit(1) }
console.log(`内含 ${files.size} 个条目`)
const names = [...files.keys()]
const xmls = names.filter((n) => /\.xml$/i.test(n))
console.log(`XML ${xmls.length} 个，图片 ${names.filter((n) => /\.(png|jpg)$/i.test(n)).length} 个，` +
  `音频 ${names.filter((n) => /\.(mp3|wav)$/i.test(n)).length} 个`)

// 从所有 XML 里抽 <text> / DOMTextAttribute 里的字符
const key = process.argv[3]
const texts = new Map()
for (const n of xmls) {
  const s = files.get(n).toString('utf8')
  for (const m of s.matchAll(/<domain[^>]*name="([^"]{1,200})"/g)) {
    const t = m[1]
    if (!/[\u4e00-\u9fa5]/.test(t)) continue
    if (!texts.has(t)) texts.set(t, n)
  }
  // Flash 把每个字形单独存，也试试整段文字节点
  for (const m of s.matchAll(/<text[^>]*>([^<]{2,200})<\/text>/g)) {
    const t = m[1]
    if (/[\u4e00-\u9fa5]/.test(t) && !texts.has(t)) texts.set(t, n)
  }
}
let list = [...texts.keys()]
if (key) list = list.filter((t) => t.includes(key) || key.split('').some((c) => t.includes(c)))
console.log(`\n找到 ${texts.size} 段含中文的文字${key ? `（筛出 ${list.length} 段）` : ''}：`)
for (const t of list.slice(0, 80)) console.log('  ' + t.replace(/\s+/g, ' ').slice(0, 90))
