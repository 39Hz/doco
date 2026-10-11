// 把一张大图转成 PNG 并缩到可读尺寸，用来"看一眼"素材里到底画了什么。
// 用法: node _tools/peek.mjs <图片路径> [输出路径] [最大高度]
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const src = path.resolve(process.argv[2])
const out = path.resolve(process.argv[3] || path.join(ROOT, 'docs', 'sheets', '_peek.png'))
const maxH = Number(process.argv[4] || 900)
fs.mkdirSync(path.dirname(out), { recursive: true })

let pngPath = src
if (/\.jpe?g$/i.test(src)) {
  const tmp = path.join(ROOT, '_tools', 'imgcache', 'peek.png')
  fs.mkdirSync(path.dirname(tmp), { recursive: true })
  const ps = "Add-Type -AssemblyName System.Drawing\r\n" +
    `$i=[System.Drawing.Image]::FromFile('${src.replace(/'/g, "''")}');` +
    `$b=New-Object System.Drawing.Bitmap($i.Width,$i.Height);` +
    `$g=[System.Drawing.Graphics]::FromImage($b);$g.DrawImage($i,0,0,$i.Width,$i.Height);$g.Dispose();` +
    `$b.Save('${tmp.replace(/'/g, "''")}',[System.Drawing.Imaging.ImageFormat]::Png);$b.Dispose();$i.Dispose()`
  const psp = path.join(ROOT, '_tools', 'imgcache', 'peek.ps1')
  fs.writeFileSync(psp, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(ps, 'utf8')]))
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psp], { stdio: 'inherit' })
  pngPath = tmp
}

const img = decodePng(fs.readFileSync(pngPath))
console.log(`源图 ${img.w}x${img.h}`)
const s = Math.min(1, maxH / img.h, 1400 / img.w)
let o = img
if (s < 1) {
  const nw = Math.round(img.w * s), nh = Math.round(img.h * s)
  const d = new Uint8Array(nw * nh * 4)
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const sx = Math.min(img.w - 1, Math.round(x / s)), sy = Math.min(img.h - 1, Math.round(y / s))
    const si = (sy * img.w + sx) * 4, di = (y * nw + x) * 4
    d[di] = img.data[si]; d[di + 1] = img.data[si + 1]; d[di + 2] = img.data[si + 2]; d[di + 3] = img.data[si + 3]
  }
  o = { w: nw, h: nh, data: d }
}
fs.writeFileSync(out, encodePng(o.w, o.h, o.data))
console.log(`输出 ${o.w}x${o.h} -> ${out}`)
