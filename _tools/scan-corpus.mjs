// 在抓下来的语料（_web/7k7k/txt、_web/5068/txt）里查证关键词，为 M4「只有名字没有规则」的系统找依据。
//
// 规则 R10：先证据，后实现。这个脚本只回答"原文有没有、原文怎么说"，不做任何推断。
//
// 【为什么需要 clean()】
// 第一版直接全文搜，结果「进阶」命中 2507 个页面 / 3105 处 —— 全是站点导航条里的
// 「高手进阶」。而我的判据是"上下文含数字 → 可能有规则"，导航条里塞满了日期和数字，
// 于是 3105 处**全部**被标成"可能有规则"。真事故和假信号混在一起，等于没查。
// 现在先用 clean() 切出正文区域再搜，并**自证**：清洗后的语料里不允许再出现"高手进阶""热门搜索"。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIRS = ['_web/7k7k/txt', '_web/5068/txt']

// M4-4 待查证清单（docs/官方资料库.md 第九章 + BLOCKED.md C 节）
const DEFAULT_KEYS = [
  '声望', '记忆力', '材料买卖', '成就称号', '战报任务', '晶石碎片',
  '稀有多比', '副本奖励', '战斗力计算器', '变身唤醒', '恢复生命',
  '购买服饰', '附魔', '进阶',
]
// M4-1 十四个官方副本
const DUNGEONS = [
  '金字塔', '火烧赤壁', '索亚迷局', '战神金刚', '大禹治水', '阿特兰斯', '紫晶洞',
  '英雄抉择', '凤凰考验', '武当保卫战', '太空堡垒', '噜噜王的终结', '大陆棋', '晶石对战',
]

const argv = process.argv.slice(2)
const mode = argv[0] === 'dungeons' ? 'dungeons' : 'systems'
const keys = argv.length && argv[0] !== 'dungeons' ? argv : (mode === 'dungeons' ? DUNGEONS : DEFAULT_KEYS)

// 站点导航/页脚样板：出现在几乎每个页面里，必须剔除，否则全是假命中
const BOILER = [
  '指尖捕鱼', '热门搜索', '高手进阶', '精彩视频', '游戏问答', '玩家交流',
  '复制本文地址推荐给朋友', '这篇文章有用，我要收藏', '我要收藏 [我说两句]',
  '游戏首页', '新闻公告', '任务攻略', '副本解读', '游戏周边', '新手指南', 'vip特权',
]

function clean(text) {
  let s = text
  // 正文从最后一个「当前位置：…>」之后开始（前面全是导航）
  const pos = s.lastIndexOf('当前位置')
  if (pos >= 0) {
    const gt = s.indexOf('>', pos)
    if (gt >= 0) s = s.slice(gt + 1)
  }
  // 页脚从这里开始，砍掉
  for (const cut of ['复制本文地址推荐给朋友', '这篇文章有用，我要收藏']) {
    const i = s.indexOf(cut)
    if (i >= 0) s = s.slice(0, i)
  }
  // 逐行剔除含样板词的行
  s = s.split('\n').filter((ln) => !BOILER.some((b) => ln.includes(b))).join('\n')
  return s
}

// ---- 载入语料 ----
const docs = []
for (const d of DIRS) {
  const p = path.join(ROOT, d)
  if (!fs.existsSync(p)) continue
  for (const f of fs.readdirSync(p)) {
    if (!f.endsWith('.txt')) continue
    docs.push({ src: d.includes('7k7k') ? '7k7k' : '5068', file: f, raw: fs.readFileSync(path.join(p, f), 'utf8') })
  }
}
if (!docs.length) { console.error('语料为空，先跑抓取脚本'); process.exit(1) }
for (const d of docs) d.text = clean(d.raw)

// ---- 自证：清洗必须真的把样板剔掉，否则后面的命中数不可信 ----
const dirty = BOILER.filter((b) => docs.some((d) => d.text.includes(b)))
if (dirty.length) {
  console.error('自检失败：清洗后语料里仍残留样板词 → ' + dirty.join('、'))
  process.exit(1)
}
const shrunk = docs.reduce((a, d) => a + d.raw.length, 0) - docs.reduce((a, d) => a + d.text.length, 0)
console.log(`语料：${docs.length} 个页面，清洗掉样板 ${(shrunk / 1024).toFixed(0)} KB（自检通过）`)

const out = []
out.push(mode === 'dungeons' ? '# 语料查证报告 —— 14 个官方副本' : '# 语料查证报告 —— 已确认未实现的系统')
out.push('')
out.push(`语料：${docs.length} 个页面（_web/7k7k/txt、_web/5068/txt），已剔除站点导航样板。`)
out.push('')
out.push('> 判定"有规则依据"的标准：正文里出现了**数值/条件/效果描述**，而不只是把名字列在列表里。')
out.push('> 只列原文命中，不做推断。')
out.push('')

const summary = []
for (const k of keys) {
  const hits = []
  for (const d of docs) {
    let idx = d.text.indexOf(k)
    while (idx >= 0 && hits.length < 400) {
      const s = Math.max(0, idx - 100)
      const e = Math.min(d.text.length, idx + k.length + 150)
      const ctx = d.text.slice(s, e).replace(/\s+/g, ' ').trim()
      if (ctx.length >= k.length + 20) hits.push({ src: d.src, file: d.file, ctx })
      idx = d.text.indexOf(k, idx + k.length)
    }
  }
  const pages = new Set(hits.map((h) => h.file))
  summary.push({ key: k, pages: pages.size, hits: hits.length })

  out.push(`## ${k}`)
  out.push('')
  out.push(`命中 ${hits.length} 处 / ${pages.size} 个页面`)
  out.push('')
  if (!hits.length) {
    out.push('**正文里没有出现。** 标注 `missing`，不得按名称臆测玩法。')
    out.push('')
    continue
  }
  // 每个页面取最长的一条上下文（信息量最大）
  const best = {}
  for (const h of hits) if (!best[h.file] || h.ctx.length > best[h.file].ctx.length) best[h.file] = h
  for (const h of Object.values(best).slice(0, 3)) {
    out.push(`- \`${h.src}/${h.file}\``)
    out.push(`  > ${h.ctx}`)
  }
  out.push('')
}

const file = mode === 'dungeons' ? 'docs/语料查证报告-副本.md' : 'docs/语料查证报告.md'
fs.writeFileSync(path.join(ROOT, file), out.join('\n') + '\n', 'utf8')

console.log('')
console.log('关键词'.padEnd(18) + '页面   命中')
for (const s of summary) console.log(String(s.key).padEnd(16) + String(s.pages).padStart(4) + String(s.hits).padStart(7))
console.log(`\n详细报告 → ${file}`)
