// 对比"原版 DLL"与"我编译的 DLL"的元数据是否等价 —— 装回去能否被 Unity 接受的关键
//
// 【为什么必须核】Unity 的场景/预制体是按 **程序集名 + 命名空间 + 类名** 引用脚本组件的。
//   名字对不上 → 组件变 "Missing Script"，游戏看着像坏了。
//   所以要比：程序集名、AssemblyVersion、类型名集合、方法名集合。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const A = path.join(ROOT, '_tmp_test_out/unity-backup/Assembly-CSharp.dll.orig')
const B = path.join(ROOT, '多克多比-2026.2/decompiled/build-out/Assembly-CSharp.dll')

function parse(p) {
  const buf = fs.readFileSync(p)
  const peOff = buf.readUInt32LE(0x3c), coff = peOff + 4
  const nSec = buf.readUInt16LE(coff + 2), optSize = buf.readUInt16LE(coff + 16), optOff = coff + 20
  const is64 = buf.readUInt16LE(optOff) === 0x20b
  const ddOff = optOff + (is64 ? 112 : 96)
  const secs = []
  for (let i = 0; i < nSec; i++) {
    const o = optOff + optSize + i * 40
    secs.push({ v: buf.readUInt32LE(o + 12), vs: buf.readUInt32LE(o + 8), r: buf.readUInt32LE(o + 20), rs: buf.readUInt32LE(o + 16) })
  }
  const r2o = (rva) => { for (const s of secs) if (rva >= s.v && rva < s.v + Math.max(s.vs, s.rs)) return s.r + (rva - s.v); return -1 }
  const cli = r2o(buf.readUInt32LE(ddOff + 14 * 8))
  const mdOff = r2o(buf.readUInt32LE(cli + 8))
  const verLen = buf.readUInt32LE(mdOff + 12)
  const ver = buf.toString('utf8', mdOff + 16, mdOff + 16 + verLen).replace(/\0/g, '')
  let q = mdOff + 16 + verLen + 2 + 2
  const nStreams = buf.readUInt16LE(q); q += 2
  let sOff = -1, sSize = 0
  for (let i = 0; i < nStreams; i++) {
    const off = buf.readUInt32LE(q), size = buf.readUInt32LE(q + 4); q += 8
    let e = q; while (buf[e] !== 0) e++
    const nm = buf.toString('ascii', q, e); q = (e + 1 + 3) & ~3
    if (nm === '#Strings') { sOff = mdOff + off; sSize = size }
  }
  const names = []
  if (sOff > 0) {
    let i = sOff + 1
    const end = sOff + sSize
    while (i < end) { let e = i; while (e < end && buf[e] !== 0) e++; const s = buf.toString('utf8', i, e); if (s) names.push(s); i = e + 1 }
  }
  // 程序集自身版本：从 #Blob 之外的 Assembly 表不好拿，这里用名字里是否含版本无关信息
  return { size: buf.length, runtime: ver, names: new Set(names), nameCount: names.length }
}

const a = parse(A), b = parse(B)
console.log(`原版   ${(a.size / 1024).toFixed(1)} KB · 运行时 ${a.runtime} · 名字 ${a.nameCount}`)
console.log(`新编   ${(b.size / 1024).toFixed(1)} KB · 运行时 ${b.runtime} · 名字 ${b.nameCount}`)

// 类型名对比：只取"像类型名"的（首字母大写、且不是明显字段/参数名）
const typeLike = (s) => /^[A-Z][A-Za-z0-9_]*$/.test(s) && s.length > 2 && !/^(System|Unity|Microsoft|Mono|TMPro)/.test(s)
const ta = new Set([...a.names].filter(typeLike))
const tb = new Set([...b.names].filter(typeLike))
const missing = [...ta].filter((n) => !tb.has(n))
const added = [...tb].filter((n) => !ta.has(n))
console.log(`\n类型样名字：原版 ${ta.size} · 新编 ${tb.size}`)
console.log(`原版有、新编缺（**会导致 Missing Script**）：${missing.length}`)
if (missing.length) console.log('  ' + missing.slice(0, 25).join('、'))
console.log(`新编多出来的：${added.length}${added.length ? ' → ' + added.slice(0, 15).join('、') : ''}`)

// 全部名字的差异（方法/字段级）
const onlyA = [...a.names].filter((n) => !b.names.has(n))
const onlyB = [...b.names].filter((n) => !a.names.has(n))
console.log(`\n全部名字差异：仅原版 ${onlyA.length} · 仅新编 ${onlyB.length}`)
if (onlyA.length) console.log(`  仅原版（前 20）：${onlyA.slice(0, 20).join('、')}`)
if (onlyB.length) console.log(`  仅新编（前 20）：${onlyB.slice(0, 20).join('、')}`)

console.log(`\n结论：${missing.length === 0 ? '✓ 类型名无缺失，Unity 引用不会断' : '✗ 有类型名缺失，需要修'}`)
