// 多克多比 · 离线启动器
//
// 作用：把游戏目录用内嵌的 HTTP 服务器挂起来，再用系统自带的 Edge/Chrome
// 以「应用模式」(--app) 打开，得到一个没有地址栏的游戏窗口。
//
// 为什么不用 Electron / NW.js：那些要把整个 Chromium 内核打包进去（200MB+），
// 而本机已有 Edge（Chromium 内核）。这样 exe 只有几十 KB，且无需安装任何运行时。
//
// 为什么用裸 TcpListener 而不是 HttpListener：HttpListener 依赖 Windows 的
// HTTP.sys 与 URL ACL 注册，在受限环境下会抛 PlatformNotSupportedException
// （"此平台上不支持操作"）。裸 socket 手写 HTTP 无此问题。
//
// 编译：csc /target:exe /out:多克多比.exe launcher.cs

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

static class Launcher
{
    const string TITLE = "多克多比";
    const string VERSION = "2.0";

    // 要查找游戏文件的候选目录（按优先级）
    static readonly string[] WEB_CANDIDATES = { "web", "." };

    static readonly Dictionary<string, string> MIME = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        { ".html", "text/html; charset=utf-8" },
        { ".htm",  "text/html; charset=utf-8" },
        { ".css",  "text/css; charset=utf-8" },
        { ".js",   "text/javascript; charset=utf-8" },
        { ".json", "application/json; charset=utf-8" },
        { ".png",  "image/png" },
        { ".jpg",  "image/jpeg" },
        { ".jpeg", "image/jpeg" },
        { ".gif",  "image/gif" },
        { ".bmp",  "image/bmp" },
        { ".webp", "image/webp" },
        { ".svg",  "image/svg+xml" },
        { ".ico",  "image/x-icon" },
        { ".mp3",  "audio/mpeg" },
        { ".ogg",  "audio/ogg" },
        { ".wav",  "audio/wav" },
        { ".m4a",  "audio/mp4" },
        { ".mp4",  "video/mp4" },
        { ".woff", "font/woff" },
        { ".woff2","font/woff2" },
        { ".ttf",  "font/ttf" },
        { ".txt",  "text/plain; charset=utf-8" },
    };

    static string root;
    static string startPage;

    // 存档落到 exe 旁边的文件 —— 不依赖浏览器 profile 与端口。
    // 支持 3 个存档槽：槽 1 → save.json（与旧版本完全兼容），槽 2/3 → save2.json / save3.json
    const string SAVE_ROUTE = "/__save";
    const string PING_ROUTE = "/__ping";
    const int MAX_SLOT = 3;
    static string ExeDir()
    {
        string exeDir = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
        if (string.IsNullOrEmpty(exeDir)) exeDir = Environment.CurrentDirectory;
        return exeDir;
    }
    static string SaveFilePath(int slot)
    {
        if (slot < 1) slot = 1;
        if (slot > MAX_SLOT) slot = MAX_SLOT;
        string name = slot == 1 ? "save.json" : ("save" + slot + ".json");
        return Path.Combine(ExeDir(), name);
    }
    static string SaveFilePath() { return SaveFilePath(1); }
    // 从查询串里解析 slot；非法或缺省一律回落到槽 1
    static int SlotOf(string query)
    {
        if (string.IsNullOrEmpty(query)) return 1;
        foreach (string kv in query.Split('&'))
        {
            int eq = kv.IndexOf('=');
            if (eq <= 0) continue;
            if (kv.Substring(0, eq) != "slot") continue;
            int s;
            if (int.TryParse(kv.Substring(eq + 1), out s) && s >= 1 && s <= MAX_SLOT) return s;
        }
        return 1;
    }
    static volatile bool running = true;
    static TcpListener tcp;

    [STAThread]
    static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        Banner();

        // ---- 定位游戏目录 ----
        string exeDir = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
        if (exeDir == null || exeDir.Length == 0) exeDir = Environment.CurrentDirectory;

        foreach (string cand in WEB_CANDIDATES)
        {
            string dir = Path.GetFullPath(Path.Combine(exeDir, cand));
            if (File.Exists(Path.Combine(dir, "game.html")))
            {
                root = dir;
                startPage = "game.html";
                break;
            }
        }
        if (root == null)
        {
            // 退一步：找任何含 game.html 的相邻目录，方便开发期直接从项目根运行
            try
            {
                foreach (string d in Directory.GetDirectories(exeDir))
                {
                    if (File.Exists(Path.Combine(d, "game.html"))) { root = d; startPage = "game.html"; break; }
                    string w = Path.Combine(d, "web");
                    if (File.Exists(Path.Combine(w, "game.html"))) { root = w; startPage = "game.html"; break; }
                }
            }
            catch { }
        }
        if (root == null)
        {
            Console.WriteLine();
            Console.WriteLine("  [错误] 找不到游戏文件 game.html");
            Console.WriteLine("  请确认本程序与 web 目录放在一起，不要单独移动 web。");
            Console.WriteLine("  当前目录: " + exeDir);
            Pause();
            return 1;
        }
        Console.WriteLine("  游戏目录: " + root);

        // 命令行可指定起始页，便于调试
        bool noBrowser = false;
        for (int i = 0; i < args.Length; i++)
        {
            if ((args[i] == "--page" || args[i] == "-p") && i + 1 < args.Length)
                startPage = args[i + 1];
            if (args[i] == "--no-browser") noBrowser = true;
        }

        // ---- 选端口 ----
        // 端口要**尽量固定**：localStorage 按「协议+主机+端口」隔离，
        // 端口一变存档就换了地方。8765 被占时先看看是不是本游戏已经在跑，
        // 是就直接把窗口指过去，不再另起一份。
        int port = 8765;
        if (!PortFree(port))
        {
            if (IsOurServer(port))
            {
                Console.WriteLine("  检测到本游戏已在运行，直接打开已有窗口。");
                string u2 = "http://127.0.0.1:" + port + "/" + startPage;
                string b2 = FindBrowser();
                string prof2 = Path.Combine(Path.GetTempPath(), "dkdbb_profile");
                if (b2 != null)
                    TryStart(b2, "--app=\"" + u2 + "\" --user-data-dir=\"" + prof2 + "\""
                        + " --no-first-run --no-default-browser-check --window-size=1200,860");
                else TryStart(null, u2);
                return 0;
            }
            port = PickPort(8766, 60);
            Console.WriteLine("  [提示] 8765 被别的程序占用，改用 " + port + "（存档仍写在 save.json，不会丢）");
        }
        if (port < 0)
        {
            Console.WriteLine("  [错误] 找不到可用端口（8765-8825 都被占用了）");
            Pause();
            return 1;
        }

        // ---- 起 HTTP 服务器 ----
        string prefix = "http://127.0.0.1:" + port + "/";
        try
        {
            tcp = new TcpListener(IPAddress.Loopback, port);
            tcp.Start();
        }
        catch (Exception ex)
        {
            Console.WriteLine("  [错误] 无法启动本地服务器: " + ex.Message);
            Console.WriteLine("  如果端口被占用或被安全软件拦截，请关闭后重试。");
            Pause();
            return 1;
        }
        Console.WriteLine("  服务地址: " + prefix + startPage + "  (仅本机可访问)");
        ThreadPool.QueueUserWorkItem(delegate { AcceptLoop(); });

        // ---- 打开浏览器 ----
        string url = prefix + startPage;
        if (noBrowser)
        {
            Console.WriteLine("  [--no-browser] 已跳过启动浏览器，仅提供 HTTP 服务。");
            Console.WriteLine("  按 Ctrl+C 结束。");
            Console.WriteLine();
        }
        else
        {
            string browser = FindBrowser();
            if (browser == null)
            {
                Console.WriteLine();
                Console.WriteLine("  [提示] 没找到 Edge 或 Chrome，已改用系统默认浏览器打开。");
                Console.WriteLine("         窗口会带地址栏，功能不受影响。");
                TryStart(null, url);
            }
            else
            {
                Console.WriteLine("  浏览器内核: " + browser);
                // --app 去掉地址栏与工具栏。
                //
                // profile 目录**必须固定**，不能带端口号：
                // 之前是 dkdbb_<port>，而端口是每次启动现找的第一个空闲口，
                // 于是每次运行都是全新 profile + 全新源(localStorage 按 协议+主机+端口 隔离)，
                // 玩家反馈的"存档重启又从头开始"就是这么来的。
                string profile = Path.Combine(Path.GetTempPath(), "dkdbb_profile");
                string cargs = "--app=\"" + url + "\" --user-data-dir=\"" + profile + "\""
                             + " --no-first-run --no-default-browser-check --disable-features=Translate"
                             + " --window-size=1200,860 --window-position=60,40";
                TryStart(browser, cargs);
            }
            Console.WriteLine();
            Console.WriteLine("  游戏已启动。关闭游戏窗口后本程序会自动退出。");
            Console.WriteLine("  （也可以直接关掉这个黑窗口，或按 Ctrl+C 结束）");
            Console.WriteLine();
        }

        // ---- 主循环：浏览器活着就继续跑 ----
        // 不依赖 Console.ReadKey：stdin 被重定向时它会抛异常，导致误判为「用户退出」。
        Console.CancelKeyPress += delegate(object s, ConsoleCancelEventArgs e)
        {
            e.Cancel = true;
            running = false;
        };

        if (noBrowser)
        {
            while (running) Thread.Sleep(500);
        }
        else
        {
            // 给浏览器一点启动时间，避免刚 launch 就判定「已退出」
            Thread.Sleep(3000);
            while (running && BrowserAlive()) Thread.Sleep(700);
        }

        try { tcp.Stop(); } catch { }
        Console.WriteLine("  已退出。");
        return 0;
    }

    static void Banner()
    {
        Console.WriteLine();
        Console.WriteLine("  ==========================================");
        Console.WriteLine("        多克多比 · 浮空群岛");
        Console.WriteLine("        离线版启动器  v" + VERSION);
        Console.WriteLine("  ==========================================");
        Console.WriteLine();
    }

    static void Pause()
    {
        Console.WriteLine();
        Console.Write("  按任意键退出...");
        try { Console.ReadKey(true); } catch { Thread.Sleep(8000); }
    }

    static bool BrowserAlive()
    {
        try
        {
            Process[] all = Process.GetProcesses();
            foreach (Process p in all)
            {
                try
                {
                    string n = p.ProcessName.ToLowerInvariant();
                    if (n == "msedge" || n == "chrome") return true;
                }
                catch { }
                finally { p.Dispose(); }
            }
        }
        catch { }
        return false;
    }

    static int PickPort(int start, int tries)
    {
        for (int i = 0; i < tries; i++)
        {
            int p = start + i;
            if (PortFree(p)) return p;
        }
        return -1;
    }

    static bool PortFree(int port)
    {
        TcpListener l = null;
        try
        {
            l = new TcpListener(IPAddress.Loopback, port);
            l.Start();
            return true;
        }
        catch { return false; }
        finally { if (l != null) { try { l.Stop(); } catch { } } }
    }

    // 占用该端口的到底是不是"我们自己"？发一个短请求看有没有本程序的标记头。
    static bool IsOurServer(int port)
    {
        try
        {
            using (TcpClient c = new TcpClient())
            {
                IAsyncResult ar = c.BeginConnect(IPAddress.Loopback, port, null, null);
                if (!ar.AsyncWaitHandle.WaitOne(600)) return false;
                c.EndConnect(ar);
                c.ReceiveTimeout = 800; c.SendTimeout = 800;
                using (NetworkStream ns = c.GetStream())
                {
                    byte[] req = System.Text.Encoding.ASCII.GetBytes(
                        "GET /__ping HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n");
                    ns.Write(req, 0, req.Length);
                    byte[] buf = new byte[512];
                    int n = ns.Read(buf, 0, buf.Length);
                    if (n <= 0) return false;
                    string s = System.Text.Encoding.ASCII.GetString(buf, 0, n);
                    return s.IndexOf("X-DKDbb", StringComparison.OrdinalIgnoreCase) >= 0;
                }
            }
        }
        catch { return false; }
    }

    static string FindBrowser()
    {
        string[] rel = {
            @"Microsoft\Edge\Application\msedge.exe",
            @"Google\Chrome\Application\chrome.exe",
        };
        List<string> bases_ = new List<string>();
        foreach (string v in new string[] { "ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA" })
        {
            string b = Environment.GetEnvironmentVariable(v);
            if (!string.IsNullOrEmpty(b)) bases_.Add(b);
        }
        // 注册表兜底
        try
        {
            foreach (string key in new string[] {
                @"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe",
                @"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" })
            {
                using (Microsoft.Win32.RegistryKey k = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(key))
                {
                    if (k != null)
                    {
                        object o = k.GetValue(null);
                        if (o != null && File.Exists(o.ToString())) return o.ToString();
                    }
                }
            }
        }
        catch { }

        foreach (string b in bases_)
            foreach (string r in rel)
            {
                string full = Path.Combine(b, r);
                if (File.Exists(full)) return full;
            }
        return null;
    }

    static void TryStart(string exe, string args)
    {
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo();
            if (exe == null) { psi.FileName = args; psi.UseShellExecute = true; }
            else { psi.FileName = exe; psi.Arguments = args; psi.UseShellExecute = false; }
            Process.Start(psi);
        }
        catch (Exception ex)
        {
            Console.WriteLine("  [警告] 启动浏览器失败: " + ex.Message);
        }
    }

    // ================= HTTP（裸 socket 实现）=================
    static void AcceptLoop()
    {
        while (running)
        {
            TcpClient client = null;
            try { client = tcp.AcceptTcpClient(); }
            catch { break; }
            TcpClient c = client;
            ThreadPool.QueueUserWorkItem(delegate { Handle(c); });
        }
    }

    static void Handle(TcpClient client)
    {
        NetworkStream ns = null;
        try
        {
            client.ReceiveTimeout = 15000;
            client.SendTimeout = 30000;
            ns = client.GetStream();

            // ---- 读请求头（直到空行）----
            MemoryStream head = new MemoryStream();
            byte[] one = new byte[1];
            int consecutive = 0;
            while (consecutive < 4)
            {
                int n = ns.Read(one, 0, 1);
                if (n <= 0) return;
                head.WriteByte(one[0]);
                if (one[0] == (byte)'\r' || one[0] == (byte)'\n')
                {
                    consecutive++;
                    if (head.Length > 64 * 1024) break;
                }
                else consecutive = 0;
            }

            string headerText = Encoding.UTF8.GetString(head.ToArray());
            string[] lines = headerText.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            if (lines.Length == 0) return;

            string[] reqLine = lines[0].Split(' ');
            if (reqLine.Length < 2) return;
            string method = reqLine[0].ToUpperInvariant();
            string rawTarget = reqLine[1];
            // 保留查询串：存档接口要用 ?slot=N 区分存档槽
            string query = "";
            int q = rawTarget.IndexOf('?');
            if (q >= 0) { query = rawTarget.Substring(q + 1); rawTarget = rawTarget.Substring(0, q); }

            if (method != "GET" && method != "HEAD" && !(method == "POST" && rawTarget == SAVE_ROUTE))
            {
                WriteText(ns, 405, "Method Not Allowed", "only GET/POST supported");
                return;
            }

            // ---- 存档接口：save.json 放在 exe 旁边 ----
            // 为什么要有它：localStorage 是按「协议+主机+端口」隔离的，
            // exe 每次找的端口一变、浏览器 profile 一换，存档就读不回来，
            // 玩家看到的就是"重启又从头开始"。落到 exe 旁边的文件才真正靠谱。
            if (rawTarget == PING_ROUTE || rawTarget == SAVE_ROUTE)
            {
                if (rawTarget == PING_ROUTE)
                {
                    WriteText(ns, 200, "OK", "dkdbb-launcher");
                    return;
                }
                string saveFile = SaveFilePath(SlotOf(query));
                if (method == "POST")
                {
                    int cl = 0;
                    for (int i = 1; i < lines.Length; i++)
                    {
                        int colon = lines[i].IndexOf(':');
                        if (colon <= 0) continue;
                        if (string.Equals(lines[i].Substring(0, colon).Trim(), "Content-Length",
                                StringComparison.OrdinalIgnoreCase))
                            int.TryParse(lines[i].Substring(colon + 1).Trim(), out cl);
                    }
                    if (cl < 0 || cl > 4 * 1024 * 1024) { WriteText(ns, 413, "Too Large", "bad size"); return; }
                    byte[] body = new byte[cl];
                    int got = 0;
                    while (got < cl)
                    {
                        int n = ns.Read(body, got, cl - got);
                        if (n <= 0) break;
                        got += n;
                    }
                    string text = Encoding.UTF8.GetString(body, 0, got).Trim();
                    try
                    {
                        if (text.Length == 0 || text == "{}") { if (File.Exists(saveFile)) File.Delete(saveFile); }
                        else
                        {
                            // 先写临时文件再替换，避免写一半断电把存档弄坏
                            string tmp = saveFile + ".tmp";
                            File.WriteAllText(tmp, text, new UTF8Encoding(false));
                            if (File.Exists(saveFile)) File.Delete(saveFile);
                            File.Move(tmp, saveFile);
                        }
                        Console.WriteLine("  [存档] 槽 " + SlotOf(query) + " 已保存（" + got + " 字节）→ " + Path.GetFileName(saveFile));
                    }
                    catch (Exception ex) { Console.WriteLine("  [存档] 写入失败: " + ex.Message); }
                    WriteText(ns, 200, "OK", "{\"ok\":true}");
                    return;
                }
                // GET：没有存档文件就回一个空对象（前端会当作"没有存档"）
                if (!File.Exists(saveFile)) { WriteText(ns, 200, "OK", "{}"); return; }
                try
                {
                    string txt = File.ReadAllText(saveFile, Encoding.UTF8);
                    WriteText(ns, 200, "OK", txt);
                }
                catch { WriteText(ns, 200, "OK", "{}"); }
                return;
            }

            // ---- 解析 Range ----
            long rangeStart = -1, rangeEnd = -1;
            for (int i = 1; i < lines.Length; i++)
            {
                int colon = lines[i].IndexOf(':');
                if (colon <= 0) continue;
                string hn = lines[i].Substring(0, colon).Trim();
                string hv = lines[i].Substring(colon + 1).Trim();
                if (string.Equals(hn, "Range", StringComparison.OrdinalIgnoreCase)
                    && hv.StartsWith("bytes="))
                {
                    string spec = hv.Substring(6);
                    int comma = spec.IndexOf(',');
                    if (comma >= 0) spec = spec.Substring(0, comma);
                    string[] parts = spec.Split('-');
                    if (parts.Length == 2)
                    {
                        if (parts[0].Length > 0) long.TryParse(parts[0], out rangeStart);
                        if (parts[1].Length > 0) long.TryParse(parts[1], out rangeEnd);
                    }
                }
            }

            // ---- 路径解析与安全校验 ----
            string rel = Uri.UnescapeDataString(rawTarget).TrimStart('/');
            if (rel.Length == 0) rel = startPage;
            if (rel.IndexOf('\0') >= 0) { WriteText(ns, 400, "Bad Request", "bad path"); return; }

            string[] segs = rel.Split(new char[] { '/', '\\' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (string s in segs)
                if (s == "..") { WriteText(ns, 403, "Forbidden", "forbidden"); return; }

            string rootFull = Path.GetFullPath(root);
            string full = Path.GetFullPath(Path.Combine(rootFull,
                rel.Replace('/', Path.DirectorySeparatorChar)));
            if (!full.StartsWith(rootFull + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            { WriteText(ns, 403, "Forbidden", "forbidden"); return; }

            if (!File.Exists(full)) { WriteText(ns, 404, "Not Found", "404 " + rel); return; }

            string ext = Path.GetExtension(full);
            string mime;
            if (!MIME.TryGetValue(ext, out mime)) mime = "application/octet-stream";

            long len;
            try { len = new FileInfo(full).Length; }
            catch { WriteText(ns, 500, "Internal Error", "stat failed"); return; }

            long start = 0, end = len - 1;
            bool partial = false;
            if (rangeStart >= 0 || rangeEnd >= 0)
            {
                if (rangeStart >= 0) start = rangeStart;
                if (rangeEnd >= 0) end = rangeEnd;
                if (end >= len) end = len - 1;
                if (start > end || start >= len)
                {
                    WriteText(ns, 416, "Range Not Satisfiable", "bad range");
                    return;
                }
                partial = true;
            }
            long sendLen = end - start + 1;

            // ---- 写响应头 ----
            StringBuilder h = new StringBuilder();
            h.Append("HTTP/1.1 ").Append(partial ? "206 Partial Content" : "200 OK").Append("\r\n");
            h.Append("Content-Type: ").Append(mime).Append("\r\n");
            h.Append("Content-Length: ").Append(sendLen).Append("\r\n");
            h.Append("Accept-Ranges: bytes\r\n");
            h.Append("Cache-Control: no-cache\r\n");
            if (partial)
                h.Append("Content-Range: bytes ").Append(start).Append('-').Append(end)
                 .Append('/').Append(len).Append("\r\n");
            h.Append("Connection: close\r\n\r\n");
            byte[] hb = Encoding.ASCII.GetBytes(h.ToString());
            ns.Write(hb, 0, hb.Length);

            // ---- 写正文 ----
            if (method == "GET" && sendLen > 0)
            {
                using (FileStream fs = new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    fs.Seek(start, SeekOrigin.Begin);
                    byte[] buf = new byte[64 * 1024];
                    long left = sendLen;
                    while (left > 0)
                    {
                        int want = (int)Math.Min(buf.Length, left);
                        int got = fs.Read(buf, 0, want);
                        if (got <= 0) break;
                        ns.Write(buf, 0, got);
                        left -= got;
                    }
                }
            }
            ns.Flush();
        }
        catch (Exception)
        {
            // 浏览器提前断开（关窗口）时会走到这里，属正常
        }
        finally
        {
            try { if (ns != null) ns.Close(); } catch { }
            try { client.Close(); } catch { }
        }
    }

    static void WriteText(NetworkStream ns, int code, string reason, string body)
    {
        try
        {
            byte[] b = Encoding.UTF8.GetBytes(body);
            StringBuilder h = new StringBuilder();
            h.Append("HTTP/1.1 ").Append(code).Append(' ').Append(reason).Append("\r\n");
            h.Append("Content-Type: text/plain; charset=utf-8\r\n");
            h.Append("Content-Length: ").Append(b.Length).Append("\r\n");
            // 打上自己的标记：启动时用 /__ping 判断 8765 上跑的到底是不是本游戏
            h.Append("X-DKDbb: 1\r\n");
            h.Append("Cache-Control: no-store\r\n");
            h.Append("Connection: close\r\n\r\n");
            byte[] hb = Encoding.ASCII.GetBytes(h.ToString());
            ns.Write(hb, 0, hb.Length);
            ns.Write(b, 0, b.Length);
            ns.Flush();
        }
        catch { }
    }
}
