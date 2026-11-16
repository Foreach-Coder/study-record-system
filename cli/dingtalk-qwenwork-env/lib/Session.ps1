# Session layer: owns the caller's PowerShell session (dws alias + managed env vars).
# Everything else lives in Python; this file only applies and restores a context document.

$script:DuQwenManagedPattern = '^(?:DWS_|DINGTALK_DWS_|QWORK_|QODER_|QODERCN_|QODERWORK_|QWENWORK_|QWEN_|QW_)|^(?:NODE_OPTIONS|ELECTRON_RUN_AS_NODE|TEMP|TMP|DINGTALK_QWEN_ENV_NAME|DINGTALK_QWEN_DWS_COMMAND)$'
$script:DuQwenAliasState = '__DingtalkQwenAliasState'

function Write-DuQwenError {
    param([string]$Code, [string]$Message)
    $payload = @{ success = $false; errorCode = $Code; error = $Message }
    [Console]::Out.WriteLine(($payload | ConvertTo-Json -Compress))
    [Console]::Error.WriteLine('错误：' + $Message)
    return 1
}

function Invoke-DuQwenActive {
    param([string[]]$Arguments)
    # TODO(task 8): resolve context through `python -m qwen_env context`, then apply it.
    return (Write-DuQwenError -Code 'not_implemented' -Message 'active 尚未实现（任务 8）。')
}