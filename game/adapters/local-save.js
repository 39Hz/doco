/* 多克多比 · 适配层：存档端口的**本地实现**（第 72 轮重构 · 批次 7 · 方案 3.1）
   实现 `game/ports/save-store.js` 的契约。
   —— 数据来源：`localStorage`（同一次运行的快速读写）+ exe 服务器的 `/__save`（落到 save.json）。
      这两条路**已经**由 `game/engine/engine.js` 的 `window.DKDbb.save` 实现好了（含版本迁移 SAVE_VERSION /
      fillDefaults / 数值夹取），方案说 local-save 允许"迁入/复用" —— 这里选**复用**：
      只做转发到 `DKDbb.save`，行为零改动，也免去改动已稳定的存档逻辑带来的风险。

   换后端 = 新增同契约的 `adapters/http-save.js`，在 `game/boot.js` 里按 config 选它；本文件不动。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const save = window.DKDbb.save   // engine.js 建好的存档单例

  const localSave = {
    via: 'localStorage + /__save',
    load: () => save.load(),
    persist: () => save.persist(),
    listSlots: () => save.listSlots(),
    useSlot: (n) => save.useSlot(n),
    saveToSlot: (n) => save.saveToSlot(n),
    deleteSlot: (n) => save.deleteSlot(n),
    newGame: (n) => save.newGame(n),
    reset: (n) => save.reset(n),
    slot: () => save.slot(),
    summarize: (o) => save.summarize(o),
    version: () => save.version(),
  }

  G.adapters = G.adapters || {}
  G.adapters.localSave = localSave
})()