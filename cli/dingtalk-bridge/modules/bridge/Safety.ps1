function ConvertTo-DuBridgeSafeValue {
    param([AllowNull()]$Value,[int]$Depth=0)
    if($Depth -gt 100){return '[DEPTH_LIMIT]'}
    $secret='(?:[a-z0-9_-]*token|authorization|cookies?|set-cookie|password|[a-z0-9_-]*secret|auth[_-]?key|api[_-]?key|pat|jwt)'
    if($Value -is [Collections.IDictionary]) {
        $result=New-Object Collections.Specialized.OrderedDictionary ([StringComparer]::Ordinal)
        foreach($key in [string[]]@($Value.Keys)) {
            if($key -imatch ('\A'+$secret+'\z')){continue}
            $result[$key]=ConvertTo-DuBridgeSafeValue $Value[$key] ($Depth+1)
        }
        return $result
    }
    if($Value -is [array]) {
        $items=New-Object 'System.Collections.Generic.List[object]'
        foreach($item in $Value){$items.Add((ConvertTo-DuBridgeSafeValue $item ($Depth+1)))}
        return ,$items.ToArray()
    }
    if($Value -is [string]) {
        $text=$Value.TrimStart()
        if($text.StartsWith('{') -or $text.StartsWith('[')) {
            try{return ConvertTo-DuJson (ConvertTo-DuBridgeSafeValue (ConvertFrom-DuJson $Value) ($Depth+1))}catch{}
        }
        return [regex]::Replace($Value,('(?i)([?&]'+$secret+'=)[^&#\s"<>]*'),'${1}[REDACTED]')
    }
    return $Value
}

function Assert-DuBridgeNativeId {
    param([AllowNull()]$Value,[string]$Label)
    if($Value -isnot [string] -or $Value -cnotmatch '\A[0-9]{1,32}\z'){throw "$Label 必须是钉钉客户端使用的数字 ID。"}
}

# Allowed-file whitelist: the only agent scripts the bridge may load are
# <root>\scripts\bridge\<name>. The list is fixed - callers cannot widen it - and
# every candidate is resolved against the project root, never against the CWD.
function Resolve-DuBridgeScriptPath {
    param([AllowNull()][string]$Script)
    if([string]::IsNullOrWhiteSpace($Script)){throw 'bridge 脚本路径不能为空。'}
    $root=Get-DuBridgeRoot
    $base=Join-Path $root 'scripts\bridge'
    if([IO.Path]::IsPathRooted($Script)){$full=[IO.Path]::GetFullPath($Script)}else{$full=[IO.Path]::GetFullPath((Join-Path $base $Script))}
    $prefix=$root.TrimEnd('\')+'\'
    if(-not $full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw "bridge 脚本必须位于项目根目录内：$full 不在 $root 之下。"}
    foreach($name in @('get-message-by-id.js','read\core.js','read\messages.js','read\education.js','read\todos.js','read\dispatch.js')){
        if($full.Equals([IO.Path]::GetFullPath((Join-Path $base $name)),[StringComparison]::OrdinalIgnoreCase)){return $full}
    }
    throw "bridge 脚本不在允许清单内：$full。"
}
