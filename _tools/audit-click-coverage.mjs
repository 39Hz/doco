// 审计：哪些界面**只支持键盘**、没有鼠标点击路径（用户要求「局内所有东西都能左键点击」）
//
// 判据：在 `input.once('...')` 的同一分支附近，是否也存在 `M.clicked` 或 `rectHit` 命中测试。
// 用法: node _tools/audit-click-coverage.mjs
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const t = fs.readFileSync(path.join(ROOT, 'game/game.js'), 'utf8')
const lines = t.split('\n')

// 找所有模式分支（`} else if (S.mode === 'xxx') {` 或 `if (S.mode === 'xxx') {`）
const modes = []
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/S\.mode === '([a-z]+)'/)
  if (m) modes.push({ mode: m[1], line: i + 1 })
}
console.log(`找到 ${modes.length} 处 S.mode 分支\n`)

// 对每个模式，统计"键盘输入"与"鼠标命中"的出现次数
const uniq = [...new Set(modes.map((m) => m.mode))]
console.log('模式'.padEnd(14) + '键盘 input.once  鼠标点击 M.clicked  rectHit  结论')
const rows = []
for (const mode of uniq) {
  // 该模式的分支范围：从它的行到下一个"同级 } else if / }"结束
  const starts = modes.filter((m) => m.mode === mode).map((m) => m.line)
  let kb = 0, click = 0, hit = 0
  for (const s of starts) {
    // 往后扫到 update() 内的下一个同级分支
    for (let i = s; i < Math.min(s + 160, lines.length); i++) {
      const L = lines[i]
      if (i > s && /^\s{4,6}\} else if \(S\.mode ===/.test(L)) break
      if (/input\.once\(/.test(L)) kb++
      if (/M\.clicked/.test(L)) click++
      if (/rectHit\(|HitTest\(/.test(L)) hit++
    }
  }
  const verdict = kb === 0 ? '—（无键盘输入）'
    : click + hit > 0 ? '✓ 键盘+鼠标都有'
      : '✗ **只有键盘，不能点**'
  rows.push({ mode, kb, click, hit, verdict })
  console.log(String(mode).padEnd(14) + String(kb).padEnd(16) + String(click).padEnd(16) + String(hit).padEnd(9) + verdict)
}

const bad = rows.filter((r) => r.verdict.startsWith('✗'))
console.log(`\n只支持键盘的模式：${bad.length} 个`)
for (const b of bad) console.log(`  ${b.mode}（input.once ${b.kb} 处，无鼠标点击路径）`)
