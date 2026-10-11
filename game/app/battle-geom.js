/* 多克多比 · 应用层：战斗布局常量与工具（第 72 轮重构 · 批次 9 · 常量与工具）
   来源：原 game/game.js 的「战斗」常量段 —— 底部操作栏高度 BATTLE_BAR_H / 顶边 BATTLE_BAR_TOP、
   阵位 P_POS / E_POS、接地余量 GROUND_LIFT、朝向开关 PLAYER_FACE_RIGHT / PET_FACE_RIGHT、
   素材朝向表 MONSTER_ART_FACES_RIGHT、操作栏版式 BATTLE_BAR；结印方向 SEAL_ARROWS / SEAL_LABEL；
   强化药剂别名 POWER / DEF（建立在 domain/battle-math 的 atkOf / defOf 之上）。
   依赖：内核 G.core（H / W）+ 领域 G.domain.battleMath（atkOf / defOf）。
   消费方（app/battle.js、ui/battle-view.js、ui/bag.js、ui/figures.js）经 G.app.battleGeom.* 惰性取用；
   game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const { H } = G.core
  const { atkOf, defOf } = G.domain.battleMath

  // 底部操作栏的高度与顶边 —— **唯一定义处**（战斗场地、阵位、命中测试都引用它）
  const BATTLE_BAR_H = 108
  const BATTLE_BAR_TOP = H - BATTLE_BAR_H

  // 对战阵位（drawBattle 与特效共用，保持一致）
  //
  // 【第 55 轮修：站位太靠下 —— 脚和宠物陷进底部操作栏】
  //   用户原话：「人物战斗和宠物站的位置太靠下面了」。
  //   量出来的原因（画布 960×560）：
  //     · 底部操作栏从 **y = 560 − 108 = 452** 开始；
  //     · 旧值 玩家 y=452 → **脚底正好压在栏顶**，接地影大半被盖住；
  //     · 索亚站位是 `P_POS.y + 26` = **478** → **整个人陷进操作栏里**（96px 高，只露出几十像素）。
  //   修法：把"脚底"抬到操作栏顶边**再往上留 `GROUND_LIFT` 的余量**；
  //   对手按同一基准抬，并保持它本来就比玩家高 56px（近大远小的纵深关系不能破）。
  const GROUND_LIFT = 42
  const P_POS = { x: 250, y: BATTLE_BAR_TOP - GROUND_LIFT }        // 玩家脚底（旧值 452）
  const E_POS = (i) => ({ x: 690 + i * 120, y: BATTLE_BAR_TOP - GROUND_LIFT - 56 })   // 对手脚底（旧值 396）

  // ---------- 战斗朝向：一条规则 + 一张数据表 ----------
  //
  // 【第 55 轮：为什么不能用一个全局开关】用户连着报了两轮朝向问题：
  //   「这个多比朝向有问题，应该全部朝向敌人」→「怪物必须是朝向玩家，宠物应该跟玩家一个方向朝着怪物」
  //   → 「怪物朝位置错了要固定在玩家对面」。
  //   查出来的事实：
  //     · 玩家：`drawFigure(..., facing, ...)` + `artFlip(facing)` —— 有自己的翻转逻辑；
  //     · 怪物：`drawMonster` 原先**没有翻转参数**，永远按素材原始方向画；
  //     · 宠物（索亚）：裸的 `ctx.drawImage`，**连开关都没有**。
  //   第一版修法给所有怪加"翻转"，结果**更糟** —— 实测 36 只里 **27 只素材本就朝左**，
  //   一翻全变成朝右、背对玩家。所以朝向必须**按素材逐只判**，不能一把梭。
  //
  // 规则：玩家与宠物在左（x=250 / 346）、怪物在右（690+）→ 前两者朝右、怪物朝左。
  // 素材朝向表（`_tools/gen-monster-facing.mjs` 生成，判据 = 眼白重心相对整头重心的偏移）：
  //   36 只里 27 只朝左（**不用翻**）、9 只朝右（**要翻**）→ 只翻那 9 只。
  const PLAYER_FACE_RIGHT = true   // 玩家在左 → 朝右面对怪物
  const PET_FACE_RIGHT = true      // 宠物与主人同向
  // 素材**天然朝右**的怪（战斗里必须翻转才能面对玩家）。
  // ⚠️ 换怪物素材后必须重跑 `node _tools/gen-monster-facing.mjs` 更新这张表。
  const MONSTER_ART_FACES_RIGHT = new Set([10006, 10008, 10009, 10013, 10015, 10017, 10019, 19005, 19007])

  // 统一的战斗 UI 布局：绘制与命中测试共用同一份坐标，
  // 避免「画在这里、点在那里」（背包就吃过这个亏）
  //
  // 底部三层的纵向分配（W/H 为 960×560）：
  //   状态栏（血/能量/经验）  y = H-62 .. H     ← 通栏，最底
  //   指令按钮                在状态栏**上方**，右对齐
  //   技能网格                再往上（由 drawBattle 算 gy）
  // 早先指令按钮 y = H-36，正好压在状态栏的血条和能量条上，把属性挡住了。
  // 战斗界面照**官方原版截图**重排（素材：`图片资料/多克多比图片集/游戏截图/战斗截图.jpg`）：
  //   · 左上角是队伍状态卡：头像 + 等级牌 + 红血条 + 蓝魔条
  //   · 底部是一条蓝框操作栏：左侧小面板、中间 6 个方形指令格、上方一条红色行动条、
  //     右侧一个大圆形主按钮（原版那个镶水晶的圆钮）
  // 早先我做的是"右侧横排四个文字按钮 + 底部通栏血条"，形状和原版差得远。
  const BATTLE_BAR = {
    y: BATTLE_BAR_TOP,
    // 【第 51 轮调整】格子按原版比例定：原版 64×64、格间 11px（画布 962 宽）；
    //   本作 960 宽、要塞 5 格 + 大圆钮 + 左侧"消息框/按钮"区，所以缩到 **57×66、格间 9**。
    //   左侧区宽 **148**：刚好放下原版那条消息框 + 三个小钮（22×3 + 6×2 = 78，留出边距）。
    //   原来这里是 122 宽、写着"敌人 2/2 / 回合 1"——那些信息现在移进消息框，不再单独占一块
    //   （否则加宽后会和三个钮叠在一起，截图里实测过）。
    slotN: 6, slotW: 57, slotH: 66, slotGap: 9,
    leftX: 16, leftW: 148,
    bigR: 42,
  }

  // 方向键映射与箭头显示字属输入/界面，仍留在本文件。
  const SEAL_ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
  const SEAL_LABEL = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }

  // 强化药剂分四类：攻击/防御/魔攻/魔抗。
  // 【M1-3 之后】强化药剂各自作用在本通道上（见下面的 atkOf/defOf），不再并入同一条通道。
  const POWER = (u) => atkOf(u, 'physical')
  const DEF = (u) => defOf(u, 'physical')

  G.app = G.app || {}
  G.app.battleGeom = { BATTLE_BAR_H, BATTLE_BAR_TOP, GROUND_LIFT, P_POS, E_POS,
    PLAYER_FACE_RIGHT, PET_FACE_RIGHT, MONSTER_ART_FACES_RIGHT, BATTLE_BAR,
    SEAL_ARROWS, SEAL_LABEL, POWER, DEF }
})()
