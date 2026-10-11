
import os, sys, json, shutil
from PIL import Image, ImageDraw
ROOT = sys.argv[1]
idx = json.load(open(os.path.join(ROOT, 'assets', 'anim', 'index.json'), encoding='utf-8'))
OUT = os.path.join(ROOT, 'docs', 'npc-动作图')
os.makedirs(OUT, exist_ok=True)

sets = {}
for k, a in idx['actions'].items():
    if not a['dir'].startswith('时装序列/'):
        continue
    sets.setdefault(a['dir'].split('/')[1], []).append(a)

CELL = 120          # 联系表每格宽
COLS = 10
summary = []
for name in sorted(sets):
    acts = sorted(sets[name], key=lambda x: x['action'])
    rows = []
    for a in acts:
        src = os.path.join(ROOT, 'assets', 'anim', a['dir'])
        files = sorted(f for f in os.listdir(src) if f.endswith('.png'))
        # 1) 原始帧整份导出（用户可以直接拿去用）
        dst = os.path.join(OUT, name, a['action'])
        os.makedirs(dst, exist_ok=True)
        for i, f in enumerate(files):
            shutil.copyfile(os.path.join(src, f), os.path.join(dst, '%04d.png' % i))
        # 2) 联系表：全部帧铺开，标帧号
        ims = []
        for f in files:
            im = Image.open(os.path.join(src, f)).convert('RGBA')
            w = max(1, int(im.width * CELL / im.height))
            ims.append((f, im.resize((w, CELL), Image.LANCZOS)))
        cw = max(i.width for _, i in ims) + 4
        rows_n = (len(ims) + COLS - 1) // COLS
        sheet = Image.new('RGBA', (cw * COLS, (CELL + 16) * rows_n), (18, 22, 30, 255))
        d = ImageDraw.Draw(sheet)
        for i, (f, im) in enumerate(ims):
            x = (i % COLS) * cw + 2
            y = (i // COLS) * (CELL + 16) + 14
            sheet.alpha_composite(im, (x, y))
            d.text((x, y - 12), f[:-4], fill=(200, 210, 230))
        sp = os.path.join(OUT, name, a['action'] + '.png')
        sheet.convert('RGB').save(sp)
        rows.append((a['action'], len(files), a['w'], a['h'], sp, ims))
        print('  %-14s %-10s %2d 帧  %dx%d' % (name, a['action'], len(files), a['w'], a['h']))
    # 3) 总览：每个动作一行（每行取前 10 帧）
    ov_w = cw * COLS
    ov_h = sum(CELL + 16 for _ in rows)
    ov = Image.new('RGB', (ov_w, ov_h + 10), (18, 22, 30))
    d = ImageDraw.Draw(ov)
    y = 0
    for act, n, w, h, sp, ims in rows:
        for i, (f, im) in enumerate(ims[:COLS]):
            ov.paste(im, (i * cw + 2, y + 14), im)
        d.text((4, y + 2), '%s（共 %d 帧，这里显示前 %d）' % (act, n, min(n, COLS)), fill=(240, 220, 120))
        y += CELL + 16
    ov.save(os.path.join(OUT, '%s-总览.png' % name))
    summary.append((name, len(acts), sum(n for _, n, _, _, _, _ in rows)))

print('\n共 %d 套造型，合计 %d 帧' % (len(summary), sum(s[2] for s in summary)))
for n, acts, fr in summary:
    print('  %-14s %d 个动作  %d 帧' % (n, acts, fr))
print('输出目录:', OUT)
