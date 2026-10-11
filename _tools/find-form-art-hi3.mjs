// 定向复搜：17 个"源像素不足"的形态，在归档里到底有没有大图
// 每个形态给多组关键词（含官方名的变体写法），并列出**任何** >=700px 的命中。
// 用法: node _tools/find-form-art-hi3.mjs
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const KEYS = {
  兔多比: ['兔多比', '瑞比特', 'Rabbit'],
  曼陀罗多比: ['曼陀罗', '曼陀罗多比'],
  哈瑞肯多比: ['哈瑞肯', '哈瑞·肯', '哈瑞'],
  正义多比: ['正义'],
  费勒姆炎多比: ['费勒姆', '炎多比'],
  人鱼多比: ['人鱼'],
  艾斯林: ['艾斯', '艾斯·林'],
  斯莱特刃多比: ['斯莱特', '刃多比'],
  土蝎多比: ['土蝎', '蝎'],
  夜影冽多比: ['夜影', '冽'],
  夜影空多比: ['夜影', '空多比'],
  厄斯垒: ['厄斯', '垒'],
  夜影博伊斯多比: ['夜影', '博伊斯'],
  冰多比: ['冰多比', '弗瑞斯', '冰'],
  夜影凌多比: ['夜影', '凌'],
  夜影厄斯多比: ['夜影', '厄斯'],
  夜影正义多比: ['夜影', '正义'],
}
// 只关心这些形态常见的大图目录（避免 keyword 太泛时把 4000 张都列出来）
const names = []
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) { walk(p); continue }
    if (/\.(png|PNG|jpg|JPG)$/.test(e.name)) names.push(p)
  }
}
walk(path.join(ROOT, '多克多比专区资料素材'))
console.log(`归档图片 ${names.length} 张\n`)

function jpegSize(p) {
  const b = fs.readFileSync(p)
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xFF) { i++; continue }
    const m = b[i + 1]
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) }
    i += 2 + b.readUInt16BE(i + 2)
  }
  return null
}
function pngSize(p) {
  const fd = fs.openSync(p, 'r'); const b = Buffer.alloc(26); fs.readSync(fd, b, 0, 26, 0); fs.closeSync(fd)
  if (b.readUInt32BE(0) !== 0x89504e47) return null
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), ct: b[25] }
}

for (const [form, keys] of Object.entries(KEYS)) {
  const cand = names.filter((p) => keys.some((k) => path.basename(p).includes(k)))
  const big = []
  for (const p of cand) {
    const isPng = /\.png$/i.test(p)
    const s = isPng ? pngSize(p) : jpegSize(p)
    if (!s || !s.w || !s.h) continue
    if (Math.min(s.w, s.h) < 700) continue
    // 透明 PNG 优先（JPG 要抠背景，代价高）
    const transparent = isPng && s.ct === 6
    big.push({ p, w: s.w, h: s.h, transparent })
  }
  big.sort((a, b) => (b.transparent - a.transparent) || (b.w * b.h) - (a.w * a.h))
  console.log(`【${form}】关键词 ${keys.join('/')}：命中大图 ${big.length}`)
  for (const s of big.slice(0, 3)) {
    console.log(`    ${s.w}×${s.h} ${s.transparent ? '透明' : 'JPG '} ${path.relative(ROOT, s.p).replace(/\\/g, '/')}`)
  }
  if (!big.length) console.log('    ✗ 没有 → 归档里确实没有这一只的高清图')
}
