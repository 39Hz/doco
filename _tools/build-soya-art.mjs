// 抽取官方索亚（陪伴宠物）立绘。
//
// 名字来自 `图鉴4.3战斗道具、多比、索亚.jpg` 底部的「索亚」区（带 170001~170008 编号），
// 设定文案来自 `docs/游戏数据/索亚介绍.xlsx`。
// 素材在 `多克多比专区资料素材/索亚/`，多数是白底 BMP，需要抠背景。
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, '多克多比专区资料素材', '索亚')
const CACHE = path.join(ROOT, '_tools', 'imgcache', 'soya')
const OUT = path.join(ROOT, 'assets', 'soya')
fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(CACHE, { recursive: true })

// 编号 -> 官方名 -> 素材文件（对应关系来自图鉴4.3的索亚区，逐个人眼核对过）
const MAP = [
  [170001, '威泰格兽（德尔路）', '5.bmp', '图鉴170001'],
  [170002, '伊莱切兽', '2.bmp', '图鉴170002'],
  [170003, '欧瑞坦兽（麦肯）', '1.bmp', '图鉴170003'],
  [170004, '凯科特斯兽', '3.bmp', '图鉴170004'],
  [170005, '帕古因兽', '企鹅.png', '图鉴170005（企鹅）'],
  [170006, '斯提尔兽（咪鲁）', '斯提尔.png', '图鉴170006'],
]

// BMP 用 GDI+ 转 PNG
const todo = MAP.filter(([, , f]) => !/\.png$/i.test(f))
if (todo.length) {
  const lines = ["Add-Type -AssemblyName System.Drawing", "$ErrorActionPreference='Stop'"]
  todo.forEach(([, , f], i) => {
    const src = path.join(SRC, f).replace(/'/g, "''")
    const dst = path.join(CACHE, 'b' + i + '.png').replace(/'/g, "''")
    if (fs.existsSync(dst)) return
    lines.push(`$i=[System.Drawing.Image]::FromFile('${src}');` +
      `$b=New-Object System.Drawing.Bitmap($i.Width,$i.Height);` +
      `$g=[System.Drawing.Graphics]::FromImage($b);$g.DrawImage($i,0,0,$i.Width,$i.Height);$g.Dispose();` +
      `$b.Save('${dst}',[System.Drawing.Imaging.ImageFormat]::Png);$b.Dispose();$i.Dispose()`)
  })
  const psp = path.join(CACHE, 'conv2.ps1')
  fs.writeFileSync(psp, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lines.join('\r\n'), 'utf8')]))
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psp], { stdio: 'inherit' })
}

// 抠背景：从四边泛洪吃掉与边界色接近的区域 + 中性灰（脚底投影）
function removeBg(img, tol = 46) {
  const { w, h, data } = img
  const samples = []
  for (let x = 0; x < w; x += Math.max(1, (w / 64) | 0)) {
    samples.push([data[x * 4], data[x * 4 + 1], data[x * 4 + 2]])
    samples.push([data[((h - 1) * w + x) * 4], data[((h - 1) * w + x) * 4 + 1], data[((h - 1) * w + x) * 4 + 2]])
  }
  for (let y = 0; y < h; y += Math.max(1, (h / 64) | 0)) {
    samples.push([data[(y * w) * 4], data[(y * w) * 4 + 1], data[(y * w) * 4 + 2]])
    samples.push([data[(y * w + w - 1) * 4], data[(y * w + w - 1) * 4 + 1], data[(y * w + w - 1) * 4 + 2]])
  }
  const med = (i) => { const a = samples.map((s) => s[i]).sort((p, q) => p - q); return a[a.length >> 1] }
  const bg = [med(0), med(1), med(2)]
  const dist = (i) => Math.max(Math.abs(data[i] - bg[0]), Math.abs(data[i + 1] - bg[1]), Math.abs(data[i + 2] - bg[2]))
  const isBg = new Uint8Array(w * h)
  const q = []
  const push = (p) => { if (!isBg[p]) { isBg[p] = 1; q.push(p) } }
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x) }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1) }
  let removed = 0
  while (q.length) {
    const p = q.pop(); removed++
    const x = p % w, y = (p / w) | 0
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const np = ny * w + nx
      if (isBg[np]) continue
      if (dist(np * 4) <= tol) push(np)
    }
  }
  const SOFT = 120
  for (let p = 0; p < w * h; p++) {
    const i = p * 4
    if (isBg[p]) { data[i + 3] = 0; continue }
    const x = p % w, y = (p / w) | 0
    const near = (x > 0 && isBg[p - 1]) || (x < w - 1 && isBg[p + 1]) ||
      (y > 0 && isBg[p - w]) || (y < h - 1 && isBg[p + w])
    if (!near) continue
    const d = dist(i)
    if (d < SOFT) data[i + 3] = Math.min(data[i + 3], Math.round(255 * (d - tol) / (SOFT - tol)))
  }
  return { bg, pct: +(100 * removed / (w * h)).toFixed(1) }
}
function trim(img) {
  const { w, h, data } = img
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] < 8) continue
    if (x < x0) x0 = x; if (x > x1) x1 = x
    if (y < y0) y0 = y; if (y > y1) y1 = y
  }
  if (x1 < 0) return img
  const nw = x1 - x0 + 1, nh = y1 - y0 + 1
  const out = new Uint8Array(nw * nh * 4)
  for (let y = 0; y < nh; y++) out.set(data.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + nw) * 4), y * nw * 4)
  return { w: nw, h: nh, data: out }
}
function resize(img, maxH, maxW = 900) {
  const s = Math.min(1, maxH / img.h, maxW / img.w)
  if (s >= 1) return img
  const nw = Math.max(1, Math.round(img.w * s)), nh = Math.max(1, Math.round(img.h * s))
  const src = new Float32Array(img.w * img.h * 4)
  for (let i = 0; i < img.w * img.h; i++) {
    const a = img.data[i * 4 + 3] / 255
    src[i * 4] = img.data[i * 4] * a; src[i * 4 + 1] = img.data[i * 4 + 1] * a
    src[i * 4 + 2] = img.data[i * 4 + 2] * a; src[i * 4 + 3] = a
  }
  const out = new Uint8Array(nw * nh * 4)
  const sx = img.w / nw, sy = img.h / nh
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.min(img.h, Math.ceil((y + 1) * sy))
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.min(img.w, Math.ceil((x + 1) * sx))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * img.w + xx) * 4
        r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]; n++
      }
      if (!n) continue
      r /= n; g /= n; b /= n; a /= n
      const o = (y * nw + x) * 4
      if (a > 0.0001) { out[o] = Math.round(Math.min(255, r / a)); out[o + 1] = Math.round(Math.min(255, g / a)); out[o + 2] = Math.round(Math.min(255, b / a)) }
      out[o + 3] = Math.round(Math.min(255, a * 255))
    }
  }
  return { w: nw, h: nh, data: out }
}
function cornerOpaque(img) {
  const { w, h, data } = img
  const at = (x, y) => data[(y * w + x) * 4 + 3]
  return [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].filter(([x, y]) => at(x, y) > 200).length >= 2
}

const index = []
const processed = []
for (const [id, name, file, evidence] of MAP) {
  const src = /\.png$/i.test(file) ? path.join(SRC, file) : path.join(CACHE, 'b' + todo.findIndex((t) => t[2] === file) + '.png')
  if (!fs.existsSync(src)) { console.log(`★ 缺素材 ${name} <- ${file}`); continue }
  const img = decodePng(fs.readFileSync(src))
  const before = `${img.w}x${img.h}`
  let note = '原图自带透明背景'
  if (cornerOpaque(img)) {
    const r = removeBg(img)
    note = `抠背景(底色 ${r.bg.join(',')}，去掉 ${r.pct}%)`
  }
  const t = trim(img)
  const sized = resize(t, 420, 720)
  const f = `soya_${id}.png`
  fs.writeFileSync(path.join(OUT, f), encodePng(sized.w, sized.h, sized.data))
  index.push({ id, name, file: 'assets/soya/' + f, w: sized.w, h: sized.h, src: file, evidence })
  processed.push({ id, name, img: sized })
  console.log(`  ${String(id)} ${name.padEnd(16)} <- ${file.padEnd(14)} ${before.padEnd(10)} -> ${sized.w}x${sized.h}  ${note}`)
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ generated: new Date().toISOString(), soya: index }, null, 1))
console.log(`\n已导出 ${index.length} 只索亚 -> assets/soya/`)

// 对照总表
const COLS = 3, CELL = 220, PAD = 8
const rows = Math.ceil(processed.length / COLS)
const W = COLS * (CELL + PAD) + PAD, H = rows * (CELL + PAD) + PAD
const c = { width: W, height: H, _fb: (await import('./pixel-canvas.mjs')).makeFramebuffer(W, H), style: {} }
const { PixelCtx } = await import('./pixel-canvas.mjs')
const ctx = new PixelCtx(c)
ctx.fillStyle = '#101822'; ctx.fillRect(0, 0, W, H)
processed.forEach((p, i) => {
  const cx = PAD + (i % COLS) * (CELL + PAD), cy = PAD + ((i / COLS) | 0) * (CELL + PAD)
  ctx.fillStyle = '#33465c'; ctx.fillRect(cx, cy, CELL, CELL)
  const s = Math.min(CELL / p.img.w, CELL / p.img.h)
  const dw = Math.round(p.img.w * s), dh = Math.round(p.img.h * s)
  ctx.drawImage({ _pixels: p.img }, cx + ((CELL - dw) >> 1), cy + ((CELL - dh) >> 1), dw, dh)
})
fs.writeFileSync(path.join(ROOT, 'docs', 'sheets', '_soya_art.png'), encodePng(W, H, c._fb))
console.log('对照表 -> docs/sheets/_soya_art.png')
processed.forEach((p, i) => console.log(`  第${((i / COLS) | 0) + 1}行 第${(i % COLS) + 1}列  ${p.id} ${p.name}`))
