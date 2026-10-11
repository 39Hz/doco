// 用"生成立绘 → 拼图 → 我肉眼核对"的方式，把「块索引 → 图鉴编号」的映射一次性做对。
//
// 做法：按 BLOB_TO_ATLAS 里的候选映射把每个块切出来，并在同一格写上它被映射到的编号
// （编号用我自己的字形渲染，清晰可读），这样一眼就能看出"这块立绘"和"这个编号"对不对得上。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer } from './pixel-canvas.mjs'
import { loadGlyphAtlas, TextRenderer } from './text-render.mjs'

const ROOT = path.resolve('.')
const png = decodePng(fs.readFileSync(path.join(ROOT, '多克多比专区资料素材', 'npc大全', '怪物图鉴.png')))
const { w: PW, h: PH, data: PD } = png
const isBg = (x, y) => (x < 0 || y < 0 || x >= PW || y >= PH) || PD[(y * PW + x) * 4 + 3] < 24

const items = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', '_blobs_labeled.json'), 'utf8'))
const withLabel = items.filter((it) => it.label)
const gd = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'gamedata.json'), 'utf8'))
const byId = new Map(gd.monsters.map((m) => [Number(m.id), m]))

// 当前映射（待核对）
const M = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', '_blobs_labeled.json'), 'utf8'))
const MAP = {}
for (const [k, v] of Object.entries({
  0: 110007, 1: 110010, 2: 110003, 3: 110006, 4: 110009, 5: 110002,
  6: 110005, 7: 110001, 8: 110004, 9: 110008, 11: 110015, 13: 110011,
  16: 110018, 17: 110019, 18: 110020, 20: 110022, 22: 110029, 23: 110026,
  26: 110023, 30: 110036, 31: 110035, 32: 110034, 33: 110033, 34: 110040,
  44: 119008, 45: 119001, 46: 119002, 47: 119003, 48: 119004, 49: 119005,
  50: 119006, 51: 119007, 52: 119012, 54: 119011, 58: 119010,
  14: 110012, 15: 110014, 19: 110016, 21: 110017, 55: 119013, 69: 119027,
})) MAP[k] = v

function gameId(a) {
  if (a >= 110000 && a < 119000) return 10000 + (a - 110000)
  if (a >= 119000) return 19000 + (a - 119000)
  return null
}

// 统计每个块的填充率（用于识别占位格）
function fillOf(b) {
  let n = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1
  for (let y = b.y; y < b.y + b.h; y++) {
    for (let x = b.x; x < b.x + b.w; x++) {
      if (isBg(x, y)) continue
      n++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return { fill: 0, minX: 0, minY: 0, w: 0, h: 0 }
  return { fill: n / ((maxX - minX + 1) * (maxY - minY + 1)), minX, minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

const COLS = 6, CW = 200, CH = 190
const entries = Object.entries(MAP).map(([k, a]) => ({ k: Number(k), a }))
entries.sort((x, y) => x.k - y.k)
const ROWS = Math.ceil(entries.length / COLS)
const W = COLS * CW, H = ROWS * CH
const fb = makeFramebuffer(W, H)
for (let i = 0; i < fb.length; i += 4) { fb[i] = 250; fb[i + 1] = 250; fb[i + 2] = 252; fb[i + 3] = 255 }
const tr = new TextRenderer(loadGlyphAtlas())

entries.forEach((e, i) => {
  const c = i % COLS, r = Math.floor(i / COLS)
  const x0 = c * CW, y0 = r * CH
  const it = withLabel[e.k]
  const f = it ? fillOf(it.art) : { fill: 0 }
  const gid = gameId(e.a)
  const mon = byId.get(gid)
  // 立绘
  if (it && f.w > 4) {
    const b = { x: f.minX, y: f.minY, w: f.w, h: f.h }
    const sc = Math.min((CW - 16) / b.w, (CH - 56) / b.h, 1.6)
    const dw = Math.max(1, Math.round(b.w * sc)), dh = Math.max(1, Math.round(b.h * sc))
    const ox = x0 + Math.floor((CW - dw) / 2), oy = y0 + 24
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const sx = b.x + Math.min(b.w - 1, Math.floor(x / sc))
        const sy = b.y + Math.min(b.h - 1, Math.floor(y / sc))
        const s = (sy * PW + sx) * 4
        const a = PD[s + 3] / 255
        if (a <= 0.02) continue
        const d = ((oy + y) * W + ox + x) * 4
        fb[d] = fb[d] * (1 - a) + PD[s] * a
        fb[d + 1] = fb[d + 1] * (1 - a) + PD[s + 1] * a
        fb[d + 2] = fb[d + 2] * (1 - a) + PD[s + 2] * a
      }
    }
  }
  // 文字：块号 / 图鉴号 / 游戏号+名字 / 密度
  const fake = {
    W, H, buf: fb, _clip: null, globalAlpha: 1,
    _blend(px, py, R, G, B, a) {
      px |= 0; py |= 0
      if (px < 0 || py < 0 || px >= W || py >= H) return
      const d = (py * W + px) * 4
      fb[d] = fb[d] * (1 - a) + R * a; fb[d + 1] = fb[d + 1] * (1 - a) + G * a; fb[d + 2] = fb[d + 2] * (1 - a) + B * a
    },
    _inClip() { return true },
  }
  const bad = f.fill > 0 && f.fill < 0.16
  tr.draw(fake, '块' + e.k + ' 图鉴' + e.a, x0 + 4, y0 + 3, bad ? [200, 30, 30, 255] : [20, 40, 70, 255], 1, '14px sans-serif', 'left', 'top')
  tr.draw(fake, (mon ? gid + ' ' + mon.name : '★' + gid + ' 不存在'), x0 + 4, y0 + CH - 24,
    mon ? [20, 90, 40, 255] : [200, 30, 30, 255], 1, '13px sans-serif', 'left', 'top')
  tr.draw(fake, '密度' + f.fill.toFixed(2) + (bad ? ' 占位格!' : ''), x0 + 4, y0 + CH - 10,
    bad ? [200, 30, 30, 255] : [130, 130, 140, 255], 1, '11px sans-serif', 'left', 'top')
  for (let x = x0; x < x0 + CW; x++) { const d = (y0 * W + x) * 4; fb[d] = 205; fb[d + 1] = 210; fb[d + 2] = 220 }
  for (let y = y0; y < y0 + CH; y++) { const d = (y * W + x0) * 4; fb[d] = 205; fb[d + 1] = 210; fb[d + 2] = 220 }
})

const p = path.join(ROOT, 'docs', 'sheets', '_verify_map.png')
fs.writeFileSync(p, encodePng(W, H, fb))
console.log('已输出 ' + p + '（' + W + '×' + H + '，' + entries.length + ' 格）')
console.log('红字 = 映射有问题（占位格 或 编号在游戏里不存在）')
