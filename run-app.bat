@echo off
rem Network deployment launcher for backend and frontend.
rem Starts the backend and serves the built frontend using config.json.

if not exist "%~dp0config.json" (
	echo config.json was not found beside this launcher.
	pause
	exit /b 1
)

for /f "usebackq tokens=1-3 delims=|" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-Content -Raw '%~dp0config.json' | ConvertFrom-Json; $p = [int]$c.backend_port; while (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) { $p++ }; '{0}|{1}|{2}' -f $c.host,$p,$c.frontend_port"`) do (
	set "CONFIG_HOST=%%A"
	set "BACKEND_PORT=%%B"
	set "FRONTEND_PORT=%%C"
)
if not defined CONFIG_HOST (
	echo Could not read host and ports from config.json.
	pause
	exit /b 1
)
set "APP_HOST=0.0.0.0"
set "APP_PORT=%BACKEND_PORT%"
set "VITE_API_URL=http://%CONFIG_HOST%:%BACKEND_PORT%"

pushd "%~dp0backend"
if not exist ".\venv\Scripts\python.exe" (
	echo Creating backend virtual environment...
	python -m venv venv
)
call ".\venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
	echo Backend dependency installation failed.
	popd
	pause
	exit /b 1
)
start "Backend" cmd /k ".\venv\Scripts\python.exe .\run_server.py"
popd

pushd "%~dp0frontend"
call npm run build
if errorlevel 1 (
	echo Frontend build failed. The network server was not started.
	popd
	pause
	exit /b 1
)
popd

pushd "%~dp0"
start "Frontend Server" cmd /k "powershell -ExecutionPolicy Bypass -File .\serve-frontend.ps1"
popd

echo Backend launch started.
echo Frontend build and server launch started.
for /f "usebackq delims=" %%U in (`powershell -NoProfile -Command "$config = Get-Content -Raw '%~dp0config.json' | ConvertFrom-Json; 'http://{0}:{1}' -f $config.host, $config.frontend_port"`) do set "APP_URL=%%U"
if defined APP_URL echo Open %APP_URL% from other PCs.
pause
