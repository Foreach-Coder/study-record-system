# Module load list for the bridge CLI; behavior lives in lib\ and modules\.
# Root is derived from this file's own location, so the CLI works from any CWD.
$ErrorActionPreference = 'Stop'
$BridgeRoot = Split-Path -Parent $PSScriptRoot
foreach ($component in @('lib\Core.ps1', 'lib\Cli.ps1', 'modules\bridge.ps1')) {
    . (Join-Path $BridgeRoot $component)
}