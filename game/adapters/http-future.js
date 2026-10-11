/* 多克多比 · 适配层：将来的后端实现 —— **本期只留占位与契约文档，不写网络**（方案 3.1 / 3.3）
   ==========================================================================================
   本文件**不挂进 game.html、不注册任何东西、不写一行网络代码**。它只把"接后端时要写什么、
   契约长什么样"钉在这里，避免以后重新推导。今天跑的是本地适配器
   （`local-save.js` / `bundled-content.js` / `anonymous-session.js`），由 `game/boot.js` 按
   `window.DKDbbConfig` 选；届时新增下面三个文件并在 boot 的选择分支里登记即可，**玩法与界面代码一行不动**。

   需要新增的三个适配器（各自实现对应 port 的契约，DTO 与今天完全一致 —— 见 3.2）：

     adapters/http-save.js     实现 ports/save-store.js
     adapters/remote-content.js 实现 ports/content.js
     adapters/http-session.js  实现 ports/session.js

   接口清单（方案 3.3，前后端约定，冻结）：
     POST /api/session/login        → { token, playerId }
     GET  /api/save/:slot           → { __v, ...存档字段 }        # DTO = 现有存档 schema
     PUT  /api/save/:slot           → { ok }
     GET  /api/content/manifest     → { version, tables: { forms:'#hash', skills:'#hash', ... } }
     GET  /api/content/table/:name  → { name, rows:[...] }

   边界（3.3）：后端**不参与战斗结算**；本期后端定位是 账号 + 云存档 + 内容分发。
   存档版本迁移（SAVE_VERSION / fillDefaults）留在**前端适配器**里，后端只落库、不做业务判断。
   若将来要做服务端权威战斗，那是**新增端口**（ports/battle-authority），不改现有分层。

   实现本地适配器的坑（照抄即可，避免重踩）：
     · fetch 在"浏览器直接打开 dist/web"或 Node 测试台里可能不存在 → 每个请求前 `typeof fetch === 'function'` 守卫；
     · 存档写要做防抖（战斗里血量频繁变化），本地实现就是 400ms；
     · `useSlot` / `saveToSlot` 要能 await，因为它们本质上都是 IO。 */