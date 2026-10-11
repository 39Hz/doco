// 把"从 SWF 动作帧抽出的立绘"登记进 assets/forms/art/index.json，并生成头像
//
// 【为什么需要这一步】`apply-form-art.mjs` 靠 `art/index.json` 决定哪个形态用哪张图 ——
//   光把 PNG 放进 `assets/forms/art/` 是不够的（`art` 字段仍是 null，游戏不认）。
//
// 产出：index.json 增补条目 + <形态>_icon.png（96×96，与其它形态同规格）
// 用法: node _tools/register-swf-form-art.mjs [--dry]
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const ARTDIR = path.join(ROOT, 'assets/forms/art')
const IDX = path.join(ARTDIR, 'index.json')
const DRY = process.argv.includes('--dry')

// 待登记：形态名 / 出处说明
const NEW = [
  { name: '水多比', src: '动画视频/多比战斗动画/水多比-战斗.swf（DefineBitsJPEG3 动作帧，站姿）', frame: '水多比-战斗_005' },
  { name: '火多比', src: '动画视频/多比战斗动画/火多比-战斗.swf（DefineBitsJPEG3 动作帧，站姿）', frame: '火多比-战斗_186' },
  { name: '超级克罗 多比', src: '动画视频/多比战斗动画/超级多比-战斗.swf（DefineBitsJPEG3 动作帧，站姿）', frame: '超级多比-战斗_101' },
]

// ---- 与 build-form-art.mjs 同一套 makeIcon（96×96 头肩方图）----
function trim(img) {
  const { w, h, data } = img
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 30) {
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return { w: 1, h: 1, data: new Uint8ClampedArray(4) }
  const nw = x1 - x0 + 1, nh = y1 - y0 + 1
  const out = new Uint8ClampedArray(nw * nh * 4)
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const s = ((y0 + y) * w + (x0 + x)) * 4, d = (y * nw + x) * 4
    out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = data[s + 3]
  }
  return { w: nw, h: nh, data: out }
}
function resize(img, dw, dh) {
  const { w, h, data } = img
  const out = new Uint8ClampedArray(dw * dh * 4)
  const sx = w / dw, sy = h / dh
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy))
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let yy = y0; yy < y1 && yy < h; yy++) for (let xx = x0; xx < x1 && xx < w; xx++) {
        const i = (yy * w + xx) * 4, al = data[i + 3] / 255
        r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += data[i + 3]; n++
      }
      if (!n) continue
      const ws = a / 255 || 1, o = (y * dw + x) * 4
      out[o] = r / ws; out[o + 1] = g / ws; out[o + 2] = b / ws; out[o + 3] = a / n
    }
  }
  return { w: dw, h: dh, data: out }
}
function makeIcon(img, size = 96) {
  const band = Math.max(1, Math.round(img.h * 0.55))
  const crop = { w: img.w, h: band, data: new Uint8ClampedArray(img.w * band * 4) }
  crop.data.set(img.data.subarray(0, img.w * band * 4))
  const t = trim(crop)
  const side = Math.max(t.w, t.h)
  const sq = { w: side, h: side, data: new Uint8ClampedArray(side * side * 4) }
  const ox = (side - t.w) >> 1
  for (let y = 0; y < t.h; y++) sq.data.set(t.data.subarray(y * t.w * 4, (y + 1) * t.w * 4), (y * side + ox) * 4)
  return resize(sq, size, size)
}

const idx = JSON.parse(fs.readFileSync(IDX, 'utf8'))
const key = (s) => String(s).replace(/多比|[\s·・]/g, '')
let added = 0
for (const n of NEW) {
  const artPath = path.join(ARTDIR, n.name + '.png')
  if (!fs.existsSync(artPath)) { console.log(`  ✗ 缺立绘文件 ${n.name}.png`); continue }
  const img = decodePng(fs.readFileSync(artPath))
  const iconPath = path.join(ARTDIR, n.name + '_icon.png')
  if (!DRY) {
    const ic = makeIcon(img, 96)
    fs.writeFileSync(iconPath, encodePng(96, 96, ic.data))
  }
  // 已存在就更新，不存在就追加
  const exist = idx.forms.find((f) => key(f.name) === key(n.name))
  const rec = {
    name: n.name,
    file: `assets/forms/art/${n.name}.png`,
    icon: `assets/forms/art/${n.name}_icon.png`,
    w: img.w, h: img.h,
    src: n.src,
    evidence: `第 55 轮：从官方 SWF 动作帧抽取（${n.frame}），带 alpha 合成`,
    bg: 'SWF 自带透明通道（DefineBitsJPEG3 的 alpha），未抠图',
  }
  if (exist) Object.assign(exist, rec)
  else { idx.forms.push(rec); added++ }
  console.log(`  ✓ ${n.name}  ${img.w}×${img.h}  立绘+头像${DRY ? '（dry）' : '已写出'}`)
}
if (!DRY) {
  idx.generated = new Date().toISOString()
  idx.note = (idx.note ? idx.note + ' ' : '') + `第 55 轮增补：从多比战斗动画 SWF 抽取的官方动作帧立绘（水多比/火多比/超级克罗多比）。`
  fs.writeFileSync(IDX, JSON.stringify(idx, null, 1))
}
console.log(`\nindex.json 现有 ${idx.forms.length} 条（新增 ${added}）`)
console.log('下一步：node _tools/apply-form-art.mjs 把 art 字段写进 forms.json')
