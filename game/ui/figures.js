/* 多克多比 · 界面层：角色绘法（第 72 轮重构 · 批次 8）
   来源：原 game/game.js「角色形象 / 攻击动作 / 人物绘制」整段（1931–2315）。
   —— 立绘绘制 / 走路帧 / 影子 / 立绘头像 / 背景 / SP 指示；不读存档、不算伤害。
   依赖：引擎 window.DKDbb（art / anim / util / text）+ 内容表 window.DKDbbData（D）
        + 内核 G.core（S / ctx / W / H / bgImage）+ 领域 G.domain.seal（SEAL_MAX_SP）
        + game.js 的桥 G.app.battleGeom.BATTLE_BAR_H（战斗栏高）。
   只经 G.ui 出口对外（与 panels / places / zukan 相同的注册方式），game.js 用「解构 shim」取用。 */
(() => {
  'use strict'
  const G = window.DKDbbGame
  const D = window.DKDbbData
  const { art, anim, util, text } = window.DKDbb
  const { S, ctx, W, H, bgImage } = G.core
  const { SEAL_MAX_SP } = G.domain.seal

  // 角色形象 = 该形态的**官方立绘**（assets/forms/art/*.png）。  //
  // 为什么要换：早先归档里只导出了 6 套多比动作帧（超级克罗/龙/凤凰/光/暗/蝎），
  // 其余 5 只只能"按元素借用同系多比的帧"，于是瑞比特·兔（风）画成了龙多比的样子——
  // 用户截图报的就是这个。官方立绘现在是每只专属的，spriteDir 只作兜底。
  //
  // 朝向：**多数**官方立绘是朝左的 3/4 侧脸（沃特·空、德拉科·龙这些只看得到左眼）。
  // 游戏里 facing > 0 表示朝右，所以立绘的翻转条件要反过来，否则人物会一直背对敌人。
  // ⚠️ 第 55 轮更正：**不是全部朝左**。实测 47 张形态立绘里约 10 张是朝右的
  //    （用"头部亮部重心"量的，见 `_tools/probe-art-facing.mjs`），所以这个常数只是**多数倾向**，
  //    真正需要精确朝向的场合（战斗站位）改用显式开关，见 `PLAYER_FACE_RIGHT` 等处。
  const ART_FACES_LEFT = true
  const artFlip = (facing) => (ART_FACES_LEFT ? facing > 0 : facing < 0)

  // 立绘是静态图，所以动感靠程序化变换：呼吸起伏、发招前冲。
  // ---- 攻击动作（立绘是单张静态图，必须程序化补出来）----
  // 用户报的「人物没有攻击动作」根因是两处叠加：
  //   1) 形态立绘加载成功后，drawFigure 直接画静态图，只加 0.06 弧度（约 3.4°）微倾；
  //   2) 战斗里那句 `if (b.action.anim) {...} else lungeP = 40*sin(...)` ——
  //      而 perform() 对技能一定会填 anim，于是前冲分支永远走不到。
  // 结果就是"站着不动把技能放了"。这里给一条以演出时长为基准的动作时间轴。
  //
  // selfCast=true 时（治疗/增益/防御这类只作用于自己的技能）不往前冲，
  // 改成原地起跳蓄气的姿态，避免"给自己加血却冲向敌人"的荒谬画面。
  const ATK_WIND = 0.16   // 蓄力结束点
  const ATK_HIT = 0.34    // 冲到位的时刻
  const ATK_SETTLE = 0.62 // 回弹结束点

  

  // 玩家这次出手是不是"只作用于自己"（治疗/增益/净化/防御）。
  // 不能用 action.results 判断：perform() 的 buff / cleanse 分支压根不往 results 里塞东西，
  // 结果数组是空的，靠它判断会全部误判成"打敌人"，于是给自己加血也会朝敌人冲。
  // 所以这里严格镜像 doCommand 里那段选目标的逻辑。
  function playerActionIsSelfCast(b) {
    const a = b && b.action
    if (!a) return false
    if (a.isDefend) return true
    if (a.isItem) {
      const it = D.item(a.itemId)
      return !it || D.itemTargetsSelf(it)
    }
    const sk = a.skillName ? D.SKILLS[a.skillName] : null
    if (!sk) return false
    if (sk.range === 1) return false                                   // range 1 一律打敌人
    if (sk.range === 2) return !!sk.heal                               // range 2 只有治疗指向自己
    return !!(sk.heal || sk.buff || sk.cleanse)
  }

  function attackPose(t, dur, selfCast) {
    const k = dur > 0 ? Math.max(0, Math.min(1, t / dur)) : 1
    let dx = 0, lean = 0, squash = 0
    const smooth = (u) => u * u * (3 - 2 * u)          // smoothstep：起步慢、落点快
    if (selfCast) {
      // 原地蓄气：轻微后仰 + 向上提 + 落回
      const u = Math.sin(Math.min(1, k / 0.5) * Math.PI)
      dx = -6 * u
      lean = -0.06 * u
      squash = 0.05 * u
      return { dx, lean, squash, k, selfCast: true }
    }
    if (k < ATK_WIND) {
      const u = k / ATK_WIND                             // 蓄力：后撤并后仰
      dx = -18 * u
      lean = -0.11 * u
      squash = 0.04 * u
    } else if (k < ATK_HIT) {
      const u = smooth((k - ATK_WIND) / (ATK_HIT - ATK_WIND))  // 冲刺：快速前压
      dx = -18 + 96 * u
      lean = -0.11 + 0.34 * u
      squash = 0.04 - 0.10 * u                           // 前冲时略拉长
    } else if (k < ATK_SETTLE) {
      const u = (k - ATK_HIT) / (ATK_SETTLE - ATK_HIT)   // 命中回弹（先过冲再收回）
      dx = 78 * (1 - u) + 14 * Math.sin(u * Math.PI)
      lean = 0.23 * (1 - u)
      squash = -0.06 * (1 - u)
    } else {
      const u = (k - ATK_SETTLE) / (1 - ATK_SETTLE)      // 归位
      dx = -14 * (1 - u)
    }
    return { dx, lean, squash, k, hit: k >= ATK_HIT && k < ATK_SETTLE }
  }

  function drawFigure(cx, bottomY, height, action, t, facing, pose) {
    const img = art.get(S.form)
    if (art.ready(img)) {
      // 非待机动作（战斗姿态/发招）就前倾一点，待机只做呼吸
      const isAtk = !!action && action !== S.form.actionIdle && action !== S.form.actionWalk
      const breathe = Math.sin(t * 2.6) * 0.014          // 每秒约 0.41 次呼吸
      const lunge = isAtk ? 0.06 : 0                      // 出招时前倾
      // pose 由战斗里的 attackPose 提供：前冲位移 + 额外倾角 + 拉伸/压缩
      const pdx = pose ? pose.dx : 0
      const plead = pose ? pose.lean : 0
      const psq = pose ? pose.squash : 0
      const dir = facing < 0 ? -1 : 1
      ctx.save()
      ctx.translate(cx + pdx * dir, bottomY)
      ctx.scale(1 - breathe * 0.5 + psq * 0.6, 1 + breathe * 0.5 - psq)  // 以脚底为轴，看起来在呼吸/发力
      ctx.rotate(dir * (lunge + plead))
      util.drawSprite(ctx, img, 0, 0, height, { flip: artFlip(facing) })
      ctx.restore()
      return true
    }
    // 兜底 1：立绘没加载出来时用动画帧，保证不空场
    const entry = anim.get(S.form.spriteDir, action) || anim.get(S.form.spriteDir, S.form.actionIdle)
    if (entry) {
      const idx = Math.floor(t * 24) % entry.frames
      const frame = anim.getFrame(entry, idx)
      util.drawSprite(ctx, frame, cx, bottomY, height, { flip: facing < 0 })
      return true
    }
    // 兜底 2（第 55 轮）：既没有立绘、也没有动画帧的形态 —— 画占位形象。
    //
    // 【为什么必须补这一步】用户报「好多多比是没有绘图的就完全空白」。
    //   查因：52 只形态里 **25 只没有立绘**，而 `drawFigure` 到这里直接 `return false`
    //   → 画布上**什么都不画**，玩家看到的就是一片空白（连"这是个多比"都看不出来）。
    //   归档里也确实没有它们的图（按名搜 4933 张，命中的全是"大禹治水壁纸""草料房"这类同名误命中）。
    //
    // 【为什么画"通用占位"而不是自己编一张立绘】编图就是造假，而且这 25 只没有官方图可依。
    //   所以这里给一个**中性、看得出是占位**的形象：元素色轮廓 + 名字。
    //   玩家能立刻明白"这只的立绘没留下来"，而不是以为游戏画崩了。
    drawFormPlaceholder(cx, bottomY, height, S.form, t)
    return true
  }

  // 无立绘形态的占位形象（第 55 轮）
  //
  // 【为什么要有它】用户报「好多多比是没有绘图的就完全空白」。查因：52 只里 **25 只没有立绘**，
  //   `drawFigure` 走到兜底就 `return false` → 画布上什么都不画。归档里也确实没有它们的图
  //   （按名搜 4933 张，命中的全是"大禹治水壁纸""草料房"这类同名误命中）。
  //
  // 【造型依据：对齐官方立绘的画风】实测官方立绘的共同特征：
  //   **粗深色描边**（≈3~4px @640 高）、主体色 + 一块暗部 + 一点白高光、脚下有接地影。
  //   第一版占位画成了"半透明灰圆堆"，和官方立绘放一起像两个游戏（对比图见
  //   `_tools/_preview-form-placeholder2.mjs` 的产物），所以这一版重做：
  //     · **一体化剪影**：头/身/脚用互相重叠的圆拼出来，外轮廓连续（不是几个分开的圆）；
  //     · 描边用**掩码膨胀**求出（`outline = dilate(silhouette) - silhouette`），所以任何尺寸下都匀；
  //     · 元素色主体 + 右下暗部 + 左上高光 + **多比式大眼**。
  //   ⚠️ 画的是**通用占位**，不是编造某只多比的样子 —— 官方图不存在，编就是造假。
  //   25 只里 element 大多为'无'（原表就没给），这时用中性灰蓝而不是乱猜属性色。
  function drawFormPlaceholder(cx, bottomY, height, form, t) {
    const col = (D.ELEMENT_COLOR && D.ELEMENT_COLOR[form.element]) || '#aabadd'
    const h = height
    const bob = Math.sin((t || 0) * 2.6) * h * 0.010           // 轻微呼吸，别像死图
    const headR = h * 0.225, headY = -h * 0.70
    const bodyRx = h * 0.27, bodyRy = h * 0.26, bodyY = -h * 0.30
    const hex = (c) => c
    const shade = (c, k) => {
      // 支持 '#rgb' / '#rrggbb'
      const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c)
      if (!m) return c
      let s = m[1]
      if (s.length === 3) s = s.split('').map((x) => x + x).join('')
      const r = parseInt(s.slice(0, 2), 16), g = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16)
      const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)))
      return `rgb(${f(r)},${f(g)},${f(b)})`
    }
    ctx.save()
    // 接地影（与 drawGroundShadow 一致的风格）
    ctx.globalAlpha = 0.32
    ctx.fillStyle = '#0d1c30'
    ctx.beginPath()
    ctx.ellipse(cx, bottomY + h * 0.004, h * 0.30, h * 0.030, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.translate(cx, bottomY + bob)
    // ① 剪影路径：头 + 身 + 连接段 + 两脚（互相重叠 → 外轮廓连续）
    const silhouette = () => {
      ctx.beginPath()
      ctx.ellipse(0, headY, headR, headR * 0.96, 0, 0, Math.PI * 2)
      ctx.ellipse(0, bodyY, bodyRx, bodyRy, 0, 0, Math.PI * 2)
      ctx.ellipse(0, -h * 0.12, bodyRx * 0.92, h * 0.14, 0, 0, Math.PI * 2)
      ctx.ellipse(-h * 0.115, -h * 0.028, h * 0.085, h * 0.032, 0, 0, Math.PI * 2)
      ctx.ellipse(h * 0.115, -h * 0.028, h * 0.085, h * 0.032, 0, 0, Math.PI * 2)
    }
    // ② 粗描边：先把剪影整体描一圈粗线，再在**上面**填色 → 得到"色块外面一圈深线"
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#2a1a24'
    ctx.lineWidth = Math.max(3, h * 0.030)
    silhouette(); ctx.stroke()
    // ③ 主体色
    ctx.fillStyle = col
    silhouette(); ctx.fill()
    // ④ 暗部（右下）：裁剪在剪影内，避免糊到描边外
    ctx.save()
    silhouette(); ctx.clip()
    ctx.fillStyle = shade(col, 0.62)
    ctx.beginPath()
    ctx.ellipse(h * 0.16, bodyY + h * 0.04, bodyRx * 0.95, bodyRy * 1.15, 0, 0, Math.PI * 2)
    ctx.fill()
    // ⑤ 高光（左上）
    ctx.fillStyle = 'rgba(255,255,255,.85)'
    ctx.beginPath()
    ctx.ellipse(-h * 0.085, headY - h * 0.055, h * 0.050, h * 0.035, -0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    // ⑥ 多比式大眼（白底 + 深瞳），让占位一眼看着"是个多比"
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.ellipse(s * h * 0.085, headY + h * 0.005, h * 0.055, h * 0.075, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#1e1420'
      ctx.beginPath()
      ctx.ellipse(s * h * 0.085, headY + h * 0.015, h * 0.026, h * 0.038, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    // ⑦ 名字（脚下方，让玩家知道这是哪只）
    text.stroked(ctx, form.name, 0, h * 0.085,
      { size: Math.max(9, h * 0.070), align: 'center', color: '#e6ecf6', lw: Math.max(2, h * 0.014) })
    ctx.restore()
  }

  // 行走立绘：形态素材**没有行走动作**（只有普通姿态/战斗姿态/发招/胜利/防御/闪躲），
  // 所以之前移动时是"滑行"的 —— 用户反馈的"人物移动没有画面"就是这个。
  // 这里用程序化的"踏步"补足：走动时按步频做上下起伏 + 左右摇摆 + 轻微前倾。
  // 穿服饰时画人：四向帧全来自归档（正面一/二 踏步、背面一/二 背向）。
  // 返回 true 表示已经画了；取不到素材返回 false，让调用方退回形态立绘（不静默留空）。
  function drawCostumeFigure(c, cx, bottomY, height, t, facing, stepPhase, moving) {
    const A = c.anim || {}
    // 朝向：**向上走用背面帧**，其余用正面帧（时装序列有 正面一/二 与 背面一/二 四套）
    const useBack = (facing === 'up')
    // ⚠️ 第 54 轮修：没有 `anim` 字段的造型（`D.npcCostumes()` 给的就是 `{name, dir, action}`）
    //    这里原来把**动作名当成空串**去查（`anim.get(c.dir, '')`）→ 查不到 → 返回 false →
    //    主角**退回多比立绘**，看起来"改成多克没生效"。NPC 那条路传的是 `(dir, action)`，所以 NPC 一直正常。
    const e1 = anim.get(A.front1 ? A.front1.dir : c.dir, A.front1 ? A.front1.action : (c.action || ''))
    const e2 = anim.get(A.front2 ? A.front2.dir : c.dir, A.front2 ? A.front2.action : (c.action || ''))
    const b1 = anim.get(A.back1 ? A.back1.dir : c.dir, A.back1 ? A.back1.action : (c.action || ''))
    const b2 = anim.get(A.back2 ? A.back2.dir : c.dir, A.back2 ? A.back2.action : (c.action || ''))
    const idle = useBack ? (b1 || e1) : e1
    const step = useBack ? (b2 || idle) : (e2 || idle)
    if (!idle) return false
    const entry = (moving && step) ? (Math.floor(stepPhase * 2) % 2 === 0 ? idle : step) : idle
    const img = anim.getFrame(entry, moving ? Math.floor(t * 14) % entry.frames : Math.floor(t * 4) % Math.min(entry.frames, 17))
    if (!img) return false
    // 接地影（第 53 轮）：穿服饰时本来就是真走路帧，但脚下同样没有接地线索
    drawGroundShadow(cx, bottomY, height * 0.40)
    if (facing === 'left') {
      ctx.save(); ctx.translate(cx * 2, 0); ctx.scale(-1, 1)
      util.drawSprite(ctx, img, cx, bottomY, height)
      ctx.restore()
    } else {
      util.drawSprite(ctx, img, cx, bottomY, height)
    }
    return true
  }

  // 脚下的接地影（第 53 轮）。
  // 【为什么必须有它】用户说主角走路"就像在空中飘动一样"。除了动画本身是静态图在摆，
  // 另一个原因是**脚下没有任何接地线索** —— 角色和地面之间缺一个接触点。
  // NPC 和主角以前都没有影子；补上之后"站在地上"这件事才成立。
  // 影子跟着动作宽度微微缩放，比一个死椭圆自然。
  function drawGroundShadow(cx, bottomY, width, alpha) {
    ctx.save()
    ctx.globalAlpha = alpha === undefined ? 0.30 : alpha
    ctx.fillStyle = '#0a1626'
    ctx.beginPath()
    ctx.ellipse(cx, bottomY + 2, width * 0.5, width * 0.16, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // 走路（第 53 轮重做）。
  // 【原来错在哪】旧实现把**大幅站立立绘**绕脚底 `rotate(sin)` 来回摆 + `lift` 上下浮 ——
  // 那是一张静态图当钟摆，所以用户看到的是"飘"。
  // 【现在】用 `_tools/gen-form-walk.mjs` 合成的 **4 帧步态**（脚底钉住的挤压 + 侧倾），
  // 逐帧切换（和 NPC 用真走路帧是同一套做法）；取不到走路帧才回退到站立立绘，
  // 且回退时**只做轻微挤压、不再旋转**（旋转正是"飘"的观感来源）。
  function drawFigureWalking(cx, bottomY, height, t, facing, stepPhase) {
    const ph = stepPhase * Math.PI * 2
    // 接地影跟着步态微微收放（着地时略宽、过渡时略窄）
    const shadowW = height * 0.40 * (1 - 0.10 * Math.abs(Math.sin(ph)))
    drawGroundShadow(cx, bottomY, shadowW)
    // ① 优先用合成的走路帧
    if (art.walk && art.hasWalk && art.hasWalk(S.form)) {
      // ⚠️ 帧数**问接口**，不写死：第 53 轮把帧数从 4 加到 6 之后，
      //    这里如果还留着 `Math.floor(stepPhase * 4) % 4`，后两帧就永远播不到。
      const n = art.walkFrames(S.form) || 4
      const idx = Math.floor(stepPhase * n) % n
      const frame = art.walk(S.form, idx)
      if (frame && art.ready(frame)) {
        util.drawSprite(ctx, frame, cx, bottomY, height, { flip: artFlip(facing) })
        return true
      }
    }
    // ② 回退：官方立绘。**不旋转**，只用竖直挤压表达步态（脚底为支点）
    const img = art.get(S.form)
    if (art.ready(img)) {
      const squash = 1 + Math.sin(ph * 2) * 0.012
      ctx.save()
      ctx.translate(cx, bottomY)
      ctx.scale(1 / Math.sqrt(squash), squash)
      util.drawSprite(ctx, img, 0, 0, height, { flip: artFlip(facing) })
      ctx.restore()
      return true
    }
    // ③ 归档里的动画序列（只有光多比/凤凰多比有）。
    //    两边都取不到时 → 占位形象（第 55 轮）：这 25 只形态既没立绘也没动画帧，
    //    以前这里返回 false 会导致**画布上一片空白**（用户报的"完全空白"就是它）。
    const action = S.form.actionWalk || S.form.actionIdle
    const entry = anim.get(S.form.spriteDir, action) || anim.get(S.form.spriteDir, S.form.actionIdle)
    const frame = entry ? anim.getFrame(entry, Math.floor(t * 34) % entry.frames) : null
    if (!frame) { drawFormPlaceholder(cx, bottomY, height, S.form, t); return true }
    util.drawSprite(ctx, frame, cx, bottomY, height, { flip: facing < 0 })
    return true
  }

  // 面板里的官方立绘：脚下一个柔和投影 + 轻微呼吸，看起来是"站着"而不是贴图。
  // faceRight=true 时把立绘翻过来，让它朝着右边的信息栏（原版立绘默认朝左）。
  function drawArtPortrait(cx, bottomY, height, form, faceRight) {
    const img = art.get(form)
    if (!art.ready(img)) return false
    const t = performance.now() / 1000
    const breathe = Math.sin(t * 2.2) * 0.012
    const h = height * (1 + breathe * 0.5)
    // 地面投影（跟着呼吸微微缩放，比死板的椭圆自然）
    const sw = h * 0.34 * (1 - breathe)
    ctx.save()
    ctx.globalAlpha = 0.28
    ctx.fillStyle = '#0d1c30'
    ctx.beginPath()
    ctx.ellipse(cx, bottomY + 3, sw, sw * 0.24, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    util.drawSprite(ctx, img, cx, bottomY, h, { flip: !!faceRight })
    return true
  }

  function drawBackground(sc, dim = 0) {
    const bg = bgImage(sc.file)
    if (bg.complete && bg.naturalWidth) {
      const r = Math.max(W / bg.naturalWidth, H / bg.naturalHeight)
      const dw = bg.naturalWidth * r, dh = bg.naturalHeight * r
      ctx.drawImage(bg, (W - dw) / 2, (H - dh) / 2, dw, dh)
    } else {
      ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, W, H)
    }
    if (dim) { ctx.fillStyle = `rgba(6,10,20,${dim})`; ctx.fillRect(0, 0, W, H) }
  }

  // （第 72 轮重构批次 7：已迁到 game/ui/worldmap.js，由顶部"解构 shim"取用）

  // （第 72 轮重构批次 7：已迁到 game/ui/explore.js，由顶部"解构 shim"取用）

  // ==================== SP 指示 + 结印操作界面 ====================
  // 圆角矩形路径 roundBox 已迁到 `game/ui/panels.js`（见文件顶部解构）。

  // 官方：「攒到 SP 以后结印技能的图标才会变亮」——所以 SP 必须随时看得见。
  // 三颗菱形 = 3 SP（官方上限），下面一条细进度条显示当前这一格攒了多少。
  function drawSpPips(b) {
    const n = SEAL_MAX_SP
    const sp = b.player.sp || 0
    const charge = sp >= n ? 0 : util.clamp(b.player.spCharge || 0, 0, 1)
    const x0 = 22, cy = H - G.app.battleGeom.BATTLE_BAR_H - 46
    text.stroked(ctx, '结印', x0, cy, { size: 11, weight: 'normal', color: sp > 0 ? '#ffd23f' : '#7f8fa8', lw: 3 })
    for (let i = 0; i < n; i++) {
      const x = x0 + 34 + i * 20
      const full = i < sp
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(x + 6, cy - 7); ctx.lineTo(x + 12, cy)
      ctx.lineTo(x + 6, cy + 7); ctx.lineTo(x, cy)
      ctx.closePath()
      ctx.fillStyle = full ? '#ffd23f' : 'rgba(255,255,255,.07)'
      ctx.fill()
      ctx.strokeStyle = full ? '#fff3b0' : 'rgba(255,255,255,.30)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.restore()
    }
    text.stroked(ctx, `${sp}/${n}`, x0 + 34 + n * 20 + 4, cy + 5,
      { size: 11, weight: 'normal', color: sp > 0 ? '#ffd23f' : '#7f8fa8', lw: 3 })
    // 当前格的充能进度
    const bw = n * 20 + 14
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,.10)'
    ctx.fillRect(x0 + 34, cy + 11, bw, 3)
    if (charge > 0) { ctx.fillStyle = '#ffd23f'; ctx.fillRect(x0 + 34, cy + 11, bw * charge, 3) }
    ctx.restore()
  }

  G.ui = G.ui || {}
  Object.assign(G.ui, {
    playerActionIsSelfCast, attackPose, drawFigure, drawCostumeFigure,
    drawGroundShadow, drawFigureWalking, drawArtPortrait, drawBackground, drawSpPips,
  })
})()
