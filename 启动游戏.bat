@echo off
chcp 936 >nul 2>&1
setlocal EnableExtensions EnableDelayedExpansion
title 三星堆 · 双刃战士

rem ============================================================
rem  双刃战士 · 纵目  --  一键启动器
rem
rem  先说结论：游戏本体就是 index.html 一个文件，双击就能玩。
rem  这个 bat 不做别的事，只干一件：别让 IE 把这个页面接走。
rem
rem  为什么需要这一层：
rem    .html 的处理器由注册表决定。本机 HKLM 层 .html 指向
rem    htmlfile，而 htmlfile 的打开命令是 iexplore.exe。也就是说
rem    在没设过「默认浏览器」的机器上，双击 index.html 会交给 IE，
rem    而 IE 跑不了这个游戏（没有 Promise、WebAudio 不兼容、
rem    脚本语法太新），玩家看到的是打不开或者一片白。
rem    HKCU 里一旦有 .html 的 UserChoice（用户亲手指过「默认用谁开」），
rem    就按它走 —— 本机现在指到 Tabbit Browser，双击本来就能玩。
rem
rem  所以判定顺序是：
rem    1  读 .html 的默认处理器。不是 IE 就直接交给默认程序，最短路径。
rem    2  是 IE、或者压根没有默认处理器，才去探测 Chromium 系浏览器：
rem       Edge(x86) -> Edge -> Chrome -> Chrome(x86) -> Chrome(local)，
rem       命中第一个就用它，参数给 index.html 的绝对路径。
rem    3  连 Chromium 都没有，才退回系统默认程序，并在控制台说一句。
rem
rem  为什么参数给绝对路径，不做 file:/// 与百分号编码：
rem    bat 与浏览器之间传的是 Unicode 进程参数，中文与空格原样到达，
rem    不存在按 936 或 UTF-8 再解一次的问题；浏览器拿到一个存在的
rem    绝对路径，自己会转成 file:/// 并对中文做百分号编码。
rem    反过来，纯 bat 调不到 .NET 的 Uri 类，手写转义只会写出 bug。
rem    实测：传绝对路径，Edge 打开的是
rem      file:///D:/.../double-blade-zongmu/index.html
rem    正确。
rem
rem  为什么不传相对文件名 index.html（看着最省事，但实测不可靠）：
rem    实测 Edge 把不像 URL 的参数当主机名补全：
rem      start "" msedge.exe "index.html"  =>  打开 http://index.html/
rem      页面 ERR_NAME_NOT_RESOLVED，等于白屏。
rem    传 .\index.html 同样变成 http://./index.html/。
rem    所以一律传 %GAME% 绝对路径。
rem
rem  编码约束：本文件必须存成 ANSI/GBK，且第二行钉死 chcp 936。
rem    存成 UTF-8 会被 cmd 按 936 误解码，中文全乱，
rem    全角标点还会把 if 块撑坏，脚本当场崩。
rem
rem  用法：双击启动。
rem        排错：命令行执行  启动游戏.bat --diag
rem             诊断模式只打印将要执行的命令，不真的开浏览器。
rem ============================================================

cd /d "%~dp0"

set "GAME=%~dp0index.html"
set "LOG=%~dp0launcher.log"
set "DIAG=0"

rem ---------- 解析参数：扫全部参数，--diag 放第几个都认 ----------
:parse
if "%~1"=="" goto :parsed
if /i "%~1"=="--diag" set "DIAG=1"
shift
goto :parse

:parsed

set "CAND="
set "CANDSRC="
set "PROGID="
set "PROGCMD="
set "IEHANDLER=1"

rem ---------- 1 先看 .html 的默认处理器是不是 IE ----------
for /f "tokens=3" %%a in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.html\UserChoice" /v ProgId 2^>nul ^| findstr /i "ProgId"') do set "PROGID=%%a"
if defined PROGID call :probe_handler "%PROGID%"

rem ---------- 2 探测 Chromium 系浏览器（兜底用）----------
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" goto :hit1
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" goto :hit2
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" goto :hit3
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" goto :hit4
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" goto :hit5
goto :log_head

:hit1
set "CAND=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "CANDSRC=1/5 Edge (x86)"
goto :log_head

:hit2
set "CAND=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "CANDSRC=2/5 Edge"
goto :log_head

:hit3
set "CAND=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "CANDSRC=3/5 Chrome"
goto :log_head

:hit4
set "CAND=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
set "CANDSRC=4/5 Chrome (x86)"
goto :log_head

:hit5
set "CAND=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
set "CANDSRC=5/5 Chrome (local)"

rem ---------- 日志：第一行就是时间 + 实际会用的那个浏览器 ----------
:log_head
if "%IEHANDLER%"=="0" set "BROWSERLOG=默认程序  %PROGCMD%"
if "%IEHANDLER%"=="1" if defined CAND set "BROWSERLOG=%CAND%"
if "%IEHANDLER%"=="1" if not defined CAND set "BROWSERLOG=(没有可用的 Chromium，将退回默认程序)"
> "%LOG%" echo [launcher] %DATE% %TIME%  browser=%BROWSERLOG%
>>"%LOG%" echo [launcher] cwd     = %CD%
>>"%LOG%" echo [launcher] game    = %GAME%
>>"%LOG%" echo [launcher] diag    = %DIAG%
>>"%LOG%" echo [launcher] html 默认处理器 ProgId = %PROGID%
>>"%LOG%" echo [launcher] html 默认处理器命令    = %PROGCMD%
>>"%LOG%" echo [launcher] 默认处理器是 IE       = %IEHANDLER%
>>"%LOG%" echo [launcher] Chromium 首个命中       = %CANDSRC%
>>"%LOG%" echo [launcher] Chromium 候选           = %CAND%
if not exist "%GAME%" goto :err_nogame
if "%IEHANDLER%"=="0" goto :use_default_ok
if defined CAND goto :use_chromium
goto :use_default_fallback

rem ---------- 默认程序不是 IE：直接交给它 ----------
:use_default_ok
>>"%LOG%" echo [launcher] 方式 = 默认程序（已确认不是 IE）
if "%DIAG%"=="1" goto :diag_default_ok
>>"%LOG%" echo [launcher] exec = start "" "%GAME%"
start "" "%GAME%"
>>"%LOG%" echo [launcher] start returned, launcher exits
exit /b 0

:diag_default_ok
echo.
echo   [诊断模式] 只打印，不启动。
echo.
echo   工作目录  %CD%
echo   游戏文件  %GAME%
echo   默认程序  %PROGCMD%
echo   判定      不是 IE，直接交给默认程序
echo   将要执行  start "" "%GAME%"
echo.
>>"%LOG%" echo [launcher] --diag end, nothing launched
exit /b 0

rem ---------- 默认是 IE：用探测到的 Chromium ----------
:use_chromium
>>"%LOG%" echo [launcher] 方式 = 显式启动 Chromium 内核浏览器
>>"%LOG%" echo [launcher] 原因 = 默认处理器是 IE，会让游戏白屏
if "%DIAG%"=="1" goto :diag_chromium
>>"%LOG%" echo [launcher] exec = start "" "%CAND%" "%GAME%"
start "" "%CAND%" "%GAME%"
>>"%LOG%" echo [launcher] start returned, launcher exits
exit /b 0

:diag_chromium
echo.
echo   [诊断模式] 只打印，不启动。
echo.
echo   工作目录  %CD%
echo   游戏文件  %GAME%
echo   默认程序  %PROGCMD%
echo   判定      默认是 IE，改用 Chromium
echo   浏览器    %CAND%
echo   命中顺序  %CANDSRC%
echo   将要执行  start "" "%CAND%" "%GAME%"
echo.
>>"%LOG%" echo [launcher] --diag end, nothing launched
exit /b 0

rem ---------- 既没默认也不是 IE，又没 Chromium ----------
:use_default_fallback
>>"%LOG%" echo [launcher] 方式 = 系统默认程序（没找到 Edge / Chrome）
>>"%LOG%" echo [launcher] 风险 = 默认程序若是 IE，游戏会白屏
if "%DIAG%"=="1" goto :diag_default_fallback
echo.
echo   未找到 Edge / Chrome，已交给默认浏览器
echo   （默认程序若是 IE，游戏会白屏；装 Edge 或 Chrome 后重新双击本文件）
echo.
start "" "%GAME%"
>>"%LOG%" echo [launcher] fallback start returned
exit /b 0

:diag_default_fallback
echo.
echo   [诊断模式] 只打印，不启动。
echo.
echo   没找到 Edge / Chrome，正式运行时会退回系统默认程序。
echo   将要执行  start "" "%GAME%"
echo.
>>"%LOG%" echo [launcher] --diag end, fallback not launched
exit /b 0

rem ---------- 找不到游戏本体 ----------
:err_nogame
>>"%LOG%" echo [launcher] ERR index.html not found
echo.
echo   [错误] 找不到 index.html
echo.
echo   期望位置：
echo     %GAME%
echo.
echo   请确认 启动游戏.bat 和 index.html 在同一个文件夹里。
echo   如果是从压缩包解压的，要整个文件夹一起解，不能只拖出这一个 bat。
echo.
echo   日志：%LOG%
echo.
pause
exit /b 1

rem ============================================================
rem  子过程：查某个 ProgId 的打开命令，判断是不是 IE
rem    进入时 IEHANDLER=1（保守：查不清就按 IE 处理）
rem    不是 IE 时置 IEHANDLER=0
rem ============================================================
:probe_handler
set "PROGCMD="
call :try_key "HKCU\Software\Classes\%~1\shell\open\command"
if not defined PROGCMD call :try_key "HKLM\SOFTWARE\Classes\%~1\shell\open\command"
if not defined PROGCMD goto :eof
rem 直接用注册表原文判 IE，绕开 echo 引号与特殊符号的坑
reg query "HKCU\Software\Classes\%~1\shell\open\command" /ve 2>nul | findstr /i "iexplore.exe" >nul 2>&1
if not errorlevel 1 goto :eof
reg query "HKLM\SOFTWARE\Classes\%~1\shell\open\command" /ve 2>nul | findstr /i "iexplore.exe" >nul 2>&1
if not errorlevel 1 goto :eof
set "IEHANDLER=0"
goto :eof

:try_key
set "RAW="
for /f "usebackq delims=" %%L in (`reg query %1 /ve 2^>nul ^| findstr /i "REG_SZ"`) do set "RAW=%%L"
if not defined RAW goto :eof
rem 砍掉 (默认) / REG_SZ 这些列，只留真正的命令行
set "RAW=!RAW:*REG_SZ=!"
:trim
if not "!RAW:~0,1!"==" " goto :trim_done
set "RAW=!RAW:~1!"
goto :trim
:trim_done
set "PROGCMD=!RAW!"
goto :eof
