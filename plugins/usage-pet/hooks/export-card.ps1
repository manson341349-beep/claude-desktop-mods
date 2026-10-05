# Clawd report card export (Windows). ASCII only: PowerShell 5.1 reads a script
# without a BOM in the system code page.
#
# Edge (or Chrome) in headless mode screenshots the SVG at 1200x675, the PNG is
# saved to Pictures\Clawd Reports and put on the clipboard (as PNG and as a
# bitmap, so browsers and chat apps both paste it), and only the latest $Keep
# Clawd-report-*.png files are kept: older ones go to the Recycle Bin.
# Success: stdout is the PNG's full path and nothing else. Failure: the reason
# on stderr and a non-zero exit code.
param(
  [Parameter(Mandatory = $true)][string]$Svg,
  [Parameter(Mandatory = $true)][string]$Name,
  [int]$Keep = 20
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

function Find-Browser {
  $candidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  foreach ($exe in @('msedge.exe', 'chrome.exe')) {
    foreach ($hive in @('HKLM', 'HKCU')) {
      $key = "${hive}:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\$exe"
      $path = (Get-ItemProperty -Path $key -ErrorAction SilentlyContinue).'(default)'
      if ($path) { $candidates += $path.Trim('"') }
    }
  }
  foreach ($path in $candidates) {
    if ($path -and (Test-Path -LiteralPath $path)) { return $path }
  }

  return $null
}

$work = Join-Path ([IO.Path]::GetTempPath()) ("clawd-card-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
  $browser = Find-Browser
  if (-not $browser) { throw 'Microsoft Edge or Google Chrome not found' }

  $svgPath = Join-Path $work 'card.svg'
  $pngPath = Join-Path $work 'card.png'
  Copy-Item -LiteralPath $Svg -Destination $svgPath
  # A profile of its own: with the user's Edge already open, the command would
  # otherwise be handed to that browser and return without a screenshot
  $argv = @(
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1200,675',
    "`"--user-data-dir=$(Join-Path $work 'profile')`"", "`"--screenshot=$pngPath`"",
    "`"$(([Uri]$svgPath).AbsoluteUri)`""
  )
  $proc = Start-Process -FilePath $browser -ArgumentList $argv -WindowStyle Hidden -PassThru
  if (-not $proc.WaitForExit(25000)) {
    try { $proc.Kill() } catch {}
    throw 'the browser did not finish rendering in time'
  }
  if (-not (Test-Path -LiteralPath $pngPath)) { throw "the browser did not write a screenshot ($browser)" }

  $dir = Join-Path ([Environment]::GetFolderPath('MyPictures')) 'Clawd Reports'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $out = Join-Path $dir $Name
  Copy-Item -LiteralPath $pngPath -Destination $out -Force

  # The clipboard needs an STA thread (powershell.exe -Sta)
  Add-Type -AssemblyName System.Windows.Forms, System.Drawing
  $bytes = [IO.File]::ReadAllBytes($out)
  $image = [Drawing.Image]::FromStream((New-Object IO.MemoryStream (, $bytes)))
  $data = New-Object Windows.Forms.DataObject
  $data.SetImage($image)
  $data.SetData('PNG', (New-Object IO.MemoryStream (, $bytes)))
  [Windows.Forms.Clipboard]::SetDataObject($data, $true)

  Add-Type -AssemblyName Microsoft.VisualBasic
  Get-ChildItem -LiteralPath $dir -Filter 'Clawd-report-*.png' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip $Keep |
    ForEach-Object {
      try {
        [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($_.FullName, 'OnlyErrorDialogs', 'SendToRecycleBin')
      } catch {}
    }

  [Console]::Out.Write($out)
} catch {
  [Console]::Error.Write($_.Exception.Message)
  exit 1
} finally {
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
  # The temporary SVG the plugin wrote
  Remove-Item -LiteralPath $Svg -Force -ErrorAction SilentlyContinue
}
