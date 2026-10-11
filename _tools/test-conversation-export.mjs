// 对话导出自检（第 71 轮）
//
// 为什么要有：导出依赖两件**仓库外**的东西 —— DSH 的会话文件（在 `~/.dsh/sessions/`）
//   和"多帧 zstd"这个格式细节。任何一环变了（会话格式升级、字段改名），
//   导出就会**静默产出残缺文件** —— 而使用者不会知道少了什么。
//   所以这里核对"导出的三份之间对得上"。
//
// 没有会话文件时**跳过**（别人 clone 这个仓库跑回归时不会因此报红）。
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
let pass = 0, fail = 0, skip = 0
const check = (ok, s, extra) => { console.log((ok ? '  ✓ ' : '  ✗ ') + s + (!ok && extra ? ' → ' + extra : '')); ok ? pass++ : fail++ }
const skipIt = (s) => { console.log('  ⊘ ' + s); skip++ }

const md = path.join(ROOT, 'docs', '对话记录.md')
const jsonl = path.join(ROOT, 'docs', '对话记录.jsonl')
const raw = path.join(ROOT, 'docs', '对话记录-原始会话.jsonl.zstd')

console.log('== 对话导出 ==')
if (!fs.existsSync(md) || !fs.existsSync(jsonl)) {
  skipIt('还没有导出过（跑 node _tools/export-conversation.mjs --out docs）')
  console.log(`\n通过 ${pass} 项，失败 ${fail} 项，跳过 ${skip} 项`)
  process.exit(0)
}

const mdText = fs.readFileSync(md, 'utf8')
const lines = fs.readFileSync(jsonl, 'utf8').split('\n').filter(Boolean)
const recs = lines.map((l) => { try { return JSON.parse(l) } catch { return null } })
check(recs.every(Boolean), `JSONL 每行都能解析（${lines.length} 行）`)

const users = recs.filter((r) => r.role === 'user')
const asst = recs.filter((r) => r.role === 'assistant')
const sys = recs.filter((r) => r.role === 'system')

// 1) Markdown 里的计数与 JSONL 的实际条数一致（防"渲染漏了一批"）
const mHuman = mdText.match(/真人消息\s*(\d+)\s*条/)
const mAsst = mdText.match(/我的回复\s*(\d+)\s*条/)
const mInject = mdText.match(/宿主注入\s*(\d+)\s*条/)
check(!!mHuman, 'Markdown 头部写了真人消息数')
if (mHuman) check(Number(mHuman[1]) === users.length, `真人数与 JSONL 一致（头部 ${mHuman[1]} / 实际 ${users.length}）`)
if (mAsst) check(Number(mAsst[1]) === asst.length, `回复数与 JSONL 一致（头部 ${mAsst[1]} / 实际 ${asst.length}）`)
if (mInject) check(Number(mInject[1]) === sys.length, `注入数与 JSONL 一致（头部 ${mInject[1]} / 实际 ${sys.length}）`)

// 2) 真人对白**必须**在 Markdown 里逐条出现（这是导出的核心用途）
const missing = users.filter((u) => {
  const head = String(u.text || '').trim().slice(0, 24)
  return head && !mdText.includes(head)
})
check(missing.length === 0, `${users.length} 条真人消息都在 Markdown 里`, missing.slice(0, 3).map((m) => String(m.text).slice(0, 20)).join(' | '))

// 3) 注入的**必须**被折起来（否则读起来像用户说胡话）
//    ⚠️ 必须锚定**行首**：注入内容本身可能就包含这段字样（压缩检查点会引用之前的对话，
//       里面可能有我写的源码）。不锚行首会多数出一个 —— 第一版就报了 93/92。
const injectDetails = (mdText.match(/^<details><summary>⚙️ 宿主注入（/gm) || []).length
check(injectDetails === sys.length, `宿主注入全部折叠（${injectDetails} 处 / 共 ${sys.length} 条）`)

// 4) 不该出现空的轮次小节
check(!/^## 第 0 轮$/m.test(mdText), '没有空的「第 0 轮」小节')
const emptyTurn = [...mdText.matchAll(/^## 第 (\d+) 轮\n\n---/gm)]
check(emptyTurn.length === 0, '没有空轮次', emptyTurn.slice(0, 3).map((m) => m[1]).join(','))

// 5) 原始会话副本与源文件一致（自包含：以后能重新渲染）
if (fs.existsSync(raw)) {
  const src = (() => {
    const base = path.join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh', 'sessions')
    const slug = '--' + ROOT.replace(/[^A-Za-z0-9]/g, '-') + '--'
    const hit = []
    const walk = (d, depth) => {
      if (depth > 3 || !fs.existsSync(d)) return
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name)
        if (e.isDirectory()) walk(f, depth + 1)
        else if (/^session\.v\d+\.jsonl\.zstd$/.test(e.name)) hit.push({ f, t: fs.statSync(f).mtimeMs })
      }
    }
    walk(base, 0)
    hit.sort((a, b) => b.t - a.t)
    return hit.length ? hit[0].f : null
  })()
  if (src) {
    // ⚠️ 不能要求"字节相同"：会话是**边聊边写**的，源文件一直在长。
    //    只要求副本是个**有效的多帧 zstd 且不比源文件新太多**（即确实是从它复制的）。
    //
    // ⚠️ 也不能单纯比大小：同一 slug 目录下往往有**多个** session 文件，
    //    取"mtime 最新"并不等于"副本的来源"。实测：新会话 9.3 MB 比旧会话 18.6 MB 小，
    //    于是"副本 18.6 MB > 源 9.3 MB"被判失败，而副本其实完全正常（它是旧会话的副本）。
    //    真正的失效信号是**副本陈旧**：既比来源旧很多、又比它大。
    const a = fs.statSync(raw).size, b = fs.statSync(src).size
    const aT = fs.statSync(raw).mtimeMs, bT = fs.statSync(src).mtimeMs
    const stale = aT < bT - 6 * 3600 * 1000 && a > b
    check(a > 0 && !stale, `原始副本可用（副本 ${(a / 1048576).toFixed(1)} MB · 最近会话 ${(b / 1048576).toFixed(1)} MB${stale ? ' —— 已明显陈旧' : ''}）`)
  } else skipIt('找不到源会话文件（无法核对副本）')
} else skipIt('没有原始会话副本')

// 6) 导出工具**可重复运行**（格式没变就不该报错）
//    ⚠️ 沙箱不允许 Node 的 child_process 走**管道** stdio（会 EPERM）——
//       这是本仓库记录过的限制（见《复刻与构建手册》§8）。
//       所以这里用 `stdio: 'ignore'`，只看退出码。
try {
  const outDir = path.join(ROOT, '_tmp_test_out')
  fs.mkdirSync(outDir, { recursive: true })
  execFileSync(process.execPath, [path.join('_tools', 'export-conversation.mjs'), '--out', '_tmp_test_out'], { stdio: 'ignore', cwd: ROOT, timeout: 180000 })
  check(fs.existsSync(path.join(outDir, '对话记录.md')), 'export-conversation.mjs 能再跑一遍并产出文件')
} catch (e) {
  check(false, 'export-conversation.mjs 再跑报错', String(e.message).slice(0, 120))
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项，跳过 ${skip} 项`)
process.exit(fail ? 1 : 0)
