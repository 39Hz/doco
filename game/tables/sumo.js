// 大陆棋 —— 官方规则与落地数值（第 51 轮）
//
// 【为什么单独一个文件】这是**第二个"现有实现与原文不符"的对战副本**（第一个是晶石对战）。
// 第 47 轮查明：大陆棋根本不是"打一场架"，而是**推人下河的弹弓物理对战**。
// 规则全部来自 7k7k 的四篇攻略/新闻，逐字引用如下 —— 官方说了什么、我们定了什么，一眼可分。
//
// ══════════════ 官方原文（逐字） ══════════════
// 【入口与匹配】563724：「在**万象小屋的皮格万**处，选择进入大陆棋！系统会自动为玩家匹配…各路高手」
// 【地图】558220：「进入大陆棋以后双方会出现一张**随机地图，对战地图是不可以更换的**！」
// 【操作】558684：「开局谁先动是根据**双方用户多比速度**决定的，将鼠标指向出招的多比会出现一个**箭头**，
//   移动鼠标调整**箭头的方向和大小**，**箭头越大多比前进的距离就越大，中远程多比攻击的距离也越远**。」
//   「**瞄准敌人后松开鼠标就可以进行发射**。」
// 【胜负】558684：「游戏胜利的条件是**消灭对方的所有多比**。除了用攻击来消灭多比以外，
//   **将多比撞出地图范围，也就是撞进河里也可以消灭多比**。」「用多比把敌人撞出地图是一种**以小博大以弱胜强**的方法。」
// 【两种地图】558684：
//   「第一种：**长方形** … 这种地图比较安全，轻易不会被撞进河里，**自己注意要避开石头树木等障碍物**，
//     **不要把自己弹进河里了**。这种地图各种类型的多比都可以使用。」
//   「第二种：**I 形地图** … 中间的**桥**是很容易让多比被推下去的，这时候**远距离进攻多比就很重要**了。」
// 【四种类型】558658（多比选择篇，逐字）：
//   ·「**近距离攻击**多比**只有在撞到对方多比时才造成伤害**，用这种多比准头要好。这种多比**前进速度最快，
//      冲击力也最大**。」代表：**行者·孙**
//   ·「**中距离攻击**多比…前进速度较慢，但是发出的**攻击波**可以攻击距离较远的敌人，
//      不同类型的多比**可以同时发射 1-3 个光波**，实用性较强。」代表：**佩波·晶**
//   ·「**远距离攻击**多比…他们的**攻击范围非常远**，所以使用他必须要**算好发射距离**…
//      这种多比**一次可以攻击一片区域内的所有敌人**。」代表：**德拉科·龙**
//   ·「**治疗**多比…**没有攻击力**，但是可以给其他多比进行治疗，**治疗光波是在多比间弹射的**，
//      如果角度好，**一次可以治疗多只多比**。」代表：**菲尼克斯·凤**
// 【六项属性】558220：「每个多比在大陆棋中的重要属性由**生命、威力、防御、重量、移动、冷却**来决定」
//   「**重量**：被击中以后移动的距离，**重量越大越难被推开**」
//   「**冷却**：影响出手顺序，**冷却越小的出手越快**」
// 【公平性】558658：「大陆棋要求**最多的是操作**，多比本身的**等级影响并不大**，是非常公平的一种 PK 方式」
// 【障碍物】558700：「**石头，墓碑和树木可以抵挡攻击**，…躲在石头后面**直到他把石头打碎**」
// 【小地图】558700：「棋盘较大，可能没法看见敌人，这时候可以**移动屏幕上方小地图里的白色方框来调整视角**」
//   → 离线单机版把整张棋盘放进一屏，**不做小地图**（棋盘尺寸改成能全览，见「落地」）
//
// ══════════════ 落地：哪些是官方、哪些是推算 ══════════════
//   official：四种类型及其特性 · 六项属性的名字与两条说明 · 弹弓式操作 · 胜负条件（含撞进河）
//             · 两种地图及其特征 · 障碍物可挡可碎 · 出手顺序与速度/冷却有关 · 等级影响不大
//   derived ：每边 4 只（一种类型一只）—— 原文只说"从你拥有的多比中选"，没给数量
//             · 六项属性的具体数字 · 摩擦/碰撞伤害/击退公式 · 棋盘与河/桥/障碍的尺寸
//             · 队伍分组规则（见 D.sumoRoster 的注释）· 不做小地图（棋盘缩到一屏）
;(function () {
  const D = window.DKDbbData || (window.DKDbbData = {})

  const SRC = {
    entry: '7k7k/563724（副本攻略）',
    map: '7k7k/558220（新闻）',
    play: '7k7k/558684（怎么玩）',
    win: '7k7k/558684（怎么玩）· 7k7k/558700（实战原则）',
    types: '7k7k/558658（多比选择篇）· 7k7k/563724',
    attrs: '7k7k/558220（新闻）',
    obstacles: '7k7k/558700（实战原则）',
  }

  D.SUMO = {
    name: '大陆棋',
    entry: { npc: '皮格万', where: '万象小屋', evidence: SRC.entry, conf: 'official' },
    // 四种类型。id 用英文，name 用官方叫法，rep 是官方点名的代表多比。
    types: [
      {
        id: 'melee', name: '近距离攻击', rep: '行者·孙',
        rule: '只有在撞到对方多比时才造成伤害；前进速度最快，冲击力也最大',
        // 六项：生命 威力 防御 重量 移动 冷却（数值 derived；相对关系照官方描述）
        life: 132, power: 34, defense: 18, weight: 34, move: 1.00, cooldown: 3,
      },
      {
        id: 'mid', name: '中距离攻击', rep: '佩波·晶',
        rule: '发出的攻击波可以攻击距离较远的敌人，可以同时发射 1-3 个光波；前进速度较慢',
        life: 104, power: 26, defense: 12, weight: 26, move: 0.80, cooldown: 3,
        waves: [1, 3],
      },
      {
        id: 'long', name: '远距离攻击', rep: '德拉科·龙',
        rule: '攻击范围非常远，必须算好发射距离；一次可以攻击一片区域内的所有敌人',
        life: 88, power: 30, defense: 8, weight: 20, move: 0.66, cooldown: 4,
        areaR: 92,
      },
      {
        id: 'heal', name: '治疗', rep: '菲尼克斯·凤',
        rule: '没有攻击力，但可以给其他多比治疗；治疗光波在多比间弹射，角度好可以一次治疗多只',
        life: 104, power: 0, defense: 12, weight: 24, move: 0.80, cooldown: 2,
        heal: 26,
      },
    ],
    // 物理（全部 derived）。单位：棋盘像素 / 秒。
    phys: {
      friction: 1.9,        // 每秒衰减系数（速度 ×= exp(-friction·dt) 的近似：直接乘 (1-friction*dt)）
      stopSpeed: 8,         // 低于这个速度就停下
      minPower: 130, maxPower: 640,   // 箭头最短/最长对应的初速
      dmgK: 0.10,           // 撞击伤害 = 相对速度 × 威力 × dmgK / (对方防御 + 40)
                            // ⚠️ 这个系数是**实测调出来的**：0.42 时一次满力撞击能打 164 点，
                            //    而四类多比的生命只有 88~132 → **一击必杀**，击退距离根本看不出来
                            //    （撞死的那只不再移动）。0.10 时满力一击约 30~40 点，正好"三四下打死一个"。
      pushK: 1.35,          // 击退距离系数 = 相对速度 × pushK × 34 / (对方重量 + 20)
      collideR: 22,         // 多比碰撞半径
      waveSpeed: 420, waveR: 13, waveLife: 0.85,   // 光波
      obstacleHp: 120,      // 石头/树木/墓碑的血量（官方"躲在石头后面直到他把石头打碎"→ 要打几下才碎）
    },
    // 两种官方地图。river 是"河"（掉进去＝淘汰），bridge 是 I 形中间那条桥。
    maps: [
      {
        id: 'rect', name: '长方形', rule: '比较安全，轻易不会被撞进河里；注意避开石头树木等障碍物',
        w: 860, h: 420, river: 'border', obstacles: ['石头', '树木', '墓碑'], obstacleCount: 6,
        bridge: null,
      },
      {
        id: 'i', name: 'I 形', rule: '中间的桥很容易让多比被推下去，这时候远距离进攻多比就很重要',
        w: 860, h: 420, river: 'middle', obstacles: ['石头', '树木'], obstacleCount: 4,
        // 中间一条横向河道，只有中间一段是桥。桥宽 = 官方说的"桥"
        bridge: { y: 186, h: 48, x: 300, w: 260 },
      },
    ],
    evidence: SRC,
    note: '玩法/四类/六项属性/胜负条件/两种地图 = official；每边 4 只、各项数值、物理公式、棋盘尺寸 = derived（V71）',
  }

  // 治疗技判定：官方技能表里 `heal > 0`，或支撑类且描述里写着恢复/治疗。
  // 用**已有数据**判，不另立名单。
  D.isHealForm = function (form) {
    const sk = (form && form.skills) || []
    return sk.some((n) => {
      const s = D.SKILLS && D.SKILLS[n]
      if (!s) return false
      if ((s.heal || 0) > 0) return true
      return s.kind === 'support' && /恢复|治疗|回春|疗伤|回复/.test(s.desc || '')
    })
  }

  // 队伍分组（derived，规则写在这里，可被测试与界面对照）：
  //   官方只说「出战的多比是从你拥有的多比中选的」，**没说怎么分成四类**。
  //   所以用一条**可解释、可复核**的规则，全部依据官方数据（技能表 + 一级属性）：
  //     ① 治疗类 = 技能里带恢复技的（D.isHealForm）
  //     ② 近身类 = 剩下里「攻击 + 防御」最高的（官方：近身"防御力比较强大""冲击力也最大"）
  //     ③ 中距离类 = 剩下里魔攻最高的（官方：中距离"发出攻击波"）
  //     ④ 远距离类 = 剩下的里速度最高的（官方：远距离要算发射距离，靠机动占位）
  //   一只多比只用一次；不足四只时用官方点名的代表多比补位（**只在缺人时**，
  //   并且补位的那只标 `rep:true`，界面写明"归档没有它的立绘"）。
  D.sumoRoster = function (forms, level, opts) {
    const o = opts || {}
    const pool = (forms || []).slice()
    const st = (f) => D.statsAtLevel(f.stats, 1)
    const picked = {}
    const take = (test, sortKey) => {
      const cand = pool.filter((f) => !picked[f.name] && (!test || test(f)))
      if (!cand.length) return null
      cand.sort((a, b) => sortKey(b) - sortKey(a))
      picked[cand[0].name] = true
      return cand[0]
    }
    const roster = []
    const order = [
      ['heal', (f) => D.isHealForm(f), (f) => st(f).matk],
      ['melee', null, (f) => st(f).atk + st(f).def],
      ['mid', null, (f) => st(f).matk],
      ['long', null, (f) => st(f).spd],
    ]
    for (const [typeId, test, key] of order) {
      const f = take(test, key)
      if (f) roster.push({ typeId, form: f })
    }
    // 补位：用官方点名的代表多比（不借别的多比的立绘 → 标 rep 让界面如实说明）
    const T = D.SUMO.types
    for (const t of T) {
      if (roster.length >= 4) break
      if (roster.some((r) => r.typeId === t.id)) continue
      roster.push({ typeId: t.id, form: null, rep: true, repName: t.rep })
    }
    return roster.slice(0, 4).map((r) => {
      const t = T.find((x) => x.id === r.typeId)
      // 等级影响"不大"（官方），所以只给很轻的加成：每级 +1.5%，封顶 +60%
      const lvMul = 1 + Math.min(0.6, Math.max(0, ((level || 1) - 1) * 0.015))
      return {
        typeId: t.id, typeName: t.name, rep: t.rep,
        name: r.form ? r.form.name : r.repName,
        element: r.form ? r.form.element : null,
        form: r.form || null,
        artMissing: !r.form,          // 代表多比在归档里没有立绘 → 用类型色块
        life: Math.round(t.life * lvMul),
        power: Math.round(t.power * lvMul),
        defense: t.defense, weight: t.weight, move: t.move, cooldown: t.cooldown,
        waves: t.waves || null, areaR: t.areaR || 0, heal: t.heal || 0,
        rule: t.rule,
      }
    })
  }

  // 类型配色（只在"没有立绘"时用；有立绘就画立绘）—— 与官方无关，纯视觉
  D.SUMO_TYPE_COLOR = { melee: '#ff8a5c', mid: '#7ee0ff', long: '#c86bd8', heal: '#5ee06a' }
})()
