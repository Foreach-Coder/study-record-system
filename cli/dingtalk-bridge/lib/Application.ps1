# Application lifecycle: load the shared lib, route the command, emit JSON receipts,
# and map failures to a nonzero exit code. Root is derived from this file's location.
function Invoke-DuApplication {
    param([string[]]$Arguments)
    $previousErrorPreference=$ErrorActionPreference
    $ErrorActionPreference='Stop'
    try {
        $root=Split-Path -Parent $PSScriptRoot
        foreach ($component in @('lib\Core.ps1','lib\Cli.ps1','modules\bridge.ps1')) {
            . (Join-Path $root $component)
        }
        $global:LASTEXITCODE=0
        Invoke-DuCommand -Arguments $Arguments | ForEach-Object {
            if ($_ -is [string]) { Write-Output $_ }
            elseif ($null -ne $_) {
                if ($_ -is [Collections.IDictionary] -and $_.Contains('success') -and $_.success -is [bool] -and -not $_.success) { $global:LASTEXITCODE=1 }
                Write-Output (ConvertTo-DuJson -Value $_)
            }
        }
    } catch {
        $global:LASTEXITCODE=1
        [Console]::Error.WriteLine('错误：' + $_.Exception.Message)
        if ($_.Exception.Data.Contains('details')) {
            [Console]::Error.WriteLine((ConvertTo-DuJson -Value $_.Exception.Data['details']))
        }
    } finally {
        $ErrorActionPreference=$previousErrorPreference
    }
}
