// 把抽出来的技能图标拼成对照表，核对"抽到的是不是那个技能"。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng, makeFramebuffer, PixelCtx } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'skills', 'index.json'), 'utf8'))
const skills = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'forms.js'), 'utf8')
  .replace(/^[\s\S]*?window\.__DKDbb_FORMS__\s*=\s*/, '').replace(/;\s*$/, '')).skills

const byId = new Map()
for (const [name, s] of Object.entries(skills)) {
  const m = /skill_icon_(\d+)/.exec(s.icon || '')
  if (m) byId.set(Number(m[1]), name)
}
// 补上长号 → 短号的对应（官方图鉴用 30X00N，我的数据用 X00N）
const items = []
for (const it of idx.icons) {
  let label = byId.get(it.id)
  if (!label) label = it.name || '（未对应到技能）'
  const p = path.join(ROOT, it.file)
  if (!fs.existsSync(p)) continue
  items.push({ id: it.id, label, img: decodePng(fs.readFileSync(p)) })
}
items.sort((a, b) => a.id - b.id)

const COLS = 8, CELL = 110, PAD = 6
const rows = Math.ceil(items.length / COLS)
const W = COLS * (CELL + PAD) + PAD, H = rows * (CELL + PAD) + PAD
const c = { width: W, height: H, _fb: makeFramebuffer(W, H), style: {} }
const ctx = new PixelCtx(c)
ctx.fillStyle = '#101822'; ctx.fillRect(0, 0, W, H)
items.forEach((it, i) => {
  const cx = PAD + (i % COLS) * (CELL + PAD), cy = PAD + ((i / COLS) | 0) * (CELL + PAD)
  ctx.fillStyle = '#2a3a4e'; ctx.fillRect(cx, cy, CELL, CELL)
  ctx.drawImage({ _pixels: it.img }, cx + 10, cy + 10, CELL - 20, CELL - 20)
})
fs.writeFileSync(path.join(ROOT, 'docs', 'sheets', '_skillicons.png'), encodePng(W, H, c._fb))
console.log(`${items.length} 个技能图标 -> docs/sheets/_skillicons.png（8 列）`)
items.forEach((it, i) => console.log(`  第${((i / COLS) | 0) + 1}行 第${(i % COLS) + 1}列  ${String(it.id).padEnd(6)} ${it.label}`))
