// 把技能面板接进 game.js：
//   1) 在 drawBag 之前插入 drawSkillPanel 与它的布局函数
//   2) 加 S.skpSel / S.skpPage 状态
//   3) draw() 的 switch 里挂 case 'skillpanel'
//   4) explore 里加 K 键进入；skillpanel 里加键盘/鼠标处理
import fs from 'node:fs'

const p = 'game/game.js'
let s = fs.readFileSync(p, 'utf8')
let n = 0
const rep = (a, b, label) => {
  if (!s.includes(a)) { console.log('✗ ' + label); return }
  s = s.replace(a, b); n++; console.log('✓ ' + label)
}

// 1) 插入面板代码（放在「背包（多比面板）」注释之前）
const panel = fs.readFileSync('_tmp_skillpanel.js', 'utf8')
const anchor1 = '  // ==================== 背包（多比面板）===================='
rep(anchor1, panel + anchor1, '插入技能面板代码')

// 2) 状态
rep(
  'travelSel: 0, pickSel: 0, mapSel: 0, questSel: 0, bagSel: 0, bagPage: 0, statSel: 0, bagHover: -1,',
  'travelSel: 0, pickSel: 0, mapSel: 0, questSel: 0, bagSel: 0, bagPage: 0, statSel: 0, bagHover: -1,\n    skpSel: 0, skpPage: 0, skpHover: -1,',
  '加 skp 状态'
)

// 3) 绘制分派
rep(
  "      case 'bag': drawBag(); break",
  "      case 'bag': drawBag(); break\n      case 'skillpanel': drawSkillPanel(); break",
  '绘制分派'
)

// 4) explore 入口（跟 B/C/G 放一起）
rep(
  "      if (input.once('c') || input.once('C')) {\n        S.statSel = Math.max(0, D.FORMS.filter((f) => save.data.forms.includes(f.name)).findIndex((f) => f.name === S.form.name))\n        S.mode = 'stats'; input.clearFrame(); M.endFrame(); return\n      }",
  "      if (input.once('c') || input.once('C')) {\n        S.statSel = Math.max(0, D.FORMS.filter((f) => save.data.forms.includes(f.name)).findIndex((f) => f.name === S.form.name))\n        S.mode = 'stats'; input.clearFrame(); M.endFrame(); return\n      }\n      // K：技能面板（原版在「多比」面板里另开一页，这里做成独立界面）\n      if (input.once('k') || input.once('K')) {\n        S.skpSel = 0; S.skpPage = 0; S.skpHover = -1\n        S.mode = 'skillpanel'; input.clearFrame(); M.endFrame(); return\n      }",
  'K 键入口'
)

// 5) skillpanel 的输入处理（插在 bag 分支之前）
const bagBranch = "    } else if (S.mode === 'bag') {"
const skpInput = [
  "    } else if (S.mode === 'skillpanel') {",
  "      // ---------- 技能面板 ----------",
  "      const L = skillPanelLayout()",
  "      const n2 = L.all.length",
  "      const move = (d) => {",
  "        if (!n2) return",
  "        S.skpSel = (util.clamp(S.skpSel || 0, 0, n2 - 1) + d + n2) % n2",
  "        S.skpPage = Math.floor(S.skpSel / L.perPage)",
  "        audio.sfx('assets/sfx/onMouseOver_03.mp3')",
  "      }",
  "      if (input.once('ArrowLeft') || input.once('a')) move(-1)",
  "      if (input.once('ArrowRight') || input.once('d')) move(1)",
  "      if (input.once('ArrowUp') || input.once('w')) move(-SKP.lib.cols)",
  "      if (input.once('ArrowDown') || input.once('s')) move(SKP.lib.cols)",
  "      if (input.once('q') || input.once('Q')) { S.skpPage = (L.page + L.pages - 1) % L.pages; S.skpSel = S.skpPage * L.perPage }",
  "      if (input.once('e') || input.once('E')) { S.skpPage = (L.page + 1) % L.pages; S.skpSel = S.skpPage * L.perPage }",
  "      if (M.inside) {",
  "        const hover = rectHit(L.rects, M.x, M.y)",
  "        S.skpHover = hover",
  "        const moved = M.x !== S._skpmx || M.y !== S._skpmy",
  "        S._skpmx = M.x; S._skpmy = M.y",
  "        if (moved && hover >= 0 && hover !== S.skpSel) { S.skpSel = hover; audio.sfx('assets/sfx/onMouseOver_03.mp3') }",
  "        M.applyCursor(cvs, hover >= 0)",
  "      } else { S.skpHover = -1; M.applyCursor(cvs, false) }",
  "      if (input.once('Escape') || input.once('k') || input.once('K') || input.once('b') || input.once('B')) S.mode = 'explore'",
  bagBranch,
].join('\n')
rep(bagBranch, skpInput, 'skillpanel 输入处理')

fs.writeFileSync(p, s, 'utf8')
console.log(`共改 ${n} 处`)
