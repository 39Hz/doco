
import os, sys, json
import numpy as np
from PIL import Image
ROOT = sys.argv[1]
ART = os.path.join(ROOT, 'assets', 'forms', 'art')
raw = open(os.path.join(ROOT, 'assets', 'forms.js'), encoding='utf-8').read()
data = json.loads(raw[raw.index('{'):raw.rindex('}') + 1])
refs = [os.path.basename(it['art']) for g in ('forms', 'artOnly') for it in (data.get(g) or []) if it.get('art')]

def nruns(row, x0, x1):
    n, s = 0, None
    for x in range(x0, x1 + 1):
        if row[x] and s is None: n += 1; s = x
        elif not row[x] and s is not None: s = None
    return n

print('%-16s %6s %7s %7s  %s' % ('形态', '内容高', '旧髋线', '新髋线', '说明'))
splits = 0
for fn in sorted(refs):
    p = os.path.join(ART, fn)
    if not os.path.exists(p): continue
    im = Image.open(p).convert('RGBA')
    a = np.asarray(im)[:, :, 3] > 40
    ys, xs = np.where(a)
    y0, y1 = int(ys.min()), int(ys.max()); x0, x1 = int(xs.min()), int(xs.max())
    ch = y1 - y0 + 1
    # 旧判据
    def runs_of(row):
        out, s = [], None
        for x in range(x0, x1 + 1):
            if row[x] and s is None: s = x
            elif not row[x] and s is not None: out.append((s, x - 1)); s = None
        if s is not None: out.append((s, x1))
        return out
    widths = [(y, len(runs_of(a[y])), sum(b - aa + 1 for aa, b in runs_of(a[y]))) for y in range(y0, y1 + 1)]
    maxw = max(w for _, _, w in widths) or 1
    old = y0
    for y, nr, w in reversed(widths):
        if nr <= 2 and w <= maxw * 0.62: old = y
        else: break
    # 新判据：从 40% 处往下找第一次出现"两段"的行
    start = int(y1 - ch * 0.40)
    new = None
    for y in range(start, y1 + 1):
        if nruns(a[y], x0, x1) >= 2:
            new = y; break
    if new is None:
        new = int(y1 - ch * 0.30)
    else:
        splits += 1
    print('%-16s %6d %6.0f%% %6.0f%%  %s' % (fn[:-4], ch, (y1 - old + 1) / ch * 100, (y1 - new + 1) / ch * 100,
          '找到胯部分界' if new != int(y1 - ch * 0.30) else '没找到（用 30% 兜底）'))
print('\n能自动找到胯部分界的：%d / %d' % (splits, len(refs)))
