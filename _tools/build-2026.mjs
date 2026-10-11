// 编译反编译出的源码 → Assembly-CSharp.dll
//
// 【编译器 + 引用面的最终解（踩了 6 个坑才定下来）】
//   ① 系统 `csc.exe`（.NET Framework 4.0）→ 只支持 C# 5，而产物是 C# 9（CS1617）
//   ② `dotnet build` → 本机只有运行时没有 SDK（No .NET SDKs were found）
//   ③ Roslyn `tasks/net472/csc.exe` → 能跑 C# 9，但引用面错配：
//      引游戏 netstandard → `Queue<>` 转发失败（CS1069）；不引 → `Object/ValueType` 缺失（CS0012）
//   ④ Roslyn netcore csc + .NET 9 核心库 → `System.Object 未定义`（CS0518）
//   ⑤ 游戏自带 netstandard/mscorlib → 与 Roslyn 的核心库冲突
//   ⑥ ✅ **Roslyn netcore csc（便携 .NET 9）+ `/nostdlib+` + 官方 netstandard2.1 引用面 + 游戏 DLL**
//      探针 `_tools/_probe-refcombo2.mjs` 实测通过；`-nostdlib+` 是必需的那一把钥匙。
//
// ⚠️ 安全：默认只输出到 `decompiled/build-out`；加 `--install` 才替换游戏原文件（自动备份）。
//
// 用法: node _tools/build-2026.mjs [--install]
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, '多克多比-2026.2/decompiled/src/Assembly-CSharp.decompiled.cs')
// 我们自己加进去的源码（形态数值注入等），与反编译产物一起编译
const SRC_EXTRA = [
  path.join(ROOT, '多克多比-2026.2/decompiled/src/DkdbbForms.generated.cs'),
].filter((p) => fs.existsSync(p))
const MANAGED = path.join(ROOT, '多克多比-2026.2/多克多比_Data/Managed')
const OUTDIR = path.join(ROOT, '多克多比-2026.2/decompiled/build-out')
const NSTD = path.join(ROOT, '_tools/ai/netstandard-ref/ref/ref/netstandard2.1/netstandard.dll')
const DN = path.join(ROOT, '_tools/ai/dotnet/runtime9/dotnet.exe')
const CSC = path.join(ROOT, '_tools/ai/roslyn/toolset/tasks/netcore/bincore/csc.dll')
const INSTALL = process.argv.includes('--install')

for (const [label, p] of [['源码', SRC], ['便携 .NET 9', DN], ['Roslyn csc', CSC], ['netstandard2.1 引用面', NSTD]]) {
  if (!fs.existsSync(p)) { console.log(`✗ 缺${label}：${path.relative(ROOT, p)}`); process.exit(1) }
}
fs.mkdirSync(OUTDIR, { recursive: true })

// 引用：官方 netstandard2.1 + 游戏里的**非 System** DLL。
// ⚠️ 必须把游戏自带的 `System.*.dll` 一起排除：它们是 Mono 那套，
//    与便携 netstandard2.1 面**重复定义**同一批类型 →
//    `CS0433: EditorBrowsableAttribute 同时存在于 System 和 netstandard 中`。
//    官方 netstandard 已经提供了这些类型，所以排除掉不会缺东西。
const all = fs.readdirSync(MANAGED).filter((f) => /\.dll$/i.test(f))
const skip = /^(Assembly-CSharp|mscorlib|netstandard|System\.)/i
const refs = [NSTD, ...all.filter((f) => !skip.test(f)).map((f) => path.join(MANAGED, f))]
// 注入代码用了 `dynamic`，编译器需要 Microsoft.CSharp.dll；
// 游戏 Managed 里没有它（原游戏代码不用 dynamic），从便携 .NET 9 运行时借一个。
const MCSHARP = path.join(ROOT, '_tools/ai/dotnet/runtime9/shared/Microsoft.NETCore.App/9.0.20/Microsoft.CSharp.dll')
if (fs.existsSync(MCSHARP)) refs.push(MCSHARP)
else console.log('⚠️ 找不到 Microsoft.CSharp.dll —— dynamic 会编译失败')
console.log(`Roslyn netcore csc + 便携 .NET 9 + /nostdlib+`)
console.log(`引用 ${refs.length} 个程序集（官方 netstandard2.1 + ${refs.length - 1} 个游戏 DLL）`)

const outDll = path.join(OUTDIR, 'Assembly-CSharp.dll')
const args = [
  CSC, '/nologo', '/target:library', '/platform:anycpu', '/langversion:9.0', '/optimize+',
  '/nostdlib+',
  '/nowarn:0169,0414,0649,0108,0114,0162,0219,0067,1701,1702,8632',
  '/out:' + outDll,
  SRC,
  ...SRC_EXTRA,
  ...refs.map((r) => '/reference:' + r),
]
console.log(`源码：反编译产物 + ${SRC_EXTRA.length} 个注入文件`)
console.log('\n编译中…')
const r = spawnSync(DN, args, {
  stdio: 'inherit', cwd: ROOT,
  env: { ...process.env, DOTNET_ROOT: path.dirname(DN), DOTNET_CLI_TELEMETRY_OPTOUT: '1' },
})
if (r.status !== 0) { console.log(`\n✗ 编译失败（退出码 ${r.status}）`); process.exit(1) }
if (!fs.existsSync(outDll)) { console.log('✗ 没有产出'); process.exit(1) }

const o = fs.statSync(path.join(MANAGED, 'Assembly-CSharp.dll')).size
const n = fs.statSync(outDll).size
console.log(`\n✓ 编译成功`)
console.log(`  原 ${(o / 1024).toFixed(0)} KB  →  新 ${(n / 1024).toFixed(0)} KB`)
console.log(`  产物 ${path.relative(ROOT, outDll)}`)

if (INSTALL) {
  const BAK = path.join(ROOT, '_tmp_test_out/unity-backup/Assembly-CSharp.dll.orig')
  fs.mkdirSync(path.dirname(BAK), { recursive: true })
  if (!fs.existsSync(BAK)) { fs.copyFileSync(path.join(MANAGED, 'Assembly-CSharp.dll'), BAK); console.log('✓ 已备份原程序集') }
  fs.copyFileSync(outDll, path.join(MANAGED, 'Assembly-CSharp.dll'))
  console.log(`✓ 已装回游戏（回滚：把 ${path.relative(ROOT, BAK)} 复制回 Managed/）`)
} else {
  console.log('（未替换原文件；确认无误后加 --install）')
}
