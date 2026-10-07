$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
function Resolve-Tool($Override, $LocalPath, $Command) {
    if ($Override) { return $Override }
    if (Test-Path -LiteralPath $LocalPath) { return (Resolve-Path -LiteralPath $LocalPath).Path }
    $resolved = Get-Command $Command -ErrorAction SilentlyContinue
    if ($resolved) { return $resolved.Source }
    throw "Missing $Command. Install .NET 10 SDK and Node.js 24+, or configure DEVOPS_DOTNET / DEVOPS_NODE / DEVOPS_NPM_CLI."
}
$Dotnet = Resolve-Tool $env:DEVOPS_DOTNET (Join-Path $ProjectRoot '.runtime/dotnet/dotnet.exe') 'dotnet'
$Node = Resolve-Tool $env:DEVOPS_NODE (Join-Path $ProjectRoot '.runtime/node.exe') 'node'
$NpmCli = $env:DEVOPS_NPM_CLI
if (-not $NpmCli -and (Test-Path (Join-Path $ProjectRoot '.runtime/npm/bin/npm-cli.js'))) { $NpmCli = Join-Path $ProjectRoot '.runtime/npm/bin/npm-cli.js' }
function Invoke-Npm {
    if ($NpmCli) { & $Node $NpmCli @args } else { & npm.cmd @args }
    if ($LASTEXITCODE -ne 0) { throw "npm failed with exit code $LASTEXITCODE" }
}
$env:Path = (Split-Path -Parent $Node) + [IO.Path]::PathSeparator + $env:Path
