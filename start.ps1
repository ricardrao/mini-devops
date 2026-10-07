param([int]$Port = 3220)
. (Join-Path $PSScriptRoot 'scripts/toolchain.ps1')
Set-Location -LiteralPath $ProjectRoot
& (Join-Path $PSScriptRoot 'scripts/build.ps1')
$env:DEVOPS_URL = "http://127.0.0.1:$Port"
$env:DEVOPS_CONTENT_ROOT = $ProjectRoot
Write-Host "Mini DevOps: http://localhost:$Port"
& $Dotnet backend/MiniDevOps.Api/bin/Debug/net10.0/MiniDevOps.dll
exit $LASTEXITCODE
