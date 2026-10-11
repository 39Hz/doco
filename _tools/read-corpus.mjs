// 语料单篇读取：把某几篇的**正文**抽出来看（配合 mine-corpus.mjs 用）
//
// 为什么要单独有一个：
//   · 原始 txt 每篇都掺着网站导航（"热门搜索 金字塔 城堡…"），直接读会浪费大量 token（C3/C9）；
//   · 5068 站的 txt 是 **GBK**，按 UTF-8 读出来是乱码（`澶氬厠澶氭瘮`）——能自动判编码；
//   · raw/ 里还有 HTML，需要时也能剥标签。
//
// 用法:
//   node _tools/read-corpus.mjs 7k7k/660617 7k7k/551114        # 打印正文
//   node _tools/read-corpus.mjs --out _tmp_pages 7k7k/660617    # 另存为文件（再用读文件工具看）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const P = (...p) => path.join(ROOT, ...p)
const argv = process.argv.slice(2)
const outDir = (() => { const i = argv.indexOf('--out'); return i >= 0 ? (argv.splice(i, 2), argv[i + 1] ?? null) : null })()
const ids = argv.filter((a) => !a.startsWith('--'))

// ---------- 编码 ----------
function decode(buf) {
  // UTF-8 严格解码失败 → 按 GBK 试（Node 自带 TextDecoder 支持 gbk）
  try {
    const s = new TextDecoder('utf-8', { fatal: true }).decode(buf)
    if (!/\uFFFD/.test(s)) return { text: s, enc: 'utf-8' }
  } catch { /* 落到 gbk */ }
  try {
    const s = new TextDecoder('gbk').decode(buf)
    return { text: s, enc: 'gbk' }
  } catch {
    return { text: buf.toString('utf8'), enc: 'utf8-forced' }
  }
}

// ---------- 导航噪声 ----------
const NAV = /^(热门搜索|游戏首页|新闻公告|任务攻略|副本解读|游戏周边|新手指南|高手进阶|精彩视频|游戏问答|玩家交流|vip特权|更多|收藏|分享|复制本文地址|小编推荐|相关文章|上一篇|下一篇|我要评论|我说两句|返回列表|首页|上一页|下一页|猜你喜欢|热门推荐)/i
const NAV_WORDS = ['指尖捕鱼', '洛克王国', '特战英雄', '弹弹堂', '迷你世界', '皮卡堂', '三国杀', '完美漂移',
  '全民坦克大战', '推理学院', '手机游戏', '热门搜索', '游戏首页', '新闻公告', '任务攻略', '副本解读', '游戏周边']

function clean(text) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ')
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter((l) => l && !NAV.test(l))
    .filter((l) => !(l.length < 12 && NAV_WORDS.some((n) => l.includes(n))))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

const meta = {}
for (const [site, catPath] of [['7k7k', P('_web', '7k7k', 'catalog.json')], ['5068', P('_web', '5068', 'index.json')]]) {
  try {
    for (const e of JSON.parse(fs.readFileSync(catPath, 'utf8').replace(/^\uFEFF/, ''))) meta[`${site}/${e.id}`] = e
  } catch { }
}

if (outDir) fs.mkdirSync(P(outDir), { recursive: true })
const summary = []
for (const spec of ids) {
  const [site, id] = spec.includes('/') ? spec.split('/') : ['7k7k', spec]
  const txtPath = P('_web', site, 'txt', `${id}.txt`)
  const rawPath = P('_web', site, 'raw', `${id}.html`)
  let buf = null, from = null
  if (fs.existsSync(txtPath)) { buf = fs.readFileSync(txtPath); from = 'txt' }
  else if (fs.existsSync(rawPath)) { buf = fs.readFileSync(rawPath); from = 'raw' }
  if (!buf) { console.log(`✗ 找不到 ${spec}`); continue }
  const { text, enc } = decode(buf)
  const body = clean(text)
  const m = meta[spec] || {}
  const head = `# ${m.title || id}　（${spec}${m.date ? ' · ' + m.date.slice(0, 10) : ''} · 来源 ${from} · 编码 ${enc} · 正文 ${body.length} 字）\n来源页: ${m.url || '（目录里没有）'}\n`
  if (outDir) {
    const f = P(outDir, `${site}-${id}.md`)
    fs.writeFileSync(f, head + '\n' + body, 'utf8')
    summary.push(`${f}  ${body.length} 字  ${m.title || ''}`)
  } else {
    console.log('\n' + '='.repeat(90))
    console.log(head)
    console.log(body.length > 6000 ? body.slice(0, 6000) + `\n…（还有 ${body.length - 6000} 字，用 --out 落盘再看）` : body)
  }
}
if (outDir) { console.log('已写出：'); for (const s of summary) console.log('  ' + s) }
