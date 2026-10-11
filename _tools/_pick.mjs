// 从 43 套时装里挑出"腿露在外面、走路帧看得出交替"的那几套
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
const PY = 'C:\\Users\\wangbujue\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe'
const py = String.raw`
import os, sys, json
import numpy as np
from PIL import Image
ROOT = sys.argv[1]
idx = json.load(open(os.path.join(ROOT, 'assets', 'anim', 'index.json'), encoding='utf-8'))
rows = []
for k, a in idx['actions'].items():
    if '时装序列' not in k or '正面二' not in k:
        continue
    d = os.path.join(ROOT, 'assets', 'anim', a['dir'])
    files = sorted(os.listdir(d))
    if len(files) < 8: continue
    # 用"最底 20% 区域的像素差异"衡量腿部动作幅度
    def lowmask(f):
        im = Image.open(os.path.join(d, f)).convert('RGBA')
        a2 = np.asarray(im)[:, :, 3] > 40
        ys, xs = np.where(a2)
        y1 = int(ys.max()); ch = y1 - int(ys.min()) + 1
        # 统一取"最底固定行数"，避免不同帧高度差一像素导致形状对不上
        return a2[max(0, y1 - 60):y1 + 1, :]
    ms = [lowmask(files[i]) for i in range(0, len(files), max(1, len(files) // 6))][:6]
    diffs = [np.logical_xor(ms[i], ms[0]).mean() for i in range(1, len(ms))]
    rows.append((sum(diffs) / len(diffs), a['dir'].split('/')[1], a['dir'], len(files)))
rows.sort(reverse=True)
print('腿部动作幅度最大的 8 套：')
for v, name, d, n in rows[:8]:
    print('  %-10s %.4f  (%d 帧)  %s' % (name, v, n, d))
`
const f = path.join(process.cwd(), '_tools', '_pick.py')
fs.writeFileSync(f, py, 'utf8')
execFileSync(PY, [f, process.cwd()], { stdio: 'inherit' })
