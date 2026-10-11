// 探针：FLA 里到底是矢量图形还是位图？（决定能不能自己渲染出图标）
//
// 背景：`skill_icon_301001_301020.fla` 这类文件名自带**技能 ID 区间**，
//   如果里面的图标能渲染出来，就能得到"技能 ID → 图标"的**权威对应**，
//   不再需要靠元素/顺序去猜（这正是之前卡住的地方）。
//   FLA 本质是 zip；里面的 LIBRARY/SYMBOLS 是 Flash 二进制。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.resolve('.')
const DIR = path.join(ROOT, '多克多比专区资料素材/魔法道具ICON等/多克多比技能')
const FLA = process.argv[2] || 'skill_icon_301001_301020.fla'
const p = path.join(DIR, FLA)
if (!fs.existsSync(p)) { console.log(`✗ 找不到 ${FLA}`); process.exit(1) }
const buf = fs.readFileSync(p)
console.log(`${FLA}  ${(buf.length / 1024).toFixed(0)} KB`)

// FLA 是 zip（PK 头）
const isZip = buf[0] === 0x50 && buf[1] === 0x4b
console.log(`是 zip：${isZip}`)

if (isZip) {
  // 用 .NET 解不开就手写 zip 目录解析（只读中央目录）
  const eocd = (() => {
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) return i
    }
    return -1
  })()
  if (eocd < 0) { console.log('✗ 找不到 zip 中央目录'); process.exit(1) }
  const n = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)
  console.log(`\nzip 条目 ${n} 个：`)
  const entries = []
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const cmtLen = buf.readUInt16LE(off + 32)
    const size = buf.readUInt32LE(off + 24)
    const lho = buf.readUInt32LE(off + 42)
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen)
    entries.push({ name, size, lho })
    off += 46 + nameLen + extraLen + cmtLen
  }
  for (const e of entries.slice(0, 40)) console.log(`  ${String(e.size).padStart(9)}  ${e.name}`)
  if (entries.length > 40) console.log(`  …另 ${entries.length - 40} 个`)

  // 找 LIBRARY / SYMBOLS
  const lib = entries.find((e) => /LIBRARY/i.test(e.name))
  const sym = entries.find((e) => /SYMBOLS/i.test(e.name))
  console.log(`\nLIBRARY: ${lib ? lib.name + ' (' + lib.size + ' 字节)' : '无'}`)
  console.log(`SYMBOLS: ${sym ? sym.name + ' (' + sym.size + ' 字节)' : '无'}`)

  // 读 LIBRARY 内容，看里面的名字
  if (lib) {
    // 本地头：30 字节 + nameLen + extraLen
    const ln = buf.readUInt16LE(lib.lho + 26)
    const le = buf.readUInt16LE(lib.lho + 28)
    const dataStart = lib.lho + 30 + ln + le
    const data = buf.subarray(dataStart, dataStart + lib.size)
    // 排除"位图内嵌"的可能：找 JPEG/PNG 签名
    const hasJpeg = data.includes(Buffer.from([0xff, 0xd8, 0xff]))
    const hasPng = data.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    console.log(`\nLIBRARY 内含 JPEG 签名：${hasJpeg} · PNG 签名：${hasPng}`)
    // LIBRARY 是 zlib 压缩的（FLA 特性）
    let raw = data
    try { raw = zlib.inflateSync(data); console.log(`（zlib 解压成功：${data.length} → ${raw.length} 字节）`) }
    catch { console.log('（未压缩或非 zlib）') }
    // 抽可读字符串
    const strs = [...new Set((raw.toString('utf8').match(/[\x20-\x7e\u4e00-\u9fa5]{4,60}/g) || []))]
    console.log(`\nLIBRARY 里的可读字符串 ${strs.length} 个（前 40）：`)
    for (const s of strs.slice(0, 40)) console.log(`  ${s}`)
  }

  // SYMBOLS 里能看到图形类型
  if (sym) {
    const ln = buf.readUInt16LE(sym.lho + 26)
    const le = buf.readUInt16LE(sym.lho + 28)
    const dataStart = sym.lho + 30 + ln + le
    const data = buf.subarray(dataStart, dataStart + sym.size)
    console.log(`\nSYMBOLS ${data.length} 字节，头部 hex：`)
    console.log('  ' + data.subarray(0, 64).toString('hex').replace(/(.{32})/g, '$1\n  '))
    // 找位图标签的痕迹
    const jp = data.includes(Buffer.from([0xff, 0xd8]))
    console.log(`  含 JPEG(FFD8)：${jp}`)
  }
}
