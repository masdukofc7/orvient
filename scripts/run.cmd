@echo off
REM Double-click or run from cmd/PowerShell. Refreshes PATH then runs win.ps1
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles%\Docker\Docker\resources\bin;%PATH%"
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0win.ps1" %*
