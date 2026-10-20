# Serve the built frontend for internal network access using config.json.

$configPath = Join-Path $PSScriptRoot "config.json"
if (-not (Test-Path $configPath)) {
    throw "Configuration file not found: $configPath"
}

$config = Get-Content -Path $configPath -Raw | ConvertFrom-Json
$frontendPath = Join-Path $PSScriptRoot "frontend"
$distPath = Join-Path $frontendPath "dist"
$hostAddress = $config.host
$port = [int]$config.frontend_port

if (-not $hostAddress -or $port -lt 1 -or $port -gt 65535) {
    throw "config.json must contain a valid host and frontend_port."
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
Set-Location $distPath
python -m http.server $port --bind 0.0.0.0
