// 把游戏里用到的 JPEG 素材转成 PNG 缓存，供无头截图工具使用。
// 原因：我只写了 PNG 解码器（drawImage 需要原始像素），而场景素材里有 556 个 .jpg。
// Windows 的 GDI+ 能可靠解码 JPEG，让 PowerShell 批量转一次最省事。
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve('.')
const CACHE = path.join(ROOT, '_tools', 'imgcache')
fs.mkdirSync(CACHE, { recursive: true })

// 找出所有要用的 jpg：manifest 场景图 + 其它引用
const need = new Set()
const manPath = path.join(ROOT, 'assets', 'manifest.json')
if (fs.existsSync(manPath)) {
  const man = JSON.parse(fs.readFileSync(manPath, 'utf8'))
  for (const s of man.scenes || []) if (s.file && /\.jpe?g$/i.test(s.file)) need.add(s.file)
}
// 顺便把 assets 下所有 jpg/jpeg 都转（556 个，一次性解决，后面不会再缺）
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.jpe?g$/i.test(e.name)) out.push(path.relative(ROOT, p).replace(/\\/g, '/'))
  }
  return out
}
for (const f of walk(path.join(ROOT, 'assets'))) need.add(f)
const list = [...need]
console.log('需要转换的 JPEG: ' + list.length + ' 个')

const jobs = list.map((rel) => ({
  src: rel,
  dst: '_tools/imgcache/' + rel.replace(/[\/]/g, '__').replace(/\.jpe?g$/i, '.png'),
}))
const todo = jobs.filter((j) => !fs.existsSync(path.join(ROOT, j.dst)))
console.log('已缓存 ' + (jobs.length - todo.length) + ' 个，需要新转 ' + todo.length + ' 个')
if (!todo.length) { writeIndex(jobs); process.exit(0) }

// 生成 PowerShell 批量转换脚本（带 UTF-8 BOM，否则中文路径会乱码）
const lines = [
  "Add-Type -AssemblyName System.Drawing",
  "$ErrorActionPreference = 'Continue'",
  "function Conv($src, $dst) {",
  "  try {",
  "    $img = [System.Drawing.Image]::FromFile($src)",
  "    $bmp = New-Object System.Drawing.Bitmap($img.Width, $img.Height)",
  "    $g = [System.Drawing.Graphics]::FromImage($bmp)",
  "    $g.DrawImage($img, 0, 0, $img.Width, $img.Height)",
  "    $g.Dispose()",
  "    $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)",
  "    $bmp.Dispose(); $img.Dispose()",
  "    Write-Output ('OK ' + $dst)",
  "  } catch { Write-Output ('ERR ' + $dst + ' :: ' + $_.Exception.Message) }",
  "}",
]
for (const j of todo) {
  lines.push('Conv "' + path.join(ROOT, j.src).replace(/\\/g, '\\\\') + '" "' + path.join(ROOT, j.dst).replace(/\\/g, '\\\\') + '"')
}
const psPath = path.join(CACHE, '_convert.ps1')
fs.writeFileSync(psPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lines.join('\n'), 'utf8')]))
console.log('已写出转换脚本，正在执行…')
try {
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath], { stdio: 'inherit', timeout: 1500000 })
} catch (e) {
  console.log('转换脚本返回非零（部分文件可能失败），继续检查结果')
}
const ok = jobs.filter((j) => fs.existsSync(path.join(ROOT, j.dst))).length
console.log('转换完成: ' + ok + '/' + jobs.length + ' 个成功')
writeIndex(jobs)

function writeIndex(jobs) {
  const map = {}
  for (const j of jobs) {
    const p = path.join(ROOT, j.dst)
    if (fs.existsSync(p)) map[j.src] = j.dst
  }
  fs.writeFileSync(path.join(CACHE, 'index.json'), JSON.stringify(map, null, 1), 'utf8')
  console.log('已写 _tools/imgcache/index.json（' + Object.keys(map).length + ' 条）')
}
