@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 exit /b 1
)
echo Open the Local URL printed below in your browser.
call npm.cmd run dev -- --port 5173
pause
