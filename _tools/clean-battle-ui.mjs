// 战斗界面清理：删掉"看着像功能、其实什么都不做"的装饰，把留下的做成真的。
//
// 用户反馈"战斗界面有很多东西是无用的"。逐项清理：
//   1) 角色头顶的名牌 ← 和左上角队伍卡完全重复，删
//   2) 左上角 330×116 战斗日志框 ← 官方没有，占一大块；改成顶部一行提示
//   3) 大圆钮周围 4 颗小圆钮 ← 纯装饰，删
//   4) 左下小面板的橙色三角 + 两个小方块 ← 画得像按钮但没功能，删（金币挪到队伍卡）
//   5) 指令格「自动」← 未开放占一格，删
//   6) 红色行动条 ← 原来是假进度；改成真的"本回合出手进度"
import fs from 'node:fs'

const p = 'game/game.js'
let s = fs.readFileSync(p, 'utf8')
let n = 0
const rep = (a, b, label) => {
  if (!s.includes(a)) { console.log('✗ ' + label); return }
  s = s.replace(a, b); n++; console.log('✓ ' + label)
}

// ---- 1) 删掉角色头顶名牌 ----
rep(
  [
    '    // 玩家名牌（左下，在日志下方、角色上方）',
    '    const nameY = P_POS.y - 210',
    "    ctx.fillStyle = 'rgba(8,12,22,.8)'",
    '    ctx.fillRect(P_POS.x - 76, nameY - 18, 152, 26)',
    "    ctx.strokeStyle = D.ELEMENT_COLOR[S.form.element] || '#43d9c8'; ctx.lineWidth = 1.5",
    '    ctx.strokeRect(P_POS.x - 75.5, nameY - 17.5, 151, 25)',
    "    text.stroked(ctx, `${p.name} Lv.${p.level}`, P_POS.x, nameY, { size: 13, align: 'center', color: '#43d9c8' })",
    "    text.stroked(ctx, S.form.name, P_POS.x, nameY + 22, { size: 11.5, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })",
  ].join('\n'),
  [
    '    // 角色头顶不再挂名牌：左上角队伍卡已经写了名字/等级/形态，重复一份只是挡画面',
  ].join('\n'),
  '删角色头顶名牌'
)

// ---- 2) 战斗日志框 → 顶部一行提示 ----
rep(
  [
    '    // ---------- 战斗日志（左上角队伍卡的下方）----------',
    '    // 队伍状态卡现在占了 8..70，所以日志从 78 开始，避免压住血条',
    "    ctx.fillStyle = 'rgba(8,12,22,.78)'; ctx.fillRect(14, 78, 330, 112)",
    "    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.strokeRect(14.5, 78.5, 329, 111)",
    '    b.log.slice(-5).forEach((line, i, arr) => {',
    '      text.stroked(ctx, line, 26, 100 + i * 19, {',
    "        size: 12, weight: 'normal', lw: 3,",
    "        color: i === arr.length - 1 ? '#ffe45e' : '#cfd6e4',",
    '      })',
    '    })',
  ].join('\n'),
  [
    '    // ---------- 战斗提示：只留最近一行 ----------',
    '    // 原来是一个 330×116 的日志框挂在左上角，官方没有这东西，而且挡掉一块战场。',
    '    // 现在只把**最后一条**消息显示在顶部中间，历史信息靠伤害飘字表达。',
    '    if (b.log.length) {',
    '      const last = b.log[b.log.length - 1]',
    '      ctx.save()',
    "      ctx.font = 'bold 13px \"Microsoft YaHei\", sans-serif'",
    '      const tw = ctx.measureText(last).width',
    '      ctx.fillStyle = \'rgba(8,12,22,.72)\'',
    '      ctx.fillRect(W / 2 - tw / 2 - 12, 88, tw + 24, 24)',
    '      ctx.restore()',
    '      text.stroked(ctx, last, W / 2, 105, { size: 13, align: \'center\', color: \'#ffe45e\', lw: 3 })',
    '    }',
  ].join('\n'),
  '战斗日志框改成顶部一行'
)

// ---- 3) 删除大圆钮周围的四颗小圆钮 ----
rep(
  [
    '      L.small.forEach((s2) => {',
    "        ctx.fillStyle = '#1b4a86'",
    '        ctx.beginPath(); ctx.arc(s2.x, s2.y, s2.r, 0, Math.PI * 2); ctx.fill()',
    "        ctx.strokeStyle = '#5aa8ff'; ctx.lineWidth = 2",
    '        ctx.beginPath(); ctx.arc(s2.x, s2.y, s2.r - 1, 0, Math.PI * 2); ctx.stroke()',
    '      })',
  ].join('\n'),
  [
    '      // （原来这里还有四颗小圆钮，纯装饰、点了没反应，已删）',
  ].join('\n'),
  '删四颗小圆钮'
)

// ---- 4) 左下小面板：去掉假按钮，只留金币 ----
rep(
  [
    "    // 左侧小面板：原版那里是一个收起/展开三角加两个小按钮",
    "    ctx.fillStyle = 'rgba(20,40,72,.95)'",
    '    barRound(B.leftX, B.y + 14, B.leftW, BATTLE_BAR_H - 28, 10); ctx.fill()',
    "    ctx.strokeStyle = '#2b7ec9'; ctx.lineWidth = 2",
    '    barRound(B.leftX + 1, B.y + 15, B.leftW - 2, BATTLE_BAR_H - 30, 9); ctx.stroke()',
    "    ctx.fillStyle = '#ff9c2a'",
    '    ctx.beginPath()',
    '    ctx.moveTo(B.leftX + 18, B.y + 42)',
    '    ctx.lineTo(B.leftX + 40, B.y + 42)',
    '    ctx.lineTo(B.leftX + 29, B.y + 30)',
    '    ctx.closePath(); ctx.fill()',
    "    ctx.fillStyle = '#ff7a2a'",
    '    ctx.fillRect(B.leftX + 16, B.y + 54, 26, 16)',
    "    ctx.fillStyle = '#ffb44a'",
    '    ctx.fillRect(B.leftX + 52, B.y + 54, 26, 16)',
    "    text.stroked(ctx, `金币 ${save.data.gold}`, B.leftX + B.leftW / 2, B.y + 90,",
    "      { size: 12, align: 'center', color: '#ffd23f', lw: 3 })",
  ].join('\n'),
  [
    '    // 左侧小面板：原来画了一个橙色三角 + 两个小方块（像按钮但没有任何功能），已删。',
    '    // 只留"本场敌人数量"这个真正有信息量的东西。',
    "    ctx.fillStyle = 'rgba(20,40,72,.95)'",
    '    barRound(B.leftX, B.y + 14, B.leftW, BATTLE_BAR_H - 28, 10); ctx.fill()',
    "    ctx.strokeStyle = '#2b7ec9'; ctx.lineWidth = 2",
    '    barRound(B.leftX + 1, B.y + 15, B.leftW - 2, BATTLE_BAR_H - 30, 9); ctx.stroke()',
    '    const aliveCnt = b.enemies.filter((e) => !e.dead).length',
    "    text.stroked(ctx, '敌人', B.leftX + B.leftW / 2, B.y + 40,",
    "      { size: 12, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })",
    '    text.stroked(ctx, `${aliveCnt} / ${b.enemies.length}`, B.leftX + B.leftW / 2, B.y + 66,',
    "      { size: 18, align: 'center', color: '#ffd23f', lw: 3 })",
    "    text.stroked(ctx, `回合 ${b.round || 1}`, B.leftX + B.leftW / 2, B.y + 88,",
    "      { size: 11.5, align: 'center', color: '#9fb0cc', weight: 'normal', lw: 3 })",
  ].join('\n'),
  '左下小面板去掉假按钮，改成敌人数量/回合'
)

// ---- 5) 指令格去掉「自动」 ----
rep(
  "    const items = ['攻击', '技能', '道具', '防御', '逃跑', '自动']",
  "    // 只保留真正能用的五格（原来的「自动」是未开放占位，已去掉）\n    const items = ['攻击', '技能', '道具', '防御', '逃跑']",
  '指令格去掉「自动」'
)

// ---- 6) 红色行动条改成真实的出手进度 ----
rep(
  [
    "    // 红色行动条（原版在指令格上方那条）",
    '    {',
    '      const ax = L.cmdRects[0].x, aw = L.cmdRects[5].x + L.cmdRects[5].w - ax',
    "      ctx.fillStyle = '#2a0f12'",
    '      ctx.fillRect(ax, B.y + 14, aw, 10)',
    '      // 进度：本回合玩家已出手 = 半满，敌人阶段 = 满',
    "      const k = b.actionSide === 'enemy' ? 1 : b.phase === 'acting' ? 0.6 : 0.35",
    "      ctx.fillStyle = '#c0392b'",
    '      ctx.fillRect(ax + 2, B.y + 16, (aw - 4) * k, 6)',
    "      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1",
    '      ctx.strokeRect(ax + .5, B.y + 14.5, aw - 1, 9)',
    '      for (let i = 1; i < 4; i++) {',
    "        ctx.fillStyle = 'rgba(255,255,255,.25)'",
    '        ctx.fillRect(ax + (aw / 4) * i, B.y + 14, 1, 10)',
    '      }',
    '    }',
  ].join('\n'),
  [
    '    // 红色行动条：原来是"看着像进度条但数值是编的"。',
    '    // 现在做成真的 —— 它表示**本回合敌人出手进度**（队列里还剩几只没动）。',
    '    {',
    '      const first = L.cmdRects[0], lastR = L.cmdRects[L.cmdRects.length - 1]',
    '      const ax = first.x, aw = lastR.x + lastR.w - ax',
    '      const total = Math.max(1, b.enemies.length)',
    '      const left = b.enemyPhase ? (b.enemyQueue ? b.enemyQueue.length : 0) : total',
    '      const done = total - left',
    "      ctx.fillStyle = '#2a0f12'",
    '      ctx.fillRect(ax, B.y + 14, aw, 10)',
    "      ctx.fillStyle = '#c0392b'",
    '      ctx.fillRect(ax + 2, B.y + 16, (aw - 4) * util.clamp(done / total, 0, 1), 6)',
    "      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1",
    '      ctx.strokeRect(ax + .5, B.y + 14.5, aw - 1, 9)',
    '      for (let i = 1; i < total; i++) {',
    "        ctx.fillStyle = 'rgba(255,255,255,.25)'",
    '        ctx.fillRect(ax + (aw / total) * i, B.y + 14, 1, 10)',
    '      }',
    "      text.stroked(ctx, b.enemyPhase ? `敌人行动中 ${done}/${total}` : '本回合已轮到我方',",
    '        ax + aw + 8, B.y + 24, { size: 10.5, weight: \'normal\', lw: 3, color: \'#9fb0cc\' })',
    '    }',
  ].join('\n'),
  '红色行动条改成真实出手进度'
)

fs.writeFileSync(p, s, 'utf8')
console.log(`\n共清理 ${n} 处`)
