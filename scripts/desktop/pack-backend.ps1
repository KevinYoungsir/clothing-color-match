[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptDirectory "..\.."))
$entryPoint = Join-Path $projectRoot "ai-server\desktop_server.py"
$modelPath = Join-Path $projectRoot "ai-server\models\model.onnx"
$outputDirectory = Join-Path $projectRoot "desktop-resources\backend"
$workDirectory = Join-Path $projectRoot "build\pyinstaller\work"
$specDirectory = Join-Path $projectRoot "build\pyinstaller\spec"

function Assert-WithinProject([string]$PathValue) {
    $resolved = [System.IO.Path]::GetFullPath($PathValue)
    $rootPrefix = $projectRoot.TrimEnd('\') + '\'

    if (-not $resolved.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to modify a path outside the project: $resolved"
    }
}

function Find-DesktopPython {
    $candidates = @(
        $env:DESKTOP_PYTHON,
        (Join-Path $projectRoot "ai-server\.venv-desktop\Scripts\python.exe"),
        (Join-Path $projectRoot "ai-server\.venv\Scripts\python.exe")
    ) | Where-Object { $_ }

    foreach ($candidate in $candidates) {
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            continue
        }

        try {
            & $candidate --version 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) {
                return $candidate
            }
        }
        catch {
            continue
        }
    }

    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCommand) {
        return $pythonCommand.Source
    }

    throw "No usable Python found. Set DESKTOP_PYTHON or create ai-server/.venv-desktop with Python 3.11/3.12."
}

if (-not (Test-Path -LiteralPath $modelPath -PathType Leaf)) {
    Write-Error "Local model is missing: $modelPath. Add model.onnx locally before packaging; do not commit it."
    exit 2
}

$python = Find-DesktopPython
Write-Host "[desktop-pack] Python: $python"

& $python -c "import PyInstaller, fastapi, uvicorn, PIL, numpy, onnxruntime" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Desktop Python dependencies are incomplete. Install ai-server/requirements-desktop.txt in the selected environment."
}

foreach ($directory in @($outputDirectory, $workDirectory, $specDirectory)) {
    Assert-WithinProject $directory
}

if (Test-Path -LiteralPath $outputDirectory) {
    Remove-Item -LiteralPath $outputDirectory -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $outputDirectory, $workDirectory, $specDirectory | Out-Null

$pyInstallerArgs = @(
    "-m", "PyInstaller",
    "--noconfirm",
    "--clean",
    "--onefile",
    "--name", "ai-server-desktop",
    "--distpath", $outputDirectory,
    "--workpath", $workDirectory,
    "--specpath", $specDirectory,
    "--paths", (Join-Path $projectRoot "ai-server"),
    "--collect-all", "onnxruntime",
    "--collect-submodules", "uvicorn",
    "--hidden-import", "multipart",
    $entryPoint
)

& $python @pyInstallerArgs
if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller failed with exit code $LASTEXITCODE."
}

$backendExecutable = Join-Path $outputDirectory "ai-server-desktop.exe"
if (-not (Test-Path -LiteralPath $backendExecutable -PathType Leaf)) {
    throw "PyInstaller completed without producing $backendExecutable"
}

Write-Host "[desktop-pack] Backend sidecar: $backendExecutable"
