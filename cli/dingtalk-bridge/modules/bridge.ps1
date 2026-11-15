# Bridge feature loader. Uses the native client identity; never activates DWS.
foreach($component in @('Safety','Runtime','Requests','Messages','Media','Commands')) {
    . (Join-Path $PSScriptRoot ('bridge\'+$component+'.ps1'))
}