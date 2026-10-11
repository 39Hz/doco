// 校验发布包（多克多比vX.Y单机版.zip）的内容是否完整。
//
// 【为什么要单独写这个脚本】
// 发布包曾经出过一次真事故：某个整目录（assets/forms/art、items、skills）在 zip 里是 **0 个文件**，
// 但没人在打包后检查，于是"能下载的版本"里少了立绘和图标。
// 后来又出现一次**假警报**：用 PowerShell 的 `$_.FullName -like '*web/assets/items/*'` 去数，
// 得到 0 —— 因为 Compress-Archive 在条目名里写的是**反斜杠**（`web\assets\items\...`），
// 正斜杠模式匹配不到。真事故和假警报混在一起，说明"数一数"这件事必须固化成脚本 + 正例自证。
//
// 本脚本直接读 zip 的中央目录（不依赖 PowerShell，也不解压），把 `\` 统一成 `/` 后统计。
//
// 【第 43 轮修】原来的包名是**写死的 v0.5**。版本一升，它就默默去验上一版的老包
//（实测：v0.6 打完之后它报告的仍然是 "发布包: 多克多比v0.5单机版.zip"，等于白验）。
// 现在默认**自动挑最新的那个包**，并且把挑中的文件名打出来。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 自动挑包：先按文件名里的版本号排序，再按修改时间兜底
function latestZip() {
  const cands = fs.readdirSync(ROOT).filter((f) => /^多克多比v[\d.]+单机版\.zip$/.test(f))
  if (!cands.length) return null
  const ver = (f) => (f.match(/v([\d.]+)/) || [, '0'])[1].split('.').map(Number)
  cands.sort((a, b) => {
    const va = ver(a), vb = ver(b)
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const d = (vb[i] || 0) - (va[i] || 0)
      if (d) return d
    }
    return fs.statSync(path.join(ROOT, b)).mtimeMs - fs.statSync(path.join(ROOT, a)).mtimeMs
  })
  return path.join(ROOT, cands[0])
}
const zipPath = process.argv[2] || latestZip()
if (!zipPath || !fs.existsSync(zipPath)) {
  console.error('找不到发布包' + (zipPath ? '：' + zipPath : '（目录里没有 多克多比vX.Y单机版.zip）'))
  process.exit(1)
}

// ---- 读中央目录（End of Central Directory → Central Directory）----
const buf = fs.readFileSync(zipPath)
let eocd = -1
for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
  if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
}
if (eocd < 0) { console.error('不是有效的 zip（找不到 EOCD）'); process.exit(1) }
const count = buf.readUInt16LE(eocd + 10)
let off = buf.readUInt32LE(eocd + 16)

const names = []
for (let i = 0; i < count; i++) {
  if (buf.readUInt32LE(off) !== 0x02014b50) { console.error(`第 ${i} 条中央目录头损坏`); process.exit(1) }
  const nameLen = buf.readUInt16LE(off + 28)
  const extraLen = buf.readUInt16LE(off + 30)
  const commentLen = buf.readUInt16LE(off + 32)
  names.push(buf.toString('utf8', off + 46, off + 46 + nameLen).replace(/\\/g, '/'))
  off += 46 + nameLen + extraLen + commentLen
}

let pass = 0, fail = 0
const ok = (c, msg, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + msg + (extra ? ' → ' + extra : '')) }

console.log(`发布包: ${path.basename(zipPath)}  ${(buf.length / 1048576).toFixed(1)} MB  条目 ${names.length}`)

// ---- 自证：条目数与目录数必须对得上，且正例（exe 与首页）必须命中 ----
ok(names.length === count, `条目数与中央目录一致（${names.length}）`)
ok(names.some((n) => n.endsWith('多克多比.exe')), '正例自证：启动器 exe 在包内')

// ---- 关键目录不得为空（这就是当初真事故的形态）----
const MUST = {
  'web/game.html': 1,
  'web/world.js': 1,
  'web/game/tables/skills-official.js': 1,
  'web/assets/bgm/island-bgm.json': 1,
  'web/assets/bgm/named/': 15,
  'web/assets/scenes/': 80,
  'web/assets/forms/art/': 11,
  'web/assets/items/': 30,
  'web/assets/skills/': 10,
  'web/assets/knights/': 14,
  'web/assets/monsters/': 100,
  'web/assets/anim/': 1000,
}
for (const [pat, min] of Object.entries(MUST)) {
  const c = names.filter((n) => n.includes(pat)).length
  ok(c >= min, `${pat} 至少 ${min} 项`, `实际 ${c}`)
}

// ---- 自维护的一条：game.html 里 <script src> 引到的每个文件都必须在包里 ----
// 手写清单**一定会过时**（这个仓库已经栽过三次：assets/soya.js 漏加载、
// test-battle-mouse.mjs 漏跑、skills-official.js 漏进字形图集）。
// 这条不需要维护：加了新脚本而忘了打包，它会自己报出来。
{
  const htmlPath = path.join(ROOT, 'dist', 'web', 'game.html')
  if (!fs.existsSync(htmlPath)) {
    ok(false, '能读到 dist/web/game.html 以核对脚本清单')
  } else {
    const html = fs.readFileSync(htmlPath, 'utf8')
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1])
    ok(srcs.length >= 20, `game.html 引用了 ${srcs.length} 个脚本`)
    const missing = srcs.filter((s) => !names.includes('web/' + s.replace(/^\.\//, '')))
    ok(missing.length === 0, `这 ${srcs.length} 个脚本全部在包内`,
      missing.length ? '缺: ' + missing.join(', ') : '')
    // 逐个点名最容易被忘的那几个（新增文件常忘）
    for (const s of ['game/tables/minigames.js', 'game/tables/dungeons.js', 'game/tables/treasure.js', 'game/tables/skills-official.js']) {
      ok(srcs.includes(s) && names.includes('web/' + s), `新增脚本 ${s} 既被引用也在包内`)
    }
  }
}

console.log(`\n结果: 通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
