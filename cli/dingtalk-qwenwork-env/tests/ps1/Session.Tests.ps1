# Session layer tests. Pester 3.4 compatible (Windows PowerShell 5.1 only).
# They use synthetic contexts and never call Python or the DWS core.
# NOTE: the Constant-alias case runs last, because a Constant alias cannot be
# removed again inside the same process.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent (Split-Path -Parent $here)
. (Join-Path $root 'lib\Session.ps1')

$managedRegex = '^(?:DWS_|DINGTALK_DWS_|DINGTALK_UTILS_|DINGTALK_QWEN_|QWORK_|QODER_|QODERCN_|QODERWORK_|QWENWORK_|QWEN_|QW_)|^(?:NODE_OPTIONS|ELECTRON_RUN_AS_NODE|TEMP|TMP)$'

function New-TestContext {
    param(
        [string]$Mode = 'qwenwork',
        [string]$EnvName = 'test-env',
        [hashtable]$Env = @{ DWS_CONFIG_DIR = 'C:\tmp\cfg'; DINGTALK_QWEN_ENV_NAME = 'test-env' }
    )
    [pscustomobject]@{
        success   = $true
        mode      = $Mode
        envName   = $EnvName
        directory = 'C:\Users\Public\.dingtalk-utils\test-env'
        corePath  = 'C:\Windows\System32\cmd.exe'
        env       = [pscustomobject]$Env
    }
}

function Reset-SessionState {
    foreach ($name in @([Environment]::GetEnvironmentVariables('Process').Keys)) {
        if ($name -match $managedRegex) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
    }
    Remove-Item -LiteralPath Alias:dws -Force -ErrorAction SilentlyContinue
    Remove-Variable -Name __DingtalkQwenAliasState -Scope Global -ErrorAction SilentlyContinue
}

Describe 'qwen env session layer' {
    BeforeEach { Reset-SessionState }
    AfterEach { Reset-SessionState }

    It 'applies the dws alias and managed variables' {
        $context = New-TestContext
        Set-DuQwenSessionEnvironment -Context $context
        (Get-Alias -Name dws -Scope Global).Definition | Should Be $context.corePath
        $env:DWS_CONFIG_DIR | Should Be 'C:\tmp\cfg'
        $env:DINGTALK_QWEN_ENV_NAME | Should Be 'test-env'
        (Get-Variable -Name __DingtalkQwenAliasState -Scope Global -ErrorAction SilentlyContinue) | Should Not BeNullOrEmpty
    }

    It 'restores the original alias and clears variables on --default' {
        Set-Alias -Name dws -Value 'cmd.exe' -Scope Global -Option None
        Set-DuQwenSessionEnvironment -Context (New-TestContext)
        Set-DuQwenSessionEnvironment -Context (New-TestContext -Mode 'default' -EnvName $null -Env @{})
        (Get-Alias -Name dws -Scope Global).Definition | Should Be 'cmd.exe'
        [string]::IsNullOrEmpty($env:DWS_CONFIG_DIR) | Should Be $true
    }

    It 'keeps the original snapshot when switching between environments' {
        Set-Alias -Name dws -Value 'cmd.exe' -Scope Global -Option None
        Set-DuQwenSessionEnvironment -Context (New-TestContext -EnvName 'first')
        Set-DuQwenSessionEnvironment -Context (New-TestContext -EnvName 'second' -Env @{ DWS_CONFIG_DIR = 'C:\tmp\cfg2'; DINGTALK_QWEN_ENV_NAME = 'second' })
        $state = (Get-Variable -Name __DingtalkQwenAliasState -Scope Global).Value
        $state.OriginalAlias.Definition | Should Be 'cmd.exe'
        $env:DINGTALK_QWEN_ENV_NAME | Should Be 'second'
    }

    It 'rolls back when applying the environment fails midway' {
        Set-Alias -Name dws -Value 'cmd.exe' -Scope Global -Option None
        $broken = @{}
        $broken['DWS_CONFIG_DIR'] = 'C:\tmp\cfg'
        $broken[''] = 'x'
        { Set-DuQwenSessionEnvironment -Context (New-TestContext -Env $broken) } | Should Throw
        (Get-Alias -Name dws -Scope Global).Definition | Should Be 'cmd.exe'
        [string]::IsNullOrEmpty($env:DWS_CONFIG_DIR) | Should Be $true
        (Get-Variable -Name __DingtalkQwenAliasState -Scope Global -ErrorAction SilentlyContinue) | Should BeNullOrEmpty
    }

    It 'rejects a Constant dws alias without touching the environment' {
        Set-Alias -Name dws -Value 'cmd.exe' -Scope Global -Option Constant
        { Set-DuQwenSessionEnvironment -Context (New-TestContext) } | Should Throw
        (Get-Alias -Name dws -Scope Global).Definition | Should Be 'cmd.exe'
        [string]::IsNullOrEmpty($env:DWS_CONFIG_DIR) | Should Be $true
    }
}
