
import os, sys, json
from PIL import Image, ImageDraw
ROOT = sys.argv[1]
form = sys.argv[2] if len(sys.argv) > 2 else '克罗'
idx = json.load(open(os.path.join(ROOT, 'assets', 'anim', 'index.json'), encoding='utf-8'))
DISP_H = 132
SCALE = 3
PICK = 6

def row_of(paths):
    ims = []
    for f in paths:
        im = Image.open(f).convert('RGBA')
        w = max(1, int(im.width * DISP_H / im.height))
        ims.append(im.resize((w, DISP_H), Image.LANCZOS))
    return ims

# 上排：合成的走路帧
WALK = os.path.join(ROOT, 'assets', 'forms', 'walk')
wf = sorted([f for f in os.listdir(WALK) if f.startswith(form + '_') and f.endswith('.png')],
            key=lambda s: int(s.rsplit('_', 1)[1].split('.')[0]))
top = row_of([os.path.join(WALK, f) for f in wf])

# 下排：归档里腿部动作最大的那套时装（喵喵女 正面二）
key = [k for k, v in idx['actions'].items() if '喵喵女' in k and '正面二' in k][0]
d = os.path.join(ROOT, 'assets', 'anim', idx['actions'][key]['dir'])
files = sorted(os.listdir(d))
step = max(1, len(files) // PICK)
bot = row_of([os.path.join(d, f) for f in files[::step][:PICK]])

cw = max(sum(i.width for i in r) + 14 * (len(r) - 1) for r in (top, bot))
out = Image.new('RGBA', (cw * SCALE, (DISP_H * 2 + 30 + 40) * SCALE), (16, 20, 30, 255))
d2 = ImageDraw.Draw(out)
d2.text((6, 6), 'A  多比（用官方立绘合成的步态，6 帧）', fill=(240, 220, 120))
x = 0
for im in top:
    out.alpha_composite(im.resize((im.width * SCALE, im.height * SCALE), Image.NEAREST), (x * SCALE, 30 * SCALE))
    x += im.width + 14
y0 = DISP_H + 30 + 25
d2.text((6, (DISP_H + 30 + 8) * SCALE // SCALE), '', fill=(0, 0, 0))
d2.text((6, y0 * SCALE - 22 * SCALE + 14 * SCALE), 'B  归档里的真·走路动画（时装序列「喵喵女」，17 帧里取 6 帧）', fill=(140, 230, 150))
x = 0
for im in bot:
    out.alpha_composite(im.resize((im.width * SCALE, im.height * SCALE), Image.NEAREST), (x * SCALE, (y0 + 22) * SCALE))
    x += im.width + 14
p = os.path.join(ROOT, 'docs', 'shots', 'walk-compare.png')
out.convert('RGB').save(p)
print(p, out.size)
