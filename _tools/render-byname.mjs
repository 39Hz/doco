// 把 byname 里提取出来的 JPEG（幽灵/魔化多比/河伯）转成 PNG 并渲染，评估质量。
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { decodePng, encodePng, makeFramebuffer } from './pixel-canvas.mjs'
import { loadGlyphAtlas, TextRenderer } from './text-render.mjs'

const ROOT = path.resolve('.')
const DIR = path.join(ROOT, 'assets', 'monsters', 'byname')
const jpgs = fs.readdirSync(DIR).filter((f) => /\.jpg$/i.test(f))
console.log('byname 里的 JPEG: ' + jpgs.length + ' 个')

// 用 PowerShell + GDI+ 转 PNG（与 convert-jpg.mjs 同法）
const lines = [
  'Add-Type -AssemblyName System.Drawing',
  "$ErrorActionPreference='Continue'",
  'function Conv($src,$dst){ try { $i=[System.Drawing.Image]::FromFile($src); $b=New-Object System.Drawing.Bitmap($i.Width,$i.Height); $g=[System.Drawing.Graphics]::FromImage($b); $g.Clear([System.Drawing.Color]::Transparent); $g.DrawImage($i,0,0,$i.Width,$i.Height); $g.Dispose(); $b.Save($dst,[System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose(); $i.Dispose(); Write-Output ("OK "+$dst) } catch { Write-Output ("ERR "+$dst) } }',
]
for (const j of jpgs) {
  lines.push('Conv "' + path.join(DIR, j).replace(/\\/g, '\\\\') + '" "' + path.join(DIR, j.replace(/\.jpg$/i, '.png')).replace(/\\/g, '\\\\') + '"')
}
const ps = path.join(DIR, '_conv.ps1')
fs.writeFileSync(ps, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lines.join('\n'), 'utf8')]))
try {
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps], { stdio: 'ignore', timeout: 300000 })
} catch (e) { }

const pngs = fs.readdirSync(DIR).filter((f) => /\.png$/i.test(f))
console.log('转换后 PNG: ' + pngs.length + ' 个')

const CW = 420, CH = 460
const W = CW * Math.min(3, pngs.length), H = CH * Math.ceil(pngs.length / 3)
const fb = makeFramebuffer(W, H)
for (let i = 0; i < fb.length; i += 4) { fb[i] = 45; fb[i + 1] = 48; fb[i + 2] = 58; fb[i + 3] = 255 }
const tr = new TextRenderer(loadGlyphAtlas())
const fake = {
  W, H, buf: fb, _clip: null, globalAlpha: 1,
  _blend(px, py, R, G, B, a) {
    px |= 0; py |= 0
    if (px < 0 || py < 0 || px >= W || py >= H) return
    const d = (py * W + px) * 4
    fb[d] = fb[d] * (1 - a) + R * a; fb[d + 1] = fb[d + 1] * (1 - a) + G * a; fb[d + 2] = fb[d + 2] * (1 - a) + B * a
  },
  _inClip() { return true },
}
pngs.forEach((f, k) => {
  const c = k % 3, r = Math.floor(k / 3)
  const x0 = c * CW, y0 = r * CH
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const i = ((y0 + y) * W + x0 + x) * 4
    const v = 45 + Math.round(20 * (y / CH))
    fb[i] = v; fb[i + 1] = v + 3; fb[i + 2] = v + 12
  }
  let png = null
  try { png = decodePng(fs.readFileSync(path.join(DIR, f))) } catch (e) { }
  if (png) {
    const sc = Math.min((CW - 24) / png.w, (CH - 60) / png.h, 1.5)
    const dw = Math.max(1, Math.round(png.w * sc)), dh = Math.max(1, Math.round(png.h * sc))
    const ox = x0 + Math.floor((CW - dw) / 2), oy = y0 + 34
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(png.w - 1, Math.floor(x / sc)), sy = Math.min(png.h - 1, Math.floor(y / sc))
        const si = (sy * png.w + sx) * 4
        const a = png.data[si + 3] / 255
        if (a <= 0.02) continue
        const px = ox + x, py = oy + y
        if (px < 0 || py < 0 || px >= W || py >= H) continue
        const di = (py * W + px) * 4
        fb[di] = fb[di] * (1 - a) + png.data[si] * a
        fb[di + 1] = fb[di + 1] * (1 - a) + png.data[si + 1] * a
        fb[di + 2] = fb[di + 2] * (1 - a) + png.data[si + 2] * a
      }
    }
    tr.draw(fake, f.replace('.png', '') + '  ' + png.w + 'x' + png.h, x0 + 8, y0 + 8, [255, 225, 120, 255], 1, '17px sans-serif', 'left', 'top')
  }
})
fs.writeFileSync(path.join(ROOT, 'docs', 'sheets', '_byname_render.png'), encodePng(W, H, fb))
console.log('已输出 docs/sheets/_byname_render.png（' + W + '×' + H + '）')
