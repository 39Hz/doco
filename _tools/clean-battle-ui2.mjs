// 配合战斗界面清理的连带修改：
//   1) 指令格从 6 个减到 5 个 —— 「防御」现在是真能用的，不能再标 disabled
//   2) 左下要显示"回合"，得真的记录 b.round
//   3) battleLayout 里那四颗小圆钮已经不用了，删掉计算
import fs from 'node:fs'

const p = 'game/game.js'
let s = fs.readFileSync(p, 'utf8')
let n = 0
const rep = (a, b, label) => {
  if (!s.includes(a)) { console.log('✗ ' + label); return }
  s = s.replace(a, b); n++; console.log('✓ ' + label)
}

// 1) 不再有禁用格
rep(
  "      label, i, disabled: i === 3 || i === 5,",
  "      label, i,",
  '指令格取消禁用标记'
)
rep(
  [
    '          const step = (d) => {',
    '            for (let k = 1; k <= L.cmdRects.length; k++) {',
    '              const i = (b.menuSel + d * k + L.cmdRects.length * 2) % L.cmdRects.length',
    '              if (!L.cmdRects[i].disabled) { b.menuSel = i; break }',
    '            }',
    "            audio.sfx('assets/sfx/onMouseOver_03.mp3')",
    '          }',
  ].join('\n'),
  [
    '          const step = (d) => {',
    '            b.menuSel = (b.menuSel + d + L.cmdRects.length) % L.cmdRects.length',
    "            audio.sfx('assets/sfx/onMouseOver_03.mp3')",
    '          }',
  ].join('\n'),
  '键盘选格改为简单循环'
)
rep(
  [
    '          } else if (b.menu === \'main\' && hoverCmd >= 0) {',
    '            const rc = L.cmdRects[hoverCmd]',
    '            if (rc && !rc.disabled) doCommand(hoverCmd)',
    "            else toast('这个指令还没开放')",
  ].join('\n'),
  [
    "          } else if (b.menu === 'main' && hoverCmd >= 0) {",
    '            doCommand(hoverCmd)',
  ].join('\n'),
  '点击指令不再判禁用'
)
rep(
  [
    "      ctx.fillStyle = r.disabled ? 'rgba(30,42,62,.9)' : sel ? 'rgba(255,210,63,.26)' : hovered ? 'rgba(43,217,200,.22)' : 'rgba(24,38,62,.95)'",
    '      barRound(r.x, r.y, r.w, r.h, 12); ctx.fill()',
    "      ctx.strokeStyle = r.disabled ? 'rgba(255,255,255,.12)' : sel ? '#ffd23f' : hovered ? '#43d9c8' : '#5b86b8'",
  ].join('\n'),
  [
    "      ctx.fillStyle = sel ? 'rgba(255,210,63,.26)' : hovered ? 'rgba(43,217,200,.22)' : 'rgba(24,38,62,.95)'",
    '      barRound(r.x, r.y, r.w, r.h, 12); ctx.fill()',
    "      ctx.strokeStyle = sel ? '#ffd23f' : hovered ? '#43d9c8' : '#5b86b8'",
  ].join('\n'),
  '指令格配色去掉禁用态'
)
rep(
  [
    "      text.stroked(ctx, r.label, cx, r.y + r.h - 8,",
    "        { size: 13, align: 'center', lw: 3, color: r.disabled ? '#5d6a80' : sel ? '#ffe45e' : '#e8eefc' })",
    '      if (r.disabled) {',
    "        text.stroked(ctx, '未开放', cx, cy + 6, { size: 10, align: 'center', lw: 3, color: '#5d6a80' })",
    '      }',
  ].join('\n'),
  [
    "      text.stroked(ctx, r.label, cx, r.y + r.h - 8,",
    "        { size: 13, align: 'center', lw: 3, color: sel ? '#ffe45e' : '#e8eefc' })",
  ].join('\n'),
  '指令格去掉"未开放"字样'
)

// 2) 记录回合数
rep(
  "      victory: false,\n      // 敌人出手队列",
  "      victory: false, round: 1,\n      // 敌人出手队列",
  'startBattle 加 round'
)
rep(
  [
    '    // 回合结束',
    '    b.enemyPhase = false',
    '    b.enemyQueue = []',
  ].join('\n'),
  [
    '    // 回合结束',
    '    b.enemyPhase = false',
    '    b.enemyQueue = []',
    '    b.round = (b.round || 1) + 1',
  ].join('\n'),
  '回合结束 +1'
)

// 3) 删掉不再使用的小圆钮计算
rep(
  [
    '    // 大红圆钮（原版那个"确定"钮）与周围四颗小圆钮',
    "    const bigC = { x: rowX + totalW + 76, y: B.y + BATTLE_BAR_H / 2, r: B.bigR }",
    '    const small = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => ({',
    '      x: bigC.x + sx * (B.bigR + 14), y: bigC.y + sy * (B.bigR + 14), r: 13,',
    '    }))',
    '    return { cmdRects, skillRects, gridW, gridH, gx, gy, cmdY: rowY, barY: B.y, bigC, small }',
  ].join('\n'),
  [
    '    // 大红圆钮（原版那个"确定"钮）。周围原来还有四颗小圆钮，纯装饰已删。',
    '    const bigC = { x: rowX + totalW + 76, y: B.y + BATTLE_BAR_H / 2, r: B.bigR }',
    '    return { cmdRects, skillRects, gridW, gridH, gx, gy, cmdY: rowY, barY: B.y, bigC }',
  ].join('\n'),
  '删小圆钮计算'
)

fs.writeFileSync(p, s, 'utf8')
console.log(`\n共改 ${n} 处`)
