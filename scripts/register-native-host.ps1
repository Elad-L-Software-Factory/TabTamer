<#
.SYNOPSIS
  Development only: registers the TabTamer native messaging relay for Chrome and Edge
  (current Windows user, no admin rights). The installer does this for end users (M7).

.EXAMPLE
  pnpm register-host            # register
  pnpm register-host -Unregister
#>
param([switch]$Unregister)

$ErrorActionPreference = 'Stop'
$HostName = 'com.tabtamer.host'
$Repo = Split-Path -Parent $PSScriptRoot
$Dir = Join-Path $env:LOCALAPPDATA 'TabTamer\native-host'
$Keys = @(
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
)

if ($Unregister) {
  foreach ($k in $Keys) { if (Test-Path $k) { Remove-Item $k -Force } }
  if (Test-Path $Dir) { Remove-Item $Dir -Recurse -Force }
  Write-Host 'TabTamer native host unregistered.'
  exit 0
}

$Electron = Join-Path $Repo 'apps\desktop\node_modules\electron\dist\electron.exe'
$Relay = Join-Path $Repo 'apps\desktop\dist\native-host\relay.cjs'
foreach ($f in @($Electron, $Relay)) {
  if (-not (Test-Path $f)) { throw "Missing $f. Run 'pnpm install' and 'pnpm build' first." }
}

# Extension ID is derived from the public key in the extension manifest.
$Manifest = Get-Content (Join-Path $Repo 'apps\extension\manifest.json') -Raw | ConvertFrom-Json
$Der = [Convert]::FromBase64String($Manifest.key)
$Hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($Der)
$ExtId = -join ($Hash[0..15] | ForEach-Object { [char](97 + ($_ -shr 4)); [char](97 + ($_ -band 15)) })

New-Item -ItemType Directory -Force $Dir | Out-Null
$Cmd = Join-Path $Dir 'tabtamer-host.cmd'
@"
@echo off
set ELECTRON_RUN_AS_NODE=1
"$Electron" "$Relay" %*
"@ | Set-Content -Path $Cmd -Encoding ascii

$HostManifest = Join-Path $Dir "$HostName.json"
@{
  name            = $HostName
  description     = 'TabTamer native messaging relay'
  path            = $Cmd
  type            = 'stdio'
  allowed_origins = @("chrome-extension://$ExtId/")
} | ConvertTo-Json | Set-Content -Path $HostManifest -Encoding utf8

foreach ($k in $Keys) {
  New-Item -Path $k -Force | Out-Null
  Set-Item -Path $k -Value $HostManifest
}

Write-Host "TabTamer native host registered for Chrome and Edge."
Write-Host "Extension ID: $ExtId"
