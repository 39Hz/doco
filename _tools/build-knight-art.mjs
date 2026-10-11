// M4：把从 rar 里解出的**骑士与魔王立绘**入库。
//
// 来历：`多克多比专区资料素材\多比形态素材\多克骑士乌卡将军.rar`
//   → 14 张 JPG，文件名就是角色名（官方资料包里的原始命名）
// 依据等级：
//   · 名字与图像 —— `official`（官方资源包里的原始文件名与原始图片）
//   · 交叉印证 —— `community`：5068《八大骑士是什么 八大骑士一览》点名了
//     赤炎/暗影/狂毒/圣力/驭风/水晶 这六位骑士，与本包里的六张一一对应
//   · 「巨岩骑士」是第七位（见 5068 更新公告 81129），本包里**没有**它的立绘 → 标 missing
//
// 遵守 R4：原始 JPG 只读，复制到新目录 `assets/knights/`，不改动原文件。
//
// 输出：assets/knights/<name>.jpg + assets/knights/index.json
// 用法： node _tools/build-knight-art.mjs
import fs from 'node:fs'
import path from 'node:path'

const SRC_DIR = '_rar_extracted/多克骑士乌卡将军'
const OUT_DIR = 'assets/knights'
// EXTRA_ART 里的路径是相对**项目根**的（它们不在解包目录里，而在官方素材归档里）
const ROOT_FOR_EXTRA = '.'

// 六位骑士（与 5068 那篇《八大骑士》点名的六位一致）
const KNIGHTS = ['赤炎骑士', '暗影骑士', '狂毒骑士', '圣力骑士', '驭风骑士', '水晶骑士']
// 其余是"王"级角色（魔王/BOSS），名字同样取自官方资源包文件名
const LORDS = ['伽楼王', '修罗王', '夜叉王', '夜幕王', '梦魇王', '那罗王', '邪力王', '魔龙王']

// 【第 35 轮】从**别的官方素材目录**补进来的立绘。
// 背景：巨岩骑士一直被标成 missing（"本素材包里没有立绘"）——
// 可是归档 `多克多比专区资料素材\多比形态素材\巨岩骑士.png` 里**有同名原图**，
// 而且 `旋风巨岩多比资料.xlsx` 里还有它的**官方长描述**。
// 这又是一次"以为没有，其实只是没翻到"（同 场景素材 / 小游戏截图 那两次）。
// 名字与描述都来自官方素材，所以 conf 仍然是 official。
const EXTRA_ART = [
  {
    name: '巨岩骑士',
    src: '多克多比专区资料素材/多比形态素材/巨岩骑士.png',
    desc: '全身皆是厚实的岩石铠甲，能够抵挡任何的攻击。只要双脚立于大地之上，便会有无穷的力量。',
    evidence: '立绘取自官方素材归档 `多比形态素材\\巨岩骑士.png`（同名）；' +
      '描述逐字取自官方表 `旋风巨岩多比资料.xlsx`；5068 更新公告 81129 提到它是第七位骑士',
  },
]
// 已知但本包没有立绘的 → 第 35 轮起巨岩骑士已补上，这里清空（留着空数组，将来还有再往里加）
const MISSING = []

// rar 里还套了一层同名目录（实测：_rar_extracted/多克骑士乌卡将军/多克骑士乌卡将军/*.jpg），
// 所以这里自动下钻一层找图，而不是把路径写死。
function findJpgs(dir, depth = 0) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (depth < 2) out.push(...findJpgs(p, depth + 1)) }
    else if (/\.jpe?g$/i.test(e.name)) out.push(p)
  }
  return out
}
if (!fs.existsSync(SRC_DIR)) { console.error('找不到解包目录：' + SRC_DIR + '\n（先跑 node _tools/extract-rars.mjs）'); process.exit(2) }

const srcFiles = findJpgs(SRC_DIR)
console.log(`源目录 ${SRC_DIR} 里有 ${srcFiles.length} 张 JPG`)

fs.mkdirSync(OUT_DIR, { recursive: true })
const entries = []
let copied = 0
for (const src of srcFiles) {
  const f = path.basename(src)
  const name = f.replace(/\.jpe?g$/i, '')
  const dst = path.join(OUT_DIR, f)
  const size = fs.statSync(src).size
  fs.copyFileSync(src, dst)
  if (fs.statSync(dst).size === size) copied++
  const isKnight = KNIGHTS.includes(name)
  const isLord = LORDS.includes(name)
  entries.push({
    name,
    kind: isKnight ? 'knight' : isLord ? 'lord' : 'unknown',
    art: 'assets/knights/' + f,
    bytes: size,
    src: src.replace(/\\/g, '/'),
    conf: isKnight || isLord ? 'official' : 'missing',
    evidence: isKnight
      ? '文件名取自官方资源包；5068《八大骑士》原文点名过这六位：赤炎/暗影/狂毒/圣力/驭风/水晶'
      : isLord
        ? '文件名取自官方资源包（「王」级角色，具体身份与玩法无依据）'
        : '文件名未在已知名单内，身份待考',
  })
}
// 【第 35 轮】把 EXTRA_ART 里的立绘从别的官方素材目录补进来
for (const x of EXTRA_ART) {
  const src = path.join(ROOT_FOR_EXTRA, x.src)
  if (!fs.existsSync(src)) { console.log(`★ 缺素材 ${x.name} <- ${x.src}`); continue }
  const f = path.basename(src)
  const dst = path.join(OUT_DIR, f)
  const size = fs.statSync(src).size
  fs.copyFileSync(src, dst)
  if (fs.statSync(dst).size !== size) { console.log(`★ 拷贝不完整：${x.name}`); continue }
  entries.push({
    name: x.name,
    kind: 'knight',
    art: 'assets/knights/' + f,
    bytes: size,
    src: x.src,
    conf: 'official',
    desc: x.desc || '',
    evidence: x.evidence,
  })
  console.log(`  补入官方立绘：${x.name} ← ${x.src}`)
}

// 排序：骑士在前，魔王在后，各按既定顺序
entries.sort((a, b) => {
  const ia = KNIGHTS.indexOf(a.name), ib = KNIGHTS.indexOf(b.name)
  if (ia >= 0 && ib >= 0) return ia - ib
  if (ia >= 0) return -1
  if (ib >= 0) return 1
  const ja = LORDS.indexOf(a.name), jb = LORDS.indexOf(b.name)
  return (ja < 0 ? 99 : ja) - (jb < 0 ? 99 : jb)
})

const index = {
  generated: new Date().toISOString(),
  note: '骑士与魔王立绘。名字与图片来自官方资源包（多克骑士乌卡将军.rar）；'
    + '六位骑士与 5068《八大骑士是什么》点名的六位一致。**本包不含它们的战斗数值与技能**，'
    + '所以只作为图鉴展示，不编造战斗数据。',
  missing: MISSING.map((n) => ({ name: n, why: '已知存在的骑士，但本素材包里没有立绘', conf: 'missing' })),
  entries,
}
fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 1), 'utf8')

// 同时产出一份 .js 全局 —— 与项目其它数据（forms/items/soya）保持同一约定，
// 这样 game.html 里按 <script> 加载即可，不依赖运行时 fetch（离线 exe 更稳）。
const js = `/* 自动生成，勿手改。重跑 _tools/build-knight-art.mjs */
window.__DKDbb_KNIGHTS__ = ${JSON.stringify(index, null, 1)}
`
fs.writeFileSync('assets/knights.js', js, 'utf8')
console.log(`已写 assets/knights.js（${(js.length / 1024).toFixed(1)} KB）`)

// ---------- 汇总 ----------
const byKind = {}
for (const e of entries) byKind[e.kind] = (byKind[e.kind] || 0) + 1
console.log(`入库 ${entries.length} 张 → ${OUT_DIR}/`)
console.log('分类：' + JSON.stringify(byKind))
for (const e of entries) console.log(`  ${e.kind === 'knight' ? '骑士' : e.kind === 'lord' ? '魔王' : '待考'}  ${e.name.padEnd(8, '　')} ${(e.bytes / 1024).toFixed(1)} KB`)
console.log(`已知但缺立绘：${MISSING.join('、')}`)

// ---------- 自检（R5）----------
console.log('\n自检：')
// 期望条数 = 解包目录里的 jpg 数 + 从**别的官方目录**补进来的张数。
// （第 35 轮加 EXTRA_ART 时这里先报了一次假失败：源 14 张 vs 条目 15——
//   自检本身要跟着数据源一起改，否则它会拦住正确的改动。）
const extraCopied = entries.filter((e) => EXTRA_ART.some((x) => x.name === e.name)).length
const c1 = entries.length === srcFiles.length + extraCopied && entries.length >= 14
console.log(`  ${c1 ? '✓' : '✗'} 全部 ${entries.length} 张都已复制（解包目录 ${srcFiles.length} 张 + 外部官方目录 ${extraCopied} 张）`)
const c2 = entries.every((e) => fs.existsSync(e.art) && fs.statSync(e.art).size > 1024)
console.log(`  ${c2 ? '✓' : '✗'} 每张文件都真实存在且非空`)
const c3 = KNIGHTS.every((k) => entries.some((e) => e.name === k))
console.log(`  ${c3 ? '✓' : '✗'} 六位骑士全部到齐（正例：${KNIGHTS.join('/')}）`)
const c5 = MISSING.length === 0 || c1
console.log(`  ${c5 ? '✓' : '✗'} 缺失名单已清空或仍自洽（当前 missing ${MISSING.length} 个）`)
const c4 = fs.existsSync(path.join(OUT_DIR, 'index.json'))
console.log(`  ${c4 ? '✓' : '✗'} index.json 已写出`)
if (!(c1 && c2 && c3 && c4 && c5)) process.exit(1)
