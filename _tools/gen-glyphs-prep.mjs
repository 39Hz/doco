// 生成字形图集（三步）：
//   1) node _tools/gen-glyphs-prep.mjs   → 写出 _chars.json 与 _gen.ps1，并自检覆盖
//   2) powershell.exe -NoProfile -ExecutionPolicy Bypass -File _tools/glyphs/_gen.ps1
//      （脚本自己写 raw.json，不要用 > 重定向，见文件末尾的踩坑记录）
//   3) node _tools/gen-glyphs-post.mjs   → 解析图集，生成 index.json 与 atlas_*.rgba
//
// 【为什么改成自动发现】
// 原先这里硬编码了 14 个文件，漏了 game/tables/skills-official.js（官方技能表）。
// 于是官方技能名/描述里的 27 个字（滞割虎扑尘棱掩杜钻柄惧煦益藉蜃绞瞄扁劈诛盛曼陀绽蜂痹肌）
// 从来没进过图集，截图里这些字被静默跳过 —— 和之前 assets/soya.js 漏加载、测试文件漏跑是同一类错误：
// **硬编码清单一定会过时**。现在改为解析 game.html 的 <script src>，那是运行时的唯一真相。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const OUT = path.join(ROOT, '_tools', 'glyphs')
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

// ---- 1. 从 game.html 发现脚本清单（唯一真相），不再硬编码 ----
const htmlPath = path.join(ROOT, 'game.html')
if (!existsSync(htmlPath)) throw new Error('找不到 game.html，无法发现脚本清单')
const html = readFileSync(htmlPath, 'utf8')
const files = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1])
if (files.length < 10) throw new Error(`从 game.html 只解析到 ${files.length} 个脚本，明显不对`)
// 兼容惰性加载的 assets（被 __DKDbb_* 全局引用的数据文件），避免再次漏字
for (const extra of ['assets/knights.js']) {
  if (!files.includes(extra) && existsSync(path.join(ROOT, extra))) files.push(extra)
}

const chars = new Set()
const sizes = new Set()
let scanned = 0
for (const f of files) {
  const p = path.join(ROOT, f)
  if (!existsSync(p)) { console.log('  跳过（不存在）: ' + f); continue }
  const s = readFileSync(p, 'utf8')
  scanned++
  for (const ch of s) chars.add(ch)
  for (const m of s.matchAll(/size:\s*([\d.]+)/g)) sizes.add(Math.round(parseFloat(m[1])))
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)px\s/g)) sizes.add(Math.round(parseFloat(m[1])))
}

// 兜底常用字：数据表会长，这里再补一批"游戏里大概率会出现"的字
for (const ch of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .,:;!?+-*/()[]{}%#@&|<>~^_=\'"`\\·—…、。，：；！？（）【】《》“”‘’') chars.add(ch)
for (const ch of '零一二三四五六七八九十百千万亿级攻防血魔命中回避爆击速度经验金币背包技能道具任务地图场景怪物玩家战斗胜利失败逃跑恢复提升下降获得缺少请按空格返回继续确定是否第页共个只种套件把刀剑盾牌药水卷轴钥匙宝箱' +
  '饼泉冻烧腾异剂活补归抗镖惊吓烟雾弹炸菠菜噜哈奇砖炫标枪板' +
  '初级中高级大小属性元素风火水土光暗毒无攻击防御值数量价格购买出售商店杂货货架老板商人旅行' +
  '效果持续回合冷却能量消耗造成伤害群单体目标选择使用丢弃拥有全部收集完成尚未' +
  '存档读取保存重新开始继续游戏设置音量全屏静音帮助说明操作方向键鼠标左键右键点击' +
  '区域岛屿海洋森林沙漠遗迹火山洞窟城堡大街集市港口码头桥梁山路平原草原雪原' +
  '索亚多比形态变身进化等级经验升级突破材料碎片合成强化镶嵌宝石符文徽章荣耀' +
  '冒险旅程任务主线支线日常活动限时奖励领取兑换积分排行好友聊天邮件系统提示' +
  '骑士魔王图鉴来源官方推算社区缺失标注归属地形智慧勇气峡谷悬浮未知森林学院大街城堡') chars.add(ch)

// 只保留 BMP 内的字符：GDI+ 的 DrawString 走 UTF-16，[char] 只能放 BMP 码位
const list = [...chars]
  .filter((c) => { const cp = c.codePointAt(0); return cp > 31 && cp <= 0xffff })
  .sort((a, b) => a.codePointAt(0) - b.codePointAt(0))

// ---- 2. 自检：图集必须覆盖运行时真正会被绘制的字符串 ----
// 这是"渲染前"的自证，防止再次出现"字画不出来"却没人发现。
const codes = new Set(list.map((c) => c.codePointAt(0)))
const probes = []
function probe(file, patterns) {
  const p = path.join(ROOT, file)
  if (!existsSync(p)) return
  const src = readFileSync(p, 'utf8')
  for (const re of patterns) for (const m of src.matchAll(re)) probes.push(m[1] ?? '')
}
probe('game/tables/skills-official.js', [/"name"\s*:\s*"([^"]+)"/g, /"desc"\s*:\s*"([^"]+)"/g])
probe('game/tables/form-skills-official.js', [/"name"\s*:\s*"([^"]+)"/g])
probe('game/tables/data.js', [/name\s*:\s*'([^']+)'/g, /title\s*:\s*'([^']+)'/g])
probe('world.js', [/name\s*:\s*'([^']+)'/g])
probe('game/game.js', [/drawText\([^,]+,\s*'([^']+)'/g, /drawText\([^,]+,\s*"([^"]+)"/g, /label\s*:\s*'([^']+)'/g])

const gap = new Set()
for (const t of probes) for (const ch of t) {
  if (ch === '\n' || ch === '\t' || ch === ' ') continue
  if (!codes.has(ch.codePointAt(0))) gap.add(ch)
}
if (!codes.has('多'.codePointAt(0)) || !codes.has('比'.codePointAt(0))) {
  throw new Error('自检失败：连"多比"都不在图集里，说明字符收集逻辑坏了')
}
if (gap.size) {
  console.log(`自检失败：还有 ${gap.size} 个运行时会画出来的字不在图集里 → ${[...gap].join('')}`)
  process.exit(1)
}
console.log(`自检通过：${list.length} 个字符，扫描 ${scanned} 个脚本文件，运行时字符串零缺失`)

// 只渲染**一个母版字号**，其余字号由降采样得到（21 字号 × 2 字重会到 1.5 GB）
const SIZE_LIST = [48]
console.log('字符 ' + list.length + ' 个，字号 ' + SIZE_LIST.join(','))

writeFileSync(path.join(OUT, '_chars.json'), JSON.stringify(list.map((c) => c.codePointAt(0))), 'utf8')

const psCode = `Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$outDir = '${OUT.replace(/\\/g, '\\\\')}'
$codes = Get-Content -Raw -Encoding UTF8 (Join-Path $outDir '_chars.json') | ConvertFrom-Json
$perRow = 40
$result = @{}
foreach ($size in @(${SIZE_LIST.join(',')})) {
  foreach ($styleName in @('regular','bold')) {
    $style = if ($styleName -eq 'bold') { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    $font = New-Object System.Drawing.Font('Microsoft YaHei', [float]$size, $style, [System.Drawing.GraphicsUnit]::Pixel)
    $cell = [int]($size * 1.9) + 6
    $rows = [int][Math]::Ceiling($codes.Count / $perRow)
    $bmp = New-Object System.Drawing.Bitmap([int]($cell * $perRow), [int]($cell * $rows))
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(0,0,0,0))
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    $fmt = [System.Drawing.StringFormat]::GenericTypographic
    $entries = New-Object System.Collections.ArrayList
    for ($i = 0; $i -lt $codes.Count; $i++) {
      $ch = [string][char]$codes[$i]
      $col = $i % $perRow
      $row = [int][Math]::Floor($i / $perRow)
      $ox = $col * $cell + 2
      $oy = $row * $cell + 2
      $sz = $g.MeasureString($ch, $font, 1000, $fmt)
      $g.DrawString($ch, $font, [System.Drawing.Brushes]::White, [float]$ox, [float]$oy, $fmt)
      [void]$entries.Add([pscustomobject]@{ code = $codes[$i]; x = [int]$ox; y = [int]$oy; w = [int][Math]::Ceiling($sz.Width); h = [int][Math]::Ceiling($sz.Height); adv = [double]$sz.Width })
    }
    $g.Dispose()
    $file = Join-Path $outDir ('glyph_' + $size + '_' + $styleName + '.png')
    $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose(); $font.Dispose()
    $result["$size|$styleName"] = [pscustomobject]@{ file = 'glyph_' + $size + '_' + $styleName + '.png'; cell = $cell; perRow = $perRow; entries = $entries }
  }
}
$json = $result | ConvertTo-Json -Depth 6 -Compress
[System.IO.File]::WriteAllText((Join-Path $outDir 'raw.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ('raw.json 已写出: ' + $json.Length + ' 字符')
`
// 【踩坑记录】以前是 `powershell.exe -File _gen.ps1 > raw.json`。
// Windows PowerShell 的重定向写的是 UTF-16LE，post 用 utf8 读会得到 "{ \" 4 8 \"…" 这种隔字空格，
// JSON.parse 直接炸。现在改成脚本内部用 UTF8Encoding($false) 自己写文件，不再依赖外层重定向。
writeFileSync(path.join(OUT, '_gen.ps1'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(psCode, 'utf8')]))
console.log('已写出 _gen.ps1，请运行：powershell.exe -NoProfile -ExecutionPolicy Bypass -File _tools/glyphs/_gen.ps1')
