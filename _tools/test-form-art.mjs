// 形态形象回归测试。
//
// 用户报的 bug：「瑞比特·兔 多比」在背包里画成了龙多比的样子。
// 根因是 archive 只导出了 6 套动作帧，其余形态靠"按元素借用同系多比的帧"，
// 于是两只不同的多比长得一模一样 —— 光看路径检查不出来。所以这里做像素级比对：
// 任意两张形态立绘必须"确实不一样"。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
let pass = 0, fail = 0
const ok = (m) => { pass++; console.log('  ✓ ' + m) }
const no = (m) => { fail++; console.log('  ✗ ' + m) }
const check = (c, m, extra) => c ? ok(m) : no(m + (extra ? '　→ ' + extra : ''))

// ---- 载入形态表 ----
const formsJs = fs.readFileSync(path.join(ROOT, 'assets', 'forms.js'), 'utf8')
const forms = JSON.parse(formsJs.replace(/^[\s\S]*?window\.__DKDbb_FORMS__\s*=\s*/, '').replace(/;\s*$/, '')).forms

console.log('=== 1) 有官方立绘的形态必须挂上，没有的要如实标出来 ===')
// 【这条规则第 30 轮改过】原先要求"每个形态都有 art" —— 那在只有 11 只（恰好都有图）时成立，
// 但归档里能确认的**官方立绘只有 29 只**（第 30 轮从 52 只形态里逐一对出来的）。
// 现在真正要守的是两件事：
//   ① **归档里有同名官方立绘的，必须挂上**（不许再出现"图在归档里却没接进来"）；
//   ② 没有立绘的必须**什么都不挂**（不许再借别的形态的帧来充数 —— 那就是用户报的那个 bug）。
const NO_ART_OK = forms.filter((f) => !f.art)
const withArt = forms.filter((f) => f.art)
// 29 张能确认同名的官方立绘里，**英雄多比**那张被主动撤掉了：
// 原图脚底带一大片灰投影，现阶段的抠图去不掉（本测试第 5 节会报"脚底残留 47%"）。
// 按 R9：宁可标"无立绘"，也不给一张脏图。
// 【第 32 轮：28 → 27】又撤掉一张 —— 「温德·冽」原先借的是 `旋风多比.png`，
// 而归档里的 `旋风巨岩多比资料.xlsx` 把「旋风多比」当独立形态写（有自己的描述与专属技能），
// 按"文件名归属优先"把图还给了它的主人（见 docs/deviations.md V54）。
// 所以下限定在 27。
check(withArt.length >= 27, `${forms.length} 只形态里有 ${withArt.length} 只挂上了官方立绘`,
  `少于 27 说明有图没接进来`)
// 没立绘的：必须是"既没有 art，也不许有借来的形象标记"
const borrowed = NO_ART_OK.filter((f) => f.artIcon || f.tint)
check(borrowed.length === 0, `${NO_ART_OK.length} 只没有官方立绘的形态没有借别的形态的形象`,
  borrowed.map((f) => f.name).join('、'))
console.log(`     （无官方立绘 ${NO_ART_OK.length} 只：${NO_ART_OK.map((f) => f.name).join('、')}）`)

const badPath = []
for (const f of forms) {
  for (const [label, rel] of [['立绘', f.art], ['头像', f.artIcon]]) {
    if (!rel) continue
    const p = path.join(ROOT, rel)
    if (!fs.existsSync(p) || fs.statSync(p).size < 500) badPath.push(`${f.name} 的${label} ${rel}`)
  }
}
check(badPath.length === 0, '立绘与头像文件都存在且非空', badPath.join('、'))

console.log('\n=== 2) 没有两只共用同一张图（用户报的 bug 就是这个）===')
const byArt = new Map()
for (const f of forms) {
  if (!f.art) continue
  if (!byArt.has(f.art)) byArt.set(f.art, [])
  byArt.get(f.art).push(f.name)
}
const shared = [...byArt.entries()].filter(([, names]) => names.length > 1)
check(shared.length === 0, `${forms.length} 个形态用了 ${byArt.size} 张不同的立绘`,
  shared.map(([a, n]) => `${a} <- ${n.join('/')}`).join('　'))

console.log('\n=== 3) 像素级比对：任意两张立绘都不能雷同 ===')
const imgs = []
for (const f of forms) {
  if (!f.art) continue
  const img = decodePng(fs.readFileSync(path.join(ROOT, f.art)))
  imgs.push({ name: f.name, img })
}
// 缩到 24x24 再比：既抗缩放差异，又能一眼看出"是不是同一只"
function fingerprint(img, n = 24) {
  const out = []
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const sx = Math.min(img.w - 1, Math.floor((x + 0.5) * img.w / n))
    const sy = Math.min(img.h - 1, Math.floor((y + 0.5) * img.h / n))
    const i = (sy * img.w + sx) * 4
    const a = img.data[i + 3] / 255
    out.push([img.data[i] * a, img.data[i + 1] * a, img.data[i + 2] * a, a * 255])
  }
  return out
}
const fps = imgs.map((v) => ({ name: v.name, fp: fingerprint(v.img) }))
let worst = { d: Infinity, a: '', b: '' }
for (let i = 0; i < fps.length; i++) {
  for (let j = i + 1; j < fps.length; j++) {
    let d = 0
    for (let k = 0; k < fps[i].fp.length; k++) {
      const p = fps[i].fp[k], q = fps[j].fp[k]
      d += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) + Math.abs(p[3] - q[3])
    }
    d /= fps[i].fp.length * 4
    if (d < worst.d) worst = { d, a: fps[i].name, b: fps[j].name }
  }
}
console.log(`  最像的一对：${worst.a} vs ${worst.b}　平均通道差 ${worst.d.toFixed(1)}/255`)
// 【这条规则第 30 轮改过】原先是一刀切"任意两张必须差 > 12"。
// 但官方本身就有配色、姿势都相近的两只（曼陀罗多比 / 毒多比），一刀切会一直误报。
// 现在拆成两条更准的规则：
//   ① 任意两张**不许字节相同**（那是"同一张图被挂到两只身上"的真 bug，第 30 轮真踩到过：
//      JPG 缓存按位置命名 + 存在即跳过 → 改 MAP 顺序就静默串图）；
//   ② "长得像"必须**在 ALLOW_SIMILAR 里写明理由**才放行 —— 这样它不会悄悄变多。
const ALLOW_SIMILAR = [
  ['曼陀罗多比', '毒多比', '两只都是紫色系、姿势相近，但归档里是两个不同文件（sha256 前缀 2032A6B9… / 3BBC2656…），且各自对应自己的同名文件 —— 属官方设计本身相近'],
]
const hashSeen = new Map()
const dupHash = []
for (const { name } of imgs) {
  const f = forms.find((x) => x.name === name)
  const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f.art))).digest('hex')
  if (hashSeen.has(h)) dupHash.push(`${name} 与 ${hashSeen.get(h)} 字节完全相同`)
  else hashSeen.set(h, name)
}
check(dupHash.length === 0, `${imgs.length} 张立绘没有两张字节相同`, dupHash.join('　'))
const pairKey = (a, b) => [a, b].sort().join('|')
const allowed = new Set(ALLOW_SIMILAR.map(([a, b]) => pairKey(a, b)))
const nearPairs = []
for (let i = 0; i < fps.length; i++) {
  for (let j = i + 1; j < fps.length; j++) {
    let d = 0
    for (let k = 0; k < fps[i].fp.length; k++) {
      const p = fps[i].fp[k], q = fps[j].fp[k]
      d += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) + Math.abs(p[3] - q[3])
    }
    d /= fps[i].fp.length * 4
    if (d <= 12 && !allowed.has(pairKey(fps[i].name, fps[j].name))) nearPairs.push(`${fps[i].name}↔${fps[j].name}(${d.toFixed(1)})`)
  }
}
check(nearPairs.length === 0,
  `除了登记在案的那 ${ALLOW_SIMILAR.length} 对，没有别的形态立绘雷同`,
  nearPairs.join('　'))
for (const [a, b, why] of ALLOW_SIMILAR) {
  const d = (() => {
    const i = fps.findIndex((x) => x.name === a), j = fps.findIndex((x) => x.name === b)
    if (i < 0 || j < 0) return null
    let s = 0
    for (let k = 0; k < fps[i].fp.length; k++) {
      const p = fps[i].fp[k], q = fps[j].fp[k]
      s += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) + Math.abs(p[3] - q[3])
    }
    return s / fps[i].fp.length / 4
  })()
  check(d !== null, `登记在案的近似对确实存在：${a} ↔ ${b}（${d === null ? '缺图' : d.toFixed(1)}）—— ${why}`)
}

console.log('\n=== 4) 立绘本身是合格素材（有透明背景、比例正常）===')
const badAlpha = [], badShape = []
for (const { name, img } of imgs) {
  let opaque = 0
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 250) opaque++
  const pct = 100 * opaque / (img.w * img.h)
  if (pct > 92) badAlpha.push(`${name} 不透明占比 ${pct.toFixed(1)}%（背景没抠干净？）`)
  if (img.h < 200 || img.w < 60) badShape.push(`${name} 只有 ${img.w}x${img.h}`)
}
check(badAlpha.length === 0, '每张立绘都抠掉了背景', badAlpha.join('、'))
check(badShape.length === 0, '每张立绘尺寸够用（高≥200）', badShape.join('、'))

console.log('\n=== 5) 脚底不留灰色投影（在深蓝场景上会像脏块）===')
const grayBad = []
for (const { name, img } of imgs) {
  let n = 0, total = 0
  const y0 = Math.floor(img.h * 0.72)
  for (let y = y0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const i = (y * img.w + x) * 4
    if (img.data[i + 3] < 40) continue
    total++
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2]
    if (Math.max(r, g, b) - Math.min(r, g, b) <= 12 && (r + g + b) / 3 >= 130) n++
  }
  const pct = total ? 100 * n / total : 0
  // 白兔、圣诞老人的白胡子本身就是中性浅色，所以只抓"大半条腿都是灰"的情况
  //
  // 【第 51 轮：正义多比的例外，理由写在这里】
  //   它下半身绝大部分是**白色靴甲**，而白甲的明暗本来就是中性浅色 ——
  //   检测器会把它当成"脚底灰投影"。实测证据：
  //     · 官方素材直出时就已经 **44.4%**（阈值 45%，本来就只差 0.6 个百分点）；
  //     · 高清化（AI 超分）后升到 **51.9%**：边缘更锐，近白像素被推进了"灰"的判定区间；
  //     · 裁出下半身**亲眼核对过**：那是白靴甲的浅灰转折，不是投影。
  //   所以这是**检测器的误报**，不是脏图。按 R5/R9：不许为了让断言变绿去改图，
  //   也不许让一个已核实的误报长期挂红 —— 折中是**指名例外 + 写明理由 + 留复核证据**。
  //   ⚠️ 只许往这个集合里放"已人工裁图核对过、确认不是投影"的形态。
  const GRAY_FALSE_POSITIVE = new Set(['正义多比'])
  if (pct > 45 && !GRAY_FALSE_POSITIVE.has(name)) grayBad.push(`${name} ${pct.toFixed(0)}%`)
}
check(grayBad.length === 0, '没有形态的脚底残留大片灰色投影', grayBad.join('、'))

console.log('\n=== 6) spriteDir 不再被当成形象来源 ===')
const dirs = new Set()
const artIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'forms', 'art', 'index.json'), 'utf8'))
for (const f of forms) {
  // 只管**有立绘**的形态：没有官方立绘的（artMissing）本来就不该出现在 art 索引里，
  // 它们由第 1 节单独把关（不许借形象）。早先这里对每一只都要求有记录，
  // 52 只形态里有 24 只没图 → 直接刷出 24 条假失败。
  if (f.artMissing) {
    check(f.spriteDir === null, `${f.name} 无官方立绘 → 不设兜底形象目录（不借别的形态）`)
    continue
  }
  // 归一化必须**两边用同一条规则**。早先只把形态名里的「多比」剥掉、索引名原样比，
  // 恰好因为旧 MAP 的键都不带「多比」而没暴露；第 30 轮新键带了「多比」，
  // 于是 20 只明明有图的形态被报成"没有记录"。（和 apply-form-art.mjs 的 key() 保持一致）
  const norm2 = (s) => String(s).replace(/多比|[\s·・]/g, '')
  const rec = artIndex.forms.find((x) => norm2(x.name) === norm2(f.name))
  if (!rec) { no(`${f.name} 有 art 字段却在 art/index.json 里没有记录`); continue }
  check(rec.evidence && rec.evidence.length > 4, `${f.name} 记了形象来源：${rec.evidence}`)
  dirs.add(f.spriteDir)
}
check(true, `兜底动画目录共 ${dirs.size} 个（仅用于立绘加载失败时）`)

console.log('\n=== 7) 「仅形象」条目：有官方图、没有官方数值 ===')
{
  // 第 32 轮新增的一类：归档里有官方立绘、但**不在官方形态表里**（夜影系列、威尔鼎、大时…）。
  // 处置规矩必须被测试钉住，否则以后很容易被人"顺手"塞进形态表：
  //   ① 必须有图、有出处；
  //   ② **绝不能出现在 D.FORMS 里** —— 那就意味着它成了可玩形态，而它没有任何官方数值依据。
  const formsRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'forms.js'), 'utf8')
    .replace(/^[\s\S]*?window\.__DKDbb_FORMS__\s*=\s*/, '').replace(/;\s*$/, ''))
  const artOnly = formsRaw.artOnly || []
  check(artOnly.length >= 15, `「仅形象」收录 ${artOnly.length} 条`, '少于 15 条说明归档里的原图又漏接了')
  const bad = artOnly.filter((a) => !a.art || !fs.existsSync(path.join(ROOT, a.art)) || !(a.evidence || '').length)
  check(bad.length === 0, '每条都有立绘文件与出处', bad.map((a) => a.name).join('、'))
  const formNames = new Set(forms.map((f) => f.name.replace(/多比|[\s·・]/g, '')))
  const leaked = artOnly.filter((a) => formNames.has(String(a.name).replace(/多比|[\s·・]/g, '')))
  check(leaked.length === 0, '「仅形象」条目**没有**混进形态表（混进去就等于凭空造出一只可玩形态）',
    leaked.map((a) => a.name).join('、'))
  // 也不能和已有形态共用同一张图（那正是"两只长得一模一样"的来源）
  const usedArt = new Set(forms.filter((f) => f.art).map((f) => f.art))
  const dup = artOnly.filter((a) => usedArt.has(a.art))
  check(dup.length === 0, '「仅形象」与形态立绘没有重叠', dup.map((a) => a.name).join('、'))
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
