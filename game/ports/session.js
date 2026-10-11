/* 多克多比 · 端口层：会话契约（第 72 轮重构 · 批次 7 · 方案 3.1 / 3.3）
   —— 本文件**只有签名与校验，没有任何实现**（实现见 `game/adapters/anonymous-session.js`）。
   今天的实现 = 单机匿名（无登录）；将来接后端 = 同契约的 `adapters/http-session.js`
   （`POST /api/session/login → { token, playerId }`）。

   会话只管"玩家是谁"，不涉及存档内容与内容表 —— 存档槽位属于 `ports/save-store`。

   只读：本文件不做 I/O，只登记契约描述。 */
(() => {
  'use strict'
  const G = window.DKDbbGame

  const REQUIRED = [
    'current',   // () → { playerId, anonymous, server }（同步取当前身份）
    'login',     // () → Promise<{ playerId }>；匿名实现直接 resolve 本地 id
    'logout',    // () → Promise<void>；匿名实现为空操作
  ]

  // 校验适配器是否实现了全部契约成员；返回缺失清单（空 = 合格）。
  function verifySession(impl) {
    if (!impl || typeof impl !== 'object') return REQUIRED.slice()
    return REQUIRED.filter((m) => typeof impl[m] !== 'function')
  }

  G.ports = G.ports || {}
  G.ports.session = {
    kind: 'session',
    required: REQUIRED.slice(),
    verify: verifySession,
  }
})()