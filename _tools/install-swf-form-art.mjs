// 从带 alpha 的动作帧里挑"干净站姿"帧 → 做成形态立绘并接入游戏（第 2 版判据）
//
// 【第 1 版为什么挑错】用 `alpha>40` 当"有内容"，结果挑中了**模糊特效帧**（渐变雾）——
//   那种帧的 alpha 广泛分布在 40~150，几乎没有实心像素。
// 【第 2 版判据（都实测过）】
//   · **实心占比**（alpha>200 的像素 / 画布）：角色帧 0.24~0.28，雾帧≈0 → 必须够大
//   · **边缘强度**（alpha 梯度和）：角色帧 5~9（有清晰轮廓），雾帧低
//   · **饱和度**（实心像素的平均色差）：角色帧 98~165（有颜色），雾帧低
//   · 站姿还要**脚底靠下**（踩地），排除腾空帧
//
// 用法: node _tools/install-swf-form-art.mjs [--dry]
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SRCDIR = path.join(ROOT, '_tmp_test_out/swf-frames-alpha')
const ARTDIR = path.join(ROOT, 'assets/forms/art')
const BAK = path.join(ROOT, '_tmp_test_out/art-before-swf')
const DRY = process.argv.includes('--dry')
const PY = path.join(ROOT, '_tools', 'py', 'python.exe')
const TMP = path.join(ROOT, '_tmp_test_out')

const GROUPS = [
  { tag: '水多比-战斗', form: '水多比' },
  { tag: '火多比-战斗', form: '火多比' },
  { tag: '超级多比-战斗', form: '超级克罗 多比' },
]

fs.mkdirSync(TMP, { recursive: true })
fs.mkdirSync(BAK, { recursive: true })

const outJson = path.join(TMP, 'idle-candidates2.json')
const pyPath = path.join(TMP, '_pick_idle3.py')
const py = `
import os, json, glob
from PIL import Image
import numpy as np

SRC = r"${SRCDIR.replace(/\\/g, '/')}"
groups = ${JSON.stringify(GROUPS)}
report = {}
for g in groups:
    rows = []
    for f in sorted(glob.glob(os.path.join(SRC, g["tag"] + "*.png"))):
        try:
            im = Image.open(f).convert("RGBA")
        except Exception:
            continue
        a = np.asarray(im).astype(np.float32)
        al = a[:, :, 3]
        solid = al > 200
        n = int(solid.sum())
        if n < 2000:
            continue
        rgb = a[:, :, :3]
        sat = rgb.max(axis=2) - rgb.min(axis=2)
        ys, xs = np.where(solid)
        bw = int(xs.max() - xs.min() + 1)
        bh = int(ys.max() - ys.min() + 1)
        grad = float(np.abs(np.diff(al, axis=1)).mean() + np.abs(np.diff(al, axis=0)).mean())
        rows.append(dict(
            file=os.path.basename(f), w=im.size[0], h=im.size[1],
            solid=float(n) / (im.size[0] * im.size[1]),
            sat=float(sat[solid].mean()), grad=grad,
            bw=bw, bh=bh, ar=float(bh) / bw, foot=float(ys.max()) / im.size[1],
        ))
    # 站姿打分：实心多 + 边缘强 + 饱和高 + 脚底靠下 + 竖向站立（ar>1）
    for r in rows:
        r["score"] = (r["solid"] * 3.0 + min(r["grad"], 12) / 12 * 2.0
                      + min(r["sat"], 180) / 180 * 2.0
                      + (1.0 if r["foot"] > 0.85 else 0.0)
                      + (0.8 if r["ar"] > 1.05 else 0.0))
    rows.sort(key=lambda r: -r["score"])
    report[g["form"]] = rows
    print("%s: %d 帧候选" % (g["form"], len(rows)))
    for r in rows[:4]:
        print("   %-26s %dx%d solid=%.2f sat=%.0f grad=%.2f ar=%.2f foot=%.2f score=%.2f" %
              (r["file"], r["w"], r["h"], r["solid"], r["sat"], r["grad"], r["ar"], r["foot"], r["score"]))
json.dump(report, open(r"${outJson.replace(/\\/g, '/')}", "w", encoding="utf-8"), ensure_ascii=False)
`
fs.writeFileSync(pyPath, py, 'utf8')
execFileSync(PY, [pyPath], { stdio: 'inherit', cwd: ROOT, env: { ...process.env, TMP, TEMP: TMP } })

const rep = JSON.parse(fs.readFileSync(outJson, 'utf8'))
console.log('\n=== 安装为形态立绘（放大到有效高 640）===')
for (const g of GROUPS) {
  const rows = rep[g.form] || []
  if (!rows.length) { console.log(`  ✗ ${g.form}: 没有可用帧`); continue }
  const pick = rows[0]
  const src = path.join(SRCDIR, pick.file)
  const dst = path.join(ARTDIR, g.form + '.png')
  const bak = path.join(BAK, g.form + '.png')
  if (fs.existsSync(dst) && !fs.existsSync(bak)) fs.copyFileSync(dst, bak)
  if (!DRY) {
    const img = decodePng(fs.readFileSync(src))
    // 只取主体包围盒，再按有效高 640 放大（与其它立绘同规格）
    let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      if (img.data[(y * img.w + x) * 4 + 3] > 30) {
        if (x < x0) x0 = x; if (x > x1) x1 = x
        if (y < y0) y0 = y; if (y > y1) y1 = y
      }
    }
    const sw = x1 - x0 + 1, sh = y1 - y0 + 1
    const sc = 640 / sh
    const dw = Math.max(1, Math.round(sw * sc))
    const out = new Uint8ClampedArray(dw * 640 * 4)
    for (let y = 0; y < 640; y++) for (let x = 0; x < dw; x++) {
      const sx = x0 + Math.min(sw - 1, Math.floor((x + 0.5) / sc)), sy = y0 + Math.min(sh - 1, Math.floor((y + 0.5) / sc))
      const s = (sy * img.w + sx) * 4, d = (y * dw + x) * 4
      out[d] = img.data[s]; out[d + 1] = img.data[s + 1]; out[d + 2] = img.data[s + 2]; out[d + 3] = img.data[s + 3]
    }
    fs.writeFileSync(dst, encodePng(dw, 640, out))
  }
  console.log(`  ${DRY ? '(dry) ' : ''}${g.form}  ←  ${pick.file}  (solid=${pick.solid.toFixed(2)} sat=${pick.sat.toFixed(0)} score=${pick.score.toFixed(2)})  →  ${path.relative(ROOT, dst)}`)
}
console.log(`\n原图备份 ${path.relative(ROOT, BAK)}`)
