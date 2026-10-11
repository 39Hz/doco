// 抓取 5068儿童网《多克多比》专区全部四个频道的文章。
//
// 已实测确认的站点结构（不是猜的）：
//   - 频道： /dkdb/gl/（攻略） /dkdb/zl/（游戏资料） /dkdb/help/（帮助中心） /dkdb/（专区首页）
//   - 文章地址： /dkdb/<频道>/<id>.html
//   - 列表页是 JS 无限滚动，但接口 /plus/list.php 已 404（站点半废弃），
//     所以只能靠「各频道索引页 + 文章页的 相关阅读/猜您喜欢/热点排行/网友推荐」做链接图 BFS。
//   - 页面是 UTF-8，但 SSI include 失败会留下坏字节，因此按 U+FFFD 比例判定编码。
//
// 输出： _web/5068/catalog.json、txt/<id>.txt、raw/<id>.html
// 用法： node _tools/crawl-5068.mjs [并发数] [最大篇数]
import fs from 'node:fs'
import path from 'node:path'

const CONC = Number(process.argv[2] || 6)
const MAX = Number(process.argv[3] || 1500)
const ROOT = '_web/5068'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'

fs.mkdirSync(path.join(ROOT, 'txt'), { recursive: true })
fs.mkdirSync(path.join(ROOT, 'raw'), { recursive: true })

// 四个频道的索引页（种子，不入库，只用来发现链接）
const SEEDS = [
  'http://xx.5068.com/dkdb/index.html',
  'http://xx.5068.com/dkdb/gl/index.html',
  'http://xx.5068.com/dkdb/zl/index.html',
  'http://xx.5068.com/dkdb/help/index.html',
  'http://mxx.5068.com/dkdb/gl/index.html',
  'http://mxx.5068.com/dkdb/zl/index.html',
  'http://mxx.5068.com/dkdb/help/index.html',
]
// 手工补入的高价值文章（索引页只列最近 30 篇，这些是正文/热点榜里挖出来的）
const KNOWN = [
  81129, 81125, 78254, 72606, 68964, 68962,          // 游戏资料：巨岩骑士/曼陀罗/八大骑士图/七大地形/公告
  919, 75208, 74263, 72612, 72608, 70937,            // 帮助：材料/药剂/记忆力/沙克试炼/声望/电光球
  928, 42619, 41798, 12905, 17877, 32409, 32412, 32408, 32413, 30398, 8429, 37110, 9148,
  82383, 83033, 83037, 81128, 81127, 81124, 81026, 80622, 80127, 77939, 76320, 76319,
  76317, 76314, 76313, 72599, 72594, 34202,
  902, 904, 906, 907, 908, 910, 911, 929, 8724, 77011, 77012, 78920, 79376, 80128, 10854, 10438, 9333,
  72605, 72602, 79538, 78258, 77938, 75204, 74261, 81726,
]

// 编码判定：以 HTML 自己声明的 charset 为准。
// 踩过的坑：不能靠「比较两种解码谁的 U+FFFD 少」——GBK 几乎能解码任意字节序列且不产生
// 替换字符，所以这个判据永远偏向 GBK；而正文页里 SSI include 失败留下的坏字节会让
// 「UTF-8 坏字符比例 < 0.2%」的判据失败，于是整页被当成 GBK → 全篇乱码。
function decode(buf) {
  const head = buf.subarray(0, 4096).toString('latin1')
  const m = head.match(/charset\s*=\s*["']?\s*([\w-]+)/i)
  const declared = (m ? m[1] : '').toLowerCase()
  const enc = /gb2312|gbk|gb18030/.test(declared) ? 'gbk' : 'utf-8'
  const text = new TextDecoder(enc).decode(buf)
  const bad = (text.match(/\uFFFD/g) || []).length
  if (bad / Math.max(1, text.length) > 0.05) {   // 声明不可信时兜底
    const other = enc === 'gbk' ? 'utf-8' : 'gbk'
    const alt = new TextDecoder(other).decode(buf)
    if ((alt.match(/\uFFFD/g) || []).length < bad) return alt
  }
  return text
}
async function get(url) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 25000)
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA, Referer: 'http://xx.5068.com/dkdb/index.html' } })
    if (!r.ok) return null
    return decode(Buffer.from(await r.arrayBuffer()))
  } catch { return null } finally { clearTimeout(timer) }
}

const CH = ['gl', 'zl', 'help']
const LINK_RE = new RegExp(`(?:https?://(?:xx|mxx)\\.5068\\.com)?/dkdb/(${CH.join('|')})/(\\d+)\\.html`, 'g')
function linksOf(html) {
  const out = []
  let m
  LINK_RE.lastIndex = 0
  while ((m = LINK_RE.exec(html))) out.push({ ch: m[1], id: Number(m[2]) })
  return out
}

const seen = new Set()
const queue = []
const enqueue = (id) => { if (!seen.has(id)) { seen.add(id); queue.push(id) } }
for (const k of KNOWN) enqueue(k)

console.log('阶段 1：扫描频道索引页')
for (const s of SEEDS) {
  const html = await get(s)
  if (!html) { console.log(`  ✗ ${s}`); continue }
  const ls = linksOf(html)
  const before = queue.length
  for (const l of ls) enqueue(l.id)
  console.log(`  ✓ ${s}  发现 ${new Set(ls.map((l) => l.id)).size} 篇，新增 ${queue.length - before}`)
}

console.log(`\n阶段 2：BFS 抓正文（队列 ${queue.length}，上限 ${MAX}）`)
function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t\u3000]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
const MARK = /相关阅读|猜您喜欢|热点排行|网友推荐|上一篇|下一篇|版权声明/
// SSI include 失败会在页面里留下「���� SSI �ļ�ʱ����」这类坏字节，清掉
function clean(text) {
  return text
    .replace(/[\uFFFD\s]{0,8}SSI[\uFFFD\s\u4e00-\u9fa5]{0,14}/g, '\n')
    .replace(/\uFFFD+/g, '')
}
function bodyOf(text, title) {
  let s = clean(text)
  // 正文从「作者 发布时间 手机版」之后开始
  const d = s.search(/\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/)
  if (d > 0) s = s.slice(d).replace(/^[^\n]*\n/, '')
  else if (title) { const i = s.indexOf(title); if (i > 0) s = s.slice(i + title.length) }
  const cut = s.search(MARK)
  if (cut > 0) s = s.slice(0, cut)
  return s
    .replace(/^\s*当前位置[^\n]*\n?/, '')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n')
    .trim()
}

const results = []
let ok = 0, miss = 0, fetched = 0
const t0 = Date.now()
while (queue.length && fetched < MAX) {
  const batch = queue.splice(0, CONC)
  await Promise.all(batch.map(async (id) => {
    // 频道未知，逐个试（缓存命中后基本只有一种）
    let html = null, usedCh = null
    for (const ch of CH) {
      html = await get(`http://xx.5068.com/dkdb/${ch}/${id}.html`)
      if (html && !/404|页面不存在|找不到文件/.test(html.slice(0, 400))) { usedCh = ch; break }
      html = null
    }
    fetched++
    if (!html) { miss++; return }
    fs.writeFileSync(path.join(ROOT, 'raw', `${id}.html`), html, 'utf8')
    const title = (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/-5068.*$/, '').trim()
    const date = (stripTags(html).match(/(20\d\d-\d\d-\d\d \d\d:\d\d:\d\d)/) || [])[1] || ''
    const body = bodyOf(stripTags(html), title)
    fs.writeFileSync(path.join(ROOT, 'txt', `${id}.txt`), `【${title}】 ${date}\n${body}`, 'utf8')
    results.push({ id, ch: usedCh, title, date, chars: body.length })
    for (const l of linksOf(html)) enqueue(l.id)
    ok++
    if (ok % 40 === 0) console.log(`  ${ok} 篇  ${String(title).slice(0, 34)}  队列剩 ${queue.length}`)
  }))
}
const secs = ((Date.now() - t0) / 1000).toFixed(1)

results.sort((a, b) => a.id - b.id)
fs.writeFileSync(path.join(ROOT, 'catalog.json'), JSON.stringify(results, null, 1), 'utf8')

console.log(`\n完成：成功 ${ok}，未找到 ${miss}，用时 ${secs}s`)
const txt = fs.readdirSync(path.join(ROOT, 'txt'))
const raw = fs.readdirSync(path.join(ROOT, 'raw'))
console.log(`自检：raw=${raw.length} txt=${txt.length}`)
if (raw.length !== txt.length || raw.length !== ok) { console.error('!! 落盘数量对不上'); process.exit(1) }
// 乱码判定：不能用 U+FFFD（页面自带的 SSI 残留就会产生），要看
// 「UTF-8 被当 GBK 读」才会出现的那批特征字。
const MOJI = /[鍒澶氬厠姣斺銆锛鏄鐨浣涓鎴鍜瀹缁鏂鏈鍔浠鍚涔閭绠鐜鐢鏃夌鍏嬪]/
let moji = 0
const mojiSample = []
for (const f of txt) {
  const s = fs.readFileSync(path.join(ROOT, 'txt', f), 'utf8')
  const hits = (s.match(new RegExp(MOJI.source, 'g')) || []).length
  if (hits / Math.max(1, s.length) > 0.02) { moji++; if (mojiSample.length < 4) mojiSample.push(f) }
}
console.log(`乱码(特征字>2%) ${moji}/${txt.length}` + (mojiSample.length ? ' 例:' + mojiSample.join(',') : ''))
const tooShort = txt.filter((f) => fs.statSync(path.join(ROOT, 'txt', f)).size < 400)
console.log(`正文过短(<400B) ${tooShort.length} 篇` + (tooShort.length ? ' 例:' + tooShort.slice(0, 6).join(',') : ''))
const size = txt.reduce((s, f) => s + fs.statSync(path.join(ROOT, 'txt', f)).size, 0)
console.log(`总正文 ${(size / 1024) | 0} KB，平均 ${(size / Math.max(1, txt.length) / 1024).toFixed(1)} KB/篇`)
const byCh = {}
for (const r of results) byCh[r.ch] = (byCh[r.ch] || 0) + 1
console.log('频道分布: ' + JSON.stringify(byCh))
