// 读取老中文文本文件：自动判别 GBK / UTF-8 / UTF-16
// 用法: node readtext.mjs <文件> [最多字节]
import fs from 'node:fs'

const p = process.argv[2]
const limit = Number(process.argv[3] || 0)
let buf = fs.readFileSync(p)
if (limit) buf = buf.subarray(0, limit)

function tryUtf8(b) {
  const s = b.toString('utf8')
  // 出现替换字符说明不是合法 UTF-8
  return s.includes('\uFFFD') ? null : s
}
function score(s) {
  let bad = 0
  for (const ch of s) {
    const c = ch.codePointAt(0)
    // 控制字符（除常见空白）视为噪声
    if (c < 0x20 && !'\r\n\t'.includes(ch)) bad++
  }
  return bad
}

let text, how
// BOM 判别
if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
  text = buf.subarray(3).toString('utf8'); how = 'UTF-8 (BOM)'
} else if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
  text = buf.subarray(2).toString('utf16le'); how = 'UTF-16LE (BOM)'
} else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
  text = buf.subarray(2).swap16().toString('utf16le'); how = 'UTF-16BE (BOM)'
} else {
  const u = tryUtf8(buf)
  if (u !== null && score(u) === 0) { text = u; how = 'UTF-8 (无 BOM，校验通过)' }
  else {
    // 退到 GBK/GB18030（用 Node 内置解码器）
    try {
      const dec = new TextDecoder('gbk', { fatal: false })
      text = dec.decode(buf); how = 'GBK / GB18030'
    } catch {
      text = buf.toString('latin1'); how = 'latin1 (兜底)'
    }
  }
}

console.log(`文件: ${p}`)
console.log(`大小: ${buf.length} B   编码判定: ${how}`)
console.log('─'.repeat(60))
console.log(text)
