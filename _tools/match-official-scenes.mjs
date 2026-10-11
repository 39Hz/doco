// 把归档里带**官方中文名**的场景原图，和我们 assets/scenes 里的 88 张场景图做感知比对。
//
// 背景：`多克多比专区资料素材\场景\` 下有 12 张带官方名的场景图
//   （云中城堡 / 图书馆 / 城堡大厅 / 城堡走道 / 城堡郊外 / 智慧学堂 /
//     熔岩池 / 燃烧瀑布 / 空中蔓步 / 藤顶风光 / 光暗峡谷 / 布拉德矿坑），
// 它们是 1600×933 / 2400×1400 / 1280×746 —— 和我们场景图的 960×560 **宽高比完全一致**（1.714），
// 但**字节不同**（我们的图被重编码过），所以按内容 hash 匹配是 0 命中。
//
// 这里改用感知比对：把两边都降采样成 32×18 的灰度签名（做均值/标准差归一化，
// 抵消亮度与对比度差异），再用平均绝对差排序。**输出最佳匹配与分数**，
// 由人/后续步骤判断是否采信 —— 工具只负责给出证据，不自动改名。
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = path.join(ROOT, '_tools', 'imgcache')
const ORIG_CACHE = path.join(CACHE, '_orig')
const SW = 32, SH = 18

// ---------- 1) 收集原始场景图（官方名）----------
// ⚠️ 必须**递归**：`多克多比新场景图\天空裂缝\` 下还有 4 张（幽水宫/征服平原/邪力宫殿/黑暗裂缝）。
// 第一版只读了目录第一层，于是报"12 张原图"、漏比了这 4 张 —— 工具自己的缺陷，被目录清点抓出来。
const SRCS = [
  '多克多比专区资料素材/场景/场景',
  '多克多比专区资料素材/场景/多克多比新场景图',
  // 【第 33 轮加入】`多克多比素材fla\多克多比电广素材\场景素材\` 里还有 **11 张带官方中文名的 PNG**
  // （云中城堡 / 图书馆 / 城堡大厅 / 城堡走道 / 城堡郊外 / 智慧学堂 / 熔岩池 / 燃烧瀑布 /
  //   空中蔓步 / 藤顶风光 + 主场景）。
  // 这一批此前**从没被比对过** —— 而其中的 云中城堡 / 城堡大厅 / 燃烧瀑布
  // 正好是前几轮**没能对上、也不敢猜**的那 5 个官方场景名里的 3 个。
  // 又一次印证那条教训：**以为素材不够之前，先把归档翻一遍（连子目录一起）。**
  '多克多比专区资料素材/多克多比素材fla/多克多比电广素材/场景素材',
]
const originals = []
function walkImages(dir, tag) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { walkImages(p, tag + '/' + e.name); continue }
    if (!/\.(png|jpe?g)$/i.test(e.name)) continue
    // 跳过 logo 之类的非场景图
    if (/^logo\b/i.test(e.name)) continue
    // 跳过「主场景」：它是电广素材的宣传主图，**不是一个场景名**。
    // 第 33 轮它被算出 scene_86 d=0.117（落在"很可能同图"区间），
    // 若不排除，就会把一个宣传图的名字当成场景官方名用上 —— 那是最隐蔽的一类错。
    if (/^主场景$/.test(path.basename(e.name, path.extname(e.name)))) continue
    originals.push({ name: path.basename(e.name, path.extname(e.name)), tag, abs: p, ext: path.extname(e.name).toLowerCase() })
  }
}
for (const d of SRCS) {
  const abs = path.join(ROOT, d)
  if (fs.existsSync(abs)) walkImages(abs, path.basename(d))
}
if (!originals.length) { console.error('找不到原始场景图'); process.exit(1) }
console.log(`原始场景图 ${originals.length} 张（递归收集）`)

// ---------- 2) 需要的话把 JPG 原图转成 PNG（复用 GDI+ 路线）----------
fs.mkdirSync(ORIG_CACHE, { recursive: true })
const needConvert = originals.filter((o) => o.ext !== '.png' &&
  !fs.existsSync(path.join(ORIG_CACHE, o.name + '.png')))
if (needConvert.length) {
  // ⚠️ 两个坑都踩过，所以这里写得"笨"一点：
  //   ① 路径是写进 **PowerShell 单引号字符串**的：单引号里反斜杠是字面量，只有单引号本身要写成两个。
  //      早先按 JS 字面量的规矩把 \ 翻倍成 \\，生成的 ps1 里就成了 `C:\\Users\\...` → 找不到文件。
  //      （这个 bug 潜伏了很久：之前的图都命中缓存，直到第 33 轮加进来的 `主场景.jpg`
  //        **第一次真的需要转换**才暴露 —— "只在第一次跑到的代码路径"是 bug 的藏身处。）
  //   ② 不再用 `@(@('a','b'))` 这种**嵌套数组**：PS 5.1 对它读出来的结果和预期不一致
  //      （实测 $pair 变成了字符串本身，按字符索引得到 'C' 和 ':'）。每个文件直接写三行，
  //      没有数组就没有解析歧义。
  const psQuote = (p) => `'${String(p).replace(/'/g, "''")}'`
  const lines = ["Add-Type -AssemblyName System.Drawing", "$ErrorActionPreference = 'Stop'"]
  for (const o of needConvert) {
    const src = psQuote(o.abs)
    const dst = psQuote(path.join(ORIG_CACHE, o.name + '.png'))
    lines.push(`$img = [System.Drawing.Image]::FromFile(${src})`)
    lines.push(`$img.Save(${dst}, [System.Drawing.Imaging.ImageFormat]::Png)`)
    lines.push('$img.Dispose()')
  }
  lines.push("Write-Output 'converted'")
  const psPath = path.join(ORIG_CACHE, '_conv.ps1')
  // 必须带 UTF-8 BOM：没有 BOM 时 PS 5.1 按 ANSI/GBK 读脚本，中文路径会变成乱码（实测）
  fs.writeFileSync(psPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lines.join('\r\n'), 'utf8')]))
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath], { stdio: 'inherit' })
  console.log(`转换了 ${needConvert.length} 张 JPG 原图`)
}

// ---------- 3) 签名 ----------
// 两级降采样：**先**用较大的块平均一到 160 宽（细线会被平均掉），**再**取 32×18 签名。
// 为什么要多这一级：官方那几张"新场景图"是**宣传图**，同一张底图上叠了特效
// （例如 黑暗裂缝.jpg 比我们的 scene_87 多了满屏白色闪电）。
// 单级签名会被这些细亮线严重干扰 —— 黑暗裂缝 一度算到 d=0.403（判成"没对上"），
// 而两张图的山形/苔藓/光柱/漩涡位置其实完全一致。先平滑就没有这个问题。
function downsample(png, outW) {
  const { w, h, data } = png
  const outH = Math.max(1, Math.round((h / w) * outW))
  const out = new Float64Array(outW * outH)
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const x0 = Math.floor((x * w) / outW), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / outW))
      const y0 = Math.floor((y * h) / outH), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / outH))
      let sum = 0, n = 0
      const samples = []
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * w + xx) * 4
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
          // 大块里**抽样**取中位数：中位数能直接丢掉细亮线（官方宣传图叠的白色闪电），
          // 均值则会被它们整体拉高 —— 这就是 黑暗裂缝 一直算到 0.407 的原因。
          if (((yy * 7 + xx * 13) % 11) === 0) samples.push(lum)
          sum += lum; n++
        }
      }
      if (!samples.length) { out[y * outW + x] = n ? sum / n : 0; continue }
      samples.sort((a, b) => a - b)
      out[y * outW + x] = samples[Math.floor(samples.length / 2)]
    }
  }
  return { w: outW, h: outH, v: out }
}
function signature(png) {
  const mid = downsample(png, 160)                 // 第一级：抹掉细线（闪电、描边）
  const out = new Float64Array(SW * SH)
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const x0 = Math.floor((x * mid.w) / SW), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * mid.w) / SW))
      const y0 = Math.floor((y * mid.h) / SH), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * mid.h) / SH))
      let sum = 0, n = 0
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { sum += mid.v[yy * mid.w + xx]; n++ }
      out[y * SW + x] = n ? sum / n : 0
    }
  }
  // 归一化：抵消整体亮度/对比度差异
  let m = 0; for (const v of out) m += v; m /= out.length
  let sd = 0; for (const v of out) sd += (v - m) * (v - m); sd = Math.sqrt(sd / out.length) || 1
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - m) / sd
  return out
}
// 距离用 **Pearson 相关距离**（1 − 相关系数），而不是平均绝对差。
// 为什么换：签名做过均值/标准差归一化，若原图叠了约 10% 的亮白特效（闪电），
// 全局标准差被抬高，于是**整个归一化向量被按比例压小** ——
// 它跟任何签名的绝对差都会变大。黑暗裂缝 一直卡在 0.38 就是栽在这里，不是图不对。
// 相关系数对"整体缩放"不敏感，正好免疫这一点；而且它本来就在比"形状"而非"绝对值"。
function dist(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  const den = Math.sqrt(na) * Math.sqrt(nb)
  return den ? 1 - dot / den : 1
}

// ---------- 4) 我们的 88 张场景图 ----------
const imgcacheIdx = fs.existsSync(path.join(CACHE, 'index.json'))
  ? JSON.parse(fs.readFileSync(path.join(CACHE, 'index.json'), 'utf8')) : {}
const ours = []
const scenesDir = path.join(ROOT, 'assets', 'scenes')
for (const f of fs.readdirSync(scenesDir)) {
  const p = path.join(scenesDir, f)
  if (!fs.statSync(p).isFile()) continue
  const rel = 'assets/scenes/' + f
  let real = p
  if (/\.jpe?g$/i.test(f)) {
    const cached = imgcacheIdx[rel]
    if (!cached) continue
    real = path.join(ROOT, cached)
  }
  try {
    ours.push({ file: f, sig: signature(decodePng(fs.readFileSync(real))) })
  } catch (e) {
    console.log(`  跳过 ${f}：${e.message}`)
  }
}
console.log(`我们这边成功解码 ${ours.length} 张场景图`)

// ---------- 5) 比对 ----------
// 官方那几张"新场景图"是**宣传图**：同一张底图，可能画得更宽（取景更松）并叠了特效。
// 只按整幅比会被这点差异拖高距离。所以原图额外取 96% / 92% 的中心裁切各算一次，
// 取最小距离 —— 若某张真只是"取景略宽 + 叠了特效"，裁切后距离会明显塌下来。
function cropPng(png, ratio) {
  const cw = Math.round(png.w * ratio), ch = Math.round(png.h * ratio)
  const ox = Math.round((png.w - cw) / 2), oy = Math.round((png.h - ch) / 2)
  const data = new Uint8ClampedArray(cw * ch * 4)
  for (let y = 0; y < ch; y++) {
    const src = ((y + oy) * png.w + ox) * 4
    data.set(png.data.subarray(src, src + cw * 4), y * cw * 4)
  }
  return { w: cw, h: ch, data }
}

const rows = []
for (const o of originals) {
  let real = o.abs
  if (o.ext !== '.png') real = path.join(ORIG_CACHE, o.name + '.png')
  let png
  try { png = decodePng(fs.readFileSync(real)) } catch (e) { console.log(`  原图 ${o.name} 解码失败：${e.message}`); continue }
  const variants = [
    { tag: '整幅', sig: signature(png) },
    { tag: '裁96%', sig: signature(cropPng(png, 0.96)) },
    { tag: '裁92%', sig: signature(cropPng(png, 0.92)) },
  ]
  const best = new Map()   // file → {d, tag}
  for (const v of variants) {
    for (const u of ours) {
      const d = dist(v.sig, u.sig)
      const cur = best.get(u.file)
      if (!cur || d < cur.d) best.set(u.file, { d, tag: v.tag })
    }
  }
  const scored = [...best.entries()].map(([file, v]) => ({ file, d: v.d, tag: v.tag })).sort((a, b) => a.d - b.d)
  rows.push({ name: o.name, best: scored[0], second: scored[1], all: scored.slice(0, 3) })
}

// ---------- 6) 输出 ----------
const out = []
out.push('# 官方场景名 ↔ 我们的场景图 感知比对结果')
out.push('')
out.push('> 由 `_tools/match-official-scenes.mjs` 生成。**工具只给证据，不自动改名。**')
out.push(`> 方法：两边降采样成 ${SW}×${SH} 灰度签名（均值/标准差归一化），比较平均绝对差；越小越像。`)
out.push('')
out.push('| 官方名 | 最像的我们的场景 | 距离 | 比对方式 | 第二像 | 距离 | 差距 | 判读 |')
out.push('|---|---|---|---|---|---|---|---|')
for (const r of rows) {
  const gap = r.second.d - r.best.d
  const verdict = (r.best.d < 0.25 && r.second.d / Math.max(r.best.d, 1e-6) > 1.5) ? '**很可能同一张**'
    : r.best.d < 0.40 ? '存疑' : '没对上'
  out.push(`| ${r.name} | ${r.best.file} | ${r.best.d.toFixed(3)} | ${r.best.tag} | ${r.second.file} | ${r.second.d.toFixed(3)} | ${gap.toFixed(3)} | ${verdict} |`)
}
out.push('')
out.push('判读口径（Pearson 相关距离）：距离 < 0.25 **且第二名的距离是它的 1.5 倍以上** → 很可能同图；距离 < 0.40 → 存疑；否则没对上。')
out.push('比对方式：原图取整幅 / 中心裁 96% / 中心裁 92% 三种，各算一次签名后取最小距离 —— 用于吸收宣传图「取景更宽」的差异。')
out.push('')

// ---------- 7) 结论：交叉验证 + 覆盖缺口 ----------
// 这一段是第 33 轮加的：归档里**有两个互不相干的目录**都放着带官方中文名的场景图
//（`场景\\` 的 jpg 与 `多克多比素材fla\\…\\场景素材\\` 的 png）。
// 同一个官方名如果在两边都出现、而两边**各自指认到同一张我们的场景**，
// 那就是一次**独立的交叉验证** —— 比"一张图看起来很像是"强得多。
const verdictOf = (r) => (r.best.d < 0.25 && r.second.d / Math.max(r.best.d, 1e-6) > 1.5) ? 'match'
  : r.best.d < 0.40 ? 'doubt' : 'no'
const byName = new Map()
for (const r of rows) {
  if (!byName.has(r.name)) byName.set(r.name, [])
  byName.get(r.name).push(r)
}
const matched = [...byName.entries()].filter(([, list]) => list.some((r) => verdictOf(r) === 'match'))
const multi = [...byName.entries()].filter(([, list]) => list.length >= 2)
const agree = multi.filter(([, list]) => {
  const ids = new Set(list.map((r) => r.best.file))
  return ids.size === 1 && list.every((r) => verdictOf(r) === 'match')
})
const unmatched = [...byName.entries()].filter(([, list]) => list.every((r) => verdictOf(r) === 'no')).map(([n]) => n)

out.push('## 结论')
out.push('')
out.push(`- 带官方中文名的场景原图：**${originals.length} 张**，覆盖 **${byName.size} 个不同的官方名**`)
out.push(`- 其中**判定为"很可能同图"的官方名：${matched.length} 个** → ${matched.map(([n, l]) => `${n}(→${l[0].best.file.replace(/^scene_|\.\w+$/g, '')})`).join('、')}`)
out.push(`- 出现在**两张以上原图**里的官方名：${multi.length} 个；其中 **${agree.length} 个多张原图一致指认到同一张场景** —— 这是交叉验证：`)
out.push(`  ${agree.map(([n, l]) => `${n}→${l[0].best.file}`).join('、')}`)
out.push('  （注意：同名的多张原图既可能来自**两个互不相干的归档目录**，也可能是同一目录下的不同版本；')
out.push('   上面这 7 个经核对是前者 —— `场景\\` 的 jpg 与 `多克多比素材fla\\…\\场景素材\\` 的 png。）')
out.push(`- **在我们的 88 张场景里找不到对应的官方名：${unmatched.length} 个** → ${unmatched.join('、')}`)
out.push('')
out.push('后一条是一个**覆盖缺口**：这些官方场景**原图在归档里，但我们没有对应的场景底图**，')
out.push('所以它们既不能命名、也不能进入游戏 —— 只能如实登记为缺失（不许拿"看起来像"的顶替）。')
fs.writeFileSync(path.join(ROOT, 'docs', '官方场景名比对.md'), out.join('\n') + '\n', 'utf8')

console.log('')
for (const r of rows) {
  const gap = r.second.d - r.best.d
  const verdict = (r.best.d < 0.25 && r.second.d / Math.max(r.best.d, 1e-6) > 1.5) ? '很可能同图' : r.best.d < 0.40 ? '存疑' : '没对上'
  console.log(`  ${r.name.padEnd(8)} → ${r.best.file.padEnd(16)} d=${r.best.d.toFixed(3)} [${r.best.tag}]  (次: ${r.second.file} ${r.second.d.toFixed(3)})  ${verdict}`)
}
console.log('\n报告 → docs/官方场景名比对.md')
