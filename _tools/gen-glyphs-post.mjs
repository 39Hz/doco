// 解析 GDI+ 图集：
//   · index.json —— 只放字形度量（很小）
//   · atlas_<size>_<style>.rgba —— 图集原始 RGBA 像素（二进制，运行时按需读取）
// 之所以不放 base64 进 JSON：40 个图集的像素转 base64 超过 V8 的字符串上限（~5 亿字符）。
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const OUT = path.join(ROOT, '_tools', 'glyphs')
const raw = JSON.parse(readFileSync(path.join(OUT, 'raw.json'), 'utf8').replace(/^\uFEFF/, ''))

const index = { sizes: {}, atlas: {} }
let total = 0
for (const [key, val] of Object.entries(raw)) {
  const [sizeStr, style] = key.split('|')
  const size = Number(sizeStr)
  const png = decodePng(readFileSync(path.join(OUT, val.file)))
  const glyphs = {}
  for (const e of val.entries) {
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1
    const x0 = Math.max(0, e.x - 2), y0 = Math.max(0, e.y - 2)
    const x1 = Math.min(png.w, e.x + Math.ceil(e.w) + 3), y1 = Math.min(png.h, e.y + Math.ceil(e.h) + 3)
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (png.data[(y * png.w + x) * 4 + 3] > 8) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) { glyphs[e.code] = { adv: e.adv, empty: true }; continue }
    glyphs[e.code] = {
      x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1,
      bx: minX - e.x, by: minY - e.y,
      adv: e.adv,
    }
    total++
  }
  const id = size + '_' + style
  index.sizes[size] = index.sizes[size] || {}
  index.sizes[size][style] = { atlas: id, glyphs }
  writeFileSync(path.join(OUT, 'atlas_' + id + '.rgba'), Buffer.from(png.data.buffer, png.data.byteOffset, png.data.length))
  index.atlas[id] = { w: png.w, h: png.h, file: 'atlas_' + id + '.rgba' }
  console.log(sizeStr + 'px ' + style + '：' + Object.keys(glyphs).length + ' 字形，' + png.w + '×' + png.h)
}
index.totalGlyphs = total
writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index), 'utf8')
console.log('字形总数 ' + total + '，index.json ' + (readFileSync(path.join(OUT, 'index.json')).length / 1024).toFixed(0) + ' KB')
