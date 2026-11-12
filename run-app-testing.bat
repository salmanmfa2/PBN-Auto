@echo off
setlocal
rem Isolated local development launcher for backend and frontend.

set "APP_ROOT=%~dp0"
for /f %%P in ('powershell -NoProfile -Command "$config = Get-Content -Raw (Join-Path $env:APP_ROOT 'config.json') | ConvertFrom-Json; $port = [int]$config.backend_port; while (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { $port++ }; $port"') do set "BACKEND_PORT=%%P"
if not defined BACKEND_PORT (
    echo Could not select a free backend port from config.json.
    pause
    exit /b 1
)
for /f %%P in ('powershell -NoProfile -Command "$port = 5174; while (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { $port++ }; $port"') do set "FRONTEND_PORT=%%P"
if not defined FRONTEND_PORT (
    echo Could not select a free development frontend port.
    pause
    exit /b 1
)

pushd "%~dp0backend"
if not exist ".\venv\Scripts\python.exe" (
    echo Creating virtual environment...
    python -m venv venv
)
call ".\venv\Scripts\python.exe" -m pip install --upgrade pip
call ".\venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
    echo Backend dependency installation failed.
    popd
    pause
    exit /b 1
)
set "APP_HOST=127.0.0.1"
set "APP_PORT=%BACKEND_PORT%"
set "CORS_ORIGINS=http://localhost:%FRONTEND_PORT%,http://127.0.0.1:%FRONTEND_PORT%"
set "VITE_API_URL=http://localhost:%BACKEND_PORT%"
start "Backend" cmd /k ".\venv\Scripts\python.exe .\run_server.py"
popd

pushd "%~dp0frontend"
call npm install
if errorlevel 1 (
    echo Frontend dependency installation failed.
    popd
    pause
    exit /b 1
)
set "VITE_API_URL=http://localhost:%BACKEND_PORT%"
start "Frontend" cmd /k "npm run dev -- --host 127.0.0.1 --port %FRONTEND_PORT% --strictPort"
popd

echo Started isolated local development servers.
echo Frontend: http://localhost:%FRONTEND_PORT%
echo Backend API: http://localhost:%BACKEND_PORT%
echo WARNING: Development uses the database and dataset storage configured for the live app.
echo Changes made here are shared with the live app.
pause
