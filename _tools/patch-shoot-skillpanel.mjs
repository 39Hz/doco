// 让截图工具认识技能图标（预解码 + 加一张技能面板截图）。
import fs from 'node:fs'
const p = '_tools/shoot.mjs'
let s = fs.readFileSync(p, 'utf8')
let n = 0

// 1) 预解码技能图标
if (!s.includes('技能图标（技能面板要用）')) {
  const a = '// 道具图标'
  const b = [
    '// 技能图标（技能面板要用）',
    '{',
    "  const idxPath = path.join(ROOT, 'assets', 'skills', 'index.json')",
    '  if (fs.existsSync(idxPath)) {',
    "    for (const it of JSON.parse(fs.readFileSync(idxPath, 'utf8')).icons) loadImagePixels(it.file)",
    '  }',
    '}',
    '// 道具图标',
  ].join('\n')
  if (s.includes(a)) { s = s.replace(a, b); n++; console.log('✓ 预解码技能图标') }
  else console.log('✗ 没找到「// 道具图标」锚点')
}

// 2) 加技能面板截图（放在任务列表截图之前）
if (!s.includes('15b-skillpanel')) {
  const a = "T.key('q')\nT.step(3)\nif (S().mode === 'questlist') shot('16-questlist')"
  const b = [
    "// 技能面板（K）",
    "S().mode = 'explore'",
    "T.step(1)",
    "T.key('k')",
    "T.step(3)",
    "if (S().mode === 'skillpanel') shot('15b-skillpanel')",
    "T.key('Escape')",
    "T.step(2)",
    '',
    "T.key('q')",
    "T.step(3)",
    "if (S().mode === 'questlist') shot('16-questlist')",
  ].join('\n')
  if (s.includes(a)) { s = s.replace(a, b); n++; console.log('✓ 加技能面板截图') }
  else console.log('✗ 没找到任务列表截图锚点')
}
fs.writeFileSync(p, s, 'utf8')
console.log(`共改 ${n} 处`)
