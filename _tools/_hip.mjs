// 临时：量 46 只形态各自算出来的髋线位置（找"髋线跑到上半身"的坏样本）
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
const PY = 'C:\\Users\\wangbujue\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe'
const py = String.raw`
import os, sys, json
import numpy as np
from PIL import Image
ROOT = sys.argv[1]
ART = os.path.join(ROOT, 'assets', 'forms', 'art')
raw = open(os.path.join(ROOT, 'assets', 'forms.js'), encoding='utf-8').read()
data = json.loads(raw[raw.index('{'):raw.rindex('}') + 1])
refs = []
for g in ('forms', 'artOnly'):
    for it in (data.get(g) or []):
        if it.get('art'): refs.append(os.path.basename(it['art']))

def runs_of(row, x0, x1):
    out, s = [], None
    for x in range(x0, x1 + 1):
        if row[x] and s is None: s = x
        elif not row[x] and s is not None: out.append((s, x - 1)); s = None
    if s is not None: out.append((s, x1))
    return out

print('%-16s %6s %8s %8s  %s' % ('形态', '内容高', '髋线y', '腿占比', '判定'))
bad = []
for fn in sorted(refs):
    p = os.path.join(ART, fn)
    if not os.path.exists(p): continue
    im = Image.open(p).convert('RGBA')
    a = np.asarray(im)[:, :, 3] > 40
    ys, xs = np.where(a)
    if len(ys) == 0: continue
    y0, y1 = int(ys.min()), int(ys.max()); x0, x1 = int(xs.min()), int(xs.max())
    ch = y1 - y0 + 1
    widths = []
    for y in range(y0, y1 + 1):
        rr = runs_of(a[y], x0, x1)
        widths.append((y, len(rr), sum(b - aa + 1 for aa, b in rr)))
    maxw = max(w for _, _, w in widths) or 1
    # 复刻生成器的逻辑
    hip = y0
    for y, nr, w in reversed(widths):
        if nr <= 2 and w <= maxw * 0.62: hip = y
        else: break
    frac = (y1 - hip + 1) / ch
    tag = ''
    if frac > 0.5: tag = '★ 髋线跑到上半身（头会被当腿转）'; bad.append(fn)
    print('%-16s %6d %8d %7.0f%%  %s' % (fn[:-4], ch, hip, frac * 100, tag))
print('\n坏样本 %d 只：%s' % (len(bad), '、'.join(b[:-4] for b in bad)))
`
const f = path.join(process.cwd(), '_tools', '_hip.py')
fs.writeFileSync(f, py, 'utf8')
execFileSync(PY, [f, process.cwd()], { stdio: 'inherit' })
