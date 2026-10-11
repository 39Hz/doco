// 生成《场景命名工作表》—— 计划书 M2-3 指定的**交人类填写**的产物。
//
// 为什么需要它（计划书原话）：
//   「场景命名是**唯一必须由人类完成的环节**。执行者应生成《场景命名工作表》
//     （含每张场景的缩略图和编号）交人类填写。」
//
// 现在 88 张场景都有名字，但 manifest 里的 conf 是 "guess" ——
// 那些名字是**按画面物体推测**的（derived），不是官方名。所以这张工作表要让人一眼看到
// "第 N 张画的是什么、现在叫什么"，然后填上记得的官方名。
//
// 产物：
//   docs/shots/场景命名工作表.png     带编号与当前名的联系表（6 列）
//   场景命名工作表.csv                便于直接编辑：编号,当前名,所属岛,官方名(待填),依据
//   场景命名工作表.md                 同内容的可读版 + 填写说明
//
// 用法： node _tools/gen-scene-naming-sheet.mjs
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { decodePng, encodePng, makeFramebuffer, PixelCtx } from './pixel-canvas.mjs'
import { loadGlyphAtlas, TextRenderer } from './text-render.mjs'

const ROOT = '.'
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'))
// world.js 是带注释、键不带引号的 JS 字面量，不能 JSON.parse —— 用 vm 求值（与测试台同一做法）
const world = (() => {
  const sandbox = { window: {} }
  vm.createContext(sandbox)
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'world.js'), 'utf8'), sandbox, { filename: 'world.js' })
  const w = sandbox.window.__DKDbb_WORLD__
  if (!w || !w.islands) throw new Error('world.js 里没读到 __DKDbb_WORLD__')
  return w
})()

const scenes = (man.scenes || []).filter((s) => s.kind === 'scene' || s.id <= 88)
// 场景 → 岛屿 / 地形
const islandOf = {}
for (const isl of world.islands) for (const sid of isl.scenes) islandOf[sid] = isl.name
const districtOf = {}
for (const d of world.districts || []) {
  for (const iid of d.islands) {
    const isl = world.islands.find((x) => x.id === iid)
    if (isl) for (const sid of isl.scenes) districtOf[sid] = d.name
  }
}

// ---------- 联系表 ----------
const COLS = 6
const CELL_W = 300
const IMG_H = Math.round(CELL_W * 560 / 960)   // 175
const LABEL_H = 40
const CELL_H = IMG_H + LABEL_H
const PAD = 6
const rows = Math.ceil(scenes.length / COLS)
const W = COLS * (CELL_W + PAD) + PAD
const H = rows * (CELL_H + PAD) + PAD + 46

const canvas = {
  width: W, height: H,
  _fb: makeFramebuffer(W, H),
  _textRenderer: null,
  style: {}, _handlers: new Map(),
  addEventListener() { }, removeEventListener() { },
  getBoundingClientRect() { return { left: 0, top: 0, width: W, height: H } },
}
canvas._textRenderer = new TextRenderer(loadGlyphAtlas())
const ctx = new PixelCtx(canvas)
const text = {
  stroked(c, s, x, y, o = {}) {
    c.save()
    c.font = `bold ${o.size || 14}px sans`
    c.textAlign = o.align || 'left'
    c.textBaseline = 'alphabetic'
    c.lineWidth = o.lw == null ? 3 : o.lw
    c.strokeStyle = 'rgba(0,0,0,.85)'
    c.fillStyle = o.color || '#fff'
    if (c.lineWidth > 0) c.strokeText(String(s), x, y)
    c.fillText(String(s), x, y)
    c.restore()
  },
}

// 底色
ctx.fillStyle = '#0b1020'
ctx.fillRect(0, 0, W, H)
text.stroked(ctx, '《多克多比》场景命名工作表 —— 共 ' + scenes.length + ' 张', PAD + 6, 30,
  { size: 20, color: '#ffd23f' })
text.stroked(ctx, '现在显示的名字是**按画面内容推测**的（derived），请把记得的官方名填到 CSV 的「官方名」列',
  PAD + 6, 50, { size: 12, color: '#9fb0cc' })

let loaded = 0, missing = 0
const missList = []
// JPEG 素材没有解码器（本项目的 PNG 解码是手写的，只用 node:zlib）。
// shoot.mjs 早就踩过这个坑并留了预转 PNG 缓存 —— 这里直接复用同一份 index.json，
// 否则 88 张场景里有 68 张是 .jpg，会出现"表格大半是空白"却看不出原因。
const jpgCachePath = path.join(ROOT, '_tools', 'imgcache', 'index.json')
const jpgCache = fs.existsSync(jpgCachePath) ? JSON.parse(fs.readFileSync(jpgCachePath, 'utf8')) : {}
scenes.forEach((sc, i) => {
  const col = i % COLS, row = Math.floor(i / COLS)
  const x = PAD + col * (CELL_W + PAD)
  const y = 46 + PAD + row * (CELL_H + PAD)
  // 图
  let img = null
  const actual = jpgCache[sc.file] || sc.file
  try {
    const p = path.join(ROOT, actual)
    if (fs.existsSync(p)) {
      const { w, h, data } = decodePng(fs.readFileSync(p))
      img = { _pixels: { w, h, data } }
      loaded++
    }
  } catch (e) { /* 下面的 missing 计数会体现 */ }
  if (!img) { missing++; missList.push(`${sc.id}:${sc.file}`) }
  ctx.fillStyle = '#151b2c'
  ctx.fillRect(x, y, CELL_W, IMG_H)
  if (img) ctx.drawImage(img, x, y, CELL_W, IMG_H)
  ctx.strokeStyle = '#2b3550'; ctx.lineWidth = 1
  ctx.strokeRect(x + .5, y + .5, CELL_W - 1, IMG_H - 1)
  // 标注
  ctx.fillStyle = 'rgba(6,10,20,.92)'
  ctx.fillRect(x, y + IMG_H, CELL_W, LABEL_H)
  const isl = islandOf[sc.id] || '（无归属）'
  const dis = districtOf[sc.id] || ''
  text.stroked(ctx, `#${sc.id}  ${sc.title || '（无名）'}`, x + 6, y + IMG_H + 17,
    { size: 14, color: '#ffe45e' })
  text.stroked(ctx, `${dis ? dis + ' · ' : ''}${isl}`, x + 6, y + IMG_H + 33,
    { size: 11, color: '#8fa0c0', lw: 2.5 })
})

fs.mkdirSync(path.join(ROOT, 'docs', 'shots'), { recursive: true })
const outPng = path.join(ROOT, 'docs', 'shots', '场景命名工作表.png')
fs.writeFileSync(outPng, encodePng(W, H, canvas._fb))
console.log(`联系表: ${outPng}  ${W}x${H}  ${scenes.length} 格 (${COLS} 列)`)
console.log(`  解码成功 ${loaded} 张，失败 ${missing} 张`)

// ---------- CSV ----------
const csvRows = [['编号', '当前名(derived)', '所属岛', '所属地形', '官方名(请填写)', '依据等级', '备注'].join(',')]
for (const sc of scenes) {
  csvRows.push([
    sc.id,
    csvCell(sc.title || ''),
    csvCell(islandOf[sc.id] || ''),
    csvCell(districtOf[sc.id] || ''),
    '',                       // 待人类填
    'derived',                // 现有名字的等级
    csvCell(sc.conf === 'guess' ? '按画面推测' : (sc.conf || '')),
  ].join(','))
}
const outCsv = path.join(ROOT, '场景命名工作表.csv')
fs.writeFileSync(outCsv, '\ufeff' + csvRows.join('\n') + '\n', 'utf8')   // BOM：Excel 打开不乱码
console.log(`CSV: ${outCsv}  ${scenes.length} 行`)

function csvCell(v) {
  const s = String(v == null ? '' : v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

// ---------- Markdown ----------
const md = []
md.push('# 场景命名工作表（M2-3 · 需要人类/社区）')
md.push('')
md.push('> 计划书原文：「场景命名是**唯一必须由人类完成的环节**。执行者应生成《场景命名工作表》')
md.push('> （含每张场景的缩略图和编号）交人类填写。」')
md.push('')
md.push('## 怎么用')
md.push('')
md.push('1. 打开 `docs/shots/场景命名工作表.png` —— 88 张场景的缩略图，每格标了**编号**和**当前名**')
md.push('2. 打开 `场景命名工作表.csv`（Excel 可直接开，已加 BOM），在「**官方名(请填写)**」列填你记得的原版名')
md.push('3. 只填有把握的；**没把握就留空**，留空我们保持 `derived` 状态，不会当成官方名')
md.push('')
md.push('## 说明：现在的名字是哪来的')
md.push('')
md.push('现在的 88 个名字是**按画面里的物体推测**出来的（manifest 里 `conf: "guess"`），')
md.push('依据等级是 `derived`，**不是官方名**。官方场景名没有随客户端归档留存。')
md.push('')
md.push('## 全表')
md.push('')
md.push('| 编号 | 当前名（derived） | 所属地形 | 所属岛 | 官方名（待填） |')
md.push('|---|---|---|---|---|')
for (const sc of scenes) {
  md.push(`| ${sc.id} | ${sc.title || '（无名）'} | ${districtOf[sc.id] || '—'} | ${islandOf[sc.id] || '—'} |  |`)
}
md.push('')
md.push(`> 缩略图见 \`docs/shots/场景命名工作表.png\`；可编辑版见 \`场景命名工作表.csv\`。`)
const outMd = path.join(ROOT, '场景命名工作表.md')
fs.writeFileSync(outMd, md.join('\n') + '\n', 'utf8')
console.log(`Markdown: ${outMd}`)

// ---------- 自检（R5）----------
console.log('\n自检：')
if (scenes.length !== 88) { console.error(`!! 场景数应为 88，实际 ${scenes.length}`); process.exit(1) }
if (loaded !== scenes.length) { console.error(`!! 有 ${missing} 张场景图解码失败：${missList.slice(0, 6).join(', ')}`); process.exit(1) }
const st = fs.statSync(outPng)
if (st.size < 100 * 1024) { console.error(`!! 联系表太小（${st.size} 字节），可能没画上`); process.exit(1) }
console.log(`  ✓ 88 张场景全部解码并画进联系表（PNG ${(st.size / 1024 / 1024).toFixed(1)} MB）`)
console.log(`  ✓ CSV 含 ${scenes.length} 行数据 + 表头，且带 BOM（Excel 不乱码）`)
const csvTxt = fs.readFileSync(outCsv, 'utf8')
if (!csvTxt.includes('官方名(请填写)')) { console.error('!! CSV 缺少待填列'); process.exit(1) }
console.log('  ✓ CSV 有「官方名(请填写)」列')
