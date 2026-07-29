$ErrorActionPreference = 'Stop'
$root = Join-Path ([IO.Path]::GetTempPath()) "lares local fixture $([Guid]::NewGuid())"
$entry = Join-Path $PSScriptRoot 'install-local.ps1'
$artifact = Join-Path $root 'Lares fixture installer.exe'
$installRoot = Join-Path $root 'Programs with spaces\Lares'
$log = Join-Path $root 'invocations.log'
$hostExe = (Get-Process -Id $PID).Path

try {
  New-Item -ItemType Directory -Path $root | Out-Null
  $fixtureSource = @'
using System;
using System.Diagnostics;
using System.IO;

public static class LaresFixtureInstaller {
  public static int Main(string[] args) {
    var executable = Process.GetCurrentProcess().MainModule.FileName;
    var uninstall = Path.GetFileName(executable).StartsWith("Uninstall Lares");
    File.AppendAllText(
      Environment.GetEnvironmentVariable("LARES_FIXTURE_LOG"),
      (uninstall ? "uninstall:" : "install:") + string.Join("|", args) + Environment.NewLine
    );
    if (!uninstall) {
      foreach (var arg in args) {
        if (!arg.StartsWith("/D=")) continue;
        var target = arg.Substring(3);
        Directory.CreateDirectory(target);
        File.Copy(executable, Path.Combine(target, "Uninstall Lares.exe"), true);
      }
    }
    int code;
    return int.TryParse(Environment.GetEnvironmentVariable("LARES_FIXTURE_EXIT"), out code) ? code : 0;
  }
}
'@
  Add-Type -TypeDefinition $fixtureSource -OutputAssembly $artifact -OutputType ConsoleApplication
  $env:LARES_FIXTURE_LOG = $log
  $env:LARES_FIXTURE_EXIT = '0'

  & $hostExe -NoProfile -File $entry install $artifact -InstallRoot $installRoot
  if ($LASTEXITCODE -ne 0) { throw "Install fixture failed: $LASTEXITCODE" }
  & $hostExe -NoProfile -File $entry uninstall -InstallRoot $installRoot
  if ($LASTEXITCODE -ne 0) { throw "Retain-data uninstall fixture failed: $LASTEXITCODE" }
  & $hostExe -NoProfile -File $entry install $artifact -InstallRoot $installRoot
  if ($LASTEXITCODE -ne 0) { throw "Reinstall fixture failed: $LASTEXITCODE" }
  & $hostExe -NoProfile -File $entry uninstall -InstallRoot $installRoot -DeleteData
  if ($LASTEXITCODE -ne 0) { throw "Delete-data uninstall fixture failed: $LASTEXITCODE" }

  $lines = Get-Content -LiteralPath $log
  if ($lines[0] -notlike 'install:/S|/D=*Programs with spaces*') {
    throw "Install arguments were not preserved: $($lines[0])"
  }
  if ($lines[1] -ne 'uninstall:/S') {
    throw "Retain-data uninstall arguments were wrong: $($lines[1])"
  }
  if ($lines[2] -notlike 'install:/S|/D=*Programs with spaces*') {
    throw "Reinstall arguments were not preserved: $($lines[2])"
  }
  if ($lines[3] -ne 'uninstall:/S|--delete-app-data') {
    throw "Delete-data uninstall arguments were wrong: $($lines[3])"
  }

  & $hostExe -NoProfile -File $entry uninstall -InstallRoot ([IO.Path]::GetPathRoot($root))
  if ($LASTEXITCODE -ne 2) { throw "Expected unsafe-root exit code 2, got $LASTEXITCODE" }

  $env:LARES_FIXTURE_EXIT = '9'
  & $hostExe -NoProfile -File $entry install $artifact -InstallRoot $installRoot
  if ($LASTEXITCODE -ne 9) { throw "Expected exit code 9, got $LASTEXITCODE" }
  Write-Output 'Lares local Windows install fixtures passed.'
} finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
