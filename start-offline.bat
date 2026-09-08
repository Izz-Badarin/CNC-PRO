@echo off
setlocal
rem ============================================================
rem  CNC Cabinet Designer Pro - one-click OFFLINE launcher
rem  Builds the app once (if needed) and opens it in your
rem  browser. Everything runs locally - no internet required.
rem ============================================================
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed. Get it from https://nodejs.org
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo [BUILD] Building offline app for the first time - please wait...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :fail
  call npm run build
  if errorlevel 1 goto :fail
) else (
  rem Rebuild if source is newer than the last build
  for /f "delims=" %%A in ("index.html") do set SRC_T=%%~tA
  for /f "delims=" %%A in ("dist\index.html") do set DST_T=%%~tA
  if "%SRC_T%" GTR "%DST_T%" (
    echo [BUILD] Sources changed - rebuilding...
    call npm run build
    if errorlevel 1 goto :fail
  )
)

echo [OPEN] Launching offline app...
start "" "%~dp0dist\index.html"
echo.
echo The app is now open in your default browser and works fully offline.
exit /b 0

:fail
echo.
echo [ERROR] Build failed. Make sure Node.js is installed and try again.
pause
exit /b 1