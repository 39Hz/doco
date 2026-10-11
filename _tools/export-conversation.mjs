// 把 DSH 会话记录导成**可读的完整对话**（Markdown）+ **可导入的结构化记录**（JSONL）
//
// 【为什么需要自己解】会话文件 `session.v4.jsonl.zstd` 是**多个 zstd 帧串接**的
//   （一个事件一帧，7552 帧）。Node 的 `zlib.zstdDecompressSync` **只解第一帧** ——
//   直接调它只会拿到 200 字节的会话头，看起来像"记录是空的"。
//   所以这里按魔数 `28 B5 2F FD` 拆帧、逐帧解、再拼。
//
// 用法：
//   node _tools/export-conversation.mjs                 # 自动找本工作区最新的会话
//   node _tools/export-conversation.mjs --file <路径>
//   node _tools/export-conversation.mjs --full-tools    # 工具参数/结果不截断（文件会很大）
//   node _tools/export-conversation.mjs --no-reasoning  # 不含思考过程
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ARGS = process.argv.slice(2)
const argOf = (n) => { const eq = ARGS.find((a) => a.startsWith(n + '=')); if (eq) return eq.split('=').slice(1).join('='); const i = ARGS.indexOf(n); return i >= 0 ? ARGS[i + 1] : null }
const FULL_TOOLS = ARGS.includes('--full-tools')
const NO_REASON = ARGS.includes('--no-reasoning')
const OUTDIR = argOf('--out') || '.'
const ROOT = process.cwd()

// ── 拆帧读 zstd ────────────────────────────────────────────
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const SKIP_MAGIC = Buffer.from([0x50, 0x2a, 0x4d, 0x18])
export function readSession(file) {
  const buf = fs.readFileSync(file)
  const starts = []
  for (let i = 0; i + 4 <= buf.length;) {
    if (buf.compare(MAGIC, 0, 4, i, i + 4) === 0 || buf.compare(SKIP_MAGIC, 0, 4, i, i + 4) === 0) { starts.push(i); i += 4 }
    else i++
  }
  if (!starts.length) throw new Error('这不像 zstd 文件（找不到帧魔数）: ' + file)
  starts.push(buf.length)
  const parts = []
  let ok = 0, bad = 0
  for (let k = 0; k < starts.length - 1; k++) {
    try { parts.push(zlib.zstdDecompressSync(buf.subarray(starts[k], starts[k + 1]))); ok++ } catch { bad++ }
  }
  const lines = Buffer.concat(parts).toString('utf8').split('\n').filter((l) => l.trim())
  return { lines, ok, bad, bytes: buf.length }
}

// ── 找会话文件 ─────────────────────────────────────────────
function newestSession() {
  const base = path.join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh', 'sessions')
  const hit = []
  const walk = (d, depth) => {
    if (depth > 3 || !fs.existsSync(d)) return
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name)
      if (e.isDirectory()) walk(f, depth + 1)
      else if (/^session\.v\d+\.jsonl\.zstd$/.test(e.name)) hit.push({ f, t: fs.statSync(f).mtimeMs, size: fs.statSync(f).size })
    }
  }
  // 优先本工作区对应的会话目录
  const slug = '--' + ROOT.replace(/[^A-Za-z0-9]/g, '-') + '--'
  walk(base, 0)
  const mine = hit.filter((h) => h.f.includes(slug))
  const pool = mine.length ? mine : hit
  pool.sort((a, b) => b.t - a.t)
  if (!pool.length) throw new Error('没找到任何会话记录（在 ' + base + ' 下）')
  return pool[0].f
}

// ── 渲染 ───────────────────────────────────────────────────
const clip = (s, n) => {
  s = String(s == null ? '' : s)
  return FULL_TOOLS || s.length <= n ? s : s.slice(0, n) + `\n…（已截断，共 ${s.length} 字；用 --full-tools 导出全文）`
}
const oneLine = (s, n) => {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
  return s.length <= n ? s : s.slice(0, n) + '…'
}

const file = argOf('--file') || newestSession()
console.log('会话文件:', file)
const { lines, ok, bad, bytes } = readSession(file)
console.log(`zstd 帧：成功 ${ok} / 失败 ${bad}；压缩 ${(bytes / 1048576).toFixed(1)} MB → ${lines.length} 条事件`)

const ev = lines.map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
const head = ev.find((e) => e.type === 'session') || {}
const title = (ev.find((e) => e.type === 'session/title') || {}).data?.title || '（无标题）'

// 按 turn 组织
const turns = []
let cur = null
// tool/result 按 callId 归位
const resultByCall = new Map()
for (const e of ev) {
  if (e.type === 'tool/result') {
    const id = e.data?.message?.toolCallId
    if (id) resultByCall.set(id, e.data)
  }
}
for (const e of ev) {
  if (e.type === 'turn/start') { cur = { n: e.data.turn, items: [] }; turns.push(cur); continue }
  if (e.type === 'user/message') {
    const src = e.data.source || {}
    const text = (e.data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    // ⚠️ 关键区分：**真人发的**消息带 `rpcId`（前端 RPC 回执）；
    //    宿主注入的没有 —— 它们的 `source.kind` 是 runtime-context / skill-catalog /
    //    tool-jobs / compact-checkpoint / goal / agent-message 等。
    //    不区分的话，「你」那栏里会混进十几条系统提示，读起来像你在说胡话。
    const human = src.kind === 'user' && !!src.rpcId
    if (!cur) { cur = { n: 0, items: [] }; turns.push(cur) }
    cur.items.push({ k: human ? 'user' : 'inject', text, kind: src.kind || '?' })
  } else if (e.type === 'assistant/message') {
    const blocks = (e.data.message && e.data.message.content) || []
    const texts = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n')
    const reasons = blocks.filter((b) => b.type === 'reasoning').map((b) => b.text || b.reasoning || '').join('\n\n')
    const calls = blocks.filter((b) => b.type === 'tool-call').map((b) => ({ name: b.name || b.toolName, args: b.input ?? b.arguments, id: b.id || b.callId }))
    if (texts || reasons || calls.length) cur.items.push({ k: 'asst', text: texts, reasoning: reasons, calls })
  }
}

// ── 写 Markdown ────────────────────────────────────────────
const md = []
md.push(`# ${title}`)
md.push('')
md.push(`> **完整对话记录** —— 由 \`_tools/export-conversation.mjs\` 从 DSH 会话文件导出`)
md.push('>')
md.push(`> 会话 id：\`${head.id || '?'}\`　创建：${head.createdAt ? new Date(head.createdAt).toLocaleString('zh-CN') : '?'}`)
md.push(`> 工作目录：\`${head.cwd || '?'}\``)
md.push(`> 事件 ${ev.length} 条（${turns.filter((t) => t.items.length).length} 轮）`)
md.push(`> **真人消息 ${turns.flatMap((t) => t.items).filter((i) => i.k === 'user').length} 条** · 我的回复 ${turns.flatMap((t) => t.items).filter((i) => i.k === 'asst').length} 条 · 工具调用 ${ev.filter((e) => e.type === 'tool/call').length} 次 · 宿主注入 ${turns.flatMap((t) => t.items).filter((i) => i.k === 'inject').length} 条（已折叠）`)
if (!FULL_TOOLS) md.push('>')
if (!FULL_TOOLS) md.push('> ⚠️ 工具参数与结果**已截断**（默认各截 300 / 500 字），完整版加 `--full-tools` 重新导出。')
if (NO_REASON) md.push('> ⚠️ 本记录**不含思考过程**（导出时加了 `--no-reasoning`）。')
md.push('')
md.push('---')
md.push('')

for (const t of turns) {
  if (!t.items.length) continue                    // 跳过空轮（会话开头那些无归属事件）
  md.push(`## 第 ${t.n} 轮`)
  md.push('')
  for (const it of t.items) {
    if (it.k === 'user') {
      md.push('### 👤 你')
      md.push('')
      md.push(clip(it.text, 100000) || '（空）')
      md.push('')
    } else if (it.k === 'inject') {
      // 宿主注入不丢，但折起来 —— 保证「完整」，又不干扰读对白
      md.push(`<details><summary>⚙️ 宿主注入（${it.kind}）</summary>`)
      md.push('')
      md.push(clip(it.text, 3000))
      md.push('')
      md.push('</details>')
      md.push('')
    } else {
      md.push('### 🤖 我')
      md.push('')
      if (it.text) { md.push(clip(it.text, 100000)); md.push('') }
      if (it.reasoning && !NO_REASON) {
        md.push('<details><summary>💭 思考过程</summary>')
        md.push('')
        md.push(clip(it.reasoning, 4000))
        md.push('')
        md.push('</details>')
        md.push('')
      }
      for (const c of it.calls) {
        const args = oneLine(typeof c.args === 'string' ? c.args : JSON.stringify(c.args), 300)
        md.push(`- 🔧 **${c.name}** \`${args}\``)
        const res = c.id && resultByCall.get(c.id)
        if (res) {
          const txt = (res.message?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
          const err = res.error ? `❌ ${oneLine(JSON.stringify(res.error), 200)}` : ''
          md.push('  <details><summary>结果</summary>')
          md.push('')
          md.push('  ```')
          md.push('  ' + clip(txt || err || '(无输出)', 500).replace(/\n/g, '\n  '))
          md.push('  ```')
          md.push('  </details>')
        }
      }
      if (it.calls.length) md.push('')
    }
  }
  md.push('---')
  md.push('')
}

const mdPath = path.join(OUTDIR, '对话记录.md')
fs.writeFileSync(mdPath, md.join('\n'), 'utf8')

// ── 写可导入的结构化 JSONL（只留对话，不带内部事件）──────
const out = []
for (const t of turns) {
  for (const it of t.items) {
    if (it.k === 'user') out.push(JSON.stringify({ turn: t.n, role: 'user', text: it.text }))
    else if (it.k === 'inject') out.push(JSON.stringify({ turn: t.n, role: 'system', kind: it.kind, text: it.text }))
    else {
      out.push(JSON.stringify({
        turn: t.n, role: 'assistant', text: it.text,
        ...(NO_REASON ? {} : { reasoning: it.reasoning }),
        ...(it.calls.length ? { tools: it.calls.map((c) => ({ name: c.name, arguments: typeof c.args === 'string' ? c.args : JSON.stringify(c.args) })) } : {}),
      }))
    }
  }
}
const jsonlPath = path.join(OUTDIR, '对话记录.jsonl')
fs.writeFileSync(jsonlPath, out.join('\n') + '\n', 'utf8')

// 原始会话文件也复制一份 —— 让这次导出**自包含**：
// 上面两份都是"渲染过的"，而原始文件里有**全量工具输出**（未截断）与全部内部事件。
// 它是 DSH 自己的格式（多帧 zstd），万一以后要重新渲染或做别的处理，有原始件才做得了。
const rawCopy = path.join(OUTDIR, '对话记录-原始会话.jsonl.zstd')
let rawNote = ''
try {
  if (path.resolve(file) !== path.resolve(rawCopy)) {
    fs.copyFileSync(file, rawCopy)
    rawNote = `  ${rawCopy}  ${(fs.statSync(rawCopy).size / 1048576).toFixed(1)} MB  （原始事件全量，多帧 zstd；工具输出未截断）`
  }
} catch (e) { rawNote = `  （原始文件复制失败：${e.message.slice(0, 60)}）` }

console.log(`\n写出：`)
console.log(`  ${mdPath}  ${(fs.statSync(mdPath).size / 1048576).toFixed(1)} MB  （可读，Markdown）`)
console.log(`  ${jsonlPath}  ${(fs.statSync(jsonlPath).size / 1048576).toFixed(1)} MB  （结构化，${out.length} 条，可导入）`)
if (rawNote) console.log(rawNote)
console.log(`\n原始文件位置：${file}`)
console.log(`重新解它：node _tools/export-conversation.mjs --file "<上面这个路径>" --full-tools`)
