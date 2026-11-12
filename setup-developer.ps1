$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$envPath = Join-Path $backend ".env"
$envExamplePath = Join-Path $backend ".env.example"

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function Install-WithWinget([string]$packageId) {
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw "winget is unavailable. Install Python 3.12 and Node.js 22+ manually, then rerun setup."
    }

    & $winget.Source install --id $packageId --exact --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "winget could not install $packageId."
    }
    Refresh-ProcessPath
}

function Set-EnvValue([string[]]$lines, [string]$name, [string]$value) {
    $pattern = "^$([Regex]::Escape($name))=.*$"
    $replacement = "$name=$value"
    $found = $false
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match $pattern) {
            $lines[$index] = $replacement
            $found = $true
        }
    }
    if (-not $found) {
        $lines += $replacement
    }
    return ,$lines
}

function Invoke-MySql([string]$mysqlPath, [string]$username, [int]$port, [string]$sql) {
    $output = & $mysqlPath --protocol=tcp --host=127.0.0.1 "--port=$port" "--user=$username" --batch --skip-column-names "--execute=$sql" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "MySQL command failed: $output"
    }
    return $output
}

try {
    Write-Host "Checking Python 3.12..."
    $pythonLauncher = Get-Command py.exe -ErrorAction SilentlyContinue
    if (-not $pythonLauncher) {
        Install-WithWinget "Python.Python.3.12"
        $pythonLauncher = Get-Command py.exe -ErrorAction SilentlyContinue
    }
    if (-not $pythonLauncher) {
        throw "Python Launcher was not found after installation. Restart Windows, then rerun setup."
    }
    & $pythonLauncher.Source -3.12 --version
    if ($LASTEXITCODE -ne 0) {
        Install-WithWinget "Python.Python.3.12"
        $pythonLauncher = Get-Command py.exe -ErrorAction SilentlyContinue
        & $pythonLauncher.Source -3.12 --version
        if ($LASTEXITCODE -ne 0) {
            throw "Python 3.12 is not available. Restart Windows, then rerun setup."
        }
    }

    Write-Host "Checking Node.js 22.12 or newer..."
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    $nodeIsSupported = $false
    if ($node) {
        & $node.Source -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>22||(major===22&&minor>=12)?0:1)"
        $nodeIsSupported = $LASTEXITCODE -eq 0
    }
    if (-not $nodeIsSupported) {
        Install-WithWinget "OpenJS.NodeJS.LTS"
        $node = Get-Command node.exe -ErrorAction SilentlyContinue
        if (-not $node) {
            throw "Node.js was installed but is not on PATH. Restart Windows, then rerun setup."
        }
        & $node.Source -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>22||(major===22&&minor>=12)?0:1)"
        if ($LASTEXITCODE -ne 0) {
            throw "Node.js 22.12 or newer is required. Install a supported Node.js LTS version and rerun setup."
        }
    }

    Write-Host "Preparing backend dependencies..."
    $venvPython = Join-Path $backend "venv\Scripts\python.exe"
    if (-not (Test-Path $venvPython)) {
        & $pythonLauncher.Source -3.12 -m venv (Join-Path $backend "venv")
        if ($LASTEXITCODE -ne 0) {
            throw "Could not create the backend Python virtual environment."
        }
    }
    & $venvPython -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) {
        throw "Could not upgrade pip."
    }
    & $venvPython -m pip install -r (Join-Path $backend "requirements.txt")
    if ($LASTEXITCODE -ne 0) {
        throw "Could not install backend requirements."
    }

    Write-Host "Preparing frontend dependencies and checking the production build..."
    Push-Location $frontend
    try {
        $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
        if (-not $npm) {
            $npm = Get-Command npm -ErrorAction SilentlyContinue
        }
        if (-not $npm) {
            throw "npm was not found after Node.js setup."
        }
        & $npm.Source ci
        if ($LASTEXITCODE -ne 0) {
            throw "Could not install frontend dependencies with npm ci."
        }
        & $npm.Source run build
        if ($LASTEXITCODE -ne 0) {
            throw "The frontend production build failed."
        }
    }
    finally {
        Pop-Location
    }

    $mysqlPath = Join-Path $env:SystemDrive "xampp\mysql\bin\mysql.exe"
    if (-not (Test-Path $mysqlPath)) {
        $mysqlPath = Read-Host "Enter the full path to XAMPP mysql.exe"
        $mysqlPath = $mysqlPath.Trim('"')
    }
    if (-not (Test-Path $mysqlPath)) {
        throw "MySQL client was not found. Install XAMPP or provide its mysql.exe path."
    }
    $mysqlAdminPath = Join-Path (Split-Path $mysqlPath) "mysqladmin.exe"
    if (-not (Test-Path $mysqlAdminPath)) {
        throw "mysqladmin.exe was not found beside mysql.exe."
    }

    $portText = Read-Host "Local XAMPP MySQL port [3306]"
    if ([string]::IsNullOrWhiteSpace($portText)) {
        $portText = "3306"
    }
    $mysqlPort = 0
    if (-not [int]::TryParse($portText, [ref]$mysqlPort) -or $mysqlPort -lt 1 -or $mysqlPort -gt 65535) {
        throw "Enter a valid MySQL port from 1 to 65535."
    }

    $mysqlUser = Read-Host "Local MySQL username [root]"
    if ([string]::IsNullOrWhiteSpace($mysqlUser)) {
        $mysqlUser = "root"
    }
    if ($mysqlUser -notmatch "^[A-Za-z0-9_]+$") {
        throw "For setup, use a MySQL username containing only letters, numbers, and underscores."
    }

    $securePassword = Read-Host "Local MySQL password (blank if none)" -AsSecureString
    $passwordPointer = [IntPtr]::Zero
    $mysqlPassword = ""
    try {
        $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        $mysqlPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    }
    finally {
        if ($passwordPointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
        }
        $securePassword.Dispose()
    }
    $env:MYSQL_PWD = $mysqlPassword

    $ping = & $mysqlAdminPath --protocol=tcp --host=127.0.0.1 "--port=$mysqlPort" ping 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Local MySQL is not responding. Start MySQL in XAMPP and rerun setup. $ping"
    }

    $dumpPath = (Read-Host "Enter the full path to the provided pbncleaner SQL dump").Trim('"')
    if (-not (Test-Path -LiteralPath $dumpPath -PathType Leaf)) {
        throw "The SQL dump file was not found."
    }
    $dump = Get-Item -LiteralPath $dumpPath
    if ($dump.Extension -ne ".sql") {
        throw "The database dump must be a .sql file."
    }
    $dumpPath = $dump.FullName

    Write-Warning "Importing a full database dump can replace tables and data in local pbncleaner."
    $confirmation = Read-Host "Type IMPORT to continue"
    if ($confirmation -cne "IMPORT") {
        throw "Database import was cancelled."
    }

    if (Test-Path $envPath) {
        $envConfirmation = Read-Host "backend\.env exists. Update only its DB/storage settings and keep other settings? [y/N]"
        if ($envConfirmation -notmatch "^(?i)y(es)?$") {
            throw "Setup cancelled to preserve the existing backend\.env."
        }
        $envLines = [System.IO.File]::ReadAllLines($envPath)
    }
    else {
        if (-not (Test-Path $envExamplePath)) {
            throw "backend\.env.example is missing."
        }
        $envLines = [System.IO.File]::ReadAllLines($envExamplePath)
    }

    Write-Host "Creating local pbncleaner database if needed..."
    [void](Invoke-MySql $mysqlPath $mysqlUser $mysqlPort "CREATE DATABASE IF NOT EXISTS pbncleaner CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")

    Write-Host "Importing database dump. This can take several minutes..."
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $mysqlPath
    $startInfo.Arguments = "--protocol=tcp --host=127.0.0.1 --port=$mysqlPort --user=$mysqlUser --default-character-set=utf8mb4 pbncleaner"
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.EnvironmentVariables["MYSQL_PWD"] = $mysqlPassword
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw "Could not start the MySQL import process."
    }
    $errorOutputTask = $process.StandardError.ReadToEndAsync()
    $dumpStream = [System.IO.File]::OpenRead($dumpPath)
    try {
        $dumpStream.CopyTo($process.StandardInput.BaseStream)
    }
    finally {
        $dumpStream.Dispose()
        $process.StandardInput.Close()
    }
    $process.WaitForExit()
    $mysqlError = $errorOutputTask.Result
    if ($process.ExitCode -ne 0) {
        throw "MySQL import failed with exit code $($process.ExitCode). $mysqlError"
    }
    $process.Dispose()

    Write-Host "Verifying employee and reference tables..."
    $requiredTablesQuery = @"
SELECT COUNT(*)
FROM information_schema.tables
WHERE table_schema = 'pbncleaner'
  AND table_name IN (
    'fetch_pbnopen',
    'dt_employee',
    'ref_unit_kerja',
    'ref_pangkat',
    'ref_eselon',
    'ref_pendidikan_terakhir',
    'ref_rumpun_pendidikan'
  );
"@ -replace "\s+", " "
    $tableCount = [int](Invoke-MySql $mysqlPath $mysqlUser $mysqlPort $requiredTablesQuery | Select-Object -Last 1)
    if ($tableCount -ne 7) {
        throw "The dump is missing required employee/reference tables (found $tableCount of 7). Use the current schema-and-reference-data dump."
    }

    $locationColumnCount = [int](Invoke-MySql $mysqlPath $mysqlUser $mysqlPort "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='pbncleaner' AND table_name='ref_unit_kerja' AND column_name IN ('city','prov');" | Select-Object -Last 1)
    if ($locationColumnCount -ne 2) {
        throw "ref_unit_kerja in the dump must include the current city and prov columns."
    }

    foreach ($referenceTable in @(
        "ref_eselon",
        "ref_pangkat",
        "ref_pendidikan_terakhir",
        "ref_rumpun_pendidikan",
        "ref_unit_kerja"
    )) {
        $referenceCount = [int](Invoke-MySql $mysqlPath $mysqlUser $mysqlPort "SELECT COUNT(*) FROM pbncleaner.$referenceTable;" | Select-Object -Last 1)
        if ($referenceCount -lt 1) {
            throw "$referenceTable has no reference rows. Use the schema-and-reference-data dump."
        }
    }

    $envLines = Set-EnvValue $envLines "CLEANING_DB_URL" ""
    $envLines = Set-EnvValue $envLines "MYSQL_HOST" "127.0.0.1"
    $envLines = Set-EnvValue $envLines "MYSQL_PORT" ([string]$mysqlPort)
    $envLines = Set-EnvValue $envLines "MYSQL_USER" $mysqlUser
    $envLines = Set-EnvValue $envLines "MYSQL_PASSWORD" $mysqlPassword
    $envLines = Set-EnvValue $envLines "MYSQL_DATABASE" "pbncleaner"
    $envLines = Set-EnvValue $envLines "DATASET_STORAGE_ROOT" "local-data"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($envPath, $envLines, $utf8NoBom)
    [void](New-Item -ItemType Directory -Force -Path (Join-Path $backend "local-data"))

    Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
    $mysqlPassword = $null

    Write-Host ""
    Write-Host "Setup is ready."
    Write-Host "Imported table schemas and reference rows into local pbncleaner."
    Write-Host "fetch_pbnopen and dt_employee are intentionally empty; upload and sync them from the Admin page."
    Write-Host "Backend credentials are stored in the Git-ignored backend\.env."
    Write-Host "Start the application with run-app.bat."
}
catch {
    Write-Error $_
    exit 1
}
finally {
    Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
}
