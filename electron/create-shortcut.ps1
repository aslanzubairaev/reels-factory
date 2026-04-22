$ErrorActionPreference = 'Stop'
$WshShell = New-Object -comObject WScript.Shell

$desktop = [System.Environment]::GetFolderPath('Desktop')
if (-not (Test-Path $desktop)) {
    # OneDrive fallback
    $desktop = Join-Path $env:USERPROFILE 'Desktop'
}

$lnkPath = Join-Path $desktop 'Reels Factory.lnk'

$Shortcut = $WshShell.CreateShortcut($lnkPath)
$Shortcut.TargetPath      = 'C:\dev\Reels-Factory\start-studio.bat'
$Shortcut.IconLocation    = 'C:\dev\Reels-Factory\electron\icon.ico,0'
$Shortcut.WorkingDirectory= 'C:\dev\Reels-Factory'
$Shortcut.Description     = 'Reels Factory Studio'
$Shortcut.WindowStyle     = 7
$Shortcut.Save()

Write-Output "OK: $lnkPath"
Write-Output ("Exists: " + (Test-Path $lnkPath))
