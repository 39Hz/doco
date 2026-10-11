# STATE —— 会话状态

> 用途：接手者（人或 AI）先读这一页就知道**现在在哪**。
> 每轮迭代结束必须更新。格式与规则见 **`00-PLAN.md`**（v3.0，仓库内唯一权威源）。
> ⚠️ 本页的数字是**副本**：跑 `node _tools\check-plan-freshness.mjs` 核对，对不上就改本页。

**最后更新**：第 72 轮（**模块化重构 · 批次 1 内核分层 + 批次 2 领域层 + 批次 3 界面层样板** —— 批次 1 新增 `game/config.js` 与 `game/core/{state,canvas,images}.js`，`__DKDbb_DEBUG__` 形状冻结（`_tools/test-debug-surface.mjs`，283 键）；批次 2 新增 `game/domain/{turn-order,battle-math,seal,dungeon-rules}.js`（纯逻辑零 I/O，解构 shim）；批次 3 迁出 `game/ui/panels.js`（原版面板/名牌/条形等纯绘制原语，零存档）、`game/ui/places.js`（地点列表）、`game/ui/zukan.js`（图鉴）；批次 4 迁出应用层系统类 `game/core/toast.js` + `game/app/{rename,warreport,economy,awaken,dungeon,bgm}.js`（起名字/战报/经济/唤醒/副本/BGM），批次 5 迁出世界与对话 `game/app/{dialog,npc,spawn,scene,player}.js`（对话/NPC/刷新/场景/玩家），批次 6 迁出战斗 `game/app/battle.js` + `game/ui/battle-view.js`（战斗逻辑与绘制；解构 shim + `G.app.*`/`G.ui` 惰性引用）。回归 56 文件 / 2252 断言 / 0 失败（本机 5 个环境豁免恒红；断言实测 2174 / 17）。上一轮（第 55 轮）＝技能图标 84 个 + 配招系统 + 修"点什么都不动" + 局内全部可点击 + v0.9 交接包。**接手请先读 `docs/交接与协作指南.md`**）
元素归一化/编号规则/两条链打通；回归 52 文件 2178 断言 0 失败。详见 docs/自主迭代日志.md 第 55 轮）
第 63 轮把"缺 33 只多比立绘"拆成 **能补 / 格式卡住 / 真没有** 三类，补上英雄多比；<br>第 62 轮把 B14 的 5 个官方场景新增进游戏 → **场景 88 → 93**；第 59 轮修通「冲上云霄」→ 13/13 小游戏可玩）
**当前版本**：v0.9（发布包 `多克多比v0.9单机版.zip`，由 `node _tools/make-release.mjs` 产出）

**第 72 轮（模块化重构 · 批次 1）**：按 `3-计划与手册/游戏模块化重构与前后端分层方案.md` 把 13030 行的 `game/game.js` 单体 IIFE **先拆地基**：`game/config.js`（离线/在线唯一开关）、`game/core/state.js`（共享状态树 `S` + 画布 `cvs/ctx/W/H` + `window.DKDbbGame` 命名空间本身）、`game/core/canvas.js`（自适应 `fit()`）、`game/core/images.js`（图片缓存 + `drawMonster`）；`game.html` 按依赖顺序挂载，`game.js` 顶部改为从 `window.DKDbbGame.core` 解构，主体其余引用一处不改。新增 `_tools/test-debug-surface.mjs` + 快照 `_tools/debug-surface.snapshot.json`（**283 键**）冻结调试出口，后续搬模块不会误伤 2200+ 条挂在它上面的断言。**`boot.js` 延后**到收尾装配批（它是主循环 + 事件绑定 + 出口注册的装配点，依赖届时才存在的 `app/*`、`ui/*`；提前搬等于一次性暴露 game.js 全部内部符号 = 半迁移）。

**第 72 轮（模块化重构 · 批次 2）**：把战斗/结印/副本的**纯逻辑叶子**迁到 `game/domain/`（零 I/O，Node 可裸测）：
`turn-order.js`（出手顺序 `orderBySpeed`）、`battle-math.js`（双伤害通道 `channelOf/buffed/atkOf/defOf`、同属性加成 `elementFitMul`、防御曲线 `defFactor`、速度倍率 `speedMultiplier`）、
`seal.js`（SP 上限/结印步数/每步限时/倍率曲线 `sealMultiplier`）、`dungeon-rules.js`（士气对抗 3×3 收益表）。
手法沿用批次 1 的**解构 shim**：`game.js` 顶部 `const { ... } = G.domain.xxx`，主体内所有调用点**一字不改**；`game.html` 在 `core/images.js` 之后、`game.js` 之前按序挂载。
**有意未迁**（避免 domain→app 反向依赖）：`expectedDamage/damage/soyaAtkMul/soyaDefMul`（读 `activeSoya()`→存档 S）、`gainSp/startSeal/sealAdvance/finishSeal`、`stealth*`、副本小游戏实现（读 `dungeonState()`/`ctx`）——这些归入将来的 `app/*`。
踩到并修掉一处**自伤**：新注释里的生僻字「搬」不在字形图集里，`test-glyphs.mjs` 当场报红 → 改用「迁」。
回归 = 本机基线（56 文件 / 51 通过 / 5 环境豁免；断言 2171 / 17）。

**第 72 轮（模块化重构 · 批次 3 · 界面层样板）**：按方案 §5 的**五步协议**迁出第一个 `ui/*` 模块 `game/ui/panels.js`——原版风格面板 `drawOrigPanel`、橙色方钮 `drawOrigBtn`、战斗名牌 `drawBattleNameplate`、通用条形 `drawBar`、圆角路径 `roundBox`（都是**纯绘制原语**：只依赖内核 `ctx` + 引擎 `util/text/art`，**零存档访问**）。
手法仍是**解构 shim**：`game.js` 顶部 `const { roundBox, drawBar, drawOrigPanel, drawOrigBtn, drawBattleNameplate } = G.ui`，主体内所有调用点（含 `roundBox` 的 20+ 处）**一字不改**；`game.html` 在 `core/images.js` 之后、`game.js` 之前挂载。
结构守卫 `test-module-boundary.mjs` 的 `ui/` 分支（"只画不裁决：不读存档 / 不算伤害"）**首次生效并转绿** —— 迁出的样板被静态扫过，确认零存档访问。
回归 = 本机基线（56 文件 / 51 通过 / 5 环境豁免；断言 2171 / 17），`test-glyphs` 10/0（38 脚本）、`test-debug-surface` 14/0（283 键不变）。

**第 72 轮（模块化重构 · 批次 3 · 地点列表）**：按同一五步协议再迁一个 `ui/*` 模块 `game/ui/places.js`——地点列表布局 `placesLayout` + 绘制 `drawPlaces`（含常量 `PLACES`）。只依赖内核 `S/ctx/W/H/bgImage` + 引擎 `util/text`，**零存档访问**；`game.js` 顶部新增 `const { placesLayout, drawPlaces } = G.ui` 解构 shim，调用点（互动逻辑 `placesLayout`、渲染分发 `drawPlaces`）**一字不改**。
回归 = 本机基线（56 文件 / 51 通过 / 5 环境豁免；断言 **2172** / 17），`test-glyphs` 10/0（**39 脚本**）、`test-debug-surface` 14/0（283 键不变）、`test-module-boundary` **19/0**。

**第 72 轮（模块化重构 · 批次 3 · 图鉴）**：按同一五步协议再迁一个 `ui/*` 模块 `game/ui/zukan.js`——图鉴（多比 / 技能 / 索亚 / 怪物 / 骑士与魔王）的状态 `zukanState`、条目 `zukanEntries`、布局 `zukanLayout`、图集缓存与绘制 `drawZukan`（含常量 `ZUKAN` / `CONF_LABEL` / `CONF_COLOR`）。只依赖内核 `S/ctx/W/H` + 引擎 `util/text` + **内容表** `window.DKDbbData`（D，非存档）+ 同层 `G.ui.roundBox`，**零存档访问**；`game.js` 顶部新增 `const { ZUKAN, zukanState, zukanEntries, zukanLayout, drawZukan } = G.ui` 解构 shim，调用点（`L` 键入口、输入分发、渲染分发、调试出口 `zukanTabs/zukanEntries/zukanLayout`）**一字不改**。
回归 = 本机基线（56 文件 / 51 通过 / 5 环境豁免；断言 **2173** / 17），`test-glyphs` 10/0（**40 脚本**）、`test-debug-surface` 14/0（283 键不变）、`test-module-boundary` **20/0**。

**第 72 轮（模块化重构 · 批次 4 · 应用层系统类）**：按方案 §5 同一五步协议把 `game.js` 里的**系统类用例编排**迁到 `game/app/`（有共享 `S`，但接口清晰）：① `game/core/toast.js`（共享 toast 原语，先立 app 层共同依赖）；② `game/app/rename.js`（起名字：玩家名 / 多比昵称）；③ `game/app/warreport.js`（战报任务 66 条）；④ `game/app/economy.js`（白色彩晶石经济 + 珍宝小屋兑换 + 在线礼包）；⑤ `game/app/awaken.js`（变身唤醒 `canAwaken/awaken/grantForm/lockedForms` + 唤醒小游戏「管线 / 答题 / 射击」编排）；⑥ `game/app/dungeon.js`（副本全流程 `enterDungeon/startDungeonStage/curStage/stealth*/morale*/finishDungeon/grantAttr`）；⑦ `game/app/bgm.js`（`BGM` 归属表 + `sceneBgmFor`）。
手法仍是**解构 shim**（顶部 `const { ... } = G.app.xxx`，`game.js` 主体调用点一处不改）；跨模块引用（dungeon↔awaken 的管线 / 空战关、economy/dungeon 的 `grantForm`、dungeon 所需的 14 个小游戏工厂）一律走 `G.app.*` **惰性别名**（调用时才解析）→ 加载顺序无关。`game.html` 挂载 `core → domain → ui → app（bgm → rename → warreport → economy → awaken → dungeon）→ game.js`。
**顺手修掉两个源码级测试的假红**：`test-crystal.mjs`、`test-form-art-gate.mjs` 原先只扫 `game/game.js`，模块搬家后误报 → 改为递归扫整棵 `game/` 树（`test-crystal` 59→**61**、`test-form-art-gate` 12→**14**）。
回归 = 本机基线（56 文件 / 51 通过 / 5 环境豁免；断言 **2173** / 17），`test-glyphs` 10/0、`test-debug-surface` 14/0（283 键不变）、`test-module-boundary` 20/0。
**只报不改（既有缺陷，登记备查）**：`WAR_ISLAND_SOYA_CHANCE` 在 `game/game.js` 全程**从未声明**（严格模式下会 ReferenceError，整岛首通给稀有索亚的分支不可达）——因本轮是纯结构重构、要求行为完全等价，故原样保留，已在 `game/app/warreport.js` 头部注释登记。

**第 72 轮（模块化重构 · 批次 5 · 世界与对话）**：按同一五步协议把 `game.js` 里的「世界与对话」迁到 `game/app/`（涉及主循环，风险中高）：① `dialog.js`（对话推进 `say`/`playQuest`/`advanceDialog`/`finishDialog`）；② `npc.js`（NPC 排布 `npcLayout`/`npcPositions` + 功能菜单 `openActorMenu`/`questMenuLabel`/`currentQuestNpcFor` + 恢复生命 `HEAL_NPCS`/`healerFor`/`doHeal`）；③ `spawn.js`（小怪刷新 `refreshSpawns`/`tickRespawns` + 场景内容生成 `sceneSpawns`）；④ `scene.js`（`WALK`/`walkBounds` + 出口 + `sceneLabel`/`gotoScene`/`enterScene`）；⑤ `player.js`（属性/服饰附魔/配招 + `applySaveToRuntime` + `grantExp`）。
手法仍是**解构 shim**；函数型导出走 `G.app.*` 惰性别名，数组/对象常量（`HEAL_NPCS` 等）按属性直接访问（不用可调用别名）。临时桥新增 `G.app.openShop`/`openAwaken`/`openTreasure`/`openCostumeShop`/`startMinigame`/`openMinigames`、`G.app.costumePool`、`G.app.MINI`（`MINI` 是 `const`，桥必须放在其声明之后以免 TDZ）；**删除** `G.app.sceneLabel`、`G.app.grantExp`（已由 scene.js / player.js 注册），`warreport.js`/`dialog.js` 改走最终路径 `G.app.scene.sceneLabel` / `G.app.player.grantExp`。
**顺手修掉 `test-npcs.mjs` 的假红**（只扫 `game/game.js` → 改扫整棵 `game/` 树）。
回归 = 本机基线（56 文件 / 51 通过 / 5 环境豁免；断言 **2173** / 17），`test-glyphs` 10/0、`test-debug-surface` 14/0（283 键不变）、`test-module-boundary` 20/0。

**第 72 轮（模块化重构 · 批次 6 · 战斗）**：`S.battle` 共享最重的一批，按方案 §5 **分两阶段**做（各自五步协议 + 回归）：① `game/app/battle.js`（**战斗编排与结算**：`makeUnit`/`perform`/`damage`/`expectedDamage`/`applyBuff`、回合流程 `buildTurnOrder`/`beginRound`/`advanceTurn`/`endRound`/`nextPhase`/`actEnemy`/`tickCooldowns`/`beginAction`/`petAct`/`checkBattleEnd`/`battleTick`、技能 `skillBlockReason`/`useSkill`/`firstUsableSkill`/`nextUsableSkill`、道具 `itemRects`/`performItem`/`doCommand`/`battleBtnAct`、结印 `gainSp`/`startSeal`/`sealAdvance`/`finishSeal`、索亚 `soyaAtkMul`/`soyaDefMul`/`soyaBattleStats`/`soyaAttacker`、播报 `notice`/`battleLog`、`leaveBattle`/`startBattle`/`animLen`）；② `game/ui/battle-view.js`（**战斗绘制**：`battleLayout`/`battleConfirm`/`battleEnemyHitTest`/`drawBattleMsgAndButtons`/`drawSealUI`/`drawTurnOrder`/`drawBattle`）。
`rectHit` 因战斗外有 10+ 处引用（地点列表 / 图鉴 / 背包 / 商店…）**留在 game.js**。`notice`/`startBattle` 随 battle.js 迁走 → 改由该模块注册 `G.app.notice`/`G.app.startBattle`（economy/awaken/dungeon 照旧惰性取用），删除 game.js 对应两行桥。`ui/battle-view.js` 按 ui 约定**扁平**注册进 `G.ui`（`Object.assign(G.ui, {...})`，同 panels/places/zukan），并满足守卫"只画不裁决"（把 `drawBattle` 里读 `save.data.items` 改为经 `G.app.bagOwned`/`G.app.bagCount` 桥）。
回归 = 本机基线（56 文件 / 51 通过 / 5 环境豁免），断言 **2174** / 17（较 2173 **+1**：`test-module-boundary` 按 ui 文件数新增的 1 条"只画不裁决"断言，属新增模块的正当覆盖），`test-glyphs` 10/0、`test-debug-surface` 14/0（283 键不变）、`test-module-boundary` **21/0**。

---

## 1. 当前进度一句话

游戏已可玩通：主菜单/三存档槽 → 世界地图（七大地形 + 通道图）→ **93 场景**（第 62 轮起；原 88 + B14 补的 5 个官方场景）→ 回合制战斗
（含官方 SP + 结印技、场景互通、小怪刷新、按速度的出手顺序、图鉴、每座岛播原版命名 BGM）。
存档已**版本化并可迁移老档**。M4 持续落地：**战报任务（66 条）**、**恢复生命 NPC**、
**官方 13/14 副本可通关**（骨架 + 7 个已按原文定制的小游戏）、**魅力属性**（官方硬规则：只能从副本获得）、
**白色彩晶石经济闭环**、**变身唤醒**（官方唤醒条件）、
**小游戏系统**（17 个登记 / **12 个可玩**；Y 键 / 小游戏向导 / 8 位 NPC 入口）、
**多比形态 52 只**（28 张原版立绘，全部来自归档）、**难度档位**（默认「简单」，N 键切「普通」）、
**服饰购买 + 附魔**（多比大街最右端服饰大楼 · 麦基 · 10 套官方服饰 · 五级虚空水晶附魔 · 变身也享受）。

**第 46 轮（止血轮）**：计划书 v3 落进仓库根目录 `00-PLAN.md`；
新增开工自检 `_tools/check-plan-freshness.mjs`（当场抓到 4 个真问题）；
新增发布脚本 `_tools/make-release.mjs`（R11：**0 字节包直接终结**）；
修掉 `_build/make-dist.mjs` 里发给玩家的说明**写死"v0.1 / 11 形态 / 17 技能 / 34 怪"**（改成从数据文件现取）；
新增 `check-scene-npc.mjs`（全场景 NPC 体检，抓到"第 9 个 NPC 被摆到画面外"）与 `check-canvas-bounds.mjs`（R14 几何断言）。

**第 47 轮（证据挖掘轮）**：新建 `_tools/mine-corpus.mjs` + `_tools/read-corpus.mjs`—— 在 **2672 篇**语料里按关键词召回、只精读命中的几篇（C9 的落地）。
一次召回拿到 **4 个小游戏完整玩法 + 2 个对战副本真规则 + 索亚迷局全剧情**，逐字登记在
`docs/官方资料库.md` **第 16 章**：
- **可玩 9 → 11**：新增「**哈里的金币**」（金币掉进箱子，箱子要二维移动 —— 官方技巧"按住四个方向键"的前提）、
  「**魔镜世界**」（躲怪物 + 开箱子 + 找钥匙，**方向被镜像**）
- ~~规则查明、机制留下一轮：「冲上云霄」…~~ **→ 第 59 轮已实现并通过验证**（可玩 12 → **13**）；
  「极限顶顶球」也已实现（含官方两条：**AI 数值就是要更高**、**得分归属只看球进哪一边**）
- **两个官方点名的小游戏 NPC**：**华多**（多比大街 → 哈里的金币）、**安迪**（智慧学堂 → 魔镜世界）
- **大陆棋 / 晶石对战不是"打一场架"**：一个是**推人下河**的物理对战（四类多比 + 六项属性），
  一个是**三消攒能量 + 多比自动出手 + 5v5** —— 现有实现与原文不符
  → **大陆棋已在第 51 轮重做完毕（V69）**；**晶石对战仍未重做**
- **查不到的如实写进 16.7**（疯狂冰激凌 / 多克大富翁 / 时空裂隙 / 凤凰四道考验 / 英雄抉择），免得下一个人重复找

**第 57 轮（晶石对战按原文重做：最后一块"规则已查明、实现不符"）**：
- 原先这一关是**一关 `boss`**（数据表自己写着"单机版简化为一场战斗"）—— 与官方原文不符。
  官方（7k7k/563849 · 545865）说的是**三消攒能量 + 多比自动出手 + 1 主将 4 副将的 5v5**。
- 新增 `game/tables/crystal.js`（官方 7 条原文 + 棋盘**纯函数**）+ 关卡 `kind: 'crystal'`；
  数据表从 `boss` 改成 `crystal`，`conf` 由 `derived` 提到 **`official`**。
- 新测试 `test-crystal.mjs` **61 项**：**按官方那 7 条逐条写断言**（"是否忠于原文"变成可验证的）。
- 抓到并修掉 3 个真问题：棋盘压住我方卡片、回合提示压住副本标题栏（`check-canvas-text` 报压字）、
  **双方同时全灭误报胜利**。
- 一处**读窄了原文**的自我修正：第 5 条「只有…**才会有作用**」不等于"才存在"——
  不符合的晶石也在棋盘上、只是没作用（第一版只放我方属性 → 棋盘只有 2 种晶石，没有难度）。
- 登记 **V76**（重做）· **V77**（双方全灭 + 无用晶石两处 corner）。

**第 54–57 轮（用户定调：主角形象 + 起名字 + 选槽存取 + 怪物朝向修反 + 晶石对战）**：
- **主角在场景里画什么（V74 → V78，绕了四圈才定案）**：合成的多比走路被用户连报三轮
  （飘 → 脚消失 → **多腿人**），根因是**一张站立立绘里没有"腿怎么迈"的信息**。
  中途试过：① 走多克（归档 10 套 × 4 方向 × 17 帧的真走路动画，NPC 用的就是它）；
  ② 用户指出"多克是那种基础人形"→ 我**程序化画**了一版基础多克（腿真能反相迈，但画面不好看）。
  **最终定案（V78，用户原话「你别画图了，直接用战斗角色吧」）**：
  **场景里就是战斗里那只多比**（当前形态的官方立绘 + 走路帧），
  **穿了服饰才换成服饰的时装帧**。程序化那套（`game/dok.js`）已删除。
- **起名字**：玩家名（R 键，新档建档后也会问）+ 多比昵称（属性面板 R）。用**隐藏 DOM input** 收字，
  中文输入法可用。顶栏显示 `【玩家名】变身：昵称`。
- **三存档槽**：选槽载入（原有）+ **选槽保存**（新，存别的槽不打断当前档）+
  **选槽建档位置**（新，修掉"新的冒险静默清掉当前槽"）。
- **怪物朝向（V75）**：用户报「怪物还是反的」。同一个朝向参数**换了两个名字还是被读反**
  （`faceLeft` → `faceRight` → 现在叫 `flip`，只回答"要不要镜像"）。判据改成**读素材 PNG 判朝向**，
  不靠注释；新测试钉住"绿毒粘液兽不许镜像"。
- 新增 `docs/npc-动作图/`：10 套 NPC 全部动作帧 **731 张** + 联系表 + 总览 + README（含实测的"哪个是真走路"）。

**第 53 轮（走路帧：合成步态，已被第 54 轮取代）**：
- 查清"飘"的来源：**NPC 看着对**是因为用的是「时装序列」的**真走路帧**（43 套 ×4 方向 ×17~31 帧）；
  **主角像飘**是因为它用的是**大幅站立立绘**、靠 `ctx.rotate(sin)` 绕脚底来回摆 + `lift` 上浮 ——
  一张静态图当钟摆；而**归档里没有多比的走路循环**（`多比形态序列` 只有光多比/凤凰多比，且全是战斗动作）。
- **处置（V73）**：以官方立绘为源**合成 4 帧步态**（`_tools/gen-form-walk.mjs`）：**脚底钉住**的挤压 +
  **以底边为支点**的侧倾，产出 `assets/forms/walk/` **46 只 × 4 帧 = 184 张**；
  走路改成逐帧切换（**去掉旋转**）；给主角（走/站）与 NPC 补**接地影**。
  幅度与锐化强度都是**量出来的**（锐化按拉普拉斯方差收到原图 1.0~1.15 倍，第一版会出白边）。
- **高清那条线归另一个会话**：用户要求停手。本项目只做了 `imageSmoothingQuality='high'`（渲染侧），
  **没有**对 `assets/forms/art/` 做超分/重绘/锐化；两边的边界写在 `docs/交接-高清立绘线.md`。
- 顺手查出（只报告）：`温德冽.png` 与 `旋风多比.png` **字节完全相同**（第 32 轮改判后的遗留副本，
  一度删掉、**已还原**）；47 张立绘只有 27 张接在形态表上，**25 只形态归档里确实没有立绘**。


- 查出真问题：52 只形态里**只有 4 只可唤醒**，另 **48 只**写"限定形态 · 靠活动/掉落获得"，
  而单机版**没有活动、也没有对应掉落** → 48 只永远是死的。面板等于在让玩家去找一个不存在的东西。
- **处置（V72）**：限定形态改走两条做得出来的路 —— ① **珍宝小屋兑换**（用官方货币白色彩晶石，8/18/36 三档，
  价格按形态**官方数值排名**分档）② **13 个副本首通必掉**（一副本一只、主题相符、首通才有，不是概率）。
  面板逐只写明途径，底部两行回答"条件在哪、活动在哪"。
- **P1 收尾**：新增 `check-canvas-text.mjs` —— 在测试台记录**每一次 fillText 的真实坐标**（含变换矩阵），
  对 **43 个界面**断言"文字都在画面内 + 不互相压住"。一上来抓到 3 处真问题（存档摘要右边被切、
  岛名压住邻岛编号、小游戏列表的"可玩"）并全部修掉；做了**反向验证**（改回旧写法立刻报红）。
- **测试台保真度**：`measureText` 原先不认中文（按每字符 8px 估，差近一倍）→ 改成按字体与字形估宽；
  假 ctx 补上**变换矩阵跟踪**；`text.wrap` 不再写死 16px 量宽。
- **自查抓到自己**：`test-form-source.mjs` 的"副本 id 都真实存在"报红 —— 我第一版 13 个 id 里**编了 10 个**；
  兑换页加到 47 件后**画到屏幕外**，被切片断言与 `test-treasure` 同时抓到 → 给珍宝小屋**加了分页**。

**第 51 轮（大陆棋按原文重做 + M2-2 场景逐地形归属）**：
- **大陆棋**从"对 AI 打一局"（`kind:boss`）重做成**弹弓物理对战**（`kind:sumo`）：
  拉弓（方向＋大小）→ 松手发射 · 撞进河里淘汰 · 重量决定被推开距离 · 冷却决定出手顺序 ·
  四类多比（近身只靠撞 / 中距离 1-3 道光波 / 远距离落点范围伤 / 治疗弹射回血）·
  两种地图（长方形四周是河 / I 形中间有桥）· 石头树木墓碑可挡可碎。登记 **V69**，测试 77 项。
- **M2-2 完成**：全部场景**逐一归入七大地形**（第 62 轮起 93 个）。拿 11 个官方场景名去核对，撞出两处矛盾
  （**城堡郊外**被美术分组放到"多比学院"、**城堡走道**被放到"勇气峡谷"）→ 按官方名改判为**多比城堡**（V70）；
  另 4 个"名字像另一个地形但不足以下结论"的不擅自改，**并进 D3 工作表等人复核**。
  产出 `docs/场景地形归属.json` / `.md`，游戏侧新增 `districtOfScene(id)`。

**第 48 轮（继续做那两个"规则已查明"的小游戏）**：
- **「极限顶顶球」做出来了并通过验证**（可玩 11 → 12）：左右移动 + 上键跳、球体物理、
  **AI 的速度与跳跃就是比玩家高**（官方原话）、**得分只看球进哪一边**（官方原话）。
  自动试玩 **6/6 通关**（平均 8.5 秒）。
- **「冲上云霄」第 59 轮修通 → 可玩**：体检机器人 **6/6 通关（平均 7.2 秒）**。
  第 48/49/50 轮调的物理参数其实都没问题，真正的根因是**三个引擎 bug**：
  ① 落地判定 `if (b.used) continue` 把**踩过的泡泡变成空气** → 掉回地面就再也上不去；
  ② 站着时**每帧都算一次"落地"** → `landedAt` 恒被刷新 → 起跳闸门永远过不去；
  ③ "走出边缘"窗口 `r+10` 与落地窗口 `r+40` **一宽一窄** → 站在泡泡边上每帧假摔又被接回。
  另外 `reward:null` 会让达标后被当成副本、永远到不了结算，已按官方四类奖励补齐。
- **修了回归体检自己身上的"手写清单"**：`diag-*.mjs` 由逐条列名单改成**按命名约定排除**
  （本轮调试时写的 9 个 diag 脚本被当成测试跑，正是 R6/R13 说的老毛病）。
- 顺带修掉三处**游戏内的真 bug**：球被人物碰撞盒"粘住"导致比分永远不变、
  冲上云霄**没有地面**（玩家穿过画面底部）、走出泡泡边缘后仍悬浮（`onBubble` 从不清除）。

## 2. 测试现状（R6 / R13 底线）

| 项 | 数值 |
|---|---|
| 测试文件 | **54 个产出断言** + `ui-overlap.mjs`（以退出码判定）＝ 自动发现 **56 个** |
| 断言总数 | **2252 项**，失败 0 |
| 运行方式 | `node _tools/run-all-tests.mjs`（**自动发现，禁止手写清单**；`diag-*` 按**命名约定**排除，不再逐条列 —— 第 48 轮修） |
| 断言数基线 | `docs/test-baseline.json`（**跌了就红**） |
| 开工自检 | `node _tools/check-plan-freshness.mjs`（**不进回归**：版本领先＋没打包的中间态会假红） |
| 计划书基线 | v2 写 173 项 → 实际已 1761 项（只增未减） |

第 46 轮新增：`check-scene-npc.mjs`（NPC 数量/撞衫/坐标/入口优先级/固定不动）、
`check-canvas-bounds.mjs`（主菜单/操作说明逐行/背包/图鉴/战报/战斗指令格的画面内与不重叠）。
第 47 轮：`test-minigame.mjs` 300 → **349 项**（新增第 16/17 节：哈里的金币、魔镜世界）、
`check-scene-npc.mjs` 25 → **27 项**（新增两个官方小游戏 NPC 的存在性断言）。
**第 51 轮**：新增 `test-sumo.mjs` **77 项**（大陆棋按原文重做）、
`test-scene-district.mjs` **34 项**（M2-2 场景逐地形归属）。
**第 52 轮**：新增 `test-form-source.mjs` **36 项**（52 只形态全部可达）、
`check-canvas-text.mjs` **11 项**（切片断言：记录每一次 fillText，覆盖 **43 个界面**）。
**第 53 轮**：新增 `test-walk.mjs` **22 项**（走路帧 + 接地影；
核心断言是"走路帧的旋转次数与站立相同"——**旧实现就是靠 rotate 摆，那正是"飘"**）。

各文件项数（由基线文件自动维护，此处同步）：`test-minigame 355`、`test-dungeon 187`、
`test-sumo 77`、`test-costume 70`、`test-form-art 67`、`test-npcs 64`、`test-treasure 58`、
`playthrough 53`、`test-savever 49`、`test-scene-names 49`、`test-warreport 45`、
`test-mainmenu 39`、`test-awaken 38`、`test-difficulty 38`、`test-scene-district 34`、
`check-world-playthrough 32`、`test-official-data 31`、
`test-seal 29`、`test-zukan 28`、`check-scene-npc 27`、`test-channels 24`、`playtest 23`、
`test-mouse 23`、`test-turn-order 22`、`test-mapgraph 21`、`test-attack-anim 20`、
`test-respawn 20`、`check-canvas-bounds 19`、`test-battle-mouse 19`、`test-battle-bugs 17`、
`test-bgm 17`、`test-scene-links 14`、`test-v1-checklist 13`、`test-glyphs 10`。

第 48 轮：`test-minigame` 349 → **355 项**（极限顶顶球相关的期望更新 + 冲上云霄的"未验证不算可玩"断言）。

> ⚠️ `ui-overlap.mjs` 只扫**注册过的面板矩形** —— **直接画在画布上的文字不在它视野里**。
> 帮助面板画到屏幕外（43 轮）、小游戏规则行左右溢出（44 轮）、服饰货架被页脚压住（45 轮）
> 都是靠看图才发现。这正是新计划 **R14（视觉断言化）** 要补的窟窿。

## 3. 已完成（按计划书里程碑）

| 里程碑 | 状态 | 说明 |
|---|---|---|
| M1 战斗核心（SP / 结印 / 双通道 / 速度 / 同属性） | ✅ 全部完成 | D1 参数仍是推算值（`derived`），等裁定 |
| M2 世界结构（七大地形 / 归属 / 命名 / BGM） | ✅ 完成（命名待人类） | **M2-2 逐场景归属已做**：88 个场景全有地形，2 个按官方名改判（V70）、4 个待复核（已并进 D3 工作表）；命名 11/88 官方名，其余等 D3 |
| M3 素材缺口 | 🟡 M3-1 完成 | 22 个 rar 全解包（671.9 MB），挖出原版技能表 → 技能 86→136；M3-2/M3-4 待 D4/D5 |
| M4 内容扩充 | 🟡 大部分完成 | M4-1：**13/14 副本可通关**（大陆棋第 51 轮按原文重做，V69）；M4-4：17 条系统里 **14 已实现**、0 条"规则已查清未实现" |
| M5 成品化与固化 | ✅ 完成 | 打包（R11 脚本化）· 存档版本化 · 文档固化 · 保真度报告（脚本生成） |

## 4. 待人类裁定（不阻塞：已用 derived 占位并继续）

v3 起分三档（见 `00-PLAN.md` §4）：**A 档才需要人类动手**。

| 编号 | 事项 | 当前临时做法 | 状态 |
|---|---|---|---|
| **D3** | **场景命名（唯一 A 档）** | **已升级成"一勾就完"**：`场景命名工作表.csv` 第一列就是我的推断名、第二列是**语料召回的地名候选（带出处页号）**、第三列待填；`场景命名工作表.md` 是人读版（按"最好填"分成 A 有候选 14 / B 仅推断 63 / C 已锁定 11）。生成器 `_tools/make-scene-naming-sheet.mjs` | **等你填第三列** |
| D1 | 结印操作参数 | 5 步 / 每步 1.15 秒 / ×0.55~×1.60（`derived`）| B 档：继续用，可否决 |
| D2 | 七大地形与全部场景映射 | 方案 (b)：11 岛作野外分区 + 七大地形归属层 + 通道图 | B 档：继续用，可否决 |
| D5 | 多比美术缺口 | 只用挖到的原始立绘，缺的标 `missing` | B 档：继续用，可否决 |
| D4 | 场景底图角色烘焙 | 未动（原图只读备份在 `_rar_extracted/`） | C 档：转技术任务，**先试参数再问** |
| D6 | 是否接受永久缺失 | 伤害系数/升级曲线/掉落表 = 永久 `missing` | C 档：已成事实，不再挂"待裁定" |

## 5. 已知偏离与简化

见 `docs/deviations.md`（R3 要求显式记录，不得静默降级）—— 当前 **66 条 V 编号**。

## 6. 下一步（按性价比，源自 `00-PLAN.md` §5 的 P1–P4）

1. **P1 把人类反馈变成断言（下一轮）**：`check-scene-npc.mjs`（撞衫 / 越界 / 压出口 / 数量与优先级）、
   `check-canvas-text.mjs`（R14：画布文字视图内 + 不重叠）、体检脚本的覆盖自证（R13）
2. **P2 批量证据挖掘**：**晶石对战**（三消攒能量 + 多比自动出手 + 5v5，原文已查明、**尚未重做**）·
   索亚迷局（密林危途 + 抓捕米雅 + 躲陷阱三段）· 阿特兰斯机关密道 · 凤凰考验；在 `_web/7k7k`(5015) + `_web/5068`(342) 里召回后精读
3. **P3 收敛人类那一侧**：D3 工作表升级成"一勾就完"（推断名 / 语料候选 / 官方名 三列并排）；
   D5 压成一条可执行规则；归档里剩余 60 余张未占用位图出判定表
4. **P4**：D4 去角色烘焙（技术任务）· 音乐 `music006` 等外部证据
   （**M2-2 场景逐一归属已在第 51 轮完成**；剩 4 个待复核的场景已并进 D3 工作表）
5. 持续维护：`docs/保真度报告.md`（脚本生成，不要手改）

## 7. 环境注意事项（踩过的坑）

- PowerShell 5.1 用 ANSI 读无 BOM 的 UTF-8 文件，`Get-Content` 看到乱码**是假象**
- 生成的 `.ps1` 必须带 UTF-8 BOM，否则中文乱码
- **`powershell.exe ... > file` 写的是 UTF-16LE**：会得到 `{ " 4 8 "` 这种隔字空格。
  需要 PS 产出 JSON 时，让脚本内部用 `UTF8Encoding($false)` 自己写文件，别靠重定向
- **`Compress-Archive` 的 zip 条目名用反斜杠**：用 `-like '*a/b/*'` 统计会得到 0（假警报）。
  第 46 轮起发布包改由 `_tools/make-release.mjs` 自己写（正斜杠 + UTF-8 标志位），不再依赖它
- **`.NET` 的 `System.IO.Compression.FileSystem` 在本机沙箱里加载不稳定**（同一个命令第一次成功、
  第二次就 `FileNotFoundException`）。所以读 zip 一律走 `_tools/lib/zip-central.mjs`（纯 Node 实现）
- **测试台固定等待是偶发假红的源头**：脚本文档里那句 `await new Promise(r => setTimeout(r, 150))`
  在机器忙时不够用（第 45 轮实测）。一律用 `await T.settle()`（轮询到真的离开载入页）
- `node -e "..."` 在 PowerShell 里会被引号吃掉（实测踩过），要探测数据请写成 `.mjs` 文件再跑
