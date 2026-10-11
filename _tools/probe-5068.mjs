// 探查 5068《多克多比》专区索引页的真实分页方式。
// 静态 HTML 只有 20~35 条链接，其余靠 JS 的 loadMoreApply() 加载，
// 所以要拿到原始 HTML 看脚本里到底请求了哪个地址。
import fs from 'node:fs'

function decode(buf) {
  const utf8 = new TextDecoder('utf-8').decode(buf)
  const bad = (utf8.match(/\uFFFD/g) || []).length
  if (bad / Math.max(1, utf8.length) < 0.002) return { enc: 'utf-8', text: utf8 }
  const gbk = new TextDecoder('gbk').decode(buf)
  const bad2 = (gbk.match(/\uFFFD/g) || []).length
  return { enc: bad2 < bad ? 'gbk' : 'utf-8', text: bad2 < bad ? gbk : utf8 }
}

const targets = [
  'http://xx.5068.com/dkdb/gl/index.html',
  'http://xx.5068.com/dkdb/index.html',
  'http://mxx.5068.com/dkdb/gl/index.html',
]
fs.mkdirSync('_web/5068/probe', { recursive: true })
for (const url of targets) {
  let buf
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 dkdbb-archiver' } })
    if (!r.ok) { console.log(`\n### ${url} → HTTP ${r.status}`); continue }
    buf = Buffer.from(await r.arrayBuffer())
  } catch (e) { console.log(`\n### ${url} → ${e.message}`); continue }
  const { enc, text } = decode(buf)
  const name = url.replace(/[^a-z0-9]/gi, '_')
  fs.writeFileSync(`_web/5068/probe/${name}.html`, text, 'utf8')
  console.log(`\n### ${url}`)
  console.log(`  编码判定=${enc}  字节=${buf.length}  U+FFFD=${(text.match(/\uFFFD/g) || []).length}`)
  const links = [...text.matchAll(/\/dkdb\/gl\/(\d+)\.html/g)].map((m) => m[1])
  console.log(`  静态链接 ${new Set(links).size} 条：${[...new Set(links)].slice(0, 12).join(',')}`)
  // 找脚本里的分页/ajax 线索
  for (const m of text.matchAll(/<script[\s\S]*?<\/script>/gi)) {
    const s = m[0]
    if (!/loadMore|ajax|page|list_|index_/i.test(s)) continue
    const hits = s.match(/.{0,160}(?:loadMore|ajax|\.html)[^\n]{0,160}/gi) || []
    for (const h of hits.slice(0, 12)) console.log('  JS> ' + h.replace(/\s+/g, ' ').trim().slice(0, 220))
  }
  // 找分页文字/链接
  for (const m of text.matchAll(/<a[^>]+href=["']([^"']*)["'][^>]*>\s*(?:下一页|末页|下页|\d+)\s*<\/a>/gi)) {
    console.log('  PAGE> ' + m[1])
  }
}
