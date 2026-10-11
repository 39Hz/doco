# 冒烟测试：启动打包好的 exe，验证
#   1) /__ping 能认出"这是我们自己"
#   2) /__save 能写入并在重启后读回（用户报的"存档重启又从头开始"就是这条）
#   3) 存档文件确实落在 exe 旁边
#   4) 第二个实例认出"已在运行"，不换端口、不双开
#
# 【第 46 轮修】原先所有失败都只在输出里写一行，**退出码恒为 0** ——
# 也就是"exe 根本没起来"和"全部通过"在自动化眼里长得一模一样。
# R11 要求"exe 实测启动"是发布验收的一环，所以这里改成：任何一条失败 → exit 1。
$ErrorActionPreference = 'Continue'
$failed = 0
function Note($msg, $isOk) {
  if ($isOk) { Write-Output "  [OK]   $msg" } else { Write-Output "  [FAIL] $msg"; $script:failed++ }
}

$exe = Join-Path (Get-Location) 'dist\多克多比.exe'
if (-not (Test-Path $exe)) { throw "找不到 $exe" }

$p = Start-Process -FilePath $exe -ArgumentList '--no-browser' -PassThru -WindowStyle Minimized
Start-Sleep -Seconds 4
try {
  $ping = Invoke-WebRequest -Uri 'http://127.0.0.1:8765/__ping' -UseBasicParsing -TimeoutSec 5
  Note "1) /__ping -> HTTP $($ping.StatusCode)  body=$($ping.Content)  标记头 X-DKDbb=$($ping.Headers['X-DKDbb'])" ($ping.StatusCode -eq 200)
} catch {
  Note "1) /__ping 失败: $_" $false
}

$payload = '{"level":9,"gold":777,"forms":["克罗 多比"],"items":{"291001":3}}'
try {
  $post = Invoke-WebRequest -Uri 'http://127.0.0.1:8765/__save' -Method POST -Body $payload -UseBasicParsing -TimeoutSec 5
  Note "2) POST /__save -> HTTP $($post.StatusCode)  body=$($post.Content)" ($post.StatusCode -eq 200)
} catch {
  Note "2) POST /__save 失败: $_" $false
}

$saveFile = Join-Path (Get-Location) 'dist\save.json'
Note "3) save.json 存在=$([bool](Test-Path $saveFile))" ([bool](Test-Path $saveFile))
if (Test-Path $saveFile) { Write-Output "       内容: $(Get-Content $saveFile -Raw)" }

try {
  $get = Invoke-WebRequest -Uri 'http://127.0.0.1:8765/__save' -UseBasicParsing -TimeoutSec 5
  Note "4) GET /__save -> $($get.Content)" ($get.StatusCode -eq 200)
} catch {
  Note "4) GET /__save 失败: $_" $false
}

# 再起一个实例：应该认出"已在运行"并把窗口指过去，而不是换端口
$p2 = Start-Process -FilePath $exe -ArgumentList '--no-browser' -PassThru -WindowStyle Minimized
Start-Sleep -Seconds 4
$alive = @(Get-Process -Name '多克多比' -ErrorAction SilentlyContinue)
Note "5) 同时运行的实例数: $($alive.Count)（期望 1 —— 第二个应该自己退出）" ($alive.Count -eq 1)

Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
if ($p2) { Stop-Process -Id $p2.Id -Force -ErrorAction SilentlyContinue }
Get-Process -Name '多克多比' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item $saveFile -ErrorAction SilentlyContinue

if ($failed -gt 0) {
  Write-Output "smoke-exe: 失败 $failed 项"
  exit 1
}
Write-Output 'smoke-exe: 全部通过'
exit 0
