
import os, sys, json
from PIL import Image, ImageDraw
ROOT = sys.argv[1]
idx = json.load(open(os.path.join(ROOT, 'assets', 'anim', 'index.json'), encoding='utf-8'))
# 找一套时装的 正面二（走路用）序列
cand = [k for k, v in idx['actions'].items() if '时装序列' in k and '正面二' in k]
print('候选时装走路序列:', len(cand))
key = cand[0]
a = idx['actions'][key]
d = os.path.join(ROOT, 'assets', 'anim', a['dir'])
files = sorted(os.listdir(d))
print('用', key, '共', len(files), '帧')
DISP_H = 132
PICK = 6
step = max(1, len(files) // PICK)
sel = [files[i] for i in range(0, len(files), step)][:PICK]
ims = []
for f in sel:
    im = Image.open(os.path.join(d, f)).convert('RGBA')
    w = max(1, int(im.width * DISP_H / im.height))
    ims.append(im.resize((w, DISP_H), Image.LANCZOS))
gap = 14; SCALE = 3
W = (sum(i.width for i in ims) + gap * (len(ims) - 1)) * SCALE
out = Image.new('RGBA', (W, (DISP_H + 26) * SCALE), (16, 20, 30, 255))
x = 0
for i, im in enumerate(ims):
    out.alpha_composite(im.resize((im.width * SCALE, im.height * SCALE), Image.NEAREST), (x * SCALE, 26 * SCALE))
    x += im.width + gap
d2 = ImageDraw.Draw(out)
for i in range(len(ims)):
    d2.text((i * (ims[0].width + gap) * SCALE + 4, 4), '第 %d 帧' % (i + 1), fill=(240, 220, 120))
p = os.path.join(ROOT, 'docs', 'shots', 'walk-real-costume.png')
out.convert('RGB').save(p)
print(p, out.size)
