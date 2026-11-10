@echo off
rem Network deployment launcher for backend and frontend.
rem Starts the backend and serves the built frontend using config.json.

if not exist "%~dp0config.json" (
	echo config.json was not found beside this launcher.
	pause
	exit /b 1
)

for /f "usebackq tokens=1-4 delims=|" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0resolve-network-config.ps1"`) do (
	set "APP_PUBLIC_HOST=%%A"
	set "BACKEND_PORT=%%B"
	set "FRONTEND_PORT=%%C"
	set "CORS_ORIGINS=%%D"
)
if not defined APP_PUBLIC_HOST (
	echo Could not resolve the network host and ports. Check config.json and the active network adapter.
	pause
	exit /b 1
)
set "APP_HOST=0.0.0.0"
set "APP_PORT=%BACKEND_PORT%"
set "VITE_API_URL=http://%APP_PUBLIC_HOST%:%BACKEND_PORT%"

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
for /f "usebackq delims=" %%U in (`powershell -NoProfile -Command "'http://{0}:{1}' -f '%APP_PUBLIC_HOST%', '%FRONTEND_PORT%'"`) do set "APP_URL=%%U"
if defined APP_URL echo Open %APP_URL% from other PCs.
pause
