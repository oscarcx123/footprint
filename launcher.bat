@echo off
REM 切换到脚本所在目录（防止从别的地方双击）
cd /d %~dp0

echo Launching footprints...

start cmd /k python -m http.server 8080

REM 等待几秒，确保服务器启动完成
timeout /t 3 /nobreak >nul

echo Opening footprints in browser...
start http://127.0.0.1:8080

echo Done.
