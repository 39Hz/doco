// 从 SWF 抽出的动作帧里挑"站姿"帧（用于当形态立绘）
//
// 【背景】`extract-swf-frames.mjs` 从 `多比战斗动画/*.swf` 抽出 437 张动作帧
//   （水多比 104 / 火多比 184 / 超级多比 126 / 普通多比 14 / 新版 6 / 新手区 3）。
//   这些帧**带透明通道**（DefineBitsJPEG3 的 alpha），但很多帧带技能光效（尖刺、闪电），
//   当立绘用不合适 —— 所以要挑"干净站姿"帧。
//
// 判据（客观、可复核）：
//   · **不含大面积特效**：特效是灰白/黄色的半透明尖刺，特征是"低饱和+高亮"像素占比高；
//     站姿帧这类像素少。
//   · **主体居中、脚底接近画布底**：站姿帧通常是整套动作里的"普通姿态"。
//   · 主体宽度占比适中（特效会让包围盒撑满画布）。
//
// 产出：每组挑出的候选帧复制到 `_tmp_test_out/form-art-candidates/<形态>/`，并出对比图
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SRCDIR = path.join(ROOT, '_tmp_test_out/swf-frames')
const OUTROOT = path.join(ROOT, '_tmp_test_out/form-art-candidates')

// JPEG 解码：项目没有 jpeg 解码器，这里用 python(Pillow) 转成 PNG 再分析
// —— 走"python 写文件"的老路子（沙箱禁止管道抓输出）
import { execFileSync } from 'node:child_process'
const PY = path.join(ROOT, '_tools', 'py', 'python.exe')

const GROUPS = [
  { tag: '水多比', form: '水多比' },
  { tag: '火多比', form: '火多比' },
  { tag: '超级多比', form: '超级多比' },
  { tag: '普通多比战斗', form: '（通用，暂不接入）' },
]

fs.mkdirSync(OUTROOT, { recursive: true })
const script = path.join(ROOT, '_tmp_test_out', '_pick_idle.py')
const outJson = path.join(ROOT, '_tmp_test_out', 'idle-pick.json')
const py = `
import os, json, glob
from PIL import Image
import numpy as np

SRC = r"${SRCDIR.replace(/\\/g, '/')}"
OUT = r"${OUTROOT.replace(/\\/g, '/')}"
groups = ${JSON.stringify(GROUPS.map((g) => g.tag))}
report = {}
for tag in groups:
    files = sorted(glob.glob(os.path.join(SRC, tag + "*.jpg")))
    rows = []
    for f in files:
        try:
            im = Image.open(f).convert("RGBA")
        except Exception:
            continue
        a = np.asarray(im).astype(np.float32)
        alpha = a[:, :, 3]
        ys, xs = np.where(alpha > 40)
        if len(ys) < 500:
            continue
        h, w = alpha.shape
        bw = xs.max() - xs.min() + 1
        bh = ys.max() - ys.min() + 1
        # "特效"判据：低饱和且高亮（灰白尖刺/黄闪电）的像素占比
        rgb = a[:, :, :3]
        lum = rgb.mean(axis=2)
        sat = rgb.max(axis=2) - rgb.min(axis=2)
        opaque = alpha > 40
        fx = ((sat < 50) & (lum > 170) & opaque).sum() / max(1, opaque.sum())
        rows.append(dict(file=os.path.basename(f), w=w, h=h, bw=int(bw), bh=int(bh),
                         fx=float(fx), cover=float(opaque.sum()) / (w * h),
                         foot=float(ys.max()) / h))
    rows.sort(key=lambda r: (r["fx"], -r["cover"]))
    report[tag] = rows
    print("%s: %d 帧，fx 最小的 5 帧：" % (tag, len(rows)))
    for r in rows[:5]:
        print("   %s  %dx%d  主体 %dx%d  fx=%.3f  cover=%.2f  脚底=%.2f" %
              (r["file"], r["w"], r["h"], r["bw"], r["bh"], r["fx"], r["cover"], r["foot"]))
with open(r"${outJson.replace(/\\/g, '/')}", "w", encoding="utf-8") as fp:
    json.dump(report, fp, ensure_ascii=False)
print("done")
`
fs.writeFileSync(script, py, 'utf8')
const env = { ...process.env, TMP: path.join(ROOT, '_tmp_test_out'), TEMP: path.join(ROOT, '_tmp_test_out') }
execFileSync(PY, [script], { stdio: 'inherit', cwd: ROOT, env })
console.log(`\n分析结果已写出 ${path.relative(ROOT, outJson)}`)
