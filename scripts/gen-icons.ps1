Add-Type -AssemblyName System.Drawing
$root = 'c:\Users\ChristopherPaoloLeon\OneDrive - Fruitist Holdings Inc\Escritorio\I+D'
$assets = Join-Path $root 'assets'
$icons = Join-Path $root 'icons'
New-Item -ItemType Directory -Force -Path $assets, $icons | Out-Null

function Draw-Mark([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $m = [Math]::Max(1, [int]($size / 16))
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 22, 76, 124))
  $g.FillEllipse($brush, $m, $m, ($size - 2 * $m), ($size - 2 * $m))
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70, 255, 255, 255))
  $g.FillEllipse($white, [int]($size * 0.22), [int]($size * 0.18), [int]($size * 0.36), [int]($size * 0.34))
  $berry = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 235, 244, 252))
  $r = [Math]::Max(2, [int]($size / 14))
  $cx = [int]($size / 2)
  $cy = [int]($size / 2 + $size / 18)
  $offsets = @(@(-[int]($size / 7), 0), @(0, -[int]($size / 9)), @([int]($size / 7), 0))
  foreach ($off in $offsets) {
    $g.FillEllipse($berry, ($cx + $off[0] - $r), ($cy + $off[1] - $r), (2 * $r), (2 * $r))
  }
  $leaf = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 0, 168, 150))
  $pts = @(
    [System.Drawing.Point]::new($cx, [int]($size / 2 - $size / 5)),
    [System.Drawing.Point]::new($cx + [int]($size / 10), [int]($size / 2 - $size / 12)),
    [System.Drawing.Point]::new($cx, [int]($size / 2 - $size / 14)),
    [System.Drawing.Point]::new($cx - [int]($size / 10), [int]($size / 2 - $size / 12))
  )
  $g.FillPolygon($leaf, $pts)
  $g.Dispose()
  return $bmp
}

$bmp192 = Draw-Mark 192
$bmp512 = Draw-Mark 512
$bmp128 = Draw-Mark 128
$bmp32 = Draw-Mark 32
$bmp192.Save((Join-Path $icons 'icon-192.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp512.Save((Join-Path $icons 'icon-512.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp128.Save((Join-Path $assets 'logo.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp32.Save((Join-Path $root 'favicon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$icon = [System.Drawing.Icon]::FromHandle($bmp32.GetHicon())
$fs = [System.IO.File]::Create((Join-Path $root 'favicon.ico'))
$icon.Save($fs)
$fs.Close()
$bmp192.Dispose()
$bmp512.Dispose()
$bmp128.Dispose()
$bmp32.Dispose()
Write-Output 'OK'
