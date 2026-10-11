// 把 索亚/ 目录里的素材（BMP/PNG/JPG）统一转成 PNG 并拼成对照表，
// 看清官方这几只索亚长什么样、有几只可用。
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { decodePng, encodePng, makeFramebuffer, PixelCtx } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, '多克多比专区资料素材', '索亚')
const CACHE = path.join(ROOT, '_tools', 'imgcache', 'soya')
fs.mkdirSync(CACHE, { recursive: true })

const files = []
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(png|jpe?g|bmp)$/i.test(e.name)) files.push(p)
  }
}
walk(SRC)
files.sort()
console.log(`索亚目录里 ${files.length} 个图片文件`)

// 非 PNG 的用 GDI+ 转
const needConv = files.filter((f) => !/\.png$/i.test(f))
if (needConv.length) {
  const lines = ["Add-Type -AssemblyName System.Drawing", "$ErrorActionPreference='Stop'"]
  needConv.forEach((f, i) => {
    const dst = path.join(CACHE, 's' + i + '.png').replace(/'/g, "''")
    const src = f.replace(/'/g, "''")
    lines.push(`$i=[System.Drawing.Image]::FromFile('${src}');` +
      `$b=New-Object System.Drawing.Bitmap($i.Width,$i.Height);` +
      `$g=[System.Drawing.Graphics]::FromImage($b);$g.DrawImage($i,0,0,$i.Width,$i.Height);$g.Dispose();` +
      `$b.Save('${dst}',[System.Drawing.Imaging.ImageFormat]::Png);$b.Dispose();$i.Dispose()`)
  })
  const psp = path.join(CACHE, 'conv.ps1')
  fs.writeFileSync(psp, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lines.join('\r\n'), 'utf8')]))
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psp], { stdio: 'inherit' })
}

const imgs = []
for (const f of files) {
  const p = /\.png$/i.test(f) ? f : path.join(CACHE, 's' + needConv.indexOf(f) + '.png')
  if (!fs.existsSync(p)) continue
  try {
    const img = decodePng(fs.readFileSync(p))
    imgs.push({ name: path.relative(SRC, f), img })
    console.log(`  ${path.relative(SRC, f).padEnd(26)} ${img.w}x${img.h}`)
  } catch (e) { console.log(`  ${path.relative(SRC, f).padEnd(26)} ★ 解码失败 ${e.message}`) }
}

const COLS = 4, CW = 340, PAD = 8
const cells = imgs.map((it) => ({ ...it, CH: Math.max(120, Math.round(CW * it.img.h / it.img.w)) }))
const rowH = []
for (let i = 0; i < cells.length; i += COLS) rowH.push(Math.max(...cells.slice(i, i + COLS).map((c) => c.CH)))
const W = COLS * (CW + PAD) + PAD
const H = rowH.reduce((a, b) => a + b + PAD, PAD)
const canvas = { width: W, height: H, _fb: makeFramebuffer(W, H), style: {} }
const ctx = new PixelCtx(canvas)
ctx.fillStyle = '#101822'; ctx.fillRect(0, 0, W, H)
let y = PAD
for (let r = 0; r < rowH.length; r++) {
  for (let c = 0; c < COLS; c++) {
    const it = cells[r * COLS + c]
    if (!it) continue
    ctx.drawImage({ _pixels: it.img }, PAD + c * (CW + PAD), y, CW, it.CH)
  }
  y += rowH[r] + PAD
}
const out = path.join(ROOT, 'docs', 'sheets', '_soya.png')
fs.writeFileSync(out, encodePng(W, H, canvas._fb))
console.log(`\n对照表 -> ${out}`)
console.log('版面（4 列）：')
cells.forEach((c, i) => console.log(`  第${((i / COLS) | 0) + 1}行 第${(i % COLS) + 1}列  ${c.name}`))
