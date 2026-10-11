/* 多克多比 · 端口层：存档读写契约（第 72 轮重构 · 批次 7 · 方案 3.1 / 3.3）
   —— 本文件**只有签名与校验，没有任何实现**（实现见 `game/adapters/local-save.js` 等）。
   今天的实现 = `localStorage` + exe 的 `/__save`；将来接后端 = 同契约的 `adapters/http-save.js`，
   **玩法与界面代码一行不动**。

   契约（DTO）= 现有存档 schema（方案 3.2）：`load(slot)` / `saveToSlot(slot)` 收发的就是
   现在 `window.DKDbb.save.data` 那个对象，字段一一对应；版本迁移留在**适配器**里，后端不做业务判断。

   只读：本文件不做 I/O，只登记契约描述（供 `game/boot.js` 校验适配器是否完整）。 */
(() => {
  'use strict'
  const G = window.DKDbbGame

  // 适配器**必须**实现的成员（缺一即为不合格适配器 —— boot.js 启动时校验）。
  // 对应方案 3.3 的接口清单：读槽 / 写槽 / 列槽 / 删槽 / 当前槽 / 持久化。
  const REQUIRED = [
    'load',        // ()  → 存档对象（当前槽，内存态）
    'persist',     // ()  → 把当前槽落盘（local: localStorage + /__save 防抖）
    'listSlots',   // ()  → [{ slot, info, source }]（主菜单槽位卡片）
    'useSlot',      // (n) → bool 切换当前槽并载入
    'saveToSlot',  // (n) → bool 把当前内存态写入槽 n
    'deleteSlot',  // (n) → bool 删除槽 n
    'newGame',     // (n) → 存档对象（在该槽开新档）
    'reset',       // (n) → void 清空槽并重开
    'slot',        // ()  → number 当前槽号
    'summarize',   // (o) → 摘要（主菜单显示"等级/金币/时间"）
    'version',     // ()  → number 存档 schema 版本
  ]

  // 校验一个适配器是否实现了全部契约成员；返回缺失清单（空 = 合格）。
  function verifySaveStore(impl) {
    if (!impl || typeof impl !== 'object') return REQUIRED.slice()
    return REQUIRED.filter((m) => typeof impl[m] !== 'function')
  }

  G.ports = G.ports || {}
  G.ports.saveStore = {
    kind: 'save-store',
    required: REQUIRED.slice(),
    verify: verifySaveStore,
  }
})()