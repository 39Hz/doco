// 从 FLA 里提取内嵌位图。
//
// 背景：monster_110012堕落天使.swf 是**纯矢量**（tag 统计里只有 DefineShape3 和
// DefineFontAlignZone，没有任何 DefineBits*），所以 SWF 提不到位图。
// 但 FLA（Flash 的工程文件，未压缩的老式二进制格式）里**原样嵌着 JPEG** ——
// 实测 81 个 monster_*.fla 里 34/40 含 JPEG 签名。
//
// 做法：扫描字节流找 JPEG 的 SOI(ff d8 ff) ... EOI(ff d9)，把每段切出来；
// 取面积最大的一张作为该怪的立绘。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const OUT = path.join(ROOT, 'assets', 'monsters', 'fromfla')
fs.mkdirSync(OUT, { recursive: true })

// 在字节流里找出所有 JPEG 段（返回 {buf, w, h, area}）
function findJpegs(buf) {
  const out = []
  for (let i = 0; i + 3 < buf.length; i++) {
    if (buf[i] !== 0xff || buf[i + 1] !== 0xd8 || buf[i + 2] !== 0xff) continue
    // 从 SOI 往后找 EOI
    let j = i + 2
    let end = -1
    while (j + 1 < buf.length) {
      if (buf[j] === 0xff && buf[j + 1] === 0xd9) { end = j + 2; break }
      j++
    }
    if (end < 0) continue
    const seg = buf.subarray(i, end)
    // 从 SOF 读尺寸
    let w = 0, h = 0
    for (let k = 2; k + 9 < seg.length;) {
      if (seg[k] !== 0xff) { k++; continue }
      const marker = seg[k + 1]
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { k += 2; continue }
      const len = seg.readUInt16BE(k + 2)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        h = seg.readUInt16BE(k + 5); w = seg.readUInt16BE(k + 7); break
      }
      if (len < 2) break
      k += 2 + len
    }
    if (w > 8 && h > 8) out.push({ bytes: seg, w, h, area: w * h, off: i })
    i = end - 1
  }
  return out
}

// 收集所有 monster_*.fla
const flas = []
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/^monster_.*\.fla$/i.test(e.name)) flas.push(p)
  }
}
walk(path.join(ROOT, '多克多比专区资料素材'))
const uniq = new Map()
for (const p of flas) if (!uniq.has(path.basename(p))) uniq.set(path.basename(p), p)
console.log('monster_*.fla 去重后: ' + uniq.size + ' 个')

// 只处理"SWF 里没提到"的那些（省时间），但先扫全部并报告
const swfIndex = (() => {
  const p = path.join(ROOT, 'assets', 'monsters', 'fromswf', 'index.json')
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {}
})()

const index = {}
let ok = 0
for (const [base, p] of uniq) {
  const m = base.match(/^monster_(\d+)_?([^.]*)\.fla$/i)
  if (!m) continue
  const atlasId = m[1]
  const name = (m[2] || '').trim()
  const size = fs.statSync(p).size
  let jpegs = []
  try { jpegs = findJpegs(fs.readFileSync(p)) } catch (e) { }
  if (!jpegs.length) { console.log('  - ' + String(atlasId).padEnd(8) + (name || '(无名)').padEnd(12) + '无位图'); continue }
  jpegs.sort((a, b) => b.area - a.area)
  const best = jpegs[0]
  const file = 'assets/monsters/fromfla/mon_' + atlasId + '.jpg'
  fs.writeFileSync(path.join(ROOT, file), best.bytes)
  index[atlasId] = { name, file, w: best.w, h: best.h, jpegCount: jpegs.length, flaKB: Math.round(size / 1024) }
  ok++
  console.log('  ' + String(atlasId).padEnd(8) + (name || '(无名)').padEnd(12) + best.w + '×' + best.h +
    '  共 ' + String(jpegs.length).padStart(3) + ' 张位图  (' + Math.round(size / 1024) + ' KB fla)')
}
console.log('\n从 FLA 提取成功 ' + ok + '/' + uniq.size)
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1), 'utf8')
console.log('已写 assets/monsters/fromfla/index.json')
