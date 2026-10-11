/* 多克多比 · 游戏数据层
   数值来源：原版策划表（docs/游戏数据/）
     · 多比十维属性   <- 多比属性介绍.txt / 近期多比属性表.xlsx
     · 技能 CD/耗能/范围 <- 多比技能列表.xlsx
     · 怪物与动作状态  <- 怪兽.xlsx
     · 刷怪分布       <- 光暗场景.txt
   没找到的（升级曲线、伤害公式、掉落）按常见页游套路补，标注为 derived。 */
(() => {
  'use strict'

  const D = window.DKDbbData = {}

  // ================= 属性体系 =================
  D.ELEMENTS = ['火', '水', '风', '土', '光', '暗', '毒', '无']
  D.ELEMENT_COLOR = {
    火: '#ff6b35', 水: '#3fb6ff', 风: '#5ee6a8', 土: '#d8a34a',
    光: '#ffe45e', 暗: '#a86bff', 毒: '#9ee04a', 无: '#cfd6e4',
  }
  // 相克倍率（derived：原版只给了八系并列，克制表按同人整理补全）
  D.ELEMENT_CHART = (() => {
    // 原始克制表（同人整理）：不利 0.5x / 有利 1.5~2.0x，极差 4.0x。
    // 但怪物的元素是按岛固定的（珊瑚秘境岛 4 只全是水），玩家没法换岛规避克制，
    // 于是火系形态去珊瑚岛必然吃满 0.5x —— 实测胜率只有 30%，等于"这个形态不能去那座岛"。
    // 对儿童页游来说这个惩罚太重，统一软化：不利 0.75x、普通有利 1.5x、强克制 1.7x。
    // 极差从 4.0x 收到 2.3x，克制仍然明显（值得为了打某座岛换形态），但不会一票否决。
    const RAW = {
      火: { 风: 1.5, 水: 0.5, 火: 0.5 },
      水: { 火: 2.0, 土: 0.5, 水: 0.5 },
      风: { 土: 1.5, 火: 0.5, 风: 0.5 },
      土: { 水: 2.0, 风: 0.5, 土: 0.5 },
      光: { 暗: 2.0, 光: 0.5 },
      暗: { 光: 2.0, 暗: 0.5 },
      毒: { 水: 1.5, 土: 1.5, 毒: 0.5 },
      无: {},
    }
    const SOFTEN = { 0.5: 0.75, 1.5: 1.5, 2.0: 1.7 }
    const out = {}
    for (const [atk, row] of Object.entries(RAW)) {
      out[atk] = {}
      for (const [def, v] of Object.entries(row)) out[atk][def] = SOFTEN[v] || v
      // 补齐其余元素为 1.0（原来靠 D.multiplier 的兜底默认值）
      for (const el of ['火', '水', '风', '土', '光', '暗', '毒', '无']) {
        if (out[atk][el] === undefined) out[atk][el] = 1.0
      }
    }
    return out
  })()

  D.multiplier = (atk, def) => (D.ELEMENT_CHART[atk] && D.ELEMENT_CHART[atk][def]) || 1

  // 兜底形态：只有当 assets/forms.js 缺失时才用到，保证游戏不白屏
  // （必须先声明：D.FORMS 的初始化表达式会引用它）
  const FALLBACK_FORMS = [
    {
      id: 'long', name: '龙多比', element: '火', spriteDir: '龙多比形态序列',
      desc: '火山中沉睡的巨龙血脉，攻击与速度俱佳，擅长爆发。',
      stats: { life: 240, mp: 72, atk: 34, def: 14, matk: 32, mdef: 4, hit: 46, eva: 38, crit: 5, acrit: 1, spd: 148 },
      skills: ['重击', '火球', '火雨', '嗜血', '雷霆冲击'],
      skillSlots: 5, ownSprite: true, tint: null,
    },
    {
      id: 'light', name: '光多比', element: '光', spriteDir: '光多比形态序列',
      desc: '被彩晶石之光选中，命中最稳、恢复见长。',
      stats: { life: 257, mp: 68, atk: 32, def: 15, matk: 31, mdef: 4, hit: 43, eva: 36, crit: 4, acrit: 1, spd: 130 },
      skills: ['恢复', '清洁', '重击', '破甲', '群体恢复'],
      skillSlots: 5, ownSprite: true, tint: null,
    },
  ]

  // ================= 玩家可用形态 =================
  // 全部来自原版策划表（assets/forms.js，由 _tools/gen-forms.mjs 生成）：
  //   名称/描述/元素/七维/专属技能/技能槽 取自「多比名称和描述」「近期多比属性表」
  //   十维战斗数值：有原表的用原表，没有的由七维换算（标 derived）
  //   精灵目录：有专属导出帧的用专属，否则按元素借用同系多比的帧并加色调区分
  //
  // 必须**惰性解析**：game.html 里 data.js 排在 assets/forms.js 之前，
  // 立即读取会拿到 undefined（怪物立绘也踩过同一个坑）。
  let _formsCache = null
  D.forms = function () {
    if (_formsCache) return _formsCache
    const src = (typeof globalThis !== 'undefined' && globalThis.__DKDbb_FORMS__) ||
      (typeof window !== 'undefined' && window.__DKDbb_FORMS__)
    if (src && src.forms && src.forms.length) {
      _formsCache = src.forms.map((f, i) => {
        const st = f.stats || {}
        return {
          id: 'f' + i,
          name: f.name,
          element: f.element || '无',
          desc: f.desc || '',
          spriteDir: f.spriteDir,
          // 官方立绘：形象以它为准。spriteDir 只在立绘加载失败时兜底。
          // （早先没有立绘，全靠 spriteDir 借同系多比的帧，所以瑞比特·兔画成了龙多比。）
          art: f.art || null,
          artIcon: f.artIcon || null,
          artPrimary: !!f.artPrimary,
          artEvidence: f.artEvidence || '',
          // 归档里查不到官方立绘的形态：art 为空且 artMissing=true。
          // **这个字段必须传下来** —— 第 30 轮漏传过一次，后果是"主角默认形态龙多比"
          // 被判成有立绘、spriteDir 却是 null，于是主角连待机动作都解析不出来、
          // 战斗里招式动画全没了（playtest 报"未观察到招式动画"）。
          artMissing: !!f.artMissing,
          tint: f.tint || null,
          ownSprite: !!f.ownSprite,
          stats: {
            life: st['生命'] || 200, mp: st['魔力'] || 60,
            atk: st['攻击'] || 28, def: st['防御'] || 12,
            matk: st['魔攻'] || 28, mdef: st['魔防'] || 4,
            hit: st['命中'] || 42, eva: st['回避'] || 34,
            crit: st['爆击'] || 4, acrit: st['免爆'] || 1,
            spd: st['速度'] || 130,
          },
          skills: f.skills || ['重击'],
          skill: f.skill || null,
          skillSlots: f.skillSlots || 5,
          gems: f.gems || 0,
          require: f.require || {},
          statSource: f.statSource || '',
          actionIdle: null, actionBattle: null, actionWin: null, actionSkills: [],
        }
      })
      return _formsCache
    }
    _formsCache = FALLBACK_FORMS
    return _formsCache
  }
  // 兼容旧写法（读到的是同一份缓存）
  Object.defineProperty(D, 'FORMS', { get: () => D.forms() })

  // 官方 NPC（归档官方策划表 `npc大全\NPC.xlsx`，70 个，逐字对话）。
  // 只把"位置与某场景精确同名"的那些放进游戏；其余在 unmapped 名单里（见 _tools/gen-npcs.mjs）。
  let _npcCache = null
  D.npcs = function () {
    if (_npcCache) return _npcCache
    const src = (typeof globalThis !== 'undefined' && globalThis.__DKDbb_NPCS__) ||
      (typeof window !== 'undefined' && window.__DKDbb_NPCS__)
    _npcCache = (src && src.entries) || []
    return _npcCache
  }
  // 某个场景里该出现的官方 NPC。放置时已经把目标落成了具体场景 id 列表，
  // 这里只做一次查表（避免在场景生成里重算世界结构 —— 那里必须够快且只读）。
  const _npcByScene = new Map()
  D.officialNpcsFor = function (sceneId) {
    if (!_npcByScene.size) {
      for (const n of D.npcs()) {
        for (const sid of (n.target && n.target.sceneIds) || []) {
          if (!_npcByScene.has(sid)) _npcByScene.set(sid, [])
          _npcByScene.get(sid).push(n)
        }
      }
    }
    return _npcByScene.get(sceneId) || []
  }
  D.npcsUnmapped = function () {
    const src = (typeof globalThis !== 'undefined' && globalThis.__DKDbb_NPCS__) ||
      (typeof window !== 'undefined' && window.__DKDbb_NPCS__)
    return (src && src.unmapped) || []
  }

  // 「仅形象」条目：归档里有官方立绘、但**不在官方形态表里**（没有数值依据）。
  // 它们只用于图鉴展示 —— **不进 D.FORMS**，所以不会被掉落抽到、不能变身、不参与战斗。
  // 这样原版美术能被看到，同时不会凭空造出一只没有数值的"可玩形态"（R1/R9）。
  D.FORM_ART_ONLY = () => {
    try {
      const src = (typeof window !== 'undefined' ? window : globalThis).__DKDbb_FORMS__
      return (src && Array.isArray(src.artOnly)) ? src.artOnly : []
    } catch { return [] }
  }

  // 技能图标文件路径。编号（skill_icon_1001 这类）来自官方图鉴。
  //
  // 【第 55 轮：改成两处都查】原来**只查 `assets/forms.js` 的 skills 表**，而那张表只覆盖
  //   17 个技能（原版策划表那批）；第 55 轮从 7k7k 角色大全补了 39 个图标，写进了
  //   `game/tables/skills-official.js` 的 `D.SKILLS`。两条链没打通 → 那 39 个技能在技能面板里
  //   显示成空占位（截图核对时发现 `龙卷火焰 / 回暖 / 狂暴` 是橙方块）。
  //   现在：**先查 D.SKILLS（权威、136 条），再退回 forms.js（原版策划表）**。
  //   ⚠️ `D.SKILLS` 必须**在函数体内**取：skills-official.js 排在 data.js 之后，
  //      提前缓存会拿到 undefined（这个坑在怪物的 rawMonsterRows 上踩过）。
  D.skillIconFile = function (name) {
    const off = D.SKILLS && D.SKILLS[name]
    if (off && off.icon) return 'assets/skills/' + off.icon + '.png'
    const src = (typeof globalThis !== 'undefined' && globalThis.__DKDbb_FORMS__) ||
      (typeof window !== 'undefined' && window.__DKDbb_FORMS__)
    const sk = src && src.skills && src.skills[name]
    if (!sk || !sk.icon) return null
    return 'assets/skills/' + sk.icon + '.png'
  }

  // ================= 索亚（陪伴宠物）=================
  // 编号与官方名来自图鉴4.3的索亚区，设定文案来自 docs/游戏数据/索亚介绍.xlsx，
  // 立绘来自 多克多比专区资料素材/索亚/。同样惰性解析（soya.js 排在 data.js 之后）。
  let _soyaCache = null
  D.soya = function () {
    if (_soyaCache) return _soyaCache
    const src = (typeof globalThis !== 'undefined' && globalThis.__DKDbb_SOYA__) ||
      (typeof window !== 'undefined' && window.__DKDbb_SOYA__)
    _soyaCache = (src && src.soya) || []
    return _soyaCache
  }
  Object.defineProperty(D, 'SOYA', { get: () => D.soya() })
  D.soyaById = (id) => D.soya().find((s) => s.id === Number(id)) || null

  // ================= 骑士与魔王（图鉴用）=================
  // 来历：官方资料包 `多比形态素材\多克骑士乌卡将军.rar` 里的 14 张 JPG，
  // 文件名就是角色名。由 _tools/build-knight-art.mjs 入库（assets/knights.js）。
  // **本包不含它们的战斗数值与技能**，所以只作图鉴展示，不编造战斗数据。
  let _knightCache = null
  D.knights = function () {
    if (_knightCache) return _knightCache
    const src = (typeof globalThis !== 'undefined' && globalThis.__DKDbb_KNIGHTS__) ||
      (typeof window !== 'undefined' && window.__DKDbb_KNIGHTS__)
    _knightCache = (src && src.entries) || []
    return _knightCache
  }
  Object.defineProperty(D, 'KNIGHTS', { get: () => D.knights() })
  D.knightsMissing = function () {
    const src = (typeof globalThis !== 'undefined' && globalThis.__DKDbb_KNIGHTS__) ||
      (typeof window !== 'undefined' && window.__DKDbb_KNIGHTS__)
    return (src && src.missing) || []
  }


  // ================= 道具 =================
  // 来自官方策划表「战斗内道具列表及icon」（assets/items.js，由 _tools/gen-items.mjs 生成）。
  // 同样惰性解析：game.html 里 items.js 排在 data.js 之后。
  let _itemsCache = null
  D.items = function () {
    if (_itemsCache) return _itemsCache
    const src = (typeof globalThis !== 'undefined' && globalThis.__DKDbb_ITEMS__) ||
      (typeof window !== 'undefined' && window.__DKDbb_ITEMS__)
    _itemsCache = (src && src.items) || []
    return _itemsCache
  }
  Object.defineProperty(D, 'ITEMS', { get: () => D.items() })
  D.item = function (id) { return D.items().find((i) => i.id === Number(id)) || null }

  // 道具分类：战斗里给玩家看的三个页签
  D.ITEM_TABS = [
    { key: 'heal', label: '恢复', match: (it) => !it.buff && !it.damageMul && (it.hp || it.mp) },
    { key: 'buff', label: '强化', match: (it) => !!it.buff },
    { key: 'throw', label: '投掷', match: (it) => !!it.damageMul },
  ]
  // 判断一件道具在战斗里会作用到谁：恢复/强化是自己，投掷是敌人
  D.itemTargetsSelf = (it) => !it.damageMul
  // 道具的强化效果 -> 战斗单位的 buff 结构（applyBuff 取对象的第一个键当属性名，
  // 所以这里必须把属性名放在第一个键）
  D.itemBuff = function (it) {
    if (!it || !it.buff) return null
    const out = { turns: it.buff.turns || 3 }
    out[it.buff.stat] = it.buff.pct
    return out
  }

  // 背包读写（存档里 save.data.items 是 { 道具id: 数量 }）
  D.bag = {
    count(bag, id) { return (bag && bag[id]) || 0 },
    add(bag, id, n = 1) { bag[id] = (bag[id] || 0) + n; return bag[id] },
    take(bag, id, n = 1) {
      const have = bag[id] || 0
      if (have < n) return false
      if (have === n) delete bag[id]
      else bag[id] = have - n
      return true
    },
    // 按分类列出拥有的道具（保持策划表顺序）
    owned(bag, tabKey) {
      const tab = D.ITEM_TABS.find((t) => t.key === tabKey)
      return D.items().filter((it) => (bag[it.id] || 0) > 0 && (!tab || tab.match(it)))
    },
    total(bag) { return Object.values(bag || {}).reduce((a, b) => a + b, 0) },
  }

  // 给每个形态解析出它可用的动作名（依赖 anim 索引里实际存在的目录）
  //
  // 选法有讲究：早期版本用「普通姿态|防御|动作一」这种宽松正则，
  // 结果蝎多比的待机被选成了「蝎多比发招一」——站着不动却在放招。
  // 现在按优先级明确排序，并且宁可借用同目录里语义最接近的动作。
  D.resolveFormActions = function (form, animIndex) {
    if (!animIndex || !animIndex.actions) return
    const list = Object.values(animIndex.actions).filter((a) => a.dir.startsWith(form.spriteDir))
    if (!list.length) return
    const pick = (res, exclude) => {
      for (const re of res) {
        const hit = list.find((a) => re.test(a.action) && !(exclude && exclude.test(a.action)))
        if (hit) return hit.action
      }
      return null
    }
    // 不能拿来做待机的动作（发招/胜利是明显的动作戏，站着不动不该在放招）
    const NOT_IDLE = /发招|胜利|攻击/
    // 待机：优先「普通姿态」，其次「防御」「正面一」「动作一」；实在没有再退回任意非发招动作
    const idle = pick([/普通姿态/, /正面一/, /防御/, /动作一/, /姿态/], NOT_IDLE)
      || pick([/动作/], NOT_IDLE)
      || (list.find((a) => !NOT_IDLE.test(a.action)) || list[0]).action
    // 战斗姿态：优先「战斗姿态」，否则用待机
    const battle = pick([/战斗姿态/, /普通姿态/, /正面一/, /动作一/, /防御/]) || idle
    // 胜利：优先「胜利」
    const win = pick([/胜利/, /动作六/, /正面二/]) || battle
    // 招式：发招 / 动作二~五 / 翻滚 / 正面二
    const atk = list
      .filter((a) => /发招|动作[二三四五]|翻滚|正面二/.test(a.action))
      .map((a) => a.action)
    form.actionIdle = idle
    form.actionBattle = battle
    form.actionWin = win
    form.actionSkills = atk.length ? atk : [battle]
  }

  // ================= NPC 立绘 =================
  // 原版场景里的居民是真人型角色，素材在「时装序列」下（43 组，每组有正面一/正面二/背面一/背面二，
  // 各 17 帧待机）。早先游戏里 NPC 是**画出来的白色圆圈**，跟场景完全不搭；
  // 这里从动画索引里把时装序列抽出来，按场景 ID 稳定分配，让每个 NPC 都是真实角色。
  D.npcCostumes = function (animIndex) {
    if (!animIndex || !animIndex.actions) return []
    const out = []
    const seen = new Set()
    for (const a of Object.values(animIndex.actions)) {
      if (!a.dir.startsWith('时装序列/')) continue
      const name = a.dir.split('/')[1]             // 化妆女 / 喵喵男 …
      if (!name || seen.has(name)) continue
      if (!/正面一/.test(a.action)) continue        // 只取"正面一"作为待机
      seen.add(name)
      out.push({ name, dir: a.dir, action: a.action, frames: a.frames })
    }
    return out
  }

  // 给 NPC 按名字 + 场景 ID 稳定挑一个造型（同一个 NPC 每次进场景长得一样）
  D.pickCostume = function (list, seedStr, salt) {
    if (!list || !list.length) return null
    let h = 0
    const s = String(seedStr) + '|' + String(salt === undefined ? '' : salt)
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
    return list[h % list.length]
  }

  // 兜底形态已在上面声明

  // ================= 技能（原版策划表：CD / 结印 / 耗能 / 范围）=================
  // range: 0 单体 / 1 范围 / 2 群体
  // power 是 derived（原表未给伤害倍率），按 CD 与耗能定强弱
  D.SKILLS = {
    重击: { cd: 1, seal: 0, energy: 0, range: 0, power: 1.0, element: null, desc: '无与伦比的力量灌注于双臂，使目标承受毁灭性打击。' },
    多重重击: { cd: 3, seal: 0, energy: 0, range: 0, power: 1.8, element: null, desc: '连续冲击目标。' },
    破甲: { cd: 1, seal: 0, energy: 0, range: 0, power: 0.8, element: null, debuff: { def: -0.3, turns: 3 }, desc: '刺穿敌人护甲，降低防御。' },
    雷霆冲击: { cd: 2, seal: 0, energy: 0, range: 1, power: 1.2, element: '土', desc: '锤击地面，冲击波伤及周围敌人。' },
    火球: { cd: 1, seal: 0, energy: 0, range: 0, power: 1.2, element: '火', desc: '凝聚火元素的炙热火球。' },
    火雨: { cd: 2, seal: 0, energy: 0, range: 1, power: 1.0, element: '火', desc: '召唤游离元素化作火雨。' },
    嗜血: { cd: 1, seal: 0, energy: 0, range: 0, power: 1.1, element: null, lifesteal: 0.3, desc: '进入狂暴状态，攻击并吸取生命。' },
    多重火球: { cd: 4, seal: 1, energy: 1, range: 0, power: 2.2, element: '火', desc: '巨量火元素环绕身体，化为火球轰击。' },
    冰枪: { cd: 1, seal: 0, energy: 0, range: 0, power: 1.3, element: '水', desc: '凝结水元素为冰霜长矛。' },
    恢复: { cd: 1, seal: 0, energy: 0, range: 0, power: 0, heal: 0.35, element: '水', desc: '召唤水之精华抚平伤口。' },
    群体恢复: { cd: 3, seal: 1, energy: 1, range: 2, power: 0, heal: 0.25, element: '水', desc: '生命之泉让所有人恢复。' },
    清洁: { cd: 1, seal: 0, energy: 0, range: 0, power: 0, cleanse: true, element: '光', desc: '移除目标身上一个负面状态。' },
    地之咆哮: { cd: 1, seal: 0, energy: 0, range: 1, power: 1.1, element: '土', desc: '大地震动，怒吼伤敌。' },
    坚韧: { cd: 1, seal: 0, energy: 0, range: 0, power: 0, buff: { def: 0.5, turns: 3 }, element: '土', desc: '土元素融入皮肤，暂时提升防御。' },
    大地之怒: { cd: 3, seal: 1, energy: 2, range: 1, power: 1.9, element: '土', desc: '大地能量在目标脚下爆发。' },
    闪电: { cd: 1, seal: 0, energy: 0, range: 0, power: 1.3, element: '风', desc: '汇集游离电元素化为闪电。' },
    旋风: { cd: 3, seal: 0, energy: 0, range: 1, power: 1.4, element: '风', desc: '化风为刃，攻击敌人。' },
  }

  // ================= 怪物 =================
  // 数据源：assets/gamedata.js（由 _tools/gen-gamedata.mjs 从原版「怪兽.xlsx」抽出）
  //   ID/美术资源名/名称/描述/类型/向性/尺寸 + 17 个动作状态名（无战斗数值，按尺寸推算）
  //
  // 必须**惰性构建**：game.html 里 data.js 排在 assets/gamedata.js 之前，
  // 立即读取会拿到 undefined（这个坑在立绘、形态上都踩过）。
  // 同时按 ID 缓存，保证同一只怪在多处引用时是同一个对象。
  const MON_CACHE = new Map()

  function rawMonsterRows() {
    const g = (typeof globalThis !== 'undefined' && globalThis.__DKDbb_DATA__) ||
      (typeof window !== 'undefined' && window.__DKDbb_DATA__)
    if (g && g.monsters && g.monsters.length) {
      return g.monsters.map((m) => [
        Number(m.id), m.name, m.element || '无', m.type || '怪物',
        Number(m.size) || 90, (m.desc || '').replace(/\s+/g, ' ').trim(),
      ])
    }
    // 兜底：策划表缺失时用一小份内置数据，保证游戏能跑
    return [
      [10001, '哈拉兽', '土', '怪物', 120, '呆头呆脑，移动缓慢的怪兽。'],
      [10002, '绿毒史莱姆', '毒', '怪物', 45, '白天居住在地下，晚上汲取有毒粘液用于进化。'],
      [10004, '萨西怪', '火', '怪物', 69, '火属性的小怪物，全身会冒泡泡。'],
      [10005, '粘壳虫', '水', '怪物', 50, '像蜗牛却有牛一般的大小，外壳坚硬。'],
      [10016, '火球怪', '火', '怪物', 100, '被乌卡邪恶之气侵蚀的火精灵。'],
      [10017, '熔岩怪', '火', '怪物', 135, '拥有大地盔甲，浑身熔岩不停喷涌。'],
    ]
  }

  function buildMonster([id, name, element, type, size, desc]) {
    const s = Number(size) || 90
    return {
      id, name, element, type, size: s, desc,
      // 「基准等级」只体现这只怪相对其他怪的强弱，实际遭遇等级由岛屿难度决定
      baseLevel: Math.max(1, Math.round(s / 5)),
      res: 'monster_' + id,
      get sprite() {
        const M = (typeof globalThis !== 'undefined' && globalThis.__DKDbb_MONSTER_SPRITES__) ||
          (typeof window !== 'undefined' && window.__DKDbb_MONSTER_SPRITES__)
        return (M && M.map && M.map[id]) || null
      },
      stats: {
        life: Math.round(40 + s * 1.6),
        mp: 40,
        atk: Math.round(10 + s * 0.22),
        def: Math.round(4 + s * 0.11),
        matk: Math.round(10 + s * 0.2),
        mdef: Math.round(2 + s * 0.05),
        hit: 40, eva: Math.round(30 + s * 0.05),
        crit: 3, acrit: 1,
        spd: Math.round(90 + s * 0.4),
      },
    }
  }

  // 取某只怪（按 ID 缓存，保证对象唯一）
  D.monster = function (id) {
    if (MON_CACHE.has(id)) return MON_CACHE.get(id)
    const row = rawMonsterRows().find((r) => r[0] === Number(id))
    if (!row) return null
    const m = buildMonster(row)
    MON_CACHE.set(id, m)
    return m
  }
  // 全部怪物（首次访问时构建，之后返回同一份数组）
  let _monAll = null
  D.monsters = function () {
    if (!_monAll) _monAll = rawMonsterRows().map(buildMonster).filter((m) => { MON_CACHE.set(m.id, m); return true })
    return _monAll
  }
  Object.defineProperty(D, 'MONSTERS', { get: () => D.monsters() })

  // 旧的构建代码已被上面替代（保留此注释说明改动原因）
  const _UNUSED_BUILDER = null

  // ================= 遭遇：等级相对制（重要设计决定）=================
  // 走过两条弯路，记在这里免得再踩：
  //
  // 弯路 1：给每座岛一个**固定**的怪等级区间。不行。
  //   同一只 Lv7 的怪，对 Lv1 玩家是 0% 胜率，对 Lv14 玩家是 100%。
  //   一个固定等级不可能同时服务"刚够等级来的玩家"和"练高了回来的玩家"，
  //   程序搜出来的表自相矛盾（草原和森林都搜出"怪 Lv1"，云端神殿却搜出"怪 Lv9"）。
  //
  // 弯路 2：让怪物成长快过玩家（怪攻 11%/级）。不行。
  //   怪物基础攻（22~53）本来就压过玩家（26~46），再叠高成长，
  //   4 级怪的普攻就是 100 点，玩家 300 血三下没了。实测沙漠 1% 胜率。
  //
  // 现在的做法：**怪等级 = 玩家等级 + 该岛的 offset ± 1**。
  //   每座岛对任何等级的玩家都保持同一条难度曲线，岛屿之间靠 offset 拉开梯度。
  //   于是"练级"永远有意义，也不会出现"这个岛现在绝对不能来"的死墙。
  //   实测（_tools/finalize-balance2.mjs）：各岛在 1~21 级全程稳定在 72~90%，
  //   波动只有 8~27 个百分点，不再有随等级漂移到 0% 或 100% 的情况。
  // 每个岛的怪等级 = 玩家等级 + 这个数（实测校准，见 _tools/probe-offsets.mjs 的表 1）：
  //   +2 → 平均 92% 胜率（太简单）；+3 → 79%（合格）；+4 → 57%（偏危险）。
  //   沙漠遗迹岛取 +4、珊瑚秘境岛取 +2，是为了把这两座岛"池子内部不均衡"造成的偏差拉回同一条带子。
  D.ISLAND_LEVEL_OFFSET = {wilds:3,desert:4,forest:3,angel:3,factory:3,coral:2,islet:3,volcano:3,rock:3}
  // ================= 遭遇等级偏移 =================
  // 怪的等级 = 玩家等级 + offset ± 波动。
  //
  // 伤害公式定稿为：伤害 = K × 攻 × defFactor(防) × 克制，K = 2.1。
  // offset 也必须**逐岛**定，不能用一个统一值 —— 实测同一 offset 下，
  // 九座岛的实际胜率能差到 39%~96%（因为每座岛的怪物池不同，
  // 而玩家基础形态是"无属性"，对谁都 1.0x，拿不到克制优势）。
  // 下面这张表是逐岛扫出来、把各岛胜率对齐到 78% 的结果
  // （扫描过程与数据见 _tools/derive-island-offsets.mjs）。
  D.DMG_K = 2.1
  D.ENCOUNTER_OFFSET = {wilds:5,desert:2,forest:3,angel:3,factory:3,coral:4,islet:3,volcano:3,rock:3}

  // 按玩家等级取 offset（保留函数形式，将来要按等级做梯度时改这里）
  D.offsetForLevel = function (lv) { return D.ENCOUNTER_OFFSET }

  D.ISLAND_SPREAD = 1        // 等级波动 ±1

  // 推荐等级窗口（给界面提示用；相对制下任何等级都能来，只是越高越稳）
  D.ISLAND_WINDOW = {
    wilds: [1, 3], desert: [2, 4], forest: [3, 5], angel: [4, 6], factory: [5, 7],
    coral: [6, 8], islet: [7, 9], volcano: [8, 10], rock: [9, 12],
  }

  // 兼容旧接口：按"岛 + 玩家等级"生成遭遇等级
  D.encounterLevel = function (island, playerLevel, rnd) {
    const off = (D.ENCOUNTER_OFFSET && D.ENCOUNTER_OFFSET[island] !== undefined)
      ? D.ENCOUNTER_OFFSET[island]
      : (D.offsetForLevel ? D.offsetForLevel(playerLevel || 1) : 4)
    const spread = D.ISLAND_SPREAD || 1
    const r = rnd ? rnd() : Math.random()
    const d = off + Math.floor(r * (spread * 2 + 1)) - spread
    return Math.max(1, Math.round((playerLevel || 1) + d))
  }


  // 怪物成长：**血厚攻平**。血 9.5%/级、攻 8%/级。
  // 试过 4%（后期一路涨到 99%，毫无威胁）和 12%/16%/20%（后期一路掉到 44%/12%/4%，变成死墙），
  // 8% 是唯一"全程漂移只有 7 个点"的一条。
  D.MONSTER_GROWTH = { life: 0.095, atk: 0.080, def: 0.070, eva: 0.008, spd: 0.020 }
  D.monsterAtLevel = function (mon, lv) {
    const t = mon.stats
    const g = D.MONSTER_GROWTH
    const k = (key) => Math.pow(1 + (g[key] || 0), lv - 1)
    return {
      life: Math.round(t.life * k('life')),
      mp: t.mp,
      atk: Math.round(t.atk * k('atk')),
      def: Math.round(t.def * k('def')),
      matk: Math.round(t.matk * k('atk')),
      mdef: Math.round(t.mdef * k('def')),
      hit: t.hit, eva: Math.round(t.eva * k('eva')),
      crit: t.crit, acrit: t.acrit,
      spd: Math.round(t.spd * k('spd')),
    }
  }

  // 在指定岛上生成一只怪：等级从该岛区间取，数值按等级缩放
  // 按 D.ISLAND_WEIGHTS 的权重挑一只怪（没配权重的岛就是等概率）
  function weightedPick(island, ids, rnd) {
    const w = (D.ISLAND_WEIGHTS && D.ISLAND_WEIGHTS[island]) || null
    if (!w) return ids[Math.floor((rnd ? rnd() : Math.random()) * ids.length)]
    const ws = ids.map((id) => w[id] || 1)
    const total = ws.reduce((a, b) => a + b, 0)
    let r = (rnd ? rnd() : Math.random()) * total
    for (let i = 0; i < ids.length; i++) { r -= ws[i]; if (r <= 0) return ids[i] }
    return ids[ids.length - 1]
  }

  // 按 D.ISLAND_WEIGHTS 的权重挑一只怪（没配权重的岛就是等概率）
  function weightedPick(island, ids, rnd) {
    const w = (D.ISLAND_WEIGHTS && D.ISLAND_WEIGHTS[island]) || null
    if (!w) return ids[Math.floor((rnd ? rnd() : Math.random()) * ids.length)]
    const ws = ids.map((id) => w[id] || 1)
    const total = ws.reduce((a, b) => a + b, 0)
    let r = (rnd ? rnd() : Math.random()) * total
    for (let i = 0; i < ids.length; i++) { r -= ws[i]; if (r <= 0) return ids[i] }
    return ids[ids.length - 1]
  }

  // 按 D.ISLAND_WEIGHTS 的权重挑一只怪（没配权重的岛就是等概率）
  function weightedPick(island, ids, rnd) {
    const w = (D.ISLAND_WEIGHTS && D.ISLAND_WEIGHTS[island]) || null
    if (!w) return ids[Math.floor((rnd ? rnd() : Math.random()) * ids.length)]
    const ws = ids.map((id) => w[id] || 1)
    const total = ws.reduce((a, b) => a + b, 0)
    let r = (rnd ? rnd() : Math.random()) * total
    for (let i = 0; i < ids.length; i++) { r -= ws[i]; if (r <= 0) return ids[i] }
    return ids[ids.length - 1]
  }

  D.spawnFor = function (island, rnd, playerLevel) {
    const ids = D.ISLAND_MONSTERS[island] || []
    if (!ids.length) return null
    const mon = D.monster(weightedPick(island, ids, rnd))
    if (!mon) return null
    const lv = D.encounterLevel(island, playerLevel, rnd)
    return { mon, level: lv, stats: D.monsterAtLevel(mon, lv) }
  }

  // ================= 场景（从 manifest 自动建，再补给特殊场景配怪）=================
  D.buildScenes = function (manifest, world) {
    const scenes = {}
    for (const s of manifest.scenes) {
      scenes[s.id] = {
        id: s.id, file: s.file, w: s.w, h: s.h,
        name: s.title, desc: s.desc,
        kind: s.kind,
        island: null, npcs: [], monsters: [],
      }
    }
    // 岛屿归属：反过来建立 场景 -> 岛
    for (const isl of world.islands) {
      for (const id of isl.scenes) {
        if (scenes[id]) {
          scenes[id].island = isl.id
          scenes[id].islandName = isl.name
          scenes[id].bgm = isl.bgm
        }
      }
    }
    return scenes
  }

  // 每个岛上放什么怪：按岛的主题与该怪的元素对应（derived）
  // 原版刷怪表（光暗场景.txt）只覆盖光暗峡谷/时光码头/暗黑虚空三图，
  // 且那三个地名与浮空群岛对不上，所以这里按元素主题分配。
  // 王城与集市是安全区（不放怪），其余 9 座岛各自有明确的元素倾向。
  //
  // 重要：**精英怪不放进普通刷怪池**。
  // 数值盘点（_tools/diag-roster.mjs）显示 8 只怪的战力是中位数的 2 倍以上
  // （战力 = 攻×血，例如螳螂阿力 53/355 vs 普通怪 30/184），
  // 混在普通池里就是"走着走着突然遇到 boss"——这是之前"沙漠遗迹岛只有 45% 胜率"的真正原因，
  // 不是 offset 的问题。现在它们只在野外以低概率作为精英出现（见 D.spawnFor）。
  D.ISLAND_MONSTERS = {
    // 每座岛 3~4 只怪，**必须多元素**。
    // 教训：原版怪物元素分布集中（珊瑚 4 只全水、火山 4 只全火、浮空台 3 只全暗），
    // 我按"岛屿主题"配过去之后，任何形态在某座岛的胜率完全取决于"我的元素克不克这座岛"，
    // 实测形态间极差高达 89 点（火系打珊瑚 12%，风系打沙漠 100%），怎么调系数都压不下去。
    // 改成每岛 2~3 种元素后，克制从"决定能不能玩"变成"决定打得顺不顺"。
    castle: [],
    market: [],
    wilds: [10002, 10003, 10021],
    desert: [10001, 10020, 10021],
    forest: [10019, 19008, 19005, 19013],
    angel: [10018, 19007, 10023, 19001],
    factory: [10006, 10007, 19010, 19002],
    coral: [10005, 10013, 19011, 19005],
    islet: [19007, 10018, 19001, 10023],
    volcano: [10004, 10016, 19012, 10001],
    rock: [10011, 19002, 19013, 19006],
  }


  // ================= 变身唤醒（官方系统）=================
  //
  // 官方依据：
  //   · 7k7k/178924《多克多比变身唤醒》：「每个小多克都有另一种形态，即战斗形态。
  //     小多克可以通过**唤醒多比**，战斗时就可以变成该多比咯。唤醒多比：小多克们可以去
  //     **宝石大厅**唤醒多比哦。在宝石大厅那里，还有多比的**唤醒条件**~~」
  //   · 7k7k/167013：「完成这些小游戏…还有增加多克属性的奖励，包括智慧、勇气和魅力~
  //     **这些都是唤醒多比所必不可少的东西**」
  //
  // **唤醒条件的数值是官方的**：原版策划表 `多比名称和描述.xlsx` 的第 13/14/15 列
  // 就是「勇气 / 智慧 / 魅力」，由 `_tools/gen-forms.mjs` 读进 forms[].require。
  // 注意字段名差异：原表写 `courage`，我们的存档属性里同一项叫 `brave`（历史命名），
  // 下面用 REQ_TO_ATTR 显式对应，避免以后有人以为是两个东西。
  const REQ_TO_ATTR = { courage: 'brave', wisdom: 'wisdom', charm: 'charm' }

  // 取某形态的唤醒条件（缺失字段按 0）
  D.awakenRequire = function (form) {
    const r = (form && form.require) || {}
    return {
      courage: Number(r.courage) || 0,
      wisdom: Number(r.wisdom) || 0,
      charm: Number(r.charm) || 0,
    }
  }
  // 原表里三项全 0 的形态属于**限定版**（活动/掉落获得），不是"免费唤醒"。
  // 若把全 0 当成"无条件可唤醒"，玩家就能白拿，与"限定"矛盾 —— 所以这类不给唤醒。
  D.isAwakenable = function (form) {
    const r = D.awakenRequire(form)
    return (r.courage + r.wisdom + r.charm) > 0
  }
  D.REQ_TO_ATTR = REQ_TO_ATTR

  // 这座岛会不会刷怪。**只读判断，不生成任何刷怪对象**。
  // 用途：战报面板要列出"每张练级地图"，但界面/绘制函数绝不能有副作用
  // —— 早先在 drawExplore 里调 sceneSpawns() 会把全 88 个场景的怪**提前固化**
  // （按当时的等级定格），导致实际刷出的怪与预期不符，连锁把 test-seal 的命中判定打挂。
  D.islandHasMonsters = (isl) => ((D.ISLAND_MONSTERS || {})[isl] || []).length > 0

  // 这座岛刷怪池里的第一只（**只用于给任务起名**；真正刷出哪只是随机的）
  // 注意：D.MONSTERS 是**数组**，按 id 取怪要用 D.monster(id)（曾写成 D.MONSTERS[id]，
  // 结果永远取不到，战报任务名退化成"野外怪物"）。
  D.islandMonsterName = function (isl) {
    const pool = (D.ISLAND_MONSTERS || {})[isl] || []
    const m = pool.length ? D.monster(pool[0]) : null
    return m ? m.name : null
  }

  // ================= 升级曲线（derived：原表未给）=================
  D.expToNext = (lv) => Math.round(80 * Math.pow(lv, 1.55))
  // 玩家成长：用**复利**而不是线性，升级才有「质变」感。
  // 基础值本来就比同级的怪高（这是玩家的先天优势），复利再让等级优势慢慢显现。
  D.growthPerLevel = { life: 0.105, mp: 0.06, atk: 0.072, def: 0.062, matk: 0.072, mdef: 0.05, hit: 0.012, eva: 0.012, spd: 0.02 }

  // 把 1 级基准值 + 等级 算出实际数值
  D.statsAtLevel = (base, lv) => {
    const out = {}
    for (const k of Object.keys(base)) {
      const g = D.growthPerLevel[k] || 0
      out[k] = Math.round(base[k] * Math.pow(1 + g, lv - 1))
    }
    return out
  }

  // 「精英/野外BOSS」这一档：按**项目里已有的判据**算出来，不另列名单。
  // 依据本文件上面的注释：「8 只怪的战力是中位数的 2 倍以上（战力 = 攻×血）」。
  // 用途：原版白色彩晶石碎片的掉落来源之一是"精英怪 / 野外BOSS"（7k7k/177905），
  // 而我们的刷怪表里**没有精英标记** —— 所以用这条既有判据反推。
  // ⚠️ 原文把"精英怪"和"野外BOSS"并列成两类，归档里无法区分 → 本项目合并处理（deviations V40）。
  let _bossTier = null
  D.bossTierIds = function () {
    if (_bossTier) return _bossTier
    const all = D.MONSTERS || []
    const power = (m) => (m.stats && m.stats.life ? m.stats.life : (m.life || 0)) * (m.stats && m.stats.atk ? m.stats.atk : (m.atk || 0))
    const vals = all.map(power).filter((v) => v > 0).sort((a, b) => a - b)
    if (!vals.length) { _bossTier = new Set(); return _bossTier }
    const median = vals[Math.floor(vals.length / 2)]
    _bossTier = new Set(all.filter((m) => power(m) >= median * 2).map((m) => m.id))
    return _bossTier
  }
  D.isBossTier = (id) => D.bossTierIds().has(Number(id))

  // ================= 旅行：岛的邻接（按世界地图上的相邻关系）=================
  D.ISLAND_LINKS = {
    castle: ['wilds', 'market', 'angel'],
    desert: ['castle', 'angel'],
    angel: ['castle', 'market', 'desert'],
    market: ['castle', 'angel', 'factory'],
    wilds: ['castle', 'volcano', 'forest', 'factory'],
    volcano: ['wilds', 'coral'],
    coral: ['volcano', 'rock'],
    factory: ['wilds', 'market', 'rock'],
    rock: ['factory', 'coral'],
    forest: ['wilds', 'islet'],
    islet: ['forest', 'rock'],
  }
})()
