// 生成「场景命名工作表」——把 D3（88 个场景的官方名）做成一勾就完
//
// 【为什么要有它】D3 是全程**唯一真正需要人类**的事（`00-PLAN.md` §4 的 A 档）。
// 原先交付的 `场景命名工作表.csv` 只有"我的推断名"一列 + 一个空列，人类得从零想 77 个名字 ——
// 那不是"一勾就完"，是把活原样推给人。
//
// 这一版的改法：
//   ① 「我的推断名」直接放在第一列（77 个场景都已经有名字，人只需要**否决**而不是从零起）
//   ② 用 `_tools/mine-corpus.mjs`（第 47 轮新建）在 2672 篇语料里**召回官方场景地名候选**，
//      把命中的地名 + 出处页号填进第二列 —— 人可以从候选里挑，也可以自己写
//   ③ `conf=official` 的场景**明确标出来并锁定**（第 33 轮已用感知比对确认过的 11 个），
//      免得人重复劳动
//
// 用法: node _tools/make-scene-naming-sheet.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const P = (...p) => path.join(ROOT, ...p)
const read = (p) => fs.readFileSync(P(p), 'utf8').replace(/^\uFEFF/, '')

const man = JSON.parse(read('assets/manifest.json'))
const scenes = man.scenes.slice().sort((a, b) => a.id - b.id)

// ---------- 1) 语料里召回"地名候选" ----------
// 只认**看起来像地名**的短语：含 城堡/大街/学院/峡谷/城/岛/森林/洞/池/崖/宫殿/塔/平原/矿坑/裂谷/湖畔/学堂/大厅…
const PLACE_RE = /[\u4e00-\u9fa5]{2,6}(城堡|大街|学院|峡谷|智慧城|森林|洞|池|崖|宫殿|塔|平原|矿坑|裂谷|湖畔|学堂|大厅|走道|广场|集市|港口|海岸|沙滩|遗迹|密道|战场|村落|小镇|庄园|废墟|洞窟|迷宫|祭坛|神殿|营地|营地)/g
const docs = []
for (const dir of ['_web/7k7k/txt', '_web/5068/txt']) {
  if (!fs.existsSync(P(dir))) continue
  for (const f of fs.readdirSync(P(dir))) {
    if (!f.endsWith('.txt')) continue
    try {
      let s = fs.readFileSync(P(dir, f))
      // 与 read-corpus.mjs 同款编码判别（5068 站是 GBK）
      let text
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(s)
        if (/\uFFFD/.test(text)) throw new Error('bad')
      } catch { text = new TextDecoder('gbk').decode(s) }
      docs.push({ id: f.replace(/\.txt$/, ''), site: dir.includes('7k7k') ? '7k7k' : '5068', text })
    } catch { /* 单篇坏了不影响全局 */ }
  }
}
const cand = new Map()   // 地名 → { n, pages:Set }
// 召回出来的短语常带一个"粘"上来的功能字（「在紫晶洞」「来到多比广场」）→ 先剥掉，
// 否则工作表里会出现「在紫晶洞」这种不是地名的候选（第一版就是这样，人看了会莫名其妙）。
const STRIP_PREFIX = /^(在|到|去|从|进入|来到|前往|回到|离开|经过|靠近|路过|位于)+/
// 最短 2 字：像「熔岩池」「图书馆」这种**短地名**恰恰是最有用的候选
// （第一版要求 ≥3 字，结果把 2 字地名全滤掉了，而它们可能正是答案）。
const STOP2 = new Set(['一个', '两个', '这个', '那个', '什么', '地方', '这里', '那里', '可以', '就是', '我们', '你们', '他们'])
for (const d of docs) {
  for (const m of d.text.matchAll(PLACE_RE)) {
    const name = m[0].replace(STRIP_PREFIX, '')
    if (name.length < 2 || STOP2.has(name)) continue
    if (!cand.has(name)) cand.set(name, { n: 0, pages: new Set() })
    const c = cand.get(name)
    c.n++
    if (c.pages.size < 3) c.pages.add(`${d.site}/${d.id}`)
  }
}
// 只留有分量的（出现 ≥2 次），按频次排序
const candList = [...cand.entries()].filter(([, v]) => v.n >= 2).sort((a, b) => b[1].n - a[1].n)
console.log(`语料 ${docs.length} 篇 → 地名候选 ${candList.length} 个（出现 ≥2 次的）`)

// ---------- 2) 每个场景匹配候选（按推断名里的关键词命中） ----------
function suggestFor(sc) {
  const title = sc.title || ''
  const hits = []
  for (const [name, v] of candList) {
    // 推断名与候选名有 ≥2 个连续汉字重合 → 认为相关
    for (let i = 0; i + 2 <= title.length; i++) {
      if (name.includes(title.slice(i, i + 2))) { hits.push({ name, n: v.n, pages: [...v.pages] }); break }
    }
  }
  return hits.sort((a, b) => b.n - a.n).slice(0, 3)
}

// ---------- 3) 写 CSV（Excel 直接开：UTF-8 BOM + CRLF） ----------
const rows = [['场景ID', '我的推断名(derived)', '语料候选(含出处)', '官方名(请填写/勾选)', '依据等级', '备注']]
for (const sc of scenes) {
  const conf = sc.nameConf || sc.conf || (sc.officialName ? 'official' : 'derived')
  const sug = suggestFor(sc)
  const isOfficial = conf === 'official'
  rows.push([
    sc.id,
    isOfficial ? (sc.officialName || sc.title) : (sc.title || '（未命名）'),
    sug.length ? sug.map((s) => `${s.name}(${s.pages[0]}${s.n > 2 ? '×' + s.n : ''})`).join(' / ') : '（语料里没召回到）',
    isOfficial ? '★ 已是官方名，无需填写' : '',
    isOfficial ? 'official（已用感知比对确认）' : 'derived（推断）',
    isOfficial ? '第 33 轮复核过，两个独立归档来源一致' : (sug.length ? '有语料候选，可直接勾选' : '只按画面物体推断'),
  ])
}
const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
fs.writeFileSync(P('场景命名工作表.csv'), '\uFEFF' + csv, 'utf8')
console.log(`✓ 场景命名工作表.csv 已写出（${rows.length - 1} 个场景）`)

// ---------- 4) 同时给一份人读的 Markdown（按"最容易填"排序） ----------
const official = rows.slice(1).filter((r) => r[4].startsWith('official'))
const withCand = rows.slice(1).filter((r) => r[4].startsWith('derived') && !r[2].startsWith('（语料'))
const noCand = rows.slice(1).filter((r) => r[4].startsWith('derived') && r[2].startsWith('（语料'))
const md = []
md.push('# 场景命名工作表（D3 · 唯一需要人类的一项）\n')
md.push(`> 88 个场景里 **${official.length} 个已经是官方名**（锁定，不用填）、`)
md.push(`**${withCand.length} 个有语料候选**（可以从候选里勾）、**${noCand.length} 个只有我的推断**（要你定）。\n`)
md.push('> 填法：在 `场景命名工作表.csv` 的「官方名(请填写/勾选)」列写名字（或复制候选列里的候选），保存即可。\n')
md.push('> 缩略图见 `docs/shots/场景命名工作表.png`。\n')

// ── 顺带把 M2-2（场景 → 七大地形）里"官方名暗示与美术分组不一致"的几个并进来 ──
// 目的：人一次勾完，不要为两件事开两次会。见 docs/场景地形归属.md。
{
  let terr = null
  try { terr = JSON.parse(read('docs/场景地形归属.json')) } catch (e) { terr = null }
  const rev = (terr && terr.scenes ? terr.scenes : []).filter((r) => r.review)
  if (rev.length) {
    md.push('\n## ★ 顺手勾一下：这几个场景该归哪个地形？（4 个，一勾就完）\n')
    md.push('> 背景：项目里那 11 座岛是**按美术资源相似度**分的组，不是原版结构；官方只有**七大地形**。')
    md.push('> 下面这几个场景**有官方名字**，名字像另一个地形，但我不够确定，所以没擅自改。')
    md.push('> 你只要在最后一列写「同意」（保持现状）或「改成 X」。详见 `docs/场景地形归属.md`。\n')
    md.push('| 场景 | 官方名 | 现在归 | 名字更像 | 你的裁定 |')
    md.push('|---|---|---|---|---|')
    for (const r of rev) md.push(`| \`${r.scene}\` | **${r.officialName}** | ${r.review.keep} | ${r.review.suggest} |  |`)
    md.push('\n> 已经确定的两条**不用你管**（官方名太明确，我已直接改判）：')
    md.push('> `28`「城堡郊外」多比学院 → **多比城堡**；`43`「城堡走道」勇气峡谷 → **多比城堡**。\n')
  }
}

const table = (list, title, hint) => {
  if (!list.length) return
  md.push(`\n## ${title}（${list.length} 个）\n`)
  md.push(`> ${hint}\n`)
  md.push('| 场景 | 我的推断名 | 语料候选 | 官方名（请填） |')
  md.push('|---|---|---|---|')
  for (const r of list) md.push(`| \`${r[0]}\` | ${r[1]} | ${r[2]} |  |`)
}
table(withCand, 'A · 有语料候选（优先填这批，可以直接抄候选）', '候选后面括号里是出处页号，出现次数多的更可信。')
table(noCand, 'B · 只有推断名（语料里没召回到候选）', '这些只能靠你的原版记忆；实在想不起来就留空，保持 derived。')
md.push('\n## C · 已是官方名（锁定，不用填）\n')
md.push('| 场景 | 官方名 | 依据 |')
md.push('|---|---|---|')
for (const r of official) md.push(`| \`${r[0]}\` | ${r[1]} | ${r[5]} |`)
md.push('\n> 这 11 个是第 33 轮用感知比对（Pearson 相关距离）+ 人工复核对上的，**两个互不相干的归档来源一致指认同一张**，所以标 official。\n')
fs.writeFileSync(P('场景命名工作表.md'), md.join('\n'), 'utf8')
console.log(`✓ 场景命名工作表.md 已写出（官方名 ${official.length} / 有候选 ${withCand.length} / 仅推断 ${noCand.length}）`)
