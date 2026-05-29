Add-Type -AssemblyName System.Drawing
$root = 'c:\Users\ChristopherPaoloLeon\OneDrive - Fruitist Holdings Inc\Escritorio\I+D'
$log = Join-Path $root 'log.png'
if (-not (Test-Path $log)) { throw "No existe log.png en $root" }

$src = [System.Drawing.Image]::FromFile($log)
$iconsDir = Join-Path $root 'icons'
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

function Save-Resize([int]$size, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($src, 0, 0, $size, $size)
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

Save-Resize 192 (Join-Path $iconsDir 'icon-192.png')
Save-Resize 512 (Join-Path $iconsDir 'icon-512.png')
Save-Resize 32 (Join-Path $root 'favicon.png')

$ico32 = New-Object System.Drawing.Bitmap 32, 32
$g32 = [System.Drawing.Graphics]::FromImage($ico32)
$g32.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g32.DrawImage($src, 0, 0, 32, 32)
$g32.Dispose()
$icon = [System.Drawing.Icon]::FromHandle($ico32.GetHicon())
$fs = [System.IO.File]::Create((Join-Path $root 'favicon.ico'))
$icon.Save($fs)
$fs.Close()
$ico32.Dispose()
$src.Dispose()
Write-Output 'Iconos generados desde log.png'
