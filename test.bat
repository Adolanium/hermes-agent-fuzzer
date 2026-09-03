@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title Hermes Fuzzer unit tests

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22 or newer is required and was not found on PATH.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing fuzzer dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

call npm test
echo.
pause
endlocal
