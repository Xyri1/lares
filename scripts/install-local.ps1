[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('install', 'uninstall')]
  [string]$Action,

  [Parameter(Position = 1)]
  [string]$Artifact,

  [string]$InstallRoot = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs\Lares'),

  [switch]$DeleteData
)

$ErrorActionPreference = 'Stop'

function Stop-Usage([string]$Message) {
  [Console]::Error.WriteLine($Message)
  exit 2
}

function Invoke-LaresNative([string]$Path, [string[]]$Arguments) {
  & $Path @Arguments
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
$driveRoot = [IO.Path]::GetPathRoot($InstallRoot)
if (
  $InstallRoot.TrimEnd('\') -eq $driveRoot.TrimEnd('\') -or
  [IO.Path]::GetFileName($InstallRoot.TrimEnd('\')) -ine 'Lares'
) {
  Stop-Usage "Refusing unsafe Lares install root: $InstallRoot"
}

if ($Action -eq 'install') {
  if ([string]::IsNullOrWhiteSpace($Artifact) -or -not (Test-Path -LiteralPath $Artifact -PathType Leaf)) {
    Stop-Usage "Lares installer not found: $Artifact"
  }
  $installer = (Get-Item -LiteralPath $Artifact).FullName
  if ([IO.Path]::GetExtension($installer) -ne '.exe') {
    Stop-Usage 'Lares installer must be a local .exe file'
  }
  Invoke-LaresNative $installer @('/S', "/D=$InstallRoot")
  exit 0
}

$uninstaller = Join-Path $InstallRoot 'Uninstall Lares.exe'
if (-not (Test-Path -LiteralPath $uninstaller -PathType Leaf)) {
  Stop-Usage "Installed Lares uninstaller not found: $uninstaller"
}
$arguments = @('/S')
if ($DeleteData) {
  $arguments += '--delete-app-data'
}
Invoke-LaresNative $uninstaller $arguments
exit 0
