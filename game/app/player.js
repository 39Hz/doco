/* 多克多比 · 应用层：属性 / 服饰附魔 / 配招 / applySaveToRuntime / grantExp（第 72 轮重构批次 5）
   来源：原 game.js 第 131–323 行，内容一致（含原注释）。
   依赖：内核 G.core 的共享状态 S / 提示原语 toast；引擎 window.DKDbb 的 util / save；
   内容表 window.DKDbbData（D）。切场景经 G.app.scene.enterScene 惰性解析（已迁出）。
   只经 G.app.player 出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'

  const G = window.DKDbbGame
  const { S, toast } = G.core
  const { util, save } = window.DKDbb
  const D = window.DKDbbData

  // 跨应用层桥（惰性箭头：调用时才解析，故加载顺序无关）。
  const enterScene = (...a) => G.app.scene.enterScene(...a)

  // ==================== 数值 ====================
  // ---- 服饰与附魔（第 45 轮，官方系统）----
  // 官方硬规则（7k7k/530436）：「**变身成为多比也会享受这一加成**！」
  // 所以附魔加成必须挂进 playerStats()，而不是只改外观。
  function costumeStock() {
    if (!D._costumeStock) D._costumeStock = D.costumeStock ? D.costumeStock(window.__DKDbb_ANIM__) : []
    return D._costumeStock
  }
  function costumeById(id) { return costumeStock().find((c) => c.id === id) || null }
  function ownedCostumes() { return save.data.costumes || (save.data.costumes = {}) }
  function wornCostume() {
    const id = save.data.costumeWorn
    return id ? ownedCostumes()[id] && costumeById(id) : null
  }
  // 附魔加成（所有已购买服饰的加成**全部生效**？还是只算穿戴的那件？）
  // 官方只说"服饰将会获得属性加成"+"变身成多比也享受" —— 没说是否叠加。
  // 按常识与玩家攻略（只提"把所有服饰附魔到五级后的数据"，说明是多件一起算）→ 累加，
  // 但**同一属性多件只取最高**，避免堆同一属性叠成无敌（这条是 derived，已登记）。
  // 附魔加成的**数值是实时算的**，不是附魔那一刻算死存下来的。
  //
  // 【为什么必须实时算】第一版把 `val` 当绝对值存进存档，于是：
  // 在高等级附魔 → 存下 +1003 速度；之后玩家换到低等级形态，基础速度掉回 2000，
  // 而那条 +1003 还挂着 —— 白送半个身位。反过来在低等级附魔，练到后期就等于没加。
  // 现在存档只记「属性 + 品质系数 k + 等级」，数值每次按**当前基础值**算，
  // 于是加成永远是"当前属性的百分之几"，换形态、升级都不会失衡。
  function costumeValue(e, base) {
    if (!e || !e.attr || !(e.lv > 0)) return 0
    return D.enchantValueAt(base || baseStats(), e.attr, e.k, e.lv)
  }
  function enchantBonus() {
    const own = ownedCostumes()
    const base = baseStats()
    const best = {}
    for (const id of Object.keys(own)) {
      const e = own[id]
      if (!e || !e.attr || !(e.lv > 0)) continue
      const v = costumeValue(e, base)
      if (!(best[e.attr] > v)) best[e.attr] = v
    }
    return best
  }
  function playerStats() {
    const base = D.statsAtLevel(S.form.stats, save.data.level)
    const b = enchantBonus()
    if (!Object.keys(b).length) return base
    const out = Object.assign({}, base)
    for (const k of Object.keys(b)) out[k] = (out[k] || 0) + b[k]
    return out
  }
  // 附魔计算用的**纯基础值**（不含附魔加成）。
  // 不能拿 playerStats() 当基数：它已经把附魔加成算进去了，
  // 于是"升一级"会在上一级的结果上再乘一次 → 复利滚雪球，越附越离谱。
  function baseStats() { return D.statsAtLevel(S.form.stats, save.data.level) }
  function ensureVitals() {
    const st = playerStats(), sv = save.data
    if (!sv.maxHp) { sv.maxHp = st.life; sv.hp = st.life; sv.maxMp = st.mp; sv.mp = st.mp }
    if (sv.maxHp < st.life) { sv.hp += st.life - sv.maxHp; sv.maxHp = st.life }
    if (sv.maxMp < st.mp) { sv.mp += st.mp - sv.maxMp; sv.maxMp = st.mp }
    sv.hp = util.clamp(sv.hp, 0, sv.maxHp)
    sv.mp = util.clamp(sv.mp, 0, sv.maxMp)
  }
  // 把存档里的字段重新推导成运行时状态。
  // ==========================================================================
  // ★ 配招（第 55 轮）：玩家在技能面板里自己搭配的技能
  //
  // 背景：形态的技能原本由生成物 `game/tables/form-skills-official.js` 按属性自动配好，
  //   写进 `__DKDbb_FORMS__.forms[].skills` —— **玩家改不了**。
  //   这一层用存档里的 `loadouts` 覆盖它：有存过就用玩家的，没存过则沿用自动配的。
  //
  // 为什么覆盖在**内存里的 form 对象**上：战斗/形态面板等处有 13 处直接读
  //   `S.form.skills`（第 980/1010/1186/1192/9381 行等）。覆盖它 = 一处生效、处处生效，
  //   不必去改 13 个读取点（少改少错）。
  // 存档字段由 `engine.js` 的 defaults 提供，老档由 fillDefaults 补 {}。
  // ==========================================================================
  function loadoutOf(form) {
    const sv = save.data
    if (!form) return []
    const lo = sv.loadouts && sv.loadouts[form.name]
    if (Array.isArray(lo)) return lo.slice()
    return (form.skills || []).slice()          // 没配过 → 用自动配招
  }
  function slotCount(form) { return (form && form.skillSlots) || 5 }
  // 战斗用的**紧凑列表**：去掉空槽（null），只留真实技能。
  // 为什么需要：配招是"固定槽位"（空格留 null），而战斗里的技能网格/键盘选择
  //   是按数组下标走的 —— 留着 null 会渲染出空白格、还会让"下一个可用技能"跳格。
  //   配招面板用**带洞**的列表（要显示哪一格空），战斗用**紧凑**列表。两者各取所需。
  function battleSkills(form) {
    return loadoutOf(form || S.form).filter((n) => n && n !== '')
  }
  // 把存档里的配招应用到内存里的形态对象（启动/读档/换档后都要调）
  function applyLoadout(form) {
    if (!form) return
    const sv = save.data
    if (!sv.loadouts) sv.loadouts = {}
    const lo = sv.loadouts[form.name]
    if (Array.isArray(lo)) form.skills = lo.slice()
  }
  function setLoadout(form, list) {
    if (!form) return false
    const sv = save.data
    if (!sv.loadouts) sv.loadouts = {}
    const max = slotCount(form)
    // **固定槽位**语义：空格留 null，**不前移**。
    //   ⚠️ 第一版用 splice 卸下 → 后面的技能整体前移，"第 3 槽"变成别的技能，
    //      玩家点哪一格、结果改到另一格，且"装到满"会误判（实测只装到 4 个）。
    //   过滤：不认识的技能名一律当空格（防脏数据），去重，长度截到槽位数。
    const seen = new Set()
    const clean = []
    for (let i = 0; i < max; i++) {
      const n = list && list[i]
      if (!n || !D.SKILLS || !D.SKILLS[n] || seen.has(n)) { clean.push(null); continue }
      seen.add(n)
      clean.push(n)
    }
    sv.loadouts[form.name] = clean
    form.skills = clean.slice()
    save.persist()
    return true
  }
  // 装备一个技能：先填第一个空槽；满了就替换「当前选中的装备格」
  function equipSkill(name) {
    const f = S.form
    if (!f || !name || !D.SKILLS || !D.SKILLS[name]) return { ok: false, why: '技能不存在' }
    const list = loadoutOf(f)
    const max = slotCount(f)
    for (let i = list.length; i < max; i++) list.push(null)   // 补齐槽位
    if (list.slice(0, max).includes(name)) return { ok: false, why: '这个技能已经装上了' }
    const sel = S.skpEquipSel
    let idx = -1
    if (sel != null && sel >= 0 && sel < max && !list[sel]) idx = sel
    if (idx < 0) idx = list.findIndex((x, i) => i < max && !x)
    const replaced = idx < 0
    if (replaced) {
      // 槽满了：替换当前选中格（没选就替换最后一格）——**保留原技能名以便提示**
      idx = (sel != null && sel >= 0 && sel < max) ? sel : max - 1
    }
    const old = list[idx]
    list[idx] = name
    setLoadout(f, list)
    return { ok: true, slot: idx, replaced, replacedName: replaced ? old : null }
  }
  function unequipSkill(idx) {
    const f = S.form
    if (!f) return { ok: false, why: '没有形态' }
    const list = loadoutOf(f)
    const max = slotCount(f)
    for (let i = list.length; i < max; i++) list.push(null)
    if (!(idx >= 0 && idx < max) || !list[idx]) return { ok: false, why: '这一格是空的' }
    const gone = list[idx]
    list[idx] = null                 // 留空洞，不前移
    setLoadout(f, list)
    return { ok: true, gone }
  }

  // 主菜单的「继续冒险 / 读取存档 / 新的冒险」都必须走这里 ——
  // 否则会出现"读了档，人物却还是上一档的形态和血量"这种对不上的情况。
  function applySaveToRuntime() {
    const sv = save.data
    S.form = D.FORMS.find((f) => f.name === sv.form) || D.FORMS[0]
    sv.form = S.form.name
    if (!sv.forms || !sv.forms.length) sv.forms = [D.FORMS[0].name]
    if (!sv.forms.includes(S.form.name)) sv.forms.push(S.form.name)
    if (!sv.soya) sv.soya = []
    if (!sv.soya.length && D.SOYA.length) sv.soya.push(D.SOYA[0].id)
    if (!sv.questsDone) sv.questsDone = []
    if (!sv.loadouts) sv.loadouts = {}
    // 把玩家配招应用到**所有已拥有**的形态上（不只是当前这只）——
    // 否则切到另一只时还是自动配招，玩家会以为配招没保存。
    for (const f of D.FORMS) applyLoadout(f)
    if (sv.gold === undefined) sv.gold = 0
    if (!sv.visited) sv.visited = []
    if (sv.level === undefined) sv.level = 1
    if (!sv.items) sv.items = {}
    // 换档后血量按新形态/等级重算：先把上限清零，ensureVitals 才会重新推导
    sv.maxHp = 0; sv.maxMp = 0
    ensureVitals()
    // 回到存档记录的场景（没有就用地一张有内容的图）
    const back = sv._lastScene && S.scenes[sv._lastScene] ? sv._lastScene : 2
    if (S.scenes[back]) enterScene(back, { keepMode: true })
    // 注意用 S.world：`world` 只是启动函数里的局部 const，这里取不到
    const isles = (S.world && S.world.islands) || []
    S.mapSel = Math.max(0, isles.findIndex((i) => i.id === (S.current && S.current.island)))
    if (S.mapSel < 0) S.mapSel = 0
  }

  function grantExp(n) {    const sv = save.data
    sv.exp += n
    let up = 0
    while (sv.exp >= D.expToNext(sv.level)) { sv.exp -= D.expToNext(sv.level); sv.level++; up++ }
    if (up) { ensureVitals(); sv.hp = sv.maxHp; sv.mp = sv.maxMp; toast(`升级！Lv.${sv.level}`, 2800) }
    save.persist()
    return up
  }

  // 索亚（陪伴宠物）——当前出战的那只（读存档，故归 app 层；界面绘制与战斗逻辑共用同一份）。
  // 说明：原在 game.js，第 72 轮重构 · 批次 7 · ui 收尾 迁到此处。
  function activeSoya() {
    const id = save.data.soyaActive
    if (!id || !(save.data.soya || []).includes(id)) return null
    return D.soyaById(id)
  }
  // 界面层用的**窄只读取值**（ui 不许直接读存档，按用途各给一个）。
  const ownedFormNames = () => save.data.forms
  const playerName = () => save.data.playerName
  const playerVitals = () => ({
    level: save.data.level, exp: save.data.exp,
    hp: save.data.hp, maxHp: save.data.maxHp, mp: save.data.mp, maxMp: save.data.maxMp,
  })
  const soyaOwned = () => save.data.soya
  const soyaActiveId = () => save.data.soyaActive

  G.app = G.app || {}
  G.app.player = { costumeStock, costumeById, ownedCostumes, wornCostume, costumeValue, enchantBonus,
    playerStats, baseStats, ensureVitals, loadoutOf, slotCount, battleSkills, applyLoadout, setLoadout,
    equipSkill, unequipSkill, applySaveToRuntime, grantExp,
    activeSoya, ownedFormNames, playerName, playerVitals, soyaOwned, soyaActiveId }
})()