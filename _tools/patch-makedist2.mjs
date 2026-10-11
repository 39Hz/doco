// 打包时排除过期/空目录。
// assets/sprites 是早期的工作目录（1.86 GB，与 assets/anim 内容重复），
// 游戏运行时只用 assets/anim —— 一起拷进去会让包从 120 MB 涨到 2 GB。
import fs from 'node:fs'

const p = '_build/make-dist.mjs'
let s = fs.readFileSync(p, 'utf8')
const a = "  const assetsSrc = path.join(d, 'assets')\n  const assetsDst = path.join(web, 'assets')\n  fs.cpSync(assetsSrc, assetsDst, { recursive: true })"
const b = [
  "  const assetsSrc = path.join(d, 'assets')",
  "  const assetsDst = path.join(web, 'assets')",
  '  // 排除项：sprites 是早期的遗留工作目录（1.86 GB，与 anim 重复，运行时不读）；',
  '  // ui 是空目录。不排掉的话包会从 120 MB 涨到 2 GB。',
  "  const SKIP = new Set(['sprites', 'ui'])",
  '  fs.cpSync(assetsSrc, assetsDst, {',
  '    recursive: true,',
  "    filter: (src) => !SKIP.has(path.basename(src)),",
  '  })',
].join('\n')
if (!s.includes(a)) { console.error('没找到拷贝锚点'); process.exit(1) }
fs.writeFileSync(p, s.replace(a, b), 'utf8')
console.log('✓ 打包排除 assets/sprites 与 assets/ui')
