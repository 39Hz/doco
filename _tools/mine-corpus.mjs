// 语料召回：在一堆关键词里找"能定玩法"的原文（R10 的取证端 · 00-PLAN.md C9）
//
// 【为什么要有它】
// 第 44 轮证明了一条路：**「飞翔的衣服」原本只有一个文件名**，靠 7k7k 官方攻略页 534823
// 把玩法逐字读全（衣服满天飞 → 用网抓 → 要判断方向提前下网 → 越后面越多越快 → 限时），
// 于是它从"只有名字"变成了可玩，还把"提前下网"立成了真机制。
// 但语料有 **2505 篇（7k7k）+ 167 篇（5068）**，不可能一篇篇喂给 AI 读（C3/C9 禁止）。
// 所以：**脚本先召回、按"玩法密度"排序，AI 只精读最有戏的那几篇。**
//
// 召回分两层：
//   ① 精确层：篇名含目标名（最强信号，标题里点了名就是专门写它的）
//   ② 全文层：正文含目标名，且命中窗口里还有"玩法词"（操作/目标/关卡/时间…）
// 噪声：每篇正文都带网站导航（"热门搜索 金字塔 城堡 激活码…"），
//       单靠全文匹配会把每篇都算命中 → 用"导航行剔除 + 玩法词计分"过滤掉。
//
// 用法:
//   node _tools/mine-corpus.mjs 哈里的金币 冲上云霄 疯狂冰激凌 魔镜世界
//   node _tools/mine-corpus.mjs --top 6 --min 1 --json out.json 阿特兰斯 机关密道
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const P = (...p) => path.join(ROOT, ...p)

const argv = process.argv.slice(2)
const opt = { top: 8, min: 1, json: null, width: 110 }
const terms = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--top') opt.top = Number(argv[++i])
  else if (a === '--min') opt.min = Number(argv[++i])
  else if (a === '--json') opt.json = argv[++i]
  else if (a === '--width') opt.width = Number(argv[++i])
  else terms.push(a)
}
if (!terms.length) { console.error('用法: node _tools/mine-corpus.mjs <关键词…>'); process.exit(2) }

// 玩法词：窗口里出现越多，越可能是"在讲怎么玩"。全部来自已成功解读过的页面用词。
const PLAY_WORDS = ['玩法', '操作', '方向键', '鼠标', '点击', '空格', '按', '控制', '移动', '顶', '抓', '射', '跳',
  '关卡', '第', '关', '时间', '限定', '失败', '成功', '过关', '通关', '得分', '分数', '评级', '等级',
  '目标', '胜利', '奖励', '规则', '注意', '进入游戏', '小游戏', '挑战', '技巧', '攻略', '秘诀']
const NAV_WORDS = ['热门搜索', '游戏首页', '新闻公告', '任务攻略', '副本解读', '游戏周边', '新手指南',
  '高手进阶', '精彩视频', '游戏问答', '玩家交流', 'vip特权', '指尖捕鱼', '洛克王国', '特战英雄', '弹弹堂',
  '迷你世界', '皮卡堂', '三国杀', '完美漂移', '全民坦克大战', '推理学院', '手机游戏', '更多', '收藏', '分享']

// ---------- 载入语料 ----------
function loadCorpus() {
  const docs = []
  for (const [site, dir, catPath] of [
    ['7k7k', P('_web', '7k7k', 'txt'), P('_web', '7k7k', 'catalog.json')],
    ['5068', P('_web', '5068', 'txt'), P('_web', '5068', 'index.json')],
  ]) {
    let cat = {}
    try {
      const arr = JSON.parse(fs.readFileSync(catPath, 'utf8').replace(/^\uFEFF/, ''))
      for (const e of arr) cat[String(e.id)] = e
    } catch { /* 目录文件缺失也不致命 */ }
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.txt')) continue
      const id = f.replace(/\.txt$/, '')
      let text = ''
      try { text = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^\uFEFF/, '') } catch { continue }
      const meta = cat[id] || {}
      docs.push({ site, id, title: meta.title || (text.match(/^【([^】]+)】/) || [])[1] || id, date: meta.date || '', text })
    }
  }
  return docs
}
const DOCS = loadCorpus()

// ---------- 窗口抽取 ----------
/** 把正文切成"句子"，并丢掉网站导航那种没标点的碎行。 */
function sentences(text) {
  return text
    .split(/[\n\r]+/)
    .flatMap((line) => line.split(/(?<=[。！？；])/))
    .map((s) => s.trim())
    .filter((s) => s.length >= 6 && !NAV_WORDS.some((n) => s.includes(n)))
}
function playScore(win) {
  let s = 0
  for (const w of PLAY_WORDS) if (win.includes(w)) s++
  // 引号里的原话（攻略常把官方提示原文抄下来）与"多克"称呼额外加权
  if (/[「“”"]/.test(win)) s += 2
  if (win.includes('小多克')) s += 2
  if (/(第\s*\d+\s*关|\d+\s*秒|\d+\s*分)/.test(win)) s += 2
  return s
}
/** 一个词在一篇里的命中：返回窗口 + 玩法分。 */
function windowsOf(doc, term) {
  const titleHit = doc.title.includes(term)
  const out = []
  if (!doc.text.includes(term)) return { titleHit, wins: out }
  const sents = sentences(doc.text)
  for (let i = 0; i < sents.length; i++) {
    if (!sents[i].includes(term)) continue
    // 命中句 + 前后各两句当上下文
    const win = sents.slice(Math.max(0, i - 2), Math.min(sents.length, i + 3)).join('')
    out.push({ text: win, score: playScore(win) + (titleHit ? 3 : 0) })
  }
  // 同一篇里多个窗口只留最高分那个
  out.sort((a, b) => b.score - a.score)
  return { titleHit, wins: out.slice(0, 1) }
}

// ---------- 召回 + 打印 ----------
const report = {}
let grand = 0
for (const term of terms) {
  const hits = []
  for (const doc of DOCS) {
    const { titleHit, wins } = windowsOf(doc, term)
    if (titleHit) hits.push({ ...doc, titleHit: true, win: wins[0] ? wins[0].text : '', score: (wins[0] ? wins[0].score : 0) + 3 })
    else if (wins.length && wins[0].score >= opt.min) hits.push({ ...doc, titleHit: false, win: wins[0].text, score: wins[0].score })
  }
  hits.sort((a, b) => (b.titleHit - a.titleHit) || (b.score - a.score))
  report[term] = hits
  grand += hits.length

  const titles = hits.filter((h) => h.titleHit)
  console.log(`\n${'='.repeat(100)}`)
  console.log(`【${term}】命中 ${hits.length} 篇 —— 篇名命中 ${titles.length} 篇`)
  if (titles.length) {
    console.log('  ── 篇名命中（最强信号）──')
    for (const h of titles.slice(0, opt.top)) console.log(`    ${h.site}/${h.id}  ${h.date.slice(0, 10)}  ${h.title}`)
  }
  const body = hits.filter((h) => !h.titleHit)
  if (body.length) {
    console.log(`  ── 正文命中（按玩法密度排序，取前 ${Math.min(opt.top, body.length)} 篇）──`)
    for (const h of body.slice(0, opt.top)) {
      const t = h.win.replace(/\s+/g, ' ').trim()
      console.log(`    ${h.site}/${h.id} 分${h.score}  ${h.title}`)
      console.log(`      ${t.length > opt.width * 3 ? t.slice(0, opt.width * 3) + '…' : t}`)
    }
  }
  if (!hits.length) console.log('  （0 命中 —— 这个词在语料里查不到）')
}

console.log(`\n${'='.repeat(100)}`)
console.log(`合计命中 ${grand} 篇（语料 ${DOCS.length} 篇：7k7k ${DOCS.filter((d) => d.site === '7k7k').length} + 5068 ${DOCS.filter((d) => d.site === '5068').length}）`)
if (opt.json) {
  const slim = {}
  for (const [k, v] of Object.entries(report)) {
    slim[k] = v.map((h) => ({ site: h.site, id: h.id, title: h.title, date: h.date, titleHit: h.titleHit, score: h.score, win: h.win.slice(0, 600) }))
  }
  fs.writeFileSync(P(opt.json), JSON.stringify(slim, null, 1), 'utf8')
  console.log(`已写出 ${opt.json}`)
}
