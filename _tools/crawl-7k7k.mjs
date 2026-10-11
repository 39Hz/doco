// 抓取 7k7k《多克多比》专区（doco.7k7k.com）与角色图鉴（jingling.7k7k.com/doco/）。
//
// 已实测确认的结构：
//   - 主站频道： /gl/（任务攻略） /fbjd/（副本解读） /xszn/（新手指南） /jinjie/（高手进阶）
//               /news/（新闻公告） /ask/（游戏问答） /zhoubian/（游戏周边）
//   - 文章地址两种形态： /content/<yyyymmdd>/<id>.html  和  /<yyyymmdd>-<id>.html
//   - 角色图鉴： jingling.7k7k.com/doco/4_<id>.html （4_ 前缀 = 多比；另有技能/索亚/怪物/NPC 分类）
//   - 编码 UTF-8。
//
// 输出： _web/7k7k/txt/<id>.txt、raw/<id>.html、catalog.json、juesecatalog.json
// 用法： node _tools/crawl-7k7k.mjs [并发数] [最大篇数]
import fs from 'node:fs'
import path from 'node:path'

const CONC = Number(process.argv[2] || 6)
const MAX = Number(process.argv[3] || 2000)
const ROOT = '_web/7k7k'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'

fs.mkdirSync(path.join(ROOT, 'txt'), { recursive: true })
fs.mkdirSync(path.join(ROOT, 'raw'), { recursive: true })
fs.mkdirSync(path.join(ROOT, 'juese'), { recursive: true })

const SEEDS = [
  'http://doco.7k7k.com/',
  'http://doco.7k7k.com/gl/',
  'http://doco.7k7k.com/fbjd/',
  'http://doco.7k7k.com/xszn/',
  'http://doco.7k7k.com/jinjie/',
  'http://doco.7k7k.com/news/',
  'http://doco.7k7k.com/ask/',
  'http://doco.7k7k.com/zhoubian/',
  'http://doco.7k7k.com/juesedaquan/',
  // 首页/正文里挖到的高价值单篇
  'http://doco.7k7k.com/content/20120628/179075.html', // 属性介绍
  'http://doco.7k7k.com/content/20120628/179066.html', // 技能搭配
  'http://doco.7k7k.com/content/20120628/179172.html', // 结印技能
  'http://doco.7k7k.com/content/20120628/179109.html', // 成就称号
  'http://doco.7k7k.com/content/20120628/179247.html', // 稀有多比
  'http://doco.7k7k.com/content/20120628/179182.html', // 副本奖励
  'http://doco.7k7k.com/content/20120628/179192.html', // 晶石碎片
  'http://doco.7k7k.com/content/20120628/179106.html', // 组队战斗
  'http://doco.7k7k.com/content/20120616/177591.html', // 练级指南
  'http://doco.7k7k.com/content/20120530/174763.html', // 快速赚钱
  'http://doco.7k7k.com/content/20140730/660881.html', // 技能大全
  'http://doco.7k7k.com/content/20140730/660889.html', // 巨岩骑士技能
  'http://doco.7k7k.com/content/20130418/574875.html', // 技能获得方法大全
  'http://doco.7k7k.com/content/20130416/574363.html', // 怎么买技能
  'http://doco.7k7k.com/content/20130419/575181.html', // 双重毒牙怎么获得
  'http://doco.7k7k.com/content/20130425/576194.html', // 上古技能获得大全
]

function decode(buf) {
  const utf8 = new TextDecoder('utf-8').decode(buf)
  const bad8 = (utf8.match(/\uFFFD/g) || []).length
  if (bad8 / Math.max(1, utf8.length) < 0.002) return utf8
  let gbk = ''
  try { gbk = new TextDecoder('gbk').decode(buf) } catch { return utf8 }
  return (gbk.match(/\uFFFD/g) || []).length < bad8 ? gbk : utf8
}
async function get(url) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 25000)
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA } })
    if (!r.ok) return null
    return decode(Buffer.from(await r.arrayBuffer()))
  } catch { return null } finally { clearTimeout(timer) }
}

// 文章链接：doco.7k7k.com 的两种形态
const ART_RE = /https?:\/\/doco\.7k7k\.com\/(?:content\/\d{8}\/)?(\d{5,7})\.html/g
// 角色图鉴链接
const JS_RE = /https?:\/\/jingling\.7k7k\.com\/doco\/(\d+_\d+)\.html/g

function artsOf(html) {
  const out = new Map()
  let m
  ART_RE.lastIndex = 0
  while ((m = ART_RE.exec(html))) {
    const id = m[1]
    if (!out.has(id)) out.set(id, m[0])
  }
  return out
}
function jueseOf(html) {
  const out = new Map()
  let m
  JS_RE.lastIndex = 0
  while ((m = JS_RE.exec(html))) if (!out.has(m[1])) out.set(m[1], m[0])
  return out
}

const seenArt = new Set()
const artQueue = []   // {id, url}
const jueseMap = new Map()  // key -> url

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d|td)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t\u3000]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
const MARK = /延伸阅读|猜你喜欢|热门专题传送门|上一篇|下一篇|版权声明|分享到QQ空间|有话要说/
function bodyOf(text, title) {
  let s = text
  if (title) { const i = s.indexOf(title); if (i > 0) s = s.slice(i + title.length) }
  const cut = s.search(MARK)
  if (cut > 0) s = s.slice(0, cut)
  return s.replace(/^[\s\-–—|]*\n?/, '').trim()
}

console.log('阶段 1：扫描种子页')
for (const s of SEEDS) {
  const html = await get(s)
  if (!html) { console.log(`  ✗ ${s}`); continue }
  const a = artsOf(html), j = jueseOf(html)
  let added = 0
  for (const [id, url] of a) if (!seenArt.has(id)) { seenArt.add(id); artQueue.push({ id, url }); added++ }
  for (const [k, url] of j) if (!jueseMap.has(k)) jueseMap.set(k, url)
  console.log(`  ✓ ${s}  文章 +${added}（队列 ${artQueue.length}）  角色 +${j.size}（共 ${jueseMap.size}）`)
}

console.log(`\n阶段 2：BFS 抓文章（队列 ${artQueue.length}，上限 ${MAX}）`)
const results = []
let ok = 0, miss = 0
const t0 = Date.now()
let cursor = 0
while (cursor < artQueue.length && ok < MAX) {
  const batch = artQueue.slice(cursor, cursor + CONC)
  cursor += CONC
  await Promise.all(batch.map(async ({ id, url }) => {
    const html = await get(url)
    if (!html) { miss++; return }
    fs.writeFileSync(path.join(ROOT, 'raw', `${id}.html`), html, 'utf8')
    const title = (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/[_|].*$/, '').trim()
    const date = (html.match(/发布时间：\s*(20\d\d-\d\d-\d\d[^<]*)/) || [])[1] || ''
    const body = bodyOf(stripTags(html), title)
    fs.writeFileSync(path.join(ROOT, 'txt', `${id}.txt`), `【${title}】 ${date}\n${body}`, 'utf8')
    results.push({ id, url, title, date, chars: body.length })
    for (const [nid, nurl] of artsOf(html)) if (!seenArt.has(nid)) { seenArt.add(nid); artQueue.push({ id: nid, url: nurl }) }
    for (const [k, u] of jueseOf(html)) if (!jueseMap.has(k)) jueseMap.set(k, u)
    ok++
    if (ok % 50 === 0) console.log(`  ${ok} 篇  ${String(title).slice(0, 34)}  队列剩 ${artQueue.length - cursor}`)
  }))
}
console.log(`文章阶段用时 ${((Date.now() - t0) / 1000).toFixed(1)}s，成功 ${ok}，失败 ${miss}`)

console.log(`\n阶段 3：抓角色图鉴 ${jueseMap.size} 个`)
let jok = 0, jmiss = 0
const jkeys = [...jueseMap.keys()]
for (let i = 0; i < jkeys.length; i += CONC) {
  await Promise.all(jkeys.slice(i, i + CONC).map(async (k) => {
    const html = await get(jueseMap.get(k))
    if (!html) { jmiss++; return }
    fs.writeFileSync(path.join(ROOT, 'juese', `${k}.html`), html, 'utf8')
    const title = (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/[_|].*$/, '').trim()
    fs.writeFileSync(path.join(ROOT, 'juese', `${k}.txt`), `【${title}】\n${bodyOf(stripTags(html), title)}`, 'utf8')
    jok++
  }))
}
console.log(`角色图鉴：成功 ${jok}，失败 ${jmiss}`)

fs.writeFileSync(path.join(ROOT, 'catalog.json'), JSON.stringify(results.sort((a, b) => a.id.localeCompare(b.id)), null, 1), 'utf8')
fs.writeFileSync(path.join(ROOT, 'juesecatalog.json'), JSON.stringify(jkeys, null, 1), 'utf8')

// 自检
const txt = fs.readdirSync(path.join(ROOT, 'txt'))
const raw = fs.readdirSync(path.join(ROOT, 'raw'))
const jt = fs.readdirSync(path.join(ROOT, 'juese')).filter((f) => f.endsWith('.txt'))
console.log(`\n自检：文章 raw=${raw.length} txt=${txt.length}（记录 ${results.length}）  角色 txt=${jt.length}`)
if (raw.length !== txt.length) { console.error('!! 文章落盘不一致'); process.exit(1) }
if (jt.length === 0) { console.error('!! 角色图鉴一篇都没抓到'); process.exit(1) }
let moji = 0
for (const f of txt) if (/\uFFFD|锟斤拷/.test(fs.readFileSync(path.join(ROOT, 'txt', f), 'utf8'))) moji++
console.log(`乱码 ${moji}/${txt.length}`)
const size = txt.reduce((s, f) => s + fs.statSync(path.join(ROOT, 'txt', f)).size, 0)
console.log(`总正文 ${(size / 1024) | 0} KB，平均 ${(size / Math.max(1, txt.length) / 1024).toFixed(1)} KB/篇`)
