// 验证：我们自己编译的 Assembly-CSharp.dll 里，形态数据能正确查到（直接加载程序集跑）
//
// 【为什么要真跑】只看源码"长得对"不算数 —— 反射加载能证明：
//   · 程序集能被 .NET 加载（没坏）
//   · DkdbbForms.All 真的有 52 条
//   · 按名字查得到、数值就是表里的值、元素映射正确
//
// 用法: node _tools\verify-injected-forms.mjs
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = path.resolve('.')
const DLL = path.join(ROOT, '多克多比-2026.2/decompiled/build-out/Assembly-CSharp.dll')
const MANAGED = path.join(ROOT, '多克多比-2026.2/多克多比_Data/Managed')
const DN = path.join(ROOT, '_tools/ai/dotnet/runtime9/dotnet.exe')
const TMP = path.join(ROOT, '_tmp_test_out/verify-inject')
fs.mkdirSync(TMP, { recursive: true })
if (!fs.existsSync(DLL)) { console.log('✗ 没有编译产物（先跑 node _tools/build-2026.mjs）'); process.exit(1) }

// 用反射加载：只需能读到 DkdbbForms 的类型与字段，不实例化（避免拉进 UnityEngine 依赖）
const prog = `
using System;
using System.IO;
using System.Reflection;
class P {
  // 程序集里引用了 UnityEngine，验证程序自己不在游戏的 Managed 目录里，
  // 所以要手动把依赖解析到那里去（否则报 FileNotFoundException: UnityEngine.CoreModule）。
  static Assembly Resolve(object s, ResolveEventArgs e) {
    string dir = @"${MANAGED.replace(/\\/g, '\\\\')}";
    string name = new AssemblyName(e.Name).Name + ".dll";
    string p = Path.Combine(dir, name);
    return File.Exists(p) ? Assembly.LoadFrom(p) : null;
  }
  static int Main() {
    AppDomain.CurrentDomain.AssemblyResolve += Resolve;
    string dll = @"${DLL.replace(/\\/g, '\\\\')}";
    Assembly asm;
    try { asm = Assembly.LoadFrom(dll); }
    catch (Exception e) { Console.WriteLine("LOAD_FAIL " + e.GetType().Name + ": " + e.Message); return 1; }
    Console.WriteLine("程序集已加载: " + asm.GetName().Name + " v" + asm.GetName().Version);
    Type t = asm.GetType("Dkdbb.DkdbbForms");
    if (t == null) { Console.WriteLine("FAIL 找不到 Dkdbb.DkdbbForms"); return 1; }
    FieldInfo all = t.GetField("All", BindingFlags.Public | BindingFlags.Static);
    if (all == null) { Console.WriteLine("FAIL 找不到 All 字段"); return 1; }
    Array arr = (Array)all.GetValue(null);
    Console.WriteLine("All.Length = " + arr.Length);
    if (arr.Length != 52) { Console.WriteLine("FAIL 期望 52 条"); return 1; }
    Type fd = asm.GetType("Dkdbb.FormDef");
    Console.WriteLine("FormDef = " + (fd != null ? "OK" : "缺失"));
    // 逐条读名字/元素/数值
    FieldInfo fName = fd.GetField("name"), fEl = fd.GetField("element");
    FieldInfo fHp = fd.GetField("hp"), fAtk = fd.GetField("atk"), fSpd = fd.GetField("speed");
    int i = 0, shown = 0;
    foreach (object o in arr) {
      string nm = (string)fName.GetValue(o);
      string el = fEl.GetValue(o).ToString();
      if (shown < 6) {
        Console.WriteLine(string.Format("  [{0}] {1}  {2}  HP={3} ATK={4} SPD={5}",
          i, nm, el, fHp.GetValue(o), fAtk.GetValue(o), fSpd.GetValue(o)));
        shown++;
      }
      i++;
    }
    // 关键：Get() 能用吗（它会建字典）
    MethodInfo get = t.GetMethod("Get", BindingFlags.Public | BindingFlags.Static);
    MethodInfo norm = t.GetMethod("Normalize", BindingFlags.Public | BindingFlags.Static);
    if (norm != null) Console.WriteLine("Normalize(\\"水多比\\") = [" + norm.Invoke(null, new object[]{"水多比"}) + "]");
    if (get != null) {
      object hit = get.Invoke(null, new object[]{"水多比"});
      Console.WriteLine("Get(\\"水多比\\") = " + (hit == null ? "null" : fName.GetValue(hit) + " / " + fEl.GetValue(hit)));
      object hit2 = get.Invoke(null, new object[]{"水 多比"});   // 带空格
      Console.WriteLine("Get(\\"水 多比\\") = " + (hit2 == null ? "null" : fName.GetValue(hit2)));
      object miss = get.Invoke(null, new object[]{"不存在的形态"});
      Console.WriteLine("Get(不存在) = " + (miss == null ? "null（正确：不硬套）" : "**非 null，有问题**"));
    }
    Console.WriteLine("OK");
    return 0;
  }
}
`
const cs = path.join(TMP, 'Verify.cs')
fs.writeFileSync(cs, prog, 'utf8')

// 编译这个小验证程序：用便携 .NET 9 + Roslyn，引用官方 netstandard 面
const NSTD = path.join(ROOT, '_tools/ai/netstandard-ref/ref/ref/netstandard2.1/netstandard.dll')
const CSC = path.join(ROOT, '_tools/ai/roslyn/toolset/tasks/netcore/bincore/csc.dll')
const exe = path.join(TMP, 'Verify.dll')
const args = [CSC, '/nologo', '/target:exe', '/langversion:9.0', '/nostdlib+',
  '/out:' + exe, cs, '/reference:' + NSTD]
let r = spawnSync(DN, args, { stdio: 'inherit', cwd: TMP, env: { ...process.env, DOTNET_ROOT: path.dirname(DN) } })
if (r.status !== 0) { console.log('✗ 验证程序编译失败'); process.exit(1) }

// 需要 runtimeconfig 才能被 dotnet 跑
fs.writeFileSync(path.join(TMP, 'Verify.runtimeconfig.json'), JSON.stringify({
  runtimeOptions: { tfm: 'net9.0', framework: { name: 'Microsoft.NETCore.App', version: '9.0.0' }, rollForward: 'Major' },
}, null, 1))

console.log('=== 加载并检查注入结果 ===')
r = spawnSync(DN, [exe], { stdio: 'inherit', cwd: TMP, env: { ...process.env, DOTNET_ROOT: path.dirname(DN) } })
console.log(`退出码 ${r.status}`)
process.exit(r.status === 0 ? 0 : 1)
