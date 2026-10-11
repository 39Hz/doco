# 多克多比 · 离线单机复刻版（源码包）

用原版《多克多比》（淘米，2011–2013 儿童页游）的**归档素材 + 官方策划文档**重建的
**离线单机版**。纯静态、零第三方依赖、**双击即玩**。

> 仅供个人怀旧与非商业用途。素材版权归原厂所有。

| 项 | 值 | 权威源 |
|---|---|---|
| 游戏版本 | **v0.9** | `STATE.md`（与 `game.html` 加载页显示的一致） |
| 迭代轮次 | 第 72 轮 | `docs/自主迭代日志.md` |
| 所属制作包 | v1.20 | 上层目录 |

**想自己重建这个版本 / 接着往下做** → 看 **[`docs/复刻与构建手册.md`](docs/复刻与构建手册.md)**。
**接手开发前先看** → **[`docs/交接与协作指南.md`](docs/交接与协作指南.md)**。

> ⚠ 本源码包与 `1-游戏-双击即玩/` 下的成品线**没有保持同步**：成品已演进到 round108 / v0.91，
> 源码停在第 72 轮 / v0.9。两者是两条开发线，不是"同一份代码的两种形态"。

---

## 怎么玩

| 方式 | 说明 |
|---|---|
| **★ 推荐** | 双击 **`多克多比.exe`**（无地址栏的游戏窗口，不用装任何东西）|
| 开发时 | 双击 **`game.html`**，或双击 `serve.cmd` 起本地服务器 |

**操作**：鼠标左键点地面移动、点 NPC/怪物交互；`Tab` 大地图、`B` 背包、`Q` 任务、
`G` 杂货铺、`L` 图鉴、`Z` 战报、`F` 全屏、`M` 静音、`N` 切难度。
战斗里 `↑↓` 选指令、`←→` 换目标、`空格` 确定、`Esc` 返回。

等级、经验、形态、所在地、已探索场景**自动存在本地**，关掉再开继续玩。**三个存档槽**。

---

## 这一版有什么

| 项 | 数量 |
|---|---|
| **场景** | **93**（11 座浮空岛 / 七大地形）|
| **多比形态** | **52** 只，其中 **29 只有官方立绘、23 只无** |
| **副本** | **14** 个（13 个可从列表一路打到通关）|
| **小游戏** | **15** 个（13 个可玩）|
| **技能 / 怪物** | **136 / 36**（八系相克：火水风土光暗毒无）|
| 道具 / BGM / 骑士 / 索亚 | 55 / 15 / 15 / 6 |

> 上面是 **v0.9 快照实测值**。形态与立绘的准确明细在 **`assets/forms.json`**（脚本生成，勿手改），
> 技能取自 **`game/tables/skills-official.js`**。

**玩法**：场景探索 → 野外遇怪 → 回合制战斗 → 升级 → 进副本（含解谜/潜行/射击/三消等分段关卡）
→ 拿奖励与形态 → 用白色彩晶石在珍宝小屋兑换形态。

### 形态怎么拿

| 途径 | 依据等级 | 说明 |
|---|---|---|
| **唤醒**（宝石大厅） | `official` | 4 只：原版策划表的勇气/智慧/魅力三项**有数值**（费尔·凌 / 沃特·空 / 温德·冽 / 厄斯·垒）|
| **副本 BOSS 首通必掉** | `derived` | 13 只，一副本一只、主题相符，**首通必掉不是概率** |
| **珍宝小屋兑换** | `derived` | 其余限定形态，用官方货币白色彩晶石（8/18/36 三档） |

原版把唤醒条件三项全为 0 的 48 只标成"限定形态"，来源是**运营活动与掉落** —— 单机版没有这两样，
因此给了上面两条替代途径，**并且明说是替代、写清依据等级，不假装是原版途径**。
逐只明细与依据原文见 **[`game/tables/forms-acquire.js`](game/tables/forms-acquire.js)**。

> 归档里**没有立绘**的形态**一律不开放获得** —— 拿到手只会是一片空白。
> 它们在形态面板里会写明「暂无立绘 · 暂不开放获得」，不是藏起来。

---

## 代码结构

`game/` 已按**五层 + 一个装配点**模块化（原 13030 行的 `game.js` 单体已拆，现在 **1280 行**，
只剩主体装配与调试出口）。`game.html` 里的 `<script>` 顺序就是依赖顺序，新增文件自动被测试台加载。

```
game/config.js        离线 / 在线的唯一开关 window.DKDbbConfig
game/core/            state.js（共享状态树 S、画布 ctx/W/H）canvas.js images.js toast.js
game/domain/          纯逻辑、零 I/O：battle-math / turn-order / seal / dungeon-rules
game/ports/           接口契约（只有签名）：save-store / content / session
game/adapters/        端口实现：local-save / bundled-content / anonymous-session
                      + http-future.js（将来接后端时的占位与契约，本期不挂载）
game/engine/          engine.js（三槽存档 + 版本化迁移）mouse.js fx.js
game/tables/          纯数据：data / skills-official / dungeons / minigames / crystal …
game/app/             用例编排（19 个）：battle / dungeon / scene / npc / player / shop …
game/ui/              界面绘制（21 个）：battle-view / worldmap / bag / zukan / shop …
game/input.js         顶层输入编排 update(dt)（装配级，同时看得见 ui 与 app）
game/boot.js          装配点：读 config 选适配器 → 校验契约 → 启主循环
game/game.js          剩余主体 + 调试出口 window.__DKDbb_DEBUG__（283 键，形状已冻结）
```

**依赖方向是唯一铁律**：`ui → app → domain`，`app → ports ← adapters`，`domain` 谁都不依赖。
只有 `adapters` 认识"数据从哪来"（`localStorage` / exe 的 `/__save` / 将来的 HTTP）。
接后端时**只写一个 HTTP 适配器、改 `config.js` 两行**，玩法与界面代码一行不动。
结构由 `_tools/test-module-boundary.mjs` 静态守住，不靠人自觉。

**三个互相独立的前端入口**（公共资产都在 `assets/`，改素材目录会同时打到这三套）：

| 入口 | 组成 | 用途 |
|---|---|---|
| 游戏本体 | `game.html` + `game/` + `world.js` | 真正要玩的那套 |
| 场景档案馆 | `index.html` + `app.js` + `style.css` | 看场景图 / 听 BGM，`file://` 可跑 |
| 浮空群岛 | `hub.html` + `hub.js` + `hub.css` | 世界地图 + 档案馆二合一，含绑定编辑器 |

---

## 还原度：哪些是官方的，哪些是推算的

这是本项目最较真的一条：**每一处都标来源等级**，而且标在**数据里**（能被程序读出来）。

| 等级 | 含义 | 保真度占比 |
|---|---|---|
| `official` | 归档里有直接依据（场景底图、技能数值、怪物属性、16 个官方场景名…）| **77.8%** |
| `derived` | 本项目按依据推算（77 个场景名、11 座岛名、形态价格档、副本掉落绑定…）| 16.1% |
| `missing` | 归档里没有，**不编**（无立绘形态、无规则小游戏…）| 6.1% |

逐项清单见 **[`docs/保真度报告.md`](docs/保真度报告.md)**（脚本生成，不要手改）。

**必须说清的三件事**：

1. 归档里**没有原版客户端代码与服务端** → 升级曲线、伤害公式、掉落是**推算值**（`derived`）。
   这是一份「**官方素材 + 官方文档重建**」，不是逐字节复刻。
2. 11 座岛的**名字**和场景归属是**按画面内容推断**的（原版没给地图配置）。
3. **93 个场景里 16 个有官方名，其余 77 个是本项目起的**。
   如果你知道原版场景名，填 [`场景命名工作表.csv`](场景命名工作表.csv) 即可（已按"最好填"分档：A 有候选 / B 仅推断 / C 已锁定）。

---

## 已知缺口（不是"没做"，是"没依据"）

| 缺口 | 为什么停在这 |
|---|---|
| 77 个场景官方名 | 只有原版玩家能确认 —— 工作表已备好 |
| 23 只多比立绘 | 部分卡在 FLA/SWF 格式（**取不出**，已复核），部分归档里根本没有 |
| 2 个小游戏（疯狂冰激凌 / 多克大富翁）| 2672 篇语料里查不到规则，**不编** |
| S/A 评级分数线、`music006` | 同上 |

全部偏离与简化共 **66 条 V 编号**，见 **[`docs/deviations.md`](docs/deviations.md)**。

---

## 目录

```
game.html  index.html  hub.html    三个前端入口
world.js                           11 座浮空岛的地图数据
game/                              游戏本体（五层模块化，见上文）
assets/                            素材（场景/立绘/动画/音乐/字形 + 生成的数据表）
_build/                            打包（make-dist.mjs + launcher.cs）
_collector/                        素材收集脚本
_tools/                            开发与验证脚本（351 个 .mjs，玩游戏用不到）
docs/                              文档（保真度报告 / 迭代日志 / 截图 / 考古资料）
README-源码包.md                    源码包的范围说明
STATE.md                           会话状态（接手者先读这一页）
00-PLAN.md                         计划书 v3.0（仓库内唯一权威源）
BLOCKED.md                         阻塞项
目录地图.md                         整个源码包的分区地图
```

`dist/`（打包中间产物）与发布包 zip **不入库**，见 `.gitignore`。

---

## 开发与验证

```powershell
node _tools/check-plan-freshness.mjs      # 开工自检（12 项）
node _tools/run-all-tests.mjs             # 全量回归（56 文件 / 2252 项断言）
node _tools/check-newplayer.mjs           # 新玩家全流程体检（30 项）
node _tools/check-dungeon-playthrough.mjs # 13 个副本从头打到尾
node _tools/check-minigame-balance.mjs    # 13 个小游戏通关率
node _tools/make-release.mjs --ver=v0.9   # 打包
node _tools/verify-zip.mjs                # 校验发布包（20 项）
node _tools/smoke-exe.mjs                 # 真启动一次 exe（12 项）
```

**验收门槛**（本机）：① 断言数 ≥ `docs/test-baseline.json`；② 红名单**恒等于 5 个环境豁免文件**；
③ 不出现新的"无汇总"脚本。

> 这 5 个恒红是 **纯源码包的正常现象**，不是回归：它们需要 8.8 GB 原版归档
> （`多克多比专区资料素材/`）、交接包 `多克多比制作.zip` 与 DSH 源会话文件，
> 而这些**按要求故意不进源码包**。在有全量输入的机器上是绿的。

**完整重建步骤、环境要求、常见坑** → **[`docs/复刻与构建手册.md`](docs/复刻与构建手册.md)**

---

## 技术备注

- **没有第三方依赖、没有构建步骤、没有 npm**。所有图像/音频解析都是 `_tools/` 里手写的零依赖脚本。
- **保留 IIFE + `window.DKDbb*` 全局命名空间**，不用 ES Module —— 测试台用 `vm.runInContext`
  顺序执行 `game.html` 里的脚本，解析不了 `import`。但**结构上按未来的 ESM 设计**：
  一个文件 = 一个模块 = 一个职责，将来迁 ESM 只是换外壳，模块内部不动。
- **字形图集是手绘位图字体**，在 **`_tools/glyphs/`**（`glyph_48_regular.png` / `bold.png`），
  覆盖 **4918 字** —— 不能依赖系统字体，必须自带。图集的 `.rgba` 中间产物不入库。
  ⚠ 写新注释也要用图集内的汉字，`_tools/test-glyphs.mjs` 扫的是**源码全部字符含注释**。
- `assets/manifest.js`、`assets/forms.json`、`assets/forms/art/index.json` 等都是**生成物，别手改**。
- 启动器 `多克多比.exe` 用 **Windows 自带的 `csc.exe`** 编译，不需要装 .NET SDK。

---

## 仓库约定：什么不入库

见 **`.gitignore`**，规则与理由：

| 不入库 | 理由 |
|---|---|
| `_tools/py/` | 嵌入式 Python 运行时（151 MB）。用仓库里的 `_tools/py-embed-3.11.9.zip` 解压重建 |
| `地图大全.zip`、`多克多比音乐.zip` | 归档包，内容已解压存在 |
| `.crops/`、`地图大全_超清4K/` | 中间产物 / 高清素材，运行时不用 |
| `dist/`、`_build/*.exe` | 打包产物；exe 走 Releases |
| `_tmp*/`、`*.tmp`、`*.log`、`save.json` | 临时文件与个人存档 |
| `_tools/glyphs/*.rgba` | 字形图集中间产物 |

clone 下来之后，若要跑依赖 PIL 的图片处理脚本，先重建 Python 运行时：

```powershell
node _tools/setup-python-pil.mjs
```
