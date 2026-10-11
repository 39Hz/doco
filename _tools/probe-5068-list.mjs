// 直接打 /plus/list.php 的原始响应，看它到底返回什么。
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
const VARIANTS = [
  ['mxx + XHR头', 'http://mxx.5068.com/plus/list.php?ajax=pullload&typeid=91&page=2&pagesize=12', true],
  ['mxx 无XHR头', 'http://mxx.5068.com/plus/list.php?ajax=pullload&typeid=91&page=2&pagesize=12', false],
  ['xx  + XHR头', 'http://xx.5068.com/plus/list.php?ajax=pullload&typeid=91&page=2&pagesize=12', true],
  ['xx  page1  ', 'http://xx.5068.com/plus/list.php?ajax=pullload&typeid=91&page=1&pagesize=12', true],
  ['mxx page1  ', 'http://mxx.5068.com/plus/list.php?ajax=pullload&typeid=91&page=1&pagesize=12', true],
  ['mxx 带referer', 'http://mxx.5068.com/plus/list.php?ajax=pullload&typeid=91&page=2&pagesize=12', true, 'http://mxx.5068.com/dkdb/gl/index.html'],
]
for (const [name, url, xhr, referer] of VARIANTS) {
  const h = { 'User-Agent': UA }
  if (xhr) h['X-Requested-With'] = 'XMLHttpRequest'
  h.Referer = referer || 'http://mxx.5068.com/dkdb/gl/index.html'
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 20000)
  try {
    const r = await fetch(url, { headers: h, signal: ctl.signal })
    const buf = Buffer.from(await r.arrayBuffer())
    const ct = r.headers.get('content-type') || ''
    let preview
    try { preview = JSON.parse(buf.toString('utf8')) && '(合法JSON)' } catch { preview = null }
    console.log(`\n### ${name}  HTTP ${r.status}  ${ct}  ${buf.length}B  ${preview || ''}`)
    console.log('    ' + buf.toString('utf8').replace(/\s+/g, ' ').slice(0, 260))
  } catch (e) {
    console.log(`\n### ${name}  ✗ ${e.message}`)
  } finally { clearTimeout(timer) }
}
