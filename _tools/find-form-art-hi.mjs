// 给"源像素不足"的形态在归档里找**高清原图**（>=640px 有效高度）
// 用法: node _tools/find-form-art-hi.mjs
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
// 需要补高清的形态（来自 audit-form-art-2x.mjs 的结论）
const NEED = ['哈瑞肯多比', '凤凰多比', '正义多比', '费勒姆炎多比', '人鱼多比', '兔多比', '艾斯林',
  '龙多比', '斯莱特刃多比', '毒多比', '曼陀罗多比', '土蝎多比', '夜影冽多比', '夜影空多比',
  '厄斯垒', '夜影博伊斯多比', '冰多比', '夜影凌多比', '夜影厄斯多比', '夜影正义多比']
// 每个形态的"检索关键词"（文件名里可能不带"多比"二字，得按官方名找）
const KEYS = {
  哈瑞肯多比: ['哈瑞肯', '哈瑞'],
  凤凰多比: ['凤凰'],
  正义多比: ['正义'],
  费勒姆炎多比: ['费勒姆', '炎多比'],
  人鱼多比: ['人鱼'],
  兔多比: ['瑞比特', '兔多比'],
  艾斯林: ['艾斯·林', '艾斯林', '艾斯'],
  龙多比: ['龙多比', '德拉科'],
  斯莱特刃多比: ['斯莱特'],
  毒多比: ['毒多比', '普伊斯', '蛛多比'],
  曼陀罗多比: ['曼陀罗'],
  土蝎多比: ['土蝎'],
  夜影冽多比: ['夜影冽', '冽'],
  夜影空多比: ['夜影空'],
  厄斯垒: ['厄斯'],
  夜影博伊斯多比: ['博伊斯'],
  冰多比: ['冰多比', '弗瑞斯'],
  夜影凌多比: ['夜影凌'],
  夜影厄斯多比: ['夜影厄斯'],
  夜影正义多比: ['夜影正义'],
}

function pngInfo(p) {
  const fd = fs.openSync(p, 'r')
  try {
    const b = Buffer.alloc(34)
    fs.readSync(fd, b, 0, 34, 0)
    if (b.readUInt32BE(0) !== 0x89504e47) return null
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] }
  } finally { fs.closeSync(fd) }
}

// 扫归档里所有 >=600px 的透明 PNG
const ROOTS = ['多克多比专区资料素材']
const all = []
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) { walk(p); continue }
    if (!/\.(png|PNG)$/.test(e.name)) continue
    const info = pngInfo(p)
    if (!info || info.w < 600) continue
    if (info.colorType !== 6 && info.colorType !== 4) continue
    all.push({ p, ...info, size: fs.statSync(p).size })
  }
}
for (const r of ROOTS) walk(path.join(ROOT, r))
console.log(`归档里 >=600px 的透明 PNG：${all.length} 张\n`)

for (const name of NEED) {
  const keys = KEYS[name] || [name]
  const hits = all.filter((f) => keys.some((k) => path.basename(f.p).includes(k)))
  hits.sort((a, b) => (b.w * b.h) - (a.w * a.h))
  console.log(`【${name}】关键词 ${keys.join('/')} → 命中 ${hits.length}`)
  for (const h of hits.slice(0, 3)) {
    console.log(`    ${h.w}×${h.h}  ${Math.round(h.size / 1024)}KB  ${path.relative(ROOT, h.p).replace(/\\/g, '/')}`)
  }
  if (!hits.length) console.log('    （归档里没有 >=600px 的透明图 → 只能用现有素材放大，或确认原版就没画）')
}
