// 用「外观相近的官方立绘」替换缺立绘的怪物。
//
// 事实基础（都已实测）：
//   · 怪兽表 36 只里，14 只在图鉴里有编号可核对的立绘 → 已精确对上
//   · 其余 22 只：官方图鉴里是「? 取消/暂缓/制作中」的空占位；
//     FLA/SWF 里 19 只是纯矢量（没有位图），没有任何可用立绘
//   · 但归档里有 21 只**完整的高质量立绘**没被用上：
//       图鉴里未使用的真立绘 11 只（110024/025/026/030、119017/018/020/021/022/023/024）
//       「怪物大全.png」10 只（另有 2 只只有 50px，太小，丢弃）
//
// 方案：把缺立绘的怪按「元素 + 体型档位 + 外观」匹配到这些备选立绘上，
// 并在 map.json 与使用说明里明确标注哪些是替换素材，不冒充原作。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const M = path.join(ROOT, 'assets', 'monsters')
const gd = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'gamedata.json'), 'utf8'))

// ---- 1) 已有的 14 只精确立绘（图鉴编号已核对） ----
const PRECISE = {
  10002: 110002, 10003: 110003, 10005: 110005, 10006: 110006, 10007: 110007,
  10009: 110009, 10010: 110010, 10011: 110011, 10013: 110013, 10015: 110015,
  10022: 110022, 10023: 110023, 19008: 119008, 19012: 119012,
}
const png = decodePng(fs.readFileSync(path.join(ROOT, '多克多比专区资料素材', 'npc大全', '怪物图鉴.png')))
const { w: PW, data: PD } = png
const pairs = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', '_pairs.json'), 'utf8'))
const slots = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', '_atlas_slots.json'), 'utf8'))
const slotByAtlas = new Map(slots.map((s) => [s.atlas, s]))

// ---- 2) 备选立绘池 ----
const pool = []
// 精确立绘占用的图鉴格子（替换阶段必须避开）
const precisePairIdx = new Set()
for (const atlasId of Object.values(PRECISE)) {
  const s = slotByAtlas.get(atlasId)
  if (s) precisePairIdx.add(s.k)
}
// 2a. 图鉴里未使用的真立绘
for (const s of slots) {
  if (s.ghost) continue
  if (Object.values(PRECISE).includes(s.atlas)) continue
  // 关键：把"已经作为精确立绘用掉"的图鉴格子也排除。
  // 之前没排除，替换阶段又选中了同一格，结果精确立绘被别的怪顶掉（赛罗特/托米拉变成空占位）。
  if (precisePairIdx.has(s.k)) continue
  if (!s.atlas) continue
  pool.push({
    id: 'atlas' + s.atlas, kind: 'atlas', atlasId: s.atlas, pair: s.k,
    w: s.w, h: s.h, area: s.w * s.h,
    label: '图鉴' + s.atlas,
  })
}
// 2b. 怪物大全里够大的（先只收 >100px；50px 的两个留作最后补位）
const daquanMeta = JSON.parse(fs.readFileSync(path.join(M, 'daquan', 'meta.json'), 'utf8'))
const daquanTiny = []
for (const d of daquanMeta) {
  if (d.w < 100 || d.h < 100) { daquanTiny.push(d); continue }
  pool.push({
    id: 'daquan' + d.k, kind: 'daquan', file: d.file,
    w: d.w, h: d.h, area: d.w * d.h,
    label: '怪物大全#' + d.k,
  })
}
// 2c. SWF 提取的「幽灵」：黑底，用"把接近黑的像素变透明"的方式洗一遍再用
{
  const gp = path.join(M, 'byname', '幽灵.png')
  if (fs.existsSync(gp)) {
    const p = decodePng(fs.readFileSync(gp))
    let cleared = 0
    for (let i = 0; i < p.data.length; i += 4) {
      const lum = p.data[i] + p.data[i + 1] + p.data[i + 2]
      if (lum < 70) { p.data[i + 3] = 0; cleared++ }
    }
    // 洗完后重新算内容框
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      if (p.data[(y * p.w + x) * 4 + 3] < 40) continue
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
    if (maxX > minX + 40) {
      const tw = maxX - minX + 1, th = maxY - minY + 1
      const sub = new Uint8Array(tw * th * 4)
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        const si = ((minY + y) * p.w + (minX + x)) * 4
        const di = (y * tw + x) * 4
        sub[di] = p.data[si]; sub[di + 1] = p.data[si + 1]; sub[di + 2] = p.data[si + 2]; sub[di + 3] = p.data[si + 3]
      }
      const outFile = path.join(M, 'byname', '幽灵_clean.png')
      fs.writeFileSync(outFile, encodePng(tw, th, sub))
      pool.push({ id: 'swf幽灵', kind: 'daquan', file: 'assets/monsters/byname/幽灵_clean.png', w: tw, h: th, area: tw * th, label: 'SWF幽灵（已抠黑底）' })
      console.log('  幽灵：抠掉 ' + cleared + ' 个黑底像素，内容框 ' + tw + '×' + th + '，已入池')
    } else {
      console.log('  （幽灵抠底后内容太少，不入池）')
    }
  }
}
console.log('备选立绘池: ' + pool.length + ' 个')
pool.forEach((p) => console.log('  ' + p.id.padEnd(14) + p.w + '×' + p.h + '  (' + p.label + ')'))

// ---- 3) 需要替换的怪 ----
const need = gd.monsters.filter((m) => !PRECISE[Number(m.id)]).map((m) => ({
  id: Number(m.id), name: m.name, element: m.element || '无', size: Number(m.size) || 90,
}))
console.log('\n需要替换的怪: ' + need.length + ' 只')

// 按体型档位匹配（立绘面积从大到小），同档内按顺序取。
// 这样至少保证"大怪配大立绘、小怪配小立绘"，战斗里缩放后观感一致。
need.sort((a, b) => b.size - a.size)
pool.sort((a, b) => b.area - a.area)

// 手工微调：让元素/气质尽量贴合（键是怪物名，值是 pool id）。
// 这些优先级**高于**体型档位兜底 —— 否则会被 size-band 覆盖掉。
const PREFER = {
  熔岩怪: 'daquan5',      // 5 = 火焰岩石人 → 火系
  火球怪: 'daquan4',      // 4 = 黏滑小怪 → 小型火系
  雷暴鲁巴: 'daquan3',     // 3 = 蓝翼红蛇 → 火/毒系 BOSS
  蛇面蝙蝠: 'daquan3',
  莎恩: 'daquan6',        // 6 = 紫发幽灵女 → 暗系
  怨灵: 'daquan6',
  大幽灵: 'daquan6',
  魔化多比: 'daquan2',     // 2 = 紫褐恐龙 → 暗系 BOSS
  魔化河伯: 'daquan1',     // 1 = 木桶怪 → 水系 BOSS
  哈拉兽: 'daquan8',      // 8 = 橙毛狮 → 土系
  猎犬酥皮: 'daquan8',
  妮可鼠: 'daquan9',      // 9 = 树精 → 光/毒系小怪
  暗影孢子: 'daquan9',
  大蘑菇: 'daquan9',
  贪食花: 'daquan9',
  八爪鱼: 'daquan4',
  赛贝猪: 'daquan4',
  卢比兽: 'daquan4',
  萨西怪: 'daquan7',      // 7 = 绿冠史莱姆 → 火系小怪
  翼纹喵: 'daquan8',
  堕落天使: 'daquan0',     // 0 = 橙红机械蜘蛛 → 暗系 BOSS（造型最复杂）
  螳螂阿力: 'daquan0',
}
// 冲突：同一个 pool id 被多只怪想要时，先到先得（need 已按尺寸从大到小排序）
const used = new Set()
const assign = {}
for (const mon of need) {
  const prefer = PREFER[mon.name]
  const cand = prefer ? pool.find((p) => p.id === prefer && !used.has(p.id)) : null
  if (cand) { assign[mon.id] = cand; used.add(cand.id) }
}
// 剩下的（含被抢走的）按体型档位兜底
const rest = need.filter((m) => !assign[m.id])
const free = pool.filter((p) => !used.has(p.id))
rest.forEach((mon, i) => {
  if (!free.length) return
  const idx = rest.length === 1 ? 0 : Math.round(i * (free.length - 1) / (rest.length - 1))
  const pick = free.splice(Math.min(free.length - 1, idx), 1)[0]
  assign[mon.id] = pick
  used.add(pick.id)
})
// 补位：怪物大全里那两个 50px 的小碎片**不要**入池 ——
// 它们小到放进战斗画面里像一个图标，比"用旧素材"还差。
// （曾经把它们当补位用，结果赛贝猪分到了 48×59 的小火苗。）
// 需要补位时改为回退 m_*.png。

// ---- 4) 落地：把选中的立绘导出成 mon_<id>.png ----
// 加一道"去重"：同一张立绘不允许分给两只怪（否则战斗里会出现两只一模一样的怪）。
// 用文件内容的 MD5 判重，冲突时按体型档位换一个没被用过的。
const OUT = path.join(M, 'labeled')
fs.mkdirSync(OUT, { recursive: true })
const usedHash = new Map()   // md5 -> 怪物id
const usedAtlasPair = new Set()   // 已用掉的图鉴格子（按 pairs 下标）
// 用真 MD5，不要用"取几个字节算个整数"这种自制 hash ——
// 它对图鉴里的空白占位图会误判成同一个，于是去重逻辑把真立绘换成了空图。
function hashOf(buf) { return crypto.createHash('md5').update(buf).digest('hex') }
function writeFromAtlas(p, dest) {
  const pr = pairs[p.pair]
  if (!pr) return null
  const a = pr.art
  const out = new Uint8Array(a.w * a.h * 4)
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      const si = ((a.y + y) * PW + (a.x + x)) * 4
      const di = (y * a.w + x) * 4
      out[di] = PD[si]; out[di + 1] = PD[si + 1]; out[di + 2] = PD[si + 2]; out[di + 3] = PD[si + 3]
    }
  }
  const png = encodePng(a.w, a.h, out)
  // 保险：切出来若是"问号幽灵"空占位（纯灰、饱和度≈0），返回 null 让调用方回退旧素材。
  // 需要这道检查的原因：_atlas_slots.json 与 _pairs.json 的下标不同源
  //（两个脚本、不同参数生成的），偶尔会取到相邻的空格子，
  // 表现就是"本来有立绘的怪变成一片灰影"。
  let satSum = 0, n = 0
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] < 40) continue
    const r = out[i], g = out[i + 1], b = out[i + 2]
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    satSum += mx === 0 ? 0 : (mx - mn) / mx
    n++
  }
  const sat = n ? satSum / n : 0
  if (sat < 0.07 || n < 200) return null   // 饱和度近 0 或像素太少 → 判为空占位图
  fs.writeFileSync(dest, png)
  return hashOf(png)
}
// 旧素材回退（m_*.png）
function fallbackSprite(gid) {
  const old = JSON.parse(fs.readFileSync(path.join(M, 'm-fallback.json'), 'utf8'))
  const f = old[String(gid)]
  if (!f) return null
  const src = path.join(ROOT, f)
  if (!fs.existsSync(src)) return null
  const dest = path.join(M, 'labeled', 'mon_' + gid + '.png')
  const buf = fs.readFileSync(src)
  fs.writeFileSync(dest, buf)
  return hashOf(buf)
}
const map = {}
const detail = []
let fromReplace = 0
// 先把 14 只"精确立绘"写出去并登记 hash。
// 必须**先精确后替换** —— 早先是反过来的，导致替换时看不到这些文件的存在，
// 结果 19002/19006 撞上了 10023/10022 的立绘（战斗里会出现两只一模一样的怪）。
for (const [gidStr, atlasId] of Object.entries(PRECISE)) {
  const gid = Number(gidStr)
  const mon = gd.monsters.find((m) => Number(m.id) === gid)
  if (!mon) continue
  const dest = path.join(OUT, 'mon_' + gid + '.png')
  const s = slotByAtlas.get(atlasId)
  const pick = pool.find((p) => p.kind === 'atlas' && p.atlasId === atlasId) || { kind: 'atlas', pair: s ? s.k : -1, w: s ? s.w : 0, h: s ? s.h : 0, label: '图鉴' + atlasId }
  let h = null
  if (pick.pair >= 0 && pairs[pick.pair]) h = writeFromAtlas(pick, dest)
  if (!h && s) h = writeFromAtlas({ pair: s.k }, dest)
  // 图鉴那两个下标不同源，可能取到空格子 → 回退到旧素材
  let src = 'atlas（图鉴编号已核对）'
  if (!h) {
    h = fallbackSprite(gid)
    if (h) { src = 'fallback（图鉴格子对不上，回退旧素材）'; console.log('  ~ ' + mon.name + ' 图鉴格取到空图，已回退旧素材') }
  }
  if (h) usedHash.set(h, gid)
  map[gid] = 'assets/monsters/labeled/mon_' + gid + '.png'
  detail.push({
    id: gid, name: mon.name, element: mon.element || '无', size: Number(mon.size) || 90,
    sprite: map[gid], artSize: s ? s.w + 'x' + s.h : '?',
    source: src, replacedBy: null,
  })
}
// 再处理需要替换的 22 只
for (const mon of need) {
  let pick = assign[mon.id]
  if (!pick) { console.log('  ★ ' + mon.name + ' 没分到立绘'); continue }
  const dest = path.join(OUT, 'mon_' + mon.id + '.png')
  let h = null
  const tryWrite = (p) => {
    if (p.kind === 'atlas') return writeFromAtlas(p, dest)
    const src = path.join(ROOT, p.file)
    if (!fs.existsSync(src)) return null
    const buf = fs.readFileSync(src)
    fs.writeFileSync(dest, buf)
    return hashOf(buf)
  }
  h = tryWrite(pick)
  // 图鉴备选取到空占位格（writeFromAtlas 返回 null）时不放弃：换下一个备选，
  // 最后仍不行才回退旧素材。否则会出现"这只怪没有立绘"或"显示成一片灰影"。
  if (!h) {
    for (const alt of pool) {
      if (used.has(alt.id)) continue
      const h2 = tryWrite(alt)
      if (h2) { pick = alt; used.add(alt.id); h = h2; break }
    }
    if (!h) {
      const h3 = fallbackSprite(mon.id)
      if (h3) {
        h = h3
        console.log('  ~ ' + mon.name + ' 备选都取不到图，已回退旧素材')
        map[mon.id] = 'assets/monsters/labeled/mon_' + mon.id + '.png'
        detail.push({ id: mon.id, name: mon.name, element: mon.element, size: mon.size, sprite: map[mon.id], artSize: '?', source: 'fallback（回退旧素材）', replacedBy: null })
        if (h) usedHash.set(h, mon.id)
        fromReplace++
        continue
      }
      console.log('  ★ ' + mon.name + ' 完全没有可用立绘')
      continue
    }
  }
  // 撞车 → 换池子里没被用过的。
  // 注意：精确立绘**没有**放进 pool（见上面 precisePairIdx 的排除），
  // 所以这里不可能把一只怪的立绘换到另一只身上。
  if (h && usedHash.has(h)) {
    const alts = pool.filter((p) => {
      if (used.has(p.id)) return false
      if (p.kind === 'atlas') {
        // 图鉴备选：用该格子的坐标做唯一性判断
        return !usedAtlasPair.has(p.pair)
      }
      const s = path.join(ROOT, p.file)
      return fs.existsSync(s) && !usedHash.has(hashOf(fs.readFileSync(s)))
    })
    for (const alt of alts) {
      const h2 = tryWrite(alt)
      if (h2 && !usedHash.has(h2)) {
        pick = alt; used.add(alt.id); h = h2
        if (alt.kind === 'atlas') usedAtlasPair.add(alt.pair)
        break
      }
    }
    if (h && usedHash.has(h)) {
      console.log('  ! ' + mon.name + ' 的立绘与 ' + usedHash.get(h) + ' 重复，且没有备选可换')
    }
  }
  if (h) usedHash.set(h, mon.id)
  map[mon.id] = 'assets/monsters/labeled/mon_' + mon.id + '.png'
  detail.push({ id: mon.id, name: mon.name, element: mon.element, size: mon.size, sprite: map[mon.id], artSize: pick.w + 'x' + pick.h, source: 'replace（官方素材里外观相近的立绘，非该怪原图）', replacedBy: pick.label })
  fromReplace++
}

const out = {
  generated: new Date().toISOString(),
  method: 'hybrid：图鉴编号精确切图 + 官方素材外观近似替换',
  note: '怪兽表 36 只里，14 只在官方图鉴里有可核对编号的立绘；' +
    '其余 22 只的立绘在归档中不存在（图鉴里是「? 取消/暂缓/制作中」的空占位，' +
    'FLA/SWF 里是纯矢量、无位图）。为让敌人看上去正常，这 22 只改用归档里' +
    '未被使用的官方立绘（图鉴未用真立绘 11 只 + 怪物大全 10 只）按元素与体型近似替换。' +
    'detail[].source 为 replace 的条目即替换素材，不是该怪的原图。',
  counts: {
    total: gd.monsters.length,
    precise: Object.keys(PRECISE).length,
    replaced: fromReplace,
  },
  map,
  detail: detail.sort((a, b) => a.id - b.id),
}
fs.writeFileSync(path.join(M, 'map.json'), JSON.stringify(out, null, 2))
fs.writeFileSync(path.join(M, 'map.js'),
  '/* 自动生成，勿手改。重跑 _tools/build-monster-map.mjs */\n' +
  'window.__DKDbb_MONSTER_SPRITES__ = ' + JSON.stringify(out) + ';\n')
console.log('\n精确立绘 ' + Object.keys(PRECISE).length + ' 只，替换立绘 ' + fromReplace + ' 只')
console.log('\n=== 替换明细 ===')
for (const d of detail.filter((x) => x.source.startsWith('replace'))) {
  console.log('  ' + String(d.id).padEnd(6) + d.name.padEnd(11) + d.element + '  尺寸' + String(d.size).padStart(4) + '  ← ' + d.replacedBy + '  ' + d.artSize)
}
console.log('\n已写 assets/monsters/map.json + map.js')
