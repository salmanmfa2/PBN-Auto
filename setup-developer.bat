@echo off
setlocal
cd /d "%~dp0"

echo MPK Workspace one-time developer setup
echo This prepares Python/Node dependencies and imports a local MySQL dump.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-developer.ps1"
if errorlevel 1 (
    echo.
    echo Setup did not complete. Read the message above, resolve it, and run setup-developer.bat again.
    pause
    exit /b 1
)

echo.
echo Setup completed. You can now start the app with run-app.bat.
pause
