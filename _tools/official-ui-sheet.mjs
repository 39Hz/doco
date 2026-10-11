// 把归档里的「官方界面截图」转成 PNG 并拼成对照表 —— 这是重做背包/战斗界面的**依据**。
// 之前几轮我都是凭记忆猜原版长什么样，其实素材里一直躺着官方截图。
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { decodePng, encodePng, makeFramebuffer, PixelCtx } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const A = path.join(ROOT, '多克多比专区资料素材')
const CACHE = path.join(ROOT, '_tools', 'imgcache', 'ui')
fs.mkdirSync(CACHE, { recursive: true })

const LIST = [
  ['多比面板', '图片资源/游戏截图/多比面板.jpg'],
  ['人物面板', '图片资源/游戏截图/人物面板.jpg'],
  ['技能面板', '图片资源/游戏截图/技能面板.jpg'],
  ['技能面板2', '图片资源/游戏截图/技能面板2.jpg'],
  ['战斗截图', '图片资源/多克多比图片集/游戏截图/战斗截图.jpg'],
  ['战斗技能', '图片资源/多克多比图片集/游戏截图/战斗技能.jpg'],
  ['索亚横版战斗BOSS战', '图片资源/多克多比图片集/游戏截图/索亚横版战斗BOSS战.jpg'],
  ['土多比战斗', '图片资源/多克多比图片集/游戏截图/土多比战斗.jpg'],
  ['金字塔副本战斗', '图片资源/小游戏截图/小游戏截图/金字塔副本战斗.jpg'],
  ['金字塔副本战斗2', '图片资源/小游戏截图/小游戏截图/金字塔副本战斗2.jpg'],
  ['图鉴4.3战斗道具、多比、索亚', '图鉴/图鉴4.3战斗道具、多比、索亚.jpg'],
]

// JPEG 用 GDI+ 转 PNG（本机没有 jpeg 解码器）
const todo = LIST.filter(([, rel]) => !fs.existsSync(path.join(CACHE, path.basename(rel).replace(/\.jpe?g$/i, '.png'))))
if (todo.length) {
  const lines = ["Add-Type -AssemblyName System.Drawing", "$ErrorActionPreference='Stop'"]
  for (const [, rel] of todo) {
    const src = path.join(A, rel).replace(/'/g, "''")
    const dst = path.join(CACHE, path.basename(rel).replace(/\.jpe?g$/i, '.png')).replace(/'/g, "''")
    lines.push(`$i=[System.Drawing.Image]::FromFile('${src}');` +
      `$b=New-Object System.Drawing.Bitmap($i.Width,$i.Height);` +
      `$g=[System.Drawing.Graphics]::FromImage($b);$g.DrawImage($i,0,0,$i.Width,$i.Height);$g.Dispose();` +
      `$b.Save('${dst}',[System.Drawing.Imaging.ImageFormat]::Png);$b.Dispose();$i.Dispose()`)
  }
  const psp = path.join(CACHE, 'conv.ps1')
  fs.writeFileSync(psp, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lines.join('\r\n'), 'utf8')]))
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psp], { stdio: 'inherit' })
}

const imgs = []
for (const [label, rel] of LIST) {
  const p = path.join(CACHE, path.basename(rel).replace(/\.jpe?g$/i, '.png'))
  if (!fs.existsSync(p)) { console.log('缺 ' + label); continue }
  const img = decodePng(fs.readFileSync(p))
  console.log(`  ${label.padEnd(26)} ${img.w}x${img.h}`)
  imgs.push({ label, img })
}
const COLS = 3, CW = 520, PAD = 8
const cells = imgs.map((it) => ({ ...it, CH: Math.round(CW * it.img.h / it.img.w) }))
const rowH = []
for (let i = 0; i < cells.length; i += COLS) rowH.push(Math.max(...cells.slice(i, i + COLS).map((c) => c.CH)))
const W = COLS * (CW + PAD) + PAD
const H = rowH.reduce((a, b) => a + b + PAD, PAD)
const canvas = { width: W, height: H, _fb: makeFramebuffer(W, H), style: {} }
const ctx = new PixelCtx(canvas)
ctx.fillStyle = '#0c121c'; ctx.fillRect(0, 0, W, H)
let y = PAD
for (let r = 0; r < rowH.length; r++) {
  for (let c = 0; c < COLS; c++) {
    const it = cells[r * COLS + c]
    if (!it) continue
    ctx.drawImage({ _pixels: it.img }, PAD + c * (CW + PAD), y, CW, it.CH)
  }
  y += rowH[r] + PAD
}
fs.writeFileSync(path.join(ROOT, 'docs', 'sheets', '_official_ui.png'), encodePng(W, H, canvas._fb))
console.log('\n官方界面截图总表 -> docs/sheets/_official_ui.png')
console.log('版面（3 列）：')
cells.forEach((c, i) => console.log(`  第${((i / COLS) | 0) + 1}行 第${(i % COLS) + 1}列  ${c.label}`))
