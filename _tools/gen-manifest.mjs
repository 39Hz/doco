// 生成 assets/manifest.json —— 场景与音乐清单
// 场景名由画面内容识别得出，标注置信度；游戏内可改名并写入浏览器本地存档
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.resolve(process.argv[2] || '.')
const SCENES_DIR = path.join(ROOT, 'assets', 'scenes')

// 人工识别的场景命名表（按 scene_NN）
const NAMED = {
  21: { t: '标题画面 · 多克多比', d: '2013 年台服宣传主视觉（dkdbb.61.com.tw），「超Q變身對戰網遊」。', k: 'title', c: 'high' },
  62: { t: '世界地图 · 浮空群岛', d: '全局导航图。可见火山岛、沙漠岛、城堡镇中心、森林草原、矿场工坊、天使与猫咪区。', k: 'worldmap', c: 'high' },
}

function pngSize(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) return null
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}
function jpgSize(buf) {
  let i = 2
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue }
    const m = buf[i + 1]
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
      return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) }
    const l = buf.readUInt16BE(i + 2)
    if (l <= 0) break
    i += 2 + l
  }
  return { w: 0, h: 0 }
}

const files = fs.readdirSync(SCENES_DIR)
  .filter(f => /\.(png|jpe?g)$/i.test(f))
  .sort((a, b) => {
    const na = Number(a.match(/(\d+)/)[1]), nb = Number(b.match(/(\d+)/)[1])
    return na - nb
  })

const scenes = files.map((f, i) => {
  const buf = fs.readFileSync(path.join(SCENES_DIR, f))
  const dim = /\.png$/i.test(f) ? pngSize(buf) : jpgSize(buf)
  const n = Number(f.match(/(\d+)/)[1])
  const meta = NAMED[n] || {}
  return {
    id: n,
    file: `assets/scenes/${f}`,
    w: dim ? dim.w : 0,
    h: dim ? dim.h : 0,
    bytes: buf.length,
    kind: meta.k || 'scene',
    conf: meta.c || 'guess',
    // 未识别场景先给占位名，游戏内可改名
    title: meta.t || `未命名场景 ${String(i + 1).padStart(2, '0')}`,
    desc: meta.d || '待补充。可在游戏内点击标题直接改名，改动会保存在浏览器本地。',
  }
})

// 音乐清单
const BGM_DIR = path.join(ROOT, 'assets', 'bgm')
const SFX_DIR = path.join(ROOT, 'assets', 'sfx')

function mp3Secs(buf) {
  let i = 0
  if (buf.toString('ascii', 0, 3) === 'ID3')
    i = 10 + (((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f))
  const BR = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
  const SR = [44100, 48000, 32000, 0]
  for (; i < buf.length - 4 && i < 400000; i++) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
      const v = (buf[i + 1] >> 3) & 3, b = (buf[i + 2] >> 4) & 15, s = (buf[i + 2] >> 2) & 3
      if (v === 1 || b === 0 || b === 15 || s === 3) continue
      return {
        secs: Math.round((buf.length - i) * 8 / (BR[b] * 1000)),
        kbps: BR[b], hz: Math.round(SR[s] / (v === 3 ? 1 : v === 2 ? 2 : 4)),
      }
    }
  }
  return { secs: 0, kbps: 0, hz: 0 }
}

const bgm = fs.readdirSync(BGM_DIR).filter(f => /\.mp3$/i.test(f)).sort().map((f, i) => {
  const buf = fs.readFileSync(path.join(BGM_DIR, f))
  const info = mp3Secs(buf)
  const num = f.match(/(\d+)/) ? Number(f.match(/(\d+)/)[1]) : i + 1
  return {
    id: num,
    name: f.replace(/\.mp3$/i, ''),
    file: `assets/bgm/${f}`,
    secs: info.secs, kbps: info.kbps, hz: info.hz,
    bytes: buf.length,
    // music001-021 是场景循环 BGM，具体归属需原版配置确认
    title: `原声 ${String(num).padStart(3, '0')}`,
    conf: 'guess',
  }
})

// 定位第一个 MP3 帧同步字。返回 -1 表示找不到。
function findFirstFrame(buf, limit = 4096) {
  if (buf.toString('ascii', 0, 3) === 'ID3') {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f)
    return 10 + size
  }
  for (let i = 0; i < Math.min(buf.length - 1, limit); i++) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) return i
  }
  return -1
}

const sfxAll = fs.readdirSync(SFX_DIR).filter(f => /\.mp3$/i.test(f)).sort()
const sfx = []
const sfxNotes = []
for (const f of sfxAll) {
  const buf = fs.readFileSync(path.join(SFX_DIR, f))
  const off = findFirstFrame(buf)
  if (off < 0) {                       // 真的没有音频帧，才剔除
    sfxNotes.push({ file: f, bytes: buf.length, level: 'broken', note: '找不到任何 MP3 帧同步字' })
    continue
  }
  if (off > 0) {                       // 开头有零填充/异常，但仍可播放
    sfxNotes.push({ file: f, bytes: buf.length, level: 'warn', note: `文件头有 ${off} 字节非音频填充，已按可播放保留` })
  }
  sfx.push({
    name: f.replace(/\.mp3$/i, ''),
    file: `assets/sfx/${f}`,
    role: /^onClick/i.test(f) ? 'click' : /^onMouseOver/i.test(f) ? 'hover' : 'message',
    firstFrameAt: off,
  })
}

const manifest = {
  generated: new Date().toISOString(),
  game: { name: '多克多比', nameEn: 'Duo Ke Duo Bi', publisher: '淘米 / 61.com', site: 'dkdbb.61.com.tw', era: '2011-2013' },
  stats: {
    scenes: scenes.length,
    bgm: bgm.length,
    sfx: sfx.length,
    totalMB: +((scenes.reduce((a, s) => a + s.bytes, 0) + bgm.reduce((a, b) => a + b.bytes, 0)) / 1048576).toFixed(2),
  },
  scenes, bgm, sfx,
  assetNotes: sfxNotes,   // 资源质量备注，留档备查
}

const json = JSON.stringify(manifest, null, 2)
fs.writeFileSync(path.join(ROOT, 'assets', 'manifest.json'), json)
// 同时输出可 <script> 直接引入的版本：file:// 下 fetch 会被 CORS 拦截，用它兜底
fs.writeFileSync(
  path.join(ROOT, 'assets', 'manifest.js'),
  '/* 自动生成，勿手改。改完请重跑 _tools/gen-manifest.mjs */\n' +
  'window.__DKDbb_MANIFEST__ = ' + JSON.stringify(manifest) + ';\n'
)
console.log(`manifest.json + manifest.js 已生成`)
console.log(`  场景 ${scenes.length} · BGM ${bgm.length} 首 · 音效 ${sfx.length} 个 · 合计 ${manifest.stats.totalMB} MB`)
console.log(`  已命名 ${scenes.filter(s => s.conf === 'high').length} 个，待命名 ${scenes.filter(s => s.conf !== 'high').length} 个`)
if (sfxNotes.length) {
  console.log(`  资源备注 ${sfxNotes.length} 条：`)
  sfxNotes.forEach(n => console.log(`      [${n.level}] ${n.file} (${n.bytes}B) —— ${n.note}`))
}
