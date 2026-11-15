#requires -Version 5.1
param([string[]]$Name=@())
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$tests=$PSScriptRoot
$temporary=Join-Path $root '.temp\dingtalk-bridge\powershell-test-runtime'
$null=[IO.Directory]::CreateDirectory($temporary)
$oldTemp=$env:TEMP; $oldTmp=$env:TMP
$env:TEMP=$temporary; $env:TMP=$temporary
$global:DuTestResults=New-Object 'System.Collections.Generic.List[object]'
$summary=New-Object 'System.Collections.Generic.List[object]'
try {
    . (Join-Path $tests 'TestHarness.ps1')
    $files=@(Get-ChildItem -LiteralPath $tests -Filter '*.Tests.ps1' | Sort-Object Name)
    if($Name.Count){$files=@($files|Where-Object{$Name -contains $_.BaseName -or $Name -contains $_.Name})}
    if(-not $files.Count){throw 'No test files matched.'}
    foreach($file in $files){
        $before=$global:DuTestResults.Count
        try{ . $file.FullName }catch{
            $global:DuTestResults.Add([pscustomobject]@{name=$file.Name;passed=$false;error=$_.Exception.Message})
            Write-Host "FAIL loading $($file.Name): $($_.Exception.Message)"
            Write-Host $_.ScriptStackTrace
        }
        $rows=@($global:DuTestResults|Select-Object -Skip $before)
        $failed=@($rows|Where-Object{-not $_.passed})
        $summary.Add([pscustomobject]@{file=$file.Name;tests=$rows.Count;passed=$rows.Count-$failed.Count;failed=$failed.Count})
        Write-Host ("RESULT {0}: {1}/{2} passed" -f $file.Name,($rows.Count-$failed.Count),$rows.Count)
    }
    $failedAll=@($global:DuTestResults|Where-Object{-not $_.passed})
    [ordered]@{shell=$PSVersionTable.PSVersion.ToString();tests=$global:DuTestResults.Count;passed=$global:DuTestResults.Count-$failedAll.Count;failed=$failedAll.Count;files=$summary}|ConvertTo-Json -Compress -Depth 5
    if($failedAll.Count){exit 1}
    exit 0
}finally{$env:TEMP=$oldTemp;$env:TMP=$oldTmp}
