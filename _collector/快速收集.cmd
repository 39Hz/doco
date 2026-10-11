@echo off
rem ===================================================================
rem  Dukeduobi asset collector - QUICK scan launcher (no full sweep)
rem  Keep this file pure ASCII and CRLF. Chinese lives in collect.ps1.
rem ===================================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PS=powershell.exe"
if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" set "PS=%ProgramFiles%\PowerShell\7\pwsh.exe"
where pwsh.exe >nul 2>nul && set "PS=pwsh.exe"

if not exist "%~dp0collect.ps1" (
  echo [ERROR] collect.ps1 is missing next to this file.
  pause
  exit /b 1
)

rem Restore the UTF-8 BOM if an editor or archive tool dropped it.
"%PS%" -NoProfile -Command "$p=Join-Path '%~dp0' 'collect.ps1'; if(Test-Path -LiteralPath $p){$b=[IO.File]::ReadAllBytes($p); if(-not($b.Length -ge 3 -and $b[0] -eq 239 -and $b[1] -eq 187 -and $b[2] -eq 191)){[IO.File]::WriteAllBytes($p,[byte[]]([byte[]](239,187,191)+$b))}}" 2>nul

"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0collect.ps1" -Quick %*
echo.
pause
