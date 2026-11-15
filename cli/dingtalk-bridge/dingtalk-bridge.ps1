#requires -Version 5.1
# Single entrypoint: resolve the project root from this file, then delegate loading,
# routing and execution to lib\Application.ps1. Never resolves paths from the process CWD.
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Rest = @()
)

$BridgeRoot = $PSScriptRoot
. (Join-Path $BridgeRoot 'lib\Application.ps1')
Invoke-DuApplication $Rest
exit $LASTEXITCODE