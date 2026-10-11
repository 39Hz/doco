
import os, sys, json
from PIL import Image, ImageDraw
ROOT = sys.argv[1]
src = os.path.join(ROOT, 'docs', 'shots')
pins = json.load(open(os.path.join(src, '05w-walk.json'), encoding='utf-8'))
CW, CH = 230, 240
crops = []
for pin in sorted(pins, key=lambda p: p['phase']):
    f = os.path.join(src, '05w-walk-%d.png' % pin['phase'])
    im = Image.open(f).convert('RGB')
    # 主角脚底在 (x, y) 附近；往上留 190、往下留 50
    box = (max(0, pin['x'] - CW // 2), max(0, pin['y'] - 190),
           min(960, pin['x'] + CW // 2), min(560, pin['y'] + 50))
    crops.append((pin, im.crop(box)))
gap = 6
h = max(c.height for _, c in crops)
out = Image.new('RGB', (CW * len(crops) + gap * (len(crops) - 1), h + 26), (14, 18, 28))
d = ImageDraw.Draw(out)
for i, (pin, c) in enumerate(crops):
    out.paste(c, (i * (CW + gap), 26))
    d.text((i * (CW + gap) + 6, 7), 'phase %d/4  相位 %.2f' % (pin['phase'], pin['walkPhase']), fill=(240, 220, 120))
SCALE = 2
out = out.resize((out.width * SCALE, out.height * SCALE), Image.LANCZOS)
q = os.path.join(src, '05w-walk-strip.png')
out.save(q)
print(q, out.size, '主角坐标', [p['x'] for p in pins])
