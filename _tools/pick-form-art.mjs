// 给「厄斯·垒 多比」挑官方形象：把候选图转成 PNG 拼一张对照表。
// 官方形态表里厄斯·垒的动作组原文是「用未知图案代替」，所以没有直接同名立绘，
// 只能在归档里找「名字或元素对得上」的图来比。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer, PixelCtx } from './pixel-canvas.mjs'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve('.')
const TMP = path.join(ROOT, '_tools', 'imgcache', 'formpick')
fs.mkdirSync(TMP, { recursive: true })

const CANDS = [
  ['神秘未知多比.png', '多比形态素材/神秘未知多比.png', '官方占位图（黑剪影+?）'],
  ['艾斯·垒 多比.jpg', '多比形态素材/艾斯·垒 多比/艾斯·垒 多比.jpg', '名字只差一字：艾斯·垒'],
  ['夜影·厄斯 多比.jpg', '多比形态素材/夜影多比/夜影·厄斯 多比/夜影·厄斯 多比.jpg', '夜影系列的「厄斯」'],
  ['摩撒·蝎多比.jpg', '多比形态素材/蝎多比/摩撒·蝎多比.jpg', '土系（土蠍多比 dobi_194013）'],
  ['人鱼多比.PNG', '多比形态素材/人鱼多比.PNG', '水系副本掉落'],
  ['安吉尔多比.png', '多比形态素材/1920/安吉尔多比.png', '1920 系列'],
  ['利刃多比.png', '多比形态素材/利刃多比.png', '风/土系'],
  ['斯隆曼·空多比.png', '多比形态素材/斯隆曼·空多比.png', '空'],
  ['钢铁多比.png', '多比形态素材/钢铁多比.png', '当前给艾隆·垒用'],
  ['龙多比.png', '多比形态素材/龙多比.png', '当前给德拉科·龙用'],
  ['圣诞多比.png', '多比形态素材/圣诞多比.png', '当前给艾斯·林用'],
  ['旋风多比.png', '多比形态素材/旋风多比.png', '当前给温德·冽用'],
]

// JPEG 用 GDI+ 转 PNG（本机没有 jpeg 解码器）
const jpgs = CANDS.filter((c) => /\.jpe?g$/i.test(c[1]))
if (jpgs.length) {
  const ps = [
    "Add-Type -AssemblyName System.Drawing",
    "$ErrorActionPreference='Stop'",
    ...jpgs.map((c, i) => {
      const src = path.join(ROOT, '多克多比专区资料素材', c[1]).replace(/'/g, "''")
      const dst = path.join(TMP, 'c' + i + '.png').replace(/'/g, "''")
      return `$i=[System.Drawing.Image]::FromFile('${src}');$b=New-Object System.Drawing.Bitmap($i.Width,$i.Height);$g=[System.Drawing.Graphics]::FromImage($b);$g.DrawImage($i,0,0,$i.Width,$i.Height);$g.Dispose();$b.Save('${dst}',[System.Drawing.Imaging.ImageFormat]::Png);$b.Dispose();$i.Dispose()`
    }),
  ].join('\r\n')
  const psp = path.join(TMP, 'conv.ps1')
  fs.writeFileSync(psp, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(ps, 'utf8')]))
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psp], { stdio: 'inherit' })
}

const imgs = []
for (const [label, rel, note] of CANDS) {
  const src = /\.jpe?g$/i.test(rel) ? path.join(TMP, 'c' + jpgs.findIndex((c) => c[1] === rel) + '.png')
    : path.join(ROOT, '多克多比专区资料素材', rel)
  if (!fs.existsSync(src)) { console.log('缺 ' + label); continue }
  let img = decodePng(fs.readFileSync(src))
  console.log(`  ${label.padEnd(20)} ${img.w}x${img.h}  ${note}`)
  const s = Math.min(1, 560 / img.h, 560 / img.w)
  if (s < 1) {
    const nw = Math.round(img.w * s), nh = Math.round(img.h * s)
    const out = new Uint8Array(nw * nh * 4)
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      const sx = Math.min(img.w - 1, Math.round(x / s)), sy = Math.min(img.h - 1, Math.round(y / s))
      const si = (sy * img.w + sx) * 4, di = (y * nw + x) * 4
      out[di] = img.data[si]; out[di + 1] = img.data[si + 1]; out[di + 2] = img.data[si + 2]; out[di + 3] = img.data[si + 3]
    }
    img = { w: nw, h: nh, data: out }
  }
  imgs.push({ label, img })
}

const COLS = 4, CELL = 250, PAD = 8
const rows = Math.ceil(imgs.length / COLS)
const W = COLS * (CELL + PAD) + PAD, H = rows * (CELL + PAD) + PAD
const canvas = { width: W, height: H, _fb: makeFramebuffer(W, H), style: {} }
const ctx = new PixelCtx(canvas)
ctx.fillStyle = '#1b2430'; ctx.fillRect(0, 0, W, H)
// 画格子底纹区分「有没有 alpha」：白底格子 = 不透明图
imgs.forEach((it, i) => {
  const cx = PAD + (i % COLS) * (CELL + PAD), cy = PAD + ((i / COLS) | 0) * (CELL + PAD)
  ctx.fillStyle = '#5a7a9a'; ctx.fillRect(cx, cy, CELL, CELL)
  const s = Math.min(CELL / it.img.w, CELL / it.img.h)
  const dw = Math.max(1, Math.round(it.img.w * s)), dh = Math.max(1, Math.round(it.img.h * s))
  ctx.drawImage({ _pixels: it.img }, cx + ((CELL - dw) >> 1), cy + ((CELL - dh) >> 1), dw, dh)
})
fs.writeFileSync(path.join(ROOT, 'docs', 'sheets', '_formpick.png'), encodePng(W, H, canvas._fb))
console.log('\n顺序（4 列）:')
imgs.forEach((it, i) => console.log(`  第${((i / COLS) | 0) + 1}行 第${(i % COLS) + 1}列  ${it.label}`))
