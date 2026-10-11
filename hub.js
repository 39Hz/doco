/* 多克多比 · 浮空群岛 Hub
   世界地图导航 + 场景档案馆，纯前端零依赖，file:// 可直接运行 */
(() => {
  'use strict'

  const $ = (id) => document.getElementById(id)
  const el = {
    app: $('app'),
    mapFrame: $('map-frame'), hotspots: $('hotspots'),
    panelEmpty: $('panel-empty'), panelBody: $('panel-body'),
    pNum: $('p-num'), pName: $('p-name'), pTag: $('p-tag'), pDesc: $('p-desc'),
    pTrack: $('p-track'), pPlay: $('p-play'), pTrackName: $('p-track-name'),
    pScenes: $('p-scenes'), pSceneCount: $('p-scene-count'),
    pHint: $('p-hint'), pPick: $('p-pick'),
    pExplore: $('p-explore'), pGallery: $('p-gallery'),
    stageMap: $('stage-map'), stageGallery: $('stage-gallery'),
    stripWrap: $('strip-wrap'), strip: $('strip'), countScenes: $('count-scenes'),
    viewport: $('viewport'), sceneImg: $('scene-img'),
    sceneName: $('scene-name'), sceneIdx: $('scene-idx'), sceneDesc: $('scene-desc'),
    np: $('now-playing'), npText: $('np-text'),
    prev: $('btn-prev'), next: $('btn-next'),
    play: $('btn-play'), loop: $('btn-loop'), vol: $('vol'), volNum: $('vol-num'),
    trackList: $('track-list'), countTracks: $('count-tracks'),
    btnEdit: $('btn-edit'), btnSfx: $('btn-sfx'),
    picker: $('picker'), pickerGrid: $('picker-grid'), pickerTitle: $('picker-title'), pickerClose: $('picker-close'),
    status: $('foot-status'), galleryStatus: $('gallery-status'),
  }

  const LS = {
    get: (k, d) => { try { const v = localStorage.getItem('dkdbb.' + k); return v === null ? d : JSON.parse(v) } catch { return d } },
    set: (k, v) => { try { localStorage.setItem('dkdbb.' + k, JSON.stringify(v)) } catch {} },
  }

  const S = {
    scenes: [], bgm: [], sfx: [],
    islands: [], world: null,
    mode: 'map',
    island: null,            // 当前选中岛
    scene: 0,                // 档案馆当前场景
    track: -1,
    editing: false,
    renaming: LS.get('titles', {}),
    favs: LS.get('favs', []),
    bindings: LS.get('bindings', {}),   // islandId -> [sceneId...]，用户覆盖自动绑定
    visited: LS.get('visited', []),
    loopOne: true, sfxOn: true, volume: LS.get('volume', 55), muted: false,
    autoplayTimer: null, autoplaying: false,
  }

  // ================= 音频 =================
  const audio = new Audio()
  audio.preload = 'auto'
  const sfxCache = {}

  function applyVol() { audio.volume = S.muted ? 0 : S.volume / 100 }

  function playSfx(role) {
    if (!S.sfxOn || S.muted) return
    const item = S.sfx.find((s) => s.role === role)
    if (!item) return
    try {
      let a = sfxCache[item.file]
      if (!a) { a = new Audio(item.file); a.preload = 'auto'; sfxCache[item.file] = a }
      a.currentTime = 0
      a.volume = Math.min(0.45, S.volume / 100)
      a.play().catch(() => {})
    } catch {}
  }

  function playTrackByFile(file, label) {
    if (!file) return
    const idx = S.bgm.findIndex((b) => b.file === file)
    if (idx >= 0) { loadTrack(idx, true); return }
    // 岛专属曲目不在原声列表里时，直接播
    audio.src = file
    applyVol()
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    el.npText.textContent = label || '该岛配乐'
  }

  function loadTrack(i, autoplay) {
    if (!S.bgm.length) return
    i = ((i % S.bgm.length) + S.bgm.length) % S.bgm.length
    S.track = i
    const t = S.bgm[i]
    audio.src = t.file
    applyVol()
    renderTracks()
    el.npText.textContent = `${t.title} · ${t.secs}s`
    if (autoplay) audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }

  function setPlaying(on) {
    el.np.classList.toggle('playing', on)
    el.play.textContent = on ? '❚❚' : '▶'
  }

  function togglePlay() {
    if (S.track < 0) { loadTrack(0, true); return }
    if (audio.paused) audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    else { audio.pause(); setPlaying(false) }
  }

  audio.addEventListener('ended', () => {
    if (S.loopOne) { audio.currentTime = 0; audio.play().catch(() => {}) }
    else loadTrack(S.track + 1, true)
  })
  audio.addEventListener('play', () => setPlaying(true))
  audio.addEventListener('pause', () => setPlaying(false))

  // ================= 数据准备 =================
  function sceneById(id) { return S.scenes.find((s) => s.id === id) }
  function sceneTitle(s) { return S.renaming[s.id] || s.title }

  // 自动绑定：按场景画面内容归入对应岛屿（人工比对得出，非猜测性算法）
  const AUTO = {
    castle: [2], desert: [6], angel: [4], market: [3], crystal: [5],
    wilds: [7], volcano: [8], coral: [], factory: [9], rock: [10],
    forest: [11], islet: [],
  }

  function islandScenes(isl) {
    const custom = S.bindings[isl.id]
    const ids = custom !== undefined ? custom : (isl.scenes || AUTO[isl.id] || [])
    return ids.map(sceneById).filter(Boolean)
  }

  // ================= 世界地图 =================
  function renderHotspots() {
    el.hotspots.innerHTML = ''
    const MW = S.world.mapW, MH = S.world.mapH
    for (const isl of S.islands) {
      const d = document.createElement('div')
      d.className = 'hotspot'
      d.dataset.id = isl.id
      // 坐标按原图像素定义，再换算成百分比：宽高各按自身轴换算，
      // 这样椭圆热区随容器缩放但不变形（用 % + aspect-ratio 会把高度按宽度算，导致竖直方向过大）
      d.style.left = (isl.x / MW * 100) + '%'
      d.style.top = (isl.y / MH * 100) + '%'
      d.style.width = (isl.rx * 2 / MW * 100) + '%'
      d.style.height = (isl.ry * 2 / MH * 100) + '%'
      d.innerHTML = `<span class="label">${isl.n}. ${isl.name}</span><span class="dot"></span>`
      d.addEventListener('mouseenter', () => { playSfx('hover'); if (!S.editing) selectIsland(isl, false) })
      d.addEventListener('click', () => { playSfx('click'); selectIsland(isl, true); if (S.editing) openPicker(isl) })
      el.hotspots.appendChild(d)
    }
  }

  function selectIsland(isl, focus) {
    S.island = isl
    for (const h of el.hotspots.children) h.classList.toggle('active', h.dataset.id === isl.id)
    el.panelEmpty.classList.add('hidden')
    el.panelBody.classList.remove('hidden')
    el.pNum.textContent = isl.n
    el.pName.textContent = isl.name
    el.pTag.textContent = isl.tag
    el.pDesc.textContent = isl.desc

    const file = isl.bgm
    el.pTrackName.textContent = file ? file.split('/').pop() : '—'
    el.pPlay.disabled = !file

    renderIslandScenes(isl)
    el.pPick.classList.toggle('hidden', !S.editing)
    updateStatus()

    if (focus && file) playTrackByFile(file, isl.name + ' 配乐')
  }

  function renderIslandScenes(isl) {
    const list = islandScenes(isl)
    el.pSceneCount.textContent = list.length
    el.pScenes.innerHTML = ''
    for (const s of list) {
      const d = document.createElement('div')
      d.className = 'p-scene'
      d.innerHTML = `<img loading="lazy" src="${s.file}" alt=""><span>${sceneTitle(s)}</span>`
      d.addEventListener('click', () => { playSfx('click'); gotoScene(s.id) })
      el.pScenes.appendChild(d)
    }
    el.pHint.classList.toggle('hidden', list.length > 0)
  }

  // ================= 档案馆 =================
  function renderStrip(onlyIds) {
    el.strip.innerHTML = ''
    thumbEls.length = 0
    const list = onlyIds ? onlyIds.map(sceneById).filter(Boolean) : S.scenes
    list.forEach((s) => {
      const i = S.scenes.indexOf(s)
      const d = document.createElement('div')
      d.className = 'thumb'
      d.dataset.i = i
      d.innerHTML = `<img loading="lazy" decoding="async" src="${s.file}" alt="">
        <span class="num">${i + 1}</span><span class="fav">★</span>`
      d.addEventListener('click', () => { show(i); playSfx('click') })
      d.addEventListener('mouseenter', () => playSfx('hover'))
      el.strip.appendChild(d)
      thumbEls.push(d)
    })
    el.countScenes.textContent = onlyIds ? `${list.length} / ${S.scenes.length}` : S.scenes.length
  }
  const thumbEls = []

  function show(i, opts = {}) {
    if (!S.scenes.length) return
    i = Math.max(0, Math.min(S.scenes.length - 1, i))
    S.scene = i
    const s = S.scenes[i]
    el.sceneImg.classList.remove('ready')
    const pre = new Image()
    pre.onload = pre.onerror = () => { el.sceneImg.src = s.file; el.sceneImg.classList.add('ready') }
    pre.src = s.file
    el.sceneName.textContent = sceneTitle(s)
    el.sceneIdx.textContent = `${i + 1} / ${S.scenes.length} · ${s.w}×${s.h}`
    el.sceneDesc.textContent = s.desc
    el.sceneName.style.color = (s.kind === 'title' || s.kind === 'worldmap') ? 'var(--accent)' : ''
    thumbEls.forEach((d, k) => d.classList.toggle('active', i === (Number(d.dataset.i))))
    const active = el.strip.querySelector('.thumb.active')
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    if (!S.visited.includes(s.id)) { S.visited.push(s.id); LS.set('visited', S.visited); updateStatus() }
  }

  function step(d) { show(S.scene + d); playSfx('click') }

  function gotoScene(id) {
    const i = S.scenes.findIndex((s) => s.id === id)
    if (i < 0) return
    setMode('gallery')
    show(i)
  }

  function renderTracks() {
    el.trackList.innerHTML = ''
    S.bgm.forEach((t, i) => {
      const b = document.createElement('button')
      b.className = 'track' + (i === S.track ? ' active' : '')
      b.textContent = t.title
      b.title = `${t.name}.mp3 · ${t.secs} 秒`
      b.addEventListener('click', () => { loadTrack(i, true); playSfx('click') })
      el.trackList.appendChild(b)
    })
    el.countTracks.textContent = S.bgm.length
  }

  // ================= 模式切换 =================
  function setMode(m) {
    S.mode = m
    for (const b of document.querySelectorAll('.btn.mode')) b.classList.toggle('on', b.dataset.mode === m)
    el.stageMap.classList.toggle('hidden', m !== 'map')
    el.stageGallery.classList.toggle('hidden', m !== 'gallery')
    el.stripWrap.classList.toggle('hidden', m !== 'gallery')
    el.app.classList.toggle('gallery-mode', m === 'gallery')
    if (m === 'gallery') { if (!thumbEls.length) renderStrip(); show(S.scene) }
    updateStatus()
  }

  // ================= 编辑绑定 =================
  function toggleEdit() {
    S.editing = !S.editing
    el.btnEdit.classList.toggle('on', S.editing)
    el.mapFrame.classList.toggle('editing', S.editing)
    el.btnEdit.textContent = S.editing ? '✎ 绑定时（开着）' : '✎ 编辑绑定'
    el.pPick.classList.toggle('hidden', !S.editing)
    el.mapFrame.style.cursor = S.editing ? 'crosshair' : ''
    updateStatus()
  }

  let pickerIsland = null
  function openPicker(isl) {
    pickerIsland = isl
    el.pickerTitle.textContent = `给「${isl.name}」挑选所属场景（可多选）`
    const cur = new Set(islandScenes(isl).map((s) => s.id))
    el.pickerGrid.innerHTML = ''
    S.scenes.forEach((s, i) => {
      const d = document.createElement('div')
      d.className = 'picker-item' + (cur.has(s.id) ? ' on' : '')
      d.innerHTML = `<img loading="lazy" src="${s.file}" alt=""><span>${i + 1}. ${sceneTitle(s)}</span>`
      d.addEventListener('click', () => {
        if (cur.has(s.id)) cur.delete(s.id); else cur.add(s.id)
        d.classList.toggle('on', cur.has(s.id))
        playSfx('click')
      })
      el.pickerGrid.appendChild(d)
    })
    // 记录待保存的选中集合
    el.picker.dataset.island = isl.id
    el.picker._cur = cur
    el.picker.classList.remove('hidden')
  }

  function savePicker() {
    if (!pickerIsland) return
    const ids = [...(el.picker._cur || [])]
    S.bindings[pickerIsland.id] = ids
    LS.set('bindings', S.bindings)
    renderIslandScenes(pickerIsland)
    if (S.island && S.island.id === pickerIsland.id) renderIslandScenes(S.island)
    updateStatus()
  }

  // ================= 改名 / 收藏 =================
  function renameCurrent() {
    const s = S.scenes[S.scene]
    const v = window.prompt('给这个场景起个名字（留空恢复默认）\n\n当前：' + sceneTitle(s), sceneTitle(s))
    if (v === null) return
    if (v.trim() === '') delete S.renaming[s.id]
    else S.renaming[s.id] = v.trim()
    LS.set('titles', S.renaming)
    show(S.scene)
    if (S.island) renderIslandScenes(S.island)
  }

  function toggleFav() {
    const id = S.scenes[S.scene].id
    const k = S.favs.indexOf(id)
    if (k >= 0) S.favs.splice(k, 1); else S.favs.push(id)
    LS.set('favs', S.favs)
    updateStatus()
  }

  function updateStatus() {
    if (S.mode === 'map') {
      const bound = S.islands.filter((i) => islandScenes(i).length).length
      el.status.textContent = `浮空群岛 ${S.islands.length} 座 · 已绑定场景 ${bound} 座 · 已看 ${S.visited.length}/${S.scenes.length}` +
        (S.editing ? ' · 绑定时已开启，点岛即可编辑' : '')
    } else {
      el.galleryStatus.textContent = `已看 ${S.visited.length}/${S.scenes.length} · 收藏 ${S.favs.length}`
      el.status.textContent = `场景档案馆 · ${S.scenes.length} 张 · 原声 ${S.bgm.length} 首`
    }
  }

  // ================= 事件 =================
  el.prev.addEventListener('click', () => step(-1))
  el.next.addEventListener('click', () => step(1))
  el.play.addEventListener('click', togglePlay)
  el.loop.addEventListener('click', () => {
    S.loopOne = !S.loopOne
    el.loop.textContent = S.loopOne ? '🔁 单曲' : '➡ 顺序'
    el.loop.classList.toggle('on', !S.loopOne)
  })
  el.vol.addEventListener('input', () => {
    S.volume = Number(el.vol.value); el.volNum.textContent = S.volume
    LS.set('volume', S.volume); applyVol()
  })
  el.btnEdit.addEventListener('click', () => { playSfx('click'); toggleEdit() })
  el.btnSfx.addEventListener('click', () => {
    S.sfxOn = !S.sfxOn
    el.btnSfx.textContent = S.sfxOn ? '🔊' : '🔇'
    el.btnSfx.classList.toggle('on', !S.sfxOn)
    if (S.sfxOn) playSfx('click')
  })
  el.pPlay.addEventListener('click', () => {
    if (S.island && S.island.bgm) { playTrackByFile(S.island.bgm, S.island.name + ' 配乐'); playSfx('click') }
  })
  el.pExplore.addEventListener('click', () => {
    const l = S.island ? islandScenes(S.island) : []
    if (l.length) gotoScene(l[0].id)
    else { setMode('gallery'); playSfx('click') }
  })
  el.pGallery.addEventListener('click', () => { setMode('gallery'); playSfx('click') })
  el.pPick.addEventListener('click', () => { if (S.island) openPicker(S.island) })
  el.pickerClose.addEventListener('click', () => { savePicker(); el.picker.classList.add('hidden'); playSfx('click') })
  el.picker.addEventListener('click', (e) => { if (e.target === el.picker) { savePicker(); el.picker.classList.add('hidden') } })
  for (const b of document.querySelectorAll('.btn.mode')) b.addEventListener('click', () => { setMode(b.dataset.mode); playSfx('click') })
  el.sceneName.style.cursor = 'pointer'; el.sceneName.title = '点击改名'
  el.sceneName.addEventListener('click', renameCurrent)

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return
    if (!el.picker.classList.contains('hidden')) { if (e.key === 'Escape') { savePicker(); el.picker.classList.add('hidden') } return }
    switch (e.key) {
      case 'ArrowLeft': if (S.mode === 'gallery') step(-1); break
      case 'ArrowRight': if (S.mode === 'gallery') step(1); break
      case 'p': case 'P': togglePlay(); break
      case 'm': case 'M':
        S.muted = !S.muted; applyVol()
        el.npText.textContent = S.muted ? '已静音' : (S.bgm[S.track] ? S.bgm[S.track].title : '背景音乐未播放')
        break
      case 'f': case 'F': if (S.mode === 'gallery') toggleFav(); break
      case 'e': case 'E': toggleEdit(); break
      case 'Escape': if (S.mode === 'gallery') setMode('map'); break
      case 'Tab': e.preventDefault(); setMode(S.mode === 'map' ? 'gallery' : 'map'); break
      default: if (/^[1-9]$/.test(e.key) && S.mode === 'gallery') loadTrack(Number(e.key) - 1, true)
    }
  })

  // ================= 启动 =================
  async function boot() {
    let m
    try {
      m = window.__DKDbb_MANIFEST__ || await (await fetch('assets/manifest.json')).json()
    } catch (err) {
      el.status.textContent = '清单读取失败：' + err.message
      return
    }
    const W = window.__DKDbb_WORLD__
    S.world = W
    S.islands = W.islands
    S.scenes = m.scenes || []
    S.bgm = m.bgm || []
    S.sfx = m.sfx || []

    el.vol.value = S.volume; el.volNum.textContent = S.volume
    el.loop.classList.toggle('on', !S.loopOne)
    el.btnSfx.textContent = S.sfxOn ? '🔊' : '🔇'

    renderHotspots()
    renderTracks()
    renderStrip()

    // 默认聚焦王城，但不自动播音乐（避免浏览器自动播放策略拦截）
    selectIsland(S.islands[0], false)
    setMode('map')
    el.npText.textContent = '点岛可播该岛配乐，或切到档案馆听原声带'
  }

  boot()
})()
