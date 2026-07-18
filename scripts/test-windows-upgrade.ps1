param(
    [string]$PreviousInstallerPath,
    [string]$CurrentInstallerPath,
    [int]$StartupTimeoutSeconds = 5
)

$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
    throw 'Windows upgrade smoke testing can only run on Windows.'
}

if (-not $PreviousInstallerPath) {
    $PreviousInstallerPath = Get-ChildItem "$PSScriptRoot\..\previous-installer\*-setup.exe" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}
if (-not $CurrentInstallerPath) {
    $CurrentInstallerPath = @(
        Get-ChildItem "$PSScriptRoot\..\src-tauri\target\release\bundle\nsis\*-setup.exe" -ErrorAction SilentlyContinue
        Get-ChildItem "$PSScriptRoot\..\src-tauri\target\*\release\bundle\nsis\*-setup.exe" -ErrorAction SilentlyContinue
    ) |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}

foreach ($candidate in @($PreviousInstallerPath, $CurrentInstallerPath)) {
    if (-not $candidate -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        throw 'Both previous and current NSIS installer paths are required.'
    }
}

$PreviousInstallerPath = (Resolve-Path -LiteralPath $PreviousInstallerPath).Path
$CurrentInstallerPath = (Resolve-Path -LiteralPath $CurrentInstallerPath).Path
$previousInstallerHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $PreviousInstallerPath).Hash
$currentInstallerHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $CurrentInstallerPath).Hash
if ($previousInstallerHash -eq $currentInstallerHash) {
    throw 'Previous and current installers are identical; this would only test reinstall behavior.'
}

$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$tempRoot = [System.IO.Path]::GetFullPath($tempRoot).TrimEnd('\', '/')
$runId = [guid]::NewGuid().ToString('N')
$installDir = Join-Path $tempRoot "jc-platform-upgrade-install-$runId"
$dataRoot = Join-Path $tempRoot "jc-platform-upgrade-data-$runId"
$projectPath = Join-Path $dataRoot 'upgrade-fixture.jcpro'
$appDataRoot = [Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)
$recoveryPath = Join-Path $appDataRoot 'com.jc.custom-platform\recovery\project-draft.json'
$uninstaller = Join-Path $installDir 'uninstall.exe'
$appProcess = $null
$projectHash = $null
$recoveryHash = $null
$recoveryPreviouslyExisted = Test-Path -LiteralPath $recoveryPath -PathType Leaf
$recoveryBackup = if ($recoveryPreviouslyExisted) {
    [System.IO.File]::ReadAllBytes($recoveryPath)
} else {
    $null
}

function Assert-TemporaryPath([string]$Path) {
    $resolved = [System.IO.Path]::GetFullPath($Path)
    if (-not $resolved.StartsWith("$tempRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clean a path outside the temporary root: $resolved"
    }
}

function Invoke-SilentInstaller([string]$Path, [string]$Stage) {
    Write-Host "$Stage with $Path"
    $process = Start-Process `
        -FilePath $Path `
        -ArgumentList @('/S', "/D=$installDir") `
        -Wait `
        -PassThru
    if ($process.ExitCode -ne 0) {
        throw "$Stage exited with code $($process.ExitCode)."
    }
}

function Get-InstalledApplication {
    $application = Get-ChildItem -LiteralPath $installDir -Filter '*.exe' -File |
        Where-Object { $_.Name -notin @('jc-cli.exe', 'uninstall.exe') } |
        Select-Object -First 1
    if (-not $application) {
        throw "Installed application executable was not found in $installDir."
    }
    return $application
}

function Test-ApplicationStartup([System.IO.FileInfo]$Application, [string[]]$Arguments = @()) {
    Write-Host "Starting $($Application.FullName)"
    $startParameters = @{
        FilePath = $Application.FullName
        PassThru = $true
    }
    if ($Arguments.Count -gt 0) {
        $startParameters.ArgumentList = $Arguments
    }
    $script:appProcess = Start-Process @startParameters
    Start-Sleep -Seconds $StartupTimeoutSeconds
    if ($script:appProcess.HasExited) {
        throw "Application exited during startup with code $($script:appProcess.ExitCode)."
    }
    Stop-Process -Id $script:appProcess.Id -Force
    $script:appProcess.WaitForExit()
    $script:appProcess = $null
}

Assert-TemporaryPath $installDir
Assert-TemporaryPath $dataRoot

try {
    New-Item -ItemType Directory -Force -Path $dataRoot | Out-Null
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $recoveryPath) | Out-Null

    Invoke-SilentInstaller $PreviousInstallerPath 'Installing previous version'
    $previousApplication = Get-InstalledApplication
    $previousApplicationHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $previousApplication.FullName).Hash
    Test-ApplicationStartup $previousApplication

    $projectDocument = @{
        config_version = 'jc001'
        project = @{ name = 'Upgrade Fixture'; revision = 1 }
        device = @{ resolution_w = 800; resolution_h = 480 }
    }
    $recoveryDocument = @{
        schemaVersion = 1
        projectPath = $projectPath
        projectName = 'Upgrade Fixture'
        savedAt = '2026-07-18T00:00:00.000Z'
        document = @{
            config_version = 'jc001'
            project = @{ name = 'Upgrade Fixture'; revision = 2 }
            device = @{ resolution_w = 800; resolution_h = 480 }
        }
    }
    [System.IO.File]::WriteAllText($projectPath, ($projectDocument | ConvertTo-Json -Depth 10))
    [System.IO.File]::WriteAllText($recoveryPath, ($recoveryDocument | ConvertTo-Json -Depth 10))
    $projectHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $projectPath).Hash
    $recoveryHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $recoveryPath).Hash

    Invoke-SilentInstaller $CurrentInstallerPath 'Upgrading to current version'
    $currentApplication = Get-InstalledApplication
    $currentApplicationHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $currentApplication.FullName).Hash
    if ($previousApplicationHash -eq $currentApplicationHash) {
        throw 'The installed application binary did not change after upgrade.'
    }
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $projectPath).Hash -ne $projectHash) {
        throw 'The external project file changed during upgrade.'
    }
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $recoveryPath).Hash -ne $recoveryHash) {
        throw 'The recovery draft changed during upgrade.'
    }

    Test-ApplicationStartup $currentApplication @("`"$projectPath`"")
}
finally {
    $cleanupErrors = [System.Collections.Generic.List[string]]::new()
    if ($appProcess -and -not $appProcess.HasExited) {
        Stop-Process -Id $appProcess.Id -Force
        $appProcess.WaitForExit()
    }
    if (Test-Path -LiteralPath $uninstaller -PathType Leaf) {
        $uninstall = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru
        if ($uninstall.ExitCode -ne 0) {
            $cleanupErrors.Add("Uninstaller exited with code $($uninstall.ExitCode).")
        }
    }

    if (Test-Path -LiteralPath $installDir) {
        $cleanupErrors.Add("Uninstaller did not remove $installDir.")
    }
    if ($projectHash) {
        if (-not (Test-Path -LiteralPath $projectPath -PathType Leaf)) {
            $cleanupErrors.Add('The external project file was removed during uninstall.')
        }
        elseif ((Get-FileHash -Algorithm SHA256 -LiteralPath $projectPath).Hash -ne $projectHash) {
            $cleanupErrors.Add('The external project file changed during uninstall.')
        }
    }
    if ($recoveryHash) {
        if (-not (Test-Path -LiteralPath $recoveryPath -PathType Leaf)) {
            $cleanupErrors.Add('The recovery draft was removed during uninstall.')
        }
        elseif ((Get-FileHash -Algorithm SHA256 -LiteralPath $recoveryPath).Hash -ne $recoveryHash) {
            $cleanupErrors.Add('The recovery draft changed during uninstall.')
        }
    }
    if ($recoveryPreviouslyExisted) {
        [System.IO.File]::WriteAllBytes($recoveryPath, $recoveryBackup)
    }
    elseif (Test-Path -LiteralPath $recoveryPath -PathType Leaf) {
        Remove-Item -LiteralPath $recoveryPath -Force
    }
    if (Test-Path -LiteralPath $dataRoot) {
        Remove-Item -LiteralPath $dataRoot -Recurse -Force
    }
    if ($cleanupErrors.Count -gt 0) {
        throw ($cleanupErrors -join ' ')
    }
}

Write-Host 'Windows cross-version upgrade test passed.'
