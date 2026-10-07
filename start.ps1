param([int]$Port = 3220)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$portable = Join-Path $PSScriptRoot '..\mini-icm\.runtime\dotnet\dotnet.exe'
$dotnet = if ($env:DEVOPS_DOTNET) { $env:DEVOPS_DOTNET } elseif (Test-Path -LiteralPath $portable) { (Resolve-Path -LiteralPath $portable).Path } else { 'dotnet' }
$env:DEVOPS_URL = "http://127.0.0.1:$Port"
Write-Host "Mini DevOps: http://localhost:$Port"
& $dotnet run --project MiniDevOps.csproj
exit $LASTEXITCODE
