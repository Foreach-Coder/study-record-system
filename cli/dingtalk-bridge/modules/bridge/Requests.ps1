function Get-DuBridgeRequestFields {
    param([string]$Method)
    switch -CaseSensitive ($Method) {
        'searchGroups' {return @('query','pageSize','pageLimit','maxItems')}
        'getConversation' {return @('cid')}
        'listMessages' {return @('cid','start','end','pageSize','pageLimit','maxItems')}
        'getMessageById' {return @('cid','messageId')}
        'getMessagesById' {return @('cid','messageIds','maxItems')}
        'getEducationRoles' {return @('corpId','classId')}
        'listHomework' {return @('corpId','classId','studentId','role','status','pageLimit','maxItems')}
        'getHomework' {return @('corpId','classId','studentId','homeworkId')}
        'listNotices' {return @('corpId','classId','studentId','status','pageLimit','maxItems')}
        'getNotice' {return @('corpId','classId','studentId','noticeId')}
        'listGroupTodos' {return @('cid','pageLimit','maxItems')}
        default {throw '未覆盖的 bridge 方法；请使用现有 DWS 命令。'}
    }
}

function Get-DuBridgeInteger {
    param($Value,[int]$Default,[int]$Minimum,[int]$Maximum)
    if($null-eq$Value){return $Default}
    $number=0
    if(([string]$Value)-cnotmatch'\A[0-9]+\z' -or -not[int]::TryParse([string]$Value,[ref]$number) -or $number-lt$Minimum -or $number-gt$Maximum){throw 'bridge 数值参数超出允许范围。'}
    return $number
}

function ConvertTo-DuBridgeRequest {
    param($Request)
    Assert-DuMap $Request 'bridge 请求'
    foreach($key in $Request.Keys){if($key-cnotin@('method','params')){throw 'bridge 请求只接受 method 和 params。'}}
    if($Request.method-isnot[string]){throw 'bridge method 必须是字符串。'}
    $method=$Request.method;$fields=@(Get-DuBridgeRequestFields $method)
    Assert-DuMap $Request.params 'bridge params'
    $p=@{}
    foreach($key in $Request.params.Keys){if($fields-cnotcontains$key){throw 'bridge params 含不支持的字段。'};$p[$key]=$Request.params[$key]}
    if($fields-contains'cid'){Assert-DuBridgeNativeId $p.cid 'cid'}
    if($fields-contains'corpId'){
        if($p.corpId-isnot[string]-or$p.corpId-cnotmatch'\Ading[A-Za-z0-9_-]{1,100}\z'){throw 'corpId 格式无效。'}
    }
    foreach($key in @('classId','studentId','messageId','homeworkId','noticeId')){
        if($p.ContainsKey($key)){Assert-DuBridgeNativeId $p[$key] $key}
    }
    $required=switch -CaseSensitive ($method){
        'getMessageById' {@('messageId')}
        'getHomework' {@('homeworkId')}
        'getNotice' {@('noticeId')}
        'getEducationRoles' {@('classId')}
        'listHomework' {@('classId')}
        'listNotices' {@('classId','studentId')}
        default {@()}
    }
    foreach($key in $required){if(-not$p.ContainsKey($key)){throw "bridge 缺少 $key。"}}
    if($p.ContainsKey('classId') -and [decimal]$p.classId-gt9007199254740991){throw 'classId 超过客户端精确整数范围。'}
    if($fields-contains'pageLimit'){$p.pageLimit=Get-DuBridgeInteger $p.pageLimit 100 1 500}
    if($fields-contains'maxItems'){$p.maxItems=Get-DuBridgeInteger $p.maxItems 10000 1 50000}
    if($fields-contains'pageSize'){$p.pageSize=Get-DuBridgeInteger $p.pageSize 50 1 500}
    if($method-ceq'searchGroups'){
        if($p.query-isnot[string]-or[string]::IsNullOrWhiteSpace($p.query)-or$p.query.Length-gt200){throw 'query 必须是 1..200 字符的群名。'}
    }
    if($method-ceq'listMessages'){
        $start=ConvertTo-DuTime $p.start;$end=ConvertTo-DuTime $p.end
        if($end-le$start){throw 'end 必须晚于 start。'}
        $epoch=[datetime]::SpecifyKind([datetime]'1970-01-01',[DateTimeKind]::Utc).Ticks
        $p.startMs=[long][Math]::Ceiling(([decimal]$start.UtcTicks-$epoch)/10000)
        $p.endMs=[long][Math]::Ceiling(([decimal]$end.UtcTicks-$epoch)/10000)
        if($p.startMs-lt0){throw '时间不能早于 1970-01-01 UTC。'}
        $p.Remove('start');$p.Remove('end')
    }
    if($method-ceq'getMessagesById'){
        Assert-DuArray $p.messageIds 'messageIds'
        if($p.messageIds.Count-lt1-or$p.messageIds.Count-gt1000){throw 'messageIds 数量必须为 1..1000。'}
        foreach($id in $p.messageIds){Assert-DuBridgeNativeId $id 'messageIds'}
    }
    if($method-ceq'listHomework'){
        if(-not$p.ContainsKey('role')){$p.role='guardian'}
        if($p.role-cnotin@('guardian','teacher')){throw 'role 仅支持 guardian 或 teacher。'}
        if($p.role-ceq'guardian'-and-not$p.ContainsKey('studentId')){throw '家长读取必须指定 studentId。'}
        if($p.role-ceq'teacher'-and$p.ContainsKey('studentId')){throw '教师列表不接受 studentId。'}
    }
    if($fields-contains'status'){
        if(-not$p.ContainsKey('status')){$p.status='ALL'}
        if($p.status-cnotin@('ALL','UN_HAVE_DONE')){throw 'status 仅支持 ALL 或 UN_HAVE_DONE。'}
        if($p.role-ceq'teacher'-and$p.status-cne'ALL'){throw '教师列表当前仅验证 ALL；其他状态请用 DWS。'}
    }
    return @{method=$method;params=$p}
}

function ConvertFrom-DuBridgeOptions {
    param([string]$Method,[Collections.IDictionary]$Options)
    $names=@{cid='cid';query='query';start='start';end='end';'message-id'='messageId';'message-ids'='messageIds';'corp-id'='corpId';'class-id'='classId';'student-id'='studentId';'homework-id'='homeworkId';'notice-id'='noticeId';role='role';status='status';'page-size'='pageSize';'page-limit'='pageLimit';'max-items'='maxItems'}
    $p=@{}
    foreach($key in $Options.Keys){
        if($key-cin@('frida-command','timeout-seconds')){continue}
        if(-not$names.ContainsKey($key)){throw 'bridge 参数无效。'}
        if($key-ceq'message-ids'){$p.messageIds=[string[]]@($Options[$key].Split(',')|ForEach-Object{$_.Trim()})}
        else{$p[$names[$key]]=$Options[$key]}
    }
    return ConvertTo-DuBridgeRequest @{method=$Method;params=$p}
}
