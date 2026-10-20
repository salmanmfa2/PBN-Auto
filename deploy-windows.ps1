# Placeholder deployment helper for Windows internal hosting
# Edit the values below before use.

$backendPath = "D:\Laboratorium\Project PBNCleaner\backend"
$frontendPath = "D:\Laboratorium\Project PBNCleaner\frontend"

$config = Get-Content -Path "$PSScriptRoot\config.json" -Raw | ConvertFrom-Json

$env:APP_HOST = $config.host
$env:APP_PORT = $config.backend_port
$env:CORS_ORIGINS = ($config.cors_origins -join ",")

Set-Location $backendPath
python .\run_server.py
