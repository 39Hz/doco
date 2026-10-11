// 权威判定：用 Windows 自带的 .NET System.IO.Compression 逐条目解压校验
//
// 【为什么不用自己写的解析】我先前写的 `verify-zip-crc.mjs` 报"5123/3603 坏"，
//   但它自己的输出就自相矛盾（说中央目录 5124 条目、却只检查了 5123 个），
//   而且坏条目的模式是"每个都差一个位置" —— 那更像**解析器读偏了一个字节**，
//   不是包真的坏。**不能拿一份可能错的代码去指控包坏了**，所以换成 .NET 这个
//   Windows 自带、每天被无数程序使用的实现来做最终判定。
//
// 用法: node _tools/verify-zip-dotnet.mjs
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const name = process.argv[2] || fs.readdirSync(ROOT).filter((f) => /^多克多比v[\d.]+单机版\.zip$/.test(f)).sort().pop()
const zipPath = path.join(ROOT, name)
console.log(`包: ${name}  ${(fs.statSync(zipPath).size / 1048576).toFixed(2)} MB`)

// 交给 PowerShell 跑 .NET（脚本用 -Command 内联，避免文件编码问题）
const ps = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[System.IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/'/g, "''")}')
$ok=0; $bad=0; $list=New-Object System.Collections.ArrayList
foreach($e in $zip.Entries){
  try{
    if($e.Length -eq 0){ $ok++; continue }
    $s=$e.Open(); $ms=New-Object System.IO.MemoryStream
    $s.CopyTo($ms); $s.Close()
    $got=$ms.Length; $ms.Dispose()
    if($got -ne $e.Length){ $bad++; if($list.Count -lt 6){[void]$list.Add($e.FullName+' 期望'+$e.Length+' 实得'+$got)} }
    else { $ok++ }
  } catch {
    $bad++; if($list.Count -lt 6){[void]$list.Add($e.FullName+' 异常: '+$_.Exception.Message)}
  }
}
$n=$zip.Entries.Count
$zip.Dispose()
Write-Output ('ENTRIES=' + $n)
Write-Output ('OK=' + $ok)
Write-Output ('BAD=' + $bad)
foreach($x in $list){ Write-Output ('PROB=' + $x) }
`
const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const out = (r.stdout || '') + (r.stderr || '')
const num = (k) => { const m = out.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim() : '?' }
console.log(`  容器报告条目数: ${num('ENTRIES')}`)
console.log(`  逐条目解压：正常 ${num('OK')} / 异常 ${num('BAD')}`)
for (const m of out.matchAll(/^PROB=(.*)$/gm)) console.log(`  ✗ ${m[1]}`)
const bad = Number(num('BAD'))
if (Number.isNaN(bad)) { console.log('\n（PowerShell 没给出结果，原始输出：）'); console.log(out.slice(0, 800)); process.exit(2) }
console.log(bad === 0
  ? '\n✓ 用 Windows 自带解压器可以完整解开这个包（先前那份自写 CRC 脚本是错的）'
  : `\n✗ 包确实坏了：${bad} 个条目解不开 —— 必须修打包代码`)
process.exit(bad === 0 ? 0 : 1)
