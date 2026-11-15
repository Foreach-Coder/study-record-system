$coreRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'TestHarness.ps1')) { . (Join-Path $PSScriptRoot 'TestHarness.ps1') }
if (Test-Path -LiteralPath (Join-Path $coreRoot 'lib\Core.ps1')) { . (Join-Path $coreRoot 'lib\Core.ps1') }

Test-DuCase 'JSON preserves integer precision, exact property names, arrays and ISO strings' {
    $value = ConvertFrom-DuJson -Text '{"n":9223372036854775808123456789,"key":1,"Key":2,"empty":[],"one":[1],"iso":"2026-10-30T00:00:00.0000001+08:00"}'
    Assert-DuEqual ([string]$value['n']) '9223372036854775808123456789' 'large integer'
    Assert-DuEqual $value['key'] 1 'case sensitive lower key'
    Assert-DuEqual $value['Key'] 2 'case sensitive upper key'
    Assert-DuTrue ($value['empty'] -is [array]) 'empty JSON array'
    Assert-DuEqual $value['one'].Count 1 'singleton JSON array'
    Assert-DuTrue ($value['iso'] -is [string]) 'ISO remains a string'
    $roundtrip = ConvertFrom-DuJson -Text (ConvertTo-DuJson -Value $value)
    Assert-DuEqual ([string]$roundtrip['n']) ([string]$value['n']) 'JSON roundtrip'
    Assert-DuEqual $roundtrip['iso'] $value['iso'] '100ns JSON string'
    $empty = ConvertFrom-DuJson -Text '[]'
    Assert-DuTrue ($empty -is [array] -and $empty.Count -eq 0) 'root empty array preserved'
}

Test-DuCase 'JSON rejects malformed values, duplicate keys, excessive depth and byte limits' {
    foreach ($text in @('{"a":1,}', '[01]', 'true trailing', '{"a":1,"a":2}', '"bad'+[char]1+'"')) {
        Assert-DuThrows { ConvertFrom-DuJson -Text $text } '.'
    }
    Assert-DuThrows { ConvertFrom-DuJson -Text (('['*65)+'0'+(']'*65)) } 'depth|深度|JSON'
    Assert-DuThrows { ConvertFrom-DuJson -Text '"中文"' -Limit 5 } 'bound|大小|JSON'
}

Test-DuCase 'time parsing matches independent golden vectors and rejects invalid calendar values' {
    $vectors = ConvertFrom-DuJson -Text ([IO.File]::ReadAllText((Join-Path $coreRoot 'tests\compatibility-vectors.json')))
    foreach ($vector in $vectors.operationVectors) {
        $start = ConvertTo-DuTime -Value $vector.input.start
        $end = ConvertTo-DuTime -Value $vector.input.end
        Assert-DuEqual (Format-DuTime -Value $start) $vector.expected.identity.start 'canonical start'
        Assert-DuEqual (Format-DuTime -Value $end) $vector.expected.identity.end 'canonical end'
        Assert-DuEqual (Format-DuTime -Value $start -Display) $vector.expected.startDisplay 'display start'
        Assert-DuEqual ([string]$start.UtcTicks) $vector.expected.startUtcTicks 'UTC ticks'
    }
    foreach ($vector in $vectors.rejectedTimeVectors) { Assert-DuThrows { ConvertTo-DuTime -Value $vector.value } '.' }
    foreach ($time in @('2026-02-30','2026-10-30T24:00:00','2026-10-30T00:00:00+14:01','2026-10-30T00:00:00.12345678Z')) {
        Assert-DuThrows { ConvertTo-DuTime -Value $time } '.'
    }
    Assert-DuThrows { Assert-DuId -Value ('abc'+[char]0x85) -Label 'id' } '.'
}

Test-DuCase 'process keeps arguments and child environment, streams before completion and captures exit code' {
    $dir = Get-DuTestDirectory
    $script = Join-Path $dir 'child.ps1'
    [IO.File]::WriteAllText($script, @'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
[Console]::Out.WriteLine($env:DU_SYNTHETIC_CHILD)
[Console]::Out.Flush()
Start-Sleep -Milliseconds 900
[Console]::Error.WriteLine(($args -join '|'))
exit 7
'@, (New-Object Text.UTF8Encoding($true)))
    $environment = [Environment]::GetEnvironmentVariables('Process')
    $environment['DU_SYNTHETIC_CHILD'] = 'isolated'
    $environment['TEMP']=$dir;$environment['TMP']=$dir
    $events = New-Object 'System.Collections.Generic.List[object]'
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $callback = { param($chunk,$stream) $events.Add(@{text=$chunk;stream=$stream;ms=$watch.ElapsedMilliseconds}) }.GetNewClosure()
    $result = Invoke-DuProcess -File (Get-Process -Id $PID).Path -Arguments @('-NoLogo','-NoProfile','-NonInteractive','-File',$script,'hello world','中文参数','quote"value','tail\') -Environment $environment -WorkingDirectory $dir -OnOutput $callback
    Assert-DuEqual $result.exitCode 7 'native exit code'
    Assert-DuEqual $result.stdout.Trim() 'isolated' 'child env'
    Assert-DuEqual $result.stderr.Trim() 'hello world|中文参数|quote"value|tail\' 'argv'
    Assert-DuTrue ([string]::IsNullOrEmpty($env:DU_SYNTHETIC_CHILD)) 'parent env unchanged'
    Assert-DuTrue ($events.Count -ge 2 -and $events[0].ms -lt ($watch.ElapsedMilliseconds-500)) 'live event before child completion'
}

Test-DuCase 'process bounds output and execution' {
    $dir = Get-DuTestDirectory
    $script = Join-Path $dir 'limit.ps1'
    [IO.File]::WriteAllText($script, "[Console]::Out.Write('x'*10000); Start-Sleep -Seconds 20", (New-Object Text.UTF8Encoding($true)))
    $environment = [Environment]::GetEnvironmentVariables('Process');$environment['TEMP']=$dir;$environment['TMP']=$dir
    Assert-DuThrows { Invoke-DuProcess -File (Get-Process -Id $PID).Path -Arguments @('-NoProfile','-File',$script) -Environment $environment -WorkingDirectory $dir -StdoutLimit 100 -TimeoutMs 10000 } 'bound|上限'
    Assert-DuThrows { Invoke-DuProcess -File (Get-Process -Id $PID).Path -Arguments @('-NoProfile','-Command','Start-Sleep -Seconds 20') -Environment $environment -WorkingDirectory $dir -TimeoutMs 250 } 'time|超时'
}

Test-DuCase 'UTF-8 decoder preserves characters across full byte-buffer boundaries' {
    $dir=Get-DuTestDirectory;$script=Join-Path $dir 'utf8.ps1'
    [IO.File]::WriteAllText($script,@'
$text=('a'*4093)+[char]0xd83d+[char]0xde00+('b'*4095)
$bytes=[Text.Encoding]::UTF8.GetBytes($text)
$stream=[Console]::OpenStandardOutput();$stream.Write($bytes,0,$bytes.Length);$stream.Flush()
'@,(New-Object Text.UTF8Encoding($true)))
    $environment=[Environment]::GetEnvironmentVariables('Process');$environment['TEMP']=$dir;$environment['TMP']=$dir
    $r=Invoke-DuProcess -File (Get-Process -Id $PID).Path -Arguments @('-NoProfile','-File',$script) -Environment $environment -WorkingDirectory $dir
    Assert-DuEqual $r.stdout (('a'*4093)+[char]0xd83d+[char]0xde00+('b'*4095)) 'split Unicode scalar'
}

Test-DuCase 'loading the native runtime preserves absent TEMP and TMP variables' {
    $dir=Get-DuTestDirectory;$script=Join-Path $dir 'load.ps1'
    $escaped=(Join-Path $coreRoot 'lib\Core.ps1').Replace("'","''")
    [IO.File]::WriteAllText($script,"`$ErrorActionPreference='Stop'`n. '$escaped'`nif((Test-Path Env:TEMP) -or (Test-Path Env:TMP)){exit 9}",(New-Object Text.UTF8Encoding($true)))
    $environment=[Environment]::GetEnvironmentVariables('Process');$environment.Remove('TEMP');$environment.Remove('TMP')
    $r=Invoke-DuProcess -File (Get-Process -Id $PID).Path -Arguments @('-NoProfile','-File',$script) -Environment $environment -WorkingDirectory $dir
    Assert-DuEqual $r.exitCode 0 'import must restore absent environment entries'
}

Test-DuCase 'timeout terminates an owned descendant before its delayed side effect' {
    $dir=Get-DuTestDirectory;$parent=Join-Path $dir 'parent.ps1';$child=Join-Path $dir 'descendant.ps1';$marker=Join-Path $dir 'unexpected.txt'
    $markerLiteral=$marker.Replace("'","''");$childLiteral=$child.Replace("'","''")
    [IO.File]::WriteAllText($child,"Start-Sleep -Seconds 5;[IO.File]::WriteAllText('$markerLiteral','unexpected');Start-Sleep -Seconds 20",(New-Object Text.UTF8Encoding($true)))
    $body=@'
$info=New-Object Diagnostics.ProcessStartInfo
$info.FileName=(Get-Process -Id $PID).Path
$info.Arguments='-NoLogo -NoProfile -NonInteractive -File "{CHILD}"'
$info.UseShellExecute=$false;$info.CreateNoWindow=$true
$descendant=[Diagnostics.Process]::Start($info)
[Console]::Out.WriteLine('child-started');[Console]::Out.Flush()
Start-Sleep -Seconds 20
'@
    [IO.File]::WriteAllText($parent,$body.Replace('{CHILD}',$child),(New-Object Text.UTF8Encoding($true)))
    $environment=[Environment]::GetEnvironmentVariables('Process');$environment['TEMP']=$dir;$environment['TMP']=$dir
    $observed=New-Object 'System.Collections.Generic.List[string]'
    $callback={param($chunk,$stream) $observed.Add($chunk)}.GetNewClosure()
    Assert-DuThrows { Invoke-DuProcess -File (Get-Process -Id $PID).Path -Arguments @('-NoProfile','-File',$parent) -Environment $environment -WorkingDirectory $dir -TimeoutMs 2000 -OnOutput $callback } 'timed out'
    Assert-DuTrue (($observed -join '') -match 'child-started') 'child must have started before timeout'
    [Threading.Thread]::Sleep(4000)
    Assert-DuTrue (-not [IO.File]::Exists($marker)) 'owned descendant was stopped'
}
