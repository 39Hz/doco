// 直接看 resources.assets 里所有「像路径的字符串」，以及紧跟其后的 16 个字节。
// 目的：确定 Unity 2023 的 m_StreamData（StreamingInfo）到底怎么排——路径、偏移、长度各几个字节。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const DATA = path.join(ROOT, '多克多比-2026.2', '多克多比_Data')
const f = process.argv[2] || 'resources.assets'
const buf = fs.readFileSync(path.join(DATA, f))
const sizeOf = (name) => { const p = path.join(DATA, name); return fs.existsSync(p) ? fs.statSync(p).size : -1 }

const found = []
for (let i = 0; i + 4 < buf.length; i++) {
  const len = buf.readUInt32LE(i)
  if (len < 4 || len > 260) continue
  const s = i + 4
  if (s + len > buf.length) continue
  const str = buf.toString('latin1', s, s + len)
  if (!/^[A-Za-z0-9_\-./: ]+$/.test(str)) continue
  if (!/[./]/.test(str)) continue
  const after = s + len
  const aligned = (after + 3) & ~3
  if (aligned + 16 > buf.length) continue
  found.push({
    at: i, str, len, after, aligned,
    pad: buf.subarray(after, aligned).toString('hex'),
    u32a: buf.readUInt32LE(aligned), u32b: buf.readUInt32LE(aligned + 4),
    u32c: buf.readUInt32LE(aligned + 8), u32d: buf.readUInt32LE(aligned + 12),
  })
}
console.log(`${f}: 找到 ${found.length} 个候选路径串\n`)
// 只打印长得像"文件名"的，并给出把 u32b/u32c 当 size 时的判定
const interesting = found.filter((h) => /\.(resS|assets|resource)$/.test(h.str) || /^archive:\//.test(h.str))
console.log(`其中像资源路径的 ${interesting.length} 个：`)
for (const h of interesting.slice(0, 60)) {
  const tgt = h.str.split('/').pop()
  const fs2 = sizeOf(tgt)
  const okA = fs2 > 0 && h.u32a + h.u32b <= fs2
  const okB = fs2 > 0 && h.u32c + h.u32d <= fs2
  console.log(`  @${String(h.at).padStart(8)} len=${String(h.len).padStart(3)} "${h.str}"`)
  console.log(`             对齐后 pad=${h.pad.padEnd(6)}  [u32,u32]=(${h.u32a},${h.u32b})${okA ? ' ✓落在目标文件内' : ''}` +
    `  [u32,u32]=(${h.u32c},${h.u32d})${okB ? ' ✓' : ''}  目标=${tgt}(${fs2})`)
}
if (!interesting.length) {
  console.log('（没有 .resS 路径串）—— 列出前 40 个普通路径串：')
  for (const h of found.slice(0, 40)) console.log(`  @${h.at} "${h.str}"`)
}
