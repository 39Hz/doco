// 读 `多克多比-2026.2` 的 Unity Player 日志 —— 用来确认"我们的注入挂钩有没有生效"
//
// Unity 把日志写在 `%USERPROFILE%\AppData\LocalLow\<公司名>\<产品名>\Player.log`。
// 产品名从 globalgamemanagers 里读到是「多克多比」，公司名未知（老日志里出现过
// DefaultCompany / duduhhs / dianhun / MOF），所以这里**全目录搜索**，不猜。
//
// 用法: node _tools/read-unity-log.mjs [关键字]
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const KEY = process.argv[2] || '[Dkdbb]'
const BASE = path.join(process.env.USERPROFILE || '', 'AppData', 'LocalLow')

if (!fs.existsSync(BASE)) { console.log(`✗ 没有 ${BASE}`); process.exit(1) }

// 找所有 Player.log / output_log.txt，按修改时间倒序
const found = []
;(function walk(d, dep) {
  if (dep > 4) return
  let es
  try { es = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
  for (const e of es) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, dep + 1)
    else if (/^(Player|output_log)\.(log|txt)$/i.test(e.name)) {
      try { found.push({ p, m: fs.statSync(p).mtimeMs, size: fs.statSync(p).size }) } catch { }
    }
  }
})(BASE, 0)
found.sort((a, b) => b.m - a.m)

if (!found.length) { console.log('✗ 没找到任何 Unity 日志（游戏可能还没跑过）'); process.exit(1) }
console.log(`找到 ${found.length} 个日志，最近 5 个：`)
for (const f of found.slice(0, 5)) {
  console.log(`  ${new Date(f.m).toLocaleString()}  ${(f.size / 1024).toFixed(0)} KB  ${path.relative(BASE, f.p)}`)
}

// 挑最新的那个，并判断是不是本游戏（产品名/我们的日志）
const latest = found[0]
const txt = fs.readFileSync(latest.p, 'utf8')
const isOurs = /多克多比|Dkdbb/.test(txt)
console.log(`\n最新日志：${path.relative(BASE, latest.p)}`)
console.log(`  含「多克多比」或「[Dkdbb]」：${isOurs ? '是 ✓' : '否（可能是别的游戏的日志）'}`)

const lines = txt.split(/\r?\n/)
const hits = lines.filter((l) => l.includes(KEY))
console.log(`\n含「${KEY}」的行：${hits.length} 条`)
for (const h of hits.slice(0, 30)) console.log('  ' + h.trim().slice(0, 160))

// 顺便把与战斗/数值相关的关键行也捞出来，便于判断数值有没有变
if (!hits.length) {
  console.log('\n（没有我们的日志行 —— 说明注入挂钩没被执行到：')
  console.log('  可能 ① 游戏里的多比名字和我们表里的对不上；② 战斗没打起来；③ 跑的不是这份日志）')
  const interesting = lines.filter((l) => /等级|物攻|物防|魔攻|速度|最大 HP|maxHP|Exception|Error/i.test(l))
  console.log(`\n其它可能有用的行 ${interesting.length} 条：`)
  for (const h of interesting.slice(0, 20)) console.log('  ' + h.trim().slice(0, 150))
}
