/* 领域层 · 战斗数值（纯逻辑，零 I/O）—— 第 72 轮重构批次 2。
 *
 * 本文件只回答"给一个单位和一个技能，攻/防/通道/克制/速度倍率各是多少"：
 *   · 双伤害通道（力量 / 精神力 / 魔武混合）—— 计划书 M1-3；
 *   · 同属性技能加成（同属性 ×1.15 / 异属性 ×0.92）—— 计划书 M1-5，derived；
 *   · 防御减免曲线 defFactor = clamp(1 - 防/(防+60), 0.55, 0.95)；
 *   · 速度 → 伤害倍率 speedMultiplier（分数化，不再是开关式连击）。
 *
 * ★ 为什么只迁这些、不迁 expectedDamage/damage ★
 *   完整伤害公式要读 `activeSoya()`（进而读存档 S）与索亚修正 `soyaAtkMul/soyaDefMul`，
 *   那是**应用层编排**，不是纯函数。硬迁进 domain 会让 domain 反向依赖 app（更糟）。
 *   所以这里只放**真正零 I/O 的叶子**：输入单位/技能对象，输出数字，不看 S、不看存档。
 *   本文档内出现的 DMG_K 等配置常数仍留在 game.js，与它唯一的使用者（expectedDamage）同处。
 *
 * 单位形状（调用方保证）：`u.stats.{atk,matk,def,mdef,spd,eva}`、`u.buffs`（数组）、`u.element`、
 * `skill.kind`、`skill.element`。本文件**不构造**这些对象，只读。
 */
(() => {
  'use strict'
  const G = (window.DKDbbGame = window.DKDbbGame || {})

  // ==================== 双伤害通道（计划书 M1-3）====================
  // ★ 计划书 M1-3 的硬约束 ★
  //   85 个技能里**只有 15 个**在官方说明里声明了类型（力量型/精神力/魔武混合/辅助），
  //   其余 69 个保持中性 `attack`。**不许为了让双通道"看起来生效"而给它们假声明类型。**
  //   中性技能按"与改造前一致"的方式处理：走力量通道。
  //
  // 魔防与防御共用同一条 defFactor 曲线：实测两边的数值本来就在同一量级
  // （怪物 攻击≈28/防御≈11、魔攻≈28/魔防≈7；形态 攻击 34~39/防御 11~19、魔攻 25~38/魔防 4~6），
  // 所以不需要再引入一个缩放常数（少一个凭空捏的系数）。
  function channelOf(skill) {
    const k = (skill && skill.kind) || 'attack'
    if (k === 'magic') return 'magic'
    if (k === 'hybrid') return 'hybrid'
    return 'physical'                       // physical 与未声明的 attack 都走力量通道
  }
  function buffed(u, stat, keys) {
    let v = stat
    for (const b of u.buffs) for (const k of keys) if (b[k]) v *= 1 + b[k]
    return v
  }
  function atkOf(u, channel) {
    const atk = u.stats.atk, matk = u.stats.matk != null ? u.stats.matk : atk
    if (channel === 'magic') return buffed(u, matk, ['matk'])
    if (channel === 'hybrid') return (buffed(u, atk, ['atk']) + buffed(u, matk, ['matk'])) / 2
    return buffed(u, atk, ['atk'])
  }
  function defOf(u, channel) {
    const def = u.stats.def, mdef = u.stats.mdef != null ? u.stats.mdef : def
    if (channel === 'magic') return buffed(u, mdef, ['mdef'])
    if (channel === 'hybrid') return (buffed(u, def, ['def']) + buffed(u, mdef, ['mdef'])) / 2
    return buffed(u, def, ['def'])
  }

  // ==================== 同属性技能加成（计划书 M1-5）====================
  // 官方《多克多比技能大全》原文里有一句：
  //   「不要犯那种**派出毒多比一身光系技能**的低级错误」
  // 既然"一身别的属性"算低级错误，说明**同属性技能是有加成的**。
  // ★ 具体幅度官方没给 → 这里的 1.15 / 0.92 是 derived，只有这一处，可整体调。
  const SAME_ELEM_BONUS = 1.15
  const OFF_ELEM_PENALTY = 0.92
  function elementFitMul(attacker, skill) {
    const se = skill && skill.element
    const ae = attacker && attacker.element
    if (!se || !ae || ae === '无') return 1      // 技能或形态本身没属性 → 不加不减
    return se === ae ? SAME_ELEM_BONUS : OFF_ELEM_PENALTY
  }

  // ==================== 防御减免曲线 ====================
  // 伤害 = K × 攻 × defFactor × 克制 × 暴击
  // defFactor = clamp(1 - 防/(防+60), 0.55, 0.95)
  //
  // 为什么是这个形状（都是实测换来的）：
  //  · 最早的 atk*2 - def*1.2 对攻防差过度敏感：攻 26→46（+77%）伤害涨 3.6 倍，
  //    于是"温德·冽"在熔岩火山岛只有 4% 胜率、"厄斯·垒"97%，形态之间不是风格差异而是能不能玩。
  //  · 换成 ratio（K·攻²/(攻+防)）后攻的敏感度缓解了，但中段曲率大：
  //    怪等级 +2 → 92% 胜率，+3 → 52%，完全断崖，没有可用的中间档。
  //  · 现在这条对攻线性、防御有上下限，实测 offset +2/3/4/5 对应 96%/78%/71%/56%，
  //    是一条可用的连续曲线（见 _tools/solve-formula2.mjs）。
  // clamp 是本仓库 `util.clamp` 的**内联等价**（domain 层不引 window.DKDbb.util）。
  function defFactor(def) {
    const v = 1 - def / (def + 60)
    return v < 0.55 ? 0.55 : v > 0.95 ? 0.95 : v
  }

  // ==================== 速度 → 伤害倍率 ====================
  // （旧注释：K=0.8、cap=0.5 对应的实测标尺）
  //   · 快 15% → 1.12 倍
  //   · 快 50% → 1.40 倍（K=2.9 下相当于"多打半下"）
  // 早先用的是开关式（快 15% 得 2 连击、快 30% 得 3 连击），结果是
  // 速度 176+ 的形态永远三连击拿 100% 胜率、速度 146- 的永远零加成拿 25%，
  // 攻血几乎一样却差 3 倍 —— 一个开关决定成败。分数化之后速度仍是明确优势，但不是生死线。
  const SPD_K = 0.8
  const SPD_CAP = 0.5
  function speedMultiplier(attacker, defender) {
    // 防守方的回避会削弱对方的连击（回避型形态的第二条命）
    const a = (attacker.stats.spd || 100) * (1 - Math.min(0.12, (defender.stats.eva || 35) / 800))
    const d = defender.stats.spd || 100
    if (a <= d) return 1
    return 1 + Math.min(SPD_CAP, SPD_K * (a / d - 1))
  }

  G.domain = G.domain || {}
  G.domain.battleMath = { channelOf, buffed, atkOf, defOf, elementFitMul, defFactor, speedMultiplier, SAME_ELEM_BONUS, OFF_ELEM_PENALTY, SPD_K, SPD_CAP }
})()