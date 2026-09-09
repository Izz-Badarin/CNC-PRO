@echo off
setlocal EnableDelayedExpansion
rem ============================================================
rem  CNC Cabinet Designer Pro - one-click OFFLINE launcher v2
rem  Builds the app once (if needed) and opens it in your
rem  browser. Everything runs locally - no internet required.
rem  Plane mode ready: single-file dist/index.html works file://
rem ============================================================
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed. Get it from https://nodejs.org
  echo After installing, double-click this file again.
  pause
  exit /b 1
)

set NEED_BUILD=0
if not exist "dist\index.html" set NEED_BUILD=1

rem Check if any src file newer than dist/index.html
if %NEED_BUILD%==0 (
  for /f "delims=" %%F in ('powershell -NoProfile -Command "Get-ChildItem -Recurse -File src,public,index.html,vite.config.ts,package.json | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty LastWriteTime"') do set SRC_NEWEST=%%F
  for /f "delims=" %%F in ('powershell -NoProfile -Command "(Get-Item dist\index.html).LastWriteTime"') do set DST_TIME=%%F
  rem Simple string compare — if src newer, rebuild; fallback to date check via powershell
  powershell -NoProfile -Command "$src=Get-ChildItem -Recurse -File src,public,index.html,vite.config.ts,package.json | Sort-Object LastWriteTime -Descending | Select-Object -First 1; $dst=Get-Item dist\index.html; if ($src.LastWriteTime -gt $dst.LastWriteTime) { exit 1 } else { exit 0 }"
  if errorlevel 1 set NEED_BUILD=1
)

if %NEED_BUILD%==1 (
  echo [BUILD] Building offline app — please wait (first time needs internet for npm install, then offline forever)...
  if not exist "node_modules" (
    call npm install --no-audit --no-fund
    if errorlevel 1 goto :fail
  )
  call npm run build
  if errorlevel 1 goto :fail
  echo [BUILD] Done — dist\index.html is ready (single file, ~1.2MB, works file://)
) else (
  echo [OK] Offline build is up to date — dist\index.html
)

echo [OPEN] Launching offline app...
start "" "%~dp0dist\index.html"
echo.
echo The app is now open in your default browser and works fully offline.
echo Tips:
echo  - Copy dist\ folder to USB / shop PC — double-click index.html, no server needed
echo  - Plane mode: everything is local — projects autosave to browser, use Save .json for backup
echo  - If storage full, app warns and trims old backups automatically
echo.
timeout /t 3 >nul
exit /b 0

:fail
echo.
echo [ERROR] Build failed. Make sure Node.js is installed and try again.
echo If offline, you can still open existing dist\index.html directly.
if exist "dist\index.html" (
  echo [FALLBACK] Opening existing build...
  start "" "%~dp0dist\index.html"
)
pause
exit /b 1
