// 守卫：前后端分层的**依赖方向**（方案 §6.3.2）。
//
// 【为什么需要】方案 §2.1 的唯一铁律是：
//     ui → app → domain     app → ports ← adapters     domain → （谁都不依赖）
// 光靠人自觉守不住 —— 拆模块时手一滑在 `domain/` 里读一下存档、或让 `ui/` 自己算伤害，
// 分层就悄悄塌了，而且**不会有任何测试红**（功能照跑）。所以把规则变成静态扫描：
//
//   · `game/domain/**`：**零 I/O** —— 不许出现
//       localStorage / sessionStorage / indexedDB / fetch / XMLHttpRequest   （数据来源）
//       getContext / ctx / context                                            （画布）
//       save / S                                                              （存档与运行时状态）
//       `window.DKDbb*`（但 `window.DKDbbGame` 这个**共享命名空间**必须放行 ——
//        每个 domain 文件都要用它注册自己，这是 IIFE 方案下绕不开的）
//   · `game/ui/**`（将来）：不许直接读存档 / 自己算伤害 —— 不许出现
//       save. / localStorage / expectedDamage / damage( / channelOf / defFactor
//
// 扫描前先**去掉注释**：规则针对"真代码"，注释里提到关键字（例如解释为什么不用 S）不算违规。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }

console.log('== 分层依赖方向守卫（方案 §6.3.2）==')

// ---- 工具 ----
function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (e.name.endsWith('.js')) out.push(p)
  }
  return out
}
// 去掉块注释与行注释，只留"真代码"。行注释正则避开 `http://`（前一个字符是 `:` 时不当作注释起始）。
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}
const readHtml = () => fs.readFileSync(path.join(ROOT, 'game.html'), 'utf8')

// ---- 1) domain/ 必须零 I/O，且必须真的挂上 ----
const DOMAIN_DIR = path.join(ROOT, 'game', 'domain')
const domainFiles = walk(DOMAIN_DIR)
check(domainFiles.length > 0, `发现 ${domainFiles.length} 个 domain 模块（game/domain/*.js）`)

const html = readHtml()
const gameTag = 'game/game.js'
const gameAt = html.indexOf(gameTag)

for (const abs of domainFiles) {
  const rel = path.relative(ROOT, abs).split(path.sep).join('/')
  const code = stripComments(fs.readFileSync(abs, 'utf8'))

  // 1a) 零 I/O：逐条查禁用词，报出**命中的原词**方便定位
  const banned = [
    ['localStorage', /localStorage/],
    ['sessionStorage', /sessionStorage/],
    ['indexedDB', /indexedDB/],
    ['fetch', /\bfetch\s*\(/],
    ['XMLHttpRequest', /XMLHttpRequest/],
    ['getContext', /getContext/],
    ['ctx', /\bctx\b/],
    ['context', /\bcontext\b/],
    ['save', /\bsave\b/],
    ['S（运行时状态）', /\bS\b/],
    ['window.DKDbb*（非命名空间）', /window\.DKDbb(?!Game)/],
  ]
  const hits = banned.filter(([, re]) => re.test(code)).map(([n]) => n)
  check(hits.length === 0, `${rel} 零 I/O（不读存档 / 画布 / 引擎全局）`,
    hits.length ? `命中禁用词：${hits.join('、')}` : '')

  // 1b) 必须注册到共享命名空间（否则是"建了文件却没接线"的半迁移）
  check(/DKDbbGame\s*=\s*window\.DKDbbGame/.test(code) && /G\.domain/.test(code),
    `${rel} 注册到 window.DKDbbGame.domain`)

  // 1c) 必须被 game.html 挂载（否则新文件根本不会被加载 —— 忘了改 HTML 的经典坑）
  check(html.includes(`src="${rel}"`) || html.includes(`src='${rel}'`),
    `${rel} 已在 game.html 挂载`)

  // 1d) 且必须排在 game.js 之前（game.js 启动时就用它）
  const at = html.indexOf(rel)
  check(gameAt >= 0 && at >= 0 && at < gameAt, `${rel} 排在 game.js 之前`)
}

// ---- 2) ui/ 只画不裁决（尚未建立时跳过，不假红）----
const UI_DIR = path.join(ROOT, 'game', 'ui')
const uiFiles = walk(UI_DIR)
if (uiFiles.length === 0) {
  check(true, 'game/ui/ 尚未建立，跳过界面层检查（批次 3 起生效）')
} else {
  for (const abs of uiFiles) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/')
    const code = stripComments(fs.readFileSync(abs, 'utf8'))
    const banned = [
      ['直接读存档', /\bsave\./],
      ['localStorage', /localStorage/],
      ['自己算伤害', /expectedDamage|\bdamage\s*\(|channelOf|defFactor/],
    ]
    const hits = banned.filter(([, re]) => re.test(code)).map(([n]) => n)
    check(hits.length === 0, `${rel} 只画不裁决（不读存档 / 不算伤害）`,
      hits.length ? `命中禁用词：${hits.join('、')}` : '')
  }
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)