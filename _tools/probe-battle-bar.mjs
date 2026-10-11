// 量原版底部指令条的精确结构（第 51 轮）
// 输入：_tmp_test_out/ref-bottombar.png（原版战斗截图 y 0.82~1 的裁剪，962×99）
// 输出：面板边界、6 个技能格的边界、左侧信息框边界、右侧圆钮位置（都是原图像素坐标）
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = process.argv[2] || '_tmp_test_out/ref-bottombar.png'
const buf = fs.readFileSync(path.resolve(ROOT, file))

function decodePng(buf) {
  let off = 8, w = 0, h = 0, colorType = 0
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = Buffer.alloc(w * h * 3)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride))
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0
      let v = line[i]
      if (ft === 1) v += a; else if (ft === 2) v += b
      else if (ft === 3) v += (a + b) >> 1
      else if (ft === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      line[i] = v & 0xFF
    }
    for (let x = 0; x < w; x++) {
      const s = x * ch, d = (y * w + x) * 3
      out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]
    }
    prev = line
  }
  return { w, h, px: out }
}

const { w, h, px } = decodePng(buf)
const at = (x, y) => { const i = (y * w + x) * 3; return [px[i], px[i + 1], px[i + 2]] }
const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b
// 技能格：浅灰白底（很亮、低饱和）
const isSlot = ([r, g, b]) => lum([r, g, b]) > 165 && (Math.max(r, g, b) - Math.min(r, g, b)) < 40
// 面板底：深蓝（蓝明显大于红）
const isPanel = ([r, g, b]) => b > 80 && b > r + 30 && lum([r, g, b]) < 150

console.log(`图: ${file}  ${w}×${h}`)

// ① 面板上下边界：逐行统计"技能格"像素
console.log('\n=== ① 技能格的行范围（浅灰白像素数）===')
let slotTop = -1, slotBot = -1
for (let y = 0; y < h; y++) {
  let n = 0
  for (let x = 0; x < w; x++) if (isSlot(at(x, y))) n++
  if (n > 40) { if (slotTop < 0) slotTop = y; slotBot = y }
}
console.log(`  技能格行范围: y ${slotTop} ~ ${slotBot}（高 ${slotBot - slotTop + 1}px）`)

// ② 技能格的列范围：在那一行的中点扫描，找连续段
console.log('\n=== ② 技能格的列分段（在 y=中点 上扫）===')
const midY = slotTop + 14   // 往上挪：避开下面的消息输入框
const segs = []
let run = -1
for (let x = 0; x < w; x++) {
  const on = isSlot(at(x, midY))
  if (on && run < 0) run = x
  if (!on && run >= 0) { if (x - run > 12) segs.push([run, x - 1]); run = -1 }
}
if (run >= 0) segs.push([run, w - 1])
segs.forEach(([a, b], i) => console.log(`  第 ${i + 1} 段: x ${a}~${b}（宽 ${b - a + 1}px）`))
if (segs.length > 1) {
  const gaps = segs.slice(1).map((s, i) => s[0] - segs[i][1] - 1)
  console.log(`  段间空隙: ${gaps.join(', ')}px  → 平均 ${(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1)}px`)
}

// ③ 面板的左右边界
console.log('\n=== ③ 面板的左右边界（在 y=中点 上找"深蓝面板"像素）===')
let l = -1, r = -1
for (let x = 0; x < w; x++) if (isPanel(at(x, midY)) || isSlot(at(x, midY))) { if (l < 0) l = x; r = x }
console.log(`  面板横范围: x ${l} ~ ${r}（宽 ${r - l + 1}px）`)

// ④ 关键取样色
console.log('\n=== ④ 取样色 ===')
const S = [
  ['面板底（左上）', 20, slotTop - 12], ['面板底（中）', 300, slotTop - 12],
  ['技能格内部', Math.round((segs[0][0] + segs[0][1]) / 2), midY],
  ['技能格边框', segs[0][0], midY],
  ['左侧信息框底', 100, h - 18], ['面板外背景', 5, 4],
]
for (const [n, x, y] of S) {
  if (x < 0 || y < 0 || x >= w || y >= h) continue
  const c = at(x, y)
  console.log(`  ${n.padEnd(14)} (${String(x).padStart(3)},${String(y).padStart(2)}) = #${[c[0], c[1], c[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`)
}
