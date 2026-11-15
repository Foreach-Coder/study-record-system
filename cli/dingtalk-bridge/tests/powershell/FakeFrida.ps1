param(
    [string] $p,
    [string] $l,
    [switch] $q,
    [string] $t,
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]] $Remaining
)
$payload=[ordered]@{
    success=$true
    message=[ordered]@{
        baseMessage=[ordered]@{
            conversationId='77728566311'
            messageId='27609201248057'
            content=[ordered]@{contentType=3100;attachments=@()}
        }
    }
}
$json=$payload | ConvertTo-Json -Depth 20 -Compress
$encoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
[IO.File]::WriteAllText($l+'.marker',[string][DateTime]::UtcNow.Ticks,[Text.UTF8Encoding]::new($false))
[Console]::Out.WriteLine('DU_BRIDGE_RESULT:'+$encoded)
[Console]::Out.Flush()
$command=[Console]::In.ReadLine()
if($command -ceq 'exit') {
    [IO.File]::WriteAllText($l+'.graceful','exit',[Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText($l+'.stop',[string][DateTime]::UtcNow.Ticks,[Text.UTF8Encoding]::new($false))
    exit 0
}
Start-Sleep -Seconds 30
