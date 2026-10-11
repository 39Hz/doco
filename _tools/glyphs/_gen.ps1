Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$outDir = 'C:\\Users\\wangbujue\\Desktop\\yuanmeng\\_tools\\glyphs'
$codes = Get-Content -Raw -Encoding UTF8 (Join-Path $outDir '_chars.json') | ConvertFrom-Json
$perRow = 40
$result = @{}
foreach ($size in @(48)) {
  foreach ($styleName in @('regular','bold')) {
    $style = if ($styleName -eq 'bold') { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    $font = New-Object System.Drawing.Font('Microsoft YaHei', [float]$size, $style, [System.Drawing.GraphicsUnit]::Pixel)
    $cell = [int]($size * 1.9) + 6
    $rows = [int][Math]::Ceiling($codes.Count / $perRow)
    $bmp = New-Object System.Drawing.Bitmap([int]($cell * $perRow), [int]($cell * $rows))
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(0,0,0,0))
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    $fmt = [System.Drawing.StringFormat]::GenericTypographic
    $entries = New-Object System.Collections.ArrayList
    for ($i = 0; $i -lt $codes.Count; $i++) {
      $ch = [string][char]$codes[$i]
      $col = $i % $perRow
      $row = [int][Math]::Floor($i / $perRow)
      $ox = $col * $cell + 2
      $oy = $row * $cell + 2
      $sz = $g.MeasureString($ch, $font, 1000, $fmt)
      $g.DrawString($ch, $font, [System.Drawing.Brushes]::White, [float]$ox, [float]$oy, $fmt)
      [void]$entries.Add([pscustomobject]@{ code = $codes[$i]; x = [int]$ox; y = [int]$oy; w = [int][Math]::Ceiling($sz.Width); h = [int][Math]::Ceiling($sz.Height); adv = [double]$sz.Width })
    }
    $g.Dispose()
    $file = Join-Path $outDir ('glyph_' + $size + '_' + $styleName + '.png')
    $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose(); $font.Dispose()
    $result["$size|$styleName"] = [pscustomobject]@{ file = 'glyph_' + $size + '_' + $styleName + '.png'; cell = $cell; perRow = $perRow; entries = $entries }
  }
}
$json = $result | ConvertTo-Json -Depth 6 -Compress
[System.IO.File]::WriteAllText((Join-Path $outDir 'raw.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ('raw.json 已写出: ' + $json.Length + ' 字符')
