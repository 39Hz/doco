/* 多克多比 · 顶层编排：主更新与输入分发（第 72 轮重构 · 批次 9 · update(dt)）
   来源：原 game/game.js 的 update(dt) 整段（主更新 + 全部模式的输入分发，22 个模式分支）
   与命中测试工具 rectHit。
   —— **顶层模块（与 boot.js 同级）**：它同时查询界面层布局（G.ui.*）与推进应用层状态（G.app.*），
      按方案第 2 节的分层图，只有装配级（boot.js 这一层）能同时看见两层，故不放 app/ 也不放 ui/。
   依赖：引擎 window.DKDbb（input / util / text / anim / art / save / audio）+ window.DKDbbMouse（M）
        + window.DKDbbData（D）+ window.DKDbbQuest（Q）+ window.DKDbbFx（FX）
        + 内核 G.core（S / ctx / W / H / toast）+ 界面层 G.ui.* + 应用层 G.app.*（含 battleGeom 的结印方向）。
   只经 G.input 出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'
  const E = window.DKDbb, D = window.DKDbbData, Q = window.DKDbbQuest, M = window.DKDbbMouse, FX = window.DKDbbFx
  const { input, util, text, anim, art, save, audio } = E
  const G = window.DKDbbGame
  const toast = G.core.toast
  // 仍在 game.js 的两个「动作」入口（只改 S.mode + 播 SFX），经现成桥惰性取用。
  const openTreasure = () => G.app.openTreasure()
  const openAwaken = () => G.app.openAwaken()

  // ---- 解构 shim（与 game.js 顶部同一套；本模块在 ui/app 之后加载，故可加载期解构）----
  const { cvs, ctx, W, H, S } = G.core
  const { channelOf, atkOf, defOf, defFactor, elementFitMul, speedMultiplier } = G.domain.battleMath
  const { SEAL_MAX_SP, SEAL_STEPS, SEAL_STEP_DUR, sealMultiplier } = G.domain.seal
  const { MORALE_MOVES, MORALE_TABLE } = G.domain.dungeonRules
  const { roundBox, drawBar, drawOrigPanel, drawOrigBtn, drawBattleNameplate } = G.ui
  const { playerActionIsSelfCast, attackPose, drawFigure, drawCostumeFigure,
    drawGroundShadow, drawFigureWalking, drawArtPortrait, drawBackground, drawSpPips } = G.ui
  const { flipRects, dungeonListRects, drawDungeon, moraleRects } = G.ui
  const { placesLayout, drawPlaces } = G.ui
  const { ZUKAN, zukanState, zukanEntries, zukanLayout, drawZukan } = G.ui
  const { battleLayout, battleConfirm, battleEnemyHitTest, drawBattleMsgAndButtons,
    drawSealUI, drawTurnOrder, drawBattle } = G.ui
  const { districtOfIsland, districtOfScene, linksOf, routeTo, routeText, mapGeom,
    worldmapIslandAt, drawWorldMap } = G.ui
  const { drawExplore } = G.ui
  const { shopLayout, shopSelected, drawShop, costumeRowRect, costumePerPage,
    costumePages, drawCostume } = G.ui
  const { SOYA, soyaLayout, soyaPos, BAG, bagLayout, bagHitTest, bagPagerRects,
    statsButtonHit, drawSoyaPanel, drawBag, drawStats } = G.ui
  const { SKP, openSkillPanel, equipRectList, equipHitTest, skillPanelLayout,
    drawSkillPanel } = G.ui
  const { TITLE_ITEMS, titleItemLabel, titleState, titleMenuLayout, drawTitle,
    HELP_ROWS, helpLayout } = G.ui
  const { crystalBoardRect, drawCrystalStage } = G.ui
  const { dialogOptionRects, drawDialog, questRowHit, drawQuestList,
    WAR, warLayout, WAR_PER_PAGE, warPages, warButtonRect, warButtonHit, drawWarReport,
    drawTreasure, awakenRects, drawAwaken, MINI_PANEL, miniLayout, drawMinigames,
    drawPick, drawResult } = G.ui
  const { beginRename, applyRename, currentNameOf, displayNameOf, wireNameInput } = G.app.rename
  const { WAR_TARGET, warTasks, warTaskText, warClaim, warIslandProgress } = G.app.warreport
  const { TREASURE_DAILY, SHARDS_PER, dayKey, rollCrystalDay, crystalsToday, synthesizeCrystal,
    treasureBuy, rollShardDrop, onlineGiftReady, claimOnlineGift, tickOnlineGift,
    TREASURE, TREASURE_PER_PAGE, treasureList, treasurePageInfo, treasureRects } = G.app.economy
  const { AWAKEN_STAGE_GAIN, lockedForms, grantForm, awakenMissing, canAwaken, awaken,
    AWAKEN, AWAKEN_ROWS, awakenList, currentTick, resetCurrentStage, currentStagePass,
    quizAnswer, quizNext, quizRects, PIPE_DIRS, PIPE_SHAPES, pipeRotateBits, PIPE_SOLUTION,
    makePipePuzzle, pipeBitsAt, pipeConnected, pipeRotate, slideRect, pipeRect,
    makeShooter, shooterTick, shooterHit } = G.app.awaken
  const { dungeonState, dungeonClears, SCENE_TOTAL, enterDungeon, curStage, startDungeonStage,
    stealthTick, stealthSpotted, stealthAdvance, moralePlay, moraleReset, dungeonAfterBattle,
    makeFlip, pickFlip, finishDungeon, ATTR_NAMES, grantAttr, LIST_FOOTER_TOP,
    DUNGEON_STAGE_NAMES } = G.app.dungeon
  const { BGM, sceneBgmFor } = G.app.bgm
  const { say, playQuest, advanceDialog, finishDialog } = G.app.dialog
  const { npcPositions, openActorMenu, HEAL_NPCS, healerFor, doHeal } = G.app.npc
  const { RESPAWN_SEC, refreshSpawns, tickRespawns, sceneSpawns } = G.app.spawn
  const { walkBounds, sceneExits, sceneExitRects, sceneLabel, gotoScene, enterScene } = G.app.scene
  const { costumeStock, costumeById, ownedCostumes, wornCostume, costumeValue, enchantBonus,
    playerStats, baseStats, ensureVitals, loadoutOf, slotCount, battleSkills, setLoadout,
    equipSkill, unequipSkill, applySaveToRuntime, grantExp, activeSoya } = G.app.player
  const { makeUnit, skillBlockReason, gainSp, startSeal, sealAdvance, finishSeal, useSkill,
    firstUsableSkill, nextUsableSkill, notice, battleLog, battleBtnAct, doCommand, itemRects,
    performItem, animLen, leaveBattle, startBattle, soyaAtkMul, soyaDefMul, soyaBattleStats,
    soyaAttacker, expectedDamage, damage, applyBuff, perform, petAct, beginAction, tickCooldowns,
    actEnemy, buildTurnOrder, beginRound, advanceTurn, endRound, nextPhase, playerAct,
    checkBattleEnd, battleTick } = G.app.battle
  const { openShop, openCostumeShop, buyItem, buyCostume, wearCostume, enchantCostume,
    reEnchantCostume, COSTUME } = G.app.shop
  const { titleAction, startNewGameIn, enterWorldFromMenu, writeToSlot,
    refreshSlots, hasProgress } = G.app.title
  const { makeCrystal, crystalResolve, crystalTurn, crystalTick, crystalClick } = G.app.crystal
  const { startMinigame, finishMinigame, openMinigames, MINI } = G.app.minigame
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
  const { P_POS, E_POS, MONSTER_ART_FACES_RIGHT, SEAL_ARROWS } = G.app.battleGeom
  const { diff, needOf, winOf, setDifficulty, toggleDifficulty } = G.app.difficulty
  const { bgImage, itemImage, monImage, drawMonster } = G.core

  function rectHit(rects, x, y) {
    for (const r of rects) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        // 卡片类矩形用 idx，战斗按钮类矩形用 i。
        // 之前这里只读 r.i，地点列表的卡片返回 undefined，鼠标就永远点不中。
        const k = r.idx !== undefined ? r.idx : r.i
        return k !== undefined ? k : -1
      }
    }
    return -1
  }

  function update(dt) {
    // ★ 输入清帧的**兜底**放在帧末（`loop` 里 update 返回之后）——见那边的注释。
    //   这里说明为什么需要兜底：本函数有 **39 处 return**，而各分支只在"那条路径"上
    //   自己调 `input.clearFrame()` + `M.endFrame()`（21 处）。任何一条提前 return
    //   都会跳过清帧，后果是：
    //     · `pressed` 里那个键永远挂着 → 下一帧 `once(k)` 仍为真 → 键盘不停触发
    //     · `M.clicked` 永远是 true → **点一下之后"点什么都不动"**（用户反馈的正是这个）
    if (S.toast && performance.now() > S.toast.until) S.toast = null
    // 换场景的过场淡入（纯视觉；顺便用来抑制"连着跳好几张图"）
    if (S.warp) { S.warp.t += dt; if (S.warp.t >= S.warp.dur) S.warp = null }

    if (S.mode === 'title') {
      // ---------- 主菜单输入（键盘 + 鼠标）----------
      const T2 = titleState()
      const rects = T2.view === 'load' ? (S.title.loadRects || [])
        : T2.view === 'confirmNew' ? (S.title.confirmRects || [])
          : T2.view === 'main' ? (S.title.mainRects || []) : []
      const n = T2.view === 'main' ? TITLE_ITEMS.length : rects.length
      const hoverSfx = () => audio.sfx('assets/sfx/onMouseOver_03.mp3')
      // 鼠标是不是这一帧真的动了（和战斗里同一个坑：每帧都改会把键盘选中顶回去）
      const mMoved = M.inside && (M.x !== S._tmx || M.y !== S._tmy)
      if (M.inside) { S._tmx = M.x; S._tmy = M.y }
      let clickedRect = null
      if (M.inside) {
        for (const r of rects) {
          if (M.x >= r.x && M.x <= r.x + r.w && M.y >= r.y && M.y <= r.y + r.h) {
            if (mMoved && T2.sel !== r.i) { T2.sel = r.i; hoverSfx() }
            clickedRect = r
            break
          }
        }
      }
      M.applyCursor(cvs, M.inside && !!clickedRect)

      const goBack = () => {
        if (T2.view === 'main') return
        T2.view = 'main'; T2.sel = 0; T2.msg = ''
        audio.sfx('assets/sfx/onClick_03.mp3')
      }
      const confirm = async () => {
        if (T2.view === 'help' || T2.view === 'about') { goBack(); return }
        if (T2.view === 'main') {
          const it = TITLE_ITEMS[util.clamp(T2.sel, 0, TITLE_ITEMS.length - 1)]
          if (it) await titleAction(it.id)
          return
        }
        if (T2.view === 'newPick') {
          const s = (T2.slots || [])[T2.sel]
          if (!s) return
          if (!s.info) { startNewGameIn(s.slot); return }
          // 槽里有进度 → 再确认一次（不做静默覆盖）
          T2.newSlot = s.slot
          T2.view = 'confirmNew'
          T2.sel = 1        // 默认光标停在「取消」上，避免手滑清档
          return
        }
        if (T2.view === 'confirmNew') {
          if (T2.sel === 0) startNewGameIn(T2.newSlot || save.slot())
          else goBack()
          return
        }
        if (T2.view === 'load') {
          const s = (T2.slots || [])[T2.sel]
          if (!s) return
          if (!s.info) { T2.msg = `存档槽 ${s.slot} 是空的，没法载入`; return }
          await save.useSlot(s.slot)
          T2.msg = ''
          enterWorldFromMenu()
          return
        }
        if (T2.view === 'save') {
          const s = (T2.slots || [])[T2.sel]
          if (!s) return
          // 空槽直接存；已有内容要先确认（避免手滑覆盖别人的档）
          if (s.info && !T2.saveConfirm) { T2.saveConfirm = s.slot; T2.msg = `存档槽 ${s.slot} 已有进度，再按一次空格确认覆盖`; return }
          const ok = await writeToSlot(s.slot)
          T2.saveConfirm = null
          T2.msg = ok ? `已保存到存档槽 ${s.slot}` : `保存失败（存档槽 ${s.slot}）`
          await refreshSlots()
        }
      }

      if (n > 0) {
        if (input.once('ArrowUp') || input.once('w')) { T2.sel = (T2.sel + n - 1) % n; hoverSfx() }
        if (input.once('ArrowDown') || input.once('s')) { T2.sel = (T2.sel + 1) % n; hoverSfx() }
      }
      if (input.once('Escape')) goBack()
      // 读档面板：D / Delete 删除该槽
      if (T2.view === 'load' && (input.once('d') || input.once('D') || input.once('Delete'))) {
        const s = (T2.slots || [])[T2.sel]
        if (s && s.info) {
          save.deleteSlot(s.slot).then(() => {
            T2.msg = `存档槽 ${s.slot} 已删除`
            return refreshSlots()
          }).catch(() => { })
        }
      }
      if (input.once(' ') || input.once('Enter') || (M.clicked && clickedRect)) {
        // 不能写成 .catch(() => {})：那样菜单里任何异常都会被静默吞掉，
        // 表现成"按了没反应"，排查时完全看不到线索（截图流程里就踩到过）。
        confirm().catch((err) => {
          console.error('[主菜单] 动作失败:', err)
          T2.msg = '操作失败：' + (err && err.message ? err.message : String(err))
        })
      }
    } else if (S.mode === 'pick') {
      // 保留选人页作为「背包」复用：见 bag 模式
      const n = D.FORMS.length
      if (input.once('ArrowLeft') || input.once('a')) { S.pickSel = (S.pickSel + n - 1) % n; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
      if (input.once('ArrowRight') || input.once('d')) { S.pickSel = (S.pickSel + 1) % n; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
      // 鼠标：悬停选中，点击确定
      if (M.inside) {
        const CW = 196, GAP = 18
        const total = n * CW + (n - 1) * GAP
        const x0 = W / 2 - total / 2
        for (let i = 0; i < n; i++) {
          const cx = x0 + i * (CW + GAP)
          if (M.x >= cx && M.x <= cx + CW && M.y >= 130 && M.y <= 430) {
            if (S.pickSel !== i) { S.pickSel = i; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
            break
          }
        }
      }
      M.applyCursor(cvs, M.inside && M.y >= 130 && M.y <= 430)
      if (input.once(' ') || input.once('Enter') || M.clicked) {
        const f = D.FORMS[S.pickSel]
        S.form = f
        save.data.form = f.name
        save.data._picked = true
        save.data.maxHp = 0   // 触发重算
        ensureVitals()
        save.persist()
        S.mode = 'worldmap'
        audio.sfx('assets/sfx/onClick_03.mp3')
      }
    } else if (S.mode === 'worldmap') {
      const list = S.world.islands
      if (input.once('ArrowLeft') || input.once('a')) { S.mapSel = (S.mapSel + list.length - 1) % list.length; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
      if (input.once('ArrowRight') || input.once('d')) { S.mapSel = (S.mapSel + 1) % list.length; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
      if (input.once('ArrowUp') || input.once('w')) { S.mapSel = (S.mapSel + list.length - 3) % list.length; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
      if (input.once('ArrowDown') || input.once('s')) { S.mapSel = (S.mapSel + 3) % list.length; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
      // 鼠标：悬停选岛、点击进岛
      const hot = worldmapIslandAt(M.x, M.y)
      if (M.inside) {
        if (hot >= 0 && hot !== S.mapSel) { S.mapSel = hot; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
        M.applyCursor(cvs, hot >= 0)
      }
      if (input.once(' ') || input.once('Enter') || (M.clicked && hot >= 0)) {
        const isl = list[S.mapSel]
        if (!isl.scenes.length) { toast('这座岛还没有可去的地方') }
        else {
          // 不是直达就先把路线说清楚（通道图见 world.js 的 links）
          const fromId = S.current && S.current.island
          const path = fromId ? routeTo(fromId, isl.id) : null
          if (fromId && fromId !== isl.id && path && path.length > 2) {
            notice(`前往 ${isl.name}　${routeText(path)}`, 2000)
          }
          // 原版流程：点岛屿 → 先列出该岛的所有地点 → 再选一个进去
          S.placeSel = 0
          S.placePage = 0
          S.mode = 'places'
          audio.sfx('assets/sfx/onClick_03.mp3')
        }
      }
      if (input.once('Tab')) S.mode = 'title'
    } else if (S.mode === 'places') {
      // ---------- 地点列表（点岛之后）----------
      const isl = S.world.islands[S.mapSel]
      const ids = isl ? isl.scenes : []
      const L = placesLayout(ids)
      const n = ids.length
      if (input.once('ArrowLeft') || input.once('a')) { S.placeSel = (S.placeSel + n - 1) % n; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
      if (input.once('ArrowRight') || input.once('d')) { S.placeSel = (S.placeSel + 1) % n; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
      if (input.once('ArrowUp') || input.once('w')) { S.placeSel = (S.placeSel + n - L.perRow) % n; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
      if (input.once('ArrowDown') || input.once('s')) { S.placeSel = (S.placeSel + L.perRow) % n; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
      if (input.once('q') || input.once('Q')) S.placePage = Math.max(0, S.placePage - 1)
      if (input.once('e') || input.once('E')) S.placePage = Math.min(L.pages - 1, S.placePage + 1)
      if (Math.floor(S.placeSel / L.perPage) !== S.placePage) S.placePage = Math.floor(S.placeSel / L.perPage)
      let hover = -1
      if (M.inside) {
        hover = rectHit(L.rects, M.x, M.y)
        if (hover >= 0 && hover !== S.placeSel) { S.placeSel = hover; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
        M.applyCursor(cvs, hover >= 0)
      } else M.applyCursor(cvs, false)
      const go = () => {
        const id = ids[S.placeSel]
        if (id === undefined) return
        // 进入场景会切换模式，必须立刻清掉本帧的点击，
        // 否则 M.clicked 会残留到下一帧，在探索模式里再触发一次（等于点一下触发两回）
        input.clearFrame(); M.endFrame()
        // 从大地图进来也算重新进图 → 小怪刷新
        enterScene(id, { keepMode: false, refresh: 'force' })
        const sc = S.scenes[id]
        toast(`进入 ${sc ? sc.name : '场景'}`, 1600)
        audio.sfx('assets/sfx/onClick_03.mp3')
      }
      if (input.once(' ') || input.once('Enter') || (M.clicked && hover >= 0)) go()
      if (input.once('Escape') || input.once('Tab')) { S.mode = 'worldmap'; input.clearFrame(); M.endFrame() }
    } else if (S.mode === 'explore') {
      if (!S.current) { S.mode = 'worldmap'; input.clearFrame(); M.endFrame(); return }

      // ---------- 小怪计时刷新 ----------
      // 玩家一直待在原地时也能等到怪回来（配合"走出去再进来立刻刷新"）
      tickRespawns()

      // ---------- 怪物游荡 ----------
      // 原版场景里的怪会自己走动。这里给每只怪一个家点（homeX/homeY），
      // 在半径内随机游荡；玩家靠得很近时会朝玩家挪一点（有追击感但不会贴脸）。
      const sp0 = sceneSpawns(S.current)
      if (sp0.monsters.length) {
        const p0 = S.player
        for (const m of sp0.monsters) {
          if (!m.alive) continue
          if (m.spawnPop > 0) m.spawnPop = Math.max(0, m.spawnPop - dt * 1.6)   // 刷新出场动画衰减
          if (m.homeX === undefined) { m.homeX = m.x; m.homeY = m.y; m.wanderT = 0; m.dirX = 0; m.dirY = 0; m.walkT = 0 }
          m.wanderT -= dt
          // 玩家在 170px 内且不在战斗中 → 轻微靠近
          const dToP = Math.hypot(p0.x - m.x, p0.y - m.y)
          let vx = m.dirX, vy = m.dirY
          if (dToP < 170 && dToP > 60) {
            vx = (p0.x - m.x) / dToP; vy = (p0.y - m.y) / dToP
          } else if (m.wanderT <= 0) {
            // 重新挑一个游荡方向
            m.wanderT = 1.2 + Math.random() * 2.2
            const a = Math.random() * Math.PI * 2
            m.dirX = Math.cos(a) * 0.5; m.dirY = Math.sin(a) * 0.3
            vx = m.dirX; vy = m.dirY
          }
          const spd = (dToP < 170 && dToP > 60) ? 34 : 26
          let nx = m.x + vx * spd * dt
          let ny = m.y + vy * spd * dt
          // 限制在可行走区，并且不要离home太远
          nx = util.clamp(nx, walkBounds().x0, walkBounds().x1)
          ny = util.clamp(ny, walkBounds().y0, walkBounds().y1)
          if (Math.hypot(nx - m.homeX, ny - m.homeY) > 150) {
            m.dirX = (m.homeX - m.x) / 200; m.dirY = (m.homeY - m.y) / 200
            nx = util.clamp(m.x + m.dirX * spd * dt, walkBounds().x0, walkBounds().x1)
            ny = util.clamp(m.y + m.dirY * spd * dt, walkBounds().y0, walkBounds().y1)
          }
          m.moving = Math.hypot(nx - m.x, ny - m.y) > 0.05
          m.x = nx; m.y = ny
          m.walkT = (m.walkT || 0) + dt
          m.facing = vx < -0.05 ? -1 : vx > 0.05 ? 1 : (m.facing || 1)
        }
      }

      // ---------- NPC 站定 ----------
      // 【第 40 轮：用户反馈"固定 NPC 不要乱跑，只让小怪走动"】
      // 原先 NPC 也会以 20px/s 在家点 90px 内游荡 —— 一屏几个人一起飘，既乱又像"没人管"。
      // 现在 NPC **原地不动**（只保留呼吸起伏 bob），走动只留给小怪。
      // 位置在 sceneSpawns 里已经按数量均匀铺开，所以站定之后也不会叠在一起。
      if (sp0.npcs.length) {
        for (const n of sp0.npcs) {
          n.moving = false
          if (n.homeX === undefined) { n.homeX = n.x; n.homeY = n.y }
          n.x = n.homeX; n.y = n.homeY
        }
      }

      // ---------- 背包（切换变身）与属性面板 ----------
      if (input.once('b') || input.once('B')) {
        S.bagSel = Math.max(0, D.FORMS.filter((f) => save.data.forms.includes(f.name)).findIndex((f) => f.name === S.form.name))
        S.bagHover = -1
        S.bagPage = Math.floor(S.bagSel / (BAG.grid.cols * BAG.grid.rows))
        S.mode = 'bag'; input.clearFrame(); M.endFrame(); return
      }
      if (input.once('c') || input.once('C')) {
        S.statSel = Math.max(0, D.FORMS.filter((f) => save.data.forms.includes(f.name)).findIndex((f) => f.name === S.form.name))
        S.mode = 'stats'; input.clearFrame(); M.endFrame(); return
      }
      // R：起名字（玩家自己的名字；在属性面板里按 R 改当前多比的昵称）
      // 用户要的：「可以出一个起名字的功能让玩家起 id」
      if (input.once('r') || input.once('R')) {
        wireNameInput()
        beginRename('player')
        input.clearFrame(); M.endFrame(); return
      }
      // P：索亚面板（陪伴宠物，原版的第二个核心系统）
      if (input.once('p') || input.once('P')) {
        S.soyaSel = Math.max(0, (D.SOYA || []).findIndex((x) => x.id === save.data.soyaActive))
        S.soyaHover = -1
        S.mode = 'soya'; input.clearFrame(); M.endFrame(); return
      }
      // K / V：技能面板（原版在「多比」面板里另开一页，这里做成独立界面）
      // V 是同义键：用户反馈「技能选择也设定个按键放在上面」，所以补一个顺手的键
      // （V 未被占用；K 保留，老习惯不受影响）。顶栏也放了「技能」按钮，走同一个函数。
      if (input.once('k') || input.once('K') || input.once('v') || input.once('V')) {
        openSkillPanel()
        input.clearFrame(); M.endFrame(); return
      }
      // L：图鉴（多比 / 技能 / 索亚 / 怪物 / 骑士与魔王），每条都标来源等级
      if (input.once('l') || input.once('L')) {
        const z = zukanState()
        z.sel = 0; z.page = 0; z.from = 'explore'
        S.mode = 'zukan'; input.clearFrame(); M.endFrame(); return
      }
      // G：直接进杂货铺（免得满地图找商贩；点商贩 NPC 也能进）
      if (input.once('g') || input.once('G')) {
        openShop(); input.clearFrame(); M.endFrame(); return
      }
      // Z：战报（原版界面上方有「战报」按钮，这里同时也做成顶栏可点按钮，见 drawExplore）
      if (input.once('z') || input.once('Z')) {
        S.warSel = 0; S.warPage = 0; S.warHover = -1
        S.mode = 'warreport'; input.clearFrame(); M.endFrame(); return
      }
      // I：副本列表（原版副本是 NPC 传送进入的；见下面「拉鲁」NPC）
      // 注意不能用 F —— F 已经给了全屏（见 HELP_ROWS）。
      if (input.once('i') || input.once('I')) {
        dungeonState().phase = 'list'; S.dunSel = 0; S.dunHover = -1
        S.mode = 'dungeon'; input.clearFrame(); M.endFrame(); return
      }
      // H：唤醒多比（原版：去宝石大厅唤醒，那里写着每只多比的唤醒条件）
      if (input.once('h') || input.once('H')) {
        openAwaken(); input.clearFrame(); M.endFrame(); return
      }
      // J：珍宝小屋（原版：在圣多克骑士厅找肖恩普进入）
      if (input.once('j') || input.once('J')) {
        openTreasure(); input.clearFrame(); M.endFrame(); return
      }
      // Y：小游戏（原版：「多克多比游戏中有个专门介绍这些游戏的 npc 哦~」，
      //    名字与规则来自归档 `小游戏截图\`）
      if (input.once('y') || input.once('Y')) {
        MINI.from = 'explore'; openMinigames(); input.clearFrame(); M.endFrame(); return
      }
      // O：服饰大楼（原版：**多比大街最右端**的服饰大楼，找麦基买服饰；7k7k/178975）
      //    键盘入口只是为了方便，场景里那位麦基才是原版的入口。
      if (input.once('o') || input.once('O')) {
        openCostumeShop(); input.clearFrame(); M.endFrame(); return
      }
      // 顶栏「战报」按钮（原版就是点它进的）
      if (M.clicked && warButtonHit(M.x, M.y)) {
        S.warSel = 0; S.warPage = 0; S.warHover = -1
        audio.sfx('assets/sfx/onClick_03.mp3')
        S.mode = 'warreport'; input.clearFrame(); M.endFrame(); return
      }

      // ---------- 菜单打开时，输入交给菜单 ----------
      if (M.menuOpen()) {
        if (input.once('ArrowUp') || input.once('w')) { M.menuMove(-1); audio.sfx('assets/sfx/onMouseOver_03.mp3') }
        if (input.once('ArrowDown') || input.once('s')) { M.menuMove(1); audio.sfx('assets/sfx/onMouseOver_03.mp3') }
        // 鼠标移动到选项上时跟随高亮
        const mh = M.menuHitTest(M.x, M.y)
        if (mh >= 0 && mh !== M.menu.sel) { M.menu.sel = mh; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
        if (input.once(' ') || input.once('Enter') || (M.clicked && mh >= 0)) {
          const it = M.menuPick()
          M.closeMenu()
          if (it && it.action) it.action()
        }
        if (input.once('Escape') || (M.clicked && mh < 0)) M.closeMenu()
        input.clearFrame(); M.endFrame()
        return
      }

      const ax = input.axis(), p = S.player
      const wb = walkBounds()
      const sp = sceneSpawns(S.current)

      // ---------- 鼠标悬停命中 ----------
      S.hover = null
      S.okCursor = false
      if (M.inside) {
        for (const m of sp.monsters) {
          if (!m.alive) continue
          if (M.hitActor(m, M.x, M.y, 44, 62)) { S.hover = { type: 'mon', obj: m }; break }
        }
        if (!S.hover) {
          for (const n of sp.npcs) {
            if (M.hitActor(n, M.x, M.y, 42, 60)) { S.hover = { type: 'npc', obj: n }; break }
          }
        }
        S.okCursor = !!S.hover
      }
      M.applyCursor(cvs, S.okCursor)

      // ---------- 点击 ----------
      if (M.clicked) {
        // 先判边缘出口：点左右两端的箭头 = 去相邻场景（优先于"点地面走过去"）
        const er = sceneExitRects().find((r) => M.x >= r.x && M.x <= r.x + r.w && M.y >= r.y && M.y <= r.y + r.h)
        if (er) {
          gotoScene(er.to, er.side === 'left' ? 'right' : 'left')
        } else if (S.hover) {
          // 点 NPC / 怪物 → 先走过去，到了再弹菜单（页游就是这个手感）
          const o = S.hover.obj
          p.target = { x: o.x, y: Math.min(wb.y1, o.y + 34), then: { type: S.hover.type, obj: o } }
        } else {
          // 点地面 → 走过去
          const dst = M.clampToWalkable({ x: M.x, y: M.y - 20 }, wb)
          p.target = { x: dst.x, y: dst.y, then: null }
        }
        if (!er) audio.sfx('assets/sfx/onClick_03.mp3')
      }

      // ---------- 键盘移动会取消鼠标目标 ----------
      if (ax.x || ax.y) p.target = null

      // ---------- 朝目标移动 ----------
      p.moving = false
      const __px0 = p.x, __py0 = p.y
      if (p.target) {
        const dx = p.target.x - p.x, dy = p.target.y - p.y
        const d = Math.hypot(dx, dy)
        if (d < 6) {
          // 到达
          p.x = p.target.x; p.y = p.target.y
          const then = p.target.then
          p.target = null
          if (then) {
            if (then.type === 'mon') startBattle(then.obj)
            else openActorMenu(then.obj)
          }
        } else {
          const step = Math.min(d, p.speed * dt)
          p.x += dx / d * step
          p.y += dy / d * step
          if (Math.abs(dx) > 1) p.facing = dx > 0 ? 1 : -1
          // 往"上"走时用**背面**帧（时装序列有背面一/背面二）——
          // 第 54 轮加：以前只认左右，主角往上走时还是正脸，看着像倒着滑。
          p.dirUp = dy < -6
          p.moving = true
        }
      } else if (ax.x || ax.y) {
        p.x = util.clamp(p.x + ax.x * p.speed * dt, wb.x0, wb.x1)
        p.y = util.clamp(p.y + ax.y * p.speed * dt, wb.y0, wb.y1)
        if (ax.x) p.facing = ax.x > 0 ? 1 : -1
        p.dirUp = ax.y < 0 && !ax.x
        p.moving = true
      }
      // ★ 踏步相位必须**跟着真实位移走**。
      // 【第 40 轮找到的 bug】drawFigureWalking 收了 stepPhase，但 p.walkPhase **从来没被赋值**，
      // 于是 ph 恒为 0 → lift/rock/lean 全是 0 → 主角就是**一张静止的图在平移**
      // （用户那句"主角的走路按照 npc 那样走"说的就是这个）。
      // 按位移推进（而不是按时间），走多快就迈多少步，停下就不会原地踏步。
      if (p.moving) {
        const moved = Math.hypot(p.x - __px0, p.y - __py0)
        p.walkPhase = ((p.walkPhase || 0) + moved / 150) % 1   // 150px 一个完整步态循环（derived）
        p.walkT = (p.walkT || 0) + dt
      } else {
        p.walkPhase = 0                                        // 站定时回到"双脚着地"的中性相位
      }
      p.x = util.clamp(p.x, wb.x0, wb.x1)
      p.y = util.clamp(p.y, wb.y0, wb.y1)

      // ---------- 走到边缘继续推 → 进入相邻场景 ----------
      // 只在键盘推着走时触发（鼠标点到边界不算，否则点角落容易误跳）。
      // S.warp 期间不触发，否则从对侧出现后会连着跳好几张图。
      if (!p.target && ax.x && !S.warp) {
        const fromId = S.current ? S.current.id : null
        const ex = fromId != null ? sceneExits(fromId) : null
        if (ex) {
          if (ax.x < 0 && p.x <= wb.x0 + 1 && ex.left != null) gotoScene(ex.left, 'right')
          else if (ax.x > 0 && p.x >= wb.x1 - 1 && ex.right != null) gotoScene(ex.right, 'left')
        }
      }

      p.t += dt
      // 行走相位：只在真的移动时推进，停下时缓慢归零（避免停下来的瞬间姿势"卡"在倾斜状态）
      // 【第 53 轮】2.4 → **1.15**：用户说「走路帧率可以弄慢点」。
      // 相位 = "一个完整步态循环"的进度，所以这个值就是**每秒几个循环**：
      // 6 帧 × 1.15 ≈ **6.9 fps**（原来 4 帧 × 2.4 ≈ 9.6 fps，确实偏快、看着像抖）。
      if (p.moving) p.walkPhase = (p.walkPhase || 0) + dt * 1.15
      else p.walkPhase = (p.walkPhase || 0) * Math.max(0, 1 - dt * 8)

      // ---------- 键盘就近互动（保留） ----------
      S.nearby = null
      let bd = 1e9
      for (const m of sp.monsters) {
        if (!m.alive) continue
        const d = Math.hypot(m.x - p.x, m.y - p.y)
        if (d < 72 && d < bd) { bd = d; S.nearby = { type: 'mon', obj: m, label: '空格 战斗' } }
      }
      for (const n of sp.npcs) {
        const d = Math.hypot(n.x - p.x, n.y - p.y)
        if (d < 72 && d < bd) { bd = d; S.nearby = { type: 'npc', obj: n, label: n.quest ? '空格 接任务' : '空格 交谈' } }
      }
      if (input.once(' ') || input.once('Enter')) {
        if (S.nearby) {
          if (S.nearby.type === 'mon') startBattle(S.nearby.obj)
          else openActorMenu(S.nearby.obj)
        } else toast('附近没有可以互动的东西')
      }
      if (input.once('Tab')) S.mode = 'worldmap'
      if (input.once('Escape')) S.mode = 'worldmap'
      if (input.once('q') || input.once('Q')) { S.questSel = 0; S.mode = 'questlist' }
    } else if (S.mode === 'soya') {
      // ---------- 索亚面板 ----------
      const L = soyaLayout()
      const n2 = L.all.length
      if (input.once('ArrowLeft') || input.once('a')) S.soyaSel = (S.soyaSel + n2 - 1) % n2
      if (input.once('ArrowRight') || input.once('d')) S.soyaSel = (S.soyaSel + 1) % n2
      if (input.once('ArrowUp') || input.once('w')) S.soyaSel = (S.soyaSel - SOYA.grid.cols + n2) % n2
      if (input.once('ArrowDown') || input.once('s')) S.soyaSel = (S.soyaSel + SOYA.grid.cols) % n2
      if (M.inside) {
        const hover = rectHit(L.rects, M.x, M.y)
        S.soyaHover = hover
        const moved = M.x !== S._symx || M.y !== S._symy
        S._symx = M.x; S._symy = M.y
        if (moved && hover >= 0 && hover !== S.soyaSel) S.soyaSel = hover
        M.applyCursor(cvs, hover >= 0)
      } else { S.soyaHover = -1; M.applyCursor(cvs, false) }
      const equipSoya = () => {
        const sy = L.all[util.clamp(S.soyaSel, 0, n2 - 1)]
        if (!sy) return
        if (!(save.data.soya || []).includes(sy.id)) { toast(`还没有 ${sy.name}　打赢各岛怪物有几率遇到`); return }
        save.data.soyaActive = save.data.soyaActive === sy.id ? null : sy.id
        save.persist()
        toast(save.data.soyaActive ? `${sy.name} 参战！` : '已让索亚休息')
        audio.sfx('assets/sfx/onClick_03.mp3')
      }
      if (input.once(' ') || input.once('Enter')) equipSoya()
      if (M.clicked && S.soyaHover >= 0) equipSoya()
      if (input.once('Escape') || input.once('p') || input.once('P')) S.mode = 'explore'
    } else if (S.mode === 'zukan') {
      // ---------- 图鉴 ----------
      const z = zukanState()
      const L = zukanLayout()
      const g = ZUKAN.grid
      const perPage = g.cols * g.rows
      const n = L.all.length
      const move = (d) => { z.sel = (util.clamp(z.sel, 0, Math.max(0, n - 1)) + d + n) % n; z.page = Math.floor(z.sel / perPage) }
      if (input.once('ArrowLeft') || input.once('a')) move(-1)
      if (input.once('ArrowRight') || input.once('d')) move(1)
      if (input.once('ArrowUp') || input.once('w')) move(-g.cols)
      if (input.once('ArrowDown') || input.once('s')) move(g.cols)
      // Q/E 翻页（也接受 Tab 在页签之间切换）
      if (input.once('q') || input.once('Q')) { z.page = (z.page + L.pages - 1) % L.pages; z.sel = z.page * perPage }
      if (input.once('e') || input.once('E')) { z.page = (z.page + 1) % L.pages; z.sel = z.page * perPage }
      if (input.once('Tab')) { z.tab = (z.tab + 1) % ZUKAN.tabs.length; z.sel = 0; z.page = 0 }
      if (M.inside) {
        const hover = rectHit(L.rects, M.x, M.y)
        const moved = M.x !== S._zkmx || M.y !== S._zkmy
        S._zkmx = M.x; S._zkmy = M.y
        if (moved && hover >= 0 && hover !== z.sel) z.sel = L.rects[hover].idx
        M.applyCursor(cvs, hover >= 0)
      } else M.applyCursor(cvs, false)
      if (input.once('Escape') || input.once('l') || input.once('L')) S.mode = z.from === 'title' ? 'title' : 'explore'
    } else if (S.mode === 'minigames') {
      // ---------- 小游戏列表（分页：见 miniLayout 的说明）----------
      const L = miniLayout()
      const n = L.list.length
      const move = (d) => {
        MINI.sel = (util.clamp(MINI.sel, 0, n - 1) + d + n) % n
        MINI.page = Math.floor(MINI.sel / L.perPage)
        audio.sfx('assets/sfx/onMouseOver_03.mp3')
      }
      if (input.once('ArrowLeft') || input.once('a')) move(-1)
      if (input.once('ArrowRight') || input.once('d')) move(1)
      if (input.once('ArrowUp') || input.once('w')) move(-2)
      if (input.once('ArrowDown') || input.once('s')) move(2)
      if (input.once('q') || input.once('Q')) {
        MINI.page = (L.page + L.pages - 1) % L.pages
        MINI.sel = MINI.page * L.perPage
      }
      if (input.once('e') || input.once('E')) {
        MINI.page = (L.page + 1) % L.pages
        MINI.sel = MINI.page * L.perPage
      }
      if (M.inside) {
        const h = rectHit(L.rects, M.x, M.y)
        if (h >= 0) {
          const idx = L.start + h
          if (idx !== MINI.sel) { MINI.sel = idx; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
        }
        M.applyCursor(cvs, h >= 0)
      } else M.applyCursor(cvs, false)
      if (input.once(' ') || input.once('Enter')) startMinigame(L.list[MINI.sel].id)
      if (input.once('Escape') || input.once('y') || input.once('Y')) S.mode = MINI.from === 'title' ? 'title' : 'explore'
    } else if (S.mode === 'skillpanel') {
      // ---------- 技能面板 ----------
      const L = skillPanelLayout()
      const n2 = L.all.length
      const move = (d) => {
        if (!n2) return
        S.skpSel = (util.clamp(S.skpSel || 0, 0, n2 - 1) + d + n2) % n2
        S.skpPage = Math.floor(S.skpSel / L.perPage)
        audio.sfx('assets/sfx/onMouseOver_03.mp3')
      }
      if (input.once('ArrowLeft') || input.once('a')) move(-1)
      if (input.once('ArrowRight') || input.once('d')) move(1)
      if (input.once('ArrowUp') || input.once('w')) move(-SKP.lib.cols)
      if (input.once('ArrowDown') || input.once('s')) move(SKP.lib.cols)
      if (input.once('q') || input.once('Q')) { S.skpPage = (L.page + L.pages - 1) % L.pages; S.skpSel = S.skpPage * L.perPage }
      if (input.once('e') || input.once('E')) { S.skpPage = (L.page + 1) % L.pages; S.skpSel = S.skpPage * L.perPage }
      if (M.inside) {
        const hover = rectHit(L.rects, M.x, M.y)
        S.skpHover = hover
        const eqHover = equipHitTest(M.x, M.y)
        S.skpEquipHover = eqHover
        const moved = M.x !== S._skpmx || M.y !== S._skpmy
        S._skpmx = M.x; S._skpmy = M.y
        if (moved && hover >= 0 && hover !== S.skpSel) { S.skpSel = hover; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
        M.applyCursor(cvs, hover >= 0 || eqHover >= 0)

        // ---------- 配招：点左边格子选中/卸下，点右边技能库装备 ----------
        if (M.clicked) {
          if (eqHover >= 0 && equipRectList(S.form)[eqHover].usable) {
            // 点空格 → 选中它（之后点技能库就装这一格）；点已装的格 → 卸下
            const cur = (S.form.skills || [])[eqHover]
            if (cur) {
              const r = unequipSkill(eqHover)
              if (r.ok) notice(`已卸下「${r.gone}」`)
            } else {
              S.skpEquipSel = eqHover
              audio.sfx('assets/sfx/onMouseOver_03.mp3')
            }
          } else if (hover >= 0) {
            const nm = L.rects[hover] && L.rects[hover].name
            if (nm) {
              const r = equipSkill(nm)
              if (r.ok) { notice(`已装备「${nm}」→ 第 ${r.slot + 1} 槽`); audio.sfx('assets/sfx/onMouseOver_03.mp3') }
              else notice(r.why)
            }
          }
        }
      } else { S.skpHover = -1; S.skpEquipHover = -1; M.applyCursor(cvs, false) }

      // 键盘也能配招：空格/回车把当前选中的技能装备上；数字 1~6 选中装备格；Delete 卸下选中格
      if (input.once(' ') || input.once('Enter')) {
        const nm = L.all[util.clamp(S.skpSel || 0, 0, Math.max(0, L.all.length - 1))]
        if (nm) {
          const r = equipSkill(nm)
          if (r.ok) notice(`已装备「${nm}」→ 第 ${r.slot + 1} 槽`)
          else notice(r.why)
        }
      }
      for (let k = 1; k <= SKP.equip.cols * SKP.equip.rows; k++) {
        if (input.once(String(k))) {
          if (k - 1 < slotCount(S.form)) { S.skpEquipSel = k - 1; notice(`选中第 ${k} 槽`) }
        }
      }
      if (input.once('Delete') || input.once('Backspace')) {
        if (S.skpEquipSel != null && S.skpEquipSel >= 0) {
          const r = unequipSkill(S.skpEquipSel)
          notice(r.ok ? `已卸下「${r.gone}」` : r.why)
        }
      }
      if (input.once('Escape') || input.once('k') || input.once('K') || input.once('v') || input.once('V') || input.once('b') || input.once('B')) S.mode = 'explore'
    } else if (S.mode === 'bag') {
      // ---------- 背包：切换变身 ----------
      const layout = bagLayout()
      const owned = layout.owned
      const n = owned.length
      if (input.once('ArrowLeft') || input.once('a')) { S.bagSel = (S.bagSel + n - 1) % n; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
      if (input.once('ArrowRight') || input.once('d')) { S.bagSel = (S.bagSel + 1) % n; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
      // 翻页 / 上下行
      const perRow = layout.perRow
      if (input.once('ArrowUp') || input.once('w')) { S.bagSel = (S.bagSel - perRow + n) % n; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
      if (input.once('ArrowDown') || input.once('s')) { S.bagSel = (S.bagSel + perRow) % n; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
      if (input.once('q') || input.once('Q')) { S.bagPage = (S.bagPage + layout.pages - 1) % layout.pages }
      if (input.once('e') || input.once('E')) { S.bagPage = (S.bagPage + 1) % layout.pages }
      // 切换页时把选中项挪到当前页
      if (Math.floor(S.bagSel / layout.perPage) !== S.bagPage) S.bagPage = Math.floor(S.bagSel / layout.perPage)

      // 鼠标：用统一的命中测试（覆盖所有行，不再只认第一行）
      let hoverIdx = -1
      if (M.inside) {
        hoverIdx = bagHitTest(M.x, M.y)
        S.bagHover = hoverIdx
        // 同战斗：只有鼠标真的移动了才改选中项，否则键盘选不动的
        const bagMoved = M.x !== S._bpmx || M.y !== S._bpmy
        S._bpmx = M.x; S._bpmy = M.y
        if (bagMoved && hoverIdx >= 0 && hoverIdx !== S.bagSel) {
          S.bagSel = hoverIdx
          audio.sfx('assets/sfx/onMouseOver_03.mp3')
        }
        // 分页箭头：点一下翻一页
        const pg = bagPagerRects(layout)
        if (M.clicked) {
          const inRect = (r) => M.x >= r.x && M.x <= r.x + r.w && M.y >= r.y && M.y <= r.y + r.h
          if (layout.pages > 1 && inRect(pg.prev)) {
            S.bagPage = (S.bagPage + layout.pages - 1) % layout.pages
            audio.sfx('assets/sfx/onMouseOver_03.mp3')
          } else if (layout.pages > 1 && inRect(pg.next)) {
            S.bagPage = (S.bagPage + 1) % layout.pages
            audio.sfx('assets/sfx/onMouseOver_03.mp3')
          }
        }
        M.applyCursor(cvs, hoverIdx >= 0 || layout.pages > 1)
      } else { S.bagHover = -1; M.applyCursor(cvs, false) }

      const equip = () => {
        const f = owned[S.bagSel]
        if (!f) return
        if (f.name !== S.form.name) {
          S.form = f
          save.data.form = f.name
          save.data.maxHp = 0; save.data.maxMp = 0
          ensureVitals()
          art.prefetch(f)
          for (const a of [f.actionIdle, f.actionBattle, f.actionWin, ...(f.actionSkills || [])]) {
            if (!a) continue
            const e = anim.get(f.spriteDir, a)
            if (e) anim.prefetch(e)
          }
          toast(`变身 ${f.name}！`, 2200)
          audio.sfx('assets/sfx/onClick_03.mp3')
        }
        S.mode = 'explore'
        save.persist()
      }
      if (input.once(' ') || input.once('Enter') || (M.clicked && hoverIdx >= 0)) equip()
      if (input.once('Escape') || input.once('b') || input.once('B')) S.mode = 'explore'
    } else if (S.mode === 'stats') {
      // ---------- 属性面板 ----------
      const list = D.FORMS.filter((f) => save.data.forms.includes(f.name))
      const n = list.length
      if (input.once('ArrowLeft') || input.once('a') || input.once('ArrowUp') || input.once('w')) {
        S.statSel = (S.statSel + n - 1) % n; audio.sfx('assets/sfx/onMouseOver_03.mp3')
      }
      if (input.once('ArrowRight') || input.once('d') || input.once('ArrowDown') || input.once('s')) {
        S.statSel = (S.statSel + 1) % n; audio.sfx('assets/sfx/onMouseOver_03.mp3')
      }
      if (input.once('Escape') || input.once('c') || input.once('C') || input.once('Tab')) S.mode = 'explore'
      // 鼠标（第 55 轮补）：左右箭头切形态、右上角 ✕ 返回 —— 这个面板原来只有键盘
      if (M.inside) {
        const h = statsButtonHit(M.x, M.y)
        S.statBtnHover = h
        M.applyCursor(cvs, !!h)
        if (M.clicked && h) {
          if (h === 'close') S.mode = 'explore'
          else {
            S.statSel = (S.statSel + (h === 'prev' ? n - 1 : 1)) % n
            audio.sfx('assets/sfx/onMouseOver_03.mp3')
          }
        }
      } else { S.statBtnHover = null; M.applyCursor(cvs, false) }
      // R：给**当前这只多比**起昵称（第 54 轮，用户要的"起名字"功能）
      if (input.once('r') || input.once('R')) {
        wireNameInput()
        beginRename('form', list[util.clamp(S.statSel, 0, n - 1)].name)
      }
    } else if (S.mode === 'dialog') {
      // 键盘：空格/回车推进
      if (input.once(' ') || input.once('Enter')) advanceDialog()
      // 鼠标：原版对话框是"点画面任意处继续"。
      // 这里做成——点对话中**出现的选项**就选那一项；点其它地方推进对话。
      if (M.clicked) {
        const opts = dialogOptionRects()
        const hit = opts.findIndex((r) => M.x >= r.x && M.x <= r.x + r.w && M.y >= r.y && M.y <= r.y + r.h)
        if (opts.length && hit >= 0) {
          S.dialog.choice = hit
          audio.sfx('assets/sfx/onClick_03.mp3')
          advanceDialog()
        } else {
          advanceDialog()
        }
        input.clearFrame(); M.endFrame()
      }
      if (input.once('Escape')) { S.dialog = null; S.mode = 'explore' }
    } else if (S.mode === 'battle') {
      // 战斗速度（第 54 轮接线）：左下角那个「速」按钮此前是**假按钮** —— 它只把
      // `S.battleSpeed` 改掉并弹一句提示，**从没被用来改变节奏**（实测：点完动画一点没快）。
      // 现在在这里把 dt 乘上去，一处生效于全部战斗演出（动画/特效/飘字/出手计时都吃 battleTick 的 dt）。
      // 上限定 3×：再快玩家看不清出招，反而像掉帧。
      battleTick(dt * (S.battleSpeed || 1))
      const b = S.battle
      if (!b) { leaveBattle(); return }
      // ---------- 结印操作 ----------
      // 必须在技能面板导航**之前**拦截方向键：否则结印的同时，
      // 下面那段 `ArrowUp → b.skillSel = ...` 也会跑，光标会跟着乱跳。
      // 也**不能 return**：本分支末尾的 input.clearFrame() 会被跳过，
      // 按键集合就会跨帧累积，后面的按键会被解析成 SEAL_ARROWS 里最先匹配的方向
      // 而不是玩家刚按下的那一个（实测表现为"明明按对了却判失误"）。
      if (b.phase === 'sealing' && b.seal) {
        const s = b.seal
        const want = s.seq[s.idx]
        let pressed = null
        for (const a of SEAL_ARROWS) if (input.once(a)) { pressed = a; break }
        if (pressed) {
          const ok = pressed === want
          audio.sfx(ok ? 'assets/sfx/onClick_03.mp3' : 'assets/sfx/onMouseOver_03.mp3')
          sealAdvance(ok)
        }
      } else if (b.phase === 'command' && b.intro <= 0) {
        const alive = b.enemies.filter((e) => !e.dead)
        const L = battleLayout(b)
        // 鼠标是不是**这一帧真的动了**。
        // 为什么要判断这个：悬停会把 menuSel/skillSel/itemSel 改成光标底下的那一格，
        // 每帧都改的话，鼠标只要停在某格上，键盘选中的东西就会被一直顶回去 ——
        // 表现就是"用方向键选了技能，一按空格放出来的却是另一个"，
        // 以及测试里"明明设了 menuSel=道具，按回车却放出了逃跑"。
        const mouseMoved = M.inside && (M.x !== S._pmx || M.y !== S._pmy)
        if (M.inside) { S._pmx = M.x; S._pmy = M.y }
        // ---------- 鼠标：悬停高亮 ----------
        let hoverCmd = -1, hoverSkill = -1, hoverItem = -1, hoverEnemy = -1
        let hoverBBtn = null
        if (M.inside) {
          hoverEnemy = battleEnemyHitTest(b, M.x, M.y)
          // 左下角那三个橙色按钮（原版固定件）：任何阶段都可点（退出/速度/发言不受指令阶段限制）
          for (const btn of (L.battleBtns || [])) {
            if (M.x >= btn.x && M.x <= btn.x + btn.w && M.y >= btn.y && M.y <= btn.y + btn.h) hoverBBtn = btn.id
          }
          if (b.menu === 'main') {
            hoverCmd = rectHit(L.cmdRects, M.x, M.y)
            if (mouseMoved && hoverCmd >= 0 && hoverCmd !== b.menuSel) {
              b.menuSel = hoverCmd; audio.sfx('assets/sfx/onMouseOver_03.mp3')
            }
          } else if (b.menu === 'skill') {
            hoverSkill = rectHit(L.skillRects, M.x, M.y)
            if (mouseMoved && hoverSkill >= 0 && hoverSkill !== b.skillSel) {
              b.skillSel = hoverSkill; audio.sfx('assets/sfx/onMouseOver_03.mp3')
            }
          } else if (b.menu === 'item') {
            const ir = itemRects(b)
            hoverItem = rectHit(ir.rects, M.x, M.y)
            if (mouseMoved && hoverItem >= 0 && hoverItem !== b.itemSel) {
              b.itemSel = hoverItem; audio.sfx('assets/sfx/onMouseOver_03.mp3')
            }
          }
          M.applyCursor(cvs, hoverCmd >= 0 || hoverSkill >= 0 || hoverItem >= 0 || hoverEnemy >= 0 || !!hoverBBtn)
        } else {
          M.applyCursor(cvs, false)
        }
        // 存下悬停状态，供 drawBattle 高亮
        S.hoverCmd = hoverCmd
        S.hoverSkill = hoverSkill
        S.hoverItem = hoverItem
        S.hoverEnemy = hoverEnemy
        S.hoverBattleBtn = hoverBBtn
        // ---------- 鼠标：点击 ----------
        // 大圆钮（确定）优先：它的位置和指令格不重叠，但要放在分支最前面才不会被漏掉
        const bigHit = b.phase === 'command' && (() => {
          const dx = M.x - L.bigC.x, dy = M.y - L.bigC.y
          return dx * dx + dy * dy <= L.bigC.r * L.bigC.r
        })()
        S.hoverBig = bigHit
        if (M.clicked) {
          if (hoverBBtn) {
            battleBtnAct(hoverBBtn)          // 三个橙钮（退出/速度/发言）
          } else if (bigHit) {
            battleConfirm()
          } else if (hoverEnemy >= 0) {
            // 点敌人 = 切换目标
            b.target = hoverEnemy
            audio.sfx('assets/sfx/onMouseOver_03.mp3')
          } else if (b.menu === 'main' && hoverCmd >= 0) {
            doCommand(hoverCmd)
          } else if (b.menu === 'skill' && hoverSkill >= 0) {
            const nm = (S.form.skills || [])[hoverSkill]
            const why = nm ? skillBlockReason(b, nm) : '技能数据缺失'
            if (!why) useSkill(b, nm)
            else {
              b.skillSel = hoverSkill
              const nx = nextUsableSkill(b, hoverSkill)
              if (nx >= 0) { b.skillSel = nx; notice(why + `　→ 已切到「${S.form.skills[nx]}」`) }
              else notice(why + '　本回合没有可用技能')
            }
          } else if (b.menu === 'item' && hoverItem >= 0) {
            const list = itemRects(b).list
            if (list[hoverItem]) playerAct('item', list[hoverItem].id)
          }
        }
        // ---------- 键盘 ----------
        if (b.menu === 'main') {
          // 指令格现在有 6 个（后两个未开放），左右选的时候跳过未开放的
          const step = (d) => {
            b.menuSel = (b.menuSel + d + L.cmdRects.length) % L.cmdRects.length
            audio.sfx('assets/sfx/onMouseOver_03.mp3')
          }
          if (input.once('ArrowUp') || input.once('w')) step(-1)
          if (input.once('ArrowDown') || input.once('s')) step(1)
          if (input.once('ArrowLeft') || input.once('a')) { b.target = (b.target + alive.length - 1) % alive.length; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
          if (input.once('ArrowRight') || input.once('d')) { b.target = (b.target + 1) % alive.length; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
          if (input.once(' ') || input.once('Enter')) doCommand(b.menuSel)
        } else if (b.menu === 'item') {
          // 道具面板：Q/E 换页签，方向键选道具（早先方向键也用来换页签，会和选格冲突）
          const ir = itemRects(b)
          const n = ir.list.length
          if (input.once('q') || input.once('Q')) { b.itemTab = (b.itemTab + D.ITEM_TABS.length - 1) % D.ITEM_TABS.length; b.itemSel = 0; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
          if (input.once('e') || input.once('E')) { b.itemTab = (b.itemTab + 1) % D.ITEM_TABS.length; b.itemSel = 0; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
          if (n) {
            if (input.once('ArrowLeft') || input.once('a')) b.itemSel = (b.itemSel + n - 1) % n
            if (input.once('ArrowRight') || input.once('d')) b.itemSel = (b.itemSel + 1) % n
            if (input.once('ArrowUp') || input.once('w')) b.itemSel = (b.itemSel + n - ir.perRow) % n
            if (input.once('ArrowDown') || input.once('s')) b.itemSel = (b.itemSel + ir.perRow) % n
            b.itemSel = util.clamp(b.itemSel, 0, n - 1)
            if (input.once(' ') || input.once('Enter')) playerAct('item', ir.list[b.itemSel].id)
          }
          if (input.once('Escape')) b.menu = 'main'
        } else {
          // 紧凑列表：配招的空槽（null）不参与战斗中的选择与网格下标
          const list = battleSkills(S.form)
          if (!list.length) { b.menu = 'main' }
          else {
            const clampSel = () => util.clamp(b.skillSel || 0, 0, list.length - 1)
            if (input.once('ArrowUp') || input.once('w')) b.skillSel = (clampSel() + 3 - (list.length % 3 || 3) + list.length * 2) % list.length
            if (input.once('ArrowDown') || input.once('s')) b.skillSel = (clampSel() + 3) % list.length
            if (input.once('ArrowLeft') || input.once('a')) b.skillSel = (clampSel() + list.length - 1) % list.length
            if (input.once('ArrowRight') || input.once('d')) b.skillSel = (clampSel() + 1) % list.length
            if (input.once(' ') || input.once('Enter')) {
              // 选中的技能用不了时，**明确说原因**并自动跳到下一个能用的，
              // 不让玩家对着面板连按空格却毫无反应（用户反馈的就是这个）。
              const name = list[clampSel()]
              const why = skillBlockReason(b, name)
              if (!why) useSkill(b, name)
              else {
                const nx = nextUsableSkill(b, clampSel())
                if (nx >= 0) {
                  b.skillSel = nx
                  notice(why + `　→ 已切到「${list[nx]}」`)
                } else notice(why + '　本回合没有可用技能')
              }
            }
            if (input.once('Escape')) b.menu = 'main'
          }
        }
      }
    } else if (S.mode === 'shop') {
      // ---------- 杂货铺 ----------
      const L = shopLayout()
      const n = L.list.length
      const move = (d) => {
        if (!n) return
        S.shopSel = (util.clamp(S.shopSel || 0, 0, n - 1) + d + n) % n
        S.shopPage = Math.floor(S.shopSel / L.perPage)
      }
      if (M.inside) {
        const hover = rectHit(L.rects, M.x, M.y)
        if (hover >= 0 && hover !== S.shopSel) { S.shopSel = hover; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
        M.applyCursor(cvs, hover >= 0)
        if (M.clicked && hover >= 0 && L.rects.find((r) => r.idx === hover && r.it)) buyItem(L.rects.find((r) => r.idx === hover).it)
      } else M.applyCursor(cvs, false)
      if (input.once('ArrowLeft') || input.once('a')) move(-1)
      if (input.once('ArrowRight') || input.once('d')) move(1)
      if (input.once('ArrowUp') || input.once('w')) move(-L.cols)
      if (input.once('ArrowDown') || input.once('s')) move(L.cols)
      if (input.once('q') || input.once('Q')) { S.shopTab = (S.shopTab + L.tabs.length - 1) % L.tabs.length; S.shopSel = 0; S.shopPage = 0; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
      if (input.once('e') || input.once('E')) { S.shopTab = (S.shopTab + 1) % L.tabs.length; S.shopSel = 0; S.shopPage = 0; audio.sfx('assets/sfx/onMouseOver_03.mp3') }
      if (input.once(' ') || input.once('Enter')) buyItem(shopSelected())
      // 一次买 5 个（省得狂点）
      if (input.once('f') || input.once('F')) { const it = shopSelected(); for (let i = 0; i < 5; i++) buyItem(it) }
      if (input.once('Escape') || input.once('g') || input.once('G')) S.mode = 'explore'
    } else if (S.mode === 'result') {
      // 点击任意处 = 继续（第 55 轮：用户要求"局内所有东西都能左键点击"，
      // 原来这里只有键盘，鼠标点了没反应）
      if (input.once(' ') || input.once('Enter') || input.once('Escape') || M.clicked) {
        leaveBattle()
      }
    } else if (S.mode === 'questlist') {
      const list = Q.all.slice(0, 40)
      if (input.once('ArrowUp') || input.once('w')) S.questSel = (S.questSel + list.length - 1) % list.length
      if (input.once('ArrowDown') || input.once('s')) S.questSel = (S.questSel + 1) % list.length
      if (input.once('Escape') || input.once('q') || input.once('Q')) S.mode = 'explore'
      if ((input.once(' ') || input.once('Enter')) && list[S.questSel]) playQuest(list[S.questSel])
      // 鼠标（第 55 轮补）：悬停选中、点击播放 —— 原来只有键盘
      if (M.inside) {
        const row = questRowHit(M.x, M.y)
        if (row) {
          if (row.i !== S.questSel) S.questSel = row.i
          if (M.clicked) playQuest(row.q)
        }
        M.applyCursor(cvs, !!row)
      } else M.applyCursor(cvs, false)
    } else if (S.mode === 'warreport') {
      // ---------- 战报 ----------
      const tasks = warTasks()
      const pages = warPages(tasks)
      S.warPage = util.clamp(S.warPage || 0, 0, pages - 1)
      S.warSel = util.clamp(S.warSel || 0, 0, Math.max(0, tasks.length - 1))
      const pageTasks = tasks.slice(S.warPage * WAR_PER_PAGE, (S.warPage + 1) * WAR_PER_PAGE)
      const rects = warLayout(pageTasks)

      if (input.once('ArrowLeft') || input.once('a')) S.warSel = Math.max(0, S.warSel - 1)
      if (input.once('ArrowRight') || input.once('d')) S.warSel = Math.min(tasks.length - 1, S.warSel + 1)
      if (input.once('ArrowUp') || input.once('w')) S.warSel = Math.max(0, S.warSel - WAR.cols)
      if (input.once('ArrowDown') || input.once('s')) S.warSel = Math.min(tasks.length - 1, S.warSel + WAR.cols)
      if (input.once('[') || input.once('PageUp')) S.warPage = (S.warPage + pages - 1) % pages
      if (input.once(']') || input.once('PageDown')) S.warPage = (S.warPage + 1) % pages
      // 翻页跟随选择
      const wantPage = Math.floor(S.warSel / WAR_PER_PAGE)
      if (wantPage !== S.warPage) S.warPage = wantPage

      // 鼠标
      if (M.inside) {
        const rel = S.warSel - S.warPage * WAR_PER_PAGE
        const hover = rectHit(rects, M.x, M.y)
        S.warHover = hover
        const moved = M.x !== S._warmx || M.y !== S._warmy
        S._warmx = M.x; S._warmy = M.y
        if (moved && hover >= 0 && hover !== rel) S.warSel = S.warPage * WAR_PER_PAGE + hover
        M.applyCursor(cvs, hover >= 0)
      } else { S.warHover = -1; M.applyCursor(cvs, false) }

      const claimCur = () => {
        const t = tasks[S.warSel]
        if (t) warClaim(t)
      }
      if (input.once(' ') || input.once('Enter')) claimCur()
      if (M.clicked && S.warHover >= 0) {
        const t = pageTasks[S.warHover]
        if (t) warClaim(t)
      }
      if (input.once('Escape') || input.once('z') || input.once('Z')) S.mode = 'explore'
    } else if (S.mode === 'dungeon') {
      // ---------- 副本 ----------
      const st = dungeonState()
      const d = D.dungeonById(st.id)
      if (st.phase === 'ski') {
        // 「滑雪跳台」：平衡用 ←→（持续按住）；起跳用 ↑；进圈按对应方向键
        skiTick(1 / 60)
        // 没过关线才允许重来（过关会走 miniStagePass 离开这一关）
        if (st.ski && st.ski.over && st.ski.total < SKI.pass && (input.once(' ') || input.once('Enter'))) skiReset()
        if (input.once('Escape')) { st.phase = 'fail' }
      } else if (st.phase === 'notes') {
        // 「魔幻音符」：左右键移动手指、下键弹奏
        notesTick(1 / 60)
        if (input.once('Escape')) { st.phase = 'fail' }
      } else if (st.phase === 'flycatch') {
        // 「飞翔的衣服」：**纯鼠标** —— 移网（光标）＋点击下网；网要过 0.28 秒才合拢，
        // 所以必须按衣服飞的方向提前下网（官方攻略原话）
        flyCatchTick(1 / 60)
        M.applyCursor(cvs, true)
        if (M.clicked) flyCatchCast(M.x, M.y)
        if (input.once('Escape')) { st.phase = 'fail' }
      } else if (st.phase === 'crystal') {
        // 「晶石对战」：鼠标点两格交换（三消）；键盘另备一路（方向键移动光标 + 空格选中/交换）。
        // 官方原话：「小多克需要操作自己面前的晶石板来积攒晶石能量打击对方」。
        crystalTick(1 / 60)
        const g = st.cr
        if (g && !g.over) {
          const cr = crystalBoardRect()
          // 鼠标
          if (M.inside && M.x >= cr.x && M.x <= cr.x + cr.w && M.y >= cr.y && M.y <= cr.y + cr.h) {
            const cx = Math.floor((M.x - cr.x) / (cr.cell + cr.gap))
            const cy = Math.floor((M.y - cr.y) / (cr.cell + cr.gap))
            M.applyCursor(cvs, true)
            if (M.clicked && cx >= 0 && cx < g.cfg.cols && cy >= 0 && cy < g.cfg.rows) {
              crystalClick(cx, cy)
            }
          } else M.applyCursor(cvs, false)
          // 键盘
          if (g.cur === undefined) g.cur = { x: 0, y: 0 }
          const K = g.cur
          if (input.once('ArrowLeft') || input.once('a')) K.x = (K.x + g.cfg.cols - 1) % g.cfg.cols
          if (input.once('ArrowRight') || input.once('d')) K.x = (K.x + 1) % g.cfg.cols
          if (input.once('ArrowUp') || input.once('w')) K.y = (K.y + g.cfg.rows - 1) % g.cfg.rows
          if (input.once('ArrowDown') || input.once('s')) K.y = (K.y + 1) % g.cfg.rows
          if (input.once(' ') || input.once('Enter')) crystalClick(K.x, K.y)
        }
        if (g && g.over && (input.once(' ') || input.once('Enter'))) {
          if (g.win) miniStagePass(); else st.phase = 'fail'
          input.clearFrame(); M.endFrame(); return
        }
        if (input.once('Escape')) { st.phase = 'fail' }
      } else if (st.phase === 'sumo') {
        // 「大陆棋」：按住己方多比拉弓（方向 + 大小），**松手发射**（官方 558684 原话：
        // 「将鼠标指向出招的多比会出现一个箭头，移动鼠标调整箭头的方向和大小…瞄准敌人后松开鼠标就可以进行发射」）。
        // 键盘另备一路（↑↓←→ 调角度、Z/X 调力度、空格发射）—— 机器人与不便用鼠标的玩家都能玩。
        sumoTick(1 / 60)
        const g = st.su
        if (g && !g.over) {
          const next = sumoNextUnit()
          if (g.aiming) {
            const a = g.aiming
            const u = g.units.find((x) => x.uid === a.uid)
            // 鼠标拖动 → 从多比指向光标的向量就是箭头（长度决定力度）
            if (M.inside && u && a.held) {
              const dx = sumoBX(M.x) - u.x, dy = sumoBY(M.y) - u.y
              sumoSetAim(dx, dy, Math.hypot(dx, dy) / 300)
            }
            // 键盘调角度与力度（弧度 / 力度步进）
            if (input.once('ArrowLeft')) sumoRotateAim(-0.09)
            if (input.once('ArrowRight')) sumoRotateAim(0.09)
            if (input.once('ArrowUp') || input.once('z') || input.once('Z')) sumoPowerAim(0.06)
            if (input.once('ArrowDown') || input.once('x') || input.once('X')) sumoPowerAim(-0.06)
            // 松手 = 发射（只对"用鼠标按下去"起的那次生效，键盘起的不受鼠标松开影响）
            if (a.held && !M.down) sumoFire()
            else if (input.once(' ')) sumoFire()
            if (input.once('Escape')) g.aiming = null
          } else if (next && next.side === 'mine') {
            if (M.clicked) {
              const hitU = g.units.find((u) => u.side === 'mine' && u.alive
                && Math.hypot(sumoX(u.x) - M.x, sumoY(u.y) - M.y) < 36)
              if (hitU) { sumoStartAim(hitU.uid); if (g.aiming) g.aiming.held = true }
            }
            if (input.once(' ') || input.once('Enter')) sumoStartAim(next.uid)
          }
        }
        if (input.once('Escape') && !(g && g.aiming)) { st.phase = 'fail' }
      } else if (st.phase === 'catch') {
        // 「哈里的金币」（7k7k/660617）：箱子**二维移动**去接金币（官方技巧"按住四个方向键不松"）
        if ((input.once(' ') || input.once('Enter')) && st.cc && st.cc.over) coinCatchReset()
        coinCatchTick(1 / 60)
        if (input.once('Escape')) { st.phase = 'fail' }
      } else if (st.phase === 'mirror') {
        // 「魔镜世界」（7k7k/660928）：方向被镜像；移动是持续按住，所以不需要 once
        if ((input.once(' ') || input.once('Enter')) && st.mr && st.mr.over) mirrorReset()
        mirrorTick(1 / 60)
        if (input.once('Escape')) { st.phase = 'fail' }
      } else if (st.phase === 'soar') {
        // 「冲上云霄」：左右移动是持续按住，跳是单次（所以移动放 tick、跳用 once）
        if ((input.once(' ') || input.once('Enter')) && st.sr && st.sr.over) soarReset()
        soarTick(1 / 60)
        if (input.once('Escape')) { st.phase = 'fail' }
      } else if (st.phase === 'ballpush') {
        // 「极限顶顶球」：左右持续按住、上键跳一次
        if ((input.once(' ') || input.once('Enter')) && st.bp && st.bp.over) ballPushReset()
        ballPushTick(1 / 60)
        if (input.once('Escape')) { st.phase = 'fail' }
      } else if (st.phase === 'platformer') {
        // 「拯救多比古书」：方向键左右移动（持续按住），空格/↑ 跳跃
        if (input.once(' ') || input.once('Enter') || input.once('ArrowUp') || input.once('w')) {
          if (st.pf && st.pf.over) platformerReset()
          else platformerJump()
        }
        platformerTick(1 / 60)
        if (input.once('Escape')) { st.phase = 'fail' }
      } else if (st.phase === 'chargeshooter') {
        // 「王牌大空战」：方向键四向移动 + Z 射击（按住蓄力、松开打出）
        chargeShooterTick(1 / 60)
        if (input.once('Escape')) { st.phase = 'fail' }
      } else if (st.phase === 'blocks') {
        // 「思维方块」：方向键控制提示框　空格转动方向（官方截图的原文）
        if (input.once('ArrowLeft') || input.once('a')) blocksMove(-1, 0)
        if (input.once('ArrowRight') || input.once('d')) blocksMove(1, 0)
        if (input.once('ArrowDown') || input.once('s')) blocksMove(0, 1)
        if (input.once(' ') || input.once('Enter') || input.once('ArrowUp') || input.once('w')) {
          if (st.bl && st.bl.over) blocksReset()
          else blocksRotate()
        }
        blocksTick(1 / 60)
        if (input.once('Escape')) { st.phase = 'fail' }
      } else if (st.phase === 'runner') {
        // 「多比快跑」：连续按方向键奔跑和加速，按空格跳跃
        if (input.once('ArrowLeft') || input.once('ArrowRight') || input.once('a') || input.once('d')
          || input.once('ArrowUp') || input.once('w') || input.once('ArrowDown') || input.once('s')) {
          if (st.rn && st.rn.over) runnerReset()
          else runnerPress()
        }
        if (input.once(' ') || input.once('Enter')) {
          if (st.rn && st.rn.over) runnerReset()
          else runnerJump()
        }
        runnerTick(1 / 60)
        if (input.once('Escape')) { st.phase = 'fail' }
      } else if (st.phase === 'memory') {
        // 记忆力小游戏：先按顺序亮出方向，亮完后玩家依次复现
        const q = st.seq
        if (q.showing) {
          q.t += 1 / 60
          if (q.t > (q.show.length + 1) * 0.75) { q.showing = false; q.t = 0 }
        } else {
          for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd']) {
            if (!input.once(k)) continue
            const dir = (k === 'w' ? 'ArrowUp' : k === 's' ? 'ArrowDown' : k === 'a' ? 'ArrowLeft' : k === 'd' ? 'ArrowRight' : k)
            q.input.push(dir)
            const i = q.input.length - 1
            if (q.show[i] !== dir) {
              // 记错 → 重来这一关（原文的"记忆力"关卡就是这样）
              notice('记错了，再来一次')
              startDungeonStage()
            } else if (q.input.length >= q.show.length) {
              // 原文：完成小游戏会得到智慧/勇气/魅力，「这些都是唤醒多比所必不可少的东西」
              // ★ 不再自己复制一份过关逻辑 —— 统一走 miniStagePass()，
              //   否则从面板开的「记忆水晶」会掉进副本翻牌，而且属性发两遍。
              notice('解谜通过')
              miniStagePass()
            }
            break
          }
        }
        if (input.once('Escape')) { st.phase = 'fail' }
      } else if (st.phase === 'stealth') {
        // 「无所遁形」：空格前进一格；被发现就退回起点
        stealthTick(1 / 60)
        if (input.once(' ') || input.once('Enter') || input.once('ArrowRight') || input.once('d')) stealthAdvance()
        if (input.once('Escape')) { st.phase = 'fail' }
      } else if (st.phase === 'morale') {
        // 「士气对抗」：↑↓ 选招式　空格 出手；输了之后按空格重来
        if (st.mo.done === 'lose') {
          if (input.once(' ') || input.once('Enter')) moraleReset()
        } else if (!st.mo.done) {
          if (input.once('ArrowUp') || input.once('w')) st.mo.sel = (st.mo.sel + 2) % 3
          if (input.once('ArrowDown') || input.once('s')) st.mo.sel = (st.mo.sel + 1) % 3
          const rects = moraleRects()
          if (M.inside) {
            const h = rectHit(rects, M.x, M.y)
            S.moHover = h
            if (h >= 0) st.mo.sel = h
            M.applyCursor(cvs, h >= 0)
          } else { S.moHover = -1; M.applyCursor(cvs, false) }
          if (input.once(' ') || input.once('Enter')) moralePlay(st.mo.sel)
          if (M.clicked && S.moHover >= 0) moralePlay(S.moHover)
        }
        if (input.once('Escape')) { st.phase = 'fail' }
      } else if (st.phase === 'slide') {
        // 「魔法工匠」：方向键把宝石推进空位（等价于"向四个方向移动宝石"）
        if (input.once('ArrowUp') || input.once('w')) slideMoveDir(0, 1)
        if (input.once('ArrowDown') || input.once('s')) slideMoveDir(0, -1)
        if (input.once('ArrowLeft') || input.once('a')) slideMoveDir(1, 0)
        if (input.once('ArrowRight') || input.once('d')) slideMoveDir(-1, 0)
        if (M.inside) {
          let hover = -1
          for (let i = 0; i < 9; i++) {
            const r = slideRect(i)
            if (M.x >= r.x && M.x <= r.x + r.w && M.y >= r.y && M.y <= r.y + r.h) { hover = i; break }
          }
          S.slideHover = hover
          M.applyCursor(cvs, hover >= 0)
        } else { S.slideHover = -1; M.applyCursor(cvs, false) }
        if (M.clicked && S.slideHover >= 0) slideMove(S.slideHover)
        if (input.once('Escape')) { st.phase = 'fail' }
      } else if (st.phase === 'pipe') {
        // 「连接能量管线」：↑↓←→ 选格　空格 旋转
        const p = st.pipe
        if (input.once('ArrowLeft') || input.once('a')) p.sel = (p.sel + p.cells.length - 1) % p.cells.length
        if (input.once('ArrowRight') || input.once('d')) p.sel = (p.sel + 1) % p.cells.length
        if (input.once('ArrowUp') || input.once('w')) p.sel = (p.sel + p.cells.length - 3) % p.cells.length
        if (input.once('ArrowDown') || input.once('s')) p.sel = (p.sel + 3) % p.cells.length
        if (M.inside) {
          let hover = -1
          for (let i = 0; i < 9; i++) {
            const r = pipeRect(i)
            if (M.x >= r.x && M.x <= r.x + r.w && M.y >= r.y && M.y <= r.y + r.h) { hover = i; break }
          }
          S.pipeHover = hover
          M.applyCursor(cvs, hover >= 0)
        } else { S.pipeHover = -1; M.applyCursor(cvs, false) }
        if (input.once(' ') || input.once('Enter')) pipeRotate()
        if (M.clicked && S.pipeHover >= 0) { p.sel = S.pipeHover; pipeRotate() }
        if (input.once('Escape')) { st.phase = 'fail' }
      } else if (st.phase === 'shooter') {
        // 「驾驶超级战机」：纯鼠标点击击落（原文：「打飞机的部分不是方向键控制的」）
        shooterTick(1 / 60)
        M.applyCursor(cvs, true)
        if (M.clicked) shooterHit(M.x, M.y)
        if (input.once('Escape')) { st.phase = 'fail' }
      } else if (st.phase === 'current') {
        // 「激流勇进」：←→ 换航道，要在反应窗口内躲开湍流
        currentTick(1 / 60)
        if (input.once('ArrowLeft') || input.once('a')) st.st.lane = (st.st.lane + st.st.lanes - 1) % st.st.lanes
        if (input.once('ArrowRight') || input.once('d')) st.st.lane = (st.st.lane + 1) % st.st.lanes
        if (input.once('Escape')) { st.phase = 'fail' }
      } else if (st.phase === 'quiz') {
        // 「玛丽娜的考试」：↑↓ 选答案　空格 确定；答完按空格继续
        const q = st.quiz
        if (q.picked < 0) {
          if (input.once('ArrowUp') || input.once('w')) q.sel = (q.sel + 2) % 3
          if (input.once('ArrowDown') || input.once('s')) q.sel = (q.sel + 1) % 3
          const rects = quizRects()
          if (M.inside) {
            const hh = rectHit(rects, M.x, M.y)
            S.quizHover = hh
            if (hh >= 0) q.sel = hh
            M.applyCursor(cvs, hh >= 0)
          } else { S.quizHover = -1; M.applyCursor(cvs, false) }
          if (input.once(' ') || input.once('Enter')) quizAnswer(q.sel)
          if (M.clicked && S.quizHover >= 0) quizAnswer(S.quizHover)
        } else {
          if (input.once(' ') || input.once('Enter')) quizNext()
        }
        if (input.once('Escape')) { st.phase = 'fail' }
      } else if (st.phase === 'flip') {
        const f = st.flip
        if (f && f.picked < 0) {
          if (input.once('ArrowLeft') || input.once('a')) S.flipSel = Math.max(0, (S.flipSel || 0) - 1)
          if (input.once('ArrowRight') || input.once('d')) S.flipSel = Math.min(3, (S.flipSel || 0) + 1)
          const rects = flipRects()
          if (M.inside) {
            const h = rectHit(rects, M.x, M.y)
            S.flipHover = h
            if (h >= 0) S.flipSel = h
            M.applyCursor(cvs, h >= 0)
          } else { S.flipHover = -1; M.applyCursor(cvs, false) }
          if (input.once(' ') || input.once('Enter')) pickFlip(S.flipSel || 0)
          if (M.clicked && S.flipHover >= 0) pickFlip(S.flipHover)
        } else {
          if (input.once(' ') || input.once('Enter') || input.once('Escape')) finishDungeon()
        }
      } else if (st.phase === 'miniDone') {
        // 小游戏结算完成 —— 回小游戏列表（不是副本列表）
        if (input.once(' ') || input.once('Enter') || input.once('Escape')) {
          const back = (st.miniResult && st.miniResult.id) || null
          st.id = null; st.phase = 'list'; st.miniResult = null
          S.mode = 'minigames'
          if (back) { const i = D.MINIGAMES.findIndex((m) => m.id === back); if (i >= 0) MINI.sel = i }
        }
      } else if (st.phase === 'done' || st.phase === 'fail') {
        if (input.once(' ') || input.once('Enter') || input.once('Escape')) {
          st.id = null; st.phase = 'list'
          S.mode = 'explore'
          if (S.current) audio.playBgm(S.current.bgm || sceneBgmFor(S.current))
        }
      } else if (st.phase === 'list') {
        // 副本列表：↑↓ 选择　空格 进入　F/Esc 返回
        const list = D.DUNGEONS
        const sel = util.clamp(S.dunSel || 0, 0, list.length - 1)
        if (input.once('ArrowUp') || input.once('w')) S.dunSel = (sel + list.length - 1) % list.length
        if (input.once('ArrowDown') || input.once('s')) S.dunSel = (sel + 1) % list.length
        const rects = dungeonListRects(list)
        if (M.inside) {
          const h = rectHit(rects, M.x, M.y)
          S.dunHover = h
          if (h >= 0) S.dunSel = h
          M.applyCursor(cvs, h >= 0)
        } else { S.dunHover = -1; M.applyCursor(cvs, false) }
        const pick = (i) => {
          const d = list[i]
          if (!d) return
          if (!d.stages.length) { notice(`${d.name}：玩法资料缺失（语料里查不到），按 R1 不编造`); return }
          enterDungeon(d.id)
        }
        if (input.once(' ') || input.once('Enter')) pick(S.dunSel || 0)
        if (M.clicked && S.dunHover >= 0) pick(S.dunHover)
        if (input.once('Escape') || input.once('i') || input.once('I')) S.mode = 'explore'
      }
      // 副本中途允许直接退出（原版是按队伍撤退处理）
      if (st.phase !== 'done' && st.phase !== 'fail' && input.once('Backspace')) {
        notice('放弃了本次副本')
        st.phase = 'fail'
      }
    } else if (S.mode === 'awaken') {
      // ---------- 唤醒多比 ----------
      const list = awakenList()
      AWAKEN.sel = util.clamp(AWAKEN.sel || 0, 0, Math.max(0, list.length - 1))
      if (input.once('ArrowUp') || input.once('w')) AWAKEN.sel = Math.max(0, AWAKEN.sel - 1)
      if (input.once('ArrowDown') || input.once('s')) AWAKEN.sel = Math.min(list.length - 1, AWAKEN.sel + 1)
      const rects = awakenRects(list)
      if (M.inside) {
        const h = rectHit(rects, M.x, M.y)
        AWAKEN.hover = h
        if (h >= 0) AWAKEN.sel = h
        M.applyCursor(cvs, h >= 0)
      } else { AWAKEN.hover = -1; M.applyCursor(cvs, false) }
      const tryAwaken = () => { const fm = list[AWAKEN.sel]; if (fm) awaken(fm) }
      if (input.once(' ') || input.once('Enter')) tryAwaken()
      if (M.clicked && AWAKEN.hover >= 0) tryAwaken()
      if (input.once('Escape') || input.once('h') || input.once('H')) S.mode = 'explore'
    } else if (S.mode === 'treasure') {
      // ---------- 珍宝小屋 ----------
      rollCrystalDay()
      if (input.once('q') || input.once('Q') || input.once('ArrowLeft') || input.once('a')) TREASURE.tab = (TREASURE.tab + 1) % 2
      if (input.once('e') || input.once('E') || input.once('ArrowRight') || input.once('d')) TREASURE.tab = (TREASURE.tab + 1) % 2
      if (TREASURE.tab === 0) {
        // 合成页
        if (input.once(' ') || input.once('Enter')) synthesizeCrystal()
      } else {
        // 翻页（第 52 轮加分页：兑换页有 47 件，一屏放不下）
        const pi = treasurePageInfo()
        if (input.once('q') || input.once('Q') || input.once('ArrowLeft')) {
          TREASURE.page = (pi.page - 1 + pi.pages) % pi.pages; TREASURE.sel = 0
        }
        if (input.once('e') || input.once('E') || input.once('ArrowRight')) {
          TREASURE.page = (pi.page + 1) % pi.pages; TREASURE.sel = 0
        }
        const list = treasureList()
        const rects = treasureRects(list)
        TREASURE.sel = util.clamp(TREASURE.sel || 0, 0, Math.max(0, list.length - 1))
        if (input.once('ArrowUp') || input.once('w')) TREASURE.sel = Math.max(0, TREASURE.sel - 2)
        if (input.once('ArrowDown') || input.once('s')) TREASURE.sel = Math.min(list.length - 1, TREASURE.sel + 2)
        if (M.inside) {
          const h = rectHit(rects, M.x, M.y)
          TREASURE.hover = h
          if (h >= 0) TREASURE.sel = h
          M.applyCursor(cvs, h >= 0)
        } else { TREASURE.hover = -1; M.applyCursor(cvs, false) }
        if (input.once(' ') || input.once('Enter')) treasureBuy(list[TREASURE.sel])
        if (M.clicked && TREASURE.hover >= 0) treasureBuy(list[TREASURE.hover])
      }
      if (input.once('Escape') || input.once('j') || input.once('J')) S.mode = 'explore'
    } else if (S.mode === 'costume') {
      // ---------- 服饰大楼（官方：多拜大街最右端找麦基买服饰）----------
      const stock = costumeStock()
      const per = costumePerPage()
      if (COSTUME.msgT > 0) COSTUME.msgT -= 1 / 60
      if (input.once('q') || input.once('Q')) COSTUME.page = (COSTUME.page + costumePages() - 1) % costumePages()
      const cells = Math.min(per, Math.max(0, stock.length - COSTUME.page * per))
      if (input.once('ArrowUp') || input.once('w')) { COSTUME.sel = Math.max(0, COSTUME.sel - 1); COSTUME.msgT = 0 }
      if (input.once('ArrowDown') || input.once('s')) { COSTUME.sel = Math.min(stock.length - 1, COSTUME.sel + 1); COSTUME.msgT = 0 }
      if (input.once('ArrowLeft') || input.once('a')) {
        COSTUME.sel = COSTUME.sel - 4 >= COSTUME.page * per ? COSTUME.sel - 4 : COSTUME.sel
        COSTUME.msgT = 0
      }
      if (input.once('ArrowRight') || input.once('d')) {
        COSTUME.sel = COSTUME.sel + 4 < COSTUME.page * per + cells ? COSTUME.sel + 4 : COSTUME.sel
        COSTUME.msgT = 0
      }
      if (M.inside) {
        let hover = -1
        for (let i = 0; i < cells; i++) {
          const r = costumeRowRect(i)
          if (M.x >= r.x && M.x <= r.x + r.w && M.y >= r.y && M.y <= r.y + r.h) { hover = i; break }
        }
        COSTUME.hover = hover
        if (hover >= 0) COSTUME.sel = COSTUME.page * per + hover
        M.applyCursor(cvs, hover >= 0)
      } else { COSTUME.hover = -1; M.applyCursor(cvs, false) }
      const cur = stock[COSTUME.sel]
      if (cur) {
        const owned = !!ownedCostumes()[cur.id]
        if (input.once(' ') || input.once('Enter') || (M.clicked && COSTUME.hover >= 0)) {
          if (!owned) buyCostume(cur.id)
          else wearCostume(cur.id)
        }
        if (input.once('r') || input.once('R')) enchantCostume(cur.id)
        if (input.once('e') || input.once('E')) reEnchantCostume(cur.id)
      }
      if (input.once('Escape') || input.once('o') || input.once('O')) S.mode = 'explore'
    }
    input.clearFrame()
    M.endFrame()
  }

  G.input = { update }
})()
