@echo off
REM 切换到脚本所在目录（防止从别的地方双击）
cd /d %~dp0

echo Starting editor server...

REM 二选一：用 npm 或直接 node
REM 如果你常用 npm，推荐这一行
start cmd /k npm run editor

REM 如果你更想直接用 node，注释上面一行，启用下面这一行
REM start cmd /k node scripts/editor_server.js

REM 等待几秒，确保服务器启动完成
timeout /t 3 /nobreak >nul

echo Opening editor in browser...
start http://127.0.0.1:3000/editor.html

echo Done.
