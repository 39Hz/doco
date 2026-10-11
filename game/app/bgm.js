/* 多克多比 · 应用层：场景 BGM 选择（第 72 轮重构批次 4）
   来源：原 game.js 第 1528–1550 行，内容一致（含归属说明注释）。
   依赖：全局脚本 assets/bgm/scene-bgm.js 提供的 window.__DKDbb_BGM__（只读内容表）。
   只经 G.app.bgm 出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'

  const G = window.DKDbbGame

  // ==================== 音乐归属 ====================
  // 原版素材目录里有一套**带场景名**的曲子（战斗场景/多比城堡/多比大街/索亚城/
  // 乌卡前线/悬疑密室/勇气峡谷…），经 _tools/import-named-bgm.mjs 收进 assets/bgm/named/，
  // 归属表写在 assets/bgm/scene-bgm.js。
  // 之前一直用 assets/bgm/music001~021.mp3 —— 那些是无名、低码率的另一批文件，
  // 所以"进战斗音乐不变"（startBattle 里压根没切音乐）。
  const BGMT = (window.__DKDbb_BGM__ && window.__DKDbb_BGM__.pick) || {}
  const BGM = {
    battle: BGMT.battle || null,
    boss: BGMT.boss || null,
    town: BGMT.town || null,
    wild: BGMT.wild || null,
    dungeon: BGMT.dungeon || null,
    title: BGMT.title || null,
  }
  // 场景该放哪首：主城/集市用城镇曲，其余野外用野外曲；副本类场景（名字带"副本"）用悬疑
  function sceneBgmFor(sc) {
    if (!sc) return BGM.title
    const isl = sc.island
    if (/副本|遗迹|废墟|地穴|矿洞/.test(sc.name || '')) return BGM.dungeon || BGM.wild
    if (isl === 'castle' || isl === 'market') return BGM.town || BGM.wild
    return BGM.wild || BGM.town
  }

  G.app = G.app || {}
  G.app.bgm = { BGM, sceneBgmFor }
})()