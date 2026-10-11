/* 多克多比 · 端口层：只读内容表契约（第 72 轮重构 · 批次 7 · 方案 3.1 / 3.3）
   —— 本文件**只有签名与校验，没有任何实现**（实现见 `game/adapters/bundled-content.js`）。
   今天的实现 = 读 `assets/*.js` 静态表；将来热更内容 = 同契约的 `adapters/remote-content.js`
   （`GET /api/content/manifest` + `GET /api/content/table/:name`，带版本与增量），玩法代码一行不动。

   注意：内容表是**只读**的（场景 / 技能 / 怪物 / 任务 / 道具 / 形态…），
   与存档（可写，见 `ports/save-store`）是两回事；两者都不参与战斗结算。

   只读：本文件不做 I/O，只登记契约描述。 */
(() => {
  'use strict'
  const G = window.DKDbbGame

  const REQUIRED = [
    'names',     // ()     → []string 可用表名（forms / skills / monsters / quests / items…）
    'table',     // (name) → 该表（数组或对象）；不存在返回 undefined
    'manifest',  // ()     → { version, tables: { name: hash } }（本地实现给静态版本号）
  ]

  // 校验适配器是否实现了全部契约成员；返回缺失清单（空 = 合格）。
  function verifyContent(impl) {
    if (!impl || typeof impl !== 'object') return REQUIRED.slice()
    return REQUIRED.filter((m) => typeof impl[m] !== 'function')
  }

  G.ports = G.ports || {}
  G.ports.content = {
    kind: 'content',
    required: REQUIRED.slice(),
    verify: verifyContent,
  }
})()