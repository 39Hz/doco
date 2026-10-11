// 索亚参战：把六只索亚的机制接进战斗。
//
// 效果表来自 assets/soya.js（_tools/gen-soya.mjs 按官方设定文案生成）：
//   170001 威泰格兽 守护 —— 主人受到的伤害 ×0.8
//   170002 伊莱切兽 静电 —— 主人攻击时有几率让目标麻痹一回合
//   170003 欧瑞坦兽 全力 —— 主人攻击 ×1.2
//   170004 凯科特斯 尖刺 —— 被攻击时反弹伤害
//   170005 帕古因兽 粘人 —— 每回合给主人回一点血
//   170006 斯提尔兽 钢爪 —— 追加一次爪击（有几率在打瞌睡）
import fs from 'node:fs'

const p = 'game/game.js'
let s = fs.readFileSync(p, 'utf8')
let n = 0
const rep = (a, b, label) => {
  if (!s.includes(a)) { console.log('X ' + label); return }
  s = s.replace(a, b); n++; console.log('OK ' + label)
}

// 1) 伤害公式里加索亚的攻/防修正
rep(
  '  function damage(attacker, defender, skill) {',
  [
    '  // 索亚的伤害修正（数值是 derived，见 assets/soya.js 的说明）',
    '  function soyaAtkMul(attacker) {',
    '    if (!attacker || !attacker.isPlayer) return 1',
    '    const sy = activeSoya()',
    "    return sy && sy.effect === 'power' ? 1.2 : 1",
    '  }',
    '  function soyaDefMul(defender) {',
    '    if (!defender || !defender.isPlayer) return 1',
    '    const sy = activeSoya()',
    "    return sy && sy.effect === 'guard' ? 0.8 : 1",
    '  }',
    '',
    '  function damage(attacker, defender, skill) {',
  ].join('\n'),
  '伤害公式的索亚修正函数'
)
rep(
  '    let dmg = Math.max(1, Math.round(DMG_K * base * defFactor(DEF(defender)) * em))',
  '    let dmg = Math.max(1, Math.round(DMG_K * base * defFactor(DEF(defender)) * em * soyaAtkMul(attacker) * soyaDefMul(defender)))',
  '伤害公式应用索亚修正'
)

// 2) 普通攻击：钢爪追加 + 静电麻痹 + 尖刺反弹
rep(
  [
    "      animName = actor.isPlayer ? animForSkill(S.form, '重击') : null",
    '      const parts = results.map((r) => r.missed ? \'落空\'',
  ].join('\n'),
  [
    "      animName = actor.isPlayer ? animForSkill(S.form, '重击') : null",
    '      // ---- 索亚：钢爪追加一击（官方设定"锋利的钢爪，很喜欢睡觉"，所以有几率打瞌睡）----',
    '      const syAtk = activeSoya()',
    "      if (actor.isPlayer && syAtk && syAtk.effect === 'claw') {",
    '        if (Math.random() < 0.65) {',
    '          const t0 = targets[0]',
    '          if (t0 && !t0.dead) {',
    '            const extra = Math.max(1, Math.round(DMG_K * POWER(actor) * 0.45 * defFactor(DEF(t0))))',
    '            t0.hp = Math.max(0, t0.hp - extra); t0.flash = 0.4',
    '            if (t0.hp === 0) t0.dead = true',
    '            results.push({ t: t0, dmg: extra, crit: false, missed: false, em: 1, spd: 1, soya: \'钢爪\' })',
    '            b0SoYaHop = 1',
    '          }',
    '        } else results.push({ t: null, dmg: 0, soya: \'打瞌睡\', slept: true })',
    '      }',
    '      // ---- 索亚：静电让目标麻痹 ----',
    "      if (actor.isPlayer && syAtk && syAtk.effect === 'shock') {",
    '        const t0 = targets[0]',
    '        if (t0 && !t0.dead && Math.random() < 0.35) {',
    '          t0.stun = 1',
    "          results.push({ t: t0, dmg: 0, soya: '麻痹' })",
    '        }',
    '      }',
    "      // ---- 索亚：尖刺反弹（敌人打主人时）----",
    "      if (!actor.isPlayer) {",
    '        const syDef = activeSoya()',
    "        if (syDef && syDef.effect === 'thorn') {",
    '          const back = Math.max(1, Math.round(actor.maxHp * 0.06))',
    '          actor.hp = Math.max(0, actor.hp - back)',
    '          if (actor.hp === 0) actor.dead = true',
    "          results.push({ t: actor, dmg: back, crit: false, missed: false, em: 1, spd: 1, soya: '尖刺' })",
    '        }',
    '      }',
    '      const parts = results.filter((r) => r.t).map((r) => r.missed ? \'落空\'',
  ].join('\n'),
  '普通攻击的索亚效果'
)
// parts 后面那句用了 results.map，过滤后要跟着改
rep(
  '      text_ = `${actor.name} 攻击：${parts.join(\'、\')}`',
  '      text_ = `${actor.name} 攻击：${parts.join(\'、\')}` + (syAtk && actor.isPlayer ? `　（${syAtk.effectLabel}）` : \'\')',
  '攻击文案带索亚'
)

// 3) 回合结束：粘人回血
rep(
  [
    '    b.round = (b.round || 1) + 1',
  ].join('\n'),
  [
    '    b.round = (b.round || 1) + 1',
    '    // ---- 索亚：粘人的每回合给主人回一点血（官方设定"很喜欢粘人"）----',
    '    const syR = activeSoya()',
    "    if (syR && syR.effect === 'cling' && !b.player.dead) {",
    '      const heal = Math.max(1, Math.round(b.player.maxHp * 0.05))',
    '      const before = b.player.hp',
    '      b.player.hp = Math.min(b.player.maxHp, b.player.hp + heal)',
    '      if (b.player.hp > before) {',
    '        b.log.push(`${syR.name} 凑过来蹭了蹭，生命 +${b.player.hp - before}`)',
    '        b.floats.push({ text: \'+\' + (b.player.hp - before), x: 0, y: 0, t: 0, dur: 1.0, color: \'#5ee06a\', size: 22, on: b.player })',
    '      }',
    '    }',
  ].join('\n'),
  '回合结束的粘人回血'
)

// 4) 麻痹的敌人在敌人回合跳过
rep(
  [
    '      while (b.enemyQueue.length && b.enemies[b.enemyQueue[0]].dead) b.enemyQueue.shift()',
    '      if (b.enemyQueue.length) { actEnemy(b.enemyQueue.shift()); return }',
  ].join('\n'),
  [
    '      while (b.enemyQueue.length && b.enemies[b.enemyQueue[0]].dead) b.enemyQueue.shift()',
    '      // 被静电麻痹的敌人跳过这一回合',
    '      while (b.enemyQueue.length && b.enemies[b.enemyQueue[0]].stun > 0) {',
    '        const se = b.enemies[b.enemyQueue.shift()]',
    '        se.stun--',
    '        b.log.push(`${se.name} 被静电麻痹，动弹不得`)',
    '      }',
    '      if (b.enemyQueue.length) { actEnemy(b.enemyQueue.shift()); return }',
  ].join('\n'),
  '麻痹跳过敌人回合'
)

// 5) 战斗里画索亚 + 跳动动画推进
rep(
  '    if (p.flash > 0) ctx.save()\n    drawFigure(P_POS.x + lungeP, P_POS.y, 170, pAction, pT, 1)',
  '    drawSoyaInBattle(now)          // 索亚站在主人身边\n    if (p.flash > 0) ctx.save()\n    drawFigure(P_POS.x + lungeP, P_POS.y, 170, pAction, pT, 1)',
  '战斗里画索亚'
)
rep(
  '    // 角色头顶不再挂名牌：左上角队伍卡已经写了名字/等级/形态，重复一份只是挡画面',
  '    // 角色头顶不再挂名牌：左上角队伍卡已经写了名字/等级/形态，重复一份只是挡画面\n    if (b0SoYaHop > 0) b0SoYaHop = Math.max(0, b0SoYaHop - 0.05)',
  '索亚跳动衰减'
)

fs.writeFileSync(p, s, 'utf8')
console.log('\ntotal ' + n)
