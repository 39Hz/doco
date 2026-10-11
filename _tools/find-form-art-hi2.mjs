// 扩大搜索：给"源像素不足"的 20 个形态在归档里找**一切可用的大图源**
// 不只看透明 PNG，也看 JPG / 编号图；命中按"有效像素高度"排序（不是画布大小）。
// 用法: node _tools/find-form-art-hi2.mjs
import fs from 'node:fs'
import path from 'node:path'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const NEED = ['哈瑞肯多比', '凤凰多比', '正义多比', '费勒姆炎多比', '人鱼多比', '兔多比', '艾斯林',
  '龙多比', '斯莱特刃多比', '毒多比', '曼陀罗多比', '土蝎多比', '夜影冽多比', '夜影空多比',
  '厄斯垒', '夜影博伊斯多比', '冰多比', '夜影凌多比', '夜影厄斯多比', '夜影正义多比']
const KEYS = {
  哈瑞肯多比: ['哈瑞肯', '哈瑞'], 凤凰多比: ['凤凰'], 正义多比: ['正义'],
  费勒姆炎多比: ['费勒姆', '炎多比', '费勒姆炎'], 人鱼多比: ['人鱼'], 兔多比: ['瑞比特', '兔多比'],
  艾斯林: ['艾斯·林', '艾斯林', '艾斯', '艾斯林'], 龙多比: ['龙多比', '德拉科'],
  斯莱特刃多比: ['斯莱特'], 毒多比: ['毒多比', '普伊斯', '蛛多比'], 曼陀罗多比: ['曼陀罗'],
  土蝎多比: ['土蝎'], 夜影冽多比: ['夜影冽', '冽多比'], 夜影空多比: ['夜影空'],
  厄斯垒: ['厄斯'], 夜影博伊斯多比: ['博伊斯'], 冰多比: ['冰多比', '弗瑞斯'],
  夜影凌多比: ['夜影凌'], 夜影厄斯多比: ['夜影厄斯'], 夜影正义多比: ['夜影正义'],
}

function pngInfo(p) {
  const fd = fs.openSync(p, 'r')
  try {
    const b = Buffer.alloc(34)
    fs.readSync(fd, b, 0, 34, 0)
    if (b.readUInt32BE(0) !== 0x89504e47) return null
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), ct: b[25] }
  } finally { fs.closeSync(fd) }
}

// 先收集：文件名命中任一关键词的所有图片（png/jpg）
const names = []
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) { walk(p); continue }
    if (!/\.(png|PNG|jpg|JPG|jpeg)$/.test(e.name)) continue
    names.push(p)
  }
}
walk(path.join(ROOT, '多克多比专区资料素材'))
console.log(`归档图片总数：${names.length}`)

for (const form of NEED) {
  const keys = KEYS[form] || [form]
  const cand = names.filter((p) => keys.some((k) => path.basename(p).includes(k)))
  // 逐个求"有效像素高度"（透明图算 alpha 外框；JPG 算非白外框），只留够大的
  const scored = []
  for (const p of cand.slice(0, 400)) {
    const isPng = /\.png$/i.test(p)
    let w = 0, h = 0, eff = 0
    if (isPng) {
      const info = pngInfo(p)
      if (!info) continue
      w = info.w; h = info.h
      // 太大的先按画布估（不逐个解码 4000px 的图，太慢）；>=700 就够
      eff = Math.min(h, info.w) >= 700 ? h : 0
    } else {
      try {
        const fd = fs.openSync(p, 'r'); const b = Buffer.alloc(4); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd)
        if (b[0] !== 0xFF || b[1] !== 0xD8) continue
      } catch { continue }
      // JPEG 尺寸要扫 SOF 段
      const buf = fs.readFileSync(p)
      for (let i = 2; i + 9 < buf.length;) {
        if (buf[i] !== 0xFF) { i++; continue }
        const m = buf[i + 1]
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
          h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break
        }
        i += 2 + buf.readUInt16BE(i + 2)
      }
      if (!h) continue
      eff = Math.min(h, w) >= 700 ? h : 0
    }
    if (eff > 0) scored.push({ p, w, h, eff })
  }
  scored.sort((a, b) => b.eff - a.eff)
  const uniq = []
  const seen = new Set()
  for (const s of scored) { const d = path.dirname(s.p); if (seen.has(d)) continue; seen.add(d); uniq.push(s) }
  console.log(`\n【${form}】命中大图 ${uniq.length} 处`)
  for (const s of uniq.slice(0, 3)) {
    console.log(`    ${s.w}×${s.h}  ${path.relative(ROOT, s.p).replace(/\\/g, '/')}`)
  }
  if (!uniq.length) console.log('    ✗ 归档里没有 >=700px 的图 → 原版大概率就没画高清版（或只在活动素材里）')
}
