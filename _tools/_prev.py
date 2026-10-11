
import os, sys
from PIL import Image, ImageDraw
ROOT = sys.argv[1]
name = sys.argv[2] if len(sys.argv) > 2 else '龙多比'
WALK = os.path.join(ROOT, 'assets', 'forms', 'walk')
files = sorted([f for f in os.listdir(WALK) if f.startswith(name + '_') and f.endswith('.png')],
               key=lambda s: int(s.rsplit('_', 1)[1].split('.')[0]))
if not files:
    print('没有走路帧:', name); sys.exit(1)
DISP_H = 132                      # 游戏里就是画这么高
ims = []
for f in files:
    im = Image.open(os.path.join(WALK, f)).convert('RGBA')
    w = max(1, int(im.width * DISP_H / im.height))
    ims.append(im.resize((w, DISP_H), Image.LANCZOS))
gap = 14
SCALE = 3                          # 放大 3 倍只是为了在屏幕上看得清，实际尺寸就是上面那个
out = Image.new('RGBA', ((sum(i.width for i in ims) + gap * (len(ims) - 1)) * SCALE, (DISP_H + 26) * SCALE), (16, 20, 30, 255))
x = 0
for i, im in enumerate(ims):
    big = im.resize((im.width * SCALE, im.height * SCALE), Image.NEAREST)
    out.alpha_composite(big, (x * SCALE, 26 * SCALE))
    x += im.width + gap
d = ImageDraw.Draw(out)
for i in range(len(ims)):
    d.text((i * (ims[0].width + gap) * SCALE + 4, 4), '第 %d 帧' % (i + 1), fill=(240, 220, 120))
p = os.path.join(ROOT, 'docs', 'shots', 'walk-frames-%s.png' % name)
out.convert('RGB').save(p)
print(p, out.size, '（每帧实际显示高度 %dpx，这里放大 %d 倍看细节）' % (DISP_H, SCALE))
