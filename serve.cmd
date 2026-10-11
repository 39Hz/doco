@echo off
chcp 65001 >nul
title 多克多比 · 场景档案馆
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [错误] 没找到 Node.js。
  echo   两种解决办法：
  echo     1. 直接双击 index.html 也能玩（无需 Node）
  echo     2. 装一个 Node.js 后重跑本文件： https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo.
echo   正在启动本地服务器...
echo   浏览器会自动打开，关掉本窗口即停止服务。
echo.

start "" http://127.0.0.1:8080/
node "%~dp0_tools\serve.mjs" "%~dp0." 8080
pause
