. (Join-Path $PSScriptRoot 'TestHarness.ps1')
. (Join-Path $PSScriptRoot '..\..\lib\Core.ps1')
. (Join-Path $PSScriptRoot '..\..\lib\Cli.ps1')
. (Join-Path $PSScriptRoot '..\..\modules\bridge.ps1')

Test-DuCase 'reader CLI normalizes fractional time boundaries and invokes one native batch' {
    $script:readCalls=0;$script:readRequests=$null
    function Resolve-DuBridgeRuntime {return @{processId=123;clientVersion='fixture'}}
    function Invoke-DuBridgeReadAgent {
        param($Runtime,$Requests,$TimeoutSeconds)
        $script:readCalls++;$script:readRequests=$Requests
        return @{success=$true;results=@(@{index=0;method='listMessages';success=$true;complete=$true;items=@();count=0})}
    }
    $r=Invoke-DuBridgeCommand @('listMessages','--cid','123','--start','1970-01-01T00:00:00.0001Z','--end','1970-01-01T00:00:00.0021Z')
    Assert-DuEqual $r.success $true
    Assert-DuEqual $script:readCalls 1
    Assert-DuEqual $script:readRequests[0].params.startMs 1
    Assert-DuEqual $script:readRequests[0].params.endMs 3
}

Test-DuCase 'batch validates every entry before attaching and rejects arbitrary RPC requests' {
    $script:readCalls=0
    function Resolve-DuBridgeRuntime {$script:readCalls++;throw 'must not attach'}
    $path=Join-Path (Get-DuTestDirectory) 'requests.json'
    [IO.File]::WriteAllText($path,'[{"method":"getConversation","params":{"cid":"123"}},{"method":"rpc","params":{"path":"/write"}}]')
    Assert-DuThrows {Invoke-DuBridgeCommand @('batch','--input',$path)}
    Assert-DuEqual $script:readCalls 0
    foreach($caseArgs in @(
        @('listHomework','--corp-id','ding-school','--class-id','12','--role','guardian'),
        @('listMessages','--cid','123','--start','2026-11-04','--end','2026-11-03'),
        @('searchGroups','--query','班级','--page-limit','0'),
        @('getConversation','--cid','cid-open'),
        @('listNotices','--corp-id','ding-school','--class-id','12','--student-id','42','--role','teacher')
    )){Assert-DuThrows {Invoke-DuBridgeCommand $caseArgs}}
    Assert-DuEqual $script:readCalls 0
}

Test-DuCase 'batch retains ordered partial receipts and calls Frida only once' {
    $script:readCalls=0
    function Resolve-DuBridgeRuntime {return @{processId=123;clientVersion='fixture'}}
    function Invoke-DuBridgeReadAgent {
        param($Runtime,$Requests,$TimeoutSeconds)
        $script:readCalls++;Assert-DuEqual $Requests.Count 2
        return @{success=$false;results=@(@{index=0;method='searchGroups';success=$false;complete=$false;items=@(@{conversationId='1'});error=@{code='PAGE_LIMIT'}},@{index=1;method='getConversation';success=$true;complete=$true;conversation=@{conversationId='123'}})}
    }
    $path=Join-Path (Get-DuTestDirectory) 'requests.json'
    [IO.File]::WriteAllText($path,'[{"method":"searchGroups","params":{"query":"班级"}},{"method":"getConversation","params":{"cid":"123"}}]',[Text.Encoding]::UTF8)
    $r=Invoke-DuBridgeCommand @('batch','--input',$path)
    Assert-DuEqual $script:readCalls 1
    Assert-DuEqual $r.success $false
    Assert-DuEqual $r.results[0].items.Count 1
    Assert-DuEqual $r.results[1].conversation.conversationId '123'
}

Test-DuCase 'bridge strips mixed-case secrets, URL query credentials and encoded JSON fields' {
    $value=@{Authorization='SECRET-A';token='SECRET-B';authToken='SECRET-F';nested=@{refreshToken='SECRET-C'};url='https://example.invalid/a?download_token=SECRET-D&size=5';payload='{"token":"SECRET-E","text":"保留正文"}'}
    $safe=ConvertTo-DuBridgeSafeValue $value
    Assert-DuTrue ((ConvertTo-DuJson $safe)-notmatch'SECRET-')
    Assert-DuTrue ($safe.url.Contains('size=5'))
    Assert-DuTrue ($safe.payload.Contains('保留正文'))
}

Test-DuCase 'ordinary media ID decodes dimensions and protected media fails before download' {
    $id='@'+[Convert]::ToBase64String([byte[]]@(0x94,0,0,100,0xcc,200)).TrimEnd('=').Replace('+','-').Replace('/','_')
    $r=ConvertTo-DuBridgeImageReference $id
    Assert-DuEqual $r.url 'https://static.dingtalk.com/media/lAAAZMzI_200_100.jpg'
    Assert-DuEqual $r.extension 'jpg'
    Assert-DuThrows {ConvertTo-DuBridgeImageReference '$protected'} 'DWS'
}

Test-DuCase 'image downloads refuse existing outputs and paths outside temp before HTTP' {
    $id='@lAAAZMzI'
    $file=Join-Path (Get-DuTestDirectory) 'existing.jpg';[IO.File]::WriteAllText($file,'preserve')
    Assert-DuThrows {Invoke-DuBridgeCommand @('downloadImage','--resource-id',$id,'--output',$file)}
    Assert-DuEqual ([IO.File]::ReadAllText($file)) 'preserve'
    Assert-DuThrows {Invoke-DuBridgeCommand @('downloadImage','--resource-id',$id,'--output','C:\outside-temp.jpg')} '.temp'
}
