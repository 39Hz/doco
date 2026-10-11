// 把指定的「Unity SceneN」和「我的 scene_N」上下并排，1:1 看清是不是同一张地图。
// 用法: node _tools/pair-one.mjs 4
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer, PixelCtx } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const id = Number(process.argv[2] || 4)
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, '_unity_tex', 'index.json'), 'utf8'))
const jpgCache = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', 'imgcache', 'index.json'), 'utf8'))
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'))

const t = idx.find((x) => x.name === 'Scene' + id)
const s = (man.scenes || []).find((x) => new RegExp('scene_0*' + id + '\\.').test(x.file || ''))
if (!t) { console.error('Unity 包里没有 Scene' + id); process.exit(1) }
if (!s) { console.error('我这边没有 scene_' + id); process.exit(1) }

const u = decodePng(fs.readFileSync(path.join(ROOT, t.file)))
const mp = path.join(ROOT, jpgCache[s.file] || s.file)
const m = decodePng(fs.readFileSync(mp))
console.log(`Unity Scene${id}: ${u.w}x${u.h}  ${t.file}`)
console.log(`我的 scene_${id}: ${m.w}x${m.h}  ${s.file}  「${s.name}」`)

const PAD = 8
const W = Math.max(u.w, m.w) + PAD * 2
const H = u.h + m.h + PAD * 3
const canvas = { width: W, height: H, _fb: makeFramebuffer(W, H), style: {} }
const ctx = new PixelCtx(canvas)
ctx.fillStyle = '#0c121c'; ctx.fillRect(0, 0, W, H)
ctx.drawImage({ _pixels: u }, PAD, PAD, u.w, u.h)
ctx.drawImage({ _pixels: m }, PAD, PAD * 2 + u.h, m.w, m.h)
const out = path.join(ROOT, 'docs', 'sheets', `_pair_${id}.png`)
fs.writeFileSync(out, encodePng(W, H, canvas._fb))
console.log('对照 -> ' + out + '（上=Unity，下=我的）')
