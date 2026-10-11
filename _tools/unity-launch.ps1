# 启动 Unity 版《多克多比》并截一张图（不操作）。
# 用户让我从这份新素材里学习"人物移动 / 背包界面 / 战斗"，所以先把它跑起来看一眼。
Add-Type -AssemblyName System.Drawing, System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, uint d, IntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, IntPtr e);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002, MOUSEEVENTF_LEFTUP = 0x0004;
}
"@

$exe = Join-Path (Get-Location) '多克多比-2026.2\多克多比.exe'
if (-not (Test-Path $exe)) { throw "找不到 $exe" }

function Shot($name) {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.X, $b.Y, 0, 0, (New-Object System.Drawing.Size($b.Width, $b.Height)))
  $g.Dispose()
  $dir = Join-Path (Get-Location) 'docs\unity'
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $p = Join-Path $dir $name
  $bmp.Save($p, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "截图 $name  ($($b.Width)x$($b.Height))"
}

$proc = Get-Process -Name '多克多比' -ErrorAction SilentlyContinue
if (-not $proc) {
  Write-Output "启动 $exe …"
  $proc = Start-Process -FilePath $exe -PassThru
} else {
  Write-Output "已在运行 (PID $($proc.Id))"
}
Start-Sleep -Seconds 30
$proc.Refresh()
Write-Output "进程状态: HasExited=$($proc.HasExited)  MainWindowTitle='$($proc.MainWindowTitle)'"
if (-not $proc.HasExited) {
  try {
    [W]::ShowWindow($proc.MainWindowHandle, 3) | Out-Null   # 3 = 最大化
    [W]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
  } catch { }
  Start-Sleep -Seconds 3
}
Shot '01-launch.png'
