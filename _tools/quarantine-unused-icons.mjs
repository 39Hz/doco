// 把"未被引用的技能图标"隔离到候选区（不删，因为画的是不同版本，删了丢数据）
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const ROOT = path.resolve('.')
const DIR = path.join(ROOT, 'assets/skills')
const CAND = path.join(ROOT, '_tmp_test_out/skill-icons-unused')

// 技能表 / forms.js 引用的图标
const DKDbbData = {}
const ctx = { window: { DKDbbData }, console }
vm.createContext(ctx)
vm.runInContext(fs.readFileSync(path.join(ROOT, 'game/tables/skills-official.js'), 'utf8'), ctx)
const used = new Set()
for (const v of Object.values(ctx.window.DKDbbData.SKILLS)) if (v.icon) used.add(v.icon + '.png')
const fctx = { window: {} }
vm.createContext(fctx)
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/forms.js'), 'utf8'), fctx)
for (const v of Object.values(fctx.window.__DKDbb_FORMS__.skills || {})) if (v.icon) used.add(v.icon + '.png')

// forms.json 里形态头像等其它引用（保险：全仓库搜一遍文件名）
const allFiles = []
;(function walk(d, dep) {
  if (dep > 3) return
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (/^(node_modules|_tmp_test_out|多克多比专区资料素材|_rar_extracted|多克多比-2026\.2|\.git)$/.test(e.name)) continue
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, dep + 1)
    else if (/\.(js|json|html|md|css)$/i.test(e.name)) allFiles.push(p)
  }
})(ROOT, 0)
const blob = allFiles.map((f) => { try { return fs.readFileSync(f, 'utf8') } catch { return '' } }).join('\n')

fs.mkdirSync(CAND, { recursive: true })
const onDisk = fs.readdirSync(DIR).filter((f) => f.endsWith('.png'))
let moved = 0, kept = 0
const movedList = []
for (const f of onDisk) {
  const base = f.replace(/\.png$/, '')
  if (used.has(f)) { kept++; continue }
  // 全仓库里还有别处引用它吗（保守：只要有提及就留下）
  if (blob.includes(base)) { kept++; continue }
  fs.renameSync(path.join(DIR, f), path.join(CAND, f))
  moved++
  movedList.push(f)
}
console.log(`保留 ${kept} 个（被技能表/源码引用）· 隔离 ${moved} 个`)

// 索引同步：把隔离的条目移出
const idxPath = path.join(DIR, 'index.json')
const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'))
const before = idx.icons.length
idx.icons = idx.icons.filter((e) => fs.existsSync(path.join(ROOT, e.file)))
idx.generated = new Date().toISOString()
idx.note = (idx.note || '') + ` 第 55 轮：把未被任何地方引用的 ${moved} 个图标隔离到 _tmp_test_out/skill-icons-unused/（画的是不同版本，未删）。`
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 1))
console.log(`索引：${before} → ${idx.icons.length} 条`)

fs.writeFileSync(path.join(CAND, 'README.md'), `# 未被引用的技能图标（隔离区）

共 ${moved} 个。它们**不是垃圾** —— 画的是与在用图标**不同的版本**（多为 7k7k 缩略图或官方图鉴的另一版），
只是当前技能表没有引用它们。

## 为什么隔离而不是删

本项目吃过"把不同版本的图当成同一张"的亏（见 \`docs/自主迭代日志.md\` 第 55 轮）：
同一个技能在两套图源里长得**相似但不同**。删掉就再也无法对比，所以保留。

## 什么时候会用到

- 想换某技能的图标版本（例如把官方图鉴版换成 7k7k 版，或反过来）
- 以后把技能表的编号从"游戏编号"改回"官方 ID"时

## 怎么用

把文件复制回 \`assets/skills/\`，然后在 \`game/tables/skills-official.js\` 的**生成器**
（\`_tools/merge-skills3.mjs\`）里改对应技能的 \`icon\`，重跑生成器。
**不要手改生成物。**

文件名清单见本目录。
`)
fs.writeFileSync(path.join(CAND, '文件清单.txt'), movedList.join('\n') + '\n', 'utf8')
console.log(`说明与清单已写出 → ${path.relative(ROOT, CAND)}`)
