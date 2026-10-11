// 把基础多克渲染成图：7 种配色 + 一个走路循环的 8 个相位
// 用 shoot.mjs 那套**像素级画布**，所以画出来就是游戏里真正的样子。
import fs from 'node:fs'
import path from 'node:path'
import { encodePng, makeFramebuffer, PixelCtx } from './pixel-canvas.mjs'
import { T } from './game-harness.mjs'

const OUT = path.join(process.cwd(), 'docs', 'shots')
const t = T
t.load('game/game.js')
await T.settle()
const W = t.get('window')
const D = W.DKDbbData
const DOK = D && D.DOK
if (!DOK) { console.error('没找到 D.DOK —— game/dok.js 没加载？'); process.exit(1) }
console.log(`基础多克配色 ${DOK.colors.length} 种：${DOK.colors.map((c) => c.name).join('、')}`)

// 造一个"小画布"：PixelCtx 要 {width,height,_fb}
const mk = (w, h) => { const c = { width: w, height: h, _fb: makeFramebuffer(w, h) }; return { c, ctx: new PixelCtx(c) } }

const CW = 150, CH = 210, H = 150
const sheet = (n) => {
  const c = { width: CW * n, height: CH, _fb: makeFramebuffer(CW * n, CH) }
  // 深色底，好看清轮廓
  for (let i = 0; i < c._fb.length; i += 4) { c._fb[i] = 22; c._fb[i + 1] = 26; c._fb[i + 2] = 36 }
  return c
}
const paste = (dst, src, ox) => {
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const si = (y * src.width + x) * 4, dx = ox + x
    if (dx >= dst.width) continue
    const di = (y * dst.width + dx) * 4
    const a = src._fb[si + 3] / 255
    if (a <= 0) continue
    for (let c = 0; c < 3; c++) dst._fb[di + c] = Math.round(src._fb[si + c] * a + dst._fb[di + c] * (1 - a))
  }
}

// ① 7 色站姿
{
  const out = sheet(7)
  for (let i = 0; i < 7; i++) {
    const { c, ctx } = mk(CW, CH)
    DOK.draw(ctx, CW / 2, CH - 34, H, { color: i, facing: 1, moving: false, phase: 0 })
    paste(out, c, i * CW)
  }
  fs.writeFileSync(path.join(OUT, 'dok-colors.png'), encodePng(out.width, out.height, out._fb))
  console.log('已写 docs/shots/dok-colors.png')
}

// ② 走路循环 8 相位（橙色那只，看得最清）
{
  const N = 8
  const out = sheet(N)
  for (let i = 0; i < N; i++) {
    const { c, ctx } = mk(CW, CH)
    DOK.draw(ctx, CW / 2, CH - 34, H, { color: 1, facing: 1, moving: true, phase: i / N })
    paste(out, c, i * CW)
  }
  fs.writeFileSync(path.join(OUT, 'dok-walk.png'), encodePng(out.width, out.height, out._fb))
  console.log('已写 docs/shots/dok-walk.png')
}
