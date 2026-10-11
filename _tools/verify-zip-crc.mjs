// 逐条目 CRC 全检发布包（找出到底哪些条目坏了、坏法是什么）
// 用法: node _tools/verify-zip-crc.mjs [包名]
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.resolve('.')
const name = process.argv[2] || fs.readdirSync(ROOT).filter((f) => /^多克多比v[\d.]+单机版\.zip$/.test(f)).sort().pop()
const buf = fs.readFileSync(path.join(ROOT, name))
console.log(`包: ${name}  ${(buf.length / 1048576).toFixed(2)} MB`)

let eocd = -1
for (let i = buf.length - 22; i >= 0 && i > buf.length - 70000; i--) {
  if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
}
const count = buf.readUInt16LE(eocd + 10)
let off = buf.readUInt32LE(eocd + 16)
console.log(`中央目录: ${count} 条目 @${off}\n`)

let checked = 0, bad = 0, badSize = 0, badCrc = 0
const problems = []
for (let i = 0; i < count; i++) {
  const sig = buf.readUInt32LE(off)
  if (sig !== 0x02014b50) { problems.push({ i, why: `中央目录签名错 0x${sig.toString(16)} @${off}` }); break }
  const method = buf.readUInt16LE(off + 10)
  const crc = buf.readUInt32LE(off + 16)
  const csize = buf.readUInt32LE(off + 20)
  const usize = buf.readUInt32LE(off + 24)
  const nlen = buf.readUInt16LE(off + 28)
  const elen = buf.readUInt16LE(off + 30)
  const clen = buf.readUInt16LE(off + 32)
  const lho = buf.readUInt32LE(off + 42)
  const nm = buf.toString('utf8', off + 46, off + 46 + nlen)

  // 本地头
  const lsig = buf.readUInt32LE(lho)
  if (lsig !== 0x04034b50) { problems.push({ i, name: nm, why: `本地头签名错 0x${lsig.toString(16)} @${lho}` }); bad++; off += 46 + nlen + elen + clen; continue }
  const lnlen = buf.readUInt16LE(lho + 26)
  const lelen = buf.readUInt16LE(lho + 28)
  const start = lho + 30 + lnlen + lelen
  const hasDD = (buf.readUInt16LE(lho + 6) & 0x08) !== 0
  try {
    let data = buf.subarray(start, start + csize)
    const raw = method === 0 ? data : zlib.inflateRawSync(data)
    if (raw.length !== usize) { badSize++; problems.push({ i, name: nm, why: `解出 ${raw.length} 字节，头里写 ${usize}` }); bad++ }
    else {
      const c = zlib.crc32 ? zlib.crc32(raw) : null
      if (c !== null && c !== crc) { badCrc++; problems.push({ i, name: nm, why: `CRC 不符 算出 ${c.toString(16)} 头里 ${crc.toString(16)}` }); bad++ }
    }
  } catch (e) {
    bad++
    problems.push({ i, name: nm, why: `解压失败: ${e.message}${hasDD ? '  [条目带数据描述符 bit3]' : ''}` })
  }
  checked++
  off += 46 + nlen + elen + clen
}
console.log(`检查 ${checked} 条目：坏 ${bad}（尺寸错 ${badSize} / CRC 错 ${badCrc}）\n`)
for (const p of problems.slice(0, 20)) console.log(`  ✗ [${p.i}] ${p.name || ''}  ${p.why}`)
if (problems.length > 20) console.log(`  …另 ${problems.length - 20} 条`)
process.exit(bad ? 1 : 0)
