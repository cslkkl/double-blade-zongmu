@echo off
chcp 936 >nul 2>&1
setlocal EnableExtensions EnableDelayedExpansion
title 素材总览 · 双刃战士 纵目

rem ============================================================
rem  双击本文件 = 起本地静态服务 + 打开素材总览页。
rem
rem  只有一个窗口：node 在本窗口前台跑，输出和 Ctrl+C 都在这儿，
rem  不另开「服务窗口」。浏览器由 node 自己打开，bat 只负责
rem  在「默认处理器是 IE」的时候告诉它该用哪个 Chromium。
rem
rem  为什么素材页要走 http 而不像游戏那样 file:// 直开：
rem    展示页要扫 alpha 通道算内容框（getImageData），
rem    file:// 下 canvas 被跨源图片标记污染，一读就抛 SecurityError。
rem    走 http://127.0.0.1:8801/ 就没事。全仓只此一例。
rem
rem  浏览器口径（和 启动游戏.bat 一致）：
rem    默认处理器不是 IE  -> 就用默认浏览器（node 走 start "" <url>）
rem    默认处理器是 IE    -> 传 --browser <Edge/Chrome 绝对路径> 给 node
rem    查不到/解析不出     -> 按 IE 处理，同上，宁可多探一次也不白屏
rem  探测顺序：Edge(x86) -> Edge -> Chrome -> Chrome(x86) -> Chrome(local)
rem
rem  端口：默认 8801，和 serve-showcase.mjs 的默认值一致。
rem
rem  编码约束：本文件必须存成 ANSI/GBK，第二行钉死 chcp 936。
rem    存成 UTF-8 会被 cmd 按 936 误解码，中文全乱。
rem
rem  用法：
rem    启动展示页.bat                 起服务 + 开浏览器（8801）
rem    启动展示页.bat --port 8802     换端口
rem    启动展示页.bat --no-open       只起服务，不开浏览器
rem ============================================================

cd /d "%~dp0"

set "PORT=8801"
set "NOOPEN=0"

rem ---------- 解析参数（--port 与 --no-open 不限前后顺序）----------
:parse
if "%~1"=="" goto :parsed
if /i "%~1"=="--port" goto :take_port
if /i "%~1"=="--no-open" set "NOOPEN=1"
shift
goto :parse

:take_port
if not "%~2"=="" set "PORT=%~2"
shift
shift
goto :parse

:parsed
set "URL=http://127.0.0.1:%PORT%/showcase.html"
set "LOG=%~dp0serve-showcase.log"

set "CAND="
set "CANDSRC="
set "PROGID="
set "PROGCMD="
set "IEHANDLER=1"

rem ---------- 1 看 http 的默认处理器是不是 IE ----------
for /f "tokens=3" %%a in ('reg query "HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice" /v ProgId 2^>nul ^| findstr /i "ProgId"') do set "PROGID=%%a"
if defined PROGID call :probe_handler "%PROGID%"

rem ---------- 2 兜底候选：Chromium 系浏览器，命中即停 ----------
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

rem ---------- 日志 ----------
:log_head
if "%IEHANDLER%"=="0" set "BROWSERLOG=默认浏览器  %PROGCMD%"
if "%IEHANDLER%"=="1" if defined CAND set "BROWSERLOG=指定 Chromium  %CAND%"
if "%IEHANDLER%"=="1" if not defined CAND set "BROWSERLOG=(没有可用浏览器，交给默认程序)"
> "%LOG%" echo [showcase] %DATE% %TIME%  browser=%BROWSERLOG%
>>"%LOG%" echo [showcase] cwd    = %CD%
>>"%LOG%" echo [showcase] port   = %PORT%
>>"%LOG%" echo [showcase] url    = %URL%
>>"%LOG%" echo [showcase] noopen = %NOOPEN%
>>"%LOG%" echo [showcase] http 默认处理器 ProgId = %PROGID%
>>"%LOG%" echo [showcase] http 默认处理器命令    = %PROGCMD%
>>"%LOG%" echo [showcase] 默认处理器是 IE        = %IEHANDLER%
>>"%LOG%" echo [showcase] Chromium 首个命中        = %CANDSRC%

rem ---------- 环境 ----------
where node >nul 2>&1
if errorlevel 1 goto :err_node
if not exist "%~dp0serve-showcase.mjs" goto :err_file

rem ---------- 端口已有服务在跑：不再起第二份，只开页面 ----------
netstat -an | findstr /c:"127.0.0.1:%PORT%" | findstr /i "LISTENING" >nul 2>&1
if not errorlevel 1 goto :already_up

rem ---------- 前台跑服务（就是这一个窗口），浏览器由 node 打开 ----------
if "%NOOPEN%"=="1" goto :run_noopen
if "%IEHANDLER%"=="0" goto :run_default
if defined CAND goto :run_chromium
goto :run_default

:run_default
>>"%LOG%" echo [showcase] 执行 = node serve-showcase.mjs --port %PORT%
node serve-showcase.mjs --port %PORT%
exit /b %errorlevel%

:run_chromium
>>"%LOG%" echo [showcase] 执行 = node serve-showcase.mjs --port %PORT% --browser "%CAND%"
node serve-showcase.mjs --port %PORT% --browser "%CAND%"
exit /b %errorlevel%

:run_noopen
>>"%LOG%" echo [showcase] 执行 = node serve-showcase.mjs --port %PORT% --no-open
node serve-showcase.mjs --port %PORT% --no-open
exit /b %errorlevel%

rem ---------- 端口已在监听：只开页面，窗口随即关闭 ----------
:already_up
>>"%LOG%" echo [showcase] 复用 = 端口 %PORT% 上已有服务，不再起第二份
echo.
echo   端口 %PORT% 上已有素材总览服务，直接打开页面。
echo   若要停掉旧服务，关掉它那个窗口即可。
echo.
if "%NOOPEN%"=="1" goto :already_noopen
if "%IEHANDLER%"=="0" goto :already_default
if defined CAND goto :already_chromium
start "" "%URL%"
goto :already_done

:already_default
start "" "%URL%"
goto :already_done

:already_chromium
start "" "%CAND%" "%URL%"
goto :already_done

:already_noopen
echo   按要求只起服务，不开浏览器。

:already_done
>>"%LOG%" echo [showcase] done（复用已有服务）
exit /b 0

rem ---------- 失败分支 ----------
:err_node
>>"%LOG%" echo [showcase] ERR node not found
echo.
echo   [错误] 没找到 node。
echo.
echo   本机需要 Node.js 才能起这个本地服务。
echo   装好后重新双击本文件。
echo.
echo   日志：%LOG%
echo.
pause
exit /b 1

:err_file
>>"%LOG%" echo [showcase] ERR serve-showcase.mjs not found
echo.
echo   [错误] 找不到 serve-showcase.mjs
echo.
echo   它必须和本文件放在同一个文件夹里。
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
