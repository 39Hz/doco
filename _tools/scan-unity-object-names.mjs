// 从 Unity 资源包里扫出**对象名**（ScriptableObject / 预制体的 m_Name）
//
// 【为什么要这一步】游戏里 docoitem 的名字是「小黄人」，与我们形态表的名字完全不同，
//   所以注入挂钩按名字查不到（`Apply()` 正确地返回了 false）。
//   要把两边对上，必须先知道**游戏里到底有哪些多比**。
//   对象名以长度前缀的 UTF-8 存在 `.assets` / `.resS` 里，可以直接扫出来。
//
// 用法: node _tools/scan-unity-object-names.mjs [最小长度]
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const GAME = path.join(ROOT, '多克多比-2026.2/多克多比_Data')
const MIN = Number(process.argv[2] || 2)

// 我们表里的形态名（用来做匹配测试）
const OURS = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/forms.json'), 'utf8')).forms.map((f) => f.name)
const norm = (s) => String(s).replace(/[\s·・]/g, '').replace(/多比$/, '')

const files = []
;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(assets|resS|unity3d|bundle)$/i.test(e.name) || e.name === 'globalgamemanagers') files.push(p)
  }
})(GAME)
console.log(`扫描 ${files.length} 个资源文件…`)

// Unity 的字符串常以 u32 长度前缀 + UTF-8 存放；也用 u8 前缀的小串。
// 两种都试，取并集，再用"像不像名字"过滤。
const all = new Map()
for (const f of files) {
  const buf = fs.readFileSync(f)
  // u32 前缀
  for (let i = 0; i + 4 < buf.length; i++) {
    const len = buf.readUInt32LE(i)
    if (len < MIN || len > 40 || i + 4 + len > buf.length) continue
    // 快速排除：首字节必须是可打印 ASCII 或 UTF-8 中文起始
    const b0 = buf[i + 4]
    if (b0 < 0x20 || b0 === 0x7f) continue
    const s = buf.toString('utf8', i + 4, i + 4 + len)
    if (!/^[\u4e00-\u9fa5A-Za-z0-9_\-（）()·・ ]+$/.test(s)) continue
    if (!/[\u4e00-\u9fa5]/.test(s)) continue          // 只要含中文的（多比名都是中文）
    const n = all.get(s) || 0
    all.set(s, n + 1)
  }
}
console.log(`扫出含中文的候选名字 ${all.size} 个`)

// 与我们形态名做匹配（精确 / 包含）
const oursNorm = new Map(OURS.map((n) => [norm(n), n]))
const exact = [], partial = []
for (const s of all.keys()) {
  const k = norm(s)
  if (oursNorm.has(k)) exact.push({ found: s, ours: oursNorm.get(k) })
  else {
    for (const [ok, on] of oursNorm) {
      if (ok.length > 1 && (k.includes(ok) || ok.includes(k))) { partial.push({ found: s, ours: on }); break }
    }
  }
}
console.log(`\n=== 与形态表**精确匹配**的名字：${exact.length} 个 ===`)
for (const e of exact.slice(0, 40)) console.log(`  ${e.found}  ←  ${e.ours}`)
console.log(`\n=== **部分匹配**的名字：${partial.length} 个 ===`)
for (const e of partial.slice(0, 40)) console.log(`  ${e.found}  ~  ${e.ours}`)

// 把"像多比名字"的都列出来（含"多比"两字，或以小/大/元素开头）
const likeForms = [...all.keys()].filter((s) => /多比/.test(s) || /^(小|大|超|超级|普通)/.test(s))
console.log(`\n=== 名字里含「多比」或以小/大/超开头的：${likeForms.length} 个 ===`)
for (const s of likeForms.slice(0, 60)) console.log(`  ${s}`)

const out = path.join(ROOT, '_tmp_test_out/unity-object-names.json')
fs.writeFileSync(out, JSON.stringify({ count: all.size, exact, partial, likeForms, all: [...all.keys()] }, null, 1))
console.log(`\n全量已写出 ${path.relative(ROOT, out)}`)
