// 验证：技能表里每个 icon 引用的文件都真实存在，且能被解码
// 为什么必须验：字段有值但文件缺失时，游戏 UI 只会**静默不显示图标**，不报错 —— 很难发现
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const DKDbbData = {}
const ctx = { window: { DKDbbData }, console }
vm.createContext(ctx)
vm.runInContext(fs.readFileSync(path.join(ROOT, 'game/tables/skills-official.js'), 'utf8'), ctx)
const T = ctx.window.DKDbbData.SKILLS

const withIcon = Object.entries(T).filter(([, v]) => v.icon)
const without = Object.entries(T).filter(([, v]) => !v.icon)
console.log(`技能表 ${Object.keys(T).length} 条：带图标 ${withIcon.length} · 无图标 ${without.length}`)

let missing = 0, bad = 0, ok = 0
const bySource = {}
for (const [name, v] of withIcon) {
  const p = path.join(ROOT, 'assets/skills', v.icon + '.png')
  if (!fs.existsSync(p)) { console.log(`  ✗ 缺文件：${name} → ${v.icon}.png`); missing++; continue }
  try {
    const im = decodePng(fs.readFileSync(p))
    if (im.w < 16 || im.h < 16) { console.log(`  ✗ 尺寸异常：${name} → ${im.w}×${im.h}`); bad++; continue }
    ok++
  } catch (e) { console.log(`  ✗ 解码失败：${name} → ${e.message}`); bad++; continue }
  // 来源判定：原版策划表的证据里写「图标来自原版策划表」，7k7k 的写「图标来自 7k7k 角色大全」。
  // （第一版只看 evidence 里有没有 "7k7k"，而两种来源的 evidence 都可能提到 7k7k → 判错。）
  const ev = v.evidence || ''
  const src = /图标来自 7k7k/.test(ev) ? '7k7k' : /图标来自原版策划表/.test(ev) ? '原版图鉴' : '（未标来源）'
  bySource[src] = (bySource[src] || 0) + 1
}
console.log(`\n图标文件：可用 ${ok} · 缺文件 ${missing} · 损坏 ${bad}`)
console.log('来源分布：' + Object.entries(bySource).map(([k, v]) => `${k} ${v}`).join('  '))

// 无图标的技能按元素分组（说明还缺哪些）
const noByEl = {}
for (const [name, v] of without) (noByEl[v.element || '（未标）'] = noByEl[v.element || '（未标）'] || []).push(name)
console.log(`\n仍无图标的 ${without.length} 个，按元素：`)
for (const [el, list] of Object.entries(noByEl).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${el.padEnd(6)} ${String(list.length).padStart(3)} 个：${list.slice(0, 8).join('、')}${list.length > 8 ? ' …' : ''}`)
}

const pass = missing === 0 && bad === 0
console.log(`\n${pass ? '✓ 全部通过' : '✗ 有问题'}`)
process.exit(pass ? 0 : 1)
