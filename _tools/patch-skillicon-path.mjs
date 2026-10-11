// 补上技能图标路径。
//
// 根因：`D.SKILLS` 是手写在 game/tables/data.js 里的表（cd/power/element/desc），
// **没有 icon 字段** —— 技能图标编号只存在于 assets/forms.js 的 skills 表里。
// 所以技能面板查不到图标，全走了兜底色块。
//
// 这里不把 17 个编号再抄一遍（抄了就会不同步），改成惰性去 forms.js 里取，
// 和 D.FORMS 用的是同一套"等 assets/*.js 加载完再读"的写法。
import fs from 'node:fs'

const p = 'game/tables/data.js'
let s = fs.readFileSync(p, 'utf8')
const anchor = "  // 兼容旧写法（读到的是同一份缓存）\n  Object.defineProperty(D, 'FORMS', { get: () => D.forms() })"
if (!s.includes(anchor)) { console.error('没找到 FORMS 锚点'); process.exit(1) }
const add = anchor + `

  // 技能图标文件路径。编号（skill_icon_1001 这类）来自官方图鉴，
  // 存在 assets/forms.js 的 skills 表里；这里惰性取，避免再抄一份。
  // 图标文件本身由 _tools/build-skill-icons.mjs + build-skill-icons3.mjs 抽出，
  // 17/17 已肉眼核对（见 docs/sheets/_skillicons.png）。
  D.skillIconFile = function (name) {
    const src = (typeof globalThis !== 'undefined' && globalThis.__DKDbb_FORMS__) ||
      (typeof window !== 'undefined' && window.__DKDbb_FORMS__)
    const sk = src && src.skills && src.skills[name]
    if (!sk || !sk.icon) return null
    return 'assets/skills/' + sk.icon + '.png'
  }`
s = s.replace(anchor, add)
fs.writeFileSync(p, s, 'utf8')
console.log('✓ data.js 已加 D.skillIconFile')

// game.js：skillIcon 改用它
const gp = 'game/game.js'
let g = fs.readFileSync(gp, 'utf8')
const a = [
  '  function skillIcon(name) {',
  '    const sk = D.SKILLS[name]',
  '    if (!sk || !sk.icon) return null',
  "    const file = 'assets/skills/' + sk.icon + '.png'",
  '    if (!skillIconCache.has(file)) { const im = new Image(); im.src = file; skillIconCache.set(file, im) }',
  '    const im = skillIconCache.get(file)',
  '    return (im.complete && im.naturalWidth) ? im : null',
  '  }',
].join('\n')
const b = [
  '  function skillIcon(name) {',
  '    // 图标编号在 assets/forms.js 里，不在 D.SKILLS 里 —— 走 data.js 的惰性查询',
  '    const file = D.skillIconFile ? D.skillIconFile(name) : null',
  '    if (!file) return null',
  '    if (!skillIconCache.has(file)) { const im = new Image(); im.src = file; skillIconCache.set(file, im) }',
  '    const im = skillIconCache.get(file)',
  '    return (im.complete && im.naturalWidth) ? im : null',
  '  }',
].join('\n')
if (!g.includes(a)) { console.error('★ game.js 里没找到 skillIcon 原体'); process.exit(1) }
fs.writeFileSync(gp, g.replace(a, b), 'utf8')
console.log('✓ game.js 的 skillIcon 改用 D.skillIconFile')
