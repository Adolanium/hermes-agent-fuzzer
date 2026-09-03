@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title Hermes Agent Desktop Fuzzer
echo.
echo Hermes Agent Desktop Fuzzer
echo Working directory: %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22 or newer is required and was not found on PATH.
  echo Install it, then double-click this file again.
  goto :end
)

if not exist "node_modules\" (
  echo Installing fuzzer dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    goto :end
  )
  echo.
)

set "DESKTOP_DIST=_targets\hermes-agent\apps\desktop\dist\electron-main.mjs"
if not exist "%DESKTOP_DIST%" (
  echo Desktop build is missing. Fetching latest main and building.
  echo This can take a long time the first time.
  echo.
  call npx tsx src/cli.ts prepare
  if errorlevel 1 (
    echo prepare failed.
    goto :end
  )
  echo.
)

rem Usage:
rem   fuzz.bat              one episode, 50 actions
rem   fuzz.bat 8h           campaign for 8 hours
rem   fuzz.bat 30m ui-only  campaign, ui-only profile
set "DURATION=%~1"
set "PROFILE=%~2"
if "%PROFILE%"=="" (
  if "%DURATION%"=="" (
    set "PROFILE=mock-backend"
  ) else (
    set "PROFILE=all"
  )
)

if "%DURATION%"=="" (
  echo Starting one episode with profile %PROFILE%...
  echo Close this window to stop.
  echo.
  call npx tsx src/cli.ts run --profile %PROFILE% --skip-fetch --skip-build
) else (
  echo Starting a %DURATION% campaign with profile %PROFILE%...
  echo Close this window to stop.
  echo.
  call npx tsx src/cli.ts run --duration %DURATION% --profile %PROFILE% --skip-fetch --skip-build
)

echo.
call npx tsx src/cli.ts inbox

:end
echo.
pause
endlocal
