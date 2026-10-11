/* 多克多比 · 应用层：场景互通 / 出口 / gotoScene / enterScene（第 72 轮重构批次 5）
   来源：原 game.js 第 108–176、382–402 行，内容一致（含原注释）。
   依赖：内核 G.core 的共享状态 S / 画布 W / H / 提示原语 toast；引擎 window.DKDbb 的
   util / save / audio；鼠标 window.DKDbbMouse。场景 BGM 经 G.app.bgm 惰性解析，
   小怪刷新经 G.app.spawn 惰性解析（两者已迁出，直接指向最终模块路径）。
   只经 G.app.scene 出口对外，game.js 用「解构 shim」取用（调用点一处不改）。 */
(() => {
  'use strict'

  const G = window.DKDbbGame
  const { S, W, H, toast } = G.core
  const { util, save, audio } = window.DKDbb
  const M = window.DKDbbMouse

  // 跨应用层桥（惰性箭头：调用时才解析，故加载顺序无关）。
  const sceneBgmFor = (...a) => G.app.bgm.sceneBgmFor(...a)
  const refreshSpawns = (...a) => G.app.spawn.refreshSpawns(...a)

  // 场景可行走区域（比例，随画布尺寸换算）
  // 页游里角色只在场景中间偏下的一片区域活动，这里按画面比例给一个安全区
  const WALK = { x0: 0.06, x1: 0.94, y0: 0.46, y1: 0.86 }

  function walkBounds() {
    return {
      x0: W * WALK.x0, x1: W * WALK.x1,
      y0: H * WALK.y0, y1: H * WALK.y1,
    }
  }

  // ==================== 场景互通（同一座岛内走到边缘就换场景）====================
  // ★ 依据等级：derived（推算）★
  //   归档里的 88 张场景图**只有编号，没有相邻关系数据**，原版的场景连接表也没留存。
  //   所以连接规则由这里定义，只有这一处，可复核、可替换：
  //     同一座岛内，场景按 world.js 的 scenes 数组顺序串成一条链；
  //     走到屏幕最左 / 最右边缘继续推 → 进入相邻场景，并从**对侧**边缘出现。
  //   岛屿归属仍然来自 world.js（那是按画面物体分类得出的，不是这里定的）。
  const EXIT_ZONE = 96           // 屏幕左右两端的感应区宽度
  function sceneExits(id) {
    const isles = (S.world && S.world.islands) || []
    for (const isl of isles) {
      const arr = isl.scenes || []
      const i = arr.indexOf(id)
      if (i < 0) continue
      return {
        island: isl, index: i, total: arr.length,
        left: i > 0 ? arr[i - 1] : null,
        right: i < arr.length - 1 ? arr[i + 1] : null,
      }
    }
    return null
  }
  // 可点击的边缘出口（画图与命中测试共用同一份，避免两处不一致）
  function sceneExitRects() {
    const id = S.current ? S.current.id : null
    const ex = id != null ? sceneExits(id) : null
    const h = 76, cy = H * 0.60
    const out = []
    if (ex && ex.left != null) out.push({ side: 'left', to: ex.left, x: 0, y: cy - h / 2, w: EXIT_ZONE, h })
    if (ex && ex.right != null) out.push({ side: 'right', to: ex.right, x: W - EXIT_ZONE, y: cy - h / 2, w: EXIT_ZONE, h })
    return out
  }
  function sceneLabel(id) {
    const sc = S.scenes && S.scenes[id]
    return sc ? (sc.name || `场景 ${id}`) : `场景 ${id}`
  }
  // 换场景。fromSide 表示"从哪一侧进来"：从左边进来就贴左边缘出现。
  function gotoScene(id, fromSide) {
    if (id == null || !S.scenes || !S.scenes[id]) { toast('这个方向还没有可去的地方'); return false }
    // 走进一张图 = 重新进图 → 小怪全部刷新（出去再回来就能接着打）
    enterScene(id, { keepMode: true, refresh: 'force' })
    const wb = walkBounds()
    if (fromSide === 'left') S.player.x = wb.x0 + 6
    else if (fromSide === 'right') S.player.x = wb.x1 - 6
    S.player.target = null
    S.warp = { t: 0, dur: 0.45, side: fromSide }
    save.data._lastScene = id
    save.persist()
    audio.sfx('assets/sfx/onClick_03.mp3')
    return true
  }

  // ==================== 场景 ====================
  function enterScene(id, opts = {}) {
    const sc = S.scenes[id]
    if (!sc) { toast('这个场景还没有内容'); return }
    S.current = sc
    M.closeMenu()
    const wb = walkBounds()
    S.player.x = util.clamp(W / 2, wb.x0, wb.x1)
    S.player.y = util.clamp(H * 0.72, wb.y0, wb.y1)
    S.player.t = 0
    S.player.target = null
    // 小怪刷新：走进这张图时按计时刷新；opts.refresh === 'force' 时全部刷新
    // （从别的场景走过来、或从大地图进来，都算"重新进图"，怪应该重新出现）
    refreshSpawns(sc, opts.refresh === 'force')
    if (!save.data.visited.includes(id)) { save.data.visited.push(id); save.persist() }
    save.data._lastScene = id; save.persist()
    // 场景音乐：优先用"按场景类型"选的原版曲子（主城/野外/副本各不同），
    // 场景自带 bgm 时以它为优先（清单里给每座岛配过）。
    audio.playBgm(sc.bgm || sceneBgmFor(sc))
    if (!opts.keepMode) S.mode = 'explore'
  }

  G.app = G.app || {}
  G.app.scene = { EXIT_ZONE, walkBounds, sceneExits, sceneExitRects, sceneLabel, gotoScene, enterScene }
})()