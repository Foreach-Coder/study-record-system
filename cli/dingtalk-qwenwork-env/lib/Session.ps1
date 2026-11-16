function Get-DuQwenAliasSnapshot {
    $alias = Get-Alias -Name dws -Scope Global -ErrorAction SilentlyContinue
    if ($null -eq $alias) { return $null }
    return @{ Definition = $alias.Definition; Options = $alias.Options; Description = $alias.Description }
}

function Restore-DuQwenAlias {
    param($Snapshot)
    if ($null -ne $Snapshot) {
        Set-Alias -Name dws -Value $Snapshot.Definition -Scope Global -Option $Snapshot.Options -Description $Snapshot.Description -Force -ErrorAction Stop
    } elseif ($null -ne (Get-Alias -Name dws -Scope Global -ErrorAction SilentlyContinue)) {
        Remove-Item -LiteralPath Alias:dws -Force -ErrorAction Stop
    }
}

function Get-DuQwenPython {
    <#
    .SYNOPSIS
    Returns @(exe, prefix...) for the python interpreter.
    Prefers a real python.exe over the py launcher: py.exe swallows an
    argument when invoked with a splatted single-element prefix.
    #>
    if ($env:DINGTALK_QWEN_PYTHON) {
        if (-not (Test-Path -LiteralPath $env:DINGTALK_QWEN_PYTHON)) { throw "DINGTALK_QWEN_PYTHON 指向的文件不存在：$env:DINGTALK_QWEN_PYTHON" }
        return @($env:DINGTALK_QWEN_PYTHON)
    }
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python -and $python.Source) { return @($python.Source) }
    $launcher = Get-Command py -ErrorAction SilentlyContinue
    if ($launcher -and $launcher.Source) { return @($launcher.Source, '-3') }
    throw "找不到 Python。请安装 Python 3 或设置 DINGTALK_QWEN_PYTHON。"
}

function Get-DuQwenContext {
    param([string[]]$ContextArguments)
    # @() wrapper is required: a one-element return unwraps to a string, and
    # indexing that string would yield its first character ("D").
    $python = @(Get-DuQwenPython)
    if ($python.Count -eq 0 -or -not $python[0]) { throw 'python_not_found' }
    $exe = $python[0]
    $prefix = if ($python.Count -gt 1) { @($python[1..($python.Count - 1)]) } else { @() }
    $root = if ($env:DINGTALK_QWEN_HOME) { $env:DINGTALK_QWEN_HOME } else { Split-Path -Parent $PSScriptRoot }
    $callArguments = @('-m', 'qwen_env', 'context') + @($ContextArguments)
    $oldPythonPath = $env:PYTHONPATH
    $env:PYTHONPATH = if ($oldPythonPath) { $root + [IO.Path]::PathSeparator + $oldPythonPath } else { $root }
    try {
        $raw = & $exe @prefix @callArguments 2>&1
        $code = $LASTEXITCODE
    } finally {
        if ($null -eq $oldPythonPath) { Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue } else { $env:PYTHONPATH = $oldPythonPath }
    }
    $text = ((@($raw) | ForEach-Object { "$_" }) -join "`n").Trim()
    if (-not $text) { throw "无法读取环境上下文（退出码 $code）。" }
    try { return $text | ConvertFrom-Json } catch { throw "环境上下文不是合法 JSON：$text" }
}

function Set-DuQwenSessionEnvironment {
    param($Context)
    $stateName = '__DingtalkQwenAliasState'
    $variable = Get-Variable -Name $stateName -Scope Global -ErrorAction SilentlyContinue
    $state = if ($null -ne $variable) { $variable.Value } else { $null }
    $aliasBefore = Get-DuQwenAliasSnapshot
    if ($null -ne $aliasBefore -and ($aliasBefore.Options -band [Management.Automation.ScopedItemOptions]::Constant)) {
        throw 'dws 是不可更改的 Constant 别名，当前环境未改变。'
    }
    $before = [Environment]::GetEnvironmentVariables('Process')
    $managed = '^(?:DWS_|DINGTALK_DWS_|DINGTALK_UTILS_|DINGTALK_QWEN_|QWORK_|QODER_|QODERCN_|QODERWORK_|QWENWORK_|QWEN_|QW_)|^(?:NODE_OPTIONS|ELECTRON_RUN_AS_NODE|TEMP|TMP)$'
    try {
        if ($Context.mode -eq 'qwenwork') {
            $options = if ($null -ne $aliasBefore) { $aliasBefore.Options } else { [Management.Automation.ScopedItemOptions]::None }
            Set-Alias dws $Context.corePath -Scope Global -Option $options -Description 'dingtalk-qwenwork-env 当前环境' -Force -ErrorAction Stop
        } elseif ($null -ne $state) {
            Restore-DuQwenAlias $state.OriginalAlias
        }
        foreach ($name in @($before.Keys)) { if ($name -match $managed) { Remove-Item -LiteralPath ('Env:' + $name) -ErrorAction Stop } }
        foreach ($name in $Context.env.PSObject.Properties.Name) {
            if ($name -match $managed) { [Environment]::SetEnvironmentVariable($name, [string]$Context.env.$name, 'Process') }
        }
        if ($Context.mode -eq 'qwenwork' -and $null -eq $state) {
            Set-Variable -Name $stateName -Scope Global -Value @{ OriginalAlias = $aliasBefore } -ErrorAction Stop
        } elseif ($Context.mode -eq 'default' -and $null -ne $state) {
            Remove-Variable -Name $stateName -Scope Global -ErrorAction Stop
        }
    } catch {
        foreach ($name in @([Environment]::GetEnvironmentVariables('Process').Keys)) { if ($name -match $managed) { Remove-Item -LiteralPath ('Env:' + $name) -ErrorAction SilentlyContinue } }
        foreach ($name in $before.Keys) { if ($name -match $managed) { [Environment]::SetEnvironmentVariable($name, [string]$before[$name], 'Process') } }
        Restore-DuQwenAlias $aliasBefore
        throw '无法应用会话环境，原环境已恢复。'
    }
}

function Invoke-DuQwenActive {
    param([string[]]$Arguments)
    $name = $null
    $default = $false
    $contextArguments = New-Object 'System.Collections.Generic.List[string]'
    $index = 0
    while ($index -lt $Arguments.Count) {
        $item = $Arguments[$index]
        if ($item -ceq '--default') { $default = $true; $index++; continue }
        if ($item -ceq '--dws-command') {
            if ($index + 1 -ge $Arguments.Count) { throw '--dws-command 缺少取值。' }
            $contextArguments.Add('--dws-command'); $contextArguments.Add($Arguments[$index + 1]); $index += 2; continue
        }
        if ($item.StartsWith('-')) { throw "未知选项：$item" }
        if ($null -ne $name) { throw '只能指定一个环境名。' }
        $name = $item
        $index++
    }
    if ($default) {
        if ($null -ne $name) { throw '--default 不能与环境名同时使用。' }
    } else {
        if ($null -eq $name) { throw '请提供环境名，或使用 --default。' }
        $contextArguments.Insert(0, $name)
    }
    $context = Get-DuQwenContext -ContextArguments $contextArguments.ToArray()
    if ($context.success -ne $true) { throw "... $($context.error)" }
    Set-DuQwenSessionEnvironment -Context $context
    $alias = Get-Alias -Name dws -Scope Global -ErrorAction SilentlyContinue
    $summary = [ordered]@{
        success = $true
        mode = $context.mode
        envName = $context.envName
        directory = $context.directory
        corePath = $context.corePath
        dwsAlias = if ($null -ne $alias) { $alias.Definition } else { $null }
    }
    [pscustomobject]$summary | ConvertTo-Json -Compress
}
