// 预处理：只在**这一张**源图上把脚底那圈纯黑投影去掉，产出到 _cleaned/，再让 MAP 指向它。
// 【为什么单独做，不改 build-form-art.mjs】
//   共用流程的第二趟泛洪找的是"中性灰 RGB(178,178,178)"（官方立绘常见的投影色），
//   而这张的投影是**纯黑**，且角色的**描边也是纯黑** → 按颜色分不开。
//   但两者**厚度**差得很远：投影是一大块（几十像素厚），描边只有 2~4px。
//   所以用**形态学腐蚀**把薄描边去掉、只留厚块 —— 这属于"这一张源图的问题"，
//   不该改共用流程去冒险（另外 46 张立绘都从那套流程过）。
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
const PY = 'C:\\Users\\wangbujue\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe'
const py = String.raw`
import sys, os
from PIL import Image, ImageFilter
import numpy as np

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
a = np.asarray(im).copy()
h, w, _ = a.shape
rgb = a[:, :, :3].astype(np.int32)
lum = rgb.max(axis=2)

# ① 近黑掩膜
mask = (lum < 40).astype(np.uint8) * 255
m = Image.fromarray(mask)

# ② 腐蚀：5×5 全黑才留 → 2~4px 的描边整条消失，几十像素厚的投影留下
er = m.filter(ImageFilter.MinFilter(5))
E = np.asarray(er) > 128
print('近黑像素 %d → 腐蚀后 %d（%.1f%%）' % (mask.sum() // 255, E.sum(), E.sum() / max(1, (mask.sum() // 255)) * 100))

# ③ 连通分量（自己写 BFS，避免依赖 scipy）：只保留**碰到最底几行**的那一块
seen = np.zeros_like(E, dtype=bool)
best = None
from collections import deque
for y in range(h):
    for x in range(w):
        if not E[y, x] or seen[y, x]:
            continue
        q = deque([(y, x)]); seen[y, x] = True
        comp = []
        touch_bottom = False
        while q:
            cy, cx = q.popleft()
            comp.append((cy, cx))
            if cy >= h - 4:
                touch_bottom = True
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = cy + dy, cx + dx
                if 0 <= ny < h and 0 <= nx < w and E[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        if touch_bottom and (best is None or len(comp) > len(best)):
            best = comp
if best is None:
    print('没找到"贴底的厚黑块" → 原样输出，不改')
    im.save(dst)
    sys.exit(0)
print('贴底厚黑块：%d 像素（占全图 %.1f%%）' % (len(best), len(best) / (w * h) * 100))

# ④ 把它膨胀回来（盖满整个投影），再把这些像素涂成全透明
sel = np.zeros((h, w), dtype=np.uint8)
for cy, cx in best:
    sel[cy, cx] = 1
dil = np.asarray(Image.fromarray(sel * 255).filter(ImageFilter.MaxFilter(7))) > 128
a[dil, 3] = 0
print('清掉 %d 像素（占全图 %.1f%%）' % (dil.sum(), dil.sum() / (w * h) * 100))

os.makedirs(os.path.dirname(dst), exist_ok=True)
Image.fromarray(a).save(dst)
print('已写出', dst)
`
fs.writeFileSync('_tools/_deshadow.py', py, 'utf8')
execFileSync(PY, ['_tools/_deshadow.py', process.argv[2], process.argv[3]], { stdio: 'inherit' })
