// 把 Unity 包里的贴图解码成 PNG。
//
// 支持这份包里实际出现的格式：DXT5 / DXT1 / RGBA32 / RGB24 / Alpha8 / ASTC(极少)。
// 偏移用「同一 .assets 内按对象顺序累加」—— 因为每个文件里各贴图的字节数之和
// 恰好等于 .resS 的大小（脚本已打印占比，100% 就是吻合），这是可验证的。
import fs from 'node:fs'
import path from 'node:path'
import { encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const DATA = path.join(ROOT, '多克多比-2026.2', '多克多比_Data')
const OUT = path.join(ROOT, '_unity_tex')
fs.mkdirSync(OUT, { recursive: true })

const tex = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', '_unity_textures.json'), 'utf8'))

// ---------------- DXT ----------------
function dxtColors(c0, c1, dxt1) {
  const r0 = ((c0 >> 11) & 31) * 255 / 31 | 0, g0 = ((c0 >> 5) & 63) * 255 / 63 | 0, b0 = (c0 & 31) * 255 / 31 | 0
  const r1 = ((c1 >> 11) & 31) * 255 / 31 | 0, g1 = ((c1 >> 5) & 63) * 255 / 63 | 0, b1 = (c1 & 31) * 255 / 31 | 0
  const out = new Uint8Array(16)
  out[0] = r0; out[1] = g0; out[2] = b0; out[3] = 255
  out[4] = r1; out[5] = g1; out[6] = b1; out[7] = 255
  const lerp = (a, b, t) => Math.round(a + (b - a) * t)
  if (!dxt1 || c0 > c1) {
    out[8] = lerp(r0, r1, 1 / 3); out[9] = lerp(g0, g1, 1 / 3); out[10] = lerp(b0, b1, 1 / 3); out[11] = 255
    out[12] = lerp(r0, r1, 2 / 3); out[13] = lerp(g0, g1, 2 / 3); out[14] = lerp(b0, b1, 2 / 3); out[15] = 255
  } else {
    out[8] = lerp(r0, r1, 0.5); out[9] = lerp(g0, g1, 0.5); out[10] = lerp(b0, b1, 0.5); out[11] = 255
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 0
  }
  return out
}
function decodeDXT(src, w, h, dxt1) {
  const out = new Uint8Array(w * h * 4)
  const bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2)
  const bs = dxt1 ? 8 : 16
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const o = (by * bw + bx) * bs
      if (o + bs > src.length) continue
      let colors, alphas = null
      if (dxt1) {
        colors = dxtColors(src[o] | (src[o + 1] << 8), src[o + 2] | (src[o + 3] << 8), true)
      } else {
        const a0 = src[o], a1 = src[o + 1]
        alphas = new Uint8Array(8)
        alphas[0] = a0; alphas[1] = a1
        if (a0 > a1) { for (let i = 1; i <= 6; i++) alphas[1 + i] = Math.round(((7 - i) * a0 + i * a1) / 7) }
        else { for (let i = 1; i <= 4; i++) alphas[1 + i] = Math.round(((5 - i) * a0 + i * a1) / 5); alphas[6] = 0; alphas[7] = 255 }
        colors = dxtColors(src[o + 8] | (src[o + 9] << 8), src[o + 10] | (src[o + 11] << 8), false)
      }
      // 颜色索引：4 字节，每像素 2 bit（小端，逐行 4 像素）
      let ci = dxt1 ? o + 4 : o + 12
      const cbits = src[ci] | (src[ci + 1] << 8) | (src[ci + 2] << 16) | (src[ci + 3] << 24)
      let abits = 0n
      if (alphas) for (let k = 0; k < 6; k++) abits |= BigInt(src[o + 2 + k]) << BigInt(8 * k)
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px, y = by * 4 + py
          if (x >= w || y >= h) continue
          const idx = py * 4 + px
          const c = ((cbits >>> (2 * idx)) & 3) * 4
          const di = (y * w + x) * 4
          out[di] = colors[c]; out[di + 1] = colors[c + 1]; out[di + 2] = colors[c + 2]
          out[di + 3] = alphas ? alphas[Number((abits >> BigInt(3 * idx)) & 7n)] : colors[c + 3]
        }
      }
    }
  }
  return out
}

// ---------------- 主流程 ----------------
const byFile = new Map()
for (const t of tex) {
  if (!byFile.has(t.file)) byFile.set(t.file, [])
  byFile.get(t.file).push(t)
}

let done = 0, failed = []
const index = []
for (const [file, list] of byFile) {
  const resSName = file.replace(/\.assets$/, '.assets.resS')
  const resSPath = path.join(DATA, resSName)
  if (!fs.existsSync(resSPath)) continue
  const resS = fs.readFileSync(resSPath)
  let cursor = 0
  const dir = path.join(OUT, file.replace(/\.assets$/, ''))
  fs.mkdirSync(dir, { recursive: true })
  // 按在 .assets 里的出现顺序累加偏移
  list.sort((a, b) => a.at - b.at)
  for (const t of list) {
    // 优先用解析出来的偏移，越界就退回累加值
    let off = (t.off + t.size <= resS.length && t.streamSize === t.size) ? t.off : cursor
    if (off + t.size > resS.length) off = cursor
    if (off + t.size > resS.length) { failed.push(`${t.name} (超出 .resS)`); continue }
    const src = resS.subarray(off, off + t.size)
    cursor = off + t.size
    let px
    if (t.fmtName === 'DXT5') px = decodeDXT(src, t.w, t.h, false)
    else if (t.fmtName === 'DXT1') px = decodeDXT(src, t.w, t.h, true)
    else if (t.fmtName === 'RGBA32' || t.fmtName === 'ARGB32') px = src
    else if (t.fmtName === 'RGB24') {
      px = new Uint8Array(t.w * t.h * 4)
      for (let i = 0, j = 0; i < t.w * t.h; i++, j += 3) {
        px[i * 4] = src[j]; px[i * 4 + 1] = src[j + 1]; px[i * 4 + 2] = src[j + 2]; px[i * 4 + 3] = 255
      }
    } else if (t.fmtName === 'Alpha8') {
      px = new Uint8Array(t.w * t.h * 4)
      for (let i = 0; i < t.w * t.h; i++) { px[i * 4] = 255; px[i * 4 + 1] = 255; px[i * 4 + 2] = 255; px[i * 4 + 3] = src[i] }
    } else { failed.push(`${t.name} (不支持 ${t.fmtName})`); continue }
    const safe = t.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
    const f = path.join(dir, safe + '.png')
    fs.writeFileSync(f, encodePng(t.w, t.h, px))
    index.push({ file: path.relative(ROOT, f).replace(/\\/g, '/'), name: t.name, w: t.w, h: t.h, fmt: t.fmtName, from: file })
    done++
  }
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1))
console.log(`已导出 ${done} 张贴图 -> _unity_tex/`)
if (failed.length) console.log(`跳过 ${failed.length} 张：\n  ` + failed.slice(0, 10).join('\n  '))

// 按名字分类，方便找"背包框架"和"行走"
const groups = {
  '多比/角色': /多比|索亚|角色|人物|npc/i,
  '背包/道具/UI': /背包|道具|按钮|面板|框|背景|icon|button|panel|ui|界面|格子|条/i,
  '行走/动作': /行走|walk|run|move|动作|战斗|pose|动作序列/i,
}
console.log('\n按用途归类（各取前 25 条）：')
for (const [g, re] of Object.entries(groups)) {
  const hit = index.filter((x) => re.test(x.name))
  console.log(`\n【${g}】${hit.length} 张`)
  for (const h of hit.slice(0, 25)) console.log(`  ${h.name.padEnd(34)} ${h.w}x${h.h} ${h.fmt}`)
}
