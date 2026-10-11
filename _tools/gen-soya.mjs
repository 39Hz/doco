// 生成索亚数据 assets/soya.js
//
// 数据来源：
//   · 编号与官方名 ← 图鉴 `图鉴4.3战斗道具、多比、索亚.jpg` 的索亚区（170001~170008）
//   · 设定文案     ← `docs/游戏数据/索亚介绍.xlsx`（逐字引用，不手抄）
//   · 立绘         ← `多克多比专区资料素材/索亚/`（见 _tools/build-soya-art.mjs）
//
// 战斗效果：官方表里**没有**索亚的数值，所以这里不编数值，
// 而是按官方设定的性格给每条一个**机制**（钢爪/静电/尖刺/粘人/照顾主人…），
// 全部标注为 derived，避免和"官方数据"混为一谈。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.resolve('.')

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

function readSheet(p, idx = 0) {
  const zip = unzip(fs.readFileSync(p))
  const shared = []
  if (zip.has('xl/sharedStrings.xml')) {
    const x = zip.get('xl/sharedStrings.xml').toString('utf8')
    for (const si of x.match(/<si>[\s\S]*?<\/si>/g) || []) {
      shared.push([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => dec(m[1])).join(''))
    }
  }
  const files = [...zip.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()
  if (!files[idx]) return []
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

// 从官方 xlsx 读设定文案
const xlsx = path.join(ROOT, 'docs', '游戏数据', '索亚介绍.xlsx')
const rows = readSheet(xlsx, 1)
const descById = new Map()
for (const r of rows) {
  const id = Number(norm(r[0]))
  if (!id) continue
  descById.set(id, { name: norm(r[1]), desc: norm(r[2]) })
}
console.log(`从索亚介绍.xlsx 读到 ${descById.size} 条官方设定`)

const art = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'soya', 'index.json'), 'utf8'))
// 按**名字**建索引：两个源的编号体系不同，按编号 join 会错位
// （xlsx: 70001=斯提尔兽；图鉴: 170001=威泰格兽）
const nrm = (x) => String(x || '').replace(/[（(].*?[)）]/g, '').replace(/[\s·・]/g, '')
const artByName = new Map(art.soya.map((s) => [nrm(s.name), s]))

// 战斗机制：按官方设定文案里写明的性格来定，全部标 derived
const EFFECT_BY_NAME = {
  '威泰格兽': { kind: 'guard', label: '守护', text: '每回合替主人分担一部分伤害（官方设定：把主人的生活起居照顾得井井有条）' },
  '伊莱切兽': { kind: 'shock', label: '静电', text: '攻击时有机会让目标麻痹一回合（官方设定：把静电积攒在电气囊里）' },
  '欧瑞坦兽': { kind: 'power', label: '全力', text: '攻击力最高的一只（官方设定：认为所有索亚之中它才是最强的）' },
  '凯科特斯兽': { kind: 'thorn', label: '尖刺', text: '被近身攻击时反弹伤害（官方设定：浑身上下长满了尖刺）' },
  '帕古因兽': { kind: 'cling', label: '粘人', text: '主人受伤时会凑过来回一点血（官方设定：非常害怕孤单很喜欢粘人）' },
  '斯提尔兽': { kind: 'claw', label: '钢爪', text: '追加一次爪击，但有几率在打瞌睡（官方设定：锋利的钢爪，很喜欢睡觉）' },
}

const list = []
for (const [id, info] of [...descById].sort((a, b) => a[0] - b[0])) {
  const a = artByName.get(nrm(info.name))
  if (!a) { console.log(`  跳过 ${info.name}（没有立绘）`); continue }
  let e = { kind: 'none', label: '—', text: '' }
  for (const [k, v] of Object.entries(EFFECT_BY_NAME)) { if (nrm(info.name).includes(k)) { e = v; break } }
  list.push({
    id, name: info.name || a.name, desc: info.desc, daquanId: a.id,
    art: a.file, w: a.w, h: a.h,
    effect: e.kind, effectLabel: e.label, effectText: e.text,
    artSource: a.evidence,
  })
}
const out = {
  generated: new Date().toISOString(),
  note: '编号与官方名来自图鉴4.3的索亚区；设定文案逐字取自 docs/游戏数据/索亚介绍.xlsx；' +
    '立绘来自 多克多比专区资料素材/索亚/（见 _tools/build-soya-art.mjs）。' +
    '战斗效果为 derived —— 官方表里没有索亚数值，这里按官方设定的性格给每只一个机制，不编数字。',
  source: ['图鉴4.3战斗道具、多比、索亚.jpg', 'docs/游戏数据/索亚介绍.xlsx'],
  counts: { soya: list.length },
  soya: list,
}
fs.writeFileSync(path.join(ROOT, 'assets', 'soya.js'),
  '/* 自动生成，勿手改。重跑 _tools/gen-soya.mjs */\n' +
  'window.__DKDbb_SOYA__ = ' + JSON.stringify(out) + ';\n')
console.log(`\n已生成 ${list.length} 只索亚 -> assets/soya.js`)
for (const s of list) {
  console.log(`  ${s.id} ${s.name.padEnd(16)} ${s.effectLabel.padEnd(4)} ${s.desc.slice(0, 28)}…`)
}
