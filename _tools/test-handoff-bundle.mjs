// 交接包自检：三块内容齐、该有的在、能独立解出来
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { listZip } from './lib/zip-central.mjs'

const p = process.argv[2] || '多克多比制作.zip'
const size = fs.statSync(p).size
console.log(`包: ${p}  ${(size / 1048576).toFixed(1)} MB`)

let names
try { names = listZip(p) } catch (e) { console.error('★ 中央目录读不出来：' + e.message); process.exit(1) }
console.log(`中央目录条目: ${names.length}`)

const TOP = '多克多比制作/'
let pass = 0, fail = 0
const check = (ok, s) => { console.log((ok ? '  ✓ ' : '  ✗ ') + s); ok ? pass++ : fail++ }

check(names.every((n) => n.startsWith(TOP)), '所有条目都在 `多克多比制作/` 下')

// 三块内容
const blocks = {
  '1-游戏': '1-游戏-双击即玩/',
  '2-源码': '2-源码-可重建/',
  '3-文档': '3-计划与手册/',
}
for (const [label, frag] of Object.entries(blocks)) {
  const n = names.filter((x) => x.startsWith(TOP + frag)).length
  check(n > 0, `${label} 有内容（${n} 条）`)
}

// 第一页
check(names.includes(TOP + '先读我.md'), '有 先读我.md')

// 三块各自的关键文件
const MUST = {
  '游戏': ['1-游戏-双击即玩/多克多比.exe', '1-游戏-双击即玩/使用说明.md',
    '1-游戏-双击即玩/web/game.html', '1-游戏-双击即玩/web/game/game.js',
    '1-游戏-双击即玩/web/assets/scenes/scene_93.jpg'],
  '源码': ['2-源码-可重建/game/game.js', '2-源码-可重建/_tools/make-release.mjs',
    '2-源码-可重建/_tools/lib/zip-write.mjs', '2-源码-可重建/assets/anim/index.json',
    '2-源码-可重建/README-源码包.md'],
  '文档': ['3-计划与手册/复刻与构建手册.md', '3-计划与手册/00-PLAN-计划书.md',
    '3-计划与手册/STATE-现状.md', '3-计划与手册/保真度报告.md',
    '3-计划与手册/场景命名工作表.csv'],
}
for (const [label, list] of Object.entries(MUST)) {
  for (const m of list) check(names.includes(TOP + m), `[${label}] 有 ${m.replace(/^[^/]+\//, '')}`)
}

// 不该有的
const MUST_NOT = ['2-源码-可重建/assets/sprites/', '2-源码-可重建/_tools/imgcache/',
  '2-源码-可重建/dist/', '多克多比专区资料素材.7z']
for (const frag of MUST_NOT) {
  check(!names.some((n) => n.startsWith(TOP + frag)), `不含 ${frag}`)
}

// 真的能解出来（独立工具，不信自己的写出器）
if (!process.env.SKIP_EXTRACT) {
  const tmp = fs.mkdtempSync(path_join(fs.realpathSync(process.env.TEMP || '/tmp'), 'handoff-'))
  try {
    execFileSync('tar', ['-xf', p, '-C', tmp], { stdio: 'ignore' })
    const exe = path_join(tmp, '多克多比制作', '1-游戏-双击即玩', '多克多比.exe')
    check(fs.existsSync(exe), '用独立工具 tar 解得出来，且 exe 在位')
    const g = path_join(tmp, '多克多比制作', '2-源码-可重建', 'game', 'game.js')
    check(fs.existsSync(g), '源码那一块也解得出来')
  } catch (e) {
    check(false, '独立解压失败：' + e.message.slice(0, 80))
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}
function path_join(...a) { return a.join(require_sep()) }
function require_sep() { return process.platform === 'win32' ? '\\' : '/' }

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
