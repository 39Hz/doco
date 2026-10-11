/* 多克多比 · 运行配置
   —— 这是**唯一**决定"离线 / 在线"的地方（见方案 3.4 节）。
   今天跑的是本地适配器（mode:'offline'）；将来接后端时只改这里两行，
   玩法与界面代码一行不动。

   注意：本文件不引入任何依赖、不做任何 I/O，只提供一个配置对象。 */
(() => {
  'use strict'
  window.DKDbbConfig = {
    mode: 'offline',          // 'offline' | 'online'  —— 唯一开关
    apiBase: '',              // online 时的后端入口（offline 忽略）
    contentSource: 'bundled', // 'bundled'（本地 assets/*）| 'remote'（将来 /api/content/*）
  }
})()