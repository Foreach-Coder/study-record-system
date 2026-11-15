# Project root is fixed by this file's location: <root>\modules\bridge -> <root>.
# Resolved once at load time and cached; Safety.ps1 and Media.ps1 call Get-DuBridgeRoot
# instead of recomputing, so every path in the bridge shares one derivation and never
# depends on the process CWD.
$script:DuBridgeRoot=[IO.Path]::GetFullPath((Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))

function Get-DuBridgeRoot {
    if([string]::IsNullOrEmpty($script:DuBridgeRoot)){
        $script:DuBridgeRoot=[IO.Path]::GetFullPath((Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
    }
    if([string]::IsNullOrEmpty($script:DuBridgeRoot)){throw '无法确定 bridge 项目根目录。'}
    return $script:DuBridgeRoot
}

function Resolve-DuBridgeRuntime {
    param([AllowNull()][string]$FridaCommand)
    $client=Get-DuBridgeDingTalkProcess
    $frida=Resolve-DuBridgeFridaCommand -Command $FridaCommand
    $temporary=[IO.Path]::GetFullPath((Join-Path (Get-DuBridgeRoot) '.temp\dingtalk-bridge'))
    $null=[IO.Directory]::CreateDirectory($temporary)
    return @{processId=$client.processId;clientVersion=$client.clientVersion;executable=$client.executable;frida=$frida;tempDirectory=$temporary}
}

function Invoke-DuBridgeAgent {
    param([Collections.IDictionary]$Runtime,[string]$Cid,[string]$MessageId)
    Assert-DuMap $Runtime['frida'] 'Frida command'
    $template=Resolve-DuBridgeScriptPath 'get-message-by-id.js'
    if(-not [IO.File]::Exists($template)){throw 'bridge Agent 脚本缺失。'}
    $request=ConvertTo-DuJson @{cid=$Cid;messageId=$MessageId}
    $literal=ConvertTo-DuJson $request
    $source=[IO.File]::ReadAllText($template,[Text.Encoding]::UTF8)
    if($source.IndexOf('__DU_REQUEST_JSON_STRING__',[StringComparison]::Ordinal) -lt 0){throw 'bridge Agent 模板无效。'}
    $source=$source.Replace('__DU_REQUEST_JSON_STRING__',$literal)
    $agentPath=Join-Path $Runtime['tempDirectory'] (([guid]::NewGuid().ToString('N'))+'.js')
    [IO.File]::WriteAllText($agentPath,$source,(New-Object Text.UTF8Encoding($false)))
    try {
        $arguments=@($Runtime['frida']['prefix'])+@('-q','-t','inf','-p',[string]$Runtime['processId'],'--runtime','v8','-l',$agentPath)
        return Invoke-DuBridgeFridaProcess -File $Runtime['frida']['command'] -Arguments $arguments -WorkingDirectory $Runtime['tempDirectory']
    } finally { [IO.File]::Delete($agentPath) }
}

function Invoke-DuBridgeReadAgent {
    param([Collections.IDictionary]$Runtime,[object[]]$Requests,[int]$TimeoutSeconds=60)
    $parts=foreach($name in @('core','messages','education','todos','dispatch')) {
        [IO.File]::ReadAllText((Resolve-DuBridgeScriptPath ('read\'+$name+'.js')),[Text.Encoding]::UTF8)
    }
    $requestJson=ConvertTo-DuJson $Requests
    $expression="(async()=>{`n"+($parts -join "`n")+"`nreturn JSON.stringify(await DuBridge.run("+$requestJson+','+($TimeoutSeconds*1000)+'));})()'
    $request=ConvertTo-DuJson @{readExpression=$expression;timeoutMs=($TimeoutSeconds*1000+3000)}
    $template=[IO.File]::ReadAllText((Resolve-DuBridgeScriptPath 'get-message-by-id.js'),[Text.Encoding]::UTF8)
    $source=$template.Replace('__DU_REQUEST_JSON_STRING__',(ConvertTo-DuJson $request))
    $agentPath=Join-Path $Runtime['tempDirectory'] (([guid]::NewGuid().ToString('N'))+'.js')
    [IO.File]::WriteAllText($agentPath,$source,(New-Object Text.UTF8Encoding($false)))
    try {
        $arguments=@($Runtime['frida']['prefix'])+@('-q','-t','inf','-p',[string]$Runtime['processId'],'--runtime','v8','-l',$agentPath)
        return Invoke-DuBridgeFridaProcess -File $Runtime['frida']['command'] -Arguments $arguments -WorkingDirectory $Runtime['tempDirectory'] -TimeoutMs (($TimeoutSeconds+15)*1000)
    }finally{[IO.File]::Delete($agentPath)}
}

function Resolve-DuBridgeFridaCommand {
    param([AllowNull()][string]$Command)
    $candidate=$null
    if(-not [string]::IsNullOrWhiteSpace($Command)) {
        if([IO.File]::Exists($Command)){$candidate=[IO.Path]::GetFullPath($Command)}
        else {$found=Get-Command $Command -CommandType Application,ExternalScript -ErrorAction SilentlyContinue;if($found){$candidate=$found.Source}}
    } else {
        $found=Get-Command 'frida' -CommandType Application,ExternalScript -ErrorAction SilentlyContinue
        if($found){$candidate=$found.Source}
    }
    if([string]::IsNullOrWhiteSpace($candidate)){throw '找不到 Frida CLI；请安装 frida-tools 或使用 --frida-command 指定路径。'}
    if([IO.Path]::GetExtension($candidate) -ieq '.ps1'){
        return @{command=(Get-Process -Id $PID).Path;prefix=[string[]]@('-NoLogo','-NoProfile','-NonInteractive','-File',$candidate);source=$candidate}
    }
    return @{command=$candidate;prefix=[string[]]@();source=$candidate}
}

function Get-DuBridgeDingTalkProcess {
    $matches=New-Object 'System.Collections.Generic.List[object]'
    foreach($process in @(Get-Process -Name 'DingTalk' -ErrorAction SilentlyContinue)){
        try {
            $path=$process.Path
            if([string]::IsNullOrWhiteSpace($path) -or -not [IO.File]::Exists($path)){continue}
            $names=@($process.Modules|ForEach-Object{$_.ModuleName})
            if($names -notcontains 'MainFrame.dll' -or $names -notcontains 'libcef.dll'){continue}
            $version=[Diagnostics.FileVersionInfo]::GetVersionInfo($path).FileVersion
            $matches.Add(@{processId=$process.Id;clientVersion=$version;executable=$path})
        } catch { continue }
    }
    if($matches.Count -eq 0){throw '未找到已运行并完成初始化的钉钉主进程。'}
    if($matches.Count -ne 1){throw '检测到多个钉钉主进程，无法唯一选择。'}
    $client=$matches[0]
    if(@('9.0.4.261021001','9.0.5.261029005') -notcontains $client.clientVersion){throw "当前钉钉版本 $($client.clientVersion) 尚未验证 bridge 布局。"}
    return $client
}

function ConvertTo-DuBridgeProcessArgument {
    param([AllowEmptyString()][string]$Value)
    if($null -eq $Value){$Value=''}
    return '"'+[regex]::Replace([regex]::Replace($Value,'(\\*)"','$1$1\"'),'(\\+)$','$1$1')+'"'
}

function Invoke-DuBridgeFridaProcess {
    param([string]$File,[string[]]$Arguments,[string]$WorkingDirectory,[int]$TimeoutMs=30000)
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$File
    $info.Arguments=(@($Arguments|ForEach-Object{ConvertTo-DuBridgeProcessArgument ([string]$_)}) -join ' ')
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    if($WorkingDirectory){$info.WorkingDirectory=$WorkingDirectory}
    $process=$null;$stdoutTask=$null;$stderrTask=$null;$stderr='';$encoded=$null;$watch=[Diagnostics.Stopwatch]::StartNew()
    try {
        $process=[Diagnostics.Process]::Start($info)
        if($null -eq $process){throw 'start failed'}
        $stdoutTask=$process.StandardOutput.ReadLineAsync();$stderrTask=$process.StandardError.ReadLineAsync()
        while($watch.ElapsedMilliseconds -lt $TimeoutMs){
            if($stdoutTask.IsCompleted){
                $line=$stdoutTask.GetAwaiter().GetResult()
                if($null -ne $line){
                    if($line.StartsWith('DU_BRIDGE_RESULT:',[StringComparison]::Ordinal)){$encoded=$line.Substring(17);break}
                    $stdoutTask=$process.StandardOutput.ReadLineAsync()
                } elseif($process.HasExited){break}
            }
            if($stderrTask.IsCompleted){
                $line=$stderrTask.GetAwaiter().GetResult()
                if($null -ne $line){
                    if($stderr.Length+$line.Length -gt 65536){throw 'stderr bound'}
                    $stderr+=$line+"`n";$stderrTask=$process.StandardError.ReadLineAsync()
                }
            }
            if($process.HasExited -and $stdoutTask.IsCompleted){break}
            [Threading.Thread]::Sleep(15)
        }
        if(-not $encoded){throw 'result missing'}
        if(-not $process.HasExited) {
            try {
                $process.StandardInput.WriteLine('exit')
                $process.StandardInput.Flush()
                $process.StandardInput.Close()
                $null=$process.WaitForExit(5000)
            } catch {}
        }
        try{$bytes=[Convert]::FromBase64String($encoded);if($bytes.Length -gt 67108864){throw 'bound'};$json=(New-Object Text.UTF8Encoding($false,$true)).GetString($bytes)}catch{throw 'invalid result encoding'}
        $receipt=ConvertFrom-DuJson -Text $json
        Assert-DuMap $receipt 'Frida bridge 回执'
        return $receipt
    } catch {
        throw 'Frida bridge 调用失败、超时或返回无效结果。'
    } finally {
        if($null -ne $process){
            try{if(-not $process.HasExited){$process.Kill()}}catch{}
            try{$null=$process.WaitForExit(5000)}catch{}
            $process.Dispose()
        }
    }
}

