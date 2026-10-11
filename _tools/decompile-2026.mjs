// 用 ilspycmd 把 `多克多比-2026.2` 的 Assembly-CSharp.dll 反编译成完整 C# 源码
//
// 【为什么要这么绕】本机 `dotnet` 只有运行时 6.0.5，没有 SDK，装不了 dotnet tool；
//   ilspycmd 9.x 又要 net8.0 → 所以下了**便携 .NET 8 运行时**（_tools/ai/dotnet/runtime）
//   直接 `dotnet ilspycmd.dll` 跑。这条链已在 `setup-ilspycmd.mjs` / `get-dotnet-runtime.mjs` 里验证。
//
// 用法: node _tools/decompile-2026.mjs
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve('.')
const DLL = path.join(ROOT, '多克多比-2026.2/多克多比_Data/Managed/Assembly-CSharp.dll')
const OUT = path.join(ROOT, '多克多比-2026.2/decompiled/src')
const DN = path.join(ROOT, '_tools/ai/dotnet/runtime/dotnet.exe')
const ILSPY = path.join(ROOT, '_tools/ai/ilspy/ilspycmd/tools/net8.0/any/ilspycmd.dll')

for (const [label, p] of [['游戏程序集', DLL], ['便携 dotnet', DN], ['ilspycmd', ILSPY]]) {
  if (!fs.existsSync(p)) { console.log(`✗ 缺${label}: ${path.relative(ROOT, p)}`); process.exit(1) }
}
console.log(`反编译 ${path.basename(DLL)}（${(fs.statSync(DLL).size / 1024).toFixed(0)} KB）`)
fs.mkdirSync(OUT, { recursive: true })

// 原程序集先备份（替换前的保命措施）
const BAK = path.join(ROOT, '_tmp_test_out/unity-backup/Assembly-CSharp.dll.orig')
fs.mkdirSync(path.dirname(BAK), { recursive: true })
if (!fs.existsSync(BAK)) { fs.copyFileSync(DLL, BAK); console.log(`✓ 已备份原程序集 → ${path.relative(ROOT, BAK)}`) }
else {
  // 校验备份与当前是否一致（改过之后就不能再被覆盖）
  const a = fs.readFileSync(DLL), b = fs.readFileSync(BAK)
  console.log(a.equals(b) ? '✓ 当前程序集与备份一致' : '⚠️ 当前程序集与备份**不一致**（说明已改过；备份保留的是最初版本）')
}

// 反编译：-o 输出目录；--nested-directories 每个类型一个 .cs（大项目更好导航）
try {
  execFileSync(DN, [ILSPY, '-o', OUT, '--nested-directories', '--disable-updatecheck', DLL], {
    stdio: 'inherit', cwd: ROOT, env: { ...process.env, DOTNET_ROOT: path.dirname(DN) },
  })
} catch (e) {
  console.log(`✗ 反编译失败：${String(e.message).slice(0, 200)}`)
  process.exit(1)
}

// 统计产出
const walk = (d, acc = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (e.name.endsWith('.cs')) acc.push(p)
  }
  return acc
}
let files = []
try { files = walk(OUT) } catch { }
console.log(`\n✓ 反编译完成：${files.length} 个 .cs 文件`)
console.log('最大的 12 个：')
for (const f of files.map((f) => ({ f, n: fs.statSync(f).size })).sort((a, b) => b.n - a.n).slice(0, 12)) {
  console.log(`  ${(f.n / 1024).toFixed(1).padStart(7)} KB  ${path.relative(OUT, f.f)}`)
}
console.log(`\n源码目录 ${path.relative(ROOT, OUT)}`)
