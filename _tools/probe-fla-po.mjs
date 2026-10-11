// 探针：`PO\x11` 格式的 FLA 里有什么（能否取出图标）
//
// 现状：这 13 个「skill_icon_*.fla」不是 zip、不是 SWF，而是 Adobe 较新版本的 FLA 容器
//   （magic = "PO" 0x11）。文件名自带技能 ID 区间，所以只要能把图标弄出来，
//   就能建立"技能 ID → 图标"的**权威对应**。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.resolve('.')
const DIR = path.join(ROOT, '多克多比专区资料素材/魔法道具ICON等/多克多比技能')
const F = process.argv[2] || 'skill_icon_302001_302020.fla'
const buf = fs.readFileSync(path.join(DIR, F))
console.log(`${F}  ${(buf.length / 1024).toFixed(0)} KB`)
console.log('头部 64 字节 hex：')
console.log('  ' + buf.subarray(0, 64).toString('hex').replace(/(.{32})/g, '$1\n  '))
console.log('头部 64 字节 ascii：')
console.log('  ' + JSON.stringify(buf.subarray(0, 64).toString('latin1')))

// 这 13 个文件的大小分布很关键：小的只有 92~256 KB，大的 1~2.3 MB
console.log('\n=== 同目录 13 个文件的大小 ===')
for (const f of fs.readdirSync(DIR).filter((x) => x.toLowerCase().endsWith('.fla')).sort()) {
  const s = fs.statSync(path.join(DIR, f)).size
  const head = fs.readFileSync(path.join(DIR, f)).subarray(0, 4).toString('hex')
  console.log(`  ${String(Math.round(s / 1024)).padStart(5)} KB  magic=${head}  ${f}`)
}

// 扫描内嵌的常见图片/压缩数据签名
console.log('\n=== 内嵌数据签名扫描 ===')
const SIGS = [
  ['JPEG (FFD8FF)', Buffer.from([0xff, 0xd8, 0xff])],
  ['PNG (89504E47)', Buffer.from([0x89, 0x50, 0x4e, 0x47])],
  ['zlib (789C)', Buffer.from([0x78, 0x9c])],
  ['zlib (7801)', Buffer.from([0x78, 0x01])],
  ['zlib (78DA)', Buffer.from([0x78, 0xda])],
  ['gzip (1F8B)', Buffer.from([0x1f, 0x8b])],
  ['zip (PK)', Buffer.from([0x50, 0x4b, 0x03, 0x04])],
  ['SWF-FWS', Buffer.from('FWS', 'ascii')],
  ['SWF-CWS', Buffer.from('CWS', 'ascii')],
]
for (const [name, sig] of SIGS) {
  let n = 0, first = -1
  for (let i = 0; i + sig.length <= buf.length; i++) {
    if (buf[i] === sig[0] && buf.compare(sig, 0, sig.length, i, i + sig.length) === 0) {
      n++
      if (first < 0) first = i
    }
  }
  if (n) console.log(`  ${name.padEnd(18)} 出现 ${String(n).padStart(5)} 次，首个偏移 ${first}`)
}

// 试把整文件当 zlib 流解（有些容器是"头部 + zlib 主体"）
for (const off of [16, 32, 64, 128, 256, 512, 1024]) {
  if (off >= buf.length) break
  try {
    const out = zlib.inflateSync(buf.subarray(off))
    console.log(`\n✓ 偏移 ${off} 处开始是 zlib 流，解出 ${out.length} 字节`)
    const strs = [...new Set((out.toString('utf8').match(/[\x20-\x7e\u4e00-\u9fa5]{4,60}/g) || []))]
    console.log(`  可读字符串 ${strs.length} 个（前 30）：`)
    for (const s of strs.slice(0, 30)) console.log(`    ${s}`)
    break
  } catch { }
}
