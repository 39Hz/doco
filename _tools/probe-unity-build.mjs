// 可行性验证：能不能用系统的 csc.exe + 游戏的 DLL 编译出一个能装回去的程序集
//
// 【为什么先做这个】用户选了 B（改玩法/加系统），而 `多克多比-2026.2` 只有编译后的
//   `Assembly-CSharp.dll`（无 Unity 工程源码）。要改逻辑就必须能**重新编译**。
//   本脚本用一段最小代码验证：引 UnityEngine / TextMeshPro → 编译 → 用 Node 读回元数据确认。
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve('.')
const MANAGED = path.join(ROOT, '多克多比-2026.2/多克多比_Data/Managed')
const TMP = path.join(ROOT, '_tmp_test_out/buildtest')
fs.mkdirSync(TMP, { recursive: true })

const CSC = 'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (!fs.existsSync(CSC)) { console.log(`✗ 找不到 csc.exe`); process.exit(1) }

// 需要引用的程序集（编译 Unity 代码的最小集合）
// ⚠️ 两个坑（都实测踩过）：
//   ① **不要引用游戏的 mscorlib.dll** —— csc 自带一份，重复引用报
//      `CS1703: 已导入一个具有相同标识的多个程序集`。
//   ② **必须引用 netstandard.dll 与 System.Runtime.dll** —— 因为 `UnityEngine.CoreModule.dll`
//      是 netstandard2.1 面的，缺了会报 `CS0012: 类型 System.Object 未在引用的程序集中定义`。
const REFS = ['UnityEngine.dll', 'UnityEngine.CoreModule.dll', 'UnityEngine.UI.dll',
  'netstandard.dll', 'System.Runtime.dll']
  .map((f) => path.join(MANAGED, f)).filter((p) => fs.existsSync(p))
console.log('引用程序集：')
for (const r of REFS) console.log(`  ${path.basename(r)}  ${(fs.statSync(r).size / 1024).toFixed(0)} KB`)

const src = path.join(TMP, 'Probe.cs')
fs.writeFileSync(src, `
using UnityEngine;
using UnityEngine.UI;
public class DkdbbBuildProbe : MonoBehaviour {
    public Text label;
    void Start() {
        var go = new GameObject("probe");
        var t = go.transform;
        t.position = new Vector3(1f, 2f, 0f);
        if (label != null) label.text = "ok";
    }
    public int Add(int a, int b) { return a + b; }
}
`, 'utf8')

const outDll = path.join(TMP, 'Probe.dll')
const args = ['/nologo', '/target:library', '/platform:anycpu', '/out:' + outDll, src, ...REFS.map((r) => '/reference:' + r)]
console.log(`\n> csc ${args.slice(0, 4).join(' ')} …`)
try {
  const r = execFileSync(CSC, args, { stdio: 'inherit' })
} catch (e) {
  console.log(`✗ 编译失败: ${String(e.message).slice(0, 300)}`)
  process.exit(1)
}
if (!fs.existsSync(outDll)) { console.log('✗ 没有产出 dll'); process.exit(1) }
console.log(`✓ 编译成功 ${path.basename(outDll)}  ${(fs.statSync(outDll).size / 1024).toFixed(1)} KB`)

// 读回元数据，确认类与方法是"可用的"
const buf = fs.readFileSync(outDll)
const peOff = buf.readUInt32LE(0x3c)
const coffOff = peOff + 4
const nSec = buf.readUInt16LE(coffOff + 2)
const optSize = buf.readUInt16LE(coffOff + 16)
const optOff = coffOff + 20
const is64 = buf.readUInt16LE(optOff) === 0x20b
const ddOff = optOff + (is64 ? 112 : 96)
const sections = []
const secOff = optOff + optSize
for (let i = 0; i < nSec; i++) {
  const o = secOff + i * 40
  sections.push({ vaddr: buf.readUInt32LE(o + 12), vsize: buf.readUInt32LE(o + 8), raw: buf.readUInt32LE(o + 20), rawSize: buf.readUInt32LE(o + 16) })
}
const rva2off = (rva) => { for (const s of sections) if (rva >= s.vaddr && rva < s.vaddr + Math.max(s.vsize, s.rawSize)) return s.raw + (rva - s.vaddr); return -1 }
const mdOff = rva2off(buf.readUInt32LE(rva2off(buf.readUInt32LE(ddOff + 14 * 8)) + 8))
const verLen = buf.readUInt32LE(mdOff + 12)
let q = mdOff + 16 + verLen + 2 + 2
const nStreams = buf.readUInt16LE(q); q += 2
let sOff = -1, sSize = 0
for (let i = 0; i < nStreams; i++) {
  const off = buf.readUInt32LE(q), size = buf.readUInt32LE(q + 4); q += 8
  let e = q; while (buf[e] !== 0) e++
  const nm = buf.toString('ascii', q, e); q = (e + 1 + 3) & ~3
  if (nm === '#Strings') { sOff = mdOff + off; sSize = size }
}
const names = []
if (sOff > 0) {
  let i = sOff + 1, end = sOff + sSize
  while (i < end) { let e = i; while (e < end && buf[e] !== 0) e++; const s = buf.toString('utf8', i, e); if (s) names.push(s); i = e + 1 }
}
const ok = names.includes('DkdbbBuildProbe') && names.includes('Add')
console.log(`\n读回元数据：名字 ${names.length} 个`)
console.log(`  含 DkdbbBuildProbe: ${names.includes('DkdbbBuildProbe')}`)
console.log(`  含 Add: ${names.includes('Add')}`)
console.log(ok ? '\n✓ 可行性验证通过：能编译出可用的 Unity 程序集' : '\n✗ 元数据读回不完整')
process.exit(ok ? 0 : 1)
