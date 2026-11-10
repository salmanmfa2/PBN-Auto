# Backend deployment helper for Windows internal hosting.

$backendPath = Join-Path $PSScriptRoot "backend"

$resolvedConfig = & (Join-Path $PSScriptRoot "resolve-network-config.ps1")
$networkSettings = [string]$resolvedConfig -split "\|", 4

if ($networkSettings.Count -lt 4) {
    throw "Could not resolve network settings from config.json."
}

$env:APP_HOST = "0.0.0.0"
$env:APP_PUBLIC_HOST = $networkSettings[0]
$env:APP_PORT = $networkSettings[1]
$env:CORS_ORIGINS = $networkSettings[3]

Set-Location $backendPath
python .\run_server.py
