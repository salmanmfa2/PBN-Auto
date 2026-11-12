# Serve the built frontend for internal network access using config.json.

$configPath = Join-Path $PSScriptRoot "config.json"
if (-not (Test-Path $configPath)) {
    throw "Configuration file not found: $configPath"
}

$config = Get-Content -Path $configPath -Raw | ConvertFrom-Json
$frontendPath = Join-Path $PSScriptRoot "frontend"
$distPath = Join-Path $frontendPath "dist"
$hostAddress = $env:APP_PUBLIC_HOST
$port = [int]$config.frontend_port

if (-not $hostAddress) {
    $resolvedConfig = & (Join-Path $PSScriptRoot "resolve-network-config.ps1")
    $hostAddress = ([string]$resolvedConfig -split "\|", 4)[0]
}

if (-not $hostAddress -or $port -lt 1 -or $port -gt 65535) {
    throw "Could not resolve a valid network host and frontend_port."
}

if (-not (Test-Path $distPath)) {
    Write-Host "Frontend build not found. Running build first..."
    Push-Location $frontendPath
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "Frontend build failed."
        }
    }
    finally {
        Pop-Location
    }
}

Write-Host "Serving frontend from $distPath"
Write-Host "Open http://${hostAddress}:${port} from other PCs."
$serverScript = Join-Path $frontendPath "serve_spa.py"
$pythonExecutable = Join-Path $PSScriptRoot "backend\venv\Scripts\python.exe"
if (-not (Test-Path $pythonExecutable)) {
    $pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
    if (-not $pythonCommand) {
        throw "Python was not found. Run setup-developer.bat first."
    }
    $pythonExecutable = $pythonCommand.Source
}
& $pythonExecutable $serverScript --directory $distPath --port $port --bind 0.0.0.0
if ($LASTEXITCODE -ne 0) {
    throw "Frontend server stopped with exit code $LASTEXITCODE."
}
