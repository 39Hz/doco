// 找《多克多比》的真正官网存档。
// 百度百科写发行方是「武汉聚网科技有限公司」，所以要试几个可能的域名，
// 再用 Internet Archive 的 CDX 接口看哪些年被抓过、有哪些路径。
const DOMAINS = [
  'duokeduobi.com', 'www.duokeduobi.com',
  'dkdb.com', 'www.dkdb.com',
  'dkdb.juwang.com', 'dkdb.5068.com',
  'dkdb.4399.com', 'dkdb.7k7k.com',
  'duokeduobi.juwang.com',
  'dkdb.lezi.com', 'dkdb.61.com',
]
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) dkdbb-archiver'

async function cdx(domain, limit = 40) {
  const url = `http://web.archive.org/cdx/search/cdx?url=${domain}&matchType=domain&output=json&fl=original,timestamp,statuscode,mimetype&collapse=urlkey&limit=${limit}`
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 30000)
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA } })
    const text = await r.text()
    if (!r.ok) return { err: 'HTTP ' + r.status }
    const rows = JSON.parse(text)
    return { rows }
  } catch (e) { return { err: e.message } } finally { clearTimeout(timer) }
}

// 先测 DNS 通不通
for (const d of DOMAINS) {
  try {
    const { lookup } = await import('node:dns/promises')
    const a = await lookup(d).catch((e) => ({ error: e.code }))
    console.log(`DNS ${d.padEnd(28)} ${a.address || a.error}`)
  } catch (e) { console.log(`DNS ${d.padEnd(28)} ${e.message}`) }
}

console.log('\n--- Internet Archive CDX ---')
for (const d of DOMAINS) {
  const { rows, err } = await cdx(d)
  if (err) { console.log(`${d.padEnd(28)} ${err}`); continue }
  if (!rows || rows.length < 2) { console.log(`${d.padEnd(28)} 无存档`); continue }
  const body = rows.slice(1)
  console.log(`\n${d}  →  ${body.length} 条存档记录`)
  const years = {}
  for (const r of body) { const y = r[1].slice(0, 4); years[y] = (years[y] || 0) + 1 }
  console.log('   年份分布: ' + Object.entries(years).map(([y, n]) => `${y}:${n}`).join(' '))
  for (const r of body.slice(0, 12)) console.log(`   ${r[1]}  ${r[2]}  ${r[3].padEnd(24)} ${r[0]}`)
}
