@echo off
rem ============================================================
rem  Double Blade Zongmu - launcher
rem  Opens index.html in an app-style browser window.
rem  Order: Chrome app mode -> Edge app mode -> default browser.
rem  No server, no install, works offline.
rem ============================================================
setlocal
set "GAME=%~dp0index.html"
if not exist "%GAME%" (
  echo [ERR] index.html not found next to this script.
  pause
  exit /b 1
)
set "URL=file:///%GAME:\=/%"
rem Window icon: point at the favicon so the taskbar entry is not a generic page.
set "ICON=%~dp0assets\icon\favicon.ico"
set "ICONARG="
if exist "%ICON%" set "ICONARG=--icon=%ICON%"

rem ---- 1) Chrome ----
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "" "%CHROME%" --app="%URL%" --window-size=1600,900 %ICONARG%
  exit /b 0
)

rem ---- 2) Edge ----
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --app="%URL%" --window-size=1600,900
  exit /b 0
)

rem ---- 3) whatever the user has ----
start "" "%GAME%"
exit /b 0