/* 多克多比 · 游戏主体
   流程：标题 → 选形态 → 大地图 → 场景探索（对话/战斗/任务） */
(() => {
  'use strict'
  const E = window.DKDbb, D = window.DKDbbData, Q = window.DKDbbQuest, M = window.DKDbbMouse, FX = window.DKDbbFx
  const { input, util, text, anim, art, save, audio } = E

  // 内核（第 72 轮重构批次 1）：共享状态树 S 与画布 cvs/ctx/W/H 已迁到
  // `game/core/state.js`，由 `window.DKDbbGame.core` 统一提供。
  // 这里只做一次解构 —— 主体内部对 S / ctx / W / H 的引用一处都不用改。
  const G = window.DKDbbGame
  const { cvs, ctx, W, H, S } = G.core

  // 领域层纯函数（第 72 轮重构批次 2）：战斗数值的**纯叶子**已迁到
  // `game/domain/battle-math.js`（双通道 / 同属性加成 / defFactor / 速度倍率）。
  // 这里只做一次解构 —— 主体内部对 channelOf/atkOf/defOf/defFactor/elementFitMul/speedMultiplier
  // 的引用一处都不用改（与批次 1 同一套"解构 shim"手法）。
  const { channelOf, atkOf, defOf, defFactor, elementFitMul, speedMultiplier } = G.domain.battleMath
  // 结印规则/算法（game/domain/seal.js）：上限、步数、每步限时、倍率曲线。
  const { SEAL_MAX_SP, SEAL_STEPS, SEAL_STEP_DUR, sealMultiplier } = G.domain.seal
  // 副本规则表（game/domain/dungeon-rules.js）：「士气对抗」3×3 收益表。
  const { MORALE_MOVES, MORALE_TABLE } = G.domain.dungeonRules

  // 界面层（第 72 轮重构批次 3）：原版风格面板 / 名牌 / 条形已迁到 `game/ui/panels.js`。
  // 同样只做一次解构 —— 主体内 roundBox / drawBar / drawOrigPanel / drawOrigBtn /
  // drawBattleNameplate 的调用点一处不改。
  const { roundBox, drawBar, drawOrigPanel, drawOrigBtn, drawBattleNameplate } = G.ui
  // 角色绘法（game/ui/figures.js，批次 8）：立绘 / 走路帧 / 影子 / 立绘头像 / 背景 / SP 指示。
  // 同上「解构 shim」——主体里这些名字的调用点一处不改。
  const { playerActionIsSelfCast, attackPose, drawFigure, drawCostumeFigure,
    drawGroundShadow, drawFigureWalking, drawArtPortrait, drawBackground, drawSpPips } = G.ui
  // 副本绘制（game/ui/dungeon-view.js，批次 8 · 界面绘制）：列表 / 关卡 / 翻牌 / 士气 / 证据。
  // 同上「解构 shim」——主体里这些名字的调用点一处不改。
  const { flipRects, dungeonListRects, drawDungeon, moraleRects } = G.ui
  // 地点列表（game/ui/places.js）：布局 placesLayout 与绘制 drawPlaces。
  // 同上"解构 shim"——主体里 placesLayout / drawPlaces 的调用点一处不改。
  const { placesLayout, drawPlaces } = G.ui
  // 图鉴（game/ui/zukan.js）：状态/条目/布局/绘制与常量 ZUKAN。
  // 同上"解构 shim"——主体里 zukanState / zukanEntries / zukanLayout / drawZukan / ZUKAN
  // 的调用点一处不改。
  const { ZUKAN, zukanState, zukanEntries, zukanLayout, drawZukan } = G.ui
  // 战斗视图（game/ui/battle-view.js，批次 6）：指令布局 / 确认 / 敌人命中 / 消息框与橙钮 /
  // 结印界面 / 出手顺序条 / 整块战斗画面。
  // 同上"解构 shim"——主体里 battleLayout / battleConfirm / battleEnemyHitTest /
  // drawBattleMsgAndButtons / drawSealUI / drawTurnOrder / drawBattle 的调用点一处不改。
  const { battleLayout, battleConfirm, battleEnemyHitTest, drawBattleMsgAndButtons,
    drawSealUI, drawTurnOrder, drawBattle } = G.ui
  // 大地图（game/ui/worldmap.js，批次 7）：七大地形与通道图 / 几何 / 岛名标签 / 命中测试 / 整块绘制。
  // 同上"解构 shim"——主体里 districtOfIsland / districtOfScene / linksOf / routeTo /
  // routeText / mapGeom / worldmapIslandAt / drawWorldMap 的调用点一处不改。
  const { districtOfIsland, districtOfScene, linksOf, routeTo, routeText, mapGeom,
    worldmapIslandAt, drawWorldMap } = G.ui
  // 场景探索（game/ui/explore.js，批次 7）：小怪 / NPC / 主角 / 目标标记 / 左右出口 / 顶栏信息与经验条。
  // 同上"解构 shim"——主体里 drawExplore 的调用点一处不改。
  const { drawExplore } = G.ui
  // 杂货铺 + 服饰大楼（game/ui/shop.js，批次 7 · ui 收尾）：布局 shopLayout / shopSelected /
  // costumeRowRect / costumePerPage / costumePages 与绘制 drawShop / drawCostume。
  // 同上"解构 shim"——主体里这些名字的调用点一处不改。
  const { shopLayout, shopSelected, drawShop, costumeRowRect, costumePerPage,
    costumePages, drawCostume } = G.ui
  // 背包 / 属性面板 / 索亚（game/ui/bag.js，批次 7 · ui 收尾）：SOYA / BAG 布局与
  // soyaLayout / soyaPos / bagLayout / bagHitTest / bagPagerRects / statsButtonHit
  // 与绘制 drawSoyaPanel / drawBag / drawStats。
  // 同上"解构 shim"——主体里这些名字的调用点一处不改。
  const { SOYA, soyaLayout, soyaPos, BAG, bagLayout, bagHitTest, bagPagerRects,
    statsButtonHit, drawSoyaPanel, drawBag, drawStats } = G.ui
  // 技能面板（game/ui/skillpanel.js，批次 7 · ui 收尾）：SKP 与 openSkillPanel /
  // equipRectList / equipHitTest / skillPanelLayout / drawSkillPanel。
  // 同上"解构 shim"——主体里这些名字的调用点一处不改。
  const { SKP, openSkillPanel, equipRectList, equipHitTest, skillPanelLayout,
    drawSkillPanel } = G.ui
  // 主菜单（game/ui/title.js，批次 7 · ui 收尾）：状态 titleState / 版式 titleMenuLayout /
  // 条目 TITLE_ITEMS + titleItemLabel / 帮助版式 helpLayout + HELP_ROWS / 整块绘制 drawTitle。
  // 同上"解构 shim"——主体里这些名字的调用点一处不改。
  const { TITLE_ITEMS, titleItemLabel, titleState, titleMenuLayout, drawTitle,
    HELP_ROWS, helpLayout } = G.ui
  // 晶石对战界面（game/ui/crystal.js，批次 7 · ui 收尾）：棋盘坐标 crystalBoardRect /
  // 整块绘制 drawCrystalStage。同上"解构 shim"——主体里这些名字的调用点一处不改。
  const { crystalBoardRect, drawCrystalStage } = G.ui

  // 界面绘制残余（第 72 轮重构 · 批次 8 · 界面绘制）：对话 / 任务列表 / 战报 / 珍宝 / 唤醒 /
  // 小游戏列表 / 选形态 / 战斗结算 已迁到 game/ui/*.js。同上「解构 shim」——主体里这些名字的
  // 调用点（输入分发、draw() 分发、调试出口登记）一处不改。
  const { dialogOptionRects, drawDialog, questRowHit, drawQuestList,
    WAR, warLayout, WAR_PER_PAGE, warPages, warButtonRect, warButtonHit, drawWarReport,
    drawTreasure, awakenRects, drawAwaken, MINI_PANEL, miniLayout, drawMinigames,
    drawPick, drawResult } = G.ui

  // 应用层（第 72 轮重构批次 4）：起名字已迁到 `game/app/rename.js`。
  // 同上"解构 shim"——主体里 beginRename / applyRename / currentNameOf / displayNameOf /
  // wireNameInput 的调用点一处不改。
  const { beginRename, applyRename, currentNameOf, displayNameOf, wireNameInput } = G.app.rename
  // 战报任务（game/app/warreport.js）：任务模型与领取。
  // 同上"解构 shim"——主体里 WAR_TARGET / warTasks / warTaskText / warClaim /
  // warIslandProgress 的调用点一处不改。
  const { WAR_TARGET, warTasks, warTaskText, warClaim, warIslandProgress } = G.app.warreport
  // 白色彩晶石经济 + 珍宝小屋 + 在线礼包（game/app/economy.js）。
  // 同上"解构 shim"——主体里 TREASURE_DAILY / SHARDS_PER / dayKey / rollCrystalDay /
  // crystalsToday / synthesizeCrystal / treasureBuy / rollShardDrop / onlineGiftReady /
  // claimOnlineGift / tickOnlineGift / TREASURE / TREASURE_PER_PAGE / treasureList /
  // treasurePageInfo / treasureRects 的调用点一处不改。
  const { TREASURE_DAILY, SHARDS_PER, dayKey, rollCrystalDay, crystalsToday, synthesizeCrystal,
    treasureBuy, rollShardDrop, onlineGiftReady, claimOnlineGift, tickOnlineGift,
    TREASURE, TREASURE_PER_PAGE, treasureList, treasurePageInfo, treasureRects } = G.app.economy
  // 变身唤醒 + 唤醒小游戏编排（game/app/awaken.js）。
  // 同上"解构 shim"——主体里 AWAKEN_STAGE_GAIN / lockedForms / grantForm / awakenMissing /
  // canAwaken / awaken / AWAKEN / AWAKEN_ROWS / awakenList / currentTick / resetCurrentStage /
  // currentStagePass / quizAnswer / quizNext / quizRects / PIPE_DIRS / PIPE_SHAPES /
  // pipeRotateBits / PIPE_SOLUTION / makePipePuzzle / pipeBitsAt / pipeConnected / pipeRotate /
  // slideRect / pipeRect / makeShooter / shooterTick / shooterHit 的调用点一处不改。
  const { AWAKEN_STAGE_GAIN, lockedForms, grantForm, awakenMissing, canAwaken, awaken,
    AWAKEN, AWAKEN_ROWS, awakenList, currentTick, resetCurrentStage, currentStagePass,
    quizAnswer, quizNext, quizRects, PIPE_DIRS, PIPE_SHAPES, pipeRotateBits, PIPE_SOLUTION,
    makePipePuzzle, pipeBitsAt, pipeConnected, pipeRotate, slideRect, pipeRect,
    makeShooter, shooterTick, shooterHit } = G.app.awaken
  // 副本全流程（game/app/dungeon.js）。
  // 同上"解构 shim"——主体里 dungeonState / dungeonClears / SCENE_TOTAL / enterDungeon /
  // curStage / startDungeonStage / stealthTick / stealthSpotted / stealthAdvance / moralePlay /
  // moraleReset / dungeonAfterBattle / makeFlip / pickFlip / finishDungeon / ATTR_NAMES /
  // grantAttr / LIST_FOOTER_TOP / DUNGEON_STAGE_NAMES 的调用点一处不改。
  const { dungeonState, dungeonClears, SCENE_TOTAL, enterDungeon, curStage, startDungeonStage,
    stealthTick, stealthSpotted, stealthAdvance, moralePlay, moraleReset, dungeonAfterBattle,
    makeFlip, pickFlip, finishDungeon, ATTR_NAMES, grantAttr, LIST_FOOTER_TOP,
    DUNGEON_STAGE_NAMES } = G.app.dungeon
  // 场景 BGM 选择（game/app/bgm.js）。
  // 同上"解构 shim"——主体里 BGM / sceneBgmFor 的调用点一处不改。
  const { BGM, sceneBgmFor } = G.app.bgm
  // 对话推进（game/app/dialog.js，批次 5）。
  // 同上"解构 shim"——主体里 say / playQuest / advanceDialog / finishDialog
  // 的调用点一处不改。
  const { say, playQuest, advanceDialog, finishDialog } = G.app.dialog
  // NPC 排布 + 功能菜单 + 恢复生命（game/app/npc.js，批次 5）。
  // 同上"解构 shim"——主体里 npcPositions / openActorMenu / HEAL_NPCS / healerFor /
  // doHeal 的调用点一处不改。
  const { npcPositions, openActorMenu, HEAL_NPCS, healerFor, doHeal } = G.app.npc
  // 小怪刷新与重生 + 场景内容生成（game/app/spawn.js，批次 5）。
  // 同上"解构 shim"——主体里 RESPAWN_SEC / refreshSpawns / tickRespawns / sceneSpawns
  // 的调用点一处不改。
  const { RESPAWN_SEC, refreshSpawns, tickRespawns, sceneSpawns } = G.app.spawn
  // 场景可行走区域 / 出口 / 场景互通 / gotoScene / enterScene（game/app/scene.js，批次 5）。
  // 同上"解构 shim"——主体里 walkBounds / sceneExits / sceneExitRects / sceneLabel /
  // gotoScene / enterScene 的调用点一处不改。
  const { walkBounds, sceneExits, sceneExitRects, sceneLabel, gotoScene, enterScene } = G.app.scene
  // 属性 / 服饰附魔 / 配招 / applySaveToRuntime / grantExp（game/app/player.js，批次 5）。
  // 同上"解构 shim"——主体里 costumeStock / costumeById / ownedCostumes / wornCostume /
  // costumeValue / enchantBonus / playerStats / baseStats / ensureVitals / loadoutOf /
  // slotCount / battleSkills / setLoadout / equipSkill / unequipSkill / applySaveToRuntime /
  // grantExp 的调用点一处不改。activeSoya 在第 72 轮重构 · 批次 7 · ui 收尾 一并迁入。
  const { costumeStock, costumeById, ownedCostumes, wornCostume, costumeValue, enchantBonus,
    playerStats, baseStats, ensureVitals, loadoutOf, slotCount, battleSkills, setLoadout,
    equipSkill, unequipSkill, applySaveToRuntime, grantExp, activeSoya } = G.app.player
  // 战斗逻辑（game/app/battle.js，批次 6）。
  // 同上"解构 shim"——主体里 makeUnit / skillBlockReason / gainSp / startSeal / sealAdvance /
  // finishSeal / useSkill / firstUsableSkill / nextUsableSkill / notice / battleLog /
  // battleBtnAct / doCommand / itemRects / performItem / animLen / leaveBattle / startBattle /
  // soyaAtkMul / soyaDefMul / soyaBattleStats / soyaAttacker / expectedDamage / damage /
  // applyBuff / perform / petAct / beginAction / tickCooldowns / actEnemy / buildTurnOrder /
  // beginRound / advanceTurn / endRound / nextPhase / playerAct / checkBattleEnd / battleTick
  // 的调用点一处不改。
  const { makeUnit, skillBlockReason, gainSp, startSeal, sealAdvance, finishSeal, useSkill,
    firstUsableSkill, nextUsableSkill, notice, battleLog, battleBtnAct, doCommand, itemRects,
    performItem, animLen, leaveBattle, startBattle, soyaAtkMul, soyaDefMul, soyaBattleStats,
    soyaAttacker, expectedDamage, damage, applyBuff, perform, petAct, beginAction, tickCooldowns,
    actEnemy, buildTurnOrder, beginRound, advanceTurn, endRound, nextPhase, playerAct,
    checkBattleEnd, battleTick } = G.app.battle
  // 杂货铺 + 服饰大楼（game/app/shop.js，批次 7 · ui 收尾）：购买 / 穿戴 / 附魔与服饰界面状态 COSTUME。
  // 同上"解构 shim"——主体里 openShop / openCostumeShop / buyItem / buyCostume / wearCostume /
  // enchantCostume / reEnchantCostume / COSTUME 的调用点一处不改。
  const { openShop, openCostumeShop, buyItem, buyCostume, wearCostume, enchantCostume,
    reEnchantCostume, COSTUME } = G.app.shop
  // 主菜单动作（game/app/title.js，批次 7 · ui 收尾）：会读写存档的那部分 ——
  // titleAction / startNewGameIn / enterWorldFromMenu / writeToSlot / refreshSlots / hasProgress。
  // 同上"解构 shim"——主体里这些名字的调用点一处不改。
  const { titleAction, startNewGameIn, enterWorldFromMenu, writeToSlot,
    refreshSlots, hasProgress } = G.app.title
  // 晶石对战模拟（game/app/crystal.js，批次 7 · ui 收尾）：会读写存档的那部分 ——
  // makeCrystal / crystalResolve / crystalTurn / crystalTick / crystalClick。
  // 同上"解构 shim"——主体里这些名字的调用点一处不改。
  const { makeCrystal, crystalResolve, crystalTurn, crystalTick, crystalClick } = G.app.crystal
  // 小游戏入口 / 奖励 / 结算（game/app/minigame.js，批次 7）：会进副本、发奖励的那部分 ——
  // startMinigame / finishMinigame / openMinigames + 列表面板状态 MINI。
  // 同上"解构 shim"——主体里这些名字的调用点一处不改。
  const { startMinigame, finishMinigame, openMinigames, MINI } = G.app.minigame
  // 小游戏实现（game/app/minigames.js，批次 7 · 续）：make 工厂 / 每帧 tick / 重置 / miniStagePass。
  // 同上「解构 shim」——主体里这些名字的调用点一处不改。
  const {
    makeSlidePuzzle, slideSolved, slideMove, slideMoveDir, blocksShape, makeBlocks, blocksRuns, blocksClear,
    blocksMove, blocksRotate, blocksTick, blocksReset, blockCellRect, BLOCK_COLORS, makeRunner, RUN_BASE,
    RUN_BOOST, RUN_MAX, RUN_JUMP, RUN_GRAV, runnerPress, runnerJump, runnerTick, runnerReset,
    makePlatformer, PL_W, PL_H, platformerTick, platformerJump, platformerReset, flyerRoster, pickFlyer, makeChargeShooter,
    chargeShooterTick, chargeShooterReset, makeSki, SKI, skiPass, skiTick, skiReset, makeNotes,
    NOTE, notesTick, notesReset, FC, fcArena, makeFlyCatch, flyCatchCast, flyCatchTick,
    flyCatchReset, sumoView, sumoX, sumoY, sumoBX, sumoBY, sumoInRiver, makeSumo,
    sumoAlive, sumoNextUnit, sumoStartAim, sumoSetAim, sumoRotateAim, sumoPowerAim, sumoFire, sumoTick,
    sumoReset, ccParams, miniArena, makeCoinCatch, coinCatchTick, coinCatchReset, mrParams, makeMirror,
    mirrorTick, mirrorReset, srParams, soarLadder, makeSoar, soarTick, soarReset, bpParams,
    bpGoalY, makeBallPush, ballPushTick, ballPushReset, miniStagePass
  } = G.app.minigames
  // 仍在 game.js 的战斗绘法 / 状态（阶段 2 未迁）：被迁出的战斗逻辑与战斗视图要用它们，先挂桥。
  G.app.battleLayout = battleLayout
  // （原 G.app.buffLabel / drawSpPips / attackPose / playerActionIsSelfCast / drawFigure / drawBackground /
  //   drawGroundShadow / drawCostumeFigure / drawFigureWalking / drawArtPortrait 十行桥已删：
  //   `buffLabel` 随批次 8 归位到 `game/app/battle.js`，其余九个随「角色绘法」迁到 `game/ui/figures.js`；
  //   依赖方 ui/battle-view.js、ui/explore.js、ui/bag.js、ui/title.js 改走最终路径 `G.ui.*`。）
  // （drawWarButton 已随「界面绘制」迁到 game/ui/warreport-view.js；依赖方 ui/explore.js 改走最终路径
  //   G.ui.drawWarButton，故删去此处的 G.app 桥。）
  // ui 层不许直接读存档：场景探索读金币 / 等级 / 经验经此桥，行为与原来 `save.data` 等价。
  G.app.saveData = () => save.data
  // 背包数量经 app 层取（ui 层不许直接读存档）。
  G.app.bagOwned = (key) => D.bag.owned(save.data.items, key)
  G.app.bagCount = (id) => D.bag.count(save.data.items, id)

  // 常量与工具（第 72 轮重构 · 批次 9）：战斗布局常量 / 结印方向 / 强化别名 → game/app/battle-geom.js；
  // 难度档位 → game/app/difficulty.js。同上「解构 shim」——主体内调用点一处不改。
  const { P_POS, E_POS, MONSTER_ART_FACES_RIGHT, SEAL_ARROWS } = G.app.battleGeom
  const { diff, needOf, winOf, setDifficulty, toggleDifficulty } = G.app.difficulty

  // 主更新与输入分发（第 72 轮重构 · 批次 9 · update(dt)）已迁到顶层 game/input.js。
  // 同上「解构 shim」——主体里 update 的调用点（G.game 交给 boot.js）一处不改。
  const update = G.input.update

  // 跨应用层模块的临时桥（批次 4）：下面这些函数所属模块尚未迁出，
  // 先挂到 app 命名空间上，供已迁出的 app 模块取用；各自迁出后删掉对应那一行。
  // NPC 功能菜单要用的入口：唤醒 / 珍宝仍在本文件，先挂桥；
  // 商店 / 服饰入口已在批次 7 · ui 收尾 迁到 G.app.shop，小游戏入口已在批次 7 迁到
  // G.app.minigame，npc.js 直接指向它们，这里不再挂桥。
  G.app.openAwaken = openAwaken
  G.app.openTreasure = openTreasure
  // 时装造型池（场景生成要用）仍在本文件，批次 5 先挂桥。
  G.app.costumePool = costumePool
  // （miniStagePass / flyerRoster / pickFlyer 三行的临时桥已随小游戏实现迁出而删除，
  //   依赖方 awaken.js / dungeon.js 改走最终路径 G.app.minigames.*）
  // （第 72 轮重构 · 批次 9 · 常量与工具：难度桥 G.app.diff / needOf / winOf 已删 ——
  //   难度整段迁到 game/app/difficulty.js，消费方改走最终路径 G.app.difficulty.*。）
  // 小游戏实现（批次 7 · 续）已迁到 `game/app/minigames.js`，由该模块自行注册 G.app.minigames，
  // 这里不再挂桥。

  // NPC 排布（第 72 轮重构批次 5：已迁到 game/app/npc.js，由顶部"解构 shim"取用）
  // 场景可行走区域 / 出口 / 场景互通 / gotoScene / enterScene
  // （第 72 轮重构批次 5：已迁到 game/app/scene.js，由顶部"解构 shim"取用）

  // 图片缓存与怪物立绘画法（第 72 轮重构批次 1：迁到 game/core/images.js）
  const { bgImage, itemImage, monImage, drawMonster } = G.core

  // ==================== 缩放 ====================（第 72 轮重构批次 1：迁到 game/core/canvas.js）
  const fit = G.core.fit

  // 共享提示原语（第 72 轮重构批次 4：迁到 game/core/toast.js）
  // 「解构 shim」——主体里 toast(...) 的调用点一处不改。
  const toast = G.core.toast

  // ==================== 数值 ====================
  // 数值（第 72 轮重构批次 5：已迁到 game/app/player.js，由顶部"解构 shim"取用）

  // ==================== 场景 ====================
  // （第 72 轮重构批次 5：已迁到 game/app/scene.js，由顶部"解构 shim"取用）

  // ==================== 小怪刷新 ====================
  // （第 72 轮重构批次 5：已迁到 game/app/spawn.js，由顶部"解构 shim"取用）

  // （场景内容生成 sceneSpawns + 商贩名 SHOP_NPCS 已在批次 5 一并迁到 game/app/spawn.js）

  // （第 72 轮重构批次 7 · ui 收尾：杂货铺逻辑已迁到 game/app/shop.js、布局与绘制已迁到 game/ui/shop.js，由顶部"解构 shim"取用）

  // 任务 NPC / NPC 功能菜单（第 72 轮重构批次 5：已迁到 game/app/npc.js，由顶部"解构 shim"取用）

  // ==================== 对话 ====================
  // （第 72 轮重构批次 5：已迁到 game/app/dialog.js，由顶部"解构 shim"取用）

  // ==================== 战斗 ====================
  // （第 72 轮重构批次 6：已迁到 game/app/battle.js，由顶部"解构 shim"取用）

  // （第 72 轮重构 · 批次 9 · 常量与工具：战斗布局常量 / 朝向 / 素材朝向表 / 操作栏版式 已迁到 game/app/battle-geom.js，由顶部「解构 shim」取用）
  // （第 72 轮重构批次 6：已迁到 game/ui/battle-view.js，由顶部"解构 shim"取用）
  // （第 72 轮重构 · 批次 9 · update(dt)：命中测试工具 rectHit 已随 update 迁到 game/input.js。）
  // （第 72 轮重构批次 6：已迁到 game/ui/battle-view.js，由顶部"解构 shim"取用）
  // （第 72 轮重构批次 6：已迁到 game/app/battle.js，由顶部"解构 shim"取用）

  // ==================== SP 与结印技 ====================
  // 官方《结印技能特点》原文要点：
  //   · 结印技**不消耗魔法能量**，但**威力远远超出普通技能**
  //   · 每次释放需要消耗 SP；攻击怪物或被打都会积攒 SP，槽满得 1 点，**最多 3 点**
  //   · 攒到 SP 之后结印技图标才会变亮
  //   · 「多克多比首创结印式释放」：出现结印操作，玩家在**规定时间内**按**上下左右**，
  //     **成功结印越多威力越大**
  // 规则常数（SEAL_MAX_SP/SEAL_STEPS/SEAL_STEP_DUR）与 sealMultiplier 已迁到
  // `game/domain/seal.js`（第 72 轮批次 2），见顶部解构 shim。
  // （第 72 轮重构 · 批次 9 · 常量与工具：SEAL_ARROWS / SEAL_LABEL 已迁到 game/app/battle-geom.js，由顶部「解构 shim」取用）
  // （第 72 轮重构批次 6：已迁到 game/app/battle.js，由顶部"解构 shim"取用）

  // （第 72 轮重构批次 6：已迁到 game/ui/battle-view.js，由顶部"解构 shim"取用）

  // （第 72 轮重构批次 6：已迁到 game/app/battle.js，由顶部"解构 shim"取用）

  // （第 72 轮重构批次 6：已迁到 game/app/battle.js，由顶部"解构 shim"取用）

  // ==================== 音乐归属 ====================
  // （第 72 轮重构批次 4：已迁到 `game/app/bgm.js`，由顶部"解构 shim"取用）

  // （第 72 轮重构批次 6：已迁到 game/app/battle.js，由顶部"解构 shim"取用）

  // （第 72 轮重构 · 批次 9 · 常量与工具：POWER / DEF 已迁到 game/app/battle-geom.js，由顶部「解构 shim」取用）

  // ==================== 双伤害通道 / 同属性加成 / defFactor（计划书 M1-3、M1-5）====================
  // channelOf / buffed / atkOf / defOf / elementFitMul / defFactor 已迁到
  // `game/domain/battle-math.js`（第 72 轮批次 2，纯逻辑零 I/O），
  // 见本文件顶部解构 shim；POWER/DEF 两个别名照旧建立在 atkOf/defOf 之上。

  // （第 72 轮重构批次 6：已迁到 game/app/battle.js，由顶部"解构 shim"取用）

  // 期望伤害（不含暴击与命中随机）。抽出来是为了让测试能直接比较"改魔攻前后"，
  // 而不必真打几十场看统计 —— 公式只有这一份，damage() 在它之上叠加暴击/命中。
  // （第 72 轮重构 · 批次 9 · 常量与工具：DIFFS / diff / needOf / winOf / setDifficulty / toggleDifficulty 已迁到 game/app/difficulty.js，由顶部「解构 shim」取用）

  // （第 72 轮重构批次 6：已迁到 game/app/battle.js，由顶部"解构 shim"取用）

  // ==================== 速度 ====================
  // 原表给每个形态都标了速度（128~180），之前完全没用上，
  // 于是风系"速度出众"的设定形同虚设，只剩"攻低血少"这个缺点。
  // 「分数连击」的完整推导（K=0.8 / cap=0.5 的实测标尺）见 domain/battle-math.js。
  // speedMultiplier 与其常数 SPD_K / SPD_CAP 已迁到该文件（第 72 轮批次 2）。

  // 说明：这里曾经有一个「玩家每回合被动回复 2% 上限」的机制，
  // 目的是让胜负别只由"谁先跨过临界点"决定。但它被写进了**每帧**循环
  // （`PLAYER_REGEN * dt * 3`，60fps 下等于每秒回满 3.6 倍血量），
  // 结果战斗中血一掉就被瞬间填回，玩家反馈"对局中会自动回血"。
  // 已移除。连续战斗的续战能力改由「战后回血 45%」承担（见 checkBattleEnd）。

  // （第 72 轮重构批次 6：已迁到 game/app/battle.js，由顶部"解构 shim"取用）

  // （第 72 轮重构批次 6：已迁到 game/app/battle.js，由顶部"解构 shim"取用）

  // （第 72 轮重构批次 6：已迁到 game/app/battle.js，由顶部"解构 shim"取用）

  // ==================== 战报任务（M4 周边系统，有官方原文依据）====================
  // 官方依据与落地说明、以及全部实现（WAR_TARGET / warTasks / warTaskText / warClaim /
  // warIslandProgress）—— 第 72 轮重构批次 4 整段迁到 `game/app/warreport.js`，见顶部解构 shim。

  // 战报面板的版式（WAR / warLayout / WAR_PER_PAGE / warPages）已随「界面绘制」迁到 game/ui/warreport-view.js，由顶部「解构 shim」取用。

  // ==================== 恢复生命 NPC（原版系统，有官方原文依据）====================
  // （第 72 轮重构批次 5：已迁到 game/app/npc.js，由顶部"解构 shim"取用）

  // ==================== 副本（M4-1，官方系统）====================
  // （第 72 轮重构批次 4：已迁到 `game/app/dungeon.js`，由顶部"解构 shim"取用）

  // ==================== 白色彩晶石经济 + 珍宝小屋 + 在线礼包 ====================
  // （第 72 轮重构批次 4：已迁到 `game/app/economy.js`，由顶部"解构 shim"取用）

  // ==================== 变身唤醒（M4-4，官方系统）====================
  // （第 72 轮重构批次 4：已迁到 `game/app/awaken.js`，由顶部"解构 shim"取用）

  // ==================== 小游戏系统（M4-4，官方系统）====================
  // （第 72 轮重构 · 批次 7 · 续做：整段实现已迁到 `game/app/minigames.js`，由顶部「解构 shim」取用
  //   —— 调用点一处不改。官方依据与名字见 `game/tables/minigames.js`；放在应用层的理由见该模块文件头。）

  // 小游戏入口 / 奖励 / 结算（第 72 轮重构批次 7：已迁到 game/app/minigame.js，
  // 由顶部"解构 shim"取用 —— startMinigame / finishMinigame 的调用点一处不改）

  // （第 72 轮重构批次 6：已迁到 game/app/battle.js，由顶部"解构 shim"取用）

  // （第 72 轮重构批次 6：已迁到 game/app/battle.js，由顶部"解构 shim"取用）

  // ==================== 更新 ====================
  // 打开技能面板 —— **键盘（V/K）与顶栏「技能」按钮共用这一个入口**。
  // 抽出来是因为两处各写一遍必然分叉（一边改了另一边忘），配招的初始选中格就会不一致。
  // （第 72 轮重构批次 7 · ui 收尾：openSkillPanel 已迁到 game/ui/skillpanel.js，由顶部"解构 shim"取用）

  // （第 72 轮重构 · 批次 9 · update(dt)：主更新与全部模式的输入分发 已迁到 game/input.js（顶层编排），
  //   由顶部「解构 shim」取用 —— game.js 内 update 的调用点一处不改。）

  // ==================== 起名字（第 54 轮）====================
  // （第 72 轮重构批次 4：整段迁到 `game/app/rename.js`，见顶部解构 shim）

  // ==================== 绘制 ====================
  // 场景里的**玩家本体是多克**（第 54 轮改），多比是**战斗形态**。
  //
  // 【为什么要改】用户连着报了三轮走路不对 ——「像在空中飘」→「眼睛和小脚会消失」→「变多腿人了」。
  // 根因是**归档里根本没有多比的走路循环**（`多比形态序列` 只有光多比/凤凰多比，且全是战斗动作），
  // 拿一张站立立绘去"合成"走路，切哪里都会留伪影。
  // 而**归档里有真正手绘的走路动画**：`时装序列` 10 套 × 4 方向 × 17 帧（NPC 用的就是它，
  // 所以 NPC 走路一直是对的）。原版的玩家本体本来就是多克、多比只在战斗里出现 ——
  // 于是这里回到原版的做法：**场景里走多克（真走路帧），战斗里是变身的多比**。
  //
  // 造型池：`costumePool()` 是唯一来源（NPC 与主角共用，先到先得的那套逻辑不变）。
  let __costumePool = null
  function costumePool() {
    if (!__costumePool) __costumePool = D.npcCostumes(anim.data) || []
    return __costumePool
  }
  // 玩家用哪套造型：**穿了服饰就用那套**（服饰系统第 45 轮做的，正好在这里兑现：
  // "买了就能看见自己穿着它走路"）；没穿就按玩家名字稳定挑一套，保证每次进游戏同一个人。
  //
  // `__costumeOverride` 只给测试用：置成 null 就能逼出"造型取不到"的回退路径
  // （那条路上走的是 `assets/forms/walk/` 的合成帧），这样"合成帧还在、还能用"也能被钉住。
  let __costumeOverride
  function playerCostume() {
    if (__costumeOverride !== undefined) return __costumeOverride
    const w = wornCostume()
    if (w) return w
    const pool = costumePool()
    if (!pool.length) return null
    return D.pickCostume(pool, save.data.playerName || '多克', save.slot())
  }


  // （第 72 轮重构批次 6：已迁到 game/ui/battle-view.js，由顶部"解构 shim"取用）

  // drawBar（通用条形）已迁到 `game/ui/panels.js`（见文件顶部解构）。

  // 原版风格面板 / 橙色方钮（drawOrigPanel / drawOrigBtn）已迁到 `game/ui/panels.js`。

  // 战斗名牌（drawBattleNameplate）已迁到 `game/ui/panels.js`（见文件顶部解构）。

  // 地点列表（PLACES / placesLayout / drawPlaces）已迁到 `game/ui/places.js`
  // （见文件顶部解构）—— 原版流程：点岛屿 → 列出该岛所有地点 → 选一个进去。

  // ==================== 背包布局（供绘制与命中测试共用）====================
  // 照着原版背包界面重做（用户提供的游戏内截图）：
  //   左侧：一块信息面板 —— 大立绘 + 字段行（名称/等级/属性/经验）+ 下排元素徽章
  //   右侧：2 列 × 6 行的**格子**（原版是槽位网格，拥有的形态填进去）
  //   底部：元素/等级徽章条
  // 早先是"6 列大卡片"，跟原版完全不像，而且只显示两个数值。
  // （第 72 轮重构批次 7 · ui 收尾：索亚绘制已迁到 game/ui/bag.js、出战索亚 activeSoya 已迁到 game/app/player.js，由顶部"解构 shim"取用）
  // 图鉴（多比 / 技能 / 索亚 / 怪物 / 骑士与魔王）的实现已迁到 `game/ui/zukan.js`
  // （批次 3 · 第 72 轮重构）。ZUKAN / zukanState / zukanEntries / zukanLayout / drawZukan
  // 由顶部解构 shim 从 G.ui 取用，调用点一字不改。

  // （第 72 轮重构批次 7 · ui 收尾：drawSoyaPanel / soyaPos / drawSoyaInBattle 已迁到 game/ui/bag.js，由顶部"解构 shim"取用）
  // 索亚跳跃计时变量 b0SoYaHop 留在本文件（战斗逻辑与绘制侧共用，经 G.app.getSoYaHop / setSoYaHop 桥）。
  let b0SoYaHop = 0
  // 索亚跳跃计时：变量声明留在本文件（绘制侧也在读），批次 6 迁出的战斗逻辑用取值/设值桥共用同一份。
  G.app.getSoYaHop = () => b0SoYaHop
  G.app.setSoYaHop = (v) => { b0SoYaHop = v }

  // （第 72 轮重构批次 7 · ui 收尾：SKP / skillIcon / equipRectList / equipHitTest / skillPanelLayout 已迁到 game/ui/skillpanel.js，由顶部"解构 shim"取用）

  // （第 72 轮重构批次 7 · ui 收尾：drawSkillPanel 已迁到 game/ui/skillpanel.js，由顶部"解构 shim"取用）

  // （第 72 轮重构批次 7 · ui 收尾：BAG / bagLayout / bagHitTest / bagPagerRects / bagPanel / bagBar 已迁到 game/ui/bag.js，由顶部"解构 shim"取用）

  // （第 72 轮重构批次 7 · ui 收尾：drawBag 已迁到 game/ui/bag.js，由顶部"解构 shim"取用）


  // （第 72 轮重构批次 7 · ui 收尾：已迁到 game/ui/shop.js，由顶部"解构 shim"取用）

  // （第 72 轮重构批次 7 · ui 收尾：STAT_ROWS / statsButtons / statsButtonHit / drawStats 已迁到 game/ui/bag.js，由顶部"解构 shim"取用）

  // （第 72 轮重构 · 批次 8 · 界面绘制：dialogOptionRects / drawDialog 已迁到 game/ui/dialog.js，由顶部「解构 shim」取用）

  // （第 72 轮重构 · 批次 8 · 界面绘制：questRowRects / questRowHit / drawQuestList 已迁到 game/ui/questlist.js，由顶部「解构 shim」取用）

  // （第 72 轮重构 · 批次 8 · 界面绘制：warButtonRect / warButtonHit / drawWarButton / drawWarReport 已迁到 game/ui/warreport-view.js，由顶部「解构 shim」取用）

  // 翻牌的四张牌位置（键盘与鼠标共用）
  function openTreasure() {
    rollCrystalDay()
    TREASURE.tab = 0; TREASURE.sel = 0; TREASURE.hover = -1
    S.mode = 'treasure'
    audio.sfx('assets/sfx/onClick_03.mp3')
  }

  // （第 72 轮重构 · 批次 8 · 界面绘制：drawTreasure 已迁到 game/ui/treasure-view.js，由顶部「解构 shim」取用；openTreasure 是改 S.mode 的动作，留在本文件）

  function openAwaken() {
    AWAKEN.sel = 0; AWAKEN.hover = -1; AWAKEN.page = 0
    S.mode = 'awaken'
    audio.sfx('assets/sfx/onClick_03.mp3')
  }
  // （第 72 轮重构 · 批次 8 · 界面绘制：awakenRects / ATTR_CN / drawAwaken 已迁到 game/ui/awaken-view.js，由顶部「解构 shim」取用；openAwaken 留在本文件）

  // 打开小游戏列表（第 72 轮重构批次 7：已迁到 game/app/minigame.js，由顶部"解构 shim"取用）
  // （第 72 轮重构 · 批次 8 · 界面绘制：MINI_PANEL / miniLayout / miniRects / drawMinigames 已迁到 game/ui/minigames-view.js，由顶部「解构 shim」取用）

  // （第 72 轮重构 · 批次 8 · 界面绘制：drawPick 已迁到 game/ui/pick.js，由顶部「解构 shim」取用）

  // ==================== 主菜单（标题页）====================
  // （第 72 轮重构批次 7 · ui 收尾：布局与绘制已迁到 game/ui/title.js，
  //   会读写存档的动作已迁到 game/app/title.js，由顶部"解构 shim"取用；调用点一处不改）

  // ==================== 晶石对战（第 57 轮） ====================
  // （第 72 轮重构批次 7 · ui 收尾：战斗模拟 makeCrystal / crystalResolve / crystalTurn /
  //   crystalTick / crystalClick 已迁到 game/app/crystal.js；棋盘坐标 crystalBoardRect /
  //   整块绘制 drawCrystalStage 已迁到 game/ui/crystal.js，均由顶部"解构 shim"取用，调用点一处不改）

  // 主菜单的动作分发（第 72 轮重构批次 7 · ui 收尾：已迁到 game/app/title.js，由顶部"解构 shim"取用）
  // （第 72 轮重构批次 7 · ui 收尾：标题页绘制已迁到 game/ui/title.js，由顶部"解构 shim"取用）

  // （第 72 轮重构批次 7 · ui 收尾：标题页的绘制 drawTitle / drawTitleMain / drawTitleLoad /
  //   drawTitleConfirmNew / drawTitleHelp / drawTitleAbout 与版式 titleMenuLayout / helpLayout
  //   已迁到 game/ui/title.js，由顶部「解构 shim」取用）


  // （第 72 轮重构 · 批次 8 · 界面绘制：drawResult 已迁到 game/ui/result.js，由顶部「解构 shim」取用）

  function draw() {
    ctx.clearRect(0, 0, W, H)
    switch (S.mode) {
      case 'title': drawTitle(); break
      case 'pick': drawPick(); break
      case 'worldmap': drawWorldMap(); break
      case 'explore': drawExplore(); break
      case 'dialog': drawDialog(); break
      case 'battle': drawBattle(); break
      case 'result': drawResult(); break
      case 'questlist': drawQuestList(); break
      case 'warreport': drawWarReport(); break
      case 'dungeon': drawDungeon(); break
      case 'treasure': drawTreasure(); break
      case 'costume': drawCostume(); break
      case 'awaken': drawAwaken(); break
      case 'bag': drawBag(); break
      case 'skillpanel': drawSkillPanel(); break
      case 'soya': drawSoyaPanel(); break
      case 'zukan': drawZukan(); break
      case 'minigames': drawMinigames(); break
      case 'shop': drawShop(); break
      case 'places': drawPlaces(); break
      case 'stats': drawStats(); break
      default: ctx.fillStyle = '#070b14'; ctx.fillRect(0, 0, W, H)
    }
    // NPC 功能菜单画在最上层（只在探索模式）
    if (S.mode === 'explore') M.drawMenu(ctx, W, H)
    if (S.toast) {
      // 位置：画面上方 1/4 处居中。
      // 早先放在 H-76（屏幕底部），会压住战斗的指令按钮（y=456..486）和状态栏（y=498..）
      // —— 用户截图里"进入 火营地"那条提示就盖在按钮上。
      ctx.font = 'bold 15px "Microsoft YaHei", sans-serif'
      const tw = ctx.measureText(S.toast.msg).width
      const ty = 132
      ctx.fillStyle = 'rgba(8,12,22,.92)'
      ctx.fillRect(W / 2 - tw / 2 - 18, ty, tw + 36, 34)
      ctx.strokeStyle = '#43d9c8'; ctx.lineWidth = 1
      ctx.strokeRect(W / 2 - tw / 2 - 17.5, ty + .5, tw + 35, 33)
      text.stroked(ctx, S.toast.msg, W / 2, ty + 23, { size: 15, align: 'center', color: '#d8fff8', lw: 3 })
    }
    // 卡顿面板（F3，第 55 轮）：定位"图鉴切快了卡住"用。
    // 画在左上角（工具栏在右上，菜单在左上但只有少数模式有）。
    if (S.showPerf) {
      const t1 = perfText() || ''
      ctx.font = 'bold 12px "Consolas", monospace'
      const w1 = ctx.measureText(t1).width + 16
      ctx.fillStyle = 'rgba(6,10,20,.88)'
      ctx.fillRect(8, 8, w1, 22)
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1
      ctx.strokeRect(8.5, 8.5, w1 - 1, 21)
      text.stroked(ctx, t1, 16, 23, { size: 12, color: '#ffe45e', lw: 2, weight: 'normal' })
      // 最近几次卡帧（哪一帧最慢、发生在哪个界面）
      const rows = PERF.recent.slice(-4)
      ctx.fillStyle = 'rgba(6,10,20,.88)'
      ctx.fillRect(8, 34, 300, 14 * rows.length + 8)
      ctx.strokeStyle = 'rgba(255,210,63,.5)'
      ctx.strokeRect(8.5, 34.5, 299, 14 * rows.length + 7)
      rows.forEach((r, i) => {
        text.stroked(ctx, `${r.ms} ms  ${r.what}`, 16, 46 + i * 14,
          { size: 11, color: '#cfd6e4', lw: 2, weight: 'normal' })
      })
    }
  }

  // ==================== 工具栏 ====================
  const tbStat = document.getElementById('tb-stat')
  const tbTitle = document.getElementById('tb-title') || document.querySelector('.tb-title')
  const tbVol = document.getElementById('tb-vol')
  function syncToolbar() {
    const sv = save.data
    const q = Q.currentMain(sv)
    // 顶栏左边显示**玩家自己的名字**（第 54 轮：起名字功能）——
    // 并存显示：名字 + 当前变身的多比（战斗形态）。原版里玩家本体是多克、多比是战斗形态，
    // 顶栏这样写正好把两层身份分开。
    if (tbTitle) tbTitle.textContent = `多克多比 · 浮空群岛　【${sv.playerName || '多比'}】变身：${displayNameOf(S.form ? S.form.name : '')}`
    tbStat.textContent =
      `${S.form ? S.form.name : '—'} Lv.${sv.level}　HP ${sv.hp}/${sv.maxHp}　MP ${sv.mp}/${sv.maxMp}　` +
      `EXP ${sv.exp}/${D.expToNext(sv.level)}　金币 ${sv.gold}　` +
      `难度 ${diff().name}（N 键切换）　` +
      `场景 ${sv.visited.length}/${SCENE_TOTAL()}　任务 ${(sv.questsDone || []).length}/${Q.all.length}` +
      (q ? `　当前主线：${q.title}` : '')
    tbVol.textContent = Math.round((sv._vol === undefined ? 0.55 : sv._vol) * 100)
  }

  // ==================== 启动 ====================
  // （第 72 轮重构 · 批次 7 · 续后半段：载入小贴士 / setProgress / boot / 工具栏按键 /
  //   主循环已迁到 `game/boot.js`，末尾用 `G.boot.start(G.game)` 把内部符号交给它。
  //   调试出口仍在本文件 —— 理由见 game/boot.js 文件头。）

  // 方向键数字选择（选项用）
  function choiceKeys() {
    for (let i = 1; i <= 3; i++) if (input.once(String(i))) return i - 1
    return -1
  }

  // ==========================================================================
  // ★ 卡顿看门狗（第 55 轮）：用户反馈「图鉴切快了会直接卡住 / 点什么都不动」
  //
  // 为什么要有：图鉴的性能我离线量过 —— 单次切页签 0.025 ms、300 次连续切+渲染 60 ms，
  //   **都不是算得慢**。所以"卡住"要么是某帧做了别的事（图片解码/绘制），
  //   要么是输入状态卡住 —— 这两种都只能靠**运行期实测**定位，读代码猜不出来。
  // 做法：记录每帧耗时；超阈值就把"卡帧"记进环形缓冲，并可显示在画面上（F3）。
  // 注意 PERF 必须留在**启动流程之外**：调试接口 `__DKDbb_DEBUG__.perf()` 直接读它，
  //   放进启动函数里会报 `PERF is not defined`（实测踩过）。
  //   （启动流程本身已迁到 `game/boot.js` 的 `start()`；PERF 与调试出口一起留在本文件。）
  // ==========================================================================
  const PERF = { lastFrame: 0, slowCount: 0, worst: 0, worstWhat: '', recent: [], frames: 0, fpsAcc: 0, fps: 0 }
  const SLOW_MS = 120
  function perfMark(now) {
    if (!PERF.lastFrame) { PERF.lastFrame = now; return }
    const ms = now - PERF.lastFrame
    PERF.lastFrame = now
    PERF.frames++
    PERF.fpsAcc += ms
    if (PERF.fpsAcc >= 500) { PERF.fps = Math.round(1000 / Math.max(1, PERF.fpsAcc / PERF.frames)); PERF.fpsAcc = 0; PERF.frames = 0 }
    if (ms > SLOW_MS) {
      PERF.slowCount++
      const what = `${S.mode}${S.mode === 'zukan' && S.zukan ? '/tab' + S.zukan.tab + '/p' + S.zukan.page : ''}`
      if (ms > PERF.worst) { PERF.worst = Math.round(ms); PERF.worstWhat = what }
      PERF.recent.push({ ms: Math.round(ms), what, t: Date.now() })
      if (PERF.recent.length > 20) PERF.recent.shift()
      // 同时打到 console —— 玩家反馈卡顿时，把 console 截个图即可
      try { console.warn(`[卡帧] ${Math.round(ms)} ms  mode=${what}`) } catch { }
    }
  }
  function perfText() {
    if (!S.showPerf) return null
    return `FPS ${PERF.fps || '-'}　卡帧 ${PERF.slowCount} 次　最慢 ${PERF.worst} ms (${PERF.worstWhat || '-'})`
  }



  // 主循环 + 事件绑定已迁到 game/boot.js：把 game.js 的内部符号交给它。
  G.game = { update, draw, syncToolbar, toggleDifficulty, perfMark, openSkillPanel }
  G.boot.start(G.game)

  // 调试出口：只读，供 _tools 下的无头测试台检查状态。
  // 不影响游戏逻辑；浏览器控制台里也能用它排查。
  window.__DKDbb_DEBUG__ = {
    get state() { return S },
    get spawns() { return S.current ? sceneSpawns(S.current) : null },
    // 场景 NPC 清单（第 46 轮加）。**为什么必须暴露**：
    // 第 40 轮修过"NPC 太多 / 撞衫 / 乱跑"，第 46 轮又发现"第 7 个人被摆到画面外" ——
    // 三次都出在 NPC 上，而在此之前**没有任何断言看过 NPC 的数量、造型、坐标**，
    // 只能靠人再玩一次才发现。暴露出来，check-scene-npc.mjs 才能逐场景核对。
    sceneNpcs: (id) => {
      const sc = id ? (S.scenes && S.scenes[id]) : S.current
      if (!sc) return null
      return sceneSpawns(sc).npcs.map((n) => ({
        name: n.name,
        x: n.x, y: n.y,
        entrance: !!(n.quest || n.shop || n.dungeonGate || n.treasure || n.miniGate || n.costumeShop || n.heal),
        official: !!n.official,
        costume: n.costume ? n.costume.name : null,
      }))
    },
    // NPC 排布实现（界面与测试共用同一份，别在测试里重算列数）
    npcLayout: (n) => npcPositions(n),
    // ── 画布几何登记表（第 46 轮 · R14「视觉断言化」）──
    // 【为什么需要】ui-overlap.mjs 只扫**它自己注册过的面板矩形**，而"直接画在画布上的东西"
    // 不在它的视野里 —— 于是三次视觉事故都是靠人看图才发现：
    //   帮助面板画到屏幕外（第 43 轮）· 小游戏规则行左右溢出（第 44 轮）· 服饰货架被页脚压住（第 45 轮）。
    // 这里把各个界面**算出来的**矩形交出来（不是抄死的坐标：坐标改了它会跟着变），
    // 测试就能断言"全部落在 [0,W]×[0,H] 之内"，把肉眼检查变成会红的断言。
    uiBBoxes: () => {
      const out = []
      const put = (name, x, y, w, h) => {
        if ([x, y, w, h].some((v) => typeof v !== 'number' || !isFinite(v))) return
        out.push({ name, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) })
      }
      const tryIt = (name, fn) => { try { fn() } catch (e) { out.push({ name, error: String(e && e.message || e) }) } }

      // 主菜单标题项（改版式时最容易有一项掉出画面）
      tryIt('title-menu', () => {
        for (const r of titleMenuLayout().items()) put('title:' + r.label, r.x, r.y, r.w, r.h)
      })
      // 操作说明：**逐行**交出矩形（第 43 轮就是最后 4 行画到画面外）
      tryIt('help-rows', () => {
        const L = helpLayout()
        const rows = HELP_ROWS.length
        const perCol = L.perCol
        for (let i = 0; i < rows; i++) {
          const col = Math.floor(i / perCol), r = i % perCol
          put('help:' + i, L.x0 + col * (L.colW + L.gap), L.top + r * L.lineH, L.colW, L.lineH)
        }
      })
      // 背包 / 图鉴 / 战报 / 战斗指令 / 技能网格
      tryIt('bag', () => { for (const r of bagLayout().rects) put('bag:' + (r.name || r.i), r.x, r.y, r.w, r.h) })
      tryIt('zukan', () => { for (const r of zukanLayout().rects) put('zukan:' + (r.e && r.e.name || r.idx), r.x, r.y, r.w || 0, r.h || 0) })
      // 战报任务：**只登记当前页**（绘制用的是 pageTasks —— 一眼登记全部 66 条会算出
      // 根本不会画出来的矩形，第 46 轮第一版就这么误报过一次：war:16 在 y=592）
      tryIt('war', () => {
        const tasks = warTasks()
        const per = WAR_PER_PAGE
        const pages = Math.max(1, Math.ceil(tasks.length / per))
        const page = Math.min(Math.max(S.warPage || 0, 0), pages - 1)
        const pageTasks = tasks.slice(page * per, (page + 1) * per)
        for (const [i, r] of warLayout(pageTasks).entries()) put('war:' + i, r.x, r.y, r.w, r.h)
      })
      tryIt('battle-cmd', () => { if (S.battle) for (const r of battleLayout(S.battle).cmdRects) put('cmd:' + r.label, r.x, r.y, r.w, r.h) })
      tryIt('battle-skill', () => { if (S.battle) for (const r of battleLayout(S.battle).skillRects) put('skill:' + (r.name || r.i), r.x, r.y, r.w, r.h) })
      return out
    },
    get menu() { return M.menu },
    get walkBounds() { return walkBounds() },
    // 把界面布局暴露出去，测试就能"问游戏"而不是把坐标抄死在测试里
    // （操作栏从右侧四连按钮改成原版六方格那次，写死坐标的测试全红了）
    cmdRects: () => (S.battle ? battleLayout(S.battle).cmdRects : []),
    skillRects: () => (S.battle ? battleLayout(S.battle).skillRects : []),
    bagRects: () => bagLayout().rects,
    // 按名字选指令，省得测试自己去数下标（数错过一次：把「逃跑」当成了「道具」）
    selectCommand: (label) => {
      if (!S.battle) return -1
      const r = battleLayout(S.battle).cmdRects.find((x) => x.label === label)
      if (!r) return -1
      S.battle.menuSel = r.i
      return r.i
    },
    openActorMenu: openActorMenu,
    playQuest: playQuest,
    startBattle: startBattle,
    // 难度自证：拿**真实战斗里的我方/敌方**算期望伤害（不含命中与暴击的随机）。
    // 测试据此断言"简单模式打得更痛、挨得更少"，而不是去抄倍率常量 —— 抄常量的话
    // 改倍率时测试会跟着一起改，等于没测。
    damageProbe: () => {
      const b = S.battle
      if (!b || !b.player || !b.enemies || !b.enemies.length) return null
      const p = b.player, e = b.enemies[b.target || 0]
      if (!e) return null
      const sk = D.SKILLS[(save.data.skills || [])[0]] || null
      return {
        skill: sk ? sk.name : null,
        playerDeals: expectedDamage(p, e, sk),
        enemyDeals: expectedDamage(e, p, sk),
      }
    },
    // 攻击动作：形态立绘是单张静态图，动作是程序化补出来的，
    // 所以把动作曲线本身和"本帧实际用的姿态"暴露出来，测试才能断言真的动了。
    attackPose: attackPose,
    get playerPose() { return S._playerPose || null },
    // 主菜单 / 存档槽（测试用：让测试能驱动菜单而不是靠死坐标点击）
    get titleMenu() { return titleState() },
    titleAction: (id) => titleAction(id),
    // ── 起名字（第 54 轮）──
    beginRename: (kind, formName) => beginRename(kind, formName),
    applyRename: (value, formName) => applyRename(value, formName),
    currentNameOf: (kind, formName) => currentNameOf(kind, formName),
    displayNameOf: (formName) => displayNameOf(formName),
    playerCostume: () => playerCostume(),
    // 测试用：强制"造型取不到"，逼出合成走路帧的回退路径（null = 没有造型；undefined = 恢复）
    setPlayerCostumeOverride: (v) => { __costumeOverride = v === undefined ? undefined : v; return true },
    writeToSlot: (n) => writeToSlot(n),
    titleItems: () => TITLE_ITEMS.map((it) => ({ id: it.id, label: titleItemLabel(it) })),
    titleMenuLayout: () => titleMenuLayout(),
    // 操作说明的版式（第 43 轮）：以前是写死行高的一列，加到 18 行时最后 4 行已经画到
    // 屏幕外了却没人发现。暴露出来让测试断言"全部行都在画面内"。
    helpRows: () => HELP_ROWS.map((r) => r.slice()),
    helpLayout: () => helpLayout(),
    enterWorld: () => enterWorldFromMenu(),
    applySave: () => applySaveToRuntime(),
    listSlots: () => save.listSlots(),
    useSlot: (n) => save.useSlot(n),
    saveToSlot: (n) => save.saveToSlot(n),
    deleteSlot: (n) => save.deleteSlot(n),
    newGame: (n) => save.newGame(n),
    currentSlot: () => save.slot(),
    // 七大地形与通道图（界面与测试共用同一份实现，避免两边算法不一致）
    routeTo: (a, b) => routeTo(a, b),
    linksOf: (id) => linksOf(id),
    districtOf: (id) => districtOfIsland(id),
    // 立绘取图接口（走路帧测试要直接问它）
    art: () => art,
    // ── 形态获取途径（第 52 轮）──
    formSource: (name) => {
      const f = D.FORMS.find((x) => x.name === name) || D.FORMS.find((x) => x.name === name + ' 多比')
      return f && D.formSource ? Object.assign({ name: f.name }, D.formSource(f, { save })) : null
    },
    formSources: () => D.FORMS.map((f) => Object.assign({ name: f.name }, D.formSource(f, { save }))),
    formExchangeStock: () => (D.formExchangeStock ? D.formExchangeStock({ save }) : []),
    dungeonFormDrop: () => Object.assign({}, D.DUNGEON_FORM_DROP || {}),
    finishDungeon: () => finishDungeon(),
    treasureBuy: (goods) => treasureBuy(goods),
    openTreasure: () => { S.mode = 'treasure'; return true },
    treasureTab: (i) => { TREASURE.tab = i; TREASURE.sel = 0; TREASURE.page = 0; return true },
    treasureSetPage: (p) => { TREASURE.page = util.clamp(p | 0, 0, treasurePageInfo().pages - 1); TREASURE.sel = 0; return TREASURE.page },
    treasureTabs: () => TREASURE.tabs.slice(),
    treasurePage: () => ({ tab: TREASURE.tab, sel: TREASURE.sel, page: TREASURE.page || 0, pages: treasurePageInfo().pages, total: treasurePageInfo().total, perPage: TREASURE_PER_PAGE }),
    // 场景级地形归属（M2-2）
    districtOfScene: (sid) => districtOfScene(sid),
    districtOverrides: () => Object.assign({}, (S.world && S.world.districtOverrides) || {}),
    districts: () => ((S.world && S.world.districts) || []).map((d) => ({ id: d.id, name: d.name, islands: d.islands.slice() })),
    enterScene: (sid) => { enterScene(sid, { keepMode: false }); return S.mode === 'explore' },
    routeText: (p) => routeText(p),
    mapGeom: () => mapGeom(),
    // 图鉴（界面与测试共用同一份实现）
    zukanTabs: () => ZUKAN.tabs.slice(),
    zukanEntries: (tab) => zukanEntries(tab == null ? zukanState().tab : tab),
    zukanLayout: () => zukanLayout(),
    // 战报任务（M4 周边系统）—— 界面、测试、脚本共用同一份实现
    warTarget: () => WAR_TARGET,
    warTasks: () => warTasks(),
    warClaim: (t) => warClaim(t),
    warIslandProgress: () => warIslandProgress(),
    warLayout: (ts) => warLayout(ts || []),
    warPages: (ts) => warPages(ts || warTasks()),
    warPerPage: () => WAR_PER_PAGE,
    warButtonRect: () => warButtonRect(),
    warButtonHit: (x, y) => warButtonHit(x, y),
    // 恢复生命 NPC
    healNpcs: () => HEAL_NPCS.slice(),
    healerFor: (sc) => healerFor(sc),
    doHeal: (npc) => doHeal(npc),
    // 副本（M4-1）
    dungeons: () => D.DUNGEONS.map((x) => ({ id: x.id, name: x.name, conf: x.conf, stages: x.stages.length, minLevel: x.minLevel, drop: x.drop })),
    playableDungeons: () => D.playableDungeons().map((x) => x.id),
    dungeonState: () => dungeonState(),
    enterDungeon: (id) => enterDungeon(id),
    // 跳关用：测试要能直接落在某个 kind 的关卡上（例如太空堡垒的 shooter），
    // 否则得先打完前面 4 关才能摸到第 5 关的代码。
    startStage: () => { startDungeonStage(); return dungeonState().phase },
    curStage: () => curStage(),
    pickFlip: (i) => pickFlip(i),
    finishDungeon: () => finishDungeon(),
    flipRects: () => flipRects(),
    dungeonListRects: () => dungeonListRects(D.DUNGEONS),
    dungeonClears: (id) => dungeonClears(id),
    // 副本里的两个新玩法（各有原文依据）
    stealthSpotted: () => stealthSpotted(),
    stealthAdvance: () => stealthAdvance(),
    stealthTick: (dt) => stealthTick(dt),
    moralePlay: (i) => moralePlay(i),
    moraleReset: () => moraleReset(),
    moraleRects: () => moraleRects(),
    moraleMoves: () => MORALE_MOVES.slice(),
    moraleTable: () => MORALE_TABLE.map((r) => r.map((c) => c.slice())),
    stageNames: () => Object.assign({}, DUNGEON_STAGE_NAMES),
    // 白色彩晶石经济 + 珍宝小屋
    // 注意：treasureList() 只在"兑换"页签才有货（合成页是空的），
    // 所以这里给两个接口：stock=货架本身，pageList=当前页签看到的内容
    treasureStock: () => D.treasureStock(),
    treasurePageList: () => treasureList(),
    // ⚠️ 必须走**真实路径** `treasureList()`（已分页），不能拿整份库存算矩形 ——
    //    早先写的是 `treasureRects(D.treasureStock())`，等于绕过分页，
    //    于是 test-treasure 报"兑换页 47 个商品矩形都在屏内"假红（真实界面一页只有 12 件）。
    treasureRects: () => treasureRects(treasureList()),
    treasureTab: () => TREASURE.tab,
    setTreasureTab: (i) => { TREASURE.tab = i | 0 },
    synthesizeCrystal: () => synthesizeCrystal(),
    treasureBuy: (g) => treasureBuy(g),
    rollShardDrop: (o) => rollShardDrop(o),
    // 朝向自证用（第 55 轮）：把绘制函数暴露出来，好让探针"同一只怪画两遍翻转态"对比，
    // 而不是靠人眼在一张小图上猜哪边是脸。
    drawMonsterForProbe: (mon, cx, bottomY, h, opt) => drawMonster(mon, cx, bottomY, h, opt),
    // 素材朝向表（测试要拿它和"战斗里怎么算朝向"对照）
    monsterFacesRight: () => [...MONSTER_ART_FACES_RIGHT],
    monsters: () => (D.MONSTERS || []).map((m) => ({ id: m.id, name: m.name })),
    battlePos: () => ({ player: P_POS, enemy0: E_POS(0), soya: soyaPos() }),
    // 索亚出战单位（第 55 轮）：测试要核"宠物真的能打、且力度弱于主人"
    soyaAttacker: () => { const sy = activeSoya(); return sy ? soyaAttacker(sy) : null },
    // 让测试能替玩家下指令（宠物排在玩家之后，玩家不下指令就永远轮不到宠物）
    playerAct: (kind, arg) => playerAct(kind, arg),
    petActOnce: () => { const b = S.battle; const sy = activeSoya(); if (!b || !sy) return null; const before = b.enemies.map((e) => e.hp); petAct(b, sy); return { before, after: b.enemies.map((e) => e.hp) } },
    leaveBattle: () => leaveBattle(),
    // 配招（第 55 轮）：测试要核"能装、能卸、不超槽位、会存档"
    loadoutOf: (form) => loadoutOf(form || S.form),
    setLoadout: (list) => setLoadout(S.form, list),
    equipSkill: (name) => equipSkill(name),
    unequipSkill: (idx) => unequipSkill(idx),
    skillSlotCount: () => slotCount(S.form),
    // 战斗用的紧凑列表（去掉空槽）—— 测试要核"空槽不会进战斗网格"
    battleSkills: () => battleSkills(S.form),
    // 技能面板入口（顶栏「技能」按钮与 V/K 键共用）——测试要核两条路都通
    openSkillPanel: () => openSkillPanel(),
    // 卡顿统计（第 55 轮）：测试与排查"图鉴切快了卡住"用
    perf: () => ({ fps: PERF.fps, slowCount: PERF.slowCount, worst: PERF.worst, worstWhat: PERF.worstWhat, recent: PERF.recent.slice() }),
    skillIconFile: (name) => (D.skillIconFile ? D.skillIconFile(name) : null),
    // 在线礼包（第 54 轮）：官方原文「达到 10/20/30 分钟得到在线大礼包」
    onlineGiftReady: () => onlineGiftReady().map((g) => g.min),
    claimOnlineGift: () => claimOnlineGift(),
    crystalsToday: () => crystalsToday(),
    // 变身唤醒（唤醒条件是官方数值）
    awakenList: () => awakenList().map((f) => f.name),
    awakenRequire: (name) => D.awakenRequire(D.FORMS.find((f) => f.name === name)),
    awakenMissing: (name) => awakenMissing(D.FORMS.find((f) => f.name === name)),
    canAwaken: (name) => canAwaken(D.FORMS.find((f) => f.name === name)),
    awaken: (name) => awaken(D.FORMS.find((f) => f.name === name)),
    isAwakenable: (name) => D.isAwakenable(D.FORMS.find((f) => f.name === name)),
    awakenRects: () => awakenRects(awakenList()),
    stageGain: () => Object.assign({}, AWAKEN_STAGE_GAIN),
    // 小游戏（名字与规则来自归档 `小游戏截图\`；见 game/tables/minigames.js 与 V52）
    minigames: () => D.MINIGAMES.map((m) => ({
      id: m.id, name: m.name, rule: m.rule, impl: !!m.impl, kind: m.kind,
      conf: m.conf, evidence: m.evidence, note: m.note,
      reward: m.reward ? Object.assign({}, m.reward) : null,
    })),
    playableMinigames: () => D.playableMinigames().map((m) => m.id),
    minigameById: (id) => D.minigameById(id),
    openMinigames: (from) => { MINI.from = from || 'explore'; openMinigames(); return S.mode },
    // 服饰与附魔（第 45 轮，官方系统）
    openCostumeShop: () => { openCostumeShop(); return S.mode },
    costumeStock: () => costumeStock().map((c) => ({
      id: c.id, name: c.name, look: c.look, price: c.price,
      actions: c.anim ? c.anim.all : 0, evidence: c.evidence, conf: c.conf,
    })),
    costumeState: () => ({
      worn: save.data.costumeWorn || null,
      voidCrystal: save.data.voidCrystal || 0,
      // val 用**实时值**（不是存档快照）——界面显示与实际生效必须是同一个数
      owned: Object.keys(save.data.costumes || {}).map((id) => {
        const e = save.data.costumes[id]
        return { id, lv: e.lv, attr: e.attr, val: costumeValue(e), k: e.k }
      }),
    }),
    costumeParams: () => ({
      shop: Object.assign({}, D.COSTUME_SHOP),
      voidCrystal: JSON.parse(JSON.stringify(D.VOID_CRYSTAL)),
      enchant: JSON.parse(JSON.stringify(D.ENCHANT)),
    }),
    buyCostume: (id) => buyCostume(id),
    wearCostume: (id) => wearCostume(id),
    enchantCostume: (id) => enchantCostume(id),
    reEnchantCostume: (id) => reEnchantCostume(id),
    enchantBonus: () => enchantBonus(),
    playerStats: () => playerStats(),
    baseStats: () => baseStats(),
    costumeValue: (id) => costumeValue(save.data.costumes[id]),
    costumeRect: (i) => costumeRowRect(i),
    costumeSel: (i) => { if (typeof i === 'number') COSTUME.sel = i; return COSTUME.sel },
    miniSel: () => MINI.sel,
    setMiniSel: (i) => { MINI.sel = i | 0 },
    miniRects: () => miniLayout().rects,
    miniLayout: () => {
      const L = miniLayout()
      return { perPage: L.perPage, page: L.page, pages: L.pages, rows: L.rows, cols: MINI_PANEL.cols, total: L.list.length, rects: L.rects }
    },
    startMinigame: (id) => startMinigame(id),
    finishMinigame: () => finishMinigame(),
    miniStagePass: () => miniStagePass(),
    miniPlays: () => Object.assign({}, save.data.miniPlays || {}),
    miniFrom: () => MINI.from || null,
    // 「魔法工匠」3×3 滑动宝石
    slideMove: (i) => slideMove(i),
    slideMoveDir: (dx, dy) => slideMoveDir(dx, dy),
    slideSolved: () => slideSolved(dungeonState().slide),
    slideRect: (i) => slideRect(i),
    slideCells: () => { const p = dungeonState().slide; return p ? p.cells.slice() : null },
    magicRecipe: () => (D.MAGIC_RECIPE || []).map((r) => r.slice()),
    // 「思维方块」四连消除
    blocksMove: (dx, dy) => blocksMove(dx, dy),
    blocksRotate: () => blocksRotate(),
    blocksTick: (dt) => blocksTick(dt),
    blocksReset: () => blocksReset(),
    blocksState: () => {
      const b = dungeonState().bl
      if (!b) return null
      return {
        grid: b.grid.map((r) => r.slice()), cols: b.cols, rows: b.rows, kinds: b.kinds,
        need: b.need, lines: b.lines, target: b.target, over: b.over,
        piece: b.piece ? { cx: b.piece.cx, cy: b.piece.cy, dir: b.piece.dir, kind: b.piece.kind } : null,
      }
    },
    // 把某一行直接摆成同一颜色，用来验证"四个以上相同就消除"这条官方判定
    blocksFillRow: (r, kind) => {
      const b = dungeonState().bl
      if (!b || r < 0 || r >= b.rows) return false
      for (let c = 0; c < b.cols; c++) b.grid[r][c] = kind
      return true
    },
    blocksRunCount: () => blocksRuns(dungeonState().bl).size,
    // 消行并计数（与 blocksLock 里那段一致）—— 界面与测试共用同一份行为
    blocksSettle: () => {
      const b = dungeonState().bl
      const n = blocksClear(b)
      if (n) b.lines += n
      return n
    },
    blocksClear: () => blocksClear(dungeonState().bl),
    blocksCellRect: (r, c) => blockCellRect(r, c),
    blocksRuns: () => [...blocksRuns(dungeonState().bl)],
    // 「多比快跑」
    runnerPress: () => runnerPress(),
    runnerJump: () => runnerJump(),
    runnerTick: (dt) => runnerTick(dt),
    runnerReset: () => runnerReset(),
    runnerState: () => {
      const r = dungeonState().rn
      if (!r) return null
      return {
        dist: r.dist, speed: r.speed, boost: r.boost, y: r.y, air: r.air,
        gems: r.gems, need: r.need, hits: r.hits, over: r.over, presses: r.presses,
        itemCount: r.items.length,
        next: (r.items.find((x) => !x.got) || null),
      }
    },
    runnerItems: () => dungeonState().rn.items.map((x) => Object.assign({}, x)),
    runConst: () => ({ base: RUN_BASE, boost: RUN_BOOST, max: RUN_MAX, jump: RUN_JUMP, grav: RUN_GRAV }),
    minigameMultiplayer: () => JSON.parse(JSON.stringify(D.MINIGAME_MULTIPLAYER || {})),
    blockParams: () => Object.assign({}, D.BLOCKS || {}),
    runnerParams: () => Object.assign({}, D.RUNNER || {}),
    // 「拯救多比古书」（平台跳跃）
    platformerTick: (dt) => platformerTick(dt),
    platformerJump: () => platformerJump(),
    platformerReset: () => platformerReset(),
    platformerState: () => {
      const p = dungeonState().pf
      if (!p) return null
      return {
        x: p.x, y: p.y, vy: p.vy, onGround: p.onGround, face: p.face,
        got: p.got, need: p.need, hits: p.hits, over: p.over,
        invuln: p.invuln,
        books: p.books.map((b) => ({ x: b.x, y: b.y, got: b.got })),
        spirits: p.spirits.map((s) => ({ x: s.x, y: s.y, r: s.r })),
        plats: p.plats.map((g) => ({ x: g.x, y: g.y, w: g.w, h: g.h })),
      }
    },
    platformerParams: () => Object.assign({}, D.PLATFORMER || {}),
    // 「王牌大空战」（蓄力射击）
    chargeShooterTick: (dt) => chargeShooterTick(dt),
    chargeShooterReset: () => chargeShooterReset(),
    chargeShooterState: () => {
      const g = dungeonState().cs
      if (!g) return null
      return {
        x: g.x, y: g.y, charging: g.charging, charge: g.charge, holdSec: g.holdSec,
        shots: g.shots.map((s) => ({ x: s.x, y: s.y, r: s.r, powered: s.powered })),
        // mon 只投影**名字字符串**（叶子字段），不把怪物对象本身递出去
        foes: g.foes.map((f) => ({ x: f.x, y: f.y, r: f.r, hp: f.hp, big: f.big, mon: f.mon ? f.mon.name : null })),
        killed: g.killed, miss: g.miss, need: g.need, maxMiss: g.maxMiss, over: g.over,
      }
    },
    chargeShooterParams: () => Object.assign({}, D.CHARGE_SHOOTER || {}),
    // 「滑雪跳台」（平衡 → 起跳 → 进圈按键）
    skiTick: (dt) => skiTick(dt),
    skiReset: () => skiReset(),
    skiConst: () => Object.assign({}, SKI),
    skiPass: () => skiPass(),
    // 难度（第 43 轮）
    difficulty: () => diff().id,
    difficultyInfo: () => Object.assign({}, diff()),
    setDifficulty: (id) => setDifficulty(id),
    toggleDifficulty: () => toggleDifficulty(),
    needs: () => ({
      blocks: needOf((D.BLOCKS || {}).target || 4),
      runner: needOf((D.RUNNER || {}).need || 12),
      platformer: needOf((D.PLATFORMER || {}).need || 5),
      chargeshooter: needOf((D.CHARGE_SHOOTER || {}).need || 8),
      notes: needOf(8),
      flycatch: needOf((D.FLYCATCH || {}).passLevels || 3),
      skiPass: skiPass(),
      shooterNeed: (function () {
        const d = (D.DUNGEONS || []).find((x) => (x.stages || []).some((s) => s.kind === 'shooter'))
        const s = d && d.stages.find((x) => x.kind === 'shooter')
        return needOf((s && s.need) || 5)
      })(),
    }),
    needOf: (base) => needOf(base),
    winOf: (base) => winOf(base),
    skiState: () => {
      const s = dungeonState().ski
      if (!s) return null
      return {
        phase: s.phase, balance: s.balance, pointer: s.pointer, ring: s.ring, want: s.want,
        jump: s.jump, quality: s.quality, trick: s.trick, total: s.total,
        stumbles: s.stumbles, over: s.over, t: s.t,
      }
    },
    skiSet: (o) => { const s = dungeonState().ski; if (!s) return false; Object.assign(s, o || {}); return true },
    // 「魔幻音符」（左右键移动手指、下键弹奏）
    notesTick: (dt) => notesTick(dt),
    // 「飞翔的衣服」（官方攻略 7k7k/534823）
    flyCatchState: () => {
      const g = dungeonState().fc
      if (!g) return null
      return {
        level: g.level, caught: g.caught, count: g.count, total: g.total,
        left: g.clothes.filter((c) => !c.got).length,
        timeLeft: g.timeLeft, cleared: g.cleared, fails: g.fails,
        passLevels: g.passLevels, over: g.over, radMul: g.radMul,
        nets: g.nets.map((n) => ({ x: n.x, y: n.y, t: n.t, closed: n.closed, got: n.got })),
        clothes: g.clothes.map((c) => ({ x: c.x, y: c.y, vx: c.vx, vy: c.vy, r: c.r, got: c.got })),
      }
    },
    flyCatchTick: (dt) => flyCatchTick(dt),
    flyCatchCast: (x, y) => flyCatchCast(x, y),
    flyCatchReset: () => { flyCatchReset(); return true },
    flyCatchParams: () => Object.assign({}, D.FLYCATCH || {}),
    flyCatchArena: () => fcArena(),
    // ── 大陆棋（第 51 轮，官方攻略 558658/558684/558700 重做）──
    sumoState: () => {
      const g = dungeonState().su
      if (!g) return null
      return {
        mapId: g.mapId, mapName: g.mapName, turn: g.turn, moves: g.moves,
        over: g.over, win: g.win, msg: g.msg,
        aiming: g.aiming ? Object.assign({}, g.aiming) : null,
        units: g.units.map((u) => ({
          uid: u.uid, side: u.side, typeId: u.typeId, typeName: u.typeName, name: u.name,
          hp: u.hp, maxHp: u.maxHp, alive: u.alive, x: u.x, y: u.y, vx: u.vx, vy: u.vy,
          power: u.power, defense: u.defense, weight: u.weight, move: u.move,
          cooldown: u.cooldown, actAt: u.actAt, artMissing: !!u.artMissing,
        })),
        obstacles: g.obstacles.map((o) => ({ x: o.x, y: o.y, r: o.r, kind: o.kind, hp: o.hp, broken: o.broken })),
        waves: g.waves.map((w) => ({ x: w.x, y: w.y, kind: w.kind, side: w.side, life: w.life })),
      }
    },
    sumoParams: () => JSON.parse(JSON.stringify(D.SUMO)),
    sumoMaps: () => D.SUMO.maps.map((m) => ({ id: m.id, name: m.name, w: m.w, h: m.h, river: m.river, bridge: m.bridge, obstacleCount: m.obstacleCount, rule: m.rule })),
    sumoRoster: (side) => {
      const g = dungeonState().su
      if (!g) return null
      return g.units.filter((u) => !side || u.side === side)
        .map((u) => ({ uid: u.uid, side: u.side, typeId: u.typeId, name: u.name, artMissing: !!u.artMissing }))
    },
    sumoTick: (dt) => sumoTick(dt),
    // ── 晶石对战（第 57 轮）：规则模块 D.CRYSTAL / D.crystalBoard 是纯函数，测试可直接跑 ──
    crystalTick: (dt) => crystalTick(dt),
    crystalClick: (x, y) => crystalClick(x, y),
    crystalResolve: (g, cleared) => crystalResolve(g, cleared),
    // 直接进一关（测试要能一键进到某个副本的某个关卡）
    startDungeon: (id) => {
      const d = D.dungeonById(id)
      if (!d) return null
      S.dungeon = { id: d.id, idx: 0, tries: 0 }
      S.mode = 'dungeon'
      startDungeonStage()
      return { id: d.id, phase: (dungeonState() || {}).phase }
    },
    dungeonById: (id) => D.dungeonById(id),
    // 开始**当前指针指向的那一关**（测试要能逐段验证副本里的每一关，而不是只能从第一关进）
    startDungeonStage: () => { startDungeonStage(); return dungeonState() },
    crystalBoardRect: () => crystalBoardRect(),
    crystalTurn: () => { const st = dungeonState(); if (st && st.cr) crystalTurn(st.cr); return st && st.cr },
    crystal: () => { const st = dungeonState(); return st && st.cr ? st.cr : null },
    sumoReset: (mapId) => sumoReset(mapId),
    sumoNext: () => {
      const u = sumoNextUnit()
      return u ? { uid: u.uid, side: u.side, name: u.name, typeId: u.typeId, cooldown: u.cooldown, actAt: u.actAt } : null
    },
    sumoStartAim: (uid) => sumoStartAim(uid),
    sumoSetAim: (dx, dy, p) => sumoSetAim(dx, dy, p),
    sumoRotateAim: (d) => sumoRotateAim(d),
    sumoPowerAim: (d) => sumoPowerAim(d),
    sumoFire: () => sumoFire(),
    sumoInRiver: (x, y) => sumoInRiver(x, y),
    sumoView: () => sumoView(),
    // ── 第 47 轮新增的两个小游戏（界面、测试、自动试玩机器人读同一份状态）──
    // 「哈里的金币」（官方攻略 7k7k/660617）
    coinCatchState: () => {
      const g = dungeonState().cc
      if (!g) return null
      return {
        x: g.x, y: g.y, got: g.got, dropped: g.dropped, level: g.level,
        over: g.over, msg: g.msg,
        coins: g.coins.map((c) => ({ x: c.x, y: c.y, r: c.r, got: c.got, miss: c.miss })),
      }
    },
    coinCatchTick: (dt) => coinCatchTick(dt),
    coinCatchReset: () => { coinCatchReset(); return true },
    coinCatchParams: () => Object.assign({}, D.COINCATCH || {}),
    coinCatchArena: () => miniArena(),
    // 「魔镜世界」（官方攻略 7k7k/660928 + 660934）
    mirrorState: () => {
      const g = dungeonState().mr
      if (!g) return null
      return {
        px: g.px, py: g.py, r: g.r, hasKey: g.hasKey, opened: g.opened,
        timeLeft: g.timeLeft, over: g.over, msg: g.msg, hurtT: g.hurtT, fails: g.fails,
        exit: { x: g.exit.x, y: g.exit.y, w: g.exit.w, h: g.exit.h, open: g.exit.open },
        crates: g.crates.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h, opened: c.opened, hasKey: c.hasKey })),
        mons: g.mons.map((m) => ({ x: m.x, y: m.y, r: m.r, dir: m.dir })),
      }
    },
    mirrorTick: (dt) => mirrorTick(dt),
    mirrorReset: () => { mirrorReset(); return true },
    mirrorParams: () => Object.assign({}, D.MIRROR || {}),
    mirrorArena: () => miniArena(),
    // ── 第 48 轮：冲上云霄 / 极限顶顶球 ──
    soarState: () => {
      const g = dungeonState().sr
      if (!g) return null
      return {
        x: g.x, y: g.y, vy: g.vy, score: g.score, jumped: g.jumped, target: (D.SOAR || {}).target || 50000,
        timeLeft: g.timeLeft, over: g.over, fails: g.fails, msg: g.msg, onBubble: !!g.onBubble,
        t: g.t, landedAt: g.landedAt,
        // 脚下那个泡泡的中心与半径（机器人/测试要在泡泡顶面范围内对准，而不是盲目横移掉下去）
        bubbleX: g.onBubble ? g.onBubble.x : null,
        bubbleR: g.onBubble ? g.onBubble.r : null,
        // 当前站立的落脚面（脚底高度）：地面或最后一次踩到的泡泡顶面。
        // 引擎自己报，比让机器人拿"玩家中心 y"去猜准得多（第 49 轮的坑就在这儿）。
        standTop: g.standTop,
        // 暴露**玩家上方最近的 60 个**未用泡泡（不是数组开头 12 个 —— 那是**最低**的一批，
        // 机器人会盯上一个横向够不到的、然后原地顶着墙不动。第 48 轮实测踩到）
        bubbles: g.bubbles.filter((b) => !b.used && b.y < g.y + 40)
          .sort((a, b) => b.y - a.y).slice(0, 60).map((b) => ({ x: b.x, y: b.y, r: b.r })),
        usedCount: g.bubbles.filter((b) => b.used).length,
        geese: g.geese.map((o) => ({ x: o.x, y: o.y, dir: o.dir })),
      }
    },
    soarTick: (dt) => soarTick(dt),
    soarReset: () => { soarReset(); return true },
    soarParams: () => Object.assign({}, D.SOAR || {}),
    // 诊断用：直接看梯子生成器的输出（第 58 轮查"为什么只有 20 层"）
    soarLadder: () => soarLadder(),
    ballPushState: () => {
      const g = dungeonState().bp
      if (!g) return null
      return {
        ball: { x: g.ball.x, y: g.ball.y, vx: g.ball.vx, vy: g.ball.vy, r: g.ball.r },
        me: { x: g.me.x, y: g.me.y, vy: g.me.vy, onGround: g.me.onGround },
        ai: { x: g.ai.x, y: g.ai.y, vy: g.ai.vy, onGround: g.ai.onGround },
        scoreMe: g.scoreMe, scoreAi: g.scoreAi, timeLeft: g.timeLeft, over: g.over, msg: g.msg,
      }
    },
    ballPushTick: (dt) => ballPushTick(dt),
    ballPushReset: () => { ballPushReset(); return true },
    ballPushParams: () => Object.assign({}, D.BALLPUSH || {}),
    notesReset: () => notesReset(),
    notesState: () => {
      const n = dungeonState().nt
      if (!n) return null
      return {
        finger: n.finger, lanes: n.lanes, t: n.t, hits: n.hits, miss: n.miss, need: n.need,
        combo: n.combo, bestCombo: n.bestCombo, over: n.over,
        list: n.list.map((x) => ({ lane: x.lane, at: x.at, hit: x.hit, missed: x.missed })),
      }
    },
    noteConst: () => Object.assign({}, NOTE),
    notesSet: (o) => { const n = dungeonState().nt; if (!n) return false; Object.assign(n, o || {}); return true },
    spawnFoe: (o) => {
      const g = dungeonState().cs
      if (!g) return false
      g.foes.push(Object.assign({ x: W / 2, y: 100, big: false, hp: 1, vy: 0, r: 15 }, o || {}))
      return true
    },
    // 激流勇进 / 玛丽娜的考试
    currentTick: (dt) => currentTick(dt),
    quizRects: () => quizRects(),
    quizAnswer: (i) => quizAnswer(i),
    quizNext: () => quizNext(),
    quizBank: () => D.DUNGEON_QUIZ,
    // 连接能量管线 / 驾驶超级战机
    pipeRotate: () => pipeRotate(),
    pipeConnected: () => pipeConnected(dungeonState().pipe),
    pipeRect: (i) => pipeRect(i),
    pipeSolution: () => Object.keys(PIPE_SOLUTION),
    pipeBits: (i) => { const c = dungeonState().pipe.cells[i]; return pipeRotateBits(PIPE_SHAPES[c.shape], c.rot) },
    shooterTick: (dt) => shooterTick(dt),
    shooterHit: (x, y) => shooterHit(x, y),
    dayKey: () => dayKey(),
    bossTierIds: () => [...D.bossTierIds()],
    grantAttr: (d) => grantAttr(d),
    attrNames: () => Object.assign({}, ATTR_NAMES),
    // 场景互通（同一座岛内走到边缘换场景）—— 界面与测试共用同一份实现
    sceneExits: (id) => sceneExits(id == null ? (S.current ? S.current.id : null) : id),
    sceneExitRects: () => sceneExitRects(),
    gotoScene: (id, side) => gotoScene(id, side),
    // 小怪刷新（界面与测试共用）
    refreshSpawns: (force) => refreshSpawns(S.current, force),
    respawnSec: () => RESPAWN_SEC,
    get spawnState() {
      const sp = S.current && S.current._spawns
      if (!sp || !sp.monsters) return []
      const now = performance.now() / 1000
      return sp.monsters.map((m) => ({
        alive: !!m.alive,
        respawnIn: m.alive || m.respawnAt == null ? 0 : Math.max(0, m.respawnAt - now),
      }))
    },
    // 出手顺序（官方：速度决定谁先进入回合）—— 界面与测试共用同一份实现
    get turnOrder() {
      const b = S.battle
      if (!b) return null
      return {
        idx: b.turnIdx || 0,
        list: (b.turnOrder || []).map((s) => ({ side: s.side, spd: s.spd, name: s.name || '玩家' })),
      }
    },
    buildTurnOrder: () => (S.battle ? buildTurnOrder(S.battle) : []),
    // 伤害试算（期望值，不含暴击/命中随机）—— 与 damage() 共用同一份公式，
    // 测试可以据此比较"改魔攻/改属性前后"，不必真打几十场看统计
    calcDamage: (attacker, defender, skill) => expectedDamage(attacker, defender, skill),
    channelOf: (skill) => channelOf(skill),
  }
})()
