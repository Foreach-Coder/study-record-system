function Invoke-DuBridgeRead {
    param([object[]]$Requests,[string]$FridaCommand,[int]$TimeoutSeconds=60,[switch]$Batch)
    $runtime=Resolve-DuBridgeRuntime -FridaCommand $FridaCommand
    $receipt=Invoke-DuBridgeReadAgent -Runtime $runtime -Requests $Requests -TimeoutSeconds $TimeoutSeconds
    Assert-DuMap $receipt 'bridge 回执'
    $result=[ordered]@{success=$false;complete=$false;bridge='dingtalk-client';method='batch';processId=$runtime.processId;clientVersion=$runtime.clientVersion}
    if($receipt.results-isnot[array]){
        $code='TRANSPORT_ERROR'
        if($receipt.error-is[Collections.IDictionary]-and$receipt.error.code-cin@('BRIDGE_PAGE_NOT_FOUND','UNSUPPORTED_CEF','TIMEOUT','NO_CEF_BROWSER','UI_DISPATCH_FAILED','DISPATCH_FAILED')){$code=$receipt.error.code}
        $result.error=@{code=$code};$result.results=@();return $result
    }
    if($receipt.results.Count-ne$Requests.Count){throw 'bridge 批量回执数量不匹配。'}
    $success=$true
    for($i=0;$i-lt$Requests.Count;$i++){
        $row=$receipt.results[$i];Assert-DuMap $row 'bridge 结果'
        if($row.index-ne$i-or$row.method-cne$Requests[$i].method-or$row.success-isnot[bool]-or$row.complete-isnot[bool]){throw 'bridge 批量回执身份或状态不匹配。'}
        if(-not$row.success-or-not$row.complete){$success=$false}
    }
    if($Batch){$result.success=$success;$result.complete=$success;$result.results=ConvertTo-DuBridgeSafeValue $receipt.results}
    else{
        foreach($key in $receipt.results[0].Keys){if($key-cne'index'){$result[$key]=ConvertTo-DuBridgeSafeValue $receipt.results[0][$key]}}
    }
    return $result
}

function Invoke-DuBridgeCommand {
    param([string[]]$Arguments)
    if($Arguments.Count-lt1){throw '请指定 bridge 方法；使用 --help 查看用法。'}
    $method=$Arguments[0];$tail=@($Arguments|Select-Object -Skip 1)
    if($method-ceq'getMessageById'){
        $parsed=Read-DuOptions -Arguments $tail -ValueNames @('cid','message-id','frida-command')
        return Invoke-DuBridgeGetMessageById $parsed.Options
    }
    if($method-ceq'downloadImage'){
        $parsed=Read-DuOptions -Arguments $tail -ValueNames @('resource-id','output')
        return Invoke-DuBridgeDownloadImage $parsed.Options
    }
    if($method-ceq'batch'){
        $parsed=Read-DuOptions -Arguments $tail -ValueNames @('input','frida-command','timeout-seconds')
        if(-not$parsed.Options.ContainsKey('input')){throw 'batch 缺少 --input。'}
        $file=[IO.FileInfo]::new([IO.Path]::GetFullPath($parsed.Options.input))
        if(-not$file.Exists-or$file.Length-gt1048576){throw 'batch 输入不存在或超过 1 MiB。'}
        $raw=ConvertFrom-DuJson ([IO.File]::ReadAllText($file.FullName,[Text.Encoding]::UTF8))
        Assert-DuArray $raw 'batch 输入'
        if($raw.Count-lt1-or$raw.Count-gt100){throw 'batch 请求数量必须为 1..100。'}
        $requests=@(foreach($item in $raw){ConvertTo-DuBridgeRequest $item})
    }else{
        $null=Get-DuBridgeRequestFields $method
        $parsed=Read-DuOptions -Arguments $tail -ValueNames @('cid','query','start','end','message-ids','corp-id','class-id','student-id','homework-id','notice-id','role','status','page-size','page-limit','max-items','frida-command','timeout-seconds')
        $requests=@(ConvertFrom-DuBridgeOptions $method $parsed.Options)
    }
    $timeout=Get-DuBridgeInteger $parsed.Options['timeout-seconds'] 60 1 300
    return Invoke-DuBridgeRead -Requests $requests -FridaCommand $parsed.Options['frida-command'] -TimeoutSeconds $timeout -Batch:($method-ceq'batch')
}
