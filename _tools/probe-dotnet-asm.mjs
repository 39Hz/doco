// 读 .NET 程序集的**类型与方法名**（不反编译 IL，只看有什么）—— 判断游戏逻辑在不在这里
//
// 原理：.NET 程序集 = PE 文件 + CLI 元数据。元数据里有 `#Strings` 堆（所有名字）
// 和 `TypeDef`/`MethodDef` 表。只读名字不需要完整解析表结构：
// 扫 `#Strings` 堆就能列出全部标识符，足够判断"有没有游戏逻辑"。
// 需要每个类有哪些方法时，再解析 TypeDef/MethodDef 表（本脚本也做了，够用）。
//
// 用法: node _tools/probe-dotnet-asm.mjs <dll>
import fs from 'node:fs'
import path from 'node:path'

const p = path.resolve(process.argv[2] || '多克多比-2026.2/多克多比_Data/Managed/Assembly-CSharp.dll')
const buf = fs.readFileSync(p)
console.log(`文件 ${path.basename(p)}  ${(buf.length / 1024).toFixed(0)} KB`)

// --- PE 头：找 CLI 头 ---
if (buf.readUInt16LE(0) !== 0x5a4d) { console.log('✗ 不是 MZ（不是 PE 文件）'); process.exit(1) }
const peOff = buf.readUInt32LE(0x3c)
if (buf.readUInt32LE(peOff) !== 0x00004550) { console.log('✗ PE 签名不对'); process.exit(1) }
const coffOff = peOff + 4
const nSections = buf.readUInt16LE(coffOff + 2)
const optSize = buf.readUInt16LE(coffOff + 16)
const optOff = coffOff + 20
const magic = buf.readUInt16LE(optOff)
const isPE32Plus = magic === 0x20b
const ddOff = optOff + (isPE32Plus ? 112 : 96)
const cliRva = buf.readUInt32LE(ddOff + 14 * 8)
console.log(`PE32+ ${isPE32Plus} · 节 ${nSections} · CLI 头 RVA 0x${cliRva.toString(16)}`)

// 节表 → RVA 转文件偏移
const secOff = optOff + optSize
const sections = []
for (let i = 0; i < nSections; i++) {
  const o = secOff + i * 40
  sections.push({
    name: buf.toString('ascii', o, o + 8).replace(/\0/g, ''),
    vaddr: buf.readUInt32LE(o + 12), vsize: buf.readUInt32LE(o + 8),
    raw: buf.readUInt32LE(o + 20), rawSize: buf.readUInt32LE(o + 16),
  })
}
const rva2off = (rva) => {
  for (const s of sections) if (rva >= s.vaddr && rva < s.vaddr + Math.max(s.vsize, s.rawSize)) return s.raw + (rva - s.vaddr)
  return -1
}
const cliOff = rva2off(cliRva)
if (cliOff < 0) { console.log('✗ CLI 头定位失败'); process.exit(1) }
const mdRva = buf.readUInt32LE(cliOff + 8)
const mdSize = buf.readUInt32LE(cliOff + 12)
const mdOff = rva2off(mdRva)
console.log(`元数据 RVA 0x${mdRva.toString(16)} → 偏移 ${mdOff}，大小 ${(mdSize / 1024).toFixed(0)} KB`)
if (buf.readUInt32LE(mdOff) !== 0x424a5342) { console.log('✗ 元数据签名不对'); process.exit(1) }

// --- 元数据根：版本串 + 流头 ---
const verLen = buf.readUInt32LE(mdOff + 12)
const ver = buf.toString('utf8', mdOff + 16, mdOff + 16 + verLen).replace(/\0/g, '')
console.log(`运行时版本: ${ver}`)
let q = mdOff + 16 + verLen
q += 2 + 2                                  // flags + streams
const nStreams = buf.readUInt16LE(q); q += 2
const streams = {}
for (let i = 0; i < nStreams; i++) {
  const off = buf.readUInt32LE(q); const size = buf.readUInt32LE(q + 4); q += 8
  let e = q
  while (buf[e] !== 0) e++
  const nm = buf.toString('ascii', q, e)
  q = e + 1
  q = (q + 3) & ~3
  streams[nm] = { off: mdOff + off, size }
}
console.log('流: ' + Object.keys(streams).join(', '))

// --- #Strings 堆：所有名字 ---
const S = streams['#Strings']
const strs = []
if (S) {
  let i = S.off
  const end = S.off + S.size
  while (i < end && buf[i] !== 0) i++      // 首字节通常是 0（空串）
  i++
  let cur = i
  while (cur < end) {
    let e = cur
    while (e < end && buf[e] !== 0) e++
    const s = buf.toString('utf8', cur, e)
    if (s) strs.push(s)
    cur = e + 1
  }
}
console.log(`\n#Strings 堆名字总数 ${strs.length}`)

// 分类统计：判断内容性质
const looksGame = strs.filter((s) => /Player|Enemy|Battle|Skill|Form|Monster|Bag|Quest|Save|UI|Panel|Button|Game|Level|Item|Npc|Scene|Map|Audio|Effect/i.test(s))
const looksUnity = strs.filter((s) => /MonoBehaviour|UnityEngine|GameObject|Transform|Coroutine|SerializeField/i.test(s))
console.log(`含"游戏词"的名字 ${looksGame.length} 个`)
console.log(`含"Unity 词"的名字 ${looksUnity.length} 个`)
console.log(`\n游戏词样本（前 60）：`)
console.log('  ' + looksGame.slice(0, 60).join('、'))
console.log(`\n全部名字样本（前 80）：`)
console.log('  ' + strs.slice(0, 80).join('、'))
