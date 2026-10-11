<#
  多克多比 —— 素材/缓存 收集器  (collect.ps1)

  用途：在一台"当年可能玩过这款页游"的电脑上，自动找出还残留的游戏素材，
        雕刻出可用的文件，打成 zip，供研究/复原使用。

  它做什么
    1. 扫 Flash 状态目录（#SharedObjects 里的 .sol 存档 / 设置）
    2. 扫各浏览器缓存目录（IE/Edge/Chrome/360/QQ/搜狗/Firefox ...）
    3. 扫游戏盒 / 微端 / 安装目录（7k7k、4399、多克多比、doco、flash 等关键词）
    4. 全盘搜 .swf / .sol / .flv（可用 -Quick 跳过）
    5. 对含 SWF 特征的文件按 magic bytes 雕刻，逐个校验，去重
    6. 输出 报告.txt + manifest.json + 分类素材 + 一个 zip

  它刻意不做
    * 不收集 Cookie、浏览历史、密码、登录凭据
    * 不打包任何"未经 magic 校验通过"的原始缓存内容（除非显式 -IncludeRawCache）
    * 不修改、更不删除任何东西；全程只读

  用法
    .\collect.ps1                 完整扫描
    .\collect.ps1 -Quick          只扫缓存与已知目录，不扫全盘
    .\collect.ps1 -NoSol          不收 .sol 存档（怕里面带账号名）
    .\collect.ps1 -SelfTest       自检：用临时假样本验证雕刻逻辑，不碰真实数据
#>
#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$Quick,
    [switch]$NoSol,
    [switch]$IncludeRawCache,
    [switch]$SelfTest,
    [string]$OutDir,
    [int]$SweepMinutes = 15,
    [int]$MaxInMemoryMB = 512
)

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$ErrorActionPreference = 'Continue'

# ---------------------------------------------------------------- 基础设施 ---

$Script:Notes = New-Object System.Collections.Generic.List[string]
function Say([string]$m) { Write-Host $m; $Script:Notes.Add($m) | Out-Null }
function Warn([string]$m) { Write-Host $m -ForegroundColor Yellow; $Script:Notes.Add($m) | Out-Null }

function Get-Adler32([byte[]]$data) {
    $a = 1; $b = 0
    foreach ($x in $data) {
        $a = ($a + $x) % 65521
        $b = ($b + $a) % 65521
    }
    return [uint32](([uint32]$b -shl 16) -bor [uint32]$a)
}

function Get-Sha256Hex([byte[]]$data) {
    $h = [System.Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($h.ComputeHash($data)) -replace '-', '').ToLower() }
    finally { $h.Dispose() }
}

# ------------------------------------------------- 原生加速：扫描 + 精确雕刻 ---
# 纯 PowerShell 逐字节扫几百 MB 会慢到不可用，所以把热点放进 C#。
$Script:Native = $null
try {
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;

public sealed class CountStream : Stream {
    private readonly Stream _inner;
    public long Consumed;
    public CountStream(Stream inner) { _inner = inner; }
    public override bool CanRead { get { return true; } }
    public override bool CanSeek { get { return false; } }
    public override bool CanWrite { get { return false; } }
    public override long Length { get { throw new NotSupportedException(); } }
    public override long Position { get { return Consumed; } set { throw new NotSupportedException(); } }
    public override void Flush() { }
    public override long Seek(long o, SeekOrigin s) { throw new NotSupportedException(); }
    public override void SetLength(long v) { throw new NotSupportedException(); }
    public override void Write(byte[] b, int o, int c) { throw new NotSupportedException(); }
    public override int Read(byte[] b, int o, int c) { int n = _inner.Read(b, o, c); Consumed += n; return n; }
}

public static class Carver {
    // SWF: 'FWS' | 'CWS' | 'ZWS'     SOL: 00 BF <len:4> 'TCSO'     FLV: 'FLV' 01
    public static long[] Scan(byte[] buf, int from, int to, int maxHits) {
        var hits = new List<long>();
        for (int i = from; i + 3 < to; i++) {
            byte b0 = buf[i];
            if ((b0 == 0x46 || b0 == 0x43 || b0 == 0x5A) && buf[i+1] == 0x57 && buf[i+2] == 0x53) {
                // FWS / CWS / ZWS are the only 3-byte signature families we care about
                if (b0 == 0x46 || b0 == 0x43 || b0 == 0x5A) { hits.Add(i); i += 2; if (hits.Count >= maxHits) return hits.ToArray(); continue; }
            }
            if (b0 == 0x46 && buf[i+1] == 0x4C && buf[i+2] == 0x56 && buf[i+3] == 0x01) {
                hits.Add(i); i += 3; if (hits.Count >= maxHits) return hits.ToArray(); continue;
            }
            if (b0 == 0x00 && buf[i+1] == 0xBF && i + 9 < to &&
                buf[i+6] == 0x54 && buf[i+7] == 0x43 && buf[i+8] == 0x53 && buf[i+9] == 0x4F) {
                hits.Add(i); i += 9; if (hits.Count >= maxHits) return hits.ToArray(); continue;
            }
        }
        return hits.ToArray();
    }

    private static uint Adler32(byte[] d) {
        uint a = 1, b = 0;
        for (int i = 0; i < d.Length; i++) { a = (a + d[i]) % 65521; b = (b + a) % 65521; }
        return (b << 16) | a;
    }

    // Exact on-disk length of the SWF at `off`, or -1 when it is not a valid
    // FWS/CWS stream. ZWS (LZMA) returns -1 on purpose: the caller falls back.
    public static long Measure(byte[] buf, int off) {
        if (off < 0 || off + 8 > buf.Length) return -1;
        byte s0 = buf[off], s1 = buf[off+1], s2 = buf[off+2];
        bool isFws = (s0 == 0x46 && s1 == 0x57 && s2 == 0x53);
        bool isCws = (s0 == 0x43 && s1 == 0x57 && s2 == 0x53);
        if (!isFws && !isCws) return -1;
        long declared = (long)buf[off+4] | ((long)buf[off+5] << 8) | ((long)buf[off+6] << 16) | ((long)buf[off+7] << 24);
        if (declared < 8) return -1;
        if (isFws) return (off + declared <= buf.Length) ? declared : -1;

        // A CWS file stores its 8-byte header uncompressed; the zlib stream that
        // follows carries bytes 8..FileLength, so it must inflate to declared - 8.
        long expect = declared - 8;

        int zStart = off + 8;
        if (zStart + 2 >= buf.Length) return -1;
        var inner = new MemoryStream(buf, zStart + 2, buf.Length - zStart - 2, false);
        var cs = new CountStream(inner);
        var chunk = new byte[65536];
        var acc = new MemoryStream();
        long produced = 0;
        try {
            using (var ds = new DeflateStream(cs, CompressionMode.Decompress)) {
                while (true) {
                    int n = ds.Read(chunk, 0, chunk.Length);
                    if (n <= 0) break;
                    produced += n;
                    if (produced > expect) return -1;
                    acc.Write(chunk, 0, n);
                }
            }
        } catch { return -1; }
        if (produced != expect) return -1;

        // The deflate stream ends before CountStream's read-ahead, so locate the
        // zlib adler32 trailer to recover the exact end.
        uint want = Adler32(acc.ToArray());
        long upper = zStart + 2 + cs.Consumed + 4;
        if (upper > buf.Length) upper = buf.Length;
        long lower = upper - 8192 - 8;
        if (lower < zStart + 2) lower = zStart + 2;
        long found = -1;
        for (long p = upper - 4; p >= lower; p--) {
            if (buf[p] == (byte)(want >> 24) && buf[p+1] == (byte)(want >> 16) &&
                buf[p+2] == (byte)(want >> 8) && buf[p+3] == (byte)want) { found = p; break; }
        }
        long end = (found >= 0) ? found + 4 : upper;
        if (end > buf.Length) end = buf.Length;
        if (end <= off) return -1;
        return end - off;
    }
}
'@ -ErrorAction Stop
    $Script:Native = [Carver]
    Say '  [ok] 已加载原生加速模块（精确雕刻）'
} catch {
    Warn "  [!] 原生模块不可用，改用兼容模式（较慢，CWS 尾部可能略长）：$($_.Exception.Message)"
}

function Find-Hits([byte[]]$buf, [int]$maxHits) {
    if ($Script:Native -ne $null) { return @($Script:Native::Scan($buf, 0, $buf.Length, $maxHits)) }
    # 兼容模式：只在开头找，避免极慢的逐字节扫描
    $out = New-Object System.Collections.Generic.List[long]
    $limit = [Math]::Min($buf.Length, 4MB)
    for ($i = 0; $i -lt $limit - 10; $i++) {
        $b0 = $buf[$i]
        if (($b0 -eq 0x46 -or $b0 -eq 0x43 -or $b0 -eq 0x5A) -and $buf[$i+1] -eq 0x57 -and $buf[$i+2] -eq 0x53) { $out.Add($i); continue }
        if ($b0 -eq 0x46 -and $buf[$i+1] -eq 0x4C -and $buf[$i+2] -eq 0x56 -and $buf[$i+3] -eq 0x01) { $out.Add($i); continue }
        if ($b0 -eq 0x00 -and $buf[$i+1] -eq 0xBF -and $i + 9 -lt $limit -and $buf[$i+6] -eq 0x54 -and $buf[$i+7] -eq 0x43 -and $buf[$i+8] -eq 0x53 -and $buf[$i+9] -eq 0x4F) { $out.Add($i); continue }
    }
    return $out.ToArray()
}

function Get-KindAt([byte[]]$buf, [long]$off) {
    if ($off + 3 -gt $buf.Length) { return $null }
    $b0 = $buf[$off]; $b1 = $buf[$off+1]; $b2 = $buf[$off+2]
    if ($b1 -eq 0x57 -and $b2 -eq 0x53) {
        if ($b0 -eq 0x46) { return 'FWS' }
        if ($b0 -eq 0x43) { return 'CWS' }
        if ($b0 -eq 0x5A) { return 'ZWS' }
    }
    if ($b0 -eq 0x46 -and $off + 3 -lt $buf.Length -and $b1 -eq 0x4C -and $b2 -eq 0x56 -and $buf[$off+3] -eq 0x01) { return 'FLV' }
    if ($b0 -eq 0x00 -and $b1 -eq 0xBF) { return 'SOL' }
    return $null
}

# ------------------------------------------------------------------ 收集箱 ---

$Script:Seen = @{}          # sha256 -> artifact
$Script:Artifacts = New-Object System.Collections.Generic.List[object]
$Script:Candidates = New-Object System.Collections.Generic.List[object]
$Script:ScannedDirs = New-Object System.Collections.Generic.List[object]

function Save-Artifact([byte[]]$bytes, [string]$ext, [string]$kind, [string]$source, [bool]$exact) {
    $hash = Get-Sha256Hex $bytes
    if ($Script:Seen.ContainsKey($hash)) {
        $Script:Seen[$hash].AlsoSeen += 1
        return $null
    }
    $name = '{0}_{1}.{2}' -f $hash.Substring(0, 12), $kind.ToLower(), $ext
    $rec = [PSCustomObject]@{
        Hash = $hash; Name = $name; Kind = $kind; Ext = $ext
        Length = $bytes.Length; Source = $source; Exact = $exact; AlsoSeen = 0
    }
    $Script:Seen[$hash] = $rec
    $Script:Artifacts.Add([PSCustomObject]@{ Record = $rec; Bytes = $bytes })
    return $rec
}

# 从一块内存里雕刻出所有可校验的素材
function Invoke-CarveBuffer([byte[]]$buf, [string]$source, [bool]$isCacheLike) {
    $hits = Find-Hits $buf 4000
    if ($hits.Count -eq 0) { return }
    $i = 0
    while ($i -lt $hits.Count) {
        $off = [long]$hits[$i]
        $kind = Get-KindAt $buf $off
        if ($kind -eq $null) { $i++; continue }

        # 下一个命中点，作为"最长可切范围"（避免把后面无关数据包进来）
        $nextOff = $buf.Length
        if ($i + 1 -lt $hits.Count) { $nextOff = [long]$hits[$i+1] }

        if ($kind -eq 'FWS' -or $kind -eq 'CWS') {
            $len = -1
            $exact = $true
            if ($Script:Native -ne $null) {
                try { $len = $Script:Native::Measure($buf, [int]$off) } catch { $len = -1 }
            } elseif ($kind -eq 'FWS') {
                $declared = [BitConverter]::ToUInt32($buf, [int]$off + 4)
                if ($off + $declared -le $buf.Length) { $len = $declared }
            } else {
                # 兼容模式没有精确切尾能力。CWS 是绝大多数，宁可交出"尾部可能偏长"
                # 的文件，也不要因为无法校验就整体丢弃。
                $end = $nextOff
                if ($end - $off -gt 64MB) { $end = $off + 64MB }
                if ($end - $off -gt 16) { $len = [int]($end - $off); $exact = $false }
            }
            if ($len -gt 0) {
                $bytes = New-Object byte[] $len
                [Array]::Copy($buf, $off, $bytes, 0, $len)
                Save-Artifact $bytes 'swf' $kind $source $exact | Out-Null
            } else {
                # 校验不过：可能是被截断、版本不符、或只是恰好撞上 'FWS' 三个字节
                $declared = if ($off + 8 -le $buf.Length) { [BitConverter]::ToUInt32($buf, [int]$off + 4) } else { 0 }
                $Script:Candidates.Add([PSCustomObject]@{ Offset = $off; Kind = $kind; Declared = $declared; Source = $source })
            }
        }
        elseif ($kind -eq 'ZWS') {
            # LZMA 压缩的 SWF：无法精确切尾，切到下一个命中点，标注为不确定
            $end = $nextOff
            if ($end - $off -gt 1MB) { $end = $off + 1MB }
            $len = [int]($end - $off)
            if ($len -gt 16) {
                $bytes = New-Object byte[] $len
                [Array]::Copy($buf, $off, $bytes, 0, $len)
                Save-Artifact $bytes 'swf' 'ZWS-uncertain' $source $false | Out-Null
            }
        }
        elseif ($kind -eq 'FLV') {
            $end = $nextOff
            if ($end - $off -gt 64MB) { $end = $off + 64MB }
            $len = [int]($end - $off)
            if ($len -gt 16) {
                $bytes = New-Object byte[] $len
                [Array]::Copy($buf, $off, $bytes, 0, $len)
                Save-Artifact $bytes 'flv' 'FLV' $source $false | Out-Null
            }
        }
        elseif ($kind -eq 'SOL' -and -not $NoSol) {
            # .sol 结尾没有长度字段，切到文件尾（存档本来就很小）
            $len = [int]($buf.Length - $off)
            if ($len -gt 4 -and $len -lt 16MB) {
                $bytes = New-Object byte[] $len
                [Array]::Copy($buf, $off, $bytes, 0, $len)
                Save-Artifact $bytes 'sol' 'SOL' $source $true | Out-Null
            }
        }
        $i++
    }
}

function Invoke-CarveFile([string]$path, [string]$label) {
    try {
        $fi = Get-Item -LiteralPath $path -ErrorAction Stop
        if ($fi.Length -eq 0) { return }
        if ($fi.Length -gt ($MaxInMemoryMB * 1MB)) {
            $Script:Candidates.Add([PSCustomObject]@{ Offset = -1; Kind = 'skipped-too-big'; Declared = $fi.Length; Source = $path })
            return
        }
        $bytes = [System.IO.File]::ReadAllBytes($path)
        Invoke-CarveBuffer $bytes $path $true
    } catch {
        # 被占用 / 权限不足 / 路径过长：跳过即可
    }
}

# ------------------------------------------------------------------ 扫描面 ---

function Test-Dir([string]$p) { return (Test-Path -LiteralPath $p -PathType Container) }

function Get-CacheDirs {
    $found = New-Object System.Collections.Generic.List[string]
    $explicit = @(
        "$env:LOCALAPPDATA\Microsoft\Windows\INetCache",
        "$env:LOCALAPPDATA\Microsoft\Windows\Temporary Internet Files",
        "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache",
        "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache",
        "$env:LOCALAPPDATA\360Chrome\Chrome\User Data\Default\Cache",
        "$env:LOCALAPPDATA\360ChromeX\Chrome\User Data\Default\Cache",
        "$env:LOCALAPPDATA\Tencent\QQBrowser\User Data\Default\Cache",
        "$env:LOCALAPPDATA\SogouExplorer\Webkit\Default\Cache",
        "$env:LOCALAPPDATA\Maxthon5\Users\*\Default\Cache",
        "$env:LOCALAPPDATA\Baidu\BaiduBrowser\User Data\Default\Cache"
    )
    foreach ($p in $explicit) { foreach ($r in @(Resolve-Path -Path $p -ErrorAction SilentlyContinue)) { if (Test-Dir $r.Path) { $found.Add($r.Path) } } }

    # 泛化发现：AppData 下任意一层里叫 Cache / Code Cache 的目录
    foreach ($root in @("$env:LOCALAPPDATA", "$env:APPDATA")) {
        if (-not (Test-Dir $root)) { continue }
        try {
            Get-ChildItem -LiteralPath $root -Directory -Recurse -Depth 4 -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -eq 'Cache' -or $_.Name -eq 'Code Cache' -or $_.Name -eq 'cache2' -or $_.Name -eq 'INetCache' } |
                ForEach-Object { $found.Add($_.FullName) }
        } catch { }
    }
    return ($found | Sort-Object -Unique)
}

function Get-FlashDirs {
    $out = New-Object System.Collections.Generic.List[string]
    foreach ($p in @("$env:APPDATA\Macromedia\Flash Player", "$env:LOCALAPPDATA\Macromedia\Flash Player")) {
        if (Test-Dir $p) { $out.Add($p) }
    }
    return $out
}

function Get-GameDirs {
    $keys = '7k7k', '4399', '多克多比', 'doco', 'dkdb', '游戏盒', '微端', '页游', 'flash', 'macromedia', 'adobe air', 'duoduobi'
    $out = New-Object System.Collections.Generic.List[string]

    # 1) 注册表卸载项里的安装目录
    foreach ($hive in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
                        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
                        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall')) {
        if (-not (Test-Path $hive)) { continue }
        Get-ChildItem $hive -ErrorAction SilentlyContinue | ForEach-Object {
            $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
            if ($null -eq $p) { return }
            $text = ('' + $p.DisplayName + ' ' + $p.Publisher + ' ' + $p.InstallLocation).ToLower()
            foreach ($k in $keys) {
                if ($text.Contains($k) -and $p.InstallLocation -and (Test-Dir $p.InstallLocation)) {
                    $out.Add($p.InstallLocation); break
                }
            }
        }
    }

    # 2) 常见根目录下按关键词匹配（浅层，快）
    $roots = New-Object System.Collections.Generic.List[string]
    Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | Where-Object { $_.Free -ne $null } | ForEach-Object { $roots.Add($_.Root) }
    foreach ($r in @("$env:ProgramFiles", "${env:ProgramFiles(x86)}", "$env:LOCALAPPDATA", "$env:APPDATA", "$env:ProgramData", "$env:USERPROFILE\Desktop", "$env:USERPROFILE\Documents", "$env:PUBLIC")) {
        if ($r -and (Test-Dir $r)) { $roots.Add($r) }
    }
    foreach ($root in ($roots | Sort-Object -Unique)) {
        foreach ($depth in @(1, 2)) {
            try {
                Get-ChildItem -LiteralPath $root -Directory -Depth ($depth - 1) -ErrorAction SilentlyContinue | ForEach-Object {
                    $n = $_.Name.ToLower()
                    foreach ($k in $keys) { if ($n.Contains($k)) { $out.Add($_.FullName); break } }
                }
            } catch { }
        }
    }
    return ($out | Sort-Object -Unique)
}

# 手动递归，跳过大目录，避免 Get-ChildItem -Recurse 在 C:\Windows 上耗死
$Script:SkipDirNames = @('Windows', '$Recycle.Bin', 'System Volume Information', 'node_modules', '.git',
                         'WinSxS', 'Installer', 'assembly', 'Microsoft.NET', 'DriverStore',
                         'Recovery', 'PerfLogs', 'MSOCache', 'Config.Msi', 'Temp', 'tmp')

function Invoke-WalkForFiles([string]$root, [string[]]$patterns, [int]$timeoutSec, [string]$label) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    $stack = New-Object System.Collections.Stack
    $stack.Push($root)
    $n = 0
    while ($stack.Count -gt 0) {
        if ((Get-Date) -gt $deadline) { Warn "    [$label] 到时间上限，停止（已看 $n 个目录）"; break }
        $dir = $stack.Pop()
        try {
            foreach ($f in [System.IO.Directory]::EnumerateFiles($dir)) {
                foreach ($pat in $patterns) {
                    if ($f.EndsWith($pat, [StringComparison]::OrdinalIgnoreCase)) {
                        $n++
                        Invoke-CarveFile $f $label
                        break
                    }
                }
            }
        } catch { }
        try {
            foreach ($d in [System.IO.Directory]::EnumerateDirectories($dir)) {
                $name = [System.IO.Path]::GetFileName($d)
                if ($Script:SkipDirNames -contains $name) { continue }
                $stack.Push($d)
            }
        } catch { }
    }
    return $n
}

# ------------------------------------------------------------------- 自检 ---

function New-TestSwf([int]$bodyLen, [bool]$compressed) {
    $rng = New-Object System.Random 20260927
    $body = New-Object byte[] $bodyLen
    $rng.NextBytes($body)
    $total = [uint32](8 + $bodyLen)
    $ms = New-Object System.IO.MemoryStream
    if (-not $compressed) {
        $ms.Write([byte[]](0x46, 0x57, 0x53), 0, 3)      # FWS
        $ms.WriteByte(10)
        $ms.Write([BitConverter]::GetBytes($total), 0, 4)
        $ms.Write($body, 0, $bodyLen)
    } else {
        $ms.Write([byte[]](0x43, 0x57, 0x53), 0, 3)      # CWS
        $ms.WriteByte(10)
        $ms.Write([BitConverter]::GetBytes($total), 0, 4)
        $ms.WriteByte(0x78); $ms.WriteByte(0x9C)          # zlib header
        $ds = [System.IO.Compression.DeflateStream]::new($ms, [System.IO.Compression.CompressionMode]::Compress, $true)
        $ds.Write($body, 0, $bodyLen)
        $ds.Dispose()
        $ad = Get-Adler32 $body
        $ms.Write([byte[]]@([byte](($ad -shr 24) -band 0xFF), [byte](($ad -shr 16) -band 0xFF), [byte](($ad -shr 8) -band 0xFF), [byte]($ad -band 0xFF)), 0, 4)
    }
    $out = $ms.ToArray()
    $ms.Dispose()
    return $out
}

function Invoke-SelfTest {
    Say '自检：用临时假样本验证扫描与雕刻逻辑（不碰真实数据）'
    $tmp = Join-Path $env:TEMP ('dkdb-selftest-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    $fail = 0
    try {
        $fws = New-TestSwf 4096 $false
        $cws = New-TestSwf 20000 $true
        Say ("  FWS 样本: {0} 字节 (声明 {1})" -f $fws.Length, [BitConverter]::ToUInt32($fws, 4))
        Say ("  CWS 样本: {0} 字节 (解压后声明 {1})" -f $cws.Length, [BitConverter]::ToUInt32($cws, 4))

        # 模拟"缓存文件"：前面塞 777 字节垃圾，后面再塞一点尾巴
        $junk1 = New-Object byte[] 777
        (New-Object System.Random 7).NextBytes($junk1)
        $blob = New-Object byte[] (777 + $fws.Length + 100 + $cws.Length + 33)
        [Array]::Copy($junk1, 0, $blob, 0, 777)
        [Array]::Copy($fws, 0, $blob, 777, $fws.Length)
        [Array]::Copy($cws, 0, $blob, 777 + $fws.Length + 100, $cws.Length)
        $cachePath = Join-Path $tmp 'f_000001'

        $sol = New-Object byte[] 64
        $sol[0] = 0x00; $sol[1] = 0xBF; $sol[5] = 0x3A
        [byte[]](0x54, 0x43, 0x53, 0x4F) | ForEach-Object -Begin { $i = 6 } -Process { $sol[$i] = $_; $i++ }
        $solPath = Join-Path $tmp 'test.sol'
        [System.IO.File]::WriteAllBytes($solPath, $sol)

        $Script:Seen = @{}; $Script:Artifacts = New-Object System.Collections.Generic.List[object]
        $Script:Candidates = New-Object System.Collections.Generic.List[object]

        Invoke-CarveBuffer $blob $cachePath $true
        Invoke-CarveBuffer $sol $solPath $true

        $byKind = @{}
        foreach ($a in $Script:Artifacts) { $k = $a.Record.Kind; $byKind[$k] = 1 + $(if ($byKind.ContainsKey($k)) { $byKind[$k] } else { 0 }) }
        Say ("  雕刻结果: " + (($byKind.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ' '))

        $exactFws = @($Script:Artifacts | Where-Object { $_.Record.Kind -eq 'FWS' })
        $exactCws = @($Script:Artifacts | Where-Object { $_.Record.Kind -eq 'CWS' })
        $solHits  = @($Script:Artifacts | Where-Object { $_.Record.Kind -eq 'SOL' })

        if ($exactFws.Count -ne 1) { Warn "  [FAIL] FWS 应命中 1 个，实际 $($exactFws.Count)"; $fail++ }
        elseif ($exactFws[0].Record.Length -ne $fws.Length) { Warn "  [FAIL] FWS 长度 $($exactFws[0].Record.Length) ≠ $($fws.Length)"; $fail++ }
        else { Say "  [ok] FWS 精确雕刻，长度 $($fws.Length) 完全一致" }

        if ($exactCws.Count -ne 1) { Warn "  [FAIL] CWS 应命中 1 个，实际 $($exactCws.Count)"; $fail++ }
        elseif ($Script:Native -eq $null) { Say "  [--] CWS 命中但兼容模式无法精确切尾（预期）" }
        elseif ($exactCws[0].Record.Length -ne $cws.Length) { Warn "  [FAIL] CWS 长度 $($exactCws[0].Record.Length) ≠ $($cws.Length)（尾部未精确切掉）"; $fail++ }
        else { Say "  [ok] CWS 精确雕刻，长度 $($cws.Length) 完全一致（adler32 定位成功）" }

        if ($solHits.Count -ne 1) { Warn "  [FAIL] SOL 应命中 1 个，实际 $($solHits.Count)"; $fail++ }
        else { Say "  [ok] SOL 命中" }

        $before = $Script:Artifacts.Count
        Invoke-CarveBuffer $blob $cachePath $true
        if ($Script:Artifacts.Count -ne $before) { Warn "  [FAIL] 去重失效"; $fail++ } else { Say "  [ok] 去重生效（重复扫描不再新增）" }
    } finally {
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($fail -eq 0) { Say "自检通过。" } else { Warn "自检失败 $fail 项。" }
    exit $fail
}

# -------------------------------------------------------------------- 主流程 ---

if ($SelfTest) { Invoke-SelfTest }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$machine = $env:COMPUTERNAME
if (-not $OutDir) { $OutDir = [Environment]::GetFolderPath('Desktop') }
if (-not (Test-Dir $OutDir)) { $OutDir = $env:TEMP }
$root = Join-Path $OutDir ("多克多比收集_{0}_{1}" -f $machine, $stamp)
New-Item -ItemType Directory -Path $root -Force | Out-Null
$dirs = @{}
foreach ($d in @('swf', 'sol', 'flv', 'other', '_原始缓存样本')) {
    $p = Join-Path $root $d
    New-Item -ItemType Directory -Path $p -Force | Out-Null
    $dirs[$d] = $p
}

Say '================================================================'
Say ' 多克多比 —— 素材/缓存收集器'
Say '================================================================'
Say (" 机器      : {0}" -f $machine)
Say (" 输出目录  : {0}" -f $root)
Say (" 模式      : {0}{1}" -f $(if ($Quick) { '快速（不扫全盘）' } else { '完整（含全盘搜索）' }), $(if ($NoSol) { ' / 不收 .sol' } else { '' }))
Say ''
Say ' 隐私说明：本工具只读取，不修改、不删除任何文件。'
Say '           只会打包"通过 magic 校验"的 SWF/SOL/FLV 片段，'
Say '           不会收集 Cookie、浏览历史、密码或登录凭据。'
Say ''

$t0 = Get-Date

# --- 1. Flash 状态 ---------------------------------------------------------
Say '[1/5] Flash 状态目录'
$flashDirs = Get-FlashDirs
if ($flashDirs.Count -eq 0) { Say '      未发现 Macromedia\Flash Player 目录（这台机器可能从没装过 Flash）' }
foreach ($d in $flashDirs) {
    $files = @(Get-ChildItem -LiteralPath $d -Recurse -File -ErrorAction SilentlyContinue)
    Say ("      {0}  ({1} 个文件)" -f $d, $files.Count)
    foreach ($f in $files) { Invoke-CarveFile $f.FullName 'flash' }
    $Script:ScannedDirs.Add([PSCustomObject]@{ Phase = 'Flash'; Dir = $d; Files = $files.Count })
}
$solCount = @($Script:Artifacts | Where-Object { $_.Record.Kind -eq 'SOL' }).Count
Say ("      → .sol 存档 {0} 个" -f $solCount)

# --- 2. 浏览器缓存 ---------------------------------------------------------
Say ''
Say '[2/5] 浏览器缓存目录'
$cacheDirs = Get-CacheDirs
if ($cacheDirs.Count -eq 0) { Say '      未发现任何浏览器缓存目录' }
foreach ($d in $cacheDirs) {
    $files = @(Get-ChildItem -LiteralPath $d -Recurse -File -ErrorAction SilentlyContinue)
    if ($files.Count -eq 0) { continue }
    $mb = [Math]::Round((($files | Measure-Object Length -Sum).Sum) / 1MB, 1)
    Say ("      {0}  ({1} 个文件 / {2} MB)" -f $d, $files.Count, $mb)
    foreach ($f in $files) { Invoke-CarveFile $f.FullName 'cache' }
    $Script:ScannedDirs.Add([PSCustomObject]@{ Phase = 'Cache'; Dir = $d; Files = $files.Count })
}

# --- 3. 游戏盒 / 微端 / 安装目录 ------------------------------------------
Say ''
Say '[3/5] 游戏盒 / 微端 / 相关安装目录'
$gameDirs = Get-GameDirs
if ($gameDirs.Count -eq 0) { Say '      未发现关键词匹配的安装目录' }
foreach ($d in $gameDirs) {
    Say ("      {0}" -f $d)
    $n = Invoke-WalkForFiles $d @('.swf', '.sol', '.flv') 600 'gamedir'
    $Script:ScannedDirs.Add([PSCustomObject]@{ Phase = 'GameDir'; Dir = $d; Files = $n })
}

# --- 4. 全盘搜索 -----------------------------------------------------------
Say ''
if ($Quick) {
    Say '[4/5] 全盘搜索：已按 -Quick 跳过'
} else {
    Say ("[4/5] 全盘搜索 .swf / .sol / .flv（最多 {0} 分钟）" -f $SweepMinutes)
    $drives = @(Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | Where-Object { $_.Free -ne $null } | ForEach-Object { $_.Root })
    $perDrive = [Math]::Max(1, [int]($SweepMinutes * 60 / [Math]::Max(1, $drives.Count)))
    foreach ($dr in $drives) {
        Say ("      {0} ..." -f $dr)
        $n = Invoke-WalkForFiles $dr @('.swf', '.sol', '.flv') $perDrive ("盘 " + $dr)
        Say ("        {0} 个候选文件已看过" -f $n)
        $Script:ScannedDirs.Add([PSCustomObject]@{ Phase = 'Sweep'; Dir = $dr; Files = $n })
    }
}

# --- 5. 落盘 ---------------------------------------------------------------
Say ''
Say '[5/5] 写出结果'
$manifest = New-Object System.Collections.Generic.List[object]
foreach ($a in $Script:Artifacts) {
    $r = $a.Record
    $sub = switch ($r.Ext) { 'swf' { 'swf' } 'sol' { 'sol' } 'flv' { 'flv' } default { 'other' } }
    if ($r.Kind -like 'ZWS*') { $sub = 'other' }
    $target = Join-Path $dirs[$sub] $r.Name
    [System.IO.File]::WriteAllBytes($target, $a.Bytes)
    $manifest.Add([PSCustomObject]@{
        name = $r.Name; kind = $r.Kind; ext = $r.Ext; bytes = $r.Length
        sha256 = $r.Hash; exact = $r.Exact; source = $r.Source; duplicates = $r.AlsoSeen
    })
}

$swfAll = @($Script:Artifacts | Where-Object { $_.Record.Ext -eq 'swf' })
$swfOk  = @($swfAll | Where-Object { $_.Record.Kind -eq 'FWS' -or $_.Record.Kind -eq 'CWS' })
$swfUnc = @($swfAll | Where-Object { $_.Record.Kind -like 'ZWS*' })
$solAll = @($Script:Artifacts | Where-Object { $_.Record.Ext -eq 'sol' })
$flvAll = @($Script:Artifacts | Where-Object { $_.Record.Ext -eq 'flv' })

Say ''
Say '----------------------------------------------------------------'
Say ' 汇总'
Say '----------------------------------------------------------------'
Say ("  可用 SWF (FWS/CWS 精确) : {0} 个 / {1:N0} 字节" -f $swfOk.Count, (($swfOk | Measure-Object { $_.Record.Length } -Sum).Sum))
Say ("  不确定 SWF (ZWS)        : {0} 个" -f $swfUnc.Count)
Say ("  .sol 存档               : {0} 个 / {1:N0} 字节" -f $solAll.Count, (($solAll | Measure-Object { $_.Record.Length } -Sum).Sum))
Say ("  FLV 视频                : {0} 个" -f $flvAll.Count)
Say ("  未通过校验的候选        : {0} 处" -f $Script:Candidates.Count)
Say ("  耗时                    : {0:N1} 分钟" -f ((Get-Date) - $t0).TotalMinutes)

if ($swfOk.Count -eq 0 -and $solAll.Count -eq 0) {
    Say ''
    Warn '  这台机器上没有找到任何可用的 SWF 或 .sol 存档。'
    Warn '  这很常见：Flash 2021-01 已停止支持，缓存通常早被清空。'
    Warn '  仍然建议把结果发回 —— "确实没有"也是有价值的信息。'
}

# 报告 + 清单
$reportPath = Join-Path $root '报告.txt'
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('多克多比 素材/缓存收集报告')
$lines.Add('=' * 60)
$lines.Add("机器名    : $machine")
$lines.Add("时间      : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$lines.Add("输出目录  : $root")
$lines.Add("模式      : $(if ($Quick) { '快速' } else { '完整' }) $(if ($NoSol) { '/ 不含 .sol' } else { '' })")
$lines.Add('')
$lines.Add('隐私说明：本工具只读，不修改任何文件；只打包通过 magic 校验的')
$lines.Add('          SWF/SOL/FLV 片段，不收集 Cookie、历史、密码或凭据。')
$lines.Add('')
$lines.Add('--- 扫描过的位置 ---')
foreach ($s in $Script:ScannedDirs) { $lines.Add(("  [{0}] {1}  ({2} 个文件)" -f $s.Phase, $s.Dir, $s.Files)) }
$lines.Add('')
$lines.Add('--- 找到的素材 ---')
if ($manifest.Count -eq 0) { $lines.Add('  （无）') }
foreach ($m in ($manifest | Sort-Object ext, name)) {
    $lines.Add(("  {0}  {1,12:N0} 字节  exact={2}  {3}" -f $m.name, $m.bytes, $m.exact, $m.kind))
    $lines.Add(("      来源: {0}" -f $m.source))
}
$lines.Add('')
$lines.Add('--- 未通过校验的候选（可能只是恰好撞上特征字节）---')
if ($Script:Candidates.Count -eq 0) { $lines.Add('  （无）') }
foreach ($c in ($Script:Candidates | Select-Object -First 200)) {
    $lines.Add(("  {0}  offset={1}  declared={2}  {3}" -f $c.Kind, $c.Offset, $c.Declared, $c.Source))
}
$lines.Add('')
$lines.Add('--- 操作日志 ---')
foreach ($n in $Script:Notes) { $lines.Add($n) }
[System.IO.File]::WriteAllLines($reportPath, $lines, (New-Object System.Text.UTF8Encoding $false))

$manifestPath = Join-Path $root 'manifest.json'
$json = [PSCustomObject]@{
    machine = $machine; collectedAt = (Get-Date).ToString('o')
    quick = [bool]$Quick; noSol = [bool]$NoSol
    artifacts = $manifest
    candidates = $Script:Candidates
    scanned = $Script:ScannedDirs
} | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($manifestPath, $json, (New-Object System.Text.UTF8Encoding $false))

# 打包
$zip = "$root.zip"
try {
    if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
    Compress-Archive -LiteralPath $root -DestinationPath $zip -CompressionLevel Optimal -ErrorAction Stop
    Say ''
    Say '----------------------------------------------------------------'
    Say ' 把这个文件发回即可：'
    Say ("   {0}" -f $zip)
    Say '----------------------------------------------------------------'
} catch {
    Say ''
    Warn "  自动压缩失败（$($_.Exception.Message)）。请手动把整个文件夹压缩后发回："
    Warn "   $root"
}

if (-not $Quick) {
    Say ''
    Say '提示：如果这台电脑"当年确实玩过"，但结果里没有 SWF，'
    Say '      最可能的原因是系统重装过、或缓存已被浏览器淘汰 —— 这是常态。'
}
