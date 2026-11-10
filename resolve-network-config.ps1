$configPath = Join-Path $PSScriptRoot "config.json"
if (-not (Test-Path $configPath)) {
    throw "Configuration file not found: $configPath"
}

$config = Get-Content -Path $configPath -Raw | ConvertFrom-Json
$hostAddress = [string]$config.host

if ([string]::IsNullOrWhiteSpace($hostAddress) -or $hostAddress -eq "auto") {
    $physicalAdapters = @(
        Get-NetAdapter -Physical -ErrorAction SilentlyContinue |
            Where-Object { $_.Status -eq "Up" }
    )
    $adapterOrder = @(
        $physicalAdapters |
            Where-Object { $_.Name -match "(?i)wi-?fi|wlan|wireless" }
    )
    $defaultRoutes = @(
        Get-NetRoute -AddressFamily IPv4 -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
            Sort-Object RouteMetric
    )

    foreach ($route in $defaultRoutes) {
        $adapter = $physicalAdapters |
            Where-Object { $_.ifIndex -eq $route.InterfaceIndex } |
            Select-Object -First 1
        if ($adapter -and -not ($adapterOrder | Where-Object { $_.ifIndex -eq $adapter.ifIndex })) {
            $adapterOrder += $adapter
        }
    }

    foreach ($adapter in $physicalAdapters) {
        if (-not ($adapterOrder | Where-Object { $_.ifIndex -eq $adapter.ifIndex })) {
            $adapterOrder += $adapter
        }
    }

    $hostAddress = $null
    foreach ($adapter in $adapterOrder) {
        $address = Get-NetIPAddress `
            -InterfaceIndex $adapter.ifIndex `
            -AddressFamily IPv4 `
            -ErrorAction SilentlyContinue |
            Where-Object {
                $_.AddressState -eq "Preferred" -and
                $_.IPAddress -notmatch "^(127\.|169\.254\.|0\.)"
            } |
            Select-Object -First 1

        if ($address) {
            $hostAddress = $address.IPAddress
            break
        }
    }

    if (-not $hostAddress) {
        throw "Could not detect an active Wi-Fi/LAN IPv4 address. Connect to the network or set an explicit host in config.json."
    }
}

if ($hostAddress -eq "0.0.0.0" -or $hostAddress -eq "::") {
    throw "config.json host must be an address other devices can use, not a wildcard bind address."
}

$backendPort = [int]$config.backend_port
$frontendPort = [int]$config.frontend_port
if ($backendPort -lt 1 -or $backendPort -gt 65535 -or $frontendPort -lt 1 -or $frontendPort -gt 65535) {
    throw "config.json must contain valid backend_port and frontend_port values."
}

while (Get-NetTCPConnection -LocalPort $backendPort -State Listen -ErrorAction SilentlyContinue) {
    $backendPort++
    if ($backendPort -gt 65535) {
        throw "Could not find an available backend port."
    }
}

$origins = @()
if ($config.cors_origins) {
    $origins += @(
        $config.cors_origins |
            Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }
    )
}
$origins += "http://${hostAddress}:${frontendPort}"
$origins = @($origins | Select-Object -Unique)

Write-Output ("{0}|{1}|{2}|{3}" -f $hostAddress, $backendPort, $frontendPort, ($origins -join ","))
