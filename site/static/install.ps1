# Installs the dukoi command on Windows, in PowerShell:
#
#   irm https://dukoi.com/install.ps1 | iex
#
# Puts the CLI, the dashboard and the templates in ~\.dukoi, checks the
# download against SHA256SUMS and adds ~\.dukoi\bin to your PATH. No admin
# needed. Run it again to update. Built by scripts/build-cli.ts (D-113).
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Base = if ($env:DUKOI_DOWNLOAD) { $env:DUKOI_DOWNLOAD } else { 'https://dukoi.com/download' }
$Dir = if ($env:DUKOI_INSTALL) { $env:DUKOI_INSTALL } else { Join-Path $HOME '.dukoi' }

if (-not [Environment]::Is64BitOperatingSystem) {
  Write-Host "✗ Dukoi's CLI needs 64-bit Windows." -ForegroundColor Red
  return
}

# One build for Windows: ARM computers run it through Windows' x64 emulation
$File = 'dukoi-windows-x64.zip'
$Tmp = Join-Path ([IO.Path]::GetTempPath()) "dukoi-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $Tmp | Out-Null

try {
  Write-Host "→ Downloading $File"
  Invoke-WebRequest "$Base/$File" -OutFile (Join-Path $Tmp $File) -UseBasicParsing
  Invoke-WebRequest "$Base/SHA256SUMS" -OutFile (Join-Path $Tmp 'SHA256SUMS') -UseBasicParsing

  $Line = Get-Content (Join-Path $Tmp 'SHA256SUMS') | Where-Object { $_.EndsWith("  $File") }
  $Expected = if ($Line) { ($Line -split '\s+')[0] } else { '' }
  $Actual = (Get-FileHash (Join-Path $Tmp $File) -Algorithm SHA256).Hash.ToLower()
  if (-not $Expected -or $Expected -ne $Actual) {
    Write-Host "✗ The download doesn't match its checksum, so nothing was installed. Try again." -ForegroundColor Red
    return
  }

  # Replace only what the archive holds, so anything else in ~\.dukoi stays
  New-Item -ItemType Directory -Force -Path $Dir | Out-Null
  foreach ($Part in 'bin', 'dashboard', 'starters') {
    Remove-Item -Recurse -Force (Join-Path $Dir $Part) -ErrorAction SilentlyContinue
  }
  Expand-Archive (Join-Path $Tmp $File) -DestinationPath $Dir -Force
}
finally {
  Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}

$Bin = Join-Path $Dir 'bin'
$Version = ((& (Join-Path $Bin 'dukoi.exe') --version) -split ' ')[1]
Write-Host "✓ Installed dukoi $Version in $Dir"

# Add ~\.dukoi\bin to the user's PATH, once
$UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not $UserPath) { $UserPath = '' }
if (($UserPath -split ';') -notcontains $Bin) {
  [Environment]::SetEnvironmentVariable('Path', "$Bin;$UserPath", 'User')
  $env:Path = "$Bin;$env:Path"
  Write-Host "  Added $Bin to your PATH. Open a new terminal to use it everywhere."
}

Write-Host ''
Write-Host '  Next: dukoi pair'
