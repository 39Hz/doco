// 解析 Unity 版《多克多比》的贴图表。
//
// 为什么这么做：用户说这份包里"有人物行走动作、背包框架"，让我借鉴。
// 但 Unity 发布版剥掉了类型树，硬按字段偏移解很容易踩版本差异。
//
// 这里用的是**自校验**的解析法：Texture2D 头部的几个字段是
//     [名字长度][名字][宽][高][数据字节数][mips][格式][mip数]
// 而「数据字节数」必须等于按(宽,高,格式)算出来的大小（DXT5 每 4×4 块 16 字节等）。
// 只有算得上才认这一条 —— 这样就不会把二进制噪声当成字段。
//
// 最后再做一次全局校验：所有贴图的字节数之和应当≈ .resS 的实际大小。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const DATA = path.join(ROOT, '多克多比-2026.2', '多克多比_Data')

// Unity TextureFormat -> 每像素/每块的字节数
const FORMATS = {
  1: { name: 'Alpha8', bytes: (w, h) => w * h },
  2: { name: 'ARGB4444', bytes: (w, h) => w * h * 2 },
  3: { name: 'RGB24', bytes: (w, h) => w * h * 3 },
  4: { name: 'RGBA32', bytes: (w, h) => w * h * 4 },
  5: { name: 'ARGB32', bytes: (w, h) => w * h * 4 },
  7: { name: 'RGB565', bytes: (w, h) => w * h * 2 },
  10: { name: 'DXT1', bytes: (w, h) => Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * 8 },
  12: { name: 'DXT5', bytes: (w, h) => Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * 16 },
  47: { name: 'ETC2_RGB', bytes: (w, h) => Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * 8 },
  48: { name: 'ETC2_RGBA8', bytes: (w, h) => Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * 16 },
  63: { name: 'ASTC_RGB_4x4', bytes: (w, h) => Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * 16 },
  64: { name: 'ASTC_RGBA_4x4', bytes: (w, h) => Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * 16 },
}

// Texture2D 在 Unity 2023（SerializedFile v22）里的字段顺序，实测自这份包：
//   [u32 名字长度][名字][对齐] [u32 ForcedFallbackFormat] [宽][高][数据字节数][mipsStripped][格式][mip数]
//   ...若干 bool/int 设置...
//   [u64 流偏移][u32 流长度][u32 路径长度][路径][对齐]  ← 下一张表开始
// 「数据字节数」必须等于按(宽,高,格式)算出来的大小，这个自校验能挡掉绝大多数误判。
function parseAssets(file) {
  const buf = fs.readFileSync(path.join(DATA, file))
  const out = []
  for (let i = 0; i + 64 < buf.length; i++) {
    const nameLen = buf.readUInt32LE(i)
    if (nameLen < 3 || nameLen > 80) continue
    const ns = i + 4
    if (ns + nameLen > buf.length) continue
    const name = buf.toString('utf8', ns, ns + nameLen)
    if (!/^[\x20-\x7e\u4e00-\u9fff_\-()（）]+$/.test(name)) continue
    if (/resS$|\.assets$|CAB-/.test(name)) continue
    const p = (ns + nameLen + 3) & ~3
    if (p + 28 > buf.length) continue
    const w = buf.readUInt32LE(p + 4), h = buf.readUInt32LE(p + 8)
    const size = buf.readUInt32LE(p + 12)
    const fmt = buf.readUInt32LE(p + 20)
    const mips = buf.readUInt32LE(p + 24)
    if (w < 2 || h < 2 || w > 8192 || h > 8192) continue
    if (!FORMATS[fmt]) continue
    if (size !== FORMATS[fmt].bytes(w, h)) continue        // ★ 自校验
    if (mips < 1 || mips > 16) continue
    // 往后找 .resS 路径（m_StreamData），紧邻它前面的 8 字节是 偏移 + 长度
    let resS = null, off = 0, streamSize = 0
    for (let q = p + 28; q < Math.min(buf.length - 8, p + 200); q++) {
      const pl = buf.readUInt32LE(q)
      if (pl < 8 || pl > 120) continue
      const ps = q + 4
      if (ps + pl > buf.length) continue
      const s = buf.toString('latin1', ps, ps + pl)
      if (!/\.resS$/.test(s)) continue
      resS = s.split('/').pop()
      streamSize = buf.readUInt32LE(q - 4)
      off = buf.readUInt32LE(q - 8)
      break
    }
    out.push({ at: i, name, w, h, size, fmt, fmtName: FORMATS[fmt].name, mips, resS, off, streamSize })
  }
  return out
}

const all = []
for (const f of fs.readdirSync(DATA).filter((x) => /\.assets$/.test(x)).sort()) {
  const list = parseAssets(f)
  if (!list.length) continue
  const sum = list.reduce((a, b) => a + b.size, 0)
  const resS = path.join(DATA, f.replace(/\.assets$/, '.assets.resS'))
  const resSSize = fs.existsSync(resS) ? fs.statSync(resS).size : 0
  console.log(`${f.padEnd(26)} 贴图 ${String(list.length).padStart(4)} 张   ` +
    `数据合计 ${(sum / 1048576).toFixed(1)} MB   .resS ${(resSSize / 1048576).toFixed(1)} MB   ` +
    (resSSize ? `占比 ${(100 * sum / resSSize).toFixed(0)}%` : ''))
  for (const t of list) all.push({ file: f, ...t })
}
console.log(`\n合计识别出 ${all.length} 张贴图`)
console.log('格式分布：')
const byFmt = new Map()
for (const t of all) byFmt.set(t.fmtName, (byFmt.get(t.fmtName) || 0) + 1)
for (const [k, v] of [...byFmt].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(14)} ${v}`)
console.log('\n名字里带"多比/行走/walk/背包/道具/战斗"的：')
for (const t of all.filter((x) => /多比|行走|walk|背包|道具|战斗|bag|fight/i.test(x.name)).slice(0, 40)) {
  console.log(`  ${x_name(t)}`)
}
function x_name(t) { return `${t.name.padEnd(30)} ${t.w}x${t.h} ${t.fmtName.padEnd(12)} ${t.size} 字节  (${t.file})` }
fs.writeFileSync(path.join(ROOT, '_tools', '_unity_textures.json'), JSON.stringify(all, null, 1))
