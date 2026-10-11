// 事实采集：从**运行时数据文件**里读出真实条目数。
//
// 【为什么需要它】
// `_build/make-dist.mjs` 生成给玩家的 `dist/使用说明.txt`，里面曾经**写死**：
//     「多克多比 · 浮空群岛　v0.1 单机版 …… 11 个多比形态 …… 17 个原版技能 …… 34 种怪物」
// 而当时实际是 v0.6 / 52 只形态 / 136 个技能 / 36 种怪物 —— 一份**发给玩家的文件**在说谎，
// 而且没有任何机制会发现（写死的数字一定会过期；第 44 轮刚为"界面里写死 0.28 秒"踩过同一个坑）。
// 所以这里把"事实"做成一个函数：谁要写数字就调它，不许再手打。
//
// 数据源：`assets/forms.js`、`assets/items.js`（都是 `window.__X__ = {…}` 形式的 JSON）、
//         `game/tables/skills-official.js`（带缩进的裸对象字面量）、目录计数。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const P = (...p) => path.join(ROOT, ...p)

/** 扫出第一个平衡的 `{...}` 并 JSON.parse（两个数据文件都是严格 JSON）。 */
export function parseJsonAfter(file, marker) {
  const s = fs.readFileSync(P(file), 'utf8').replace(/^\uFEFF/, '')
  const at = marker ? s.indexOf(marker) : 0
  if (at < 0) throw new Error(`找不到标记 ${marker}（${file}）`)
  const start = s.indexOf('{', at)
  let d = 0, str = null
  for (let j = start; j < s.length; j++) {
    const c = s[j]
    if (str) { if (c === '\\') { j++; continue } if (c === str) str = null; continue }
    if (c === '"' || c === "'") { str = c; continue }
    if (c === '{') d++
    else if (c === '}') { d--; if (!d) return JSON.parse(s.slice(start, j + 1)) }
  }
  throw new Error(`括号未闭合（${file}）`)
}

/** 数 `game/tables/skills-official.js` 里的顶层技能条目。
 *  ⚠️ 缩进必须**正好一个空格**：这个文件是 `var T = {` + ` "重击": {` 的裸对象字面量，
 *  顶层技能键缩进 1 空格（136 条），而技能**内部**的 `  "buff": {` 缩进 2 空格（38 条）。
 *  第一版写成 `^ {2}` 就数成 38，而且看起来"有结果、不报错" —— 正是 R5 说的空/错结果陷阱。
 *  这里同时输出两个数并断言 顶层 > 内部，防止哪天格式变了又静默数错。 */
export function countOfficialSkills() {
  const s = fs.readFileSync(P('game/tables/skills-official.js'), 'utf8')
  const top = (s.match(/^ "[^"]+":\s*\{/gm) || []).length
  const inner = (s.match(/^ {2,}"[^"]+":\s*\{/gm) || []).length
  if (!(top > inner && top > 50)) {
    throw new Error(`技能条数可疑（顶层 ${top} / 内部 ${inner}）—— 文件格式可能改了，先核对再发布`)
  }
  return top
}

const countDir = (d) => (fs.existsSync(P(d)) ? fs.readdirSync(P(d)).filter((f) => !f.startsWith('.')).length : 0)

/** 一次拿全所有"会写进文档"的事实数字。 */
export function collectFacts() {
  const forms = parseJsonAfter('assets/forms.js', '__DKDbb_FORMS__')
  const data = parseJsonAfter('assets/gamedata.js', '__DKDbb_DATA__')
  const items = parseJsonAfter('assets/items.js', '__DKDbb_ITEMS__')
  const html = fs.readFileSync(P('game.html'), 'utf8')
  const state = fs.existsSync(P('STATE.md')) ? fs.readFileSync(P('STATE.md'), 'utf8').replace(/^\uFEFF/, '') : ''

  // 版本号与测试数**从 STATE.md 读**（它是单一事实源），不在这里另算一份
  const ver = (state.match(/\*\*当前版本\*\*：\s*v([\d.]+)/) || [])[1] || null

  return {
    version: ver,
    forms: (forms.forms || []).length,
    formsArtOnly: (forms.artOnly || []).length,
    formsArtFiles: countDir('assets/forms/art'),
    skills: countOfficialSkills(),
    skillsBase: (data.skills || []).length,
    monsters: (data.monsters || []).length,
    monsterFiles: countDir('assets/monsters'),
    items: (items.items || []).length,
    scenes: countDir('assets/scenes'),
    namedBgm: countDir('assets/bgm/named'),
    knights: countDir('assets/knights'),
    scripts: [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].length,
  }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('release-facts.mjs')) {
  console.log(JSON.stringify(collectFacts(), null, 2))
}
