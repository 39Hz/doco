# 截取主屏（或指定窗口区域）保存成 PNG。
# 用途：用户新给了一份 Unity 版《多克多比》，他让我"从里面学习人物移动、背包界面、战斗"。
# 最直接的办法就是把它跑起来截图看。这个脚本负责截图，_tools/unity-tour.ps1 负责操作。
param(
  [string]$Out = "docs\unity\shot.png",
  [int]$X = -1, [int]$Y = -1, [int]$W = 0, [int]$H = 0
)
Add-Type -AssemblyName System.Drawing, System.Windows.Forms

if ($X -lt 0) {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $X = $b.X; $Y = $b.Y; $W = $b.Width; $H = $b.Height
}
if ($W -le 0 -or $H -le 0) { throw "截图区域无效: $W x $H" }

$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($X, $Y, 0, 0, (New-Object System.Drawing.Size($W, $H)))
$g.Dispose()

$dir = Split-Path -Parent $Out
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$bmp.Save((Resolve-Path -LiteralPath (Split-Path -Parent $Out)).Path + "\" + (Split-Path -Leaf $Out),
          [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "captured ${W}x${H} -> $Out"
