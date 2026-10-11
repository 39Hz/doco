/* 多克多比 · 场景档案馆
   纯前端零依赖。直接双击 index.html 即可运行（file:// 亦可）。 */
(() => {
  'use strict'

  const $ = (id) => document.getElementById(id)
  const el = {
    viewport: $('viewport'), img: $('scene-img'),
    name: $('scene-name'), idx: $('scene-idx'), desc: $('scene-desc'),
    strip: $('strip'), countScenes: $('count-scenes'),
    trackList: $('track-list'), countTracks: $('count-tracks'),
    np: $('now-playing'), npText: $('np-text'),
    play: $('btn-play'), loop: $('btn-loop'), sfx: $('btn-sfx'),
    autoplay: $('btn-autoplay'), zoom: $('btn-zoom'), hide: $('btn-hide'),
    vol: $('vol'), volNum: $('vol-num'), status: $('foot-status'),
    prev: $('btn-prev'), next: $('btn-next'),
  }

  const LS = {
    get: (k, d) => { try { const v = localStorage.getItem('dkdbb.' + k); return v === null ? d : JSON.parse(v) } catch { return d } },
    set: (k, v) => { try { localStorage.setItem('dkdbb.' + k, JSON.stringify(v)) } catch { /* 隐私模式忽略 */ } },
  }

  const state = {
    scenes: [], bgm: [], sfx: [],
    current: 0, track: -1,
    renaming: LS.get('titles', {}),   // 用户自定义场景名
    favs: LS.get('favs', []),         // 收藏
    visited: LS.get('visited', []),   // 巡游足迹
    autoplay: false, autoplayTimer: null,
    loopOne: true, sfxOn: true, volume: LS.get('volume', 55),
    muted: false,
  }

  // ---------- 音频 ----------
  const audio = new Audio()
  audio.preload = 'auto'
  const sfxCache = {}
  let audioCtx = null

  function initGain() {
    // HTMLAudioElement.volume 在 file:// 下足够，直接用即可
    audio.volume = state.muted ? 0 : state.volume / 100
  }

  function playSfx(role) {
    if (!state.sfxOn || state.muted) return
    const item = state.sfx.find((s) => s.role === role)
    if (!item) return
    try {
      let a = sfxCache[item.file]
      if (!a) { a = new Audio(item.file); a.preload = 'auto'; sfxCache[item.file] = a }
      a.currentTime = 0
      a.volume = Math.min(0.5, state.volume / 100)
      a.play().catch(() => {})
    } catch { /* 忽略 */ }
  }

  function loadTrack(i, autoplay) {
    if (!state.bgm.length) return
    i = ((i % state.bgm.length) + state.bgm.length) % state.bgm.length
    state.track = i
    const t = state.bgm[i]
    audio.src = t.file
    initGain()
    renderTracks()
    el.npText.textContent = `${t.title} · ${t.secs}s`
    if (autoplay) audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }

  function setPlaying(on) {
    el.np.classList.toggle('playing', on)
    el.play.textContent = on ? '❚❚' : '▶'
  }

  function togglePlay() {
    if (state.track < 0) { loadTrack(0, true); return }
    if (audio.paused) audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    else { audio.pause(); setPlaying(false) }
  }

  audio.addEventListener('ended', () => {
    if (state.loopOne) { audio.currentTime = 0; audio.play().catch(() => {}) }
    else loadTrack(state.track + 1, true)
  })
  audio.addEventListener('error', () => {
    setPlaying(false)
    el.npText.textContent = '音频加载失败：' + (state.bgm[state.track] ? state.bgm[state.track].name : '')
  })
  audio.addEventListener('play', () => setPlaying(true))
  audio.addEventListener('pause', () => setPlaying(false))

  // ---------- 场景 ----------
  function sceneTitle(s) {
    const custom = state.renaming[s.id]
    if (custom) return custom
    return s.conf === 'guess' ? s.title : s.title
  }

  function show(i, opts = {}) {
    if (!state.scenes.length) return
    i = Math.max(0, Math.min(state.scenes.length - 1, i))
    state.current = i
    const s = state.scenes[i]
    el.img.classList.remove('ready')
    const nextSrc = s.file
    const pre = new Image()
    pre.onload = () => { el.img.src = nextSrc; el.img.classList.add('ready') }
    pre.onerror = () => { el.img.src = nextSrc; el.img.classList.add('ready') }
    pre.src = nextSrc
    el.img.alt = sceneTitle(s)

    el.name.textContent = sceneTitle(s)
    el.idx.textContent = `${i + 1} / ${state.scenes.length} · ${s.w}×${s.h}`
    el.desc.textContent = s.desc
    if (s.kind === 'title' || s.kind === 'worldmap') el.name.style.color = 'var(--accent)'
    else el.name.style.color = ''

    renderStripActive()
    if (!state.visited.includes(s.id)) {
      state.visited.push(s.id)
      LS.set('visited', state.visited)
      updateStatus()
    }
  }

  function step(d) { show(state.current + d); playSfx('click') }

  // ---------- 缩略带 ----------
  const thumbEls = []
  function renderStrip() {
    el.strip.innerHTML = ''
    state.scenes.forEach((s, i) => {
      const d = document.createElement('div')
      d.className = 'thumb'
      d.dataset.i = i
      const im = document.createElement('img')
      im.loading = 'lazy'
      im.decoding = 'async'
      im.src = s.file          // 缩略图直接用原图，交给浏览器降采样
      im.alt = sceneTitle(s)
      const num = document.createElement('span')
      num.className = 'num'
      num.textContent = i + 1
      const fav = document.createElement('span')
      fav.className = 'fav'
      fav.textContent = '★'
      d.append(im, num, fav)
      d.addEventListener('click', () => { show(i); playSfx('click') })
      d.addEventListener('mouseenter', () => playSfx('hover'))
      el.strip.appendChild(d)
      thumbEls.push(d)
    })
    el.countScenes.textContent = state.scenes.length
  }

  function renderStripActive() {
    thumbEls.forEach((d, i) => {
      d.classList.toggle('active', i === state.current)
      const s = state.scenes[i]
      d.classList.toggle('is-fav', state.favs.includes(s.id))
    })
    const active = thumbEls[state.current]
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }

  // ---------- 播放列表 ----------
  function renderTracks() {
    el.trackList.innerHTML = ''
    state.bgm.forEach((t, i) => {
      const b = document.createElement('button')
      b.className = 'track' + (i === state.track ? ' active' : '')
      b.textContent = t.title
      b.title = `${t.name}.mp3 · ${t.secs} 秒 · ${t.kbps}kbps · ${t.hz}Hz`
      b.addEventListener('click', () => { loadTrack(i, true); playSfx('click') })
      el.trackList.appendChild(b)
    })
    el.countTracks.textContent = state.bgm.length
  }

  // ---------- 收藏 / 改名 ----------
  function toggleFav() {
    const id = state.scenes[state.current].id
    const k = state.favs.indexOf(id)
    if (k >= 0) state.favs.splice(k, 1)
    else state.favs.push(id)
    LS.set('favs', state.favs)
    renderStripActive()
    updateStatus()
  }

  function renameCurrent() {
    const s = state.scenes[state.current]
    const cur = sceneTitle(s)
    const v = window.prompt('给这个场景起个名字（留空恢复默认）\n\n当前：' + cur, cur)
    if (v === null) return
    if (v.trim() === '') delete state.renaming[s.id]
    else state.renaming[s.id] = v.trim()
    LS.set('titles', state.renaming)
    show(state.current)
  }

  // ---------- 自动巡游 ----------
  function toggleAutoplay() {
    state.autoplay = !state.autoplay
    el.autoplay.classList.toggle('on', state.autoplay)
    el.autoplay.textContent = state.autoplay ? '❚❚ 停止巡游' : '▶ 自动巡游'
    el.viewport.classList.toggle('kenburns', true)
    clearInterval(state.autoplayTimer)
    if (state.autoplay) {
      state.autoplayTimer = setInterval(() => {
        let n = state.current + 1
        if (n >= state.scenes.length) n = 0
        show(n)
      }, 6000)
      if (audio.paused) togglePlay()
    }
    updateStatus()
  }

  // ---------- 状态栏 ----------
  function updateStatus() {
    const total = state.scenes.length
    el.status.textContent =
      `已看 ${state.visited.length}/${total} 个场景 · 收藏 ${state.favs.length} 个` +
      (state.autoplay ? ' · 巡游中' : '')
  }

  // ---------- 事件绑定 ----------
  el.prev.addEventListener('click', () => step(-1))
  el.next.addEventListener('click', () => step(1))
  el.play.addEventListener('click', togglePlay)
  el.loop.addEventListener('click', () => {
    state.loopOne = !state.loopOne
    el.loop.textContent = state.loopOne ? '🔁 单曲循环' : '➡ 顺序播放'
    el.loop.classList.toggle('on', !state.loopOne)
  })
  el.sfx.addEventListener('click', () => {
    state.sfxOn = !state.sfxOn
    el.sfx.textContent = state.sfxOn ? '🔊 音效 开' : '🔇 音效 关'
    el.sfx.classList.toggle('on', !state.sfxOn)
    if (state.sfxOn) playSfx('click')
  })
  el.autoplay.addEventListener('click', toggleAutoplay)
  el.zoom.addEventListener('click', () => {
    el.viewport.classList.toggle('fit')
    const fit = el.viewport.classList.contains('fit')
    el.zoom.textContent = fit ? '⤢ 原始比例' : '⤢ 适应窗口'
  })
  el.hide.addEventListener('click', () => {
    document.body.classList.toggle('immersive')
    el.hide.classList.toggle('on', document.body.classList.contains('immersive'))
  })
  el.vol.addEventListener('input', () => {
    state.volume = Number(el.vol.value)
    el.volNum.textContent = state.volume
    LS.set('volume', state.volume)
    initGain()
  })
  el.name.style.cursor = 'pointer'
  el.name.title = '点击改名'
  el.name.addEventListener('click', renameCurrent)

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return
    switch (e.key) {
      case 'ArrowLeft': step(-1); break
      case 'ArrowRight': step(1); break
      case ' ': e.preventDefault(); toggleAutoplay(); break
      case 'p': case 'P': togglePlay(); break
      case 'm': case 'M':
        state.muted = !state.muted
        initGain(); el.npText.textContent = state.muted ? '已静音' : (state.bgm[state.track] ? state.bgm[state.track].title : '背景音乐未播放')
        break
      case 'f': case 'F': toggleFav(); break
      case 'h': case 'H': el.hide.click(); break
      case 'z': case 'Z': el.zoom.click(); break
      case 'Escape':
        if (document.body.classList.contains('immersive')) el.hide.click()
        break
      default:
        if (/^[1-9]$/.test(e.key)) { loadTrack(Number(e.key) - 1, true); playSfx('click') }
    }
  })

  // 预加载下一张，翻页更顺
  setInterval(() => {
    const n = state.scenes[(state.current + 1) % state.scenes.length]
    if (n) { const p = new Image(); p.src = n.file }
  }, 3500)

  // ---------- 启动 ----------
  // 优先用 file:// 也能加载的 manifest.js；失败再退回 fetch manifest.json
  async function loadManifest() {
    if (window.__DKDbb_MANIFEST__) return window.__DKDbb_MANIFEST__
    const res = await fetch('assets/manifest.json')
    return await res.json()
  }

  async function boot() {
    let m
    try {
      m = await loadManifest()
    } catch (err) {
      el.status.textContent = '清单读取失败：' + err.message
      el.name.textContent = '无法载入素材清单'
      el.desc.textContent = '请确认 assets/manifest.js 存在；若已删除，重新运行 _tools/gen-manifest.mjs 即可重建。'
      return
    }
    state.scenes = m.scenes || []
    state.bgm = m.bgm || []
    state.sfx = m.sfx || []
    el.vol.value = state.volume
    el.volNum.textContent = state.volume
    el.loop.classList.toggle('on', !state.loopOne)
    renderStrip()
    renderTracks()
    show(0)
    updateStatus()
    el.npText.textContent = '点 ▶ 或按 P 播放原声带'
    // 若之前开着巡游，恢复沉浸式展示节奏
    if (state.scenes.length) {
      const t = new Image(); t.src = state.scenes[0].file
    }
  }

  boot()
})()
