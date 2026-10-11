// 找出归档里所有「高清透明官方多比立绘」。
//
// 上一版探针漏掉了大图：克罗多比.png 其实是 4000x2333 的 RGBA 透明图，
// 比 400x354 的小图好得多。这里把全库 PNG 扫一遍，凡 RGBA 且宽度>=600 的都列出来，
// 不再只看「文件名含多比」。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const ROOTS = [
  '多克多比专区资料素材/多比形态素材',
  '多克多比专区资料素材/多克多比VIP充值素材',
  '多克多比专区资料素材/图片资源',
  '多克多比专区资料素材/多克多比专区改版资料',
  '多克多比专区资料素材/副本',
  '多克多比专区资料素材/图鉴',
  '多克多比专区资料素材/npc大全',
]

function pngInfo(p) {
  const fd = fs.openSync(p, 'r')
  try {
    const b = Buffer.alloc(34)
    fs.readSync(fd, b, 0, 34, 0)
    if (b.readUInt32BE(0) !== 0x89504e47) return null
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25], bitDepth: b[24] }
  } finally { fs.closeSync(fd) }
}

const found = []
const seen = new Set()
for (const r of ROOTS) {
  const abs = path.join(ROOT, r)
  if (!fs.existsSync(abs)) continue
  const walk = (d) => {
    let ents
    try { ents = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (!/\.png$/i.test(e.name)) continue
      const key = e.name + '|' + fs.statSync(p).size
      if (seen.has(key)) continue
      seen.add(key)
      const i = pngInfo(p)
      if (!i || i.colorType !== 6) continue          // 只要 RGBA
      if (i.w < 600 && i.h < 600) continue
      if (i.w * i.h > 4000 * 2400) continue          // 超大壁纸跳过
      found.push({ ...i, p, rel: path.relative(ROOT, p).replace(/\\/g, '/'), kb: Math.round(fs.statSync(p).size / 1024) })
    }
  }
  walk(abs)
}
found.sort((a, b) => b.w * b.h - a.w * a.h)
console.log(`=== 全库 RGBA 大图（>=600px，共 ${found.length} 张）===`)
for (const f of found) {
  console.log(`  ${String(f.w).padStart(5)}x${String(f.h).padEnd(5)} ${String(f.kb).padStart(6)}KB  ${path.basename(f.p).padEnd(26)} ${f.rel}`)
}
