param([switch]$Publish)
. (Join-Path $PSScriptRoot 'toolchain.ps1')
Push-Location $ProjectRoot
try {
    if (-not (Test-Path frontend/node_modules)) { Invoke-Npm ci --prefix frontend }
    Invoke-Npm run build --prefix frontend
    if ($Publish) { & $Dotnet publish backend/MiniDevOps.Api/MiniDevOps.csproj -c Release -o publish }
    else { & $Dotnet build MiniDevOps.slnx }
    if ($LASTEXITCODE -ne 0) { throw '.NET build failed' }
} finally { Pop-Location }
