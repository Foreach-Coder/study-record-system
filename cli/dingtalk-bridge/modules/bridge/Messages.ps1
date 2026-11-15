function Invoke-DuBridgeGetMessageById {
    param([Collections.IDictionary]$Options)
    foreach($key in @('cid','message-id')) {
        if(-not $Options.Contains($key)) { throw "缺少 --$key。" }
    }
    $cid=$Options['cid'];$messageId=$Options['message-id']
    Assert-DuBridgeNativeId $cid 'cid'
    Assert-DuBridgeNativeId $messageId 'message-id'
    $fridaCommand=$null;if($Options.Contains('frida-command')){$fridaCommand=$Options['frida-command']}
    $runtime=Resolve-DuBridgeRuntime -FridaCommand $fridaCommand
    Assert-DuMap $runtime 'bridge runtime'
    $receipt=Invoke-DuBridgeAgent -Runtime $runtime -Cid $cid -MessageId $messageId
    Assert-DuMap $receipt 'bridge 回执'
    if($receipt['success'] -isnot [bool] -or -not $receipt['success']) {
        $code=$null
        if($receipt.Contains('error') -and $receipt['error'] -is [System.Collections.IDictionary]){$code=[string]$receipt['error']['code']}
        switch($code) {
            'BRIDGE_PAGE_NOT_FOUND' { throw '钉钉已运行，但未找到已加载且提供消息桥接的本地页面；空白页不能承载此调用。' }
            'UNSUPPORTED_CEF' { throw '当前钉钉内置 CEF 版本尚未通过 bridge 布局验证。' }
            'TIMEOUT' { throw '钉钉 bridge 等待客户端回执超时。' }
            default { throw '钉钉 bridge 未返回成功结果。' }
        }
    }
    Assert-DuMap $receipt['message'] 'bridge 消息'
    Assert-DuMap $receipt['message']['baseMessage'] 'bridge baseMessage'
    $base=$receipt['message']['baseMessage']
    if([string]$base['conversationId'] -cne $cid -or [string]$base['messageId'] -cne $messageId) { throw '钉钉 bridge 返回了不匹配的消息。' }
    return [ordered]@{
        success=$true
        bridge='dingtalk-client'
        method='getMessageById'
        processId=$runtime['processId']
        clientVersion=$runtime['clientVersion']
        message=(ConvertTo-DuBridgeSafeValue $receipt['message'])
    }
}

