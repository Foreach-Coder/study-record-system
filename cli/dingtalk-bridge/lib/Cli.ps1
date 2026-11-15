function Get-DuHelp {
@'
dingtalk-bridge - native PowerShell 5.1 / 7
进入项目目录后直接在当前 PowerShell 中运行，无需 Node.js、EXE 或 shell-init。

  .\dingtalk-bridge.ps1 bridge getMessageById --cid NATIVE_CID --message-id NATIVE_MID [--frida-command PATH]
  .\dingtalk-bridge.ps1 bridge searchGroups --query TEXT
  .\dingtalk-bridge.ps1 bridge getConversation --cid NATIVE_CID
  .\dingtalk-bridge.ps1 bridge listMessages --cid NATIVE_CID --start ISO --end ISO
  .\dingtalk-bridge.ps1 bridge getMessagesById --cid NATIVE_CID --message-ids MID1,MID2
  .\dingtalk-bridge.ps1 bridge getEducationRoles --corp-id CORP --class-id CLASS
  .\dingtalk-bridge.ps1 bridge listHomework --corp-id CORP --class-id CLASS --student-id STUDENT [--role guardian]
  .\dingtalk-bridge.ps1 bridge listHomework --corp-id CORP --class-id CLASS --role teacher
  .\dingtalk-bridge.ps1 bridge getHomework --corp-id CORP --homework-id ID
  .\dingtalk-bridge.ps1 bridge listNotices --corp-id CORP --class-id CLASS --student-id STUDENT
  .\dingtalk-bridge.ps1 bridge getNotice --corp-id CORP --notice-id ID
  .\dingtalk-bridge.ps1 bridge listGroupTodos --cid NATIVE_CID
  .\dingtalk-bridge.ps1 bridge batch --input .temp/requests.json [--timeout-seconds 60]
  .\dingtalk-bridge.ps1 bridge downloadImage --resource-id '@MEDIA_ID' [--output .temp/image.jpg]

  --page-limit N       查询页数上限，默认100，范围1..500
  --frida-command PATH 指定 Frida CLI；默认从 PATH 查找 frida
  --timeout-seconds N  bridge 读取/批量调用总预算，默认60秒，范围1..300
  --max-items N        bridge 列表/批量详情条数上限，默认10000，范围1..50000
  --page-size N        bridge 消息/群搜索每页数量，默认50；范围1..500
  --status STATUS     家长家校本/通知：ALL（默认）或 UN_HAVE_DONE
  --help / -h          显示帮助。

日期及无偏移时间按北京时间，区间为 [start,end)。
bridge 只读调用已登录钉钉客户端；须有已加载的客户端本地桥接页面。
bridge batch 的 JSON 是 [{"method":"listMessages","params":{"cid":"123","start":"2026-11-04","end":"2026-11-05"}}]。
不完整结果返回 success=false / complete=false；消息完整性仅针对客户端可见历史。
班级圈、打卡、受保护媒体等未覆盖功能不在本 CLI 范围内；bridge 不自动回退或切换账号。
临时文件全部位于当前目录 .temp/ 下。
'@
}

function Read-DuOptions {
    param([string[]]$Arguments, [string[]]$ValueNames=@(), [string[]]$SwitchNames=@(), [switch]$AllowPositionals)
    $options=@{}; $positionals=New-Object 'System.Collections.Generic.List[string]'
    for ($i=0; $i -lt $Arguments.Count; $i++) {
        $argument=$Arguments[$i]
        if (-not $argument.StartsWith('--',[StringComparison]::Ordinal)) {
            if (-not $AllowPositionals -or $argument.StartsWith('-',[StringComparison]::Ordinal)) { throw '命令参数无效；使用 --help 查看用法。' }
            $positionals.Add($argument); continue
        }
        $raw=$argument.Substring(2); $equals=$raw.IndexOf('='); $name=$raw; $value=$null
        if ($equals -ge 0) { $name=$raw.Substring(0,$equals); $value=$raw.Substring($equals+1) }
        if ($options.ContainsKey($name)) { throw '参数不可重复指定。' }
        if ($SwitchNames -ccontains $name) {
            if ($equals -ge 0) { throw '开关参数不接受赋值。' }
            $options[$name]=$true; continue
        }
        if ($ValueNames -cnotcontains $name) { throw '命令参数无效；使用 --help 查看用法。' }
        if ($equals -lt 0) {
            if ($i+1 -ge $Arguments.Count -or $Arguments[$i+1].StartsWith('--',[StringComparison]::Ordinal)) { throw '参数缺少值。' }
            $i++; $value=$Arguments[$i]
        }
        if ([string]::IsNullOrEmpty($value)) { throw '参数值不能为空。' }
        $options[$name]=$value
    }
    return @{Options=$options;Positionals=[string[]]$positionals.ToArray()}
}

function Invoke-DuCommand {
    param([string[]]$Arguments)
    foreach ($argument in $Arguments) {
        if ($argument -ceq '--state-directory' -or $argument.StartsWith('--state-directory=',[StringComparison]::Ordinal)) {
            throw '--state-directory 已移除；bridge 不保存业务状态。'
        }
    }
    if ($Arguments -ccontains '--help' -or $Arguments -ccontains '-h') { return Get-DuHelp }
    if ($Arguments.Count -eq 0) { throw '请指定 bridge；使用 --help 查看用法。' }
    $action=$Arguments[0]; $tail=@($Arguments | Select-Object -Skip 1)
    if ($action -ceq 'shell-init') { throw 'PowerShell 版本无需 shell-init；请直接运行 .\dingtalk-bridge.ps1 bridge --help。' }
    if ($action -ceq 'bridge') { return Invoke-DuBridgeCommand -Arguments $tail }
    throw '请指定 bridge；使用 --help 查看用法。'
}
