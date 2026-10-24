@echo off
chcp 936 >nul 2>&1
setlocal EnableExtensions
title 三星堆 · 双刃战士

rem ============================================================
rem  双刃战士 · 纵目  —— 一键启动器
rem
rem  做法：直接交给系统默认浏览器打开 index.html。
rem
rem  为什么不用 --app 开无边框游戏窗口：
rem    --app 只认 Chromium 系，且实测对未编码的中文路径只开出空白页；
rem    要修好得先做百分号编码、再用独立 --user-data-dir 绕开「浏览器
rem    已在跑就把 --app 吞成普通标签页」，三层依赖，换台没装 Chrome
rem    的机器反而更容易开不出来。默认关联这条路不挑浏览器、不挑路径，
rem    是双击能玩的最短路径。
rem
rem  想要无边框全屏，游戏里按 F11，或手动用浏览器打开 index.html。
rem
rem  约束：本文件必须存成 ANSI/GBK 编码，且第二行钉死 chcp 936。
rem        存成 UTF-8 会被 cmd 按 936 误解码，全角标点拆成半角，
rem        撑坏 if 块与重定向，脚本当场崩。
rem
rem  用法：双击。排错：命令行执行  启动游戏.bat --diag
rem ============================================================

set "GAME=%~dp0index.html"
set "LOG=%~dp0launcher.log"
set "DIAG=0"
if /i "%~1"=="--diag" set "DIAG=1"

> "%LOG%" echo [launcher] %DATE% %TIME%
>>"%LOG%" echo [launcher] GAME = %GAME%
>>"%LOG%" echo [launcher] ARCH = %PROCESSOR_ARCHITECTURE%

rem ---------- 游戏本体必须在 ----------
if not exist "%GAME%" goto :err_nogame

rem ---------- 交给系统默认程序 ----------
>>"%LOG%" echo [launcher] open via shell default association

if not "%DIAG%"=="1" goto :go
echo.
echo   文件：%GAME%
echo   方式：系统默认浏览器
echo.
:go

start "" "%GAME%"

>>"%LOG%" echo [launcher] start returned, launcher exits
exit /b 0

rem ============================================================
:err_nogame
>>"%LOG%" echo [launcher] ERR index.html not found
echo.
echo   [错误] 找不到 index.html
echo.
echo   期望位置：
echo     %GAME%
echo.
echo   请确认「启动游戏.bat」和 index.html 放在同一个文件夹里。
echo   如果是从压缩包解压的，要整个文件夹一起解，不能只拖出这一个 bat。
echo.
echo   日志：%LOG%
echo.
pause
exit /b 1