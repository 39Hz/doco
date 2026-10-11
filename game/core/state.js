/* 多克多比 · 内核（core/state.js）
   职责：共享状态树 S、画布 cvs/ctx 与尺寸 W/H —— 以及 `window.DKDbbGame` 命名空间本身。
   依赖：无（只取页面里已存在的 <canvas id="game">）。谁都不依赖它，它也不依赖别人。

   ⚠️ 这是全项目共享物的**唯一**所在：
   - 其它模块一律从 `window.DKDbbGame.core` 取 S / ctx / W / H，**不得自建全局状态**（见方案 2.1）。
   - 本文件只定义内核，不含任何玩法逻辑。

   来源：原 `game/game.js` 第 8–35 行（第 72 轮重构批次 1 迁出），内容完全一致。 */
(() => {
  'use strict'

  const cvs = document.getElementById('game')
  const ctx = cvs.getContext('2d')
  const W = cvs.width, H = cvs.height

  const S = {
    mode: 'loading',      // loading|title|pick|worldmap|explore|dialog|battle|result|travel|questlist|warreport
    scenes: {}, world: null, questsLoaded: 0,
    // target: 点击寻路的目标点；没到达前持续朝它走
    player: { x: W / 2, y: 430, speed: 210, facing: 1, moving: false, t: 0, walkPhase: 0, target: null },
    current: null,
    dialog: null, battle: null,
    travelSel: 0, pickSel: 0, mapSel: 0, questSel: 0, bagSel: 0, bagPage: 0, statSel: 0, bagHover: -1,
    skpSel: 0, skpPage: 0, skpHover: -1,
    // 配招（第 55 轮）：当前选中的装备格 / 鼠标悬停的装备格
    skpEquipSel: 0, skpEquipHover: -1,
    soyaSel: 0, soyaHover: -1,
    result: null, toast: null,
    // 卡顿面板开关（F3）：显示 FPS 与"卡帧"统计，用来定位"切快了卡住"
    showPerf: false,
    // 属性面板上悬停的按钮（'prev'/'next'/'close'）—— 鼠标交互用
    statBtnHover: null,
    hoverCmd: -1, hoverSkill: -1, hoverEnemy: -1,
    images: new Map(),
    form: null,
    nearby: null,          // 当前可互动的目标
    hover: null,           // 鼠标悬停的目标
    okCursor: false,
  }

  window.DKDbbGame = window.DKDbbGame || {}
  window.DKDbbGame.core = { cvs, ctx, W, H, S }
})()