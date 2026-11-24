# PaperKit one-line installer for Windows:
#   irm https://raw.githubusercontent.com/MrWhiteHat-coder/paperkit/main/install.ps1 | iex
# Downloads PaperKit into %LOCALAPPDATA%\PaperKit, adds a Desktop shortcut, and opens it in your browser.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$dir = Join-Path $env:LOCALAPPDATA 'PaperKit'
$tmp = Join-Path $env:TEMP ('paperkit-' + [guid]::NewGuid().ToString('N'))
Write-Host ''
Write-Host '  Installing PaperKit...' -ForegroundColor Cyan
New-Item -ItemType Directory -Force $tmp | Out-Null
$zip = Join-Path $tmp 'paperkit.zip'
Invoke-WebRequest 'https://github.com/MrWhiteHat-coder/paperkit/archive/refs/heads/main.zip' -OutFile $zip -UseBasicParsing
Expand-Archive $zip -DestinationPath $tmp -Force
if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
Move-Item (Join-Path $tmp 'paperkit-main') $dir
Remove-Item $tmp -Recurse -Force

$serve = Join-Path $dir 'serve.ps1'
try {
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'PaperKit.lnk'))
  $lnk.TargetPath = (Get-Command powershell.exe).Source
  $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File `"$serve`""
  $lnk.WorkingDirectory = $dir
  $lnk.Description = 'PaperKit - private PDF tools'
  $lnk.Save()
  Write-Host '  Added a PaperKit shortcut to your Desktop.' -ForegroundColor DarkGray
} catch { }

Write-Host "  Installed to $dir" -ForegroundColor Green
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $serve
