param(
    [string]$InstallerPath,
    [int]$StartupTimeoutSeconds = 5
)

$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
    throw 'Windows installer smoke testing can only run on Windows.'
}

if (-not $InstallerPath) {
    $candidates = @(
        Get-ChildItem "$PSScriptRoot\..\src-tauri\target\release\bundle\nsis\*-setup.exe" -ErrorAction SilentlyContinue
        Get-ChildItem "$PSScriptRoot\..\src-tauri\target\*\release\bundle\nsis\*-setup.exe" -ErrorAction SilentlyContinue
    )
    $InstallerPath = $candidates |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}

if (-not $InstallerPath -or -not (Test-Path -LiteralPath $InstallerPath -PathType Leaf)) {
    throw 'No NSIS installer was found. Build a Windows installer or pass -InstallerPath.'
}

$InstallerPath = (Resolve-Path -LiteralPath $InstallerPath).Path
$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$installDir = Join-Path $tempRoot "jc-platform-installer-smoke-$([guid]::NewGuid().ToString('N'))"
$appProcess = $null
$uninstaller = Join-Path $installDir 'uninstall.exe'

try {
    Write-Host "Installing $InstallerPath"
    $install = Start-Process `
        -FilePath $InstallerPath `
        -ArgumentList @('/S', "/D=$installDir") `
        -Wait `
        -PassThru
    if ($install.ExitCode -ne 0) {
        throw "Installer exited with code $($install.ExitCode)."
    }

    $appExecutable = Get-ChildItem -LiteralPath $installDir -Filter '*.exe' -File |
        Where-Object { $_.Name -notin @('jc-cli.exe', 'uninstall.exe') } |
        Select-Object -First 1
    if (-not $appExecutable) {
        throw "Installed application executable was not found in $installDir."
    }
    if (-not (Test-Path -LiteralPath $uninstaller -PathType Leaf)) {
        throw "Uninstaller was not found in $installDir."
    }

    Write-Host "Starting $($appExecutable.FullName)"
    $appProcess = Start-Process -FilePath $appExecutable.FullName -PassThru
    Start-Sleep -Seconds $StartupTimeoutSeconds
    if ($appProcess.HasExited) {
        throw "Application exited during startup with code $($appProcess.ExitCode)."
    }
    Write-Host "Application remained running for $StartupTimeoutSeconds seconds."
}
finally {
    if ($appProcess -and -not $appProcess.HasExited) {
        Stop-Process -Id $appProcess.Id -Force
        $appProcess.WaitForExit()
    }

    if (Test-Path -LiteralPath $uninstaller -PathType Leaf) {
        Write-Host "Uninstalling from $installDir"
        $uninstall = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru
        if ($uninstall.ExitCode -ne 0) {
            throw "Uninstaller exited with code $($uninstall.ExitCode)."
        }
    }
}

if (Test-Path -LiteralPath $installDir) {
    throw "Uninstaller did not remove $installDir."
}

Write-Host 'Windows installer smoke test passed.'
