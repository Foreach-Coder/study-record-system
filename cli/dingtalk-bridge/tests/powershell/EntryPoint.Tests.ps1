. (Join-Path $PSScriptRoot 'TestHarness.ps1')
$entryRepository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
. (Join-Path $entryRepository 'lib\Core.ps1')
Test-DuCase 'relocated native entrypoint runs without init or Node and returns a safe status' {
    $directory=Get-DuTestDirectory
    $portable=Join-Path $directory "portable 中文's"
    $null=[IO.Directory]::CreateDirectory($portable)
    Copy-Item -LiteralPath (Join-Path $entryRepository 'dingtalk-bridge.ps1') -Destination $portable
    Copy-Item -LiteralPath (Join-Path $entryRepository 'lib') -Destination $portable -Recurse
    Copy-Item -LiteralPath (Join-Path $entryRepository 'modules') -Destination $portable -Recurse
    $script=Join-Path $directory 'verify.ps1'
    $body=@'
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$entry='__ENTRY__'
$nodeAbsent=$null -eq (Get-Command node -ErrorAction SilentlyContinue)
$help=@(& $entry --help)
$helpCode=$LASTEXITCODE
$bridgeHelp=@(& $entry bridge --help)
$bridgeHelpCode=$LASTEXITCODE
$null=@(& $entry bridge not-a-method)
$failureCode=$LASTEXITCODE
$helpAfter=@(& $entry --help)
@{nodeAbsent=$nodeAbsent;help=($help -join ' ');helpCode=$helpCode;bridgeHelp=($bridgeHelp -join ' ');bridgeHelpCode=$bridgeHelpCode;failureCode=$failureCode;stillRunning=($helpAfter.Count -gt 0);lastCode=$LASTEXITCODE}|ConvertTo-Json -Compress
'@
    $entry=Join-Path $portable 'dingtalk-bridge.ps1'
    $body=$body.Replace('__ENTRY__',$entry.Replace("'","''"))
    [IO.File]::WriteAllText($script,$body,(New-Object Text.UTF8Encoding($true)))
    $shell=(Get-Process -Id $PID).Path
    $childEnvironment=@{}
    foreach($key in [Environment]::GetEnvironmentVariables('Process').Keys){$childEnvironment[$key]=[Environment]::GetEnvironmentVariable($key,'Process')}
    foreach($key in @($childEnvironment.Keys)){if($key -match '^(?:DWS_|DINGTALK_DWS_|QWORK_|QODER_|QWEN_|DINGTALK_UTILS_ENV_NAME$|DINGTALK_UTILS_DWS_COMMAND$)'){$childEnvironment.Remove($key)}}
    $childEnvironment.USERPROFILE=$directory;$childEnvironment.HOME=$directory;$childEnvironment.TEMP=$directory;$childEnvironment.TMP=$directory
    $childEnvironment.PATH=(Split-Path -Parent $shell)+';'+(Join-Path $env:SystemRoot 'System32')+';'+(Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0')
    $child=Invoke-DuProcess -File $shell -Arguments @('-NoLogo','-NoProfile','-NonInteractive','-File',$script) -Environment $childEnvironment -WorkingDirectory $directory -TimeoutMs 60000
    Assert-DuEqual $child.exitCode 0 'portable process must complete'
    $stderrLines=@($child.stderr -split "`n"|Where-Object{$_.Trim()})
    Assert-DuEqual $stderrLines.Count 1 'entrypoint reports a failure as one safe message'
    Assert-DuTrue ($stderrLines[0] -match '^错误：') 'failure message is explicit and has no stack trace'
    $result=ConvertFrom-DuJson -Text $child.stdout
    foreach($key in @('nodeAbsent','stillRunning')){Assert-DuTrue $result[$key] $key}
    Assert-DuEqual $result.helpCode 0 'help exits zero without init'
    Assert-DuEqual $result.bridgeHelpCode 0 'bridge help exits zero without init'
    Assert-DuTrue ($result.help -match 'bridge getMessageById') 'portable help lists bridge methods'
    Assert-DuTrue ($result.bridgeHelp -match 'getMessageById') 'bridge help works in the relocated tree'
    Assert-DuEqual $result.failureCode 1 'failure status is preserved'
    Assert-DuEqual $result.lastCode 0 'a later success resets the exit status'
}
Test-DuCase 'local entrypoint preserves failure exit status without closing the calling PowerShell' {
    $directory=Get-DuTestDirectory
    $script=Join-Path $directory 'local-check.ps1'
    $body=@'
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$entry='__ENTRY__'
$help=@(& $entry --help)
$helpCode=$LASTEXITCODE
$null=@(& $entry bridge not-a-method)
$psCode=$LASTEXITCODE
$stillRunning=$true
$helpAfter=@(& $entry --help)
@{help=($help -join ' ');helpCode=$helpCode;psCode=$psCode;stillRunning=$stillRunning;successCode=$LASTEXITCODE;helpAfter=($helpAfter.Count -gt 0)}|ConvertTo-Json -Compress
'@
    $body=$body.Replace('__ENTRY__',(Join-Path $entryRepository 'dingtalk-bridge.ps1').Replace("'","''"))
    [IO.File]::WriteAllText($script,$body,(New-Object Text.UTF8Encoding($true)))
    $environment=@{}
    foreach($name in [Environment]::GetEnvironmentVariables('Process').Keys){$environment[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
    $shell=(Get-Process -Id $PID).Path
    $environment.USERPROFILE=$directory;$environment.HOME=$directory;$environment.TEMP=$directory;$environment.TMP=$directory
    $environment.PATH=(Split-Path -Parent $shell)+';'+(Join-Path $env:SystemRoot 'System32')+';'+(Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0')
    $child=Invoke-DuProcess -File $shell -Arguments @('-NoProfile','-NonInteractive','-File',$script) -Environment $environment -WorkingDirectory $directory -TimeoutMs 60000
    Assert-DuEqual $child.exitCode 0 'local test process'
    $result=ConvertFrom-DuJson -Text $child.stdout
    Assert-DuEqual $result.helpCode 0 'help works before the failure'
    Assert-DuEqual $result.psCode 1 'PowerShell failure status'
    Assert-DuTrue $result.stillRunning 'PowerShell caller continues after error'
    Assert-DuEqual $result.successCode 0 'subsequent success resets exit status'
    Assert-DuTrue $result.helpAfter 'subsequent local invocation succeeds'
    Assert-DuTrue ($result.help -match 'bridge getMessageById') 'local help works'
}
