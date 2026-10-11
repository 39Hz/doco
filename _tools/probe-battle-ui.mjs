// 从原版战斗截图（PNG）里**量出**界面版式与配色 —— 零依赖（只用 node:zlib）
//
// 【为什么要量】用户要"战斗画风尽量还原页游"。还原不能靠印象：名牌在哪、血条多高、
// 指令条多高、配色是什么，都得从归档原版截图里读出来。这个脚本把"量"做成可复现的。
//
// 做法：JPEG 用 image_edit 转成 PNG（那是工具侧的事），PNG 用 zlib 解出来自己扫像素。
//   扫描策略：逐行统计"亮像素（白/黄系）"的占比与横向范围 → 找出界面的水平带；
//   再在关键带里取代表色。输出的都是**像素坐标**，可直接对着写代码。
//
// 用法: node _tools/probe-battle-ui.mjs _tmp_test_out/ref-battle.png
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = process.argv[2] || '_tmp_test_out/ref-battle.png'
const buf = fs.readFileSync(path.join(ROOT, file))

// ---------- PNG 解码（8 位 RGB/RGBA，非隔行）----------
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG')
  let off = 8, w = 0, h = 0, bitDepth = 0, colorType = 0
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4)
      bitDepth = data[8]; colorType = data[9]
      if (data[12] !== 0) throw new Error('不支持隔行 PNG')
      if (bitDepth !== 8) throw new Error('只支持 8 位/通道，实际 ' + bitDepth)
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0
  if (!ch) throw new Error('只支持灰度/RGB/RGBA，colorType=' + colorType)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = Buffer.alloc(w * h * 3)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride))
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0
      const b = prev[i]
      const c = i >= ch ? prev[i - ch] : 0
      let v = line[i]
      if (ft === 1) v += a
      else if (ft === 2) v += b
      else if (ft === 3) v += (a + b) >> 1
      else if (ft === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      line[i] = v & 0xFF
    }
    for (let x = 0; x < w; x++) {
      const s = x * ch, d = (y * w + x) * 3
      if (ch === 1) { out[d] = out[d + 1] = out[d + 2] = line[s] }
      else { out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2] }
    }
    prev = line
  }
  return { w, h, px: out }
}

const { w, h, px } = decodePng(buf)
const at = (x, y) => { const i = (y * w + x) * 3; return [px[i], px[i + 1], px[i + 2]] }
const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b
const isBright = ([r, g, b]) => lum([r, g, b]) > 150
const isWarm = ([r, g, b]) => r > 170 && g > 140 && b < 130          // 黄/橙（指令条的主色）
const isRed = ([r, g, b]) => r > 130 && g < 100 && b < 100           // 血条红

console.log(`图: ${file}  ${w}×${h}`)

// ---------- ① 逐行统计：亮像素 / 暖像素 / 红像素 的横向范围 ----------
console.log('\n=== 水平带扫描（每 6 行汇总一次；只打有内容的行）===')
console.log('   y   亮%   暖%   红%   亮像素横向范围      说明')
for (let y = 0; y < h; y += 6) {
  let bright = 0, warm = 0, red = 0, minX = -1, maxX = -1
  for (let x = 0; x < w; x++) {
    const c = at(x, y)
    if (isBright(c)) { bright++; if (minX < 0) minX = x; maxX = x }
    if (isWarm(c)) warm++
    if (isRed(c)) red++
  }
  const pb = (bright / w * 100)
  const pw = (warm / w * 100)
  const pr = (red / w * 100)
  if (pb < 0.8 && pw < 0.8 && pr < 0.3) continue
  console.log(`  ${String(y).padStart(3)}  ${pb.toFixed(1).padStart(4)}  ${pw.toFixed(1).padStart(4)}  ${pr.toFixed(1).padStart(4)}   ` +
    `${minX < 0 ? '—' : String(minX).padStart(3) + '~' + String(maxX).padStart(3)}            ` +
    `${pw > 25 ? '★ 黄色横条（指令条？）' : pb > 25 ? '亮色横带（名牌/文字行）' : pr > 3 ? '红色横线（血条）' : ''}`)
}

// ---------- ② 顶部名牌：在 0~14% 高度里找"亮框"的水平范围 ----------
console.log('\n=== 顶部区域（0~15% 高）垂直扫描：找名牌的上下边界 ===')
for (let y = 0; y < Math.round(h * 0.15); y += 2) {
  let bright = 0
  for (let x = 0; x < Math.round(w * 0.5); x++) if (lum(at(x, y)) > 120) bright++
  console.log(`  y=${String(y).padStart(3)}  左半天亮像素 ${String(bright).padStart(4)} / ${Math.round(w * 0.5)}`)
}

// ---------- ③ 关键取样点 ----------
console.log('\n=== 关键取样色（坐标是原图 962×546 的真实像素）===')
const SAMPLE = [
  ['左上角背景', 8, 8], ['顶部名牌底色', 60, 20], ['名牌文字区', 120, 26],
  ['HP 条左端', 150, 40], ['HP 条中段', 200, 40], ['MP 条中段', 200, 52],
  ['画面上部背景', 480, 90], ['画面中部（角色区）', 300, 300],
  ['画面下部背景', 480, 430], ['底部指令条（左）', 60, 500],
  ['底部指令条（中）', 400, 505], ['底部指令条（右）', 880, 500],
  ['右下角（技能图标区）', 760, 500],
]
for (const [name, x, y] of SAMPLE) {
  const c = at(Math.min(x, w - 1), Math.min(y, h - 1))
  console.log(`  ${name.padEnd(18)} (${String(x).padStart(3)},${String(y).padStart(3)}) = ${hex(c)}  rgb(${c.join(',')})`)
}

// ---------- ④ 指令条区域：找出它的上下边界与主色 ----------
console.log('\n=== 底部区域（80~100% 高）逐 2 行：暖像素占比（定位指令条上下沿）===')
for (let y = Math.round(h * 0.78); y < h; y += 2) {
  let warm = 0, bright = 0
  for (let x = 0; x < w; x++) { const c = at(x, y); if (isWarm(c)) warm++; if (isBright(c)) bright++ }
  const pw = warm / w * 100
  const bar = '█'.repeat(Math.max(0, Math.round(pw / 2)))
  console.log(`  y=${String(y).padStart(3)} 暖${pw.toFixed(1).padStart(5)}% ${bar}`)
}
