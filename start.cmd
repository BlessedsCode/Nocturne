@echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if exist "node_modules\electron\dist\electron.exe" (
  start "Nocturne" "node_modules\electron\dist\electron.exe" .
) else (
  echo Dependencies are missing. Install Node.js and run npm install first.
  pause
)
