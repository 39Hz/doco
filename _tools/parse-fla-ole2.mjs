// 解析 OLE2/CFB 容器（老式 .fla 的格式：magic D0CF11E0），列出内部流并尝试解出图标
//
// 【为什么值得做】`skill_icon_<start>_<end>.fla` 的**文件名自带技能 ID 区间**。
//   只要能把里面的图标按顺序取出来，就能建立"技能 ID → 图标"的**权威对应** ——
//   这正是之前卡住的地方（不靠元素/顺序去猜）。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.resolve('.')
const DIR = path.join(ROOT, '多克多比专区资料素材/魔法道具ICON等/多克多比技能')
const F = process.argv[2] || 'skill_icon_302001_302020.fla'
const buf = fs.readFileSync(path.join(DIR, F))
console.log(`${F}  ${(buf.length / 1024).toFixed(0)} KB\n`)

// ---- CFB 头 ----
const sig = buf.subarray(0, 8).toString('hex')
if (sig !== 'd0cf11e0a1b11ae1') { console.log(`✗ 不是 CFB（magic=${sig}）`); process.exit(1) }
const sectorShift = buf.readUInt16LE(30)
const miniSectorShift = buf.readUInt16LE(32)
const SEC = 1 << sectorShift
const MINI = 1 << miniSectorShift
const numFatSectors = buf.readUInt32LE(44)
const firstDirSector = buf.readUInt32LE(48)
const miniCutoff = buf.readUInt32LE(56)
const firstMiniFatSector = buf.readUInt32LE(60)
const numMiniFatSectors = buf.readUInt32LE(64)
const firstDifatSector = buf.readUInt32LE(68)
const numDifatSectors = buf.readUInt32LE(72)
console.log(`扇区 ${SEC} 字节 · 小扇区 ${MINI} · FAT 扇区 ${numFatSectors} · 目录起始扇区 ${firstDirSector}`)

// 扇区号 → 文件偏移（头占一个扇区的位置）
const secOff = (n) => (n + 1) * SEC
const readSector = (n) => buf.subarray(secOff(n), secOff(n) + SEC)

// ---- 读 FAT（含 DIFAT 链）----
const fatSectors = []
for (let i = 0; i < 109 && fatSectors.length < numFatSectors; i++) {
  const v = buf.readUInt32LE(76 + i * 4)
  if (v === 0xffffffff) break
  fatSectors.push(v)
}
let difat = firstDifatSector
let guard = 0
while (difat !== 0xffffffff && difat !== 0xfffffffe && guard++ < 1000 && fatSectors.length < numFatSectors) {
  const s = readSector(difat)
  const per = SEC / 4 - 1
  for (let i = 0; i < per; i++) {
    const v = s.readUInt32LE(i * 4)
    if (v !== 0xffffffff && v !== 0xfffffffe) fatSectors.push(v)
  }
  difat = s.readUInt32LE(SEC - 4)
}
const fat = []
for (const fs_ of fatSectors) {
  const s = readSector(fs_)
  for (let i = 0; i < SEC / 4; i++) fat.push(s.readUInt32LE(i * 4))
}
console.log(`FAT 条目 ${fat.length} 个`)

// 顺着 FAT 链读一条流
function chain(start) {
  const out = []
  let cur = start, g = 0
  while (cur !== 0xfffffffe && cur !== 0xffffffff && g++ < 100000) {
    out.push(cur)
    cur = fat[cur]
    if (cur === undefined) break
  }
  return out
}
const readStream = (start) => {
  const secs = chain(start)
  const parts = secs.map((n) => readSector(n))
  return Buffer.concat(parts)
}

// ---- 目录项 ----
const dirBuf = readStream(firstDirSector)
const entries = []
for (let off = 0; off + 128 <= dirBuf.length; off += 128) {
  const nameLen = dirBuf.readUInt16LE(off + 64)
  if (nameLen <= 0 || nameLen > 64) continue
  const name = dirBuf.toString('utf16le', off, off + nameLen - 2)
  const type = dirBuf[off + 66]
  const startSec = dirBuf.readUInt32LE(off + 116)
  const size = Number(dirBuf.readBigUInt64LE(off + 120))
  if (type !== 2 && type !== 5) continue
  entries.push({ name, type, startSec, size })
}
console.log(`\n目录项 ${entries.length} 个：`)
for (const e of entries) console.log(`  ${e.type === 5 ? '[根]' : '    '} ${String(e.size).padStart(9)}  ${e.name}`)

// ---- 小流（< miniCutoff）走 MiniFAT ----
const root = entries.find((e) => e.type === 5)
let miniStreamData = null
const miniFat = []
if (root && firstMiniFatSector !== 0xfffffffe) {
  miniStreamData = readStream(root.startSec)
  const mf = readStream(firstMiniFatSector)
  for (let i = 0; i < mf.length / 4; i++) miniFat.push(mf.readUInt32LE(i * 4))
}
const readMini = (start, size) => {
  const out = []
  let cur = start, g = 0
  while (cur !== 0xfffffffe && cur !== 0xffffffff && g++ < 100000) {
    out.push(miniStreamData.subarray(cur * MINI, (cur + 1) * MINI))
    cur = miniFat[cur]
    if (cur === undefined) break
  }
  return Buffer.concat(out).subarray(0, size)
}

// ---- 对每个流：尝试 zlib 解压并找图像签名 ----
console.log('\n=== 各流内容分析 ===')
for (const e of entries) {
  if (e.type === 5 || e.size === 0) continue
  let data
  try { data = e.size < miniCutoff ? readMini(e.startSec, e.size) : readStream(e.startSec).subarray(0, e.size) }
  catch (err) { console.log(`  ${e.name}: 读取失败 ${err.message}`); continue }
  const hasJpeg = data.includes(Buffer.from([0xff, 0xd8, 0xff]))
  const hasPng = data.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  let note = ''
  // 试 zlib
  let dec = null
  for (const off of [0, 4, 8, 16]) {
    if (off >= data.length) break
    try { dec = zlib.inflateSync(data.subarray(off)); note = `zlib@${off} → ${dec.length}B`; break } catch { }
  }
  if (dec) {
    if (dec.includes(Buffer.from([0xff, 0xd8, 0xff]))) note += ' 含JPEG'
    if (dec.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) note += ' 含PNG'
  }
  console.log(`  ${e.name.padEnd(24)} ${String(e.size).padStart(8)}B  JPEG=${hasJpeg} PNG=${hasPng}  ${note}`)
  // 把解出来的东西存下来，供后续找图标
  if (dec && dec.length > 1000) {
    const outDir = path.join(ROOT, '_tmp_test_out/fla-decoded')
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, `${path.basename(F, '.fla')}__${e.name.replace(/[^\w.-]/g, '_')}.bin`), dec)
  }
}
