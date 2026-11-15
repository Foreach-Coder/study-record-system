function Read-DuBridgeMediaInteger {
    param([byte[]]$Bytes,[ref]$Offset)
    if($Offset.Value-ge$Bytes.Length){throw '媒体 ID 不完整。'}
    $tag=[int]$Bytes[$Offset.Value];$Offset.Value++
    if($tag-lt128){return [long]$tag}
    $count=switch($tag){204{1}205{2}206{4}207{8}default{throw '媒体 ID 数值类型不支持。'}}
    if($Offset.Value+$count-gt$Bytes.Length){throw '媒体 ID 不完整。'}
    [decimal]$value=0
    for($i=0;$i-lt$count;$i++){$value=$value*256+$Bytes[$Offset.Value];$Offset.Value++}
    if($value-gt[long]::MaxValue){throw '媒体 ID 数值过大。'}
    return [long]$value
}

function ConvertTo-DuBridgeImageReference {
    param([AllowNull()]$ResourceId)
    if($ResourceId-isnot[string]-or$ResourceId-cnotmatch'\A@[A-Za-z0-9_-]{6,2048}={0,2}\z'){throw '仅支持已验证的普通 @ 图片媒体 ID；受保护媒体和文件请使用 DWS。'}
    $body=$ResourceId.Substring(1).TrimEnd('=');$base64=$body.Replace('-','+').Replace('_','/')
    $base64+='='*((4-$base64.Length%4)%4)
    try{$bytes=[Convert]::FromBase64String($base64)}catch{throw '图片媒体 ID 编码无效。'}
    if($bytes.Length-lt5-or$bytes[0]-lt148-or$bytes[0]-gt159){throw '图片媒体 ID 结构无效。'}
    $offset=1;$type=Read-DuBridgeMediaInteger $bytes ([ref]$offset)
    $null=Read-DuBridgeMediaInteger $bytes ([ref]$offset)
    $height=Read-DuBridgeMediaInteger $bytes ([ref]$offset);$width=Read-DuBridgeMediaInteger $bytes ([ref]$offset)
    $types=@{0='jpg';1='gif';2='png';3='bmp';29='webp'}
    if(-not$types.ContainsKey([int]$type)-or$width-lt1-or$height-lt1-or$width-gt100000-or$height-gt100000){throw '仅支持已验证的普通图片；其他媒体请使用 DWS。'}
    $extension=$types[[int]$type]
    return @{url=('https://static.dingtalk.com/media/{0}_{1}_{2}.{3}'-f$body,$width,$height,$extension);extension=$extension}
}

function Resolve-DuBridgeImageOutput {
    param([string]$Output,[string]$ResourceId,[string]$Extension)
    $root=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    $allowed=@([IO.Path]::GetFullPath((Join-Path (Get-Location) '.temp')),[IO.Path]::GetFullPath((Join-Path $root '.temp')))
    if([string]::IsNullOrEmpty($Output)){
        $hash=[Security.Cryptography.SHA256]::Create()
        try{$name=([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($ResourceId)))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}
        $Output=Join-Path $allowed[0] ('dingtalk-utils\bridge\images\'+$name+'.'+$Extension)
    }
    $path=[IO.Path]::GetFullPath($Output);$inside=$false
    foreach($base in $allowed){if($path.StartsWith($base.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){$inside=$true}}
    if(-not$inside){throw '图片输出必须位于当前目录或项目的 .temp 目录内。'}
    $parent=[IO.DirectoryInfo]::new([IO.Path]::GetDirectoryName($path))
    while($null-ne$parent){if($parent.Exists-and($parent.Attributes-band[IO.FileAttributes]::ReparsePoint)){throw '.temp 输出不能经过目录链接。'};$parent=$parent.Parent}
    if([IO.File]::Exists($path)-or[IO.Directory]::Exists($path)){throw '输出已存在；不会覆盖已有文件。'}
    $null=[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path))
    return $path
}

function Invoke-DuBridgeDownloadImage {
    param([Collections.IDictionary]$Options)
    $reference=ConvertTo-DuBridgeImageReference $Options['resource-id']
    $path=Resolve-DuBridgeImageOutput $Options.output $Options['resource-id'] $reference.extension
    Add-Type -AssemblyName System.Net.Http
    $handler=New-Object Net.Http.HttpClientHandler;$handler.AllowAutoRedirect=$false;$handler.UseCookies=$false
    $client=New-Object Net.Http.HttpClient -ArgumentList $handler;$client.Timeout=[TimeSpan]::FromSeconds(30)
    $cancellation=New-Object Threading.CancellationTokenSource;$cancellation.CancelAfter(30000)
    $part=$path+'.'+[guid]::NewGuid().ToString('N')+'.part';$response=$null;$inputStream=$null;$outputStream=$null
    try{
        $response=$client.GetAsync($reference.url,[Net.Http.HttpCompletionOption]::ResponseHeadersRead,$cancellation.Token).GetAwaiter().GetResult()
        if(-not$response.IsSuccessStatusCode){throw 'http'}
        if([string]$response.Content.Headers.ContentType-notmatch'\Aimage/'){throw 'type'}
        if($response.Content.Headers.ContentLength-gt20971520){throw 'size'}
        $inputStream=$response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $outputStream=[IO.File]::Open($part,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        $buffer=New-Object byte[] 81920;[long]$length=0
        while(($count=$inputStream.ReadAsync($buffer,0,$buffer.Length,$cancellation.Token).GetAwaiter().GetResult())-gt0){
            $length+=$count;if($length-gt20971520){throw 'size'};$outputStream.Write($buffer,0,$count)
        }
        if($length-eq0){throw 'empty'}
        $outputStream.Dispose();$outputStream=$null
        [IO.File]::Move($part,$path)
        return @{success=$true;complete=$true;bridge='ordinary-media';method='downloadImage';path=$path;bytes=$length;sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
    }catch{throw '普通图片下载失败、超时或超出 20 MiB；受保护媒体请使用 DWS。'}
    finally{
        if($outputStream){$outputStream.Dispose()};if($inputStream){$inputStream.Dispose()};if($response){$response.Dispose()}
        $cancellation.Dispose();$client.Dispose();$handler.Dispose()
        if([IO.File]::Exists($part)){[IO.File]::Delete($part)}
    }
}
