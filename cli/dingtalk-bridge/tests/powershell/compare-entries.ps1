#requires -Version 5.1
<#
.SYNOPSIS
    Equivalence harness for the DingTalk bridge split.

.DESCRIPTION
    Runs the same 11 read-only bridge cases against two CLI entries and compares
    their JSON payloads after normalizing only the fields that are allowed to
    change between two runs of the very same entry.

    The comparison is deliberately payload-centric: the bridge contract is the
    JSON document on stdout, not the wording of stderr. Exit codes are still
    enforced (a command failing in either entry fails the case), but stderr text
    is copied into the report for diagnosis only and is never diffed.

    Exits 1 when any case differs or any command fails in either entry, so this
    script can be used directly as the RED/GREEN gate of the migration.

    PowerShell 5.1 compatible. File encoding: UTF-8 with BOM.

.EXAMPLE
    .\compare-entries.ps1 `
        -OldEntry D:\backup\dingtalk-utils\dingtalk-utils.ps1 `
        -NewEntry D:\codes\study-record-system\cli\dingtalk-bridge\dingtalk-bridge.ps1 `
        -Cid 77728566311 `
        -OutFile D:\tmp\equivalence-report.json
#>
[CmdletBinding()]
param(
    [string]$OldEntry,
    [string]$NewEntry,
    [string]$Cid,
    [string]$OutFile,
    [string]$CorpId = 'dinga474f6fd16f02a4524f2f5cc6abecb85',
    [string]$ClassId = '1117746524',
    [string]$StudentId = '3000000001385614551',
    [string]$MessageId = '27679584058518',
    [string]$SecondMessageId = '27696112847757',
    [string]$HomeworkId = '80449618205',
    [string]$NoticeId = '10666230438',
    [string]$Start = '2026-11-14T00:00:00+08:00',
    [string]$End = '2026-11-15T00:00:00+08:00',
    [int]$CaseTimeoutSeconds = 240
)

# ---------------------------------------------------------------------------
# Normalization policy
# ---------------------------------------------------------------------------

# Keys whose value legitimately changes between two runs of the SAME entry.
# They are replaced by a sentinel so that key presence and JSON type are still
# compared while the volatile value itself is not.
$script:VolatileKeyMap = [ordered]@{
    'processId'   = '<processId>'
    'pid'         = '<pid>'
    'fetchedAt'   = '<volatile-time>'
    'generatedAt' = '<volatile-time>'
    'now'         = '<volatile-time>'
    'currentTime' = '<volatile-time>'
    'serverTime'  = '<volatile-time>'
    'timestamp'   = '<volatile-time>'
    'elapsedMs'   = '<volatile-duration>'
    'durationMs'  = '<volatile-duration>'
}

# Arrays whose order is NOT part of the contract, keyed by payload path.
#   '$self' sorts by the canonical JSON text of the element.
# Everything else keeps the order the entry produced (the default).
$script:ArrayOrderRationale = [ordered]@{
    'searchGroups.$.items'         = 'DingTalk client search result order is not documented as stable; comparing as a set keeps the check meaningful.'
    'getMessagesById.$.missingIds' = 'Derived from a JavaScript Set, so element order is an implementation detail rather than contract data.'
    'getMessagesById.$.failures'   = 'Collected per failed request id; order is not part of the response contract.'
}

# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

function Write-Line {
    param([string]$Text = '')
    [Console]::Out.WriteLine($Text)
}

# Enumerating property names must skip the empty-object case: in Windows
# PowerShell 5.1 `@($obj.PSObject.Properties.Name)` on an object with zero
# members yields a single $null element, which would otherwise surface as a
# phantom "" key (the DingTalk client really does emit `{}` for
# content.atCustomRoleIds / liveExtension).
function Get-ObjectKeys {
    param($Node)
    $names = New-Object System.Collections.Generic.List[string]
    if ($null -eq $Node) { return @() }
    foreach ($property in @($Node.PSObject.Properties)) {
        if ($null -eq $property) { continue }
        if ([string]::IsNullOrEmpty($property.Name)) { continue }
        [void]$names.Add($property.Name)
    }
    return $names.ToArray()
}

function Get-ChildValue {
    param($Node, [string]$Name)
    if ($null -eq $Node) { return $null }
    $property = $Node.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function Set-ChildValue {
    param($Node, [string]$Name, $Value)
    $property = $Node.PSObject.Properties[$Name]
    if ($null -ne $property) { $property.Value = $Value }
}

function Get-TextSnippet {
    param([string]$Text, [int]$Max = 400)
    if ($null -eq $Text) { return '<null>' }
    if ($Text.Length -gt $Max) { return ($Text.Substring(0, $Max) + '...<truncated>') }
    return $Text
}

function Get-JsonSnippet {
    param($Value, [int]$Max = 400)
    if ($null -eq $Value) { return '<null>' }
    try {
        $text = ConvertTo-Json -InputObject $Value -Compress -Depth 100 -ErrorAction Stop
    } catch {
        $text = [string]$Value
    }
    if ($null -eq $text) { $text = '<null>' }
    if ($text.Length -gt $Max) { $text = $text.Substring(0, $Max) + '...<truncated>' }
    return $text
}

function Get-ParentSummary {
    param($Parent, [int]$Max = 500)
    if ($null -eq $Parent) { return '<null>' }
    if ($Parent -is [System.Management.Automation.PSCustomObject]) {
        $builder = New-Object System.Text.StringBuilder
        [void]$builder.Append('{')
        $names = @(Get-ObjectKeys -Node $Parent)
        $shown = 0
        foreach ($name in $names) {
            if ($shown -ge 6) { [void]$builder.Append(' ...'); break }
            if ($shown -gt 0) { [void]$builder.Append(', ') }
            [void]$builder.Append($name)
            [void]$builder.Append(': ')
            [void]$builder.Append((Get-JsonSnippet -Value (Get-ChildValue -Node $Parent -Name $name) -Max 60))
            $shown++
        }
        [void]$builder.Append('} (')
        [void]$builder.Append($names.Count)
        [void]$builder.Append(' keys)')
        $text = $builder.ToString()
    } else {
        $text = Get-JsonSnippet -Value $Parent -Max $Max
    }
    if ($text.Length -gt $Max) { $text = $text.Substring(0, $Max) + '...<truncated>' }
    return $text
}

function ConvertFrom-RawText {
    param([byte[]]$Bytes)
    if ($null -eq $Bytes -or $Bytes.Length -eq 0) { return '' }
    $offset = 0
    if ($Bytes.Length -ge 3 -and $Bytes[0] -eq 0xEF -and $Bytes[1] -eq 0xBB -and $Bytes[2] -eq 0xBF) { $offset = 3 }
    $length = $Bytes.Length - $offset
    $strictUtf8 = New-Object System.Text.UTF8Encoding($false, $true)
    try {
        return $strictUtf8.GetString($Bytes, $offset, $length)
    } catch {
        # Windows PowerShell writes help/error text using the console code page.
    }
    try {
        return [System.Text.Encoding]::GetEncoding(936).GetString($Bytes, $offset, $length)
    } catch {
        return [System.Text.Encoding]::Default.GetString($Bytes, $offset, $length)
    }
}

function Get-JsonPayload {
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
    $lines = $Text -split "`r?`n"
    for ($i = $lines.Length - 1; $i -ge 0; $i--) {
        $candidate = $lines[$i].Trim()
        if ($candidate.Length -lt 2) { continue }
        if (-not $candidate.StartsWith('{')) { continue }
        if (-not $candidate.EndsWith('}')) { continue }
        try { return ($candidate | ConvertFrom-Json) } catch { }
    }
    $trimmed = $Text.Trim()
    if ($trimmed.StartsWith('{')) {
        try { return ($trimmed | ConvertFrom-Json) } catch { }
    }
    return $null
}

function Get-ValueTag {
    param($Value)
    if ($null -eq $Value) { return 'null' }
    if ($Value -is [bool]) { return 'bool' }
    if ($Value -is [string]) { return 'string' }
    if ($Value -is [System.ValueType]) { return 'number' }
    return 'other'
}

function New-Diff {
    param([string]$Path, [string]$Kind, $OldValue, $NewValue, $OldParent, $NewParent)
    [pscustomobject]@{
        Path      = $Path
        Kind      = $Kind
        OldValue  = $OldValue
        NewValue  = $NewValue
        OldParent = $OldParent
        NewParent = $NewParent
    }
}

# ---------------------------------------------------------------------------
# Process execution
# ---------------------------------------------------------------------------

function Invoke-BridgeEntry {
    param(
        [string]$EntryPath,
        [string[]]$Arguments,
        [int]$TimeoutSeconds
    )

    $windowsPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    if (-not (Test-Path -LiteralPath $windowsPowerShell)) { $windowsPowerShell = 'powershell.exe' }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $windowsPowerShell
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $psi.WorkingDirectory = Split-Path -Parent $EntryPath

    $quoted = New-Object System.Collections.ArrayList
    [void]$quoted.Add('-NoProfile')
    [void]$quoted.Add('-NonInteractive')
    [void]$quoted.Add('-ExecutionPolicy')
    [void]$quoted.Add('Bypass')
    [void]$quoted.Add('-File')
    [void]$quoted.Add('"' + $EntryPath + '"')
    foreach ($argument in $Arguments) {
        [void]$quoted.Add('"' + ([string]$argument) + '"')
    }
    $psi.Arguments = ($quoted -join ' ')

    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $process = [System.Diagnostics.Process]::Start($psi)
    $outStream = New-Object System.IO.MemoryStream
    $errStream = New-Object System.IO.MemoryStream
    $outTask = $process.StandardOutput.BaseStream.CopyToAsync($outStream)
    $errTask = $process.StandardError.BaseStream.CopyToAsync($errStream)

    $timedOut = $false
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
        $timedOut = $true
        try { $process.Kill() } catch { }
        [void]$process.WaitForExit(15000)
    }

    try { [void]$outTask.Wait(15000) } catch { }
    try { [void]$errTask.Wait(15000) } catch { }

    $outBytes = $outStream.ToArray()
    $errBytes = $errStream.ToArray()
    $exitCode = $process.ExitCode
    $process.Dispose()
    $outStream.Dispose()
    $errStream.Dispose()
    $stopwatch.Stop()

    $stdoutText = ConvertFrom-RawText -Bytes $outBytes
    $stderrText = ConvertFrom-RawText -Bytes $errBytes

    [pscustomobject]@{
        ExitCode  = $exitCode
        TimedOut  = $timedOut
        ElapsedMs = [int]$stopwatch.ElapsedMilliseconds
        Stdout    = $stdoutText
        Stderr    = $stderrText
        Json      = (Get-JsonPayload -Text $stdoutText)
    }
}

# ---------------------------------------------------------------------------
# Normalization + comparison
# ---------------------------------------------------------------------------

function Sort-NodeArray {
    param($Items, [string]$KeyField)
    if ($KeyField -eq '$self') {
        $pairs = @()
        foreach ($item in $Items) {
            $pairs += [pscustomobject]@{
                SortKey = (Get-JsonSnippet -Value $item -Max 200000)
                Value   = $item
            }
        }
        return @($pairs | Sort-Object -Property SortKey | ForEach-Object { $_.Value })
    }
    try {
        return @($Items | Sort-Object -Property $KeyField)
    } catch {
        return @($Items)
    }
}

function Normalize-NodeInPlace {
    param($Node, [string]$Path, [hashtable]$SortArrays)

    if ($null -eq $Node) { return }

    if ($Node -is [System.Management.Automation.PSCustomObject]) {
        foreach ($property in @($Node.PSObject.Properties)) {
            if ($null -eq $property) { continue }
            if ($script:VolatileKeyMap.Contains($property.Name)) {
                $property.Value = $script:VolatileKeyMap[$property.Name]
                continue
            }
            Normalize-NodeInPlace -Node $property.Value -Path ($Path + '.' + $property.Name) -SortArrays $SortArrays
        }
        return
    }

    if ($Node -is [System.Array]) {
        foreach ($element in $Node) {
            Normalize-NodeInPlace -Node $element -Path $Path -SortArrays $SortArrays
        }
        if ($null -ne $SortArrays -and $SortArrays.ContainsKey($Path) -and $Node.Length -gt 1) {
            $sorted = @(Sort-NodeArray -Items $Node -KeyField $SortArrays[$Path])
            for ($index = 0; $index -lt $Node.Length; $index++) { $Node[$index] = $sorted[$index] }
        }
        return
    }
}

function Test-NodeEqual {
    param($Old, $New, [string]$Path)

    if ($null -eq $Old -and $null -eq $New) { return $null }
    if ($null -eq $Old -or $null -eq $New) {
        return (New-Diff -Path $Path -Kind 'null-vs-value' -OldValue $Old -NewValue $New -OldParent $null -NewParent $null)
    }

    $oldIsObject = $Old -is [System.Management.Automation.PSCustomObject]
    $newIsObject = $New -is [System.Management.Automation.PSCustomObject]
    if ($oldIsObject -or $newIsObject) {
        if (-not ($oldIsObject -and $newIsObject)) {
            return (New-Diff -Path $Path -Kind 'json-type' -OldValue $Old -NewValue $New -OldParent $null -NewParent $null)
        }
        $oldKeys = @(Get-ObjectKeys -Node $Old)
        $newKeys = @(Get-ObjectKeys -Node $New)
        $allKeys = New-Object System.Collections.Generic.List[string]
        foreach ($key in $oldKeys) { [void]$allKeys.Add($key) }
        foreach ($key in $newKeys) { if (-not ($oldKeys -ccontains $key)) { [void]$allKeys.Add($key) } }
        $orderedKeys = @($allKeys | Sort-Object)
        foreach ($key in $orderedKeys) {
            $hasOld = $oldKeys -ccontains $key
            $hasNew = $newKeys -ccontains $key
            $childPath = $Path + '.' + $key
            if (-not $hasOld -or -not $hasNew) {
                $kind = 'missing-key'
                if (-not $hasOld) { $kind = 'key-only-in-new' }
                if (-not $hasNew) { $kind = 'key-only-in-old' }
                $oldValue = $null
                $newValue = $null
                if ($hasOld) { $oldValue = Get-ChildValue -Node $Old -Name $key }
                if ($hasNew) { $newValue = Get-ChildValue -Node $New -Name $key }
                return (New-Diff -Path $childPath -Kind $kind -OldValue $oldValue -NewValue $newValue -OldParent $Old -NewParent $New)
            }
            $diff = Test-NodeEqual -Old (Get-ChildValue -Node $Old -Name $key) -New (Get-ChildValue -Node $New -Name $key) -Path $childPath
            if ($null -ne $diff) { return $diff }
        }
        return $null
    }

    $oldIsArray = $Old -is [System.Array]
    $newIsArray = $New -is [System.Array]
    if ($oldIsArray -or $newIsArray) {
        if (-not ($oldIsArray -and $newIsArray)) {
            return (New-Diff -Path $Path -Kind 'json-type' -OldValue $Old -NewValue $New -OldParent $null -NewParent $null)
        }
        if ($Old.Length -ne $New.Length) {
            return (New-Diff -Path $Path -Kind 'array-length' -OldValue ("count=" + $Old.Length) -NewValue ("count=" + $New.Length) -OldParent $Old -NewParent $New)
        }
        for ($index = 0; $index -lt $Old.Length; $index++) {
            $diff = Test-NodeEqual -Old $Old[$index] -New $New[$index] -Path ($Path + '[' + $index + ']')
            if ($null -ne $diff) { return $diff }
        }
        return $null
    }

    $oldTag = Get-ValueTag $Old
    $newTag = Get-ValueTag $New
    if ($oldTag -ne $newTag) {
        return (New-Diff -Path $Path -Kind 'json-type' -OldValue $Old -NewValue $New -OldParent $null -NewParent $null)
    }
    if ($oldTag -eq 'number') {
        if ([double]$Old -ne [double]$New) {
            return (New-Diff -Path $Path -Kind 'value' -OldValue $Old -NewValue $New -OldParent $null -NewParent $null)
        }
        return $null
    }
    if (-not [string]::Equals([string]$Old, [string]$New, [System.StringComparison]::Ordinal)) {
        return (New-Diff -Path $Path -Kind 'value' -OldValue $Old -NewValue $New -OldParent $null -NewParent $null)
    }
    return $null
}

# ---------------------------------------------------------------------------
# Case table
# ---------------------------------------------------------------------------

function New-BridgeCase {
    param([string]$Name, [string[]]$Arguments, [hashtable]$SortArrays)
    [pscustomobject]@{
        Name       = $Name
        Arguments  = $Arguments
        SortArrays = $SortArrays
    }
}

function Get-BridgeCases {
    param(
        [string]$Cid,
        [string]$CorpId,
        [string]$ClassId,
        [string]$StudentId,
        [string]$MessageId,
        [string]$SecondMessageId,
        [string]$HomeworkId,
        [string]$NoticeId,
        [string]$Start,
        [string]$End,
        [string]$BatchInputPath
    )

    $education = @('--corp-id', $CorpId, '--class-id', $ClassId, '--student-id', $StudentId)
    $cases = @()

    $cases += New-BridgeCase -Name 'getConversation' -Arguments @('bridge', 'getConversation', '--cid', $Cid) -SortArrays @{}
    $cases += New-BridgeCase -Name 'searchGroups' -Arguments @('bridge', 'searchGroups', '--query', '青竹园') -SortArrays @{ '$.items' = 'conversationId' }
    $cases += New-BridgeCase -Name 'listMessages' -Arguments @('bridge', 'listMessages', '--cid', $Cid, '--start', $Start, '--end', $End) -SortArrays @{}
    $cases += New-BridgeCase -Name 'getMessageById' -Arguments @('bridge', 'getMessageById', '--cid', $Cid, '--message-id', $MessageId) -SortArrays @{}
    $cases += New-BridgeCase -Name 'getMessagesById' -Arguments @('bridge', 'getMessagesById', '--cid', $Cid, '--message-ids', ($MessageId + ',' + $SecondMessageId)) -SortArrays @{ '$.missingIds' = '$self'; '$.failures' = 'messageId' }

    $cases += New-BridgeCase -Name 'listHomework' -Arguments (@('bridge', 'listHomework') + $education + @('--role', 'guardian', '--status', 'ALL')) -SortArrays @{}
    $cases += New-BridgeCase -Name 'getHomework' -Arguments (@('bridge', 'getHomework') + $education + @('--homework-id', $HomeworkId)) -SortArrays @{}
    $cases += New-BridgeCase -Name 'listNotices' -Arguments (@('bridge', 'listNotices') + $education + @('--status', 'ALL')) -SortArrays @{}
    $cases += New-BridgeCase -Name 'getNotice' -Arguments (@('bridge', 'getNotice') + $education + @('--notice-id', $NoticeId)) -SortArrays @{}
    $cases += New-BridgeCase -Name 'listGroupTodos' -Arguments @('bridge', 'listGroupTodos', '--cid', $Cid) -SortArrays @{}
    $cases += New-BridgeCase -Name 'batch' -Arguments @('bridge', 'batch', '--input', $BatchInputPath, '--timeout-seconds', '240') -SortArrays @{}

    return $cases
}

function New-BatchInputFile {
    param(
        [string]$Cid,
        [string]$CorpId,
        [string]$ClassId,
        [string]$StudentId,
        [string]$Start,
        [string]$End
    )

    # Same request shape the study-record-sync skill sends (sync.py:build_batch),
    # trimmed to the three reads that exercise every batch dispatch branch.
    $requests = @(
        [ordered]@{
            method = 'listMessages'
            params = [ordered]@{ cid = $Cid; start = $Start; end = $End; pageSize = 50; pageLimit = 100; maxItems = 10000 }
        },
        [ordered]@{
            method = 'listHomework'
            params = [ordered]@{ corpId = $CorpId; classId = $ClassId; studentId = $StudentId; role = 'guardian'; status = 'ALL' }
        },
        [ordered]@{
            method = 'listNotices'
            params = [ordered]@{ corpId = $CorpId; classId = $ClassId; studentId = $StudentId; status = 'ALL' }
        }
    )

    $path = Join-Path ([System.IO.Path]::GetTempPath()) ('bridge-equivalence-batch-' + [guid]::NewGuid().ToString('N') + '.json')
    $text = ConvertTo-Json -InputObject $requests -Depth 10
    [System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
    return $path
}

# ---------------------------------------------------------------------------
# Main comparison
# ---------------------------------------------------------------------------

function Compare-BridgeEntries {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$OldEntry,
        [Parameter(Mandatory = $true)][string]$NewEntry,
        [Parameter(Mandatory = $true)][string]$Cid,
        [Parameter(Mandatory = $true)][string]$OutFile,
        [string]$CorpId = 'dinga474f6fd16f02a4524f2f5cc6abecb85',
        [string]$ClassId = '1117746524',
        [string]$StudentId = '3000000001385614551',
        [string]$MessageId = '27679584058518',
        [string]$SecondMessageId = '27696112847757',
        [string]$HomeworkId = '80449618205',
        [string]$NoticeId = '10666230438',
        [string]$Start = '2026-11-14T00:00:00+08:00',
        [string]$End = '2026-11-15T00:00:00+08:00',
        [int]$CaseTimeoutSeconds = 240
    )

    $oldFull = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OldEntry)
    $newFull = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($NewEntry)
    $outFull = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutFile)

    if (-not (Test-Path -LiteralPath $oldFull -PathType Leaf)) { throw "old entry not found: $oldFull" }
    if (-not (Test-Path -LiteralPath $newFull -PathType Leaf)) { throw "new entry not found: $newFull" }
    if ($Cid -notmatch '^[0-9]{1,32}$') {
        throw ("-Cid must be the native numeric conversation id (^[0-9]{1,32}$) because the bridge CLI only accepts that for --cid; " + "the openCid form cid...== cannot be passed. Got: '" + $Cid + "'")
    }

    $outDirectory = Split-Path -Parent $outFull
    if ($outDirectory -and -not (Test-Path -LiteralPath $outDirectory)) {
        New-Item -ItemType Directory -Path $outDirectory -Force | Out-Null
    }

    Write-Line '=== dingtalk bridge equivalence harness ==='
    Write-Line ('old entry : ' + $oldFull)
    Write-Line ('new entry : ' + $newFull)
    Write-Line ('cid       : ' + $Cid + '   (openCid cidg0FZeOnGo05sXU7l2N8pug==)')
    Write-Line ('window    : [' + $Start + ', ' + $End + ')')
    Write-Line ('ids       : messageId=' + $MessageId + ' second=' + $SecondMessageId + ' homeworkId=' + $HomeworkId + ' noticeId=' + $NoticeId)
    Write-Line ''

    $batchInputPath = New-BatchInputFile -Cid $Cid -CorpId $CorpId -ClassId $ClassId -StudentId $StudentId -Start $Start -End $End

    $reportRows = @()
    $identical = 0
    $different = 0
    $failed = 0

    try {
        $cases = @(Get-BridgeCases -Cid $Cid -CorpId $CorpId -ClassId $ClassId -StudentId $StudentId `
            -MessageId $MessageId -SecondMessageId $SecondMessageId -HomeworkId $HomeworkId -NoticeId $NoticeId `
            -Start $Start -End $End -BatchInputPath $batchInputPath)

        $index = 0
        foreach ($case in $cases) {
            $index++
            $label = '[{0,2}/{1}] {2,-18}' -f $index, $cases.Count, $case.Name

            $oldRun = Invoke-BridgeEntry -EntryPath $oldFull -Arguments $case.Arguments -TimeoutSeconds $CaseTimeoutSeconds
            $newRun = Invoke-BridgeEntry -EntryPath $newFull -Arguments $case.Arguments -TimeoutSeconds $CaseTimeoutSeconds

            $oldOk = (-not $oldRun.TimedOut) -and ($oldRun.ExitCode -eq 0) -and ($null -ne $oldRun.Json)
            $newOk = (-not $newRun.TimedOut) -and ($newRun.ExitCode -eq 0) -and ($null -ne $newRun.Json)

            $status = 'identical'
            $diff = $null
            $firstDiffPath = ''
            $oldValue = ''
            $newValue = ''
            $oldContext = ''
            $newContext = ''

            if (-not $oldOk) {
                $status = 'old-failed'
                $oldContext = ('exit=' + $oldRun.ExitCode + ' timedOut=' + $oldRun.TimedOut + ' json=' + ($null -ne $oldRun.Json))
                $newContext = ('exit=' + $newRun.ExitCode + ' timedOut=' + $newRun.TimedOut + ' json=' + ($null -ne $newRun.Json))
            } elseif (-not $newOk) {
                $status = 'new-failed'
                $firstDiffPath = '$'
                $oldValue = Get-JsonSnippet -Value $oldRun.Json -Max 400
                $newValue = ('<no JSON payload: exit=' + $newRun.ExitCode + ' timedOut=' + $newRun.TimedOut + '>')
                $oldContext = 'old entry produced a payload; new entry produced none'
                $newContext = Get-TextSnippet -Text $newRun.Stderr.Trim() -Max 400
            } else {
                $sortArrays = $case.SortArrays
                Normalize-NodeInPlace -Node $oldRun.Json -Path '$' -SortArrays $sortArrays
                Normalize-NodeInPlace -Node $newRun.Json -Path '$' -SortArrays $sortArrays
                $diff = Test-NodeEqual -Old $oldRun.Json -New $newRun.Json -Path '$'
                if ($null -ne $diff) {
                    $status = 'different'
                    $firstDiffPath = $diff.Path
                    $oldValue = Get-JsonSnippet -Value $diff.OldValue -Max 400
                    $newValue = Get-JsonSnippet -Value $diff.NewValue -Max 400
                    if ($null -ne $diff.OldParent) { $oldContext = Get-ParentSummary -Parent $diff.OldParent }
                    if ($null -ne $diff.NewParent) { $newContext = Get-ParentSummary -Parent $diff.NewParent }
                }
            }

            switch ($status) {
                'identical' { $identical++ }
                'different' { $different++ }
                default { $failed++ }
            }

            $diffKind = ''
            if ($null -ne $diff) { $diffKind = $diff.Kind }

            # The batch request file is generated per run; keep the report
            # byte-stable by recording a placeholder instead of the temp path.
            $argsText = ($case.Arguments -join ' ')
            if (-not [string]::IsNullOrEmpty($batchInputPath)) {
                $argsText = $argsText.Replace($batchInputPath, '<generated-batch-input.json>')
            }

            $row = [ordered]@{
                name          = $case.Name
                args          = $argsText
                status        = $status
                firstDiffPath = $firstDiffPath
                diffKind      = $diffKind
                oldValue      = $oldValue
                newValue      = $newValue
                oldContext    = $oldContext
                newContext    = $newContext
                oldExitCode   = $oldRun.ExitCode
                newExitCode   = $newRun.ExitCode
                oldTimedOut   = $oldRun.TimedOut
                newTimedOut   = $newRun.TimedOut
                oldElapsedMs  = $oldRun.ElapsedMs
                newElapsedMs  = $newRun.ElapsedMs
                oldJsonParsed = ($null -ne $oldRun.Json)
                newJsonParsed = ($null -ne $newRun.Json)
                oldStderr     = Get-TextSnippet -Text $oldRun.Stderr.Trim() -Max 800
                newStderr     = Get-TextSnippet -Text $newRun.Stderr.Trim() -Max 800
            }
            $reportRows += [pscustomobject]$row

            $elapsed = '{0,6}ms/{1,6}ms' -f $oldRun.ElapsedMs, $newRun.ElapsedMs
            Write-Line ('  ' + $label + ' ' + $status.PadRight(11) + ' ' + $elapsed)
            if ($status -eq 'different') {
                Write-Line ('        firstDiffPath: ' + $firstDiffPath + '  (' + $diffKind + ')')
                Write-Line ('        old: ' + $oldValue)
                Write-Line ('        new: ' + $newValue)
            } elseif ($status -ne 'identical') {
                Write-Line ('        old exit=' + $oldRun.ExitCode + ' json=' + ($null -ne $oldRun.Json) + ' stderr=' + (Get-TextSnippet -Text $oldRun.Stderr.Trim() -Max 300))
                Write-Line ('        new exit=' + $newRun.ExitCode + ' json=' + ($null -ne $newRun.Json) + ' stderr=' + (Get-TextSnippet -Text $newRun.Stderr.Trim() -Max 300))
            }
        }
    } finally {
        if (Test-Path -LiteralPath $batchInputPath) { Remove-Item -LiteralPath $batchInputPath -Force -ErrorAction SilentlyContinue }
    }

    $exitCode = 0
    if ($different -gt 0 -or $failed -gt 0) { $exitCode = 1 }

    $orderRationale = @()
    foreach ($key in $script:ArrayOrderRationale.Keys) { $orderRationale += ($key + ' -> ' + $script:ArrayOrderRationale[$key]) }

    $report = [ordered]@{
        schemaVersion = 1
        harness       = 'cli/dingtalk-bridge/tests/powershell/compare-entries.ps1'
        generatedAt   = (Get-Date).ToString('o')
        oldEntry      = $oldFull
        newEntry      = $newFull
        cid           = $Cid
        openCid       = 'cidg0FZeOnGo05sXU7l2N8pug=='
        timeRange     = [ordered]@{
            start     = $Start
            end       = $End
            timezone  = '+08:00 (Asia/Shanghai)'
            rationale = 'A closed past window is immutable, so old-vs-old can be repeated without a message arriving mid-run. An open "today" window is not deterministic.'
        }
        fixedIds      = [ordered]@{
            messageId       = $MessageId
            secondMessageId = $SecondMessageId
            homeworkId      = $HomeworkId
            noticeId        = $NoticeId
            corpId          = $CorpId
            classId         = $ClassId
            studentId       = $StudentId
            batchInput      = 'generated per run from a fixed in-script request set (listMessages, listHomework, listNotices)'
        }
        normalization = [ordered]@{
            volatileKeys             = @($script:VolatileKeyMap.Keys)
            volatileKeySentinel      = 'replaced by a sentinel string, so key presence and JSON type are still compared'
            arrayOrderNormalized     = @($script:ArrayOrderRationale.Keys)
            arrayOrderRationale      = $orderRationale
            arrayOrderDefault        = 'kept exactly as produced (server/client order is treated as contract data)'
            notCompared              = @('stderr text is diagnostic only', 'process exit code is enforced but not part of the JSON diff')
            timestampsKeptAsContract = 'createdAt, sendTime, editTime, hwDeadline, scheduledTime and other server-assigned times are NOT normalized: they are stable contract data'
        }
        summary = [ordered]@{
            total     = $reportRows.Count
            identical = $identical
            different = $different
            failed    = $failed
            exitCode  = $exitCode
        }
        cases = $reportRows
    }

    $json = ConvertTo-Json -InputObject $report -Depth 100
    [System.IO.File]::WriteAllText($outFull, $json, (New-Object System.Text.UTF8Encoding($false)))

    Write-Line ''
    if ($exitCode -eq 0) {
        Write-Line ('RESULT: ' + $identical + '/' + $reportRows.Count + ' identical (exit 0)')
    } else {
        Write-Line ('RESULT: ' + $identical + '/' + $reportRows.Count + ' identical, ' + $different + ' different, ' + $failed + ' failed (exit 1)')
    }
    Write-Line ('report: ' + $outFull)

    [pscustomobject]@{
        ExitCode = $exitCode
        Report   = $report
    }
}

# ---------------------------------------------------------------------------
# Script entry (skipped when dot-sourced so tests can load the function only)
# ---------------------------------------------------------------------------

if ($MyInvocation.InvocationName -ne '.') {
    if (-not $OldEntry -or -not $NewEntry -or -not $Cid -or -not $OutFile) {
        [Console]::Error.WriteLine('usage: compare-entries.ps1 -OldEntry <path> -NewEntry <path> -Cid <native-cid> -OutFile <path>')
        exit 2
    }
    $result = Compare-BridgeEntries -OldEntry $OldEntry -NewEntry $NewEntry -Cid $Cid -OutFile $OutFile `
        -CorpId $CorpId -ClassId $ClassId -StudentId $StudentId -MessageId $MessageId -SecondMessageId $SecondMessageId `
        -HomeworkId $HomeworkId -NoticeId $NoticeId -Start $Start -End $End -CaseTimeoutSeconds $CaseTimeoutSeconds
    exit $result.ExitCode
}
