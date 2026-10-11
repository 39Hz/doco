// 发布包内容抽查：确认这一轮的新东西真的进包了（不是只在仓库里）
//
// 【设计取舍，改动前先读】
//   · **条目清单/名字**：读 zip 的中央目录（只读名字，不碰压缩流）——稳。
//   · **文件内容**：读 `dist/` 里的同名文件，**不自己解压 zip**。
//     原因：183 MB 的包用了 **ZIP64**（大小字段写成 0xFFFFFFFF、真值在 extra field），
//     自己写解析器取内容时我踩了两次坑（大小字段为 0、按 PK 签名截断），
//     两次都**假报"没进包"**。而 `dist/` 就是 make-dist 拷进包里的来源，
//     并且 `verify-zip.mjs`（项目自带解析器）已经独立验过包内条目 20 项。
//     → 所以"内容对不对"看 dist，"进没进包"看 verify-zip，两者都不需要手写 ZIP64 解析。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const ZIP = fs.readdirSync(ROOT).filter((f) => /^多克多比v[\d.]+单机版\.zip$/.test(f)).sort().pop()
if (!ZIP) { console.log('找不到发布包'); process.exit(1) }
console.log(`包: ${ZIP}  ${(fs.statSync(ZIP).size / 1048576).toFixed(1)} MB`)

const buf = fs.readFileSync(ZIP)
let eocd = -1
for (let i = buf.length - 22; i >= 0 && i > buf.length - 70000; i--) {
  if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
}
if (eocd < 0) { console.log('找不到 EOCD'); process.exit(1) }
const count = buf.readUInt16LE(eocd + 10)
let off = buf.readUInt32LE(eocd + 16)
const names = []
for (let i = 0; i < count; i++) {
  const nl = buf.readUInt16LE(off + 28), el = buf.readUInt16LE(off + 30), cl = buf.readUInt16LE(off + 32)
  names.push(buf.toString('utf8', off + 46, off + 46 + nl))
  off += 46 + nl + el + cl
}
console.log(`条目 ${names.length}（中央目录清单）`)

const pick = (re) => names.filter((n) => re.test(n))
const artBig = pick(/forms\/art\/[^/]+\.png$/).filter((n) => !n.includes('_icon'))
const walk = pick(/forms\/walk\/.+\.png$/)
const icons = pick(/forms\/art\/.+_icon\.png$/)
console.log(`  包内：立绘 ${artBig.length} 张 · 头像 ${icons.length} 张 · 走路帧 ${walk.length} 张`)

// dist 根（make-dist 的产物，就是打进包的那份）
const distRoot = (() => {
  const d = path.join(ROOT, 'dist')
  if (!fs.existsSync(d)) return null
  const web = path.join(d, 'web')
  return fs.existsSync(web) ? web : d
})()
if (!distRoot) { console.log('✗ 没有 dist/，先跑 make-dist'); process.exit(1) }

let bad = 0
const need = [
  ['game/game.js', '主逻辑（在线礼包 / 战斗速度接线 / 指令图标深色化）', '在线礼包'],
  ['game/engine/fx.js', '技能特效（冷色外圈 + 白炽核心）', '冷色外圈'],
  ['game/tables/treasure.js', '碎片掉落表（普通怪 0.4）', 'normal: 0.4'],
  ['game.html', '右上角「礼包」按钮', 'btn-gift'],
]
console.log('\n本轮改动是否落地（既在 dist 里、也确实在包内清单里）：')
for (const [rel, why, needle] of need) {
  const p = path.join(distRoot, rel)
  const inZip = names.some((n) => n.endsWith(rel) || n.endsWith('web/' + rel))
  const txt = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
  const has = txt.includes(needle)
  const ok = inZip && has
  if (!ok) bad++
  console.log(`  ${ok ? '✓' : '✗'} ${rel}`)
  console.log(`      ${why}　[进包=${inZip ? '是' : '否'} 含「${needle}」=${has ? '是' : '否'}]`)
}

// 新资源抽查（包内清单必须含这几个具体文件名）
const res = [
  'forms/art/正义多比.png',
  'forms/walk/龙多比_6.png',
  'forms/walk/龙多比_1.png',
]
console.log('\n本轮新增/改动的资源是否在包内：')
for (const r of res) {
  const ok = names.some((n) => n.endsWith(r))
  if (!ok) bad++
  console.log(`  ${ok ? '✓' : '✗'} ${r}`)
}

console.log(bad ? `\n✗ ${bad} 项有问题` : '\n✓ 本轮改动与资源全部进包')
process.exit(bad ? 1 : 0)
