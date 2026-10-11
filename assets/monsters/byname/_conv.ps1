Add-Type -AssemblyName System.Drawing
$ErrorActionPreference='Continue'
function Conv($src,$dst){ try { $i=[System.Drawing.Image]::FromFile($src); $b=New-Object System.Drawing.Bitmap($i.Width,$i.Height); $g=[System.Drawing.Graphics]::FromImage($b); $g.Clear([System.Drawing.Color]::Transparent); $g.DrawImage($i,0,0,$i.Width,$i.Height); $g.Dispose(); $b.Save($dst,[System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose(); $i.Dispose(); Write-Output ("OK "+$dst) } catch { Write-Output ("ERR "+$dst) } }
Conv "C:\\Users\\wangbujue\\Desktop\\yuanmeng\\assets\\monsters\\byname\\幽灵.jpg" "C:\\Users\\wangbujue\\Desktop\\yuanmeng\\assets\\monsters\\byname\\幽灵.png"
Conv "C:\\Users\\wangbujue\\Desktop\\yuanmeng\\assets\\monsters\\byname\\托米拉.jpg" "C:\\Users\\wangbujue\\Desktop\\yuanmeng\\assets\\monsters\\byname\\托米拉.png"
Conv "C:\\Users\\wangbujue\\Desktop\\yuanmeng\\assets\\monsters\\byname\\河伯形态动画-位图.jpg" "C:\\Users\\wangbujue\\Desktop\\yuanmeng\\assets\\monsters\\byname\\河伯形态动画-位图.png"
Conv "C:\\Users\\wangbujue\\Desktop\\yuanmeng\\assets\\monsters\\byname\\莲蓬童子.jpg" "C:\\Users\\wangbujue\\Desktop\\yuanmeng\\assets\\monsters\\byname\\莲蓬童子.png"
Conv "C:\\Users\\wangbujue\\Desktop\\yuanmeng\\assets\\monsters\\byname\\魔化多比.jpg" "C:\\Users\\wangbujue\\Desktop\\yuanmeng\\assets\\monsters\\byname\\魔化多比.png"