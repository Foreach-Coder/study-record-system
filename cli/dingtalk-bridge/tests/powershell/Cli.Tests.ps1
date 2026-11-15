. (Join-Path $PSScriptRoot 'TestHarness.ps1')
foreach($relative in @('lib\Core.ps1','lib\Cli.ps1')) {
    . (Join-Path $PSScriptRoot ('..\..\'+$relative))
}

Test-DuCase 'CLI help does not require DWS and does not require shell-init' {
    $help=Invoke-DuCommand -Arguments @('--help')
    Assert-DuTrue ($help -match 'bridge')
    Assert-DuTrue ($help -match '无需.*shell-init')
}
Test-DuCase 'CLI rejects unknown, duplicate and missing arguments before dispatch' {
    Assert-DuThrows { Invoke-DuCommand -Arguments @('bridge','--unrecognized','never-print-this') }
    Assert-DuThrows { Invoke-DuCommand -Arguments @('bridge','--profile','one','--profile','two') }
    Assert-DuThrows { Invoke-DuCommand -Arguments @('bridge') }
}
Test-DuCase 'CLI parses separated and equals arguments without interpreting their contents' {
    $p=Read-DuOptions -Arguments @('--source-group=group with spaces','--start','2026-10-30','--send') -ValueNames @('source-group','start') -SwitchNames @('send')
    Assert-DuEqual $p.Options['source-group'] 'group with spaces'
    Assert-DuEqual $p.Options['start'] '2026-10-30'
    Assert-DuEqual $p.Options['send'] $true
    Assert-DuEqual $p.Positionals.Count 0
}
Test-DuCase 'CLI reports retired init and state-directory explicitly' {
    Assert-DuThrows { Invoke-DuCommand -Arguments @('shell-init','powershell') } 'shell-init'
    Assert-DuThrows { Invoke-DuCommand -Arguments @('bridge','--state-directory','old') } '已移除'
}
