@echo off
chcp 936 >nul 2>&1
setlocal EnableExtensions
title 素材总览 · 双刃战士 纵目

rem ============================================================
rem  双击本文件 = 起一个本地静态服务 + 打开素材总览页。
rem
rem  为什么不用双击 html：
rem    canvas 读本地图会被标记成「跨源污染」，getImageData 直接抛
rem    SecurityError；有些浏览器还会限制本地目录的并发请求。
rem    走 http://127.0.0.1:8801/ 就没事。游戏本体 index.html 仍然
rem    坚持 file:// 直开，这里是唯一例外。
rem
rem  这个文件必须存成 ANSI/GBK 编码，且第二行有 chcp 936，
rem  否则 cmd 会按 936 解码 UTF-8，中文全变乱码。
rem ============================================================

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 goto :err_node

if not exist "%~dp0serve-showcase.mjs" goto :err_file

node "%~dp0serve-showcase.mjs" %*
exit /b %errorlevel%

:err_node
echo.
echo   [错误] 没找到 node。
echo.
echo   本机需要 Node.js 才能起这个本地服务。
echo   装好后重新双击本文件。
echo.
pause
exit /b 1

:err_file
echo.
echo   [错误] 找不到 serve-showcase.mjs
echo.
echo   它必须和本文件放在同一个文件夹里。
echo.
pause
exit /b 1
