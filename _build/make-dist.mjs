// 组装 dist 分发包：游戏文件 + 启动器 exe
// 用法: node _build/make-dist.mjs
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
// 事实数字一律从数据文件现取（原因见该文件顶部：发布说明曾写死 v0.1/11 形态/17 技能）
import { collectFacts } from '../_tools/lib/release-facts.mjs'

const d = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const dist = path.join(d, 'dist')
const web = path.join(dist, 'web')
const CSC = 'C:\\WINDOWS\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'

const log = (s) => console.log(s)

// ---------- 1) 清理 ----------
log('=== 1) 清理并重建 dist ===')
fs.rmSync(dist, { recursive: true, force: true })
fs.mkdirSync(web, { recursive: true })

// ---------- 2) 复制网页文件 ----------
log('=== 2) 复制网页文件 ===')
const webFiles = [
  'hub.html', 'hub.css', 'hub.js', 'world.js',
  'index.html', 'style.css', 'app.js',
  'game.html',
]
for (const f of webFiles) {
  const src = path.join(d, f)
  if (!fs.existsSync(src)) { log(`    跳过 ${f}（不存在）`); continue }
  fs.copyFileSync(src, path.join(web, f))
}
// game/ 子目录
const gsrc = path.join(d, 'game')
if (fs.existsSync(gsrc)) {
  fs.cpSync(gsrc, path.join(web, 'game'), { recursive: true })
  log(`    game/           ${fs.readdirSync(gsrc).length} 个文件`)
}
fs.mkdirSync(path.join(web, 'assets'), { recursive: true })
fs.mkdirSync(path.join(web, 'assets', 'bgm'), { recursive: true })
for (const a of ['manifest.json', 'manifest.js', 'gamedata.json', 'gamedata.js', 'quests.json', 'quests.js', 'forms.json', 'forms.js']) {
  const src = path.join(d, 'assets', a)
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(web, 'assets', a))
}
// 场景音乐归属表（由 _tools/import-named-bgm.mjs 生成）
{
  const src = path.join(d, 'assets', 'bgm', 'scene-bgm.js')
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(web, 'assets', 'bgm', 'scene-bgm.js'))
}
// 原版带场景名的曲子目录（战斗场景 / 多比城堡 / 索亚城 …）
{
  const src = path.join(d, 'assets', 'bgm', 'named')
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(web, 'assets', 'bgm', 'named'), { recursive: true })
    const n = fs.readdirSync(src).filter((f) => f.endsWith('.mp3')).length
    log(`    assets/bgm/named  ${String(n).padStart(4)} 首原版曲子`)
  }
}
// assets/anim（角色动画，可选：不存在也不影响档案馆）
const animSrc = path.join(d, 'assets', 'anim')
if (fs.existsSync(animSrc)) {
  fs.cpSync(animSrc, path.join(web, 'assets', 'anim'), { recursive: true })
  const n = (function count(p) {
    let c = 0
    for (const e of fs.readdirSync(p, { withFileTypes: true })) c += e.isDirectory() ? count(path.join(p, e.name)) : 1
    return c
  })(animSrc)
  log(`    assets/anim     ${n} 个文件`)
}
// assets/ 整棵递归拷贝。
// 不再逐个列目录：早期版本手写了 scenes/bgm/sfx/anim/monsters 五个，
// 后来加的 forms/items/skills 就漏了，包打出来没立绘也没道具图标（发出去过一版）。
{
  const assetsSrc = path.join(d, 'assets')
  const assetsDst = path.join(web, 'assets')
  // 排除项：sprites 是早期的遗留工作目录（1.86 GB，与 anim 重复，运行时不读）；
  // ui 是空目录。不排掉的话包会从 120 MB 涨到 2 GB。
  const SKIP = new Set(['sprites', 'ui'])
  fs.cpSync(assetsSrc, assetsDst, {
    recursive: true,
    filter: (src) => !SKIP.has(path.basename(src)),
  })
  // 逐个子目录报数，漏了能一眼看出来
  for (const e of fs.readdirSync(assetsDst, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name))) {
    if (!e.isDirectory()) continue
    const full = path.join(assetsDst, e.name)
    let n = 0
    const walk = (q) => { for (const x of fs.readdirSync(q, { withFileTypes: true })) x.isDirectory() ? walk(path.join(q, x.name)) : n++ }
    walk(full)
    log(`    assets/${e.name.padEnd(12)} ${String(n).padStart(5)} 个文件`)
  }
  // 关键文件的存在性自检：这几样缺了游戏就是"能打开但没画面"
  const must = ['forms/art', 'items', 'skills', 'monsters/labeled', 'scenes']
  for (const m of must) {
    const q = path.join(assetsDst, m)
    const cnt = fs.existsSync(q) ? fs.readdirSync(q).length : 0
    if (!cnt) { console.error(`  ★ 打包自检失败：assets/${m} 是空的！`); process.exit(1) }
  }
  log(`    ✓ 自检通过：形态立绘 / 道具图标 / 技能图标 / 怪物立绘 / 场景图 都在`)
}

// ---------- 3) 编译启动器 ----------
log('=== 3) 编译启动器 ===')
const outExe = path.join(dist, '多克多比.exe')
const cs = path.join(d, '_build', 'launcher.cs')
const cscArgs = [
  '/nologo', '/target:exe', '/platform:anycpu',
  '/out:' + outExe,
  '/reference:System.dll', '/reference:System.Core.dll',
  cs,
]
// 用 inherit 而非管道：沙箱下子进程管道会受限，且这样能直接看到编译器报错
log('    ' + CSC)
log('    ' + cscArgs.join(' '))
let cscCode = 0
try {
  execFileSync(CSC, cscArgs, { stdio: ['ignore', 'inherit', 'inherit'] })
} catch (e) {
  cscCode = e.status === undefined ? -1 : e.status
  log(`    csc 退出码: ${cscCode}`)
}
if (cscCode !== 0 || !fs.existsSync(outExe)) {
  throw new Error(`启动器编译失败（csc 退出码 ${cscCode}）—— 请查看上方编译器输出`)
}
log(`    多克多比.exe  ${(fs.statSync(outExe).size / 1024).toFixed(1)} KB`)

// ---------- 4) 说明文件 ----------
step4()
function step4() {
log('=== 4) 附带说明 ===')
// 【第 46 轮修】这份读我原先**数字全部写死**，实测发出去的是
//   「v0.1 单机版 / 11 个多比形态 / 17 个原版技能 / 34 种怪物」
// 而当时已经是 v0.6 / 52 只 / 136 个技能 / 36 种怪物 —— 发给玩家看的文件在说谎，
// 而且没有任何机制会发现（写死的数字一定会过期，第 44 轮"界面写死 0.28 秒"同款）。
// 现在数字一律从**运行时数据文件**现取（_tools/lib/release-facts.mjs），版本号从 STATE.md 取。
const facts = collectFacts()
const ver = facts.version || '0.0'
log(`    事实取自数据文件：形态 ${facts.forms} · 技能 ${facts.skills} · 怪物 ${facts.monsters} · 场景 ${facts.scenes} · 版本 v${ver}`)
fs.copyFileSync(path.join(d, 'README.md'), path.join(dist, '使用说明.md'))

const readme = `多克多比 · 浮空群岛　v${ver} 单机版
====================================

【怎么玩】
  双击「多克多比.exe」。
  会弹出一个游戏窗口（没有浏览器地址栏）。窗口关掉后本程序自动退出。

  · 不需要安装任何东西（Windows 10/11 自带 .NET 与 Edge 内核）
  · 全程不联网，所有素材都在 web 目录里
  · 首次启动 Windows 可能弹防火墙提示 —— 本程序只监听 127.0.0.1（本机回环），
    拒绝外部访问，点「取消」或「允许」都不影响使用

【操作】—— 页游手感：鼠标左键点击移动
  左键点地面        角色走过去（脚下出现金色光圈标记目标点）
  左键点 NPC / 怪物  角色自动走过去，到达后弹出功能菜单
  NPC 菜单           ↑↓ 或鼠标选择，空格/点击 确定，Esc 关闭
  键盘备用          W A S D / 方向键 移动，空格 就近互动
  Tab               打开大地图    B 背包/变身    C 属性面板    Q 任务列表
  I / J / Y         入口类功能（拉鲁 / 肖恩普 / 小游戏向导）
  N                 难度档位（默认「简单」，可随时切「普通」）
  O                 服饰与附魔（多比大街最右端的服饰大楼 · 麦基）
  Esc               返回 / 关闭菜单      F 全屏      M 静音

  NPC 交互还原了原版的「点击 → 选功能」流程：
  点 NPC 会弹出带选项的菜单（如接任务 / 打听消息 / 离开），而不是直接说话。
  这是照着 7k7k 剧情攻略里「点击沙拉塔，然后再点击沙拉塔的收获」的写法做的。

【这一版有什么】（数字由打包脚本从数据文件现取，不是手写的）
  · ${facts.scenes} 个原版场景，按画面归入 11 座浮空岛，另加七大地形归属层与场景互通
  · ${facts.forms} 个多比形态（其中 ${facts.formsArtFiles} 张原版立绘），可随时背包变身
  · ${facts.skills} 个官方技能（来自解包挖出的原版技能表），冷却 / 耗能 / 结印 / 范围可查
  · ${facts.monsters} 种怪物（原版「怪兽.xlsx」驱动）+ 八系相克 + 速度决定出手顺序
  · ${facts.items} 个道具；战斗：指令菜单 / 键盘 + 鼠标 / 目标选中 / 独立技能特效
  · 官方 SP 槽与结印技 · 十维属性面板 · 任务列表（117 个原版任务，可播放剧情）
  · 13/14 个官方副本可通关；9 个小游戏可玩（Y 键或找小游戏向导）
  · 服饰购买与附魔 · 变形唤醒 · 珍宝小屋 · 副本翻牌 · 存档版本化（老档自动迁移）

【已知不足】
  · 1 个副本（英雄抉择）查不到官方玩法，关卡为空、暂不可进入 —— 宁可空着也不编
  · 全部 14 个副本里 7 个玩法按官方原文定制，其余走通用关并在界面标「⚠ 替代说明」
  · 场景命名：${facts.scenes} 个里 11 个有官方名，其余是按画面推断的临时名（工作表在仓库里）
  · 有 22 只怪的立绘用的是归档里外观相近的官方素材（归档本身缺这批的原图，已查到底）
  · 升级曲线 / 伤害公式 / 掉落表是推算值（原版数值在服务端，归档里没有）

【目录结构】
  多克多比.exe      启动器
  web/              全部游戏文件与素材
  使用说明.md / 使用说明.txt

【打不开 / 白屏怎么办】
  1. 确认 web 目录和 exe 在同一个文件夹里，别把 web 单独移走
  2. 若杀毒软件拦截，把整个文件夹加入信任区
  3. 端口会自动在 8765-8805 之间选，一般不用管

【关于还原度】
  素材（场景、音乐、角色动画、怪物立绘、数值表）全部来自原版。
  玩法是按原版策划文档与当年专区攻略重建的：归档里没有原版客户端代码与服务端，
  所以升级曲线、伤害公式、掉落为推算值。
  这是一份「官方素材 + 官方文档重建」的重制版，不是逐字节复刻。
  每一处推算都在仓库文档里登记（docs/deviations.md 的 V 编号）。

【版权】
  素材来源于原版《多克多比》客户端，仅供个人怀旧与非商业用途，请勿商业传播。
`
fs.writeFileSync(path.join(dist, '使用说明.txt'), '\uFEFF' + readme, 'utf8')
}
// ---------- 5) 汇总 ----------
log('=== 5) 汇总 ===')
function du(p) {
  let total = 0, files = 0
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, e.name)
    if (e.isDirectory()) { const r = du(full); total += r.total; files += r.files }
    else { total += fs.statSync(full).size; files++ }
  }
  return { total, files }
}
const all = du(dist)
log(`    dist 文件数: ${all.files}`)
log(`    dist 体积  : ${(all.total / 1048576).toFixed(1)} MB`)
log('')
for (const e of fs.readdirSync(dist, { withFileTypes: true })) {
  const full = path.join(dist, e.name)
  if (e.isDirectory()) {
    const r = du(full)
    log(`    [目录] ${e.name.padEnd(16)} ${(r.total / 1048576).toFixed(1).padStart(8)} MB  (${r.files} 文件)`)
  } else {
    log(`    [文件] ${e.name.padEnd(16)} ${(fs.statSync(full).size / 1024).toFixed(1).padStart(8)} KB`)
  }
}
log('\n✅ dist 组装完成')
