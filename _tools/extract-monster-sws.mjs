// 从「怪物」目录的 SWF 提取立绘。这里的文件名直接是怪物名（雷暴鲁巴/蛇面蝙蝠/魔化多比/幽灵/火岩…），
// 比之前 zzz/ 下的 monster_<编号>_<名字> 更直接，而且覆盖了我缺的那几只。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const OUT = path.join(ROOT, 'assets', 'monsters', 'byname')
fs.mkdirSync(OUT, { recursive: true })

// ---- SWF 解析（与 extract-swf-bitmaps.mjs 同源）----
function body(buf) {
  const sig = buf.toString('ascii', 0, 3)
  if (sig === 'FWS') return buf.subarray(8)
  if (sig === 'CWS') return zlib.inflateSync(buf.subarray(8))
  if (sig === 'ZWS') throw new Error('LZMA')
  throw new Error('未知签名 ' + sig)
}
function tagsOf(buf) {
  const b = body(buf)
  const nb = b[8] >> 3
  let p = 8 + Math.ceil((5 + nb * 4) / 8) + 4
  const out = []
  while (p + 2 <= b.length) {
    const cl = b.readUInt16LE(p); p += 2
    const code = cl >> 6
    let len = cl & 0x3f
    if (len === 0x3f) { len = b.readUInt32LE(p); p += 4 }
    if (p + len > b.length) break
    out.push({ code, data: b.subarray(p, p + len) })
    p += len
    if (code === 0) break
  }
  return out
}
function jpegDims(j) {
  for (let k = 2; k + 9 < j.length;) {
    if (j[k] !== 0xff) { k++; continue }
    const mk = j[k + 1]
    if (mk === 0xd8 || mk === 1 || (mk >= 0xd0 && mk <= 0xd7)) { k += 2; continue }
    const L = j.readUInt16BE(k + 2)
    if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) {
      return { w: j.readUInt16BE(k + 7), h: j.readUInt16BE(k + 5) }
    }
    if (L < 2) break
    k += 2 + L
  }
  return { w: 0, h: 0 }
}
function lossless(d, hasAlpha) {
  const fmt = d[2]
  const w = d.readUInt16LE(3), h = d.readUInt16LE(5)
  let p = 7, pal = null
  if (fmt === 3) {
    const n = d[p] + 1; p++
    pal = []
    for (let i = 0; i < n; i++) {
      if (hasAlpha) { pal.push([d[p + 1], d[p + 2], d[p + 3], d[p]]); p += 4 }
      else { pal.push([d[p], d[p + 1], d[p + 2], 255]); p += 3 }
    }
  }
  const comp = zlib.inflateSync(d.subarray(p))
  const rgba = new Uint8Array(w * h * 4)
  let q = 0
  if (fmt === 5) {
    for (let i = 0; i < w * h; i++) {
      const a = comp[q], r = comp[q + 1], g = comp[q + 2], b = comp[q + 3]; q += 4
      rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = hasAlpha ? a : 255
    }
  } else if (fmt === 4) {
    for (let i = 0; i < w * h; i++) {
      const v = comp[q] | (comp[q + 1] << 8); q += 2
      rgba[i * 4] = ((v >> 10) & 31) * 255 / 31 | 0
      rgba[i * 4 + 1] = ((v >> 5) & 31) * 255 / 31 | 0
      rgba[i * 4 + 2] = (v & 31) * 255 / 31 | 0
      rgba[i * 4 + 3] = 255
    }
  } else if (fmt === 3) {
    const rowB = Math.ceil(w / 4) * 4
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = pal[comp[y * rowB + x]] || [0, 0, 0, 0]
      const i = (y * w + x) * 4
      rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = c[3]
    }
  } else return null
  return { w, h, rgba }
}

// 目标目录
const DIRS = [
  path.join(ROOT, '多克多比专区资料素材', '怪物'),
  path.join(ROOT, '多克多比专区资料素材', '多克多比VIP充值素材', '怪物'),
]
const seen = new Set()
const index = {}
for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue
  for (const f of fs.readdirSync(dir)) {
    if (!/\.swf$/i.test(f)) continue
    const name = f.replace(/\.swf$/i, '').replace(/战斗/g, '').replace(/^npc\s*/, '').trim()
    if (seen.has(name)) continue
    seen.add(name)
    const p = path.join(dir, f)
    let tg
    try { tg = tagsOf(fs.readFileSync(p)) } catch (e) { console.log('  ✗ ' + f + ' ' + e.message); continue }
    const cands = []
    for (const t of tg) {
      if (t.code === 21 || t.code === 35) {
        const hdr = t.code === 35 ? 6 : 2
        const j = t.data.subarray(hdr)
        if (j.length > 4 && j[0] === 0xff && j[1] === 0xd8) {
          const d = jpegDims(j)
          if (d.w > 20 && d.h > 20) cands.push({ kind: 'jpeg', bytes: j, ...d, area: d.w * d.h })
        }
      } else if (t.code === 20 || t.code === 36) {
        try {
          const bm = lossless(t.data, t.code === 36)
          if (bm && bm.w > 20 && bm.h > 20) cands.push({ kind: 'lossless', ...bm, area: bm.w * bm.h })
        } catch (e) { }
      }
    }
    if (!cands.length) { console.log('  - ' + name.padEnd(14) + '无位图（纯矢量）'); continue }
    cands.sort((a, b) => b.area - a.area)
    const best = cands[0]
    // 取"面积最大且宽高比正常"的：宽高比 0.3~4
    const good = cands.find((c) => { const r = c.w / c.h; return r > 0.3 && r < 4 })
    const use = good || best
    const ext = use.kind === 'jpeg' ? 'jpg' : 'png'
    const file = 'assets/monsters/byname/' + name + '.' + ext
    if (use.kind === 'jpeg') fs.writeFileSync(path.join(ROOT, file), use.bytes)
    else fs.writeFileSync(path.join(ROOT, file), encodePng(use.w, use.h, use.rgba))
    index[name] = { file, w: use.w, h: use.h, kind: use.kind, candidates: cands.length }
    console.log('  ✓ ' + name.padEnd(14) + use.w + '×' + use.h + '  ' + use.kind + '  （共 ' + cands.length + ' 张位图）')
  }
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1), 'utf8')
console.log('\n提取 ' + Object.keys(index).length + ' 个 → assets/monsters/byname/')
