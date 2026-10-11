// 把官方立绘写进 assets/forms.js（每个形态的 art / artIcon / artEvidence）。
//
// 同时修正 spriteDir：早先是「没有专属帧就按元素借用同系多比的帧」，
// 结果瑞比特·兔（风）借到了龙多比、艾斯·林（水）借到了光多比 —— 用户看到的
// 「形象用错了」就是这个。现在形象一律以官方立绘为准；
// spriteDir 只在立绘加载失败时兜底，取值也改成按元素就近，并写进注释说明它不再是形象来源。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const FORMS_JS = path.join(ROOT, 'assets', 'forms.js')
const FORMS_JSON = path.join(ROOT, 'assets', 'forms.json')
const ART_INDEX = path.join(ROOT, 'assets', 'forms', 'art', 'index.json')

if (!fs.existsSync(ART_INDEX)) { console.error('先跑 _tools/build-form-art.mjs'); process.exit(1) }
const artIdx = JSON.parse(fs.readFileSync(ART_INDEX, 'utf8'))
// 形态表里的名字带空格和「多比」后缀（`克罗 多比`），立绘索引里是短名（`克罗`）——统一归一化再对
const key = (s) => String(s || '').replace(/多比|[\s·・]/g, '')
const byName = new Map(artIdx.forms.map((f) => [key(f.name), f]))

// 兜底动画目录：按元素就近。注意这只是「立绘加载不出来时画什么」，不是形象定义。
const DIR_BY_ELEMENT = {
  无: '超级克罗多比形态序列', 火: '凤凰多比形态序列', 水: '龙多比形态序列',
  风: '龙多比形态序列', 土: '蝎多比形态序列', 光: '光多比形态序列',
  暗: '暗多比形态序列', 毒: '蝎多比形态序列',
}
// 身份就是这只的，优先保留
const DIR_BY_NAME = { 德拉科龙: '龙多比形态序列', 超级克罗: '超级克罗多比形态序列' }

const raw = fs.readFileSync(FORMS_JS, 'utf8')
const json = raw.replace(/^[\s\S]*?window\.__DKDbb_FORMS__\s*=\s*/, '').replace(/;\s*$/, '')
const data = JSON.parse(json)

const animDirs = new Set()
{
  const p = path.join(ROOT, 'assets', 'anim', 'index.json')
  if (fs.existsSync(p)) {
    for (const a of Object.values(JSON.parse(fs.readFileSync(p, 'utf8')).actions)) animDirs.add(a.dir.split('/')[0])
  }
}

let nArt = 0, nDir = 0, nMissing = 0
for (const f of data.forms) {
  const a = byName.get(key(f.name))
  if (a) {
    f.art = a.file
    f.artIcon = a.icon
    f.artSrc = a.src
    f.artEvidence = a.evidence
    f.artPrimary = true
    f.artMissing = false
    nArt++
  } else {
    // 【第 30 轮改】没有官方立绘时，**不再借同元素的帧来充数**。
    // 用户报的 bug 就是"瑞比特·兔画成了龙多比"—— 靠借用帧必然重现这个问题，
    // 而且是 24 只一起重现。现在的做法：明确标 artMissing，界面画中性占位 + 「无官方立绘」，
    // 宁可不给形象，也不给一个错形象（R9）。
    f.art = null; f.artIcon = null; f.artPrimary = false
    f.artMissing = true
    f.tint = null
    nMissing++
  }
  // 兜底动画目录只在"有立绘但图加载失败"时用；没有立绘的形态不用它（免得又变成借形象）
  const want = DIR_BY_NAME[key(f.name)] || DIR_BY_ELEMENT[f.element] || '超级克罗多比形态序列'
  const dir = animDirs.has(want) ? want : [...animDirs][0] || null
  if (dir && dir !== f.spriteDir && !f.artMissing) { console.log(`  ${f.name.padEnd(10)} spriteDir ${f.spriteDir} -> ${dir}`); nDir++ }
  f.spriteDir = f.artMissing ? null : dir
  if (f.artMissing) f.tint = null
}
console.log(`  挂了官方立绘 ${nArt} 只；无官方立绘（标 artMissing，界面用中性占位）${nMissing} 只`)

// ---------- 「仅形象」条目（第 32 轮新增）----------
// 美术映射表里有、而**形态表里没有**的条目，以前等于**静默消失**
// （达鲁·龙、风多比都发生过：图生成了、没人用，谁也不知道）。
// 现在它们进 `artOnly`：图鉴里作为「仅形象 · 无官方数值」展示，
// 既让原版美术能被看到，又**不进形态表**（不会被掉落抽到、不会进战斗）。
// 这一条同时也是自检：孤儿映射会显式出现在界面上，而不是无声无息。
const formKeys = new Set(data.forms.map((f) => key(f.name)))
const artOnly = []
for (const f of artIdx.forms) {
  if (formKeys.has(key(f.name))) continue
  artOnly.push({ name: f.name, art: f.file, artIcon: f.icon, src: f.src, evidence: f.evidence })
}
data.artOnly = artOnly
if (artOnly.length) console.log(`  其中 ${artOnly.length} 条不是形态表里的形态 → 收进「仅形象」（图鉴可见、不进战斗）：${artOnly.map((x) => x.name).join('、')}`)

data.note = '七维/十维数值来自原版策划表；形象一律用官方立绘（art/artIcon，见 _tools/build-form-art.mjs）。' +
  'spriteDir 只是立绘加载失败时的兜底动画目录，按元素就近取值，**不代表该形态的官方形象**。' +
  '第 30 轮起：归档里查不到官方立绘的形态，art=null 且 artMissing=true，界面画中性占位 —— **不借别的形态的帧**（那正是用户报过的 bug）。' +
  '攻击区间已收敛到 34~40（见 _tools/squash-forms.mjs）。'
data.counts = { ...(data.counts || {}), forms: data.forms.length, withArt: nArt, artMissing: nMissing }

const out = JSON.stringify(data)
fs.writeFileSync(FORMS_JSON, JSON.stringify(data, null, 2))
fs.writeFileSync(FORMS_JS,
  '/* 自动生成，勿手改。重跑 _tools/gen-forms.mjs + _tools/apply-form-art.mjs */\n' +
  'window.__DKDbb_FORMS__ = ' + out + ';\n')
console.log(`\n已写入 ${nArt} 个形态的官方立绘引用，修正 ${nDir} 个 spriteDir`)
for (const f of data.forms) console.log(`  ${f.name.padEnd(10)} ${String(f.element).padEnd(2)} ${f.art ? f.art.padEnd(30) : '（无立绘）'}`)
