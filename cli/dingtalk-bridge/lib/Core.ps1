# Shared native PowerShell runtime. No output or external runtime is required to load it.
if (-not ('DingtalkUtils.Json' -as [type])) {
    $duCompileDirectory = [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $PSScriptRoot) '.temp\dingtalk-utils\.runtime'))
    $null = [IO.Directory]::CreateDirectory($duCompileDirectory)
    $duOriginalTemp = [Environment]::GetEnvironmentVariable('TEMP','Process')
    $duOriginalTmp = [Environment]::GetEnvironmentVariable('TMP','Process')
    try {
        [Environment]::SetEnvironmentVariable('TEMP',$duCompileDirectory,'Process')
        [Environment]::SetEnvironmentVariable('TMP',$duCompileDirectory,'Process')
        if ($PSVersionTable.PSVersion.Major -le 5) {
            Add-Type -Path (Join-Path $PSScriptRoot 'DuRuntime.cs') -ReferencedAssemblies @('System.dll','System.Core.dll','System.Numerics.dll') -ErrorAction Stop
        } else { Add-Type -Path (Join-Path $PSScriptRoot 'DuRuntime.cs') -ErrorAction Stop }
    } finally {
        if ($null -eq $duOriginalTemp) { Remove-Item -LiteralPath Env:TEMP -ErrorAction SilentlyContinue }
        else { [Environment]::SetEnvironmentVariable('TEMP',$duOriginalTemp,'Process') }
        if ($null -eq $duOriginalTmp) { Remove-Item -LiteralPath Env:TMP -ErrorAction SilentlyContinue }
        else { [Environment]::SetEnvironmentVariable('TMP',$duOriginalTmp,'Process') }
    }
}

function ConvertFrom-DuJson {
    param([AllowEmptyString()][string]$Text,[int]$Limit=67108864)
    try { return ,([DingtalkUtils.Json]::Parse($Text,$Limit)) }
    catch { throw ('JSON 无效或超过大小/深度上限。' + ' Invalid JSON or bound exceeded.') }
}
function ConvertTo-DuJson {
    param([AllowNull()]$Value)
    try { [DingtalkUtils.Json]::Stringify($Value) }
    catch { throw 'JSON 值无效或超过深度上限。' }
}
function Assert-DuMap { param([AllowNull()]$Value,[string]$Label) if ($Value -isnot [Collections.IDictionary]) { throw "$Label 必须是 JSON 对象。" } }
function Assert-DuArray { param([AllowNull()]$Value,[string]$Label) if ($Value -isnot [array]) { throw "$Label 必须是 JSON 数组。" } }
function Assert-DuId {
    param([AllowNull()]$Value,[string]$Label)
    if ($Value -isnot [string] -or $Value.Length -lt 1 -or $Value.Length -gt 2048 -or $Value -match '[\s\u0085,\x00-\x1f]') { throw "$Label 缺失或格式无效。" }
}
function Test-DuTrue { param([AllowNull()]$Value) return ($Value -is [bool] -and $Value) }
function Test-DuFalse { param([AllowNull()]$Value) return ($Value -is [bool] -and -not $Value) }

function ConvertTo-DuTime {
    param([AllowNull()]$Value)
    if ($Value -isnot [string] -or $Value -cnotmatch '\A\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,7})?)?(?:Z|[+-]\d{2}:\d{2})?)?\z') { throw '时间必须是 ISO 日期或时间字符串。' }
    $text = $Value
    if ($text.Length -eq 10) { $text += 'T00:00:00+08:00' }
    elseif ($text -cnotmatch '(Z|[+-]\d{2}:\d{2})\z') { $text += '+08:00' }
    $parsed = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse($text,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::None,[ref]$parsed)) { throw '时间或日历无效。' }
    try { return $parsed.ToOffset([TimeSpan]::FromHours(8)) } catch { throw '北京时间超出支持范围。' }
}
function Format-DuTime {
    param([DateTimeOffset]$Value,[switch]$Display)
    $time = $Value.ToOffset([TimeSpan]::FromHours(8))
    if ($Display) { return $time.ToString('yyyy-MM-dd HH:mm:ss.fffffff',[Globalization.CultureInfo]::InvariantCulture).TrimEnd('0').TrimEnd('.') }
    return $time.ToString('yyyy-MM-ddTHH:mm:ss.fffffffzzz',[Globalization.CultureInfo]::InvariantCulture)
}

function Invoke-DuProcess {
    param([string]$File,[AllowEmptyCollection()][string[]]$Arguments=@(),[Collections.IDictionary]$Environment,[string]$WorkingDirectory,[int]$TimeoutMs=180000,[int]$StdoutLimit=67108864,[int]$StderrLimit=65536,[scriptblock]$OnOutput)
    if ($TimeoutMs -lt 1 -or $StdoutLimit -lt 1 -or $StderrLimit -lt 1) { throw 'DWS process limits must be positive.' }
    $session = $null
    try {
        $session = New-Object DingtalkUtils.ProcessSession -ArgumentList @($File,[string[]]$Arguments,$Environment,$WorkingDirectory,$TimeoutMs,$StdoutLimit,$StderrLimit)
        do {
            $done = $session.Poll()
            foreach ($chunk in $session.Drain()) {
                if ($null -ne $OnOutput) {
                    try { $null = & $OnOutput $chunk.Text $chunk.Stream } catch { throw 'DWS output handler failed.' }
                }
            }
            if (-not $done) { [Threading.Thread]::Sleep(15) }
        } while (-not $done)
        return @{stdout=$session.Output;stderr=$session.Error;exitCode=$session.ExitCode}
    } catch {
        $safe = $_.Exception.ToString()
        if ($safe -match 'timed out') { throw 'DWS command timed out.' }
        if ($safe -match 'size bound|invalid UTF-8') { throw 'DWS output exceeds size bound or contains invalid UTF-8.' }
        if ($safe -match 'output handler failed') { throw 'DWS output handler failed.' }
        throw '无法启动或读取 DWS 进程。'
    } finally { if ($null -ne $session) { $session.Dispose() } }
}
