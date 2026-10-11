/* 多克多比 · 适配层：会话端口的**本地实现**（第 72 轮重构 · 批次 7 · 方案 3.1）
   实现 `game/ports/session.js` 的契约。
   —— 单机版**没有登录**：玩家身份 = 本地生成的稳定匿名 id。
      它存在 `localStorage` 的一个独立小键里（与存档槽分开，避免"清档重开"把身份一起清掉）。

   将来接后端 = 新增同契约的 `adapters/http-session.js`（`POST /api/session/login`），
   在 `game/boot.js` 里按 config 选它；本文件不动。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const KEY = 'dkdbb.session.anon'

  function read() { try { return localStorage.getItem(KEY) } catch { return null } }
  function write(v) { try { localStorage.setItem(KEY, v) } catch { } }
  function ensure() {
    let id = read()
    if (!id) { id = 'anon-' + Math.random().toString(36).slice(2, 10); write(id) }
    return id
  }

  const anonymousSession = {
    via: 'local anonymous id',
    current() { return { playerId: ensure(), anonymous: true, server: null } },
    async login() { return { playerId: ensure() } },
    async logout() { /* 单机没有会话可退 —— 空操作（契约要求存在此方法） */ },
  }

  G.adapters = G.adapters || {}
  G.adapters.anonymousSession = anonymousSession
})()