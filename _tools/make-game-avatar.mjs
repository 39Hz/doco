// 多克多比游戏头像：从形态立绘裁"头肩方图"，生成多尺寸头像
//
// 【规格对齐游戏内现有头像】项目已有 48 张 `<形态名>_icon.png`（96×96），
//   由 `_tools/build-form-art.mjs` 的 `makeIcon()` 生成：**取立绘上 55% 做头肩 → 按内容收紧 → 补成方图**。
//   这里复用**同一套裁法**（保证和游戏里的头像看着是一套），只是输出更多尺寸供外部使用。
//
// 用法:
//   node _tools/make-game-avatar.mjs                # 列出候选并出对比图
//   node _tools/make-game-avatar.mjs 吕布多比        # 为指定形态生成头像
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const ART = path.join(ROOT, 'assets/forms/art')
const OUTDIR = path.join(ROOT, 'docs/avatar')
const SIZES = [512, 256, 96]

// ---------- 与 build-form-art.mjs 同一套：trim + resize + makeIcon ----------
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
function makeIcon(img, size = 96, bandFrac = 0.78, padFrac = 0.06) {
  const { w, h, data } = img
  const band = Math.max(1, Math.round(h * bandFrac))
  const crop = { w, h: band, data: new Uint8ClampedArray(w * band * 4) }
  crop.data.set(data.subarray(0, w * band * 4))
  const t = trim(crop)
  // 留白（第 55 轮）：第一版直接把内容补成方图 → 主体**贴边**，右侧羽饰/底部盔甲像被切掉。
  // 加一圈内边距（默认 6%）之后，头像才有"呼吸感"，也避免圆角裁切时切到主体。
  const inner = Math.max(t.w, t.h)
  const side = Math.round(inner * (1 + padFrac * 2))
  const sq = { w: side, h: side, data: new Uint8ClampedArray(side * side * 4) }
  const ox = (side - t.w) >> 1
  const oy = (side - t.h) >> 1                       // 垂直居中（原来是贴顶，底部容易被切）
  for (let y = 0; y < t.h; y++) {
    sq.data.set(t.data.subarray(y * t.w * 4, (y + 1) * t.w * 4), ((y + oy) * side + ox) * 4)
  }
  return resize(sq, size, size)
}

// ---------- 候选：最帅的几只（按"造型张力/辨识度"人工挑，出图后可复核）----------
const CANDIDATES = [
  ['吕布多比', '红眼 + 兽面盔 + 方天画戟，气势最强'],
  ['龙多比', '主角形态，金鳞 + 三叉戟 + 龙角'],
  ['正义多比', '白银铠甲 + 红宝石，圣骑风'],
  ['冰多比', '冰晶长发 + 冷色调，最"帅"的一只'],
  ['凤凰多比', '凤凰羽翼 + 火焰，华丽'],
  ['悟空多比', '金箍棒 + 紧箍，辨识度极高'],
  ['斯莱特刃多比', '利刃造型'],
  ['魔龙', '魔龙（怪物图鉴里最帅的一只，可作对照）'],
]

const target = process.argv[2] || null

// ---------- 生成头像 ----------
function gen(name, sizes = SIZES, bandFrac = 0.78) {
  const p = path.join(ART, name + '.png')
  if (!fs.existsSync(p)) {
    // 也接受怪物立绘（魔龙在 monsters 目录）
    const alt = path.join(ROOT, 'assets/monsters/labeled/mon_19012.png')
    if (name === '魔龙' && fs.existsSync(alt)) return genFrom(alt, name, sizes, bandFrac)
    return null
  }
  return genFrom(p, name, sizes, bandFrac)
}
function genFrom(p, name, sizes, bandFrac) {
  const img = decodePng(fs.readFileSync(p))
  fs.mkdirSync(OUTDIR, { recursive: true })
  const made = []
  for (const s of sizes) {
    const icon = makeIcon(img, s, bandFrac)
    const out = path.join(OUTDIR, `${name}_${s}.png`)
    fs.writeFileSync(out, encodePng(s, s, icon.data))
    made.push({ size: s, file: out, bytes: fs.statSync(out).size })
  }
  return made
}

if (target) {
  const made = gen(target)
  if (!made) { console.log(`✗ 找不到立绘：${target}`); process.exit(1) }
  console.log(`已生成「${target}」头像：`)
  for (const m of made) console.log(`  ${m.size}×${m.size}  ${path.relative(ROOT, m.file)}  ${(m.bytes / 1024).toFixed(1)}KB`)
} else {
  // 出候选对比图：全部按 256 渲染，并排看谁最帅
  const S = 256, PAD = 10, LAB = 22
  const items = []
  for (const [name, why] of CANDIDATES) {
    const p = path.join(ART, name + '.png')
    const src = fs.existsSync(p) ? p : (name === '魔龙' ? path.join(ROOT, 'assets/monsters/labeled/mon_19012.png') : null)
    if (!src) { console.log(`  跳过 ${name}（没有立绘）`); continue }
    const icon = makeIcon(decodePng(fs.readFileSync(src)), S, 0.78)
    items.push({ name, why, icon })
  }
  const cols = 4
  const rows = Math.ceil(items.length / cols)
  const totW = PAD + cols * (S + PAD)
  const totH = PAD + rows * (S + PAD + LAB) + 8
  const fb = new Uint8ClampedArray(totW * totH * 4)
  for (let i = 0; i < totW * totH; i++) { fb[i * 4] = 18; fb[i * 4 + 1] = 22; fb[i * 4 + 2] = 36; fb[i * 4 + 3] = 255 }
  items.forEach((it, k) => {
    const cx = PAD + (k % cols) * (S + PAD), cy = PAD + Math.floor(k / cols) * (S + PAD + LAB)
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const s = (y * S + x) * 4, al = it.icon.data[s + 3] / 255
      if (al <= 0) continue
      const d = ((cy + y) * totW + cx + x) * 4
      fb[d] = it.icon.data[s] * al + fb[d] * (1 - al)
      fb[d + 1] = it.icon.data[s + 1] * al + fb[d + 1] * (1 - al)
      fb[d + 2] = it.icon.data[s + 2] * al + fb[d + 2] * (1 - al)
      fb[d + 3] = 255
    }
  })
  fs.mkdirSync(OUTDIR, { recursive: true })
  const OUT = path.join(OUTDIR, '候选人.png')
  fs.writeFileSync(OUT, encodePng(totW, totH, fb))
  console.log(`已写出 ${path.relative(ROOT, OUT)}  ${totW}×${totH}`)
  console.log('候选（左→右、上→下）：')
  items.forEach((it, k) => console.log(`  ${k + 1}. ${it.name} —— ${it.why}`))
  console.log('\n选定后运行：node _tools/make-game-avatar.mjs <形态名>')
}
