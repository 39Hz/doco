// 从 Unity 构建里捞字符串。
//
// 用户新给了一份 Unity 版《多克多比》（多克多比-2026.2）。他说"可以逛地图还有背包什么的
// 符合原版地图一类的一些的基础数值还有战斗，可以通过里面学习，好的留下来、差的就抛弃"。
// 所以先把里面的中文文本全部捞出来，看看它到底带了哪些数据。
//
// Unity 的 SerializedFile 里，string 字段就是「4 字节长度 + UTF-8 字节」，
// 所以直接扫 UTF-8 中文串就能拿到绝大部分文本，不需要完整解析资源格式。
// 用法: node _tools/unity-strings.mjs <文件或目录> [最少字符数]
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.resolve('.')
const target = path.resolve(process.argv[2] || '.')
const MIN = Number(process.argv[3] || 2)

// 收集文件
const files = []
const stat = fs.statSync(target)
if (stat.isDirectory()) {
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { walk(p); continue }
      // 注意：Dirent 上没有 size（是 undefined），必须自己 statSync，
      // 否则 `e.size > 0` 恒为 false，整个目录会被判成"0 个文件"。
      try { if (fs.statSync(p).size > 0) files.push(p) } catch { }
    }
  }
  walk(target)
} else files.push(target)

// 中文字符判定
const isCJK = (c) => c >= 0x4e00 && c <= 0x9fff
const isFull = (c) => (c >= 0xff00 && c <= 0xffef) || (c >= 0x3000 && c <= 0x303f)
const okChar = (c) => isCJK(c) || isFull(c) || (c >= 0x20 && c < 0x7f) || c === 0x0a || c === 0x0d

function scan(buf) {
  const out = []
  let cur = []
  let start = 0
  for (let i = 0; i < buf.length;) {
    const b = buf[i]
    let cp = -1, len = 0
    if (b < 0x80) { cp = b; len = 1 }
    else if ((b & 0xe0) === 0xc0) { cp = ((b & 0x1f) << 6) | (buf[i + 1] & 0x3f); len = 2 }
    else if ((b & 0xf0) === 0xe0) { cp = ((b & 0x0f) << 12) | ((buf[i + 1] & 0x3f) << 6) | (buf[i + 2] & 0x3f); len = 3 }
    else if ((b & 0xf8) === 0xf0) { cp = 0x10000; len = 4 }
    if (cp < 0 || !okChar(cp)) {
      if (cur.length >= MIN) out.push({ s: cur.join(''), at: start })
      cur = []
      i += Math.max(1, len)
      continue
    }
    if (!cur.length) start = i
    cur.push(String.fromCodePoint(cp))
    i += len
  }
  if (cur.length >= MIN) out.push({ s: cur.join(''), at: start })
  // 只保留含中文的
  return out.filter((o) => [...o.s].some((ch) => isCJK(ch.codePointAt(0))))
}

const all = new Map()
let total = 0
for (const f of files) {
  let buf
  try { buf = fs.readFileSync(f) } catch { continue }
  // 有些 .assets 内部还有 zlib 块，试着整体解一下（失败就算了）
  const hits = scan(buf)
  for (const h of hits) {
    total++
    const s = h.s.trim()
    if (s.length < MIN) continue
    const prev = all.get(s)
    if (prev) prev.n++
    else all.set(s, { n: 1, file: path.relative(ROOT, f).replace(/\\/g, '/'), at: h.at, len: s.length })
  }
}
console.log(`扫描 ${files.length} 个文件，命中 ${total} 条含中文的串，去重后 ${all.size} 条\n`)
const list = [...all.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
for (const [s, info] of list) {
  console.log(`${String(info.n).padStart(3)}× ${s.length > 90 ? s.slice(0, 90) + '…' : s}`)
}
