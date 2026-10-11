# 操作 Unity 版《多克多比》并逐步截图：学习它的 HUD、人物移动、背包界面、战斗。
# 用法: powershell -File _tools/unity-tour.ps1 <步骤名...>
#   步骤: resize move back open1 open2 click:<x>,<y> key:<k> shot:<名字> wait:<秒>
Add-Type -AssemblyName System.Drawing, System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int t, bool r);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, uint d, IntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, IntPtr e);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  public const uint LD = 0x0002, LU = 0x0004;
}
"@

$root = (Get-Location).Path
$outDir = Join-Path $root 'docs\unity'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }

$proc = Get-Process -Name '多克多比' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) {
  # 必须在**同一个脚本进程里**启动：从沙箱 shell 里 Start-Process 出去的子进程
  # 会随父 shell 一起被收掉（上一轮就是这么"游戏没在运行"的）。
  $exe = Join-Path $root '多克多比-2026.2\多克多比.exe'
  if (-not (Test-Path $exe)) { throw "找不到 $exe" }
  Write-Output "启动游戏…"
  $proc = Start-Process -FilePath $exe -PassThru
  for ($i = 0; $i -lt 60 -and -not $proc.MainWindowHandle; $i++) {
    Start-Sleep -Seconds 1
    $proc.Refresh()
  }
  Start-Sleep -Seconds 12      # 等它进到主界面
}
$h = $proc.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { throw "拿不到游戏窗口句柄" }
[W]::ShowWindow($h, 9) | Out-Null      # 9 = 恢复正常
[W]::MoveWindow($h, 0, 0, 1280, 720, $true) | Out-Null
[W]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 800

function Shot($name) {
  $bmp = New-Object System.Drawing.Bitmap(1280, 720)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen(0, 0, 0, 0, (New-Object System.Drawing.Size(1280, 720)))
  $g.Dispose()
  $bmp.Save((Join-Path $outDir $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "  截图 $name"
}
function Click($x, $y) {
  [W]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 120
  [W]::mouse_event([W]::LD, 0, 0, 0, [IntPtr]::Zero)
  Start-Sleep -Milliseconds 60
  [W]::mouse_event([W]::LU, 0, 0, 0, [IntPtr]::Zero)
  Start-Sleep -Milliseconds 250
}
function Key($k) {
  # 用扫描码发按键，游戏才能收到（Unity 读的是 DirectInput/raw input）
  $map = @{ 'W'=0x11; 'A'=0x1E; 'S'=0x1F; 'D'=0x20; 'B'=0x30; 'C'=0x2E; 'I'=0x17; 'M'=0x32;
            'TAB'=0x0F; 'ESC'=0x01; 'SPACE'=0x39; 'ENTER'=0x1C; 'E'=0x12; 'Q'=0x10; 'R'=0x13;
            'F'=0x21; 'P'=0x19; 'UP'=0x48; 'DOWN'=0x50; 'LEFT'=0x4B; 'RIGHT'=0x4D }
  $sc = $map[$k.ToUpper()]
  if (-not $sc) { Write-Output "  未知按键 $k"; return }
  [W]::keybd_event([byte]$sc, 0, 0, [IntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [W]::keybd_event([byte]$sc, 0, 2, [IntPtr]::Zero)
  Start-Sleep -Milliseconds 300
}

[W]::SetForegroundWindow($h) | Out-Null
Shot '02-window.png'

foreach ($step in $args) {
  $parts = $step.Split(':', 2)
  $cmd = $parts[0]; $arg = if ($parts.Length -gt 1) { $parts[1] } else { '' }
  switch ($cmd) {
    'wait'  { Start-Sleep -Seconds ([double]$arg) }
    'shot'  { Shot $arg }
    'key'   { Key $arg }
    'click' { $xy = $arg.Split(','); Click ([int]$xy[0]) ([int]$xy[1]) }
    'hold'  {
      $kv = $arg.Split(','); $sc = @{ 'W'=0x11; 'A'=0x1E; 'S'=0x1F; 'D'=0x20; 'UP'=0x48; 'DOWN'=0x50; 'LEFT'=0x4B; 'RIGHT'=0x4D }[$kv[0].ToUpper()]
      [W]::keybd_event([byte]$sc, 0, 0, [IntPtr]::Zero)
      Start-Sleep -Milliseconds ([int]$kv[1])
      [W]::keybd_event([byte]$sc, 0, 2, [IntPtr]::Zero)
      Start-Sleep -Milliseconds 200
    }
    default { Write-Output "  未知步骤 $step" }
  }
}
Write-Output "完成"
