if (-not (Get-Variable -Name DuTestResults -Scope Global -ErrorAction SilentlyContinue)) {
    $global:DuTestResults = New-Object 'System.Collections.Generic.List[object]'
}
function Test-DuCase {
    param([string]$Name, [scriptblock]$Body)
    try {
        & $Body | Out-Null
        $global:DuTestResults.Add([pscustomobject]@{name=$Name;passed=$true;error=$null})
        Write-Host "PASS $Name"
    } catch {
        $global:DuTestResults.Add([pscustomobject]@{name=$Name;passed=$false;error=$_.Exception.Message})
        Write-Host "FAIL $Name : $($_.Exception.Message)" -ForegroundColor Red
        Write-Host $_.ScriptStackTrace
    }
}
function Assert-DuTrue {
    param($Condition, [string]$Message='Expected condition to be true.')
    if (-not $Condition) { throw $Message }
}
function Assert-DuEqual {
    param($Actual, $Expected, [string]$Message='Values differ.')
    if ($Actual -is [array] -or $Expected -is [array]) {
        if ($Actual -isnot [array] -or $Expected -isnot [array] -or $Actual.Count -ne $Expected.Count) { throw $Message }
        for ($i=0; $i -lt $Actual.Count; $i++) { Assert-DuEqual $Actual[$i] $Expected[$i] $Message }
        return
    }
    if ($null -eq $Expected) { if ($null -ne $Actual) { throw $Message }; return }
    if ($Actual -is [string] -or $Expected -is [string]) {
        if ($Actual -isnot [string] -or $Expected -isnot [string] -or $Actual -cne $Expected) { throw $Message }; return
    }
    if ($Actual -ne $Expected) { throw $Message }
}
function Assert-DuThrows {
    param([scriptblock]$Body, [string]$Pattern='')
    $caught=$false
    try { & $Body | Out-Null } catch {
        $caught=$true
        if ($Pattern -and $_.Exception.Message -notmatch $Pattern) { throw "Unexpected error; expected pattern: $Pattern" }
    }
    if (-not $caught) { throw 'Expected an exception.' }
}
function Get-DuTestDirectory {
    $root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.temp\dingtalk-bridge\powershell-tests'))
    $path=Join-Path $root ([guid]::NewGuid().ToString('N'))
    $null=[IO.Directory]::CreateDirectory($path)
    return $path
}
