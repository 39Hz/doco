// 从 Unity 的 .assets 里找出所有对 .resS 的引用（m_StreamData：路径 + 偏移 + 长度）。
//
// 为什么走这条路：发布版 Unity 会把类型树剥掉，按字段顺序硬解 Texture2D 很容易踩版本差异。
// 但 m_StreamData 的结构是「4 字节长度 + 路径字符串 + 对齐 + u32 offset + u32 size」，
// 只要在 .assets 里搜到路径字符串，紧跟着的 8 个字节就是那块像素数据在 .resS 里的位置和大小。
// 拿到 (size) 之后就能反推 (宽, 高, 格式) —— 这是可验证的，不用赌字段布局。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const DATA = path.join(ROOT, '多克多比-2026.2', '多克多比_Data')

const assets = fs.readdirSync(DATA).filter((f) => /\.assets$/.test(f)).sort()
const sizeOf = (f) => { const p = path.join(DATA, f); return fs.existsSync(p) ? fs.statSync(p).size : -1 }
let total = 0
const all = []
const rejects = { badPath: 0, outOfRange: 0, tiny: 0 }
for (const f of assets) {
  const buf = fs.readFileSync(path.join(DATA, f))
  const hits = []
  for (let i = 0; i + 4 < buf.length; i++) {
    // 路径字符串以 4 字节小端长度开头
    const len = buf.readUInt32LE(i)
    if (len < 6 || len > 200) continue
    const s = i + 4
    if (s + len > buf.length) continue
    const str = buf.toString('latin1', s, s + len)
    if (!/\.resS$/.test(str)) continue
    if (!/^[A-Za-z0-9_\-./:]+$/.test(str)) continue          // 只接受正常的文件名，挡掉二进制噪声
    // 字符串后面按 4 字节对齐
    const after = s + len
    const aligned = (after + 3) & ~3
    if (aligned + 8 > buf.length) continue
    const offset = buf.readUInt32LE(aligned)
    const size = buf.readUInt32LE(aligned + 4)
    const target = str.split('/').pop()
    const fsize = sizeOf(target)
    if (fsize < 0) { rejects.badPath++; continue }
    // 关键校验：这一块必须真的落在目标 .resS 里
    if (offset + size > fsize || offset < 0) { rejects.outOfRange++; continue }
    if (size < 64) { rejects.tiny++; continue }
    hits.push({ at: i, str: target, offset, size })
  }
  if (hits.length) {
    console.log(`${f.padEnd(26)} 有效引用 ${hits.length} 个`)
    total += hits.length
    for (const h of hits) all.push({ file: f, ...h })
  }
}
console.log(`\n合计 ${total} 个**有效**流式资源引用`)
console.log(`被过滤掉：路径对不上 ${rejects.badPath}、越界 ${rejects.outOfRange}、过小 ${rejects.tiny}`)
fs.writeFileSync(path.join(ROOT, '_tools', '_unity_streams.json'), JSON.stringify(all, null, 1))

// 按 (目标 resS 文件, size) 统计，看看规模
const byFile = new Map()
for (const h of all) {
  const key = h.str.split('/').pop()
  if (!byFile.has(key)) byFile.set(key, [])
  byFile.get(key).push(h)
}
console.log('\n按目标文件统计（前 15）：')
for (const [k, v] of [...byFile].sort((a, b) => b[1].length - a[1].length).slice(0, 15)) {
  const p = path.join(DATA, k)
  const sz = fs.existsSync(p) ? fs.statSync(p).size : -1
  console.log(`  ${k.padEnd(28)} ${String(v.length).padStart(4)} 块   文件 ${(sz / 1024 / 1024).toFixed(1)} MB   ` +
    `最大块 ${Math.max(...v.map((x) => x.size))} 字节`)
}
// 抽样看几条
console.log('\n抽样：')
for (const h of all.slice(0, 12)) console.log(`  ${h.str}  offset=${h.offset} size=${h.size}`)
