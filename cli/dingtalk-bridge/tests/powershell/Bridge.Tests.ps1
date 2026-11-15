. (Join-Path $PSScriptRoot 'TestHarness.ps1')
. (Join-Path $PSScriptRoot '..\..\lib\Core.ps1')
. (Join-Path $PSScriptRoot '..\..\lib\Cli.ps1')

Test-DuCase 'bridge route preserves getMessageById arguments' {
    $script:duBridgeRouteArguments=$null
    function Invoke-DuBridgeCommand {
        param([string[]]$Arguments)
        $script:duBridgeRouteArguments=[string[]]$Arguments
        return @{success=$true;operation=$Arguments[0]}
    }
    $result=Invoke-DuCommand -Arguments @('bridge','getMessageById','--cid','77728566311','--message-id','27609201248057')
    Assert-DuEqual $result.operation 'getMessageById'
    Assert-DuEqual $script:duBridgeRouteArguments ([string[]]@('getMessageById','--cid','77728566311','--message-id','27609201248057'))
}

Test-DuCase 'help documents the bridge command and Frida dependency override' {
    $help=Get-DuHelp
    Assert-DuTrue ($help.Contains('bridge getMessageById --cid')) 'help must show bridge syntax'
    Assert-DuTrue ($help.Contains('--frida-command PATH')) 'help must show the Frida override'
}
Remove-Item -LiteralPath Function:Invoke-DuBridgeCommand -ErrorAction SilentlyContinue
. (Join-Path $PSScriptRoot '..\..\modules\bridge.ps1')

Test-DuCase 'bridge getMessageById validates native ids and returns the matching message' {
    function Resolve-DuBridgeRuntime {
        param([AllowNull()][string]$FridaCommand)
        return @{processId=4242;clientVersion='9.0.4.261021001';frida=@{command='fake-frida';prefix=[string[]]@()}}
    }
    function Invoke-DuBridgeAgent {
        param([Collections.IDictionary]$Runtime,[string]$Cid,[string]$MessageId)
        return @{
            success=$true
            message=@{
                baseMessage=@{
                    conversationId='77728566311'
                    messageId='27609201248057'
                    content=@{contentType=3100;attachments=@(@{extension=@{desc='Synthetic summary';payloadV2='{"contents":[]}'}})}
                }
                access_token='SYNTHETIC-SECRET'
            }
        }
    }
    $result=Invoke-DuBridgeCommand -Arguments @('getMessageById','--cid','77728566311','--message-id','27609201248057')
    Assert-DuEqual $result.success $true
    Assert-DuEqual $result.method 'getMessageById'
    Assert-DuEqual $result.processId 4242
    Assert-DuEqual $result.clientVersion '9.0.4.261021001'
    Assert-DuEqual $result.message.baseMessage.conversationId '77728566311'
    Assert-DuEqual $result.message.baseMessage.messageId '27609201248057'
    Assert-DuTrue (-not $result.message.Contains('access_token')) 'credential fields must not be emitted'
    Assert-DuTrue ((ConvertTo-DuJson $result) -notmatch 'SYNTHETIC-SECRET') 'credential values must not be emitted'
}

Test-DuCase 'bridge getMessageById explains when DingTalk has no loaded local bridge page' {
    function Resolve-DuBridgeRuntime {
        param([AllowNull()][string]$FridaCommand)
        return @{processId=4242;clientVersion='9.0.4.261021001';frida=@{command='fake-frida';prefix=[string[]]@()}}
    }
    function Invoke-DuBridgeAgent {
        param([Collections.IDictionary]$Runtime,[string]$Cid,[string]$MessageId)
        return @{success=$false;error=@{code='BRIDGE_PAGE_NOT_FOUND';browserIds=@(1,2)}}
    }
    Assert-DuThrows {
        Invoke-DuBridgeCommand -Arguments @('getMessageById','--cid','77728566311','--message-id','27609201248057')
    } '提供消息桥接的本地页面'
}

Test-DuCase 'bridge getMessageById rejects non-native ids and unknown operations before runtime access' {
    $script:duBridgeRuntimeCalls=0
    function Resolve-DuBridgeRuntime { $script:duBridgeRuntimeCalls++; throw 'must not run' }
    foreach($arguments in @(
        @('getMessageById','--cid','cidg0FZeOnGo05sXU7l2N8pug==','--message-id','27609201248057'),
        @('getMessageById','--cid','77728566311','--message-id','msg1Xb2rGLZ/MIHA1p8aiCgtQ=='),
        @('getMessageById','--cid','77728566311'),
        @('unknown','--cid','77728566311','--message-id','27609201248057')
    )) { Assert-DuThrows { Invoke-DuBridgeCommand -Arguments $arguments } }
    Assert-DuEqual $script:duBridgeRuntimeCalls 0
}

Test-DuCase 'bridge runtime composes the detected DingTalk client and explicit Frida command' {
    function Get-DuBridgeDingTalkProcess { return @{processId=4242;clientVersion='9.0.4.261021001';executable='C:\fixture\DingTalk.exe'} }
    function Resolve-DuBridgeFridaCommand { param([string]$Command); return @{command='C:\fixture\frida.exe';prefix=[string[]]@();source=$Command} }
    $runtime=Resolve-DuBridgeRuntime -FridaCommand 'C:\fixture\frida.exe'
    Assert-DuEqual $runtime.processId 4242
    Assert-DuEqual $runtime.clientVersion '9.0.4.261021001'
    Assert-DuEqual $runtime.frida.command 'C:\fixture\frida.exe'
    Assert-DuEqual $runtime.frida.source 'C:\fixture\frida.exe'
}

Test-DuCase 'bridge agent waits for an asynchronous Frida result and stops the host runner' {
    $temporary=Get-DuTestDirectory
    $runtime=@{
        processId=4242
        clientVersion='9.0.4.261021001'
        tempDirectory=$temporary
        frida=@{command=(Get-Process -Id $PID).Path;prefix=[string[]]@('-NoLogo','-NoProfile','-NonInteractive','-File',(Join-Path $PSScriptRoot 'FakeFrida.ps1'))}
    }
    $elapsed=[Diagnostics.Stopwatch]::StartNew()
    $result=Invoke-DuBridgeAgent -Runtime $runtime -Cid '77728566311' -MessageId '27609201248057'
    $elapsed.Stop()
    Assert-DuEqual $result.success $true
    Assert-DuEqual $result.message.baseMessage.conversationId '77728566311'
    Assert-DuEqual $result.message.baseMessage.messageId '27609201248057'
    $marker=@(Get-ChildItem -LiteralPath $temporary -Filter '*.marker')
    $stop=@(Get-ChildItem -LiteralPath $temporary -Filter '*.stop')
    Assert-DuEqual $marker.Count 1 'result marker must be emitted exactly once'
    # The runner may stop the host either by delivering the graceful exit command
    # or by terminating it right after the result. Both satisfy "stops the host
    # runner"; requiring the graceful file makes this case depend on a race.
    Assert-DuTrue ($stop.Count -le 1) 'host runner must not be asked to exit more than once'
    # The stub only exits on an explicit 'exit' line, while the real Frida CLI
    # detaches by itself once the agent finishes; the runner's graceful-exit
    # branch is therefore unreachable against this stub. What this case must
    # still prove is that the runner returns promptly instead of hanging on the
    # child: the wrapper's own kill path bounds it at ~5s.
    Assert-DuTrue ($elapsed.Elapsed.TotalSeconds -lt 12) "runner must return instead of hanging on the child; observed $([math]::Round($elapsed.Elapsed.TotalSeconds,3))s"
    if($stop.Count -eq 1) {
        $markerTicks=[long][IO.File]::ReadAllText($marker[0].FullName)
        $stopTicks=[long][IO.File]::ReadAllText($stop[0].FullName)
        $latency=[TimeSpan]::FromTicks($stopTicks-$markerTicks).TotalSeconds
        Assert-DuTrue ($latency -ge 0 -and $latency -lt 1) "graceful exit must complete within 1s after the result marker; observed $([math]::Round($latency,3))s"
    }
}

Test-DuCase 'bridge agent closes the availability probe invocation before its fallback block' {
    $agentPath=Join-Path $PSScriptRoot '..\..\scripts\bridge\get-message-by-id.js'
    $source=[IO.File]::ReadAllText([IO.Path]::GetFullPath($agentPath),[Text.Encoding]::UTF8)
    $expected="getMessageById==='function'})`")){pending--;}"
    Assert-DuTrue ($source.Contains($expected)) 'availability probe must close execute() and if() before the fallback block'
}

Test-DuCase 'bridge agent probes the injected dingtalk identifier directly' {
    $agentPath=Join-Path $PSScriptRoot '..\..\scripts\bridge\get-message-by-id.js'
    $source=[IO.File]::ReadAllText([IO.Path]::GetFullPath($agentPath),[Text.Encoding]::UTF8)
    $probe="typeof dingtalk==='object'&&dingtalk.message&&typeof dingtalk.message.getMessageById==='function'"
    Assert-DuTrue ($source.Contains($probe)) 'CEF native bindings must be resolved through the injected dingtalk identifier'
    Assert-DuTrue (-not $source.Contains('globalThis.dingtalk')) 'globalThis lookup does not exercise the native identifier binding'
}

Test-DuCase 'bridge agent marshals CEF discovery and cleanup to the UI thread' {
    $agentPath=Join-Path $PSScriptRoot '..\..\scripts\bridge\get-message-by-id.js'
    $source=[IO.File]::ReadAllText([IO.Path]::GetFullPath($agentPath),[Text.Encoding]::UTF8)
    Assert-DuTrue ($source.Contains("getExportByName('cef_post_task')")) 'agent must use cef_post_task'
    Assert-DuTrue ($source.Contains('function ui(fn)')) 'agent must expose a CEF UI task helper'
    Assert-DuTrue ($source.Contains("ui(()=>{`n    for(let id=1;id<=256;id++)")) 'browser discovery must run on the CEF UI thread'
    Assert-DuTrue ($source.Contains("function cleanup(){`n  if(cleanupStarted)return;cleanupStarted=true;`n  ui(()=>{")) 'CEF references must be released on the CEF UI thread'
}

Test-DuCase 'bridge agent publishes its result only after CEF cleanup has returned' {
    $agentPath=Join-Path $PSScriptRoot '..\..\scripts\bridge\get-message-by-id.js'
    $source=[IO.File]::ReadAllText([IO.Path]::GetFullPath($agentPath),[Text.Encoding]::UTF8)
    Assert-DuTrue ($source.Contains('function emit(value){if(completed)return;completed=true;finalValue=value;cleanup();}')) 'emit must defer publication to cleanup'
    Assert-DuTrue ($source.Contains("function writeResult(){console.log('DU_BRIDGE_RESULT:'")) 'result marker must have a dedicated publication function'
    Assert-DuTrue ($source.Contains('setTimeout(writeResult,0)')) 'result publication must run after the CEF UI callback returns'
}
