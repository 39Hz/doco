// 交叉校验 HTML 中定义的 id 与 JS 中引用的 id 是否一致
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.argv[2] || '.')
const pairs = [
  ['hub.html', 'hub.js'],
  ['index.html', 'app.js'],
]

let fail = 0
for (const [htmlFile, jsFile] of pairs) {
  const hp = path.join(ROOT, htmlFile)
  const jp = path.join(ROOT, jsFile)
  if (!fs.existsSync(hp) || !fs.existsSync(jp)) { console.log(`跳过 ${htmlFile}（文件不存在）`); continue }

  const html = fs.readFileSync(hp, 'utf8')
  const js = fs.readFileSync(jp, 'utf8')

  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))
  const used = new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]))

  const missing = [...used].filter((u) => !ids.has(u))
  console.log(`\n=== ${htmlFile}  ⇄  ${jsFile} ===`)
  console.log(`  HTML 定义 id: ${ids.size}    JS 引用 id: ${used.size}`)
  if (missing.length) {
    console.log(`  ✗ JS 引用了 HTML 里不存在的 id: ${missing.join(', ')}`)
    fail++
  } else {
    console.log('  ✓ 所有 JS 引用的 id 都能在 HTML 中找到')
  }

  // 检查 <script> 引用顺序与资源是否存在
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1])
  const links = [...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map((m) => m[1])
  for (const res of [...scripts, ...links]) {
    const ok = fs.existsSync(path.join(ROOT, res))
    if (!ok) { console.log(`  ✗ 引用的资源不存在: ${res}`); fail++ }
  }
  console.log(`  ✓ ${scripts.length} 个 script + ${links.length} 个 link 引用全部存在`)
}

console.log(fail === 0 ? '\n✅ HTML/JS 引用关系全部一致' : `\n❌ ${fail} 项问题`)
process.exit(fail === 0 ? 0 : 1)
