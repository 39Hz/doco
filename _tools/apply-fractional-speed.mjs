// 落地"分数连击"：把开关式连击（快 15% 得 2 段 / 快 30% 得 3 段）换成伤害倍率。
//
// 为什么必须换（实测）：
//   玩家基础速度 152，阈值卡在 1.15 / 1.30。
//   形态速度 ≥176 的（瑞比特·兔、温德·冽）对多数怪稳过 1.30 → 永远 3 连击 → 96~100% 胜率
//   形态速度 ≤146 的（厄斯·垒、沃特·空、费尔·凌）永远过不了 1.15 → 零加成 → 25~36% 胜率
//   攻血几乎一样，胜率差 3 倍，全在速度这一个开关上。
// 换成倍率 1 + min(0.9, 0.8×(速度比-1)) 后，速度型仍然更强，但没有"过阈值无敌/差一点白给"。
import { readFileSync, writeFileSync } from 'node:fs'

const gPath = 'game/game.js'
let gj = readFileSync(gPath, 'utf8')
const before = gj

const oldFn = gj.slice(gj.indexOf('  // ==================== 速度 ===================='),
  gj.indexOf('  // 玩家每回合的被动回复'))
if (!oldFn) throw new Error('找不到速度段')
const newFn = `  // ==================== 速度 ====================
  // 原表给每个形态都标了速度（128~180），之前完全没用上，
  // 于是风系"速度出众"的设定形同虚设，只剩"攻低血少"这个缺点。
  //
  // 现在是**分数连击**：伤害倍率 = 1 + min(cap, k × (速度比 - 1))。
  //   · 速度持平 → 1.00 倍
  //   · 快 20% → 1.16 倍
  //   · 快 50% → 1.40 倍（K=2.9 下相当于"多打半下"）
  // 早先用的是开关式（快 15% 得 2 连击、快 30% 得 3 连击），结果是
  // 速度 176+ 的形态永远三连击拿 100% 胜率、速度 146- 的永远零加成拿 25%，
  // 攻血几乎一样却差 3 倍 —— 一个开关决定成败。分数化之后速度仍是明确优势，但不是生死线。
  function speedMultiplier(attacker, defender) {
    const a = attacker.stats.spd || 100, d = defender.stats.spd || 100
    if (a <= d) return 1
    return 1 + Math.min(SPD_CAP, SPD_K * (a / d - 1))
  }
  const SPD_K = 0.8
  const SPD_CAP = 0.5

`
gj = gj.replace(oldFn, newFn)

// perform 里把"段数"改成"倍率"
gj = gj.replace(`      for (const t of targets) {
        // 速度决定连击数：快的一方一回合多打几下（风系的核心身份）
        const hits = speedMultiplier(actor, t)
        let total = 0, anyCrit = false, missed = 0
        for (let i = 0; i < hits; i++) {
          const r = damage(actor, t, null)
          if (r.missed) { missed++; continue }
          total += r.dmg
          if (r.crit) anyCrit = true
        }
        t.hp = Math.max(0, t.hp - total); t.flash = 0.4
        if (t.hp === 0) t.dead = true
        results.push({ t, dmg: total, crit: anyCrit, missed: missed === hits, em: 1, hits })
      }
      animName = actor.isPlayer ? animForSkill(S.form, '重击') : null
      const parts = results.map((r) => r.missed ? '落空'
        : \`\${r.dmg}\${r.hits > 1 ? \` ×\${r.hits}连击\` : ''}\${r.crit ? ' 暴击' : ''}\`)`,
`      for (const t of targets) {
        // 速度 → 伤害倍率（见上面的 speedMultiplier）
        const mul = speedMultiplier(actor, t)
        const r0 = damage(actor, t, null)
        const total = r0.missed ? 0 : Math.round(r0.dmg * mul)
        t.hp = Math.max(0, t.hp - total); t.flash = 0.4
        if (t.hp === 0) t.dead = true
        results.push({ t, dmg: total, crit: r0.crit, missed: r0.missed, em: 1, spd: mul })
      }
      animName = actor.isPlayer ? animForSkill(S.form, '重击') : null
      const parts = results.map((r) => r.missed ? '落空'
        : \`\${r.dmg}\${r.spd > 1.02 ? \` (速度×\${r.spd.toFixed(2)})\` : ''}\${r.crit ? ' 暴击' : ''}\`)`)

// 技能也要吃速度倍率（否则速度型用技能就没优势了）
gj = gj.replace(`        for (const t of targets) {
          const r = damage(actor, t, sk)
          t.hp = Math.max(0, t.hp - r.dmg); t.flash = 0.4
          if (t.hp === 0) t.dead = true
          results.push({ t, ...r, hits: 1 })
        }`,
`        for (const t of targets) {
          const r = damage(actor, t, sk)
          const mul = speedMultiplier(actor, t)
          const dmg2 = r.missed ? 0 : Math.round(r.dmg * mul)
          t.hp = Math.max(0, t.hp - dmg2); t.flash = 0.4
          if (t.hp === 0) t.dead = true
          results.push({ t, ...r, dmg: dmg2, spd: mul })
        }`)

writeFileSync(gPath, gj, 'utf8')
console.log('已改 game/game.js：')
console.log('  · speedMultiplier 改为分数倍率 1 + min(0.5, 0.8×(速度比-1))')
console.log('  · 普攻与技能都吃速度倍率')
console.log('  改动: ' + before.length + ' → ' + gj.length + ' 字节')
const left = (gj.match(/hits/g) || []).length
console.log('  （残留 hits 引用 ' + left + ' 处，应为 0）')
