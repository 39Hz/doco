// 核查 `多克多比-2026.2`（Unity 游戏）里到底有哪些内容，判断能否"以它为基础加我们的内容"
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const GAME = path.join(ROOT, '多克多比-2026.2')

// 1) 版本与平台信息
const exe = path.join(GAME, '多克多比.exe')
console.log(`=== 可执行文件 ===`)
console.log(`  多克多比.exe  ${(fs.statSync(exe).size / 1024).toFixed(0)} KB`)
const ini = path.join(GAME, '多克多比_Data', 'boot.config')
if (fs.existsSync(ini)) console.log('  boot.config:\n    ' + fs.readFileSync(ini, 'utf8').split('\n').slice(0, 8).join('\n    '))
const ggm = path.join(GAME, '多克多比_Data', 'globalgamemanagers')
if (fs.existsSync(ggm)) {
  const b = fs.readFileSync(ggm)
  const s = b.toString('latin1')
  // Unity 版本串形如 2019.4.40f1
  const m = s.match(/(\d{4}\.\d+\.\d+[a-z]\d+)/)
  console.log(`  Unity 版本（从 globalgamemanagers 提取）: ${m ? m[1] : '未识别'}`)
  const p = s.match(/(StandaloneWindows64|StandaloneWindows|WebGL|Android)/)
  console.log(`  目标平台: ${p ? p[1] : '未识别'}`)
}

// 2) 从导出的贴图清单看资源性质
const catPath = path.join(ROOT, '_tmp_test_out/unity-catalog.json')
if (fs.existsSync(catPath)) {
  const cat = JSON.parse(fs.readFileSync(catPath, 'utf8'))
  const names = cat.textures.map((t) => t.name)
  console.log(`\n=== 贴图清单（${cat.count} 张）===`)
  // 是否含"多克/多比"相关的名字
  const cn = names.filter((n) => /多克|多比|dkdb|dobi/i.test(n))
  console.log(`  含"多克/多比"字样的: ${cn.length} 张${cn.length ? ' → ' + cn.slice(0, 10).join('、') : ''}`)
  // 分类统计
  const buckets = { UI: 0, 图标icon: 0, 特效cfx: 0, 角色char: 0, 其他: 0 }
  for (const n of names) {
    if (/cfx|CFXR|effect|particle/i.test(n)) buckets.特效cfx++
    else if (/icon/i.test(n)) buckets.图标icon++
    else if (/btn|panel|slider|UI|arrow|status|bar|frame/i.test(n)) buckets.UI++
    else if (/char|player|hero|enemy|body|idle|walk|attack/i.test(n)) buckets.角色char++
    else buckets.其他++
  }
  console.log('  资源构成：' + Object.entries(buckets).map(([k, v]) => `${k} ${v}`).join(' · '))
}

// 3) 有没有脚本/数据文件（能不能往里加内容）
console.log(`\n=== 能否"以它为基础加内容"===`)
const dataDir = path.join(GAME, '多克多比_Data')
const scripts = fs.existsSync(path.join(dataDir, 'Managed')) ? fs.readdirSync(path.join(dataDir, 'Managed')).filter((f) => f.endsWith('.dll')) : []
console.log(`  托管程序集 ${scripts.length} 个${scripts.length ? '（含游戏逻辑，是编译后的 C#）' : ''}`)
const il2cpp = fs.existsSync(path.join(dataDir, 'il2cpp_data'))
console.log(`  IL2CPP: ${il2cpp ? '是（C++ 编译，改不了逻辑）' : '否（Mono，程序集为 DLL）'}`)
const assets = fs.readdirSync(dataDir).filter((f) => /\.assets$/.test(f))
console.log(`  资源包 ${assets.length} 个（.assets / .resS）`)
console.log(`\n  结论：这是一个**已编译的成品 Unity 游戏**。
    · 资源（贴图/音频/预制体）可以用 UnityPy 读出来
    · **游戏逻辑在编译后的程序集里** —— 没有源码工程就改不了玩法
    · 想"把我们的内容加进去"，需要二选一：
      a) 拿到它的 **Unity 工程源码**（.cs + ProjectSettings），才能改
      b) 只做**资源替换**（换贴图/文字），不碰逻辑 —— 可行但要逐个映射资源路径
`)
