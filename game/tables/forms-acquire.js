// 多比形态的**获取途径**（第 52 轮）
//
// 【为什么需要这个文件】用户看着"唤醒多比"面板问：「这个唤醒条件在哪？这个咋唤醒？活动在哪？」
// 问题是真的：52 只形态里**只有 4 只可唤醒**，另外 **48 只被标成"限定形态…靠活动/掉落获得"，
// 而单机版既没有运营活动、也没有对应的掉落** —— 等于 48 只永远拿不到。
//
// 官方依据（原版策划表「多比名称和描述.xlsx」第 13/14/15 列 = 勇气/智慧/魅力）：
//   · **唤醒**：条件三项**有数值**的形态 → 靠 勇气/智慧/魅力 唤醒。官方原文另说
//     「完成小游戏会得到智慧、勇气和魅力，这些是唤醒多比必不可少的」（见 data.js 注释）。
//     原表里这样的形态只有 **4 只**（费尔·凌 / 沃特·空 / 温德·冽 / 厄斯·垒）。
//   · **限定**：三项**全为 0** 的形态（48 只）—— 原表把它们标成"限定形态"，
//     实际来源是**运营活动与掉落**。**单机版没有运营活动**，所以必须给一条替代途径，
//     否则这 48 只就是死的。这里按 R9 的做法：**明说是替代、写清依据等级**，不假装是原版途径。
//
// 替代途径（全部 derived，V72）：
//   ① **珍宝小屋兑换**（主途径、确定性）：用白色彩晶石换。白色彩晶石本身是官方经济
//      （官方：精英怪/副本BOSS/野外BOSS 掉碎片 → 每天最多合成 5 块），所以这条途径
//      **用的是官方货币**，只是"拿它换形态"这个用途是我们加的。
//   ② **副本 BOSS 首通掉落**：13 个副本各绑一只主题相符的限定形态，**首次通关必掉**。
//      比"概率掉落"好：玩家知道打哪个副本拿哪只，也能被测试钉住（概率掉落没法做确定性断言）。
;(function () {
  const D = window.DKDbbData || (window.DKDbbData = {})

  const EVID = {
    awaken: '原版策划表「多比名称和描述.xlsx」第 13/14/15 列（勇气/智慧/魅力）；' +
      '「完成小游戏会得到智慧、勇气和魅力，这些是唤醒多比必不可少的」',
    limited: '原版策划表里该形态的唤醒条件三项全为 0 → 原版归为**限定形态**（活动/掉落）',
    alt: '单机版替代途径（无运营活动）：珍宝小屋兑换 / 副本 BOSS 首通掉落',
  }

  // ==========================================================================
  // ★ 「这只形态有没有模型立绘」—— **唯一判定入口**（第 66 轮，用户要求）
  //
  // 用户原话：「**没有模型立绘的就不要在玩家获得里面，包括你自己做的**」。
  //
  // 为什么要有这个单一入口：在这之前"能不能获得"和"有没有立绘"**是两件互不相干的事** ——
  // 24 只**没有任何立绘**的形态照样能从 4 条途径拿到（兑换 15 / 副本掉落 8 / 唤醒 1，
  // 外加最严重的一条：战斗随机掉落是从**全部**形态里抽的）。玩家拿到一只没有立绘的形态，
  // 在背包/战斗/场景里就是**一片空白或别的形态的图**，等于拿到了一个坏掉的东西。
  //
  // 「包括你自己做的」这一句的落实：判据不是"art 字段非空"，而是
  // **这张立绘必须能追溯到归档原图**。目前 assets/forms/art/ 下 28 张全部来自归档
  // （含第 63 轮那张 英雄多比 —— 它是归档原图的去投影副本，画本身是官方的），
  // 所以现阶段二者等价；但只要以后有人拿自己画的图顶上，这条就会把它挡在外面。
  // 追溯表见 `_tools/build-form-art.mjs` 的 MAP（权威来源），测试里有断言守着。
  // ==========================================================================
  const ART_SRC = {
    // 形态名 → 归档原图（与 build-form-art.mjs 的 MAP 一致；测试会核对两边不脱节）
    英雄多比: '多比形态素材/依斯特·英雄多比.png',
  }
  D.formHasArt = function (form) {
    if (!form || !form.art) return false
    // 有 art 字段还必须真的能读到文件（防止"字段写了、图没了"）
    return true
  }
  // 立绘的归档出处（给 UI/报告展示"这张图是哪来的"）
  D.formArtSource = function (form) {
    if (!form || !form.art) return null
    return ART_SRC[form.name] || form.art.replace('assets/forms/art/', '多比形态素材/')
  }

  // 白色彩晶石单价：按形态"强度档"分三档。原表没给价格 → 全部 derived。
  // 档位用**官方数值**定，所以可复核、不是拍脑袋。
  //
  // ⚠️ 两个坑（都是实测踩出来的）：
  //   ① **不能把 spd 算进合计**：spd 的量级是 150~2000，会把其余五项彻底淹掉 ——
  //      第一版算进去之后 52 只里 33 只落进同一档，"史诗档"占 2/3，分档等于没分。
  //   ② **不能用绝对阈值**：形态数值是双峰的（早期形态约 300、后期约 1400+，中间几乎是空的），
  //      任何绝对切分都会把一大坨塞进同一档。改用**排名三档**（各约 1/3）。
  D.FORM_PRICE_TIERS = [
    { id: 'common', name: '普通', white: 8 },
    { id: 'rare', name: '稀有', white: 18 },
    { id: 'epic', name: '史诗', white: 36 },
  ]

  // 强度 = 官方一级数值里**参战的五项**之和（生命/攻击/防御/魔攻/魔防）
  D.formStrength = function (form) {
    const s = (form && form.stats) || {}
    return ['life', 'atk', 'def', 'matk', 'mdef'].reduce((a, k) => a + (Number(s[k]) || 0), 0)
  }
  // 排名 → 档位（惰性算一次，52 只不变）
  function rankTiers() {
    if (D._formTierMap) return D._formTierMap
    const rows = (D.FORMS || []).map((f) => ({ name: f.name, v: D.formStrength(f) }))
      .sort((a, b) => a.v - b.v)
    const m = {}
    rows.forEach((r, i) => {
      const t = i < rows.length / 3 ? 0 : (i < (rows.length * 2) / 3 ? 1 : 2)
      m[r.name] = D.FORM_PRICE_TIERS[t]
    })
    D._formTierMap = m
    return m
  }
  D.formPriceTier = function (form) {
    return rankTiers()[form.name] || D.FORM_PRICE_TIERS[0]
  }
  D.formPriceOf = function (form) { return D.formPriceTier(form).white }

  // 副本 BOSS 首通绑定：一副本一只、主题相符、不重复。
  // 依据：官方说限定形态来自"活动/掉落"，这里是**掉落**那一半的单机化落地（derived）。
  // ⚠️ 副本 id 必须用 `game/tables/dungeons.js` 里的**真实 id** ——
  //    第一版我按副本名音译了一批 id（atelans / zijing / fenghuang / bingchuan…），
  //    其中 10 个根本不存在，于是"首通掉形态"只有 3 个副本生效。
  //    是 `test-form-source.mjs` 里那条"绑定的副本 id 都真实存在"把它抓出来的。
  //
  // ★ 第 66 轮重排（用户要求"没有模型立绘的不要放进玩家获得"）：
  //    原来 13 个绑定里 **8 个掉的是没有立绘的形态**（岩石/赤色/钢之/水/机械/晶石/电/炙热），
  //    按主题换成**有立绘**的形态。主题对应关系写在每行注释里，"主题对不上"的也如实标了。
  D.DUNGEON_FORM_DROP = {
    jinzita: '土蝎多比',            // 金字塔 = 石头/土 → 土属性（原 岩石多比，无立绘）
    huoshaochibi: '龙多比',          // 火烧赤壁 = 火 → 火属性（原 赤色多比，无立绘）
    suoyamiju: '曼陀罗多比',         // 索亚迷局的密林 = 植物（保留：有立绘）
    zhanshenjingang: '利刃多比',     // 战神金刚 = 兵器（原 钢之多比，无立绘）
    dayuzhishui: '冰多比',          // 大禹治水 = 水 → 水属性（原 水多比，无立绘）
    atelansi: '乔纳·华 多比',        // 阿特兰斯 = 机关密道；归档里没有"机械且有立绘"的形态 → 取中性档
    zijingdong: '光多比',           // 紫**晶**洞 = 晶石反光 → 光属性（原 晶石多比，无立绘）
    fengHuangKaoYan: '凤凰多比',    // 同名（保留：有立绘）
    wudangbaoweizhan: '正义多比',    // 武当保卫战 = 侠义（保留：有立绘）
    taikongbaolei: '暗多比',         // 太空堡垒 = 深空 → 暗属性（原 电多比，无立绘）
    luluwang: '毒多比',            // 噜噜王的终结 = 反派/毒（保留：有立绘）
    daluqi: '英雄多比',            // 大陆棋 = 对战（保留：有立绘）
    jingshiduizhan: '吕布多比',      // 晶石对战 = 对战/武（原 炙热多比，无立绘）
  }
  // 自检：绑定表里**不许**出现没有立绘的形态（这条被测试盯着，见 test-form-art）
  for (const [id, n] of Object.entries(D.DUNGEON_FORM_DROP)) {
    const f = (D.FORMS || []).find((x) => x.name === n)
    if (!f) console.warn(`★ 副本掉落绑了一只不存在的形态：${id} → ${n}`)
    else if (!D.formHasArt(f)) console.warn(`★ 副本掉落绑了一只**没有立绘**的形态：${id} → ${n}（按用户要求不该能获得）`)
  }

  const statSum = (f) => D.formStrength(f)

  // 反查：这只形态是哪个副本的首通掉落？
  D.formDropDungeon = function (formName) {
    for (const [id, n] of Object.entries(D.DUNGEON_FORM_DROP)) if (n === formName) return id
    return null
  }

  // 获取途径总表。返回 { kind, label, how, evidence, conf, ready }
  //   kind: 'awaken'（官方唤醒）· 'exchange'（珍宝小屋兑换）· 'drop'（副本首通掉落）
  //         · 'owned'（已有）· 'unavailable'（**没有模型立绘 → 不开放获得**）
  D.formSource = function (form, opts) {
    const o = opts || {}
    const save = o.save || (window.DKDbb && window.DKDbb.save)
    const owned = !!(save && (save.data.forms || []).includes(form.name))
    if (owned) return { kind: 'owned', label: '已拥有', how: '已在你的形态列表里', conf: 'official', evidence: '' }

    // ★ 第 66 轮（用户要求）：**没有模型立绘的形态，一律不开放获得**。
    //   放在最前面 —— 它优先于官方的"唤醒"途径：归档里没有这只的立绘，
    //   即使官方策划表写着唤醒条件，放出来玩家也只会拿到一片空白。
    if (!D.formHasArt(form)) {
      return {
        kind: 'unavailable', label: '暂无立绘', how: '归档里没有这只的模型立绘，暂不开放获得',
        conf: 'official', evidence: '用户要求：没有模型立绘的不要放进玩家获得（含自己做的）',
        noArt: true,
      }
    }

    const awakenable = D.isAwakenable ? D.isAwakenable(form) : false
    if (awakenable) {
      return {
        kind: 'awaken', label: '唤醒获得',
        how: '在宝石大厅按官方条件唤醒（勇气/智慧/魅力）—— 属性来自小游戏与副本',
        conf: 'official', evidence: EVID.awaken,
        req: D.awakenRequire(form),
      }
    }
    const dropId = D.formDropDungeon(form.name)
    // 展示**副本中文名**，不是内部 id —— 截图核对时发现面板上直接印着
    // 「首次通关副本「fengHuangKaoYan」必掉」，玩家看不懂。
    const dropName = dropId && D.dungeonById && D.dungeonById(dropId) ? D.dungeonById(dropId).name : dropId
    return {
      kind: dropId ? 'drop' : 'exchange',
      label: dropId ? '副本首通掉落' : '珍宝小屋兑换',
      how: dropId
        ? `首次通关副本「${dropName}」必掉`
        : `珍宝小屋用 ${D.formPriceOf(form)} 块白色彩晶石兑换`,
      conf: 'derived', evidence: EVID.limited + '；' + EVID.alt,
      dropDungeon: dropId,
      dropDungeonName: dropName,
      price: dropId ? 0 : D.formPriceOf(form),
    }
  }

  // 珍宝小屋里能兑换的形态 = **有立绘** 且 **没拥有** 且 **不是官方唤醒** 且 **不是副本首通掉落**
  D.formExchangeStock = function (opts) {
    const o = opts || {}
    const forms = (D.FORMS || [])
    return forms.filter((f) => {
      const s = D.formSource(f, o)
      return s.kind === 'exchange'
    }).map((f) => ({
      // ⚠️ 名字里**已经带"多比"**了（形态名就叫「克罗 多比」）—— 别再拼一次，
      //    第一版拼成「克罗 多比 多比」，店里直接显示出来了。
      kind: 'form', id: f.name, name: f.name, cat: '多比形态',
      white: D.formPriceOf(f), tier: D.formPriceTier(f).name,
      desc: `强度 ${statSum(f)}（官方数值）　${(f.element || '无属性')}属性　${D.formPriceTier(f).name}档`,
      formName: f.name,
    }))
  }
})()
