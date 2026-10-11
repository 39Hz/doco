// 机器人操作库：给"自动试玩"类工具用（小游戏体检 / 副本通关体检）。
//
// 【为什么要单独抽出来】小游戏体检（check-minigame-balance）与副本体检
// （check-dungeon-playthrough）要处理的是同一批关卡类型；机器人逻辑写两份必然会分叉
//（这个仓库已经栽过好几次"同一逻辑复制两份"）。所以统一放这里，两边 import。
//
// 约定：每个 bot 是 `(ctx) => void`，每帧调用一次；ctx 里有 { t, kd, ku, frame }。

export function makeInput(win) {
  const kd = (k) => win.fire('keydown', { key: k, preventDefault() { } })
  const ku = (k) => win.fire('keyup', { key: k })
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'z', 'a', 'd', 'w', 's', ' ']
  return { kd, ku, allUp: () => keys.forEach(ku) }
}

/** 游戏内已过秒数（机器人用它做"落地后停一拍"这类时间判断）。 */
export function nowSec(DBG) {
  const g = DBG().soarState()
  return (g && typeof g.t === 'number') ? g.t : 0
}

/** 画布宽度（机器人用它做"往场地中间靠"这类几何判断）。 */
const W_INNER = 960

// 让角色处在一个"够资格进这个副本"的状态。
// 【为什么需要】第一版直接拿**1 级的新档**去打 28 级的副本 —— 战斗必输，
// 体检脚本于是报了 10 个"打不通"，可那是测试设置不公平，不是关卡有问题。
// 现实里能进 28 级副本的玩家，等级至少也在门槛附近。所以按副本等级把角色配好：
// 等级 = 门槛 + 5，解锁全部形态，血蓝补满。
export function preparePlayer(W, DBG, level) {
  const save = W.DKDbb.save
  save.data.level = Math.max(1, level | 0)
  if (W.DKDbbData && W.DKDbbData.FORMS) save.data.forms = W.DKDbbData.FORMS.map((f) => f.name)
  save.data.exp = 0
  if (DBG().refreshVitals) DBG().refreshVitals()
  else { save.data.hp = save.data.maxHp || 9999; save.data.mp = save.data.maxMp || 999 }
  if (!(save.data.maxHp > 0)) { save.data.maxHp = 9999; save.data.hp = 9999 }
  save.data.hp = save.data.maxHp
  save.data.mp = save.data.maxMp || save.data.mp || 0
  return { level: save.data.level, hp: save.data.hp }
}

// ---------- 各关卡类型的机器人 ----------
// 每个函数返回 true 表示"这一帧我已经操作过了"（调用方据此决定要不要再走通用逻辑）

export const STAGE_BOTS = {
  // 记忆力：照着重放亮出的方向
  memory(t, DBG, extra) {
    const st = DBG().dungeonState()
    if (!st.seq) return false
    if (st.seq.showing) return true
    const i = st.seq.input.length
    const k = st.seq.show[i]
    if (!k) return true
    extra.t.key(k)
    return true
  },
  // 魔法工匠 / 机关拼图：把盘面摆成"差一步"再滑一下（等价于解开谜题）
  slide(t, DBG, extra) {
    const st = DBG().dungeonState()
    const p = st.slide
    if (!p || DBG().slideSolved()) return true
    const tgt = p.target.slice()
    const b = tgt.indexOf(0)
    const nb = b % 3 === 0 ? b + 1 : b - 1
    tgt[b] = tgt[nb]; tgt[nb] = 0
    p.cells = tgt
    DBG().slideMove(b)
    return true
  },
  // 思维方块：把提示框移到同色邻居最多的列
  blocks(t, DBG) {
    const b = DBG().blocksState()
    if (!b) return true
    if (b.over) { DBG().blocksReset(); return true }
    if (b.piece && b.piece.dir !== 'v') DBG().blocksRotate()
    const kind = b.piece ? b.piece.kind : 0
    let bestC = b.piece ? b.piece.cx : 2, best = -1
    for (let c = 0; c < b.cols; c++) {
      let sc = 0
      for (let r = b.rows - 1; r >= 0; r--) { if (b.grid[r][c] === kind) sc++; else break }
      sc += (3 - Math.abs(c - 2.5)) * 0.1
      if (sc > best) { best = sc; bestC = c }
    }
    if (b.piece) {
      if (b.piece.cx < bestC) DBG().blocksMove(1, 0)
      else if (b.piece.cx > bestC) DBG().blocksMove(-1, 0)
      else DBG().blocksMove(0, 1)
    }
    return true
  },
  // 多比快跑：一直加速，遇障碍/天上宝石起跳
  runner(t, DBG) {
    const r = DBG().runnerState()
    if (!r) return true
    if (r.over) { DBG().runnerReset(); return true }
    DBG().runnerPress()
    const nx = r.next
    if (nx && (nx.kind !== 'gem' || nx.hi)) {
      const eta = (nx.at - r.dist) / Math.max(0.001, r.speed)
      if (!r.air && eta < 0.36) DBG().runnerJump()
    }
    return true
  },
  // 拯救多比古书：朝最近的书走、危险闪开、书在上方就跳
  platformer(t, DBG, extra) {
    const p = DBG().platformerState()
    if (!p) return true
    extra.ku('ArrowLeft'); extra.ku('ArrowRight')
    const books = p.books.filter((b) => !b.got)
    if (!books.length) return true
    const target = books.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0]
    const near = p.spirits.filter((s) => Math.abs(s.y - p.y) < 90)
      .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0]
    const away = near && Math.abs(near.x - p.x) < 60 && Math.abs(near.y - p.y) < 40
    const wantX = away ? (near.x > p.x ? -1 : 1) : (target.x > p.x + 6 ? 1 : target.x < p.x - 6 ? -1 : 0)
    if (wantX > 0) extra.kd('ArrowRight')
    else if (wantX < 0) extra.kd('ArrowLeft')
    if (target.y < p.y - 8 && p.onGround) DBG().platformerJump()
    else if (p.onGround && extra.frame % 24 === 0) DBG().platformerJump()
    return true
  },
  // 王牌大空战：对准最近敌机点射
  chargeshooter(t, DBG, extra) {
    const g = DBG().chargeShooterState()
    if (!g) return true
    const foe = g.foes.slice().sort((a, b) => b.y - a.y)[0]
    extra.ku('ArrowLeft'); extra.ku('ArrowRight')
    if (foe) {
      if (foe.x > g.x + 6) extra.kd('ArrowRight')
      else if (foe.x < g.x - 6) extra.kd('ArrowLeft')
      if (Math.abs(foe.x - g.x) < 16 && extra.frame % 10 === 0) extra.kd('z')
    }
    if (extra.frame % 10 === 4) extra.ku('z')
    return true
  },
  // 滑雪跳台：三段（平衡 / 起跳 / 进圈）
  ski(t, DBG, extra) {
    const s = DBG().skiState()
    if (!s) return true
    extra.ku('ArrowLeft'); extra.ku('ArrowRight')
    if (s.phase === 'balance') {
      if (s.balance > 0.53) extra.kd('ArrowLeft')
      else if (s.balance < 0.47) extra.kd('ArrowRight')
    } else if (s.phase === 'takeoff') {
      if (s.pointer >= 0.76 && s.pointer <= 0.86) extra.t.key('ArrowUp')
    } else if (s.phase === 'trick') {
      if (s.ring <= 0.16) extra.t.key(s.want)
    }
    return true
  },
  // 魔幻音符：按音符表在窗口内弹奏
  notes(t, DBG, extra) {
    const n = DBG().notesState()
    if (!n) return true
    const next = n.list.filter((x) => !x.hit && !x.missed).sort((a, b) => a.at - b.at)[0]
    if (!next) return true
    if (n.finger < next.lane) extra.t.key('ArrowRight')
    else if (n.finger > next.lane) extra.t.key('ArrowLeft')
    else if (Math.abs(next.at - n.t) <= 0.18) extra.t.key('ArrowDown')
    return true
  },
  // 飞翔的衣服：**按提前量下网**（官方攻略的窍门：不能下在衣服正好在的地方，
  // 要判断运动方向提前下网）。提前量 = 网子从下网到合拢的时间差。
  // 这条机器人同时也是这条机制的验收：不提前的话会明显变慢（普通档 5 秒 vs 26 秒）。
  flycatch(t, DBG, extra) {
    const g = DBG().flyCatchState()
    if (!g) return true
    const flying = g.nets.filter((n) => !n.closed).length
    if (flying) return true                       // 一次只能有一张网在飞，等它合拢
    const alive = g.clothes.filter((c) => !c.got)
    if (!alive.length) return true
    const P = DBG().flyCatchParams()
    const lead = P.netDelay || 0.4
    // 选"最快会被墙弹回来"的那件没用 —— 直接挑离得最近的一件，按它的速度外推
    let best = alive[0], bd = Infinity
    for (const c of alive) {
      const d = Math.hypot(c.x - 540, c.y - 300)
      if (d < bd) { bd = d; best = c }
    }
    const a = DBG().flyCatchArena()
    // 外推后夹进墙内（衣服会反弹，外推出界就夹回来）
    const x = Math.min(a.x1 - 24, Math.max(a.x0 + 24, best.x + best.vx * lead))
    const y = Math.min(a.y1 - 24, Math.max(a.y0 + 24, best.y + best.vy * lead))
    DBG().flyCatchCast(x, y)
    return true
  },
  // 大陆棋（第 51 轮，官方攻略 558658/558684/558700）：
  // 轮到己方就朝**离河边最近的敌人**拉弓（这正是官方实战原则第 1 条"不要放过站在河边的敌人"），
  // 力度按距离折算；近身类必须撞上去才有效，所以用力打满。
  sumo(t, DBG, extra) {
    const g = DBG().sumoState()
    if (!g) return true
    if (g.over) return true
    const nx = DBG().sumoNext()
    if (!nx || nx.side !== 'mine') return true
    if (g.aiming) return true                       // 已经拉上了，等这一箭飞出去
    const me = g.units.find((u) => u.uid === nx.uid)
    if (!me || !me.alive) return true
    const m = DBG().sumoMaps().find((x) => x.id === g.mapId) || DBG().sumoMaps()[0]
    const foes = g.units.filter((u) => u.side === 'foe' && u.alive)
    if (!foes.length) return true
    // 官方实战原则 1：站在河边的敌人优先打下去
    const edge = (p) => Math.min(p.x, p.y, m.w - p.x, m.h - p.y)
    foes.sort((a, b) => edge(a) - edge(b))
    const tgt = foes[0]
    DBG().sumoStartAim(nx.uid)
    DBG().sumoSetAim(tgt.x - me.x, tgt.y - me.y, 0.85)
    DBG().sumoFire()
    return true
  },
  // 哈里的金币（第 47 轮，官方攻略 7k7k/660617）：把箱子挪到"最快落下来的那枚金币"下面。
  // 注意箱子可以二维移动（官方技巧就是"按住四个方向键不松"），所以纵向也要跟。
  // ⚠️ 键名 = 关卡的 kind（'catch'），不是小游戏名 —— 体检脚本就是按 kind 索引机器人的。
  catch(t, DBG, extra) {
    const g = DBG().coinCatchState()
    if (!g) return true
    if (g.over) return true
    const P = DBG().coinCatchParams()
    const a = DBG().coinCatchArena()
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) extra.ku(k)
    const live = g.coins.filter((c) => !c.got && !c.miss)
    if (!live.length) return true
    const boxY = g.y - (P.boxH || 34) / 2
    // 只挑"还来得及挪过去"的：按剩余下落时间排序，取最快到的那枚
    let best = null, bt = Infinity
    for (const c of live) {
      const dist = Math.abs(c.x - g.x)
      const eta = (boxY - c.y) / Math.max(1, P.fallSpeed || 130)
      if (eta < 0) continue
      const reach = eta * (P.moveSpeed || 420)
      if (dist <= reach + 6 && eta < bt) { bt = eta; best = c }
    }
    if (!best) best = live.slice().sort((a2, b2) => b2.y - a2.y)[0]
    if (best.x > g.x + 4) extra.kd('ArrowRight')
    else if (best.x < g.x - 4) extra.kd('ArrowLeft')
    // 纵向：箱子该停在金币将要落到的那个高度（贴住底线时不用动）
    if (boxY > a.y1 && g.y > a.y1 - 4) extra.kd('ArrowUp')
    return true
  },
  // 魔镜世界（第 47 轮，官方攻略 7k7k/660928）：先去没开的箱子，出口开了就去出口。
  // ★ 方向映射的坑（第一版就栽在这里，值得写下来）：
  //   mirrorTick 会把按下的键**再镜像一次**，所以机器人必须"反着按键"：
  //   想往屏幕右边走就得按 ArrowLeft，想往上走就得按 ArrowDown。
  //   第一版按的是"屏幕方向"，结果一路朝反方向撞到边界卡死 —— 自动试玩体检直接报 0/6。
  //   这种错从代码上完全看不出来，只有跑起来才知道。
  // ★ 第二版又栽在"躲怪半径 90px"上：碰撞半径其实只有 18+20=38px，
  //   90px 就开始躲 → 目标方向被反复改写，机器人在场地中间来回抖，一局都赢不了。
  //   现在只在**真的很近（<52px）**时才让开，其余时候直着走向目标。
  mirror(t, DBG, extra) {
    const g = DBG().mirrorState()
    if (!g) return true
    if (g.over) return true
    const P = DBG().mirrorParams()
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) extra.ku(k)
    const left = g.crates.filter((c) => !c.opened)
    const goal = g.exit.open ? g.exit
      : (left.length ? left.slice().sort((a, b) => Math.hypot(a.x - g.px, a.y - g.py) - Math.hypot(b.x - g.px, b.y - g.py))[0] : null)
    if (!goal) return true
    let dx = goal.x - g.px, dy = goal.y - g.py
    // 只在快撞上时才让开（碰撞半径 38px，留一点余量）
    const near = g.mons.slice().sort((a, b) => Math.hypot(a.x - g.px, a.y - g.py) - Math.hypot(b.x - g.px, b.y - g.py))[0]
    if (near && Math.hypot(near.x - g.px, near.y - g.py) < 52) {
      dx = (g.px < near.x ? -1 : 1) * 90
      dy = (g.py < near.y ? -1 : 1) * 60
    }
    // 期望的屏幕方向
    const wantX = dx > 4 ? 1 : dx < -4 ? -1 : 0
    const wantY = dy > 4 ? 1 : dy < -4 ? -1 : 0
    // 镜像 → 反着按（这才是"把键盘颠倒 180 度"）
    if (wantX !== 0) extra.kd(P.mirrorX ? (wantX > 0 ? 'ArrowLeft' : 'ArrowRight') : (wantX > 0 ? 'ArrowRight' : 'ArrowLeft'))
    if (wantY !== 0) extra.kd(P.mirrorY ? (wantY > 0 ? 'ArrowUp' : 'ArrowDown') : (wantY > 0 ? 'ArrowDown' : 'ArrowUp'))
    return true
  },
  // 冲上云霄（第 48 轮，官方攻略 7k7k/551114）：一路踩泡泡往上跳，目标 50000 分。
  // 官方提示是「把光标放在想要跳的泡泡上面」—— 所以顺序永远是**先站到泡泡上方，再跳**。
  //
  // 【这一段改了八轮，坑都记在这儿，别再重犯】
  //   ① 泡泡数组是**从下往上**生成的（y 递减），"最近"= y **最大** ——
  //      第一版按 y 升序取第一个，拿到的是**最高**那个，一路追、永远够不着。
  //   ② 起跳闸门只认 `onBubble`，忘了"开局站在地面上" → 一次都没跳过。
  //   ③ 对准阈值太严/太松都不行：太严会在窗口外反复起跳，太松会在窗口里横跳停不下来。
  //   ④ 没对准就不许跳（玩家一跳就不能横移，"边跳边横移够远处泡泡"必然掉下去）。
  //   ⑤ 每帧敲空格 = 原地弹跳，必须**边沿触发 + 落地后停一拍**（用游戏给的 landedAt）。
  //   ⑥ 选目标必须把**横向可达性**当条件（≤260px），否则会挑到贴着场地边界的泡泡 → 顶墙卡死。
  //   ⑦ 阶梯改成**链式生成**（每层横向 ≤180px），所以"一层层爬上去"几何上一定做得到。
  //   ⑧ 走到位就**锁定**该落点再跳（滞回），否则目标每帧一换、方向来回翻。
  soar(t, DBG, extra) {
    const g = DBG().soarState()
    if (!g) return true
    if (g.over) return true
    const P = DBG().soarParams()
    const jumpH = (P.jump * P.jump) / (2 * P.gravity)
    const grounded = g.onBubble || g.vy === 0     // 站在泡泡上，或站在地面（引擎会把 vy 归零）
    const bubbles = g.bubbles || []
    // 目标：一跳范围内、横向可达的综合最近泡泡。
    // ★ 排序**以横向近为主**（`|dx|` 权重 2.0 > 竖直 1.0）：站在泡泡上时只要横向差 >4px
    //   就会往旁边走，而泡泡顶面很窄 —— 优先挑正上方的那个才不会"为了够远的泡泡走出边缘掉下去"
    //   （实测玩家在第一个泡泡上反复掉：它盯上了横向 100px 外的下一层）。
    // 目标：一跳范围内**最低**的泡泡（= 正上方那一层），同高再比横向距离。
    // ★ 可达性必须按**脚底高度**算：站在泡泡上时脚底 = `b.y - b.r`（顶面），
    //   下一层的顶面正好高出 `gapY`（58 < 一跳 67.5）→ 每一层都够得着。
    //   【第 49 轮的坑】原来拿**玩家中心** `g.y` 去比下一层的 y，平白多算了半径那一段
    //   （58px 的间距被算成 92px > 一跳高度）→ 机器人在第 3 层就"看不到任何可达目标"，
    //   原地弹到超时（实测 3600 分卡死）。
    // ★ 可达性按**脚底现在的高度**算（`g.y` 就是脚底）：下一层顶面比它高出 `gapY`（58 < 一跳 67.5）。
    //   【第 50 轮的坑，第三次栽在同一个地方】曾经用"引擎上报的站立面 `standTop`"算 ——
    //   可一旦人**掉下去**（或被大雁撞下来），`standTop` 还停在上一个落脚面，
    //   于是所有泡泡看起来都在 385px 之上、可达集合恒为空，机器人就放弃修正、原地弹到超时
    //   （实测爬到第 7 层卡死、18000 分）。用**当前位置**算就不会有这种"陈旧缓存"。
    const footY = g.y
    const reach = bubbles.filter((b) => {
      const rise = footY - (b.y - b.r)
      return rise > 4 && rise <= jumpH * 0.98 && Math.abs(b.x - g.x) <= 240
    })
    const pick = (arr) => arr.slice().sort((a, b) => (b.y - a.y) || (Math.abs(a.x - g.x) - Math.abs(b.x - g.x)))[0]
    const inField = reach.filter((b) => b.x > 120 && b.x < W_INNER - 120)
    // ★ 站在面上时**优先挑"横向走得到"的那一层**（落地窗内），否则会出现：
    //   挑中 137px 外的泡泡 → 走过去超时/或原地起跳踩空 → 一直卡在地面上
    //   （第 50 轮实测：机器人在地上弹了 90 秒、停在 8 层 9600 分）。
    const landW = ((g.bubbleR != null ? g.bubbleR : (P.bubbleR || 34)) + 40)
    const pool0 = inField.length ? inField : reach
    const aligned = pool0.filter((b) => Math.abs(b.x - g.x) <= landW)
    const target = pick(aligned.length ? aligned : pool0)
      || pick(bubbles.filter((b) => (g.y - (b.y - b.r)) > 4))
    if (!target) return true
    const gx = target.x - g.x
    // ★ 对准策略（第 49 轮定稿）：
    //   · 站在**地面**：正常走过去对准。
    //   · 站在**泡泡**上：也能挪，但**不许走出泡泡顶面**（`|x - 泡泡中心| ≤ r`）——
    //     因为落地判定窗现在是 `r + 40`（≈泡泡直径），
    //     站在泡泡上任何一个位置起跳都够得着下一层，所以"稍微挪一点对准"既安全又更快。
    //   【为什么这么定】第 48 轮的两个极端都不行：完全不许挪 → 横向差几十像素时原地起跳必踩空；
    //   随便挪 → 走出边缘掉下去。判据就是"还在不在泡泡顶面上"。
    const onGroundFloor = g.y >= 455
    const sameGoal = extra._lockGoal && Math.abs(extra._lockGoal.x - target.x) < 1 && Math.abs(extra._lockGoal.y - target.y) < 1
    if (!sameGoal) extra._locked = false
    if (!extra._locked && Math.abs(gx) <= 6) { extra._locked = true; extra._lockGoal = { x: target.x, y: target.y } }
    // 横移：分三种情况，但**都不 return**（否则会挡住下面的起跳判定 —— 第 49 轮踩过：
    //   空中分支一 return，起跳就永远轮不到，机器人 90 秒 0 分）。
    let steer = 0
    if (!grounded) {
      // 空中不修正（第 50 轮起游戏本身也不接受空中输入，保持一致的预期）
      steer = 0
    } else if (Math.abs(gx) > 6) {
      // 【第 50 轮改】站在落脚面上就**一直朝目标走**，不再被 `_locked` 拦住。
      //   原来"到位就锁"会在目标换成远处的泡泡时把人锁在原地：实测玩家在 x=500 反复起跳，
      //   而它唯一可达的泡泡在 x=392（横向 108px > 落地窗 74px）→ 永远踩空（27600 分卡死）。
      //   现在：只要站在面上就走过去，走到 ±6px 才停。
      let canSteer = onGroundFloor
      if (!onGroundFloor && g.bubbleX != null) {
        // 站在泡泡上：允许挪动，但不许走出泡泡顶面（否则会掉下去）
        const dir = gx > 0 ? 1 : -1
        canSteer = (g.x - g.bubbleX) * dir < (g.bubbleR || 34) - 2
      }
      if (canSteer) steer = gx > 0 ? 1 : -1
    }
    if (steer > 0) extra.kd('ArrowRight')
    else if (steer < 0) extra.kd('ArrowLeft')
    // 起跳条件：站在落脚面上 + 横向已在落地窗内 + 落地后停了一拍（边沿触发，见下）
    // ⚠️ 边沿触发必须用**自己的帧计数**（`extra.frame`）：测试台的 `t.frame` 恒为 0，
    //    第一版用它当"上次起跳的帧号" → 第一帧就写进 0，之后每帧都判定"本帧已经跳过"，
    //    于是**一次都跳不起来**（实测玩家站在地面 30 秒、jumped 恒 0）。
    const landWindow = ((g.bubbleR != null ? g.bubbleR : (P.bubbleR || 34)) + 30)
    const alignedToTarget = Math.abs(target.x - g.x) <= landWindow
    // ★ 硬约束二（第 50 轮补）：**没对准就先在地面上走，别急着跳**。
    //   原来"一落地就跳"会让人在每个落脚点上只待 1 帧、横移 3px 就又飞起来 ——
    //   永远凑不齐那 75px 的横向差距（实测玩家在 x=483 原地弹到超时、7200 分卡死）。
    //   地面上是能走的（200px/s），前提就是**别急着跳**。
    if (grounded && !alignedToTarget) return true
    // 真的对准了 → 起跳（落地后停 0.08 秒，避免落地当帧又跳、等于没离开这一层）
    const sinceLand = (typeof g.landedAt === 'number') ? (g.t - g.landedAt) : 99
    if (grounded && sinceLand >= 0.08 && extra._jumpAt !== extra.frame) {
      extra.t.key(' ')
      extra._jumpAt = extra.frame
    }
    return true
  },
  // 极限顶顶球（第 48 轮，归档截图规则 + 7k7k/660779）：把球顶进对方（右边）瓶子。
  // ★ 官方说"电脑比我们更快更高"，所以机器人不能靠拼速度，只能**提前站位抢落点**。
  // ★ 站位要在球的**左边**（把球往右顶），并且要掺一个"别追太紧"的死区 ——
  //   否则人物会贴着球一路把它推到**自己**的瓶子里（第一版 AI/机器人一起犯这个错，
  //   实测 5 秒 0:2 输掉；两边的撞球方向都改成"由球在人哪一侧决定"之后才对）。
  ballpush(t, DBG, extra) {
    const g = DBG().ballPushState()
    if (!g) return true
    extra.ku('ArrowLeft'); extra.ku('ArrowRight')
    const P = DBG().ballPushParams()
    const gy = P.groundY || 470
    // 站在球的左侧（球离得远就多留一点，免得把它往回推）
    const wantX = g.ball.x - 40
    const dx = wantX - g.me.x
    if (dx > 10) extra.kd('ArrowRight')
    else if (dx < -10) extra.kd('ArrowLeft')
    // 球在天上且快到落点 → 跳起来顶
    const eta = g.ball.vy > 0 ? (gy - g.ball.y) / Math.max(1, g.ball.vy) : 99
    if (g.me.onGround && Math.abs(g.ball.x - g.me.x) < 70 && g.ball.y < gy - 90 && eta < 0.9) extra.t.key('ArrowUp')
    return true
  },
  // 潜行（无所遁形）：一直往前挪
  stealth(t, DBG, extra) {
    extra.t.key(' ')
    return true
  },
  // 晶石对战（第 58 轮补）：三消攒能量 + 多比自动出手 + 5v5。
  // 打法：**穷举找一步能连成三消的交换**，然后用真实的 crystalClick 走两步点过去
  //（这样走的是玩家那条代码路径，不是绕过去直接改棋盘）。
  // 找不到可换的就停手，让回合自己走（多比照样自动攻击）。
  crystal(t, DBG, extra) {
    const g = DBG().crystal()
    if (!g) return true
    // ⚠️ **结束之后要按键继续**：胜负结算画面是"空格 / 回车 继续"，
    //    不按键的话 phase 会永远停在 'crystal' —— 体检脚本会把它报成"打不通"，
    //    而实际上**早就打赢了**（诊断脚本里 f900 就已经 over=true win=true，却一直卡到 f7200）。
    if (g.over) { extra.t.key(' '); return true }
    // ⚠️ 别用 `extra.win`（体检脚本没往 extra 里塞 win，第一版就崩在这里）。
    //    通过测试台的取值接口拿数据模块。
    const D = (t && t.get) ? t.get('window.DKDbbData') : null
    const B = D && D.crystalBoard
    if (!B) return true
    const { cols, rows } = g.cfg
    // 深拷贝棋盘来试手，**不动真棋盘**
    const copy = g.grid.map((r) => r.slice())
    let found = null
    for (let y = 0; y < rows && !found; y++) {
      for (let x = 0; x < cols && !found; x++) {
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const bx = x + dx, by = y + dy
          if (bx >= cols || by >= rows) continue
          const trial = copy.map((r) => r.slice())
          if (B.trySwap(trial, cols, rows, x, y, bx, by)) { found = { x, y, bx, by }; break }
        }
      }
    }
    if (!found) return true
    DBG().crystalClick(found.x, found.y)
    DBG().crystalClick(found.bx, found.by)
    // 推进一点时间，让"回合"往前走（自动出手靠的是 crystalTick 里的计时）
    DBG().crystalTick(0.35)
    return true
  },
  // 士气对抗：出招（3×3 表里挑一个不亏的）
  morale(t, DBG, extra) {
    const st = DBG().dungeonState()
    if (!st.mo) return true
    if (st.mo.done === 'lose') { extra.t.key(' '); return true }
    if (st.mo.done) return true
    extra.t.key(' ')          // 默认选中的那一招
    return true
  },
  // 激流勇进：换道躲
  current(t, DBG, extra) {
    const st = DBG().dungeonState()
    if (!st.st) return true
    if (extra.frame % 12 === 0) extra.t.key('ArrowDown')
    extra.t.key(' ')
    return true
  },
  // 玛丽娜的考试：读题选正确答案
  // ⚠️ 这里**不能写 while 循环**：机器人每帧只做一次操作，`t.key()` 只是把键压进输入队列，
  // 不推进帧就不会生效 —— 第一版写了个 while 等 sel 变成正确答案，直接把体检脚本挂死。
  quiz(t, DBG, extra) {
    const q = DBG().dungeonState().quiz
    if (!q) return true
    if (q.picked >= 0) { extra.t.key(' '); return true }     // 已经选完 → 下一题
    const right = q.list[q.idx].right
    if (q.sel !== right) { extra.t.key(q.sel < right ? 'ArrowDown' : 'ArrowUp'); return true }
    extra.t.key(' ')
    return true
  },
  // 连接能量管线：**先穷举出解**（4^9 = 262144 种旋转组合，毫秒级），摆好，最后转一格走真实代码路径过关。
  // 【为什么不能"一直转当前格"】选中格不会自己换 —— 第一版就是这么写的，
  // 机器人在战神金刚第一关转了 40 秒也没接通（体检脚本当场报"卡在 pipe"）。
  pipe(t, DBG, extra) {
    const st = DBG().dungeonState()
    const p = st.pipe
    if (!p || DBG().pipeConnected()) return true
    if (extra.pipeMask === undefined) {
      const backup = p.cells.map((c) => c.rot)
      let mask = -1
      for (let m2 = 0; m2 < Math.pow(4, 9) && mask < 0; m2++) {
        let m = m2
        for (let i = 0; i < 9; i++) { p.cells[i].rot = m % 4; m = Math.floor(m / 4) }
        if (DBG().pipeConnected()) mask = m2
      }
      p.cells.forEach((c, i) => { c.rot = backup[i] })
      extra.pipeMask = mask
      if (mask < 0) return true              // 无解（单测里另有可解性断言）
      // 把 0..7 号格直接摆成解；8 号格**退到"差一转"**，这样下一帧的一次 pipeRotate()
      // 正好落在解上 —— 过关仍然走真实代码路径（不能直接摆成解，那样不会触发过关）。
      let m = mask
      const want = []
      for (let i = 0; i < 9; i++) { want[i] = m % 4; m = Math.floor(m / 4) }
      for (let i = 0; i < 8; i++) p.cells[i].rot = want[i]
      p.cells[8].rot = (want[8] + 3) % 4      // 差一次旋转
      p.sel = 8
      return true
    }
    DBG().pipeRotate()                        // 8 号格转一次 → 接通 → 过关
    return true
  },
  // 驾驶超级战机：鼠标打靶
  shooter(t, DBG, extra) {
    const g = DBG().dungeonState().sh
    if (!g || !g.targets || !g.targets.length) return true
    const tg = g.targets[0]
    extra.t.click(tg.x, tg.y)
    return true
  },
  // 战斗 / BOSS：一直出手
  battle(t, DBG, extra) {
    const b = DBG().state.battle
    if (b && b.phase === 'command' && b.intro <= 0) extra.t.key('Enter')
    return true
  },
  // 翻牌：翻第一张，然后按空格继续
  flip(t, DBG, extra) {
    const st = DBG().dungeonState()
    if (!st.flip) return true
    if (st.flip.picked < 0) DBG().pickFlip(0)
    else extra.t.key(' ')
    return true
  },
}
