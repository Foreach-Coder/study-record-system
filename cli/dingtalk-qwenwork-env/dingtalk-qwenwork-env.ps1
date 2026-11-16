#requires -Version 5.1
# dingtalk-qwenwork-env — DWS multi-identity isolation. The PowerShell entry owns the
# caller's session (alias + environment variables); everything else is Python.
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest = @())

$ErrorActionPreference = 'Stop'
$QwenRoot = $PSScriptRoot

# Native output from Python is UTF-8; make the console decode it the same way.
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
if ($env:OS -eq 'Windows_NT') { $null = & cmd.exe /c 'chcp 65001' 2>&1 }

function Get-DuQwenPythonCommand {
    if ($env:DINGTALK_QWEN_PYTHON) { return ,@($env:DINGTALK_QWEN_PYTHON) }
    $launcher = Get-Command py -ErrorAction SilentlyContinue
    if ($null -ne $launcher) { return ,@($launcher.Source, '-3') }
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($null -ne $python) { return ,@($python.Source) }
    return $null
}

$action = if ($Rest.Count -ge 1) { $Rest[0] } else { '--help' }

if ($action -eq 'active') {
    $env:DINGTALK_QWEN_HOME = $QwenRoot
    . (Join-Path $QwenRoot 'lib\Session.ps1')
    # NB: $Rest and $rest are the same PowerShell variable; keep a distinct name.
    $activeArguments = @()
    if ($Rest.Count -gt 1) { $activeArguments = $Rest[1..($Rest.Count - 1)] }
    try {
        $result = Invoke-DuQwenActive -Arguments $activeArguments
        [Console]::Out.WriteLine($result)
        exit 0
    } catch {
        $message = $_.Exception.Message
        $code = if ($message -eq 'python_not_found') { 'python_not_found' } else { 'active_failed' }
        $payload = @{ success = $false; errorCode = $code; error = $message } | ConvertTo-Json -Compress
        [Console]::Out.WriteLine($payload)
        exit 1
    }
}

$command = Get-DuQwenPythonCommand
if ($null -eq $command) {
    [Console]::Out.WriteLine('{"success":false,"errorCode":"python_not_found","error":"找不到 Python。请安装 Python 3.10+，或用 DINGTALK_QWEN_PYTHON 指定解释器。"}')
    [Console]::Error.WriteLine('错误：找不到 Python。')
    exit 1
}
$executable = $command[0]
$prefix = @()
if ($command.Count -gt 1) { $prefix = $command[1..($command.Count - 1)] }

Push-Location -LiteralPath $QwenRoot
try { & $executable @prefix '-m' 'qwen_env' @Rest } finally { Pop-Location }
exit $LASTEXITCODE