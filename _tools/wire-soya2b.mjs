// 把索亚面板 + 面板输入接进 game.js。
import fs from 'node:fs'

const p = 'game/game.js'
let s = fs.readFileSync(p, 'utf8')
let n = 0
const rep = (a, b, label) => {
  if (!s.includes(a)) { console.log('X ' + label); return }
  s = s.replace(a, b); n++; console.log('OK ' + label)
}

const panel = fs.readFileSync('_tmp_soya_panel.js', 'utf8')
rep('  // ==================== 技能面板（照官方 技能面板.jpg）====================',
  panel + '  // ==================== 技能面板（照官方 技能面板.jpg）====================',
  'insert soya panel')

rep('    skpSel: 0, skpPage: 0, skpHover: -1,',
  '    skpSel: 0, skpPage: 0, skpHover: -1, soyaSel: 0, soyaHover: -1,',
  'add soya state')

rep("      case 'skillpanel': drawSkillPanel(); break",
  "      case 'skillpanel': drawSkillPanel(); break\n      case 'soya': drawSoyaPanel(); break",
  'draw dispatch')

const entry = [
  '      // P：索亚面板（陪伴宠物，原版的第二个核心系统）',
  "      if (input.once('p') || input.once('P')) {",
  '        S.soyaSel = Math.max(0, (D.SOYA || []).findIndex((x) => x.id === save.data.soyaActive))',
  '        S.soyaHover = -1',
  "        S.mode = 'soya'; input.clearFrame(); M.endFrame(); return",
  '      }',
  '      // K：技能面板（原版在「多比」面板里另开一页，这里做成独立界面）',
].join('\n')
rep('      // K：技能面板（原版在「多比」面板里另开一页，这里做成独立界面）', entry, 'P key entry')

const inputBlock = [
  "    } else if (S.mode === 'soya') {",
  '      // ---------- 索亚面板 ----------',
  '      const L = soyaLayout()',
  '      const n2 = L.all.length',
  "      if (input.once('ArrowLeft') || input.once('a')) S.soyaSel = (S.soyaSel + n2 - 1) % n2",
  "      if (input.once('ArrowRight') || input.once('d')) S.soyaSel = (S.soyaSel + 1) % n2",
  "      if (input.once('ArrowUp') || input.once('w')) S.soyaSel = (S.soyaSel - SOYA.grid.cols + n2) % n2",
  "      if (input.once('ArrowDown') || input.once('s')) S.soyaSel = (S.soyaSel + SOYA.grid.cols) % n2",
  '      if (M.inside) {',
  '        const hover = rectHit(L.rects, M.x, M.y)',
  '        S.soyaHover = hover',
  '        const moved = M.x !== S._symx || M.y !== S._symy',
  '        S._symx = M.x; S._symy = M.y',
  '        if (moved && hover >= 0 && hover !== S.soyaSel) S.soyaSel = hover',
  '        M.applyCursor(cvs, hover >= 0)',
  '      } else { S.soyaHover = -1; M.applyCursor(cvs, false) }',
  '      const equipSoya = () => {',
  '        const sy = L.all[util.clamp(S.soyaSel, 0, n2 - 1)]',
  '        if (!sy) return',
  '        if (!(save.data.soya || []).includes(sy.id)) { toast(`还没有 ${sy.name}　打赢各岛怪物有几率遇到`); return }',
  '        save.data.soyaActive = save.data.soyaActive === sy.id ? null : sy.id',
  '        save.persist()',
  "        toast(save.data.soyaActive ? `${sy.name} 参战！` : '已让索亚休息')",
  "        audio.sfx('assets/sfx/onClick_03.mp3')",
  '      }',
  "      if (input.once(' ') || input.once('Enter')) equipSoya()",
  '      if (M.clicked && S.soyaHover >= 0) equipSoya()',
  "      if (input.once('Escape') || input.once('p') || input.once('P')) S.mode = 'explore'",
  "    } else if (S.mode === 'skillpanel') {",
].join('\n')
rep("    } else if (S.mode === 'skillpanel') {", inputBlock, 'soya panel input')

fs.writeFileSync(p, s, 'utf8')
console.log('total ' + n)
