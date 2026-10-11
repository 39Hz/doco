/* 多克多比 · 适配层：内容端口的**本地实现**（第 72 轮重构 · 批次 7 · 方案 3.1）
   实现 `game/ports/content.js` 的契约。
   —— 数据来源：静态内容表 `window.DKDbbData`（由 `assets/*.js` 装配，只读）。
      将来热更内容 = 新增同契约的 `adapters/remote-content.js`，在 `game/boot.js` 里按
      `config.contentSource` 选它；本文件不动。

   只读：本文件不做任何写操作，也不参与战斗结算。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const CONTENT_VERSION = 'bundled-1'

  const data = () => window.DKDbbData || {}
  // 可用表名 = `D` 上的公开键（跳过 `_` 私有键与函数）。
  function names() {
    const d = data()
    return Object.keys(d).filter((k) => k[0] !== '_' && typeof d[k] !== 'function')
  }
  function table(name) { return data()[name] }
  // 本地 manifest：没有远端版本号，用各表长度当轻量"指纹"（内容变了它就会变）。
  function manifest() {
    const d = data(), tables = {}
    for (const n of names()) {
      const v = d[n]
      tables[n] = '#' + (Array.isArray(v) ? v.length : Object.keys(v || {}).length)
    }
    return { version: CONTENT_VERSION, tables }
  }

  G.adapters = G.adapters || {}
  G.adapters.bundledContent = { via: 'assets/*.js', names, table, manifest }
})()