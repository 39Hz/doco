// 生成「道具」数据 + 图标。
//
// 数据源（官方策划表）：docs/游戏数据/资源需求文档_魔法技能及道具.xlsx
//   标签页 sheet6 标题为「战斗内道具列表及icon」，共 55 件：
//     291001~291018  旋风饼干 / 咕噜泉水 / 哈拉果冻 / 燃烧面包 / 沸腾饮料 / 奇异果实（各小中大）
//     291019         大力菠菜（3 回合攻击力提升）
//     291020~291028  初级/中级/高级 活血(红)/补气(蓝)/归元(红蓝) 药剂
//     291029~291048  攻击/防御/魔攻/魔抗 药剂 1~5 级（8 回合）
//     292001~292007  投掷型：板砖 / 炸弹 / 标枪 / 炫目之刃 / 烟雾弹 / T4炸弹 / 惊吓箱
//
// 图标：归档里只有一张消费道具图集 图片资源/icon/consum_icon_1001_1020.png。
//   它是"拼图"不是规整网格，所以按连通块切，再**人工核对**切出来的每个块是什么。
//   核对不出来的道具一律用按效果类型程序化画的兜底图标，绝不瞎指认（怪物图鉴踩过这个坑）。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const OUTDIR = path.join(ROOT, 'assets', 'items')
const SHEET = path.join(ROOT, 'docs', 'sheets')
fs.mkdirSync(OUTDIR, { recursive: true })
fs.mkdirSync(SHEET, { recursive: true })

// ---------------- 读 xlsx ----------------
function unzip(buf) {
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  const count = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)
  const out = new Map()
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break
    const method = buf.readUInt16LE(off + 10)
    const compSize = buf.readUInt32LE(off + 20)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const cmtLen = buf.readUInt32LE(off + 32)
    const localOff = buf.readUInt32LE(off + 42)
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen)
    const lNameLen = buf.readUInt16LE(localOff + 26)
    const lExtraLen = buf.readUInt16LE(localOff + 28)
    const ds = localOff + 30 + lNameLen + lExtraLen
    try { out.set(name, method === 0 ? buf.subarray(ds, ds + compSize) : zlib.inflateRawSync(buf.subarray(ds, ds + compSize))) } catch { }
    off += 46 + nameLen + extraLen + cmtLen
  }
  return out
}
const dec = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&')
const norm = (s) => String(s === undefined ? '' : s).replace(/\s+/g, ' ').trim()

function sheetRows(p, idx) {
  const zip = unzip(fs.readFileSync(p))
  const shared = []
  if (zip.has('xl/sharedStrings.xml')) {
    const x = zip.get('xl/sharedStrings.xml').toString('utf8')
    for (const si of x.match(/<si>[\s\S]*?<\/si>/g) || []) {
      shared.push([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => dec(m[1])).join(''))
    }
  }
  const files = [...zip.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()
  const sx = zip.get(files[idx]).toString('utf8')
  const rows = []
  for (const r of sx.match(/<row[^>]*>[\s\S]*?<\/row>/g) || []) {
    const cells = []
    for (const c of r.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = c[1], body = c[2]
      const ref = (attrs.match(/r="([A-Z]+)\d+"/) || [])[1] || ''
      const type = (attrs.match(/t="([^"]*)"/) || [])[1] || ''
      let val = ''
      if (type === 'inlineStr') val = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => dec(m[1])).join('')
      else { const vm = body.match(/<v>([\s\S]*?)<\/v>/); if (vm) val = type === 's' ? (shared[Number(vm[1])] ?? '') : dec(vm[1]) }
      let ci = 0
      for (const ch of ref) ci = ci * 26 + (ch.charCodeAt(0) - 64)
      cells[ci - 1 || cells.length] = val
    }
    rows.push(cells)
  }
  return rows
}

const XLSX = path.join(ROOT, 'docs', '游戏数据', '资源需求文档_魔法技能及道具.xlsx')
let raw = []
for (let i = 0; i < 12; i++) {
  let rows
  try { rows = sheetRows(XLSX, i) } catch { break }
  const n = rows.filter((r) => /^29\d{4}$/.test(norm(r[0]))).length
  if (n > raw.length) raw = rows
}
if (!raw.length) { console.error('没找到「战斗内道具列表」标签页'); process.exit(1) }

// ---------------- 解析效果 ----------------
const items = []
for (const r of raw) {
  const id = norm(r[0])
  if (!/^29\d{4}$/.test(id)) continue
  const name = norm(r[1])
  const kind = norm(r[2])          // 恢复型 / 投掷型
  const desc = norm(r[3])
  if (!name) continue
  const it = { id: Number(id), name, kind, desc, hp: 0, mp: 0, damage: 0, aoe: false, buff: null, price: 0 }

  let m
  if ((m = desc.match(/同时恢复(\d+)点生命值和(\d+)点魔法值/))) { it.hp = +m[1]; it.mp = +m[2] }
  else if ((m = desc.match(/恢复(\d+)点生命值/))) { it.hp = +m[1] }
  else if ((m = desc.match(/恢复(\d+)点魔法值/))) { it.mp = +m[1] }
  if (/三回合内，角色攻击力提高/.test(desc)) it.buff = { stat: 'atk', pct: 0.35, turns: 3 }
  if ((m = desc.match(/提升(\d+)级(攻击|防御|魔攻|魔抗)，持续(\d+)回合/))) {
    const statKey = { 攻击: 'atk', 防御: 'def', 魔攻: 'matk', 魔抗: 'mdef' }[m[2]]
    // 四舍五入到 2 位：0.10*3 会得到 0.30000000000000004，写进数据很难看
    it.buff = { stat: statKey, pct: Math.round(0.10 * Number(m[1]) * 100) / 100, turns: Number(m[3]), level: Number(m[1]) }
  }
  // 投掷型：表里没写伤害，按 ID 顺序给递增档位（标注为 derived）
  const THROW_DMG = { 292001: 0.9, 292002: 0.75, 292003: 1.05, 292004: 1.15, 292005: 0.5, 292006: 1.35, 292007: 0.40 }
  if (kind === '投掷型') {
    it.damageMul = THROW_DMG[it.id] || 0.8
    it.aoe = /范围内|目标群/.test(desc)
    if (/降低命中率/.test(desc)) it.debuff = { stat: 'hit', pct: -0.25, turns: 3 }
    if (/停顿目标一回合/.test(desc)) it.debuff = { stat: 'stun', turns: 1 }
  }
  items.push(it)
}

// 价格：官方表没写价，按效果量推（标注 derived）。
// 恢复量越大越贵；药剂类按档位；投掷型按伤害。
function priceOf(it) {
  if (it.kind === '投掷型') return Math.round(60 * (it.damageMul || 0.8) * (it.aoe ? 1.8 : 1))
  if (it.buff) return it.buff.level ? 40 * it.buff.level : 90
  const hpPart = it.hp ? Math.round(it.hp * 0.22) : 0
  const mpPart = it.mp ? Math.round(it.mp * 0.35) : 0
  return Math.max(20, Math.round((hpPart + mpPart) / 5) * 5)
}
for (const it of items) it.price = priceOf(it)

// ---------------- 图集切块 ----------------
const ATLAS = path.join(ROOT, '多克多比专区资料素材', '图片资源', 'icon', 'consum_icon_1001_1020.png')
const atlas = decodePng(fs.readFileSync(ATLAS))
function blobs(img, minPx = 60) {
  const { w, h, data } = img
  const seen = new Uint8Array(w * h)
  const out = []
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || data[s * 4 + 3] < 24) continue
    const q = [s]; seen[s] = 1
    let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0
    while (q.length) {
      const p = q.pop()
      const x = p % w, y = (p / w) | 0
      n++
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const np = ny * w + nx
        if (seen[np] || data[np * 4 + 3] < 24) continue
        seen[np] = 1; q.push(np)
      }
    }
    if (n >= minPx) out.push({ x0, y0, x1, y1, n })
  }
  return out
}
const found = blobs(atlas)
// 按几何位置认块，**不靠排序下标**。
// 早先用「|Δy|>40 算换行」的比较器排序，那不是全序，Array.sort 结果随实现变化，
// 结果沸腾饮料拿不到图集图标。这里改成按区域+横坐标认，稳定且可核对。
const cx = (b) => (b.x0 + b.x1) / 2, cy = (b) => (b.y0 + b.y1) / 2
const pickIn = (test, n) => found.filter(test).sort((a, b) => cx(a) - cx(b)).slice(0, n)
// 图集版面（肉眼核对 docs/sheets/_itematlas.png）：顶行 叶子/炸弹，第二行 板砖，
// 第三行 饼干×3 与 水瓶×3，第四行 果冻×3 与 面包×3，末行 药瓶×3。
const REGIONS = {
  leaf: pickIn((b) => cy(b) < 100 && cx(b) < 110, 1),
  bomb: pickIn((b) => cy(b) < 110 && cx(b) >= 110, 1),
  brick: pickIn((b) => cy(b) >= 90 && cy(b) < 175 && cx(b) < 150, 1),
  cookies: pickIn((b) => cy(b) >= 175 && cy(b) < 280 && cx(b) < 260, 3),
  bottles: pickIn((b) => cy(b) >= 165 && cy(b) < 285 && cx(b) >= 260, 3),
  jellies: pickIn((b) => cy(b) >= 280 && cy(b) < 380 && cx(b) < 250, 3),
  breads: pickIn((b) => cy(b) >= 280 && cy(b) < 380 && cx(b) >= 250, 3),
  potions: pickIn((b) => cy(b) >= 380, 3),
}
console.log(`图集 ${atlas.w}x${atlas.h} 切出 ${found.length} 块：` +
  Object.entries(REGIONS).map(([k, v]) => `${k}=${v.length}`).join(' '))
for (const [k, v] of Object.entries(REGIONS)) {
  if (!v.length) console.log(`  ★ 区域「${k}」没找到块，检查版面判据`)
  else console.log(`  ${k.padEnd(8)} ${v.map((b) => `(${Math.round(cx(b))},${Math.round(cy(b))})`).join(' ')}`)
}
function cropBlob(b, pad = 2) {
  const x0 = Math.max(0, b.x0 - pad), y0 = Math.max(0, b.y0 - pad)
  const x1 = Math.min(atlas.w - 1, b.x1 + pad), y1 = Math.min(atlas.h - 1, b.y1 + pad)
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1
  const d = new Uint8Array(cw * ch * 4)
  for (let y = 0; y < ch; y++) d.set(atlas.data.subarray(((y + y0) * atlas.w + x0) * 4, ((y + y0) * atlas.w + x0 + cw) * 4), y * cw * 4)
  return { w: cw, h: ch, data: d }
}
// 统一缩到 64×64（保持比例，居中）
function toIcon(img, size = 64) {
  const s = Math.min(size / img.w, size / img.h)
  const dw = Math.max(1, Math.round(img.w * s)), dh = Math.max(1, Math.round(img.h * s))
  const out = new Uint8Array(size * size * 4)
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      // 面积平均 + 预乘，避免边缘发黑
      const sx0 = Math.floor(x * img.w / dw), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * img.w / dw))
      const sy0 = Math.floor(y * img.h / dh), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * img.h / dh))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let yy = sy0; yy < sy1 && yy < img.h; yy++) for (let xx = sx0; xx < sx1 && xx < img.w; xx++) {
        const i = (yy * img.w + xx) * 4, al = img.data[i + 3] / 255
        r += img.data[i] * al; g += img.data[i + 1] * al; b += img.data[i + 2] * al; a += al; n++
      }
      if (!n) continue
      r /= n; g /= n; b /= n; a /= n
      const di = ((y + ((size - dh) >> 1)) * size + x + ((size - dw) >> 1)) * 4
      if (a > 0.001) { out[di] = Math.round(r / a); out[di + 1] = Math.round(g / a); out[di + 2] = Math.round(b / a) }
      out[di + 3] = Math.round(a * 255)
    }
  }
  return { w: size, h: size, data: out }
}
const blobIcons = new Map()
for (const [k, list] of Object.entries(REGIONS)) blobIcons.set(k, list.map((b) => toIcon(cropBlob(b))))

// 人工核对后的对应关系：图集里的哪个区域 -> 哪些道具。
// 判定依据是形状语义（叶子/砖头/炸弹/饼干/水瓶/果冻/面包/药瓶）与「小中大」的视觉大小顺序，
// 版面位置见 docs/sheets/_itematlas.png。
const MAP_ICON = [
  [['leaf'], 291019],                                    // 叶子 = 大力菠菜
  [['brick'], 292001],                                   // 板砖
  [['bomb'], 292002],                                    // 炸弹
  [['cookies', 0], 291001], [['cookies', 1], 291004], [['cookies', 2], 291007],
  [['bottles', 0], 291002], [['bottles', 1], 291005], [['bottles', 2], 291008],
  [['jellies', 0], 291003], [['jellies', 1], 291006], [['jellies', 2], 291009],
  [['breads', 0], 291010], [['breads', 1], 291013], [['breads', 2], 291016],
  [['potions', 0], 291011], [['potions', 1], 291014], [['potions', 2], 291017],
]
const iconOf = new Map()
for (const [[region, idx], id] of MAP_ICON) {
  const list = blobIcons.get(region)
  const im = list && list[idx === undefined ? 0 : idx]
  if (im) iconOf.set(id, im)
  else console.log(`  ★ 图集区域 ${region}[${idx}] 缺失，道具 ${id} 将用兜底图标`)
}

// ---------------- 兜底图标：按效果类型程序化画 ----------------
// 药剂瓶 / 果实 / 飞镖 / 箱子，用效果色区分，保证每件道具都有图，且不会张冠李戴。
function iconCanvas(size = 64) { return { w: size, h: size, data: new Uint8Array(size * size * 4) } }
function put(img, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return
  const i = (y * img.w + x) * 4
  const sa = a / 255
  const da = img.data[i + 3] / 255
  const oa = sa + da * (1 - sa)
  if (oa <= 0) return
  img.data[i] = Math.round((r * sa + img.data[i] * da * (1 - sa)) / oa)
  img.data[i + 1] = Math.round((g * sa + img.data[i + 1] * da * (1 - sa)) / oa)
  img.data[i + 2] = Math.round((b * sa + img.data[i + 2] * da * (1 - sa)) / oa)
  img.data[i + 3] = Math.round(oa * 255)
}
function fillRect(img, x, y, w, h, col) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(img, xx, yy, col[0], col[1], col[2], col[3] === undefined ? 255 : col[3])
}
function fillDisc(img, cx, cy, rx, ry, col, outline) {
  for (let yy = Math.floor(cy - ry); yy <= cy + ry; yy++) {
    for (let xx = Math.floor(cx - rx); xx <= cx + rx; xx++) {
      const dx = (xx - cx) / rx, dy = (yy - cy) / ry
      const d = dx * dx + dy * dy
      if (d > 1) continue
      if (outline && d > 0.72) put(img, xx, yy, outline[0], outline[1], outline[2], 255)
      else put(img, xx, yy, col[0], col[1], col[2], 255)
    }
  }
}
// 玻璃瓶：身体 + 瓶颈 + 高光
function bottleIcon(main, size = 64) {
  const im = iconCanvas(size)
  const dark = main.map((v) => Math.round(v * 0.55))
  const light = main.map((v) => Math.min(255, Math.round(v * 1.45 + 40)))
  fillRect(im, 26, 8, 12, 8, dark)
  fillRect(im, 27, 9, 10, 6, main)
  for (let y = 16; y < 56; y++) {
    const t = (y - 16) / 40
    const half = Math.round(9 + 11 * Math.sin(Math.min(1, t * 1.9) * Math.PI * 0.5))
    for (let x = 32 - half; x <= 32 + half; x++) {
      const edge = Math.abs(x - 32) > half - 2
      put(im, x, y, ...(edge ? dark : main))
    }
  }
  fillRect(im, 24, 26, 5, 16, light)          // 高光
  fillRect(im, 24, 20, 16, 5, [250, 250, 250]) // 标签
  return im
}
// 果实：圆身 + 叶子
function fruitIcon(main, size = 64) {
  const im = iconCanvas(size)
  const dark = main.map((v) => Math.round(v * 0.55))
  fillDisc(im, 32, 40, 20, 18, main, dark)
  fillDisc(im, 26, 34, 5, 4, [255, 255, 255, 190])
  fillRect(im, 30, 16, 4, 8, [110, 75, 40])
  fillDisc(im, 42, 18, 9, 5, [96, 200, 90], [50, 140, 50])
  return im
}
// 飞镖 / 标枪
function dartIcon(main, size = 64) {
  const im = iconCanvas(size)
  const dark = main.map((v) => Math.round(v * 0.55))
  for (let i = 0; i < 26; i++) {
    put(im, 14 + i, 50 - i, ...dark)
    put(im, 15 + i, 50 - i, ...main)
    put(im, 14 + i, 51 - i, ...main)
  }
  for (let i = 0; i < 14; i++) put(im, 40 + i, 24 - i, ...dark)
  for (let i = 0; i < 14; i++) put(im, 40 + i, 30 - i, ...main)
  return im
}
// 箱子 / 炸弹
function boxIcon(main, size = 64, bomb = false) {
  const im = iconCanvas(size)
  const dark = main.map((v) => Math.round(v * 0.55))
  if (bomb) {
    fillDisc(im, 32, 40, 19, 19, main, dark)
    fillDisc(im, 25, 33, 5, 5, [255, 255, 255, 170])
    fillRect(im, 34, 18, 4, 7, [70, 70, 70])
    for (let i = 0; i < 6; i++) put(im, 40 + i, 16 - (i > 3 ? 6 - i : 0), 255, 190, 60)
  } else {
    fillRect(im, 12, 22, 40, 32, main)
    fillRect(im, 12, 22, 40, 5, dark)
    fillRect(im, 12, 49, 40, 5, dark)
    fillRect(im, 29, 22, 6, 32, dark)
    fillRect(im, 12, 36, 40, 4, dark)
  }
  return im
}
// 档位点：在图标底部画 1~5 个小方块，让 1~5 级药剂一眼能区分
function tierPips(img, n, col) {
  if (!n) return
  const w = 7, gap = 2
  const total = n * w + (n - 1) * gap
  const x0 = Math.round((img.w - total) / 2)
  for (let i = 0; i < n; i++) fillRect(img, x0 + i * (w + gap), img.h - 8, w, 5, col)
}
const FALLBACK = {
  heal: (it) => bottleIcon(it.mp && !it.hp ? [90, 170, 255] : it.hp && it.mp ? [190, 110, 235] : [255, 110, 110]),
  buff: (it) => {
    const c = { atk: [255, 140, 60], def: [120, 190, 255], matk: [200, 120, 255], mdef: [110, 220, 190] }[it.buff && it.buff.stat] || [200, 200, 200]
    return fruitIcon(c)
  },
  throw: (it) => (/炸弹/.test(it.name) ? boxIcon([80, 80, 95], 64, true)
    : /惊吓箱/.test(it.name) ? boxIcon([190, 140, 70])
      : /烟雾/.test(it.name) ? boxIcon([150, 150, 160])
        : dartIcon([220, 200, 120])),
}
for (const it of items) {
  if (iconOf.has(it.id)) continue
  let im
  if (it.kind === '投掷型') im = FALLBACK.throw(it)
  else if (it.buff) im = FALLBACK.buff(it)
  else if (/果实/.test(it.name)) {
    // 奇异果实是"果实"，不该画成药瓶
    const c = it.hp && it.mp ? [235, 140, 90] : it.mp ? [120, 175, 255] : [255, 130, 120]
    im = fruitIcon(c)
  } else im = FALLBACK.heal(it)
  // 药剂的档位（1~5 级 / 小中大）用底部点数标出来
  const lv = it.buff && it.buff.level ? it.buff.level
    : (/（大）/.test(it.name) ? 3 : /（中）/.test(it.name) ? 2 : /（小）/.test(it.name) ? 1
      : /高级/.test(it.name) ? 3 : /中级/.test(it.name) ? 2 : /初级/.test(it.name) ? 1 : 0)
  tierPips(im, lv, [255, 225, 120])
  iconOf.set(it.id, im)
}

// ---------------- 写文件 ----------------
for (const it of items) {
  const im = iconOf.get(it.id)
  it.icon = 'assets/items/item_' + it.id + '.png'
  fs.writeFileSync(path.join(OUTDIR, 'item_' + it.id + '.png'), encodePng(im.w, im.h, im.data))
}
const out = {
  generated: new Date().toISOString(),
  note: '名称/描述/效果来自官方策划表「战斗内道具列表及icon」（资源需求文档_魔法技能及道具.xlsx sheet6）。' +
    '价格与投掷型伤害表中未给，按效果量推导（price/damageMul）。' +
    '图标：图集 consum_icon_1001_1020.png 切块后人工核对得到，核对不出的用按效果类型程序化绘制的兜底图标。',
  source: 'docs/游戏数据/资源需求文档_魔法技能及道具.xlsx',
  counts: { items: items.length, atlasIcon: iconOf.size, drawn: items.length - iconOf.size },
  items,
}
fs.writeFileSync(path.join(ROOT, 'assets', 'items.js'),
  '/* 自动生成，勿手改。重跑 _tools/gen-items.mjs */\n' +
  'window.__DKDbb_ITEMS__ = ' + JSON.stringify(out) + ';\n')
console.log(`已生成 ${items.length} 件道具 -> assets/items.js + assets/items/*.png`)
console.log(`  其中 ${MAP_ICON.length} 件用官方图集图标，${items.length - MAP_ICON.length} 件用程序化兜底图标`)

// ---------------- 对照表（人工核对） ----------------
const COLS = 8, CELL = 84, PAD = 6
const rows = Math.ceil(items.length / COLS)
const W = COLS * (CELL + PAD) + PAD, H = rows * (CELL + PAD) + PAD
const sheet = { w: W, h: H, data: new Uint8Array(W * H * 4) }
for (let i = 3; i < sheet.data.length; i += 4) sheet.data[i] = 255
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4
  const cell = ((y / (CELL + PAD)) | 0) * COLS + ((x / (CELL + PAD)) | 0)
  const bg = cell % 2 ? [40, 56, 76] : [30, 42, 58]
  sheet.data[i] = bg[0]; sheet.data[i + 1] = bg[1]; sheet.data[i + 2] = bg[2]
}
items.forEach((it, i) => {
  const cx = PAD + (i % COLS) * (CELL + PAD), cy = PAD + ((i / COLS) | 0) * (CELL + PAD)
  const im = iconOf.get(it.id)
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const si = (y * im.w + x) * 4
    if (im.data[si + 3] < 8) continue
    const dx = cx + x + ((CELL - im.w) >> 1), dy = cy + y
    if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue
    put(sheet, dx, dy, im.data[si], im.data[si + 1], im.data[si + 2], im.data[si + 3])
  }
})
fs.writeFileSync(path.join(SHEET, '_items.png'), encodePng(W, H, sheet.data))
console.log('道具图标总表 -> docs/sheets/_items.png（8 列，顺序如下）')
items.forEach((it, i) => console.log(`  ${String(i + 1).padStart(2)} ${it.id} ${it.name.padEnd(14)} ${it.kind} ` +
  `${it.hp ? 'HP+' + it.hp + ' ' : ''}${it.mp ? 'MP+' + it.mp + ' ' : ''}${it.buff ? 'buff:' + it.buff.stat + '+'+Math.round(it.buff.pct*100)+'%/'+it.buff.turns+'T ' : ''}` +
  `${it.damageMul ? 'dmg×' + it.damageMul + (it.aoe ? '(群)' : '') + ' ' : ''}价 ${it.price}`))
