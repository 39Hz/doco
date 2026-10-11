# game/ —— 代码区（游戏本体）

> 先读 [`../目录地图.md`](../目录地图.md)（五区地图）。本文件只讲**这一区怎么写代码**。
> 结构规划全文见
> [`../../3-计划与手册/游戏模块化重构与前后端分层方案.md`](../../3-计划与手册/游戏模块化重构与前后端分层方案.md)。

纯 JS + Canvas，**零第三方依赖、零构建步骤**。`game.html` 按 `<script src>` 顺序加载本目录所有文件。

---

## 1. 目录

```
game/
├── game.js        薄编排（重构后 1281 行：draw() 绘制分发 + 工具栏 + 调试出口 __DKDbb_DEBUG__）
├── input.js       顶层编排：主更新 update(dt)（全部模式的输入分发）+ 命中工具 rectHit
├── boot.js        装配点（适配器装配 + 启动流程 / 主循环 / 工具栏与按键）
├── config.js      离线 / 在线唯一开关
├── README.md / style.css
├── core/          内核（state / canvas / images / toast）
├── engine/        引擎层（engine.js 引擎本体 / mouse.js 输入 / fx.js 特效）
├── tables/        内容表（data / quest / skills-official / form-skills-official / dungeons /
│                  minigames / minigame-links / treasure / costumes / sumo / crystal / forms-acquire）
├── domain/        领域层：纯逻辑、零 I/O
├── ports/         端口契约
├── adapters/      适配层：本地 or HTTP
├── app/           应用层：用例编排，持有 S
└── ui/            界面层：只画 + 收输入
```

> `game.js` 与 `input.js` 都在**顶层**（与 `boot.js` 同级）。`input.js` 的 `update(dt)` 同时查 ui 布局
> （`G.ui.*`）与推 app 状态（`G.app.*`），按依赖铁律只有装配级能同时看见两层，所以它不放 `app/` 也不放 `ui/`。

> `engine/` 与 `tables/` 是**既有文件归位**（原先散在 `game/` 根目录）—— 不是新写的代码。
> 测试台解析 `game.html` 的脚本清单、`_build/make-dist.mjs` 递归拷贝 `game/`，所以归位后
> 只需改 `game.html` 的 `src`，**打包脚本不用动**。

### 1.1 重构前根目录的样子（对照用）

| 文件 | 说明 |
|---|---|
| `game.js` | **13030 行 / 681 KB 的单体 IIFE** —— 状态 / 场景 / NPC / 对话 / 战斗 / 结印 / 副本 / 小游戏 / 经济 / UI 绘制 / 启动 / 调试出口全在这里 |
| `engine.js` | 存档（三槽位 + 版本化迁移：`SAVE_VERSION` / `fillDefaults` / `NULLABLE_FIELDS`） |
| `data.js` | 数值表（形态 / 技能 / 怪物 / 道具 / 元素相克…） |
| `dungeons.js` | 14 个副本数据 |
| `minigames.js` / `minigame-links.js` | 小游戏规则与入口绑定 |
| `crystal.js` | 晶石对战（官方 7 条原文 + 棋盘纯函数） |
| `sumo.js` | 大陆棋（弹弓物理对战） |
| `treasure.js` | 珍宝小屋与白色彩晶石经济 |
| `costumes.js` | 服饰与附魔 |
| `forms-acquire.js` | 形态获取途径 + 立绘判定 |
| `quest.js` | 任务/剧情 |
| `mouse.js` | 鼠标交互 |
| `fx.js` | 特效 |
| `skills-official.js` / `form-skills-official.js` | 官方技能表与按属性配招（**生成物，别手改**） |
| `style.css` | 页面样式 |

> 项目**本来就有模块化习惯**（`engine.js` / `data.js` / `quest.js` / `mouse.js` / `fx.js` …），
> 只是"主体玩法"这条线没收口，全挤进了 `game.js`。重构是**延续既有约定**，不是另起炉灶。

---

## 2. 目标结构（五层 + 一个装配点 / 顶层编排）

```
boot.js + input.js  装配点 + 顶层编排（update(dt)：同时可见 ui 与 app 两层）
   ├── engine/     引擎层（引擎 / 输入 / 特效）
   ├── tables/     内容表（数值 / 副本 / 技能 / 小游戏 / 服饰 …）
   ├── ui/         界面层：只画 + 收输入
   ├── app/        应用层：用例编排，持有 S
   │        ├── domain/   领域层：纯逻辑、零 I/O
   │        └── ports/    端口契约
   └── adapters/    适配层：本地 or HTTP
```

**依赖铁律**：`ui → app → domain`；`app → ports ← adapters`；`domain` 谁都不依赖。
**57 个模块 + 1 个不挂载的占位**（A 内核/引导/顶层编排 7 · B 领域 4 · C 端口+适配 6 · D 应用 19 · E 界面 21；
占位是 `adapters/http-future.js`）—— 逐层清单见方案 §4 的 A–E 表。
方案 §4 **F 节**列出 `game.js` 里**尚未拆走**的部分 —— 目前只剩调试出口 `__DKDbb_DEBUG__`（283 键，形状冻结）、
卡顿看门狗 `PERF` / `perfMark` / `perfText`、工具栏 `syncToolbar` 与死代码 `choiceKeys`。

---

## 3. 写代码时必须守的约定

1. **模块形态：IIFE + `window.DKDbb*` 全局命名空间**（本项目**不能用 ES Module**）。
   原因：测试台 `_tools/game-harness.mjs` 用 `vm.runInContext` 顺序执行 `game.html` 的
   `<script src>`，**`vm` 解析不了 `import/export`**。
   ```js
   // 样板：game/ui/zukan.js
   (() => {
     'use strict'
     const G = window.DKDbbGame
     const { S, ctx, W, H } = G.core          // 只取内核里的共享物
     // ...原样搬过来的代码...
     G.ui = G.ui || {}
     Object.assign(G.ui, { drawZukan, zukanLayout, zukanEntries })
   })()
   ```
2. **一个文件 = 一个模块 = 一个职责**。结构按未来的 ESM 设计，将来迁 ESM 只是换外壳（机械迁移）。
3. **不引依赖、不加构建步骤** —— 项目要求"拉下来双击即玩"。
4. **`window.__DKDbb_DEBUG__` 形状冻结** —— 它是测试台唯一入口，**2200+ 条断言全挂在它的字段上**。
   重构中字段名与结构**一字不改**。
5. **禁止双实现** —— 同一逻辑两份实现必然分叉。`game/` 里没有重复实现的逻辑。
6. **新增文件会被自动加载**：测试台解析 `game.html` 的脚本清单，`_build/make-dist.mjs` 递归拷贝 `game/`，
   **加文件不用改打包脚本**。

---

## 4. 拆一个模块 = 固定五步（缺一不可）

1. **新建** `game/<层>/<模块>.js`（按第 3 节样板注册到约定出口）；
2. **挂载**：在 `game.html` 插入 `<script src="game/<层>/<模块>.js"></script>`（顺序由依赖决定）；
3. **移除**：从 `game.js` 删掉该段，改用**顶部「解构 shim」**取用 —— `const { 名字 } = G.<层>.<模块>`，
   **主体内调用点一处不改**（这是本项目实际采用的手法）；别的模块要直接用则走最终路径 `G.<层>.<模块>.<名字>()`；
4. **验证**：见第 5 节；
5. **记账**：更新方案文档的模块地图 + `STATE.md` 记一行。

> ⚠️ **禁止"先把文件建好、调用点以后再改"** —— 半迁移会让同一个函数存在两份。

---

## 5. 验证（每拆一个模块后必跑）

```powershell
node _tools\run-all-tests.mjs
```

**验收门槛**（纯源码包上不可能"0 失败"）：

- ① 断言数 ≥ `docs/test-baseline.json`（跌了就报错）；
- ② 红名单**恒等于**方案 §6.5 的 5 个环境豁免文件（不新增、不减少）；
- ③ 不出现**新的**"无汇总"脚本。

每批结束后另跑：`ui-overlap.mjs`、`check-canvas-text.mjs`、`check-canvas-bounds.mjs`。