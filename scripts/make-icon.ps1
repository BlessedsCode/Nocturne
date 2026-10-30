param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\assets')
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null

function New-RoundedPath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-IconBitmap([int]$size) {
  $canvas = [Math]::Max(256, $size * 4)
  $bitmap = [System.Drawing.Bitmap]::new($canvas, $canvas, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $path = New-RoundedPath 0 0 $canvas $canvas ([float]($canvas * 0.20))
  $bounds = [System.Drawing.RectangleF]::new(0, 0, $canvas, $canvas)
  $background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $bounds,
    [System.Drawing.Color]::FromArgb(255, 28, 28, 34),
    [System.Drawing.Color]::FromArgb(255, 9, 9, 12),
    55.0
  )
  $graphics.FillPath($background, $path)
  $background.Dispose()

  $border = [System.Drawing.Pen]::new(
    [System.Drawing.Color]::FromArgb(24, 255, 255, 255),
    [float]([Math]::Max(1, $canvas * 0.003))
  )
  $graphics.DrawPath($border, $path)
  $border.Dispose()

  $family = [System.Drawing.FontFamily]::new('Georgia')
  $font = [System.Drawing.Font]::new($family, [float]($canvas * 0.74), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $format.FormatFlags = [System.Drawing.StringFormatFlags]::NoClip

  $shadow = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(70, 0, 0, 0))
  for ($step = 1; $step -le 4; $step++) {
    $offset = [float]($canvas * 0.0025 * $step)
    $shadowBounds = [System.Drawing.RectangleF]::new(0, [float](-$canvas * 0.01 + $offset), $canvas, $canvas)
    $graphics.DrawString('N', $font, $shadow, $shadowBounds, $format)
  }
  $shadow.Dispose()

  $ink = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 239, 232, 216))
  $inkBounds = [System.Drawing.RectangleF]::new(0, [float](-$canvas * 0.01), $canvas, $canvas)
  $graphics.DrawString('N', $font, $ink, $inkBounds, $format)
  $ink.Dispose()
  $font.Dispose()
  $family.Dispose()
  $format.Dispose()
  $path.Dispose()
  $graphics.Dispose()

  if ($size -eq $canvas) { return $bitmap }

  $result = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $resize = [System.Drawing.Graphics]::FromImage($result)
  $resize.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $resize.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $resize.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $resize.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $resize.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $target = [System.Drawing.Rectangle]::new(0, 0, $size, $size)
  $resize.DrawImage($bitmap, $target, 0, 0, $canvas, $canvas, [System.Drawing.GraphicsUnit]::Pixel)
  $resize.Dispose()
  $bitmap.Dispose()
  return $result
}

$preview = New-IconBitmap 512
$preview.Save((Join-Path $OutputDirectory 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$preview.Dispose()

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = @()
foreach ($size in $sizes) {
  $bitmap = New-IconBitmap $size
  $stream = [System.IO.MemoryStream]::new()
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  $images += ,$stream.ToArray()
  $stream.Dispose()
}

$iconPath = Join-Path $OutputDirectory 'icon.ico'
$file = [System.IO.File]::Create($iconPath)
$writer = [System.IO.BinaryWriter]::new($file)
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($index = 0; $index -lt $sizes.Count; $index++) {
  $size = $sizes[$index]
  $writer.Write([byte]$(if ($size -ge 256) { 0 } else { $size }))
  $writer.Write([byte]$(if ($size -ge 256) { 0 } else { $size }))
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]$images[$index].Length)
  $writer.Write([UInt32]$offset)
  $offset += $images[$index].Length
}
foreach ($image in $images) { $writer.Write($image) }
$writer.Dispose()
$file.Dispose()

Write-Output "Wrote $iconPath and $(Join-Path $OutputDirectory 'icon.png')"
