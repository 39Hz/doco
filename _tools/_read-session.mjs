// 会话记录是**多个 zstd 帧串接**的（Node 的 zstdDecompressSync 只解第一帧）。
// 按 zstd 魔数 28 B5 2F FD 拆帧，逐帧解，拼起来。
import fs from 'node:fs'
import zlib from 'node:zlib'

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const SKIP_MAGIC = Buffer.from([0x50, 0x2a, 0x4d, 0x18])   // skippable frame

export function readSessionJsonl(file) {
  const buf = fs.readFileSync(file)
  // 找所有帧起点
  const starts = []
  let i = 0
  while (i < buf.length - 4) {
    if (buf.compare(MAGIC, 0, 4, i, i + 4) === 0 || buf.compare(SKIP_MAGIC, 0, 4, i, i + 4) === 0) {
      starts.push(i)
      i += 4
    } else i++
  }
  if (!starts.length) throw new Error('这不像 zstd 文件（找不到帧魔数）')
  starts.push(buf.length)
  const parts = []
  let okFrames = 0, badFrames = 0
  for (let k = 0; k < starts.length - 1; k++) {
    const frame = buf.subarray(starts[k], starts[k + 1])
    try {
      parts.push(zlib.zstdDecompressSync(frame))
      okFrames++
    } catch {
      // 有些帧可能被截断（会话正在写），跳过并计数
      badFrames++
    }
  }
  const text = Buffer.concat(parts).toString('utf8')
  const lines = text.split('\n').filter((l) => l.trim())
  return { text, lines, okFrames, badFrames, bytes: buf.length }
}

if (process.argv[1] && process.argv[1].endsWith('_read-session.mjs')) {
  const r = readSessionJsonl(process.argv[2])
  console.log(`帧: 成功 ${r.okFrames} / 失败 ${r.badFrames}`)
  console.log(`解压后 ${(r.text.length / 1048576).toFixed(1)} MB，${r.lines.length} 行 JSONL`)
  const kinds = {}
  let bad = 0
  for (const l of r.lines) {
    try { const o = JSON.parse(l); const t = o.type || o.role || '?'; kinds[t] = (kinds[t] || 0) + 1 } catch { bad++ }
  }
  console.log('解析失败:', bad)
  console.log('type 分布:', JSON.stringify(kinds).slice(0, 500))
}
